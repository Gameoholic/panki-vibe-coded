/** @panki A clip's bar with its two ends to pull (`Trim`). */
import { useEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type PointerEvent } from "react";
import { stamp } from "../capture/words";

/** One of a clip's two ends. */
export type ClipEnd = "start" | "end";
/** How an end is moved: to the nearest of its cut's stops (a sentence's edge on the clip's bar, a word's on the word's), or exactly where it's put. */
export type MoveBy = "snap" | "exact";
/** A mark on the bar where an end stops: where a stretch begins, or where it ends. */
export type Tick = { at: number; kind: "start" | "end" };
/** A stretch of the video, in its seconds. */
export type Stretch = { from: number; to: number };

/** How much of the video shows either side of the clip to begin with, in seconds. */
const ROOM = 5;
/** The least that's kept showing either side of the clip, so an end always has somewhere to go. */
const ROOM_MIN = 0.5;
/** How close an end of the clip comes to an edge of the bar, as it's moved, before that edge makes room by itself; and how much room it then makes. */
const NEAR = 1;
const MAKE_ROOM = 2.5;
/** How many times faster than the pointer an edge of the bar takes in the video: at the side of a window there's little room to pull into. */
const PULL = 3;
/** What an arrow key moves an end of the clip by, and an edge of the bar by, in seconds. */
const NUDGE = 0.1;
const EDGE_STEP = 1;

type Side = "from" | "to";

type Props = {
  /** The player's video, for where it stands right now. */
  video: HTMLVideoElement;
  start: number;
  /** Null while the clip's last words are still being said: it runs on to wherever that ends. */
  end: number | null;
  /** The whole of the video: as far as the bar can ever show. */
  limit: Stretch;
  /** Where an end stops as it's pulled (Shift held, it doesn't): the ticks, a start's darker than an end's. */
  ticks: readonly Tick[];
  disabled: boolean;
  /** Changes when the clip went somewhere else by itself (another sentence was taken): the bar goes there with it. */
  anchor: number;
  /**
   * When given, the bar is exactly this stretch, edge to edge, and has no edges of its own to pull: for a cut made out
   * of another (a word out of its sentence's clip), whose bar is the other cut from its start to its end.
   */
  within?: Stretch | null;
  onMove: (which: ClipEnd, to: number, by: MoveBy) => void;
  /** An end has been let go where it is. */
  onSettle: (which: ClipEnd) => void;
  /** The clip pressed between its ends: it's heard from that moment. */
  onHear: (at: number) => void;
  /**
   * Where Accept on a waiting Sentence proposal would put the clip: what it adds drawn striped green beside the clip,
   * what it cuts striped red over it (the Touch up diff's colours). The bar takes it in, as it takes in an end typed
   * past its edge. Null with nothing waiting.
   */
  proposed?: { start: number; end: number } | null;
  /** The stretch of the video Panki AI heard (the subtitles its messages were sent); null before a message is sent, or off a video. */
  heard?: Stretch | null;
};

/** What the bar shows to begin with: the clip, with room either side to pull an end into. */
function around(start: number, last: number, limit: Stretch): Stretch {
  return { from: Math.min(start, Math.max(limit.from, start - ROOM)), to: Math.max(last, Math.min(limit.to, last + ROOM)) };
}

const ENDS: Record<ClipEnd, string> = { start: "Where the clip starts", end: "Where the clip ends" };
const EDGES: Record<Side, string> = { from: "How far before the clip the bar shows", to: "How far after the clip the bar shows" };
const round = (seconds: number) => Math.round(seconds * 100) / 100;

/**
 * A clip as a bar of time with an end to pull at each side. The bar shows the clip with a few seconds either side and
 * **stays as it is**: pulling an end never changes what the bar shows, so the clip's surroundings never resize under
 * a drag. For more room, or less, the bar's own two edges are pulled: outwards takes in more of the video on that
 * side, inwards less; and an end moved to within `NEAR` of an edge pushes that edge out by itself, so pulling an end on
 * keeps taking in more. An edge pulled in close is left there until an end is moved up to it. An end goes exactly
 * where the pointer is, or stops at the edges of words while Alt is held; the arrow keys on it move it a tenth of a
 * second. The thin line is where the video stands; a press on the clip between its ends plays it from there.
 */
