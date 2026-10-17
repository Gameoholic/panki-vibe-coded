import { useRef, useState, type HTMLAttributes, type PointerEvent } from "react";
import type { Stretch } from "@panki/contracts";
import { stamp } from "../capture/words";
import type { ClipEnd, MoveBy } from "./Trim";

/** The open clip as it's marked on the bar: its two ends, and what pulling one does. */
export type ClipMark = {
  start: number;
  end: number;
  onMove: (which: ClipEnd, to: number, by: MoveBy) => void;
  /** An end has been let go where it is. */
  onSettle: (which: ClipEnd) => void;
};

type Props = {
  /** The player's video: how long it is says how much of the bar a second is. */
  video: HTMLVideoElement;
  /** The stretches of the video the transcript covers, in milliseconds as the transcript keeps them: each a line along the bar's top edge. */
  covered: readonly Stretch[];
  /** What a run has heard that isn't back from the engine yet, in milliseconds: the same line, faint; null with no run. */
  working: Stretch | null;
  /** The open clip, with an end to pull at each side; null while no drawer is open. */
  clip: ClipMark | null;
};

const ENDS: Record<ClipEnd, string> = { start: "Where the clip starts", end: "Where the clip ends" };

/**
 * Panki on the player's own seek bar: how far the transcript reaches, as a thin line in the transcript's colour along
 * the bar's top edge (the bar's own colours, how much has played and how much has loaded, stay seen under it), with
 * what's being transcribed this moment faint at its end; and the clip, the stretch it covers in Panki's colour with
 * an end to pull at each side. Both are drawn in a place of
 * Panki's that is laid over the whole bar, so a share of this is the same share of the video. The bar is the whole
 * video in a few hundred pixels, so an end pulled here goes roughly where it's wanted (a pixel is a second or more);
 * the drawer's own bar is for putting it exactly. An end is always put exactly where the pointer is here: there's no
 * telling words apart at this size.
 *
 * Only the two ends take a press. Everywhere else on the bar a press goes through to the player, which seeks as ever.
 */
export function SeekMark({ video, covered, working, clip }: Props) {
  const whole = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<ClipEnd | null>(null);
  const length = video.duration;
  // A video that doesn't say how long it is (a live one) has no bar anything could be marked on.
  if (!Number.isFinite(length) || length <= 0) return null;

  const share = (time: number) => Math.max(0, Math.min(100, (time / length) * 100));
  /** Where a stretch of the video, in seconds, lies along the bar: its left edge and its width as shares of the whole. */
  function across(start: number, end: number) {
    const from = share(start);
    return { left: `${from}%`, width: `${Math.max(0, share(end) - from)}%` };
  }
  function timeAt(x: number): number | null {
    const box = whole.current?.getBoundingClientRect();
    return box && box.width > 0 ? Math.max(0, Math.min(1, (x - box.left) / box.width)) * length : null;
  }
  function grip(mark: ClipMark, which: ClipEnd): HTMLAttributes<HTMLSpanElement> {
    const at = mark[which];
    return {
      className: `seek-end is-${which}`,
      role: "slider",
      "aria-label": ENDS[which],
      "aria-orientation": "horizontal",
      "aria-valuemin": 0,
      "aria-valuemax": Math.round(length * 100) / 100,
      "aria-valuenow": Math.round(at * 100) / 100,
      "aria-valuetext": stamp(at),
      onPointerDown(e: PointerEvent<HTMLSpanElement>) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setHeld(which);
      },
      onPointerMove(e: PointerEvent<HTMLSpanElement>) {
        if (held !== which) return;
        const to = timeAt(e.clientX);
        if (to !== null) mark.onMove(which, to, "exact");
      },
      onLostPointerCapture() {
        if (held !== which) return;
        setHeld(null);
        mark.onSettle(which);
      },
    };
  }

  return (
    <div ref={whole} className="seek">
      {covered.map((stretch) => (
        <div key={stretch.startMs} className="seek-covered" style={across(stretch.startMs / 1000, stretch.endMs / 1000)} />
      ))}
      {working ? <div className="seek-working" style={across(working.startMs / 1000, working.endMs / 1000)} /> : null}
      {clip ? (
        <div className="seek-clip" style={across(clip.start, clip.end)}>
          <span {...grip(clip, "start")} />
          <span {...grip(clip, "end")} />
        </div>
      ) : null}
    </div>
  );
}