export function Trim({ video, start, end, limit, ticks, disabled, anchor, within = null, onMove, onSettle, onHear, proposed = null, heard = null }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<ClipEnd | null>(null);
  /** An edge of the bar being pulled: where the pointer took hold, and what the bar showed and how much a pixel was worth just then. */
  const [pulled, setPulled] = useState<{ side: Side; x: number; at: number; perPixel: number } | null>(null);
  const last = end ?? start;
  /** What a bar that's free to show what it likes shows: kept here, and pulled about by its edges. */
  const [free, setView] = useState(() => around(start, last, limit));
  const [anchored, setAnchored] = useState(anchor);
  /** Where the ends stood when last looked at: an edge makes room only for an end that's moved. */
  const [ends, setEnds] = useState({ start, last });
  if (anchored !== anchor) {
    setAnchored(anchor);
    setEnds({ start, last });
    setView(around(start, last, limit));
  } else if (!within) {
    let { from, to } = free;
    // The clip never leaves the bar: an end put outside it (a time typed in, a sentence that went on being said)
    // takes that edge of the bar with it, and the other edge stays.
    if (start < from) from = around(start, last, limit).from;
    else if (start !== ends.start && start - from < NEAR) from = Math.max(limit.from, Math.min(from, start - MAKE_ROOM));
    if (last > to) to = around(start, last, limit).to;
    else if (last !== ends.last && to - last < NEAR) to = Math.min(limit.to, Math.max(to, last + MAKE_ROOM));
    // Where Accept would put it is taken in too, so what it adds is there to see.
    if (proposed && proposed.start < from) from = Math.max(limit.from, proposed.start - ROOM_MIN);
    if (proposed && proposed.end > to) to = Math.min(limit.to, proposed.end + ROOM_MIN);
    if (start !== ends.start || last !== ends.last) setEnds({ start, last });
    if (from !== free.from || to !== free.to) setView({ from, to });
  }
  /** What the bar shows: the stretch it's been told to be, or else its own. */
  const view = within ?? free;

  const span = Math.max(0.1, view.to - view.from);
  const share = (time: number) => Math.max(0, Math.min(100, ((time - view.from) / span) * 100));
  function timeAt(x: number): number | null {
    const box = track.current?.getBoundingClientRect();
    return box && box.width > 0 ? view.from + Math.max(0, Math.min(1, (x - box.left) / box.width)) * span : null;
  }
  /** What makes a mark on the bar an end of the clip: pulled with the pointer, moved with the arrow keys. */
  function grip(which: ClipEnd, at: number): HTMLAttributes<HTMLSpanElement> {
    return {
      className: `trim-end is-${which}`,
      role: "slider",
      tabIndex: disabled ? -1 : 0,
      "aria-label": ENDS[which],
      "aria-orientation": "horizontal",
      "aria-valuemin": round((within ?? limit).from),
      "aria-valuemax": round((within ?? limit).to),
      "aria-valuenow": round(at),
      "aria-valuetext": stamp(at),
      "aria-disabled": disabled,
      onPointerDown(e: PointerEvent<HTMLSpanElement>) {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        // It keeps following a pointer that strays off it, and off the bar.
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus({ preventScroll: true });
        setHeld(which);
      },
      onPointerMove(e: PointerEvent<HTMLSpanElement>) {
        if (held !== which) return;
        const to = timeAt(e.clientX);
        if (to !== null) onMove(which, to, e.shiftKey ? "exact" : "snap");
      },
      onLostPointerCapture() {
        if (held !== which) return;
        setHeld(null);
        onSettle(which);
      },
      onKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
        if (disabled || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        e.preventDefault();
        onMove(which, at + (e.key === "ArrowLeft" ? -NUDGE : NUDGE), "exact");
        onSettle(which);
      },
    };
  }
  /** An edge of the bar goes to a moment of the video: never past the video's own ends, never closer to the clip than a little room. */
  function putEdge(side: Side, to: number) {
    setView((now) => (side === "from" ? { from: Math.max(limit.from, Math.min(start - ROOM_MIN, to)), to: now.to } : { from: now.from, to: Math.min(limit.to, Math.max(last + ROOM_MIN, to)) }));
  }
  /** What makes a mark at an end of the bar an edge to pull: outwards for more of the video on that side, inwards for less. */
  function edge(side: Side): HTMLAttributes<HTMLSpanElement> {
    return {
      className: `trim-edge is-${side}`,
      role: "slider",
      tabIndex: 0,
      "aria-label": EDGES[side],
      "aria-orientation": "horizontal",
      "aria-valuemin": round(limit.from),
      "aria-valuemax": round(limit.to),
      "aria-valuenow": round(view[side]),
      "aria-valuetext": stamp(view[side]),
      onPointerDown(e: PointerEvent<HTMLSpanElement>) {
        const box = track.current?.getBoundingClientRect();
        if (e.button !== 0 || !box || box.width === 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setPulled({ side, x: e.clientX, at: view[side], perPixel: span / box.width });
      },
      onPointerMove(e: PointerEvent<HTMLSpanElement>) {
        // Measured from where it was taken hold of, at what a pixel was worth then: the bar changes under the pointer as it goes.
        if (pulled?.side === side) putEdge(side, pulled.at + (e.clientX - pulled.x) * pulled.perPixel * PULL);
      },
      onLostPointerCapture() {
        if (pulled?.side === side) setPulled(null);
      },
      onKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        putEdge(side, view[side] + (e.key === "ArrowLeft" ? -EDGE_STEP : EDGE_STEP));
      },
    };
  }

  const left = share(start);
  const right = end === null ? 100 : share(end);
  /** A stretch drawn on a bar at its scale; nothing for one that's empty or off it. */
  const stretchOn = (scale: (time: number) => number, className: string, from: number, to: number) => {
    const a = scale(from);
    const b = scale(to);
    return b > a ? <i className={className} style={{ left: `${a}%`, width: `${b - a}%` }} /> : null;
  };
  // Accept's diff, drawn only while the clip has both its ends: what it adds either side, and what it cuts off it.
  const diff = proposed && end !== null ? { ...proposed, held: end } : null;
  const adds: (Stretch | null)[] = diff ? [diff.start < start ? { from: diff.start, to: start } : null, diff.end > diff.held ? { from: diff.held, to: diff.end } : null] : [];
  const cuts: (Stretch | null)[] = diff
    ? [diff.start > start ? { from: start, to: Math.min(diff.start, diff.held) } : null, diff.end < diff.held ? { from: Math.max(diff.end, start), to: diff.held } : null]
    : [];
  return (
    <div className={`trim ${disabled ? "is-off" : ""}`.trim()}>
      <div ref={track} className="trim-track">
        {heard ? stretchOn(share, "trim-heard", Math.max(heard.from, view.from), Math.min(heard.to, view.to)) : null}
        {ticks.map((tick, i) => (tick.at > view.from && tick.at < view.to ? <i key={i} className={`trim-tick is-${tick.kind}`} style={{ left: `${share(tick.at)}%` }} /> : null))}
        {adds.map((add, i) => (add ? <span key={i}>{stretchOn(share, "trim-diff is-in", add.from, add.to)}</span> : null))}
        <div
          className={`trim-clip ${end === null ? "is-open" : ""}`.trim()}
          style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
          onPointerDown={(e) => {
            // An end pressed is that end's; only the clip itself between them is heard from.
            if (disabled || end === null || e.button !== 0 || e.target !== e.currentTarget) return;
            const at = timeAt(e.clientX);
            if (at !== null) onHear(Math.max(start, Math.min(end, at)));
          }}
        >
          <span {...grip("start", start)} />
          {end === null ? null : <span {...grip("end", end)} />}
        </div>
        {cuts.map((cut, i) => (cut ? <span key={i}>{stretchOn(share, "trim-diff is-out", cut.from, cut.to)}</span> : null))}
        <Now video={video} view={view} />
        {/* A bar that is another cut from end to end has nothing either side of it to take in. */}
        {within ? null : (
          <>
            <span {...edge("from")} />
            <span {...edge("to")} />
          </>
        )}
      </div>
      {heard ? <HeardEdges heard={heard} view={view} /> : null}
    </div>
  );
}

/** Whole seconds, as a count beside the bar says them. */
const seconds = (n: number) => `${Math.round(n)} s`;

/**
 * What Panki AI heard, said under the bar's edges: how far past each edge its hearing goes, in words; the bar itself is
 * tinted where it heard. Nothing on a side it doesn't pass.
 */
function HeardEdges({ heard, view }: { heard: Stretch; view: Stretch }) {
  const before = view.from - heard.from;
  const after = heard.to - view.to;
  if (before < 1 && after < 1) return null;
  return (
    <div className="trim-heard-row" title={`Panki AI heard ${stamp(heard.from)} to ${stamp(heard.to)}`}>
      <span>{before >= 1 ? `◂ Panki AI heard ${seconds(before)} more` : ""}</span>
      <span>{after >= 1 ? `${seconds(after)} more ▸` : ""}</span>
    </div>
  );
}


/** Where the video stands, as a line on the bar. It moves many times a second, so it moves itself and nothing else is drawn again for it. */
function Now({ video, view }: { video: HTMLVideoElement; view: Stretch }) {
  const mark = useRef<HTMLElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const el = mark.current;
      if (!el) return;
      const at = (video.currentTime - view.from) / (view.to - view.from);
      // Off the bar it's taken out, not only hidden: a hidden mark still stands where it's put, and a video gone well
      // past a short bar put it thousands of pixels to the right, widening the whole page.
      const off = !(at >= 0 && at <= 1);
      el.style.display = off ? "none" : "";
      if (!off) el.style.left = `${at * 100}%`;
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [video, view.from, view.to]);
  return <i ref={mark} className="trim-now" />;
}
