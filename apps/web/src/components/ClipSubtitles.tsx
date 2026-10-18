import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SUBTITLE_REF_HEIGHT, cueAt, subtitleVars, type MediaCues, type SubtitleStyle } from "@panki/contracts";
import { langOf } from "../words";

/** Where a clip is, in seconds from its start, as its picture shows it; null while its picture is of no moment of it. */
export type ClipTime = () => number | null;

type Props = {
  /** What's said in the clip, as it was heard on the video when it was recorded (`Card.cues`). */
  cues: MediaCues;
  /** How they look: the app's own subtitle style (`Settings.subtitleStyle`). */
  style: SubtitleStyle;
  /** Where the clip is, for one that isn't a file yet (the extension's clip before it's recorded); left out, it's the box's own `<video>`. */
  time?: ClipTime;
  /** Words lit where they first stand in the line showing (the part's "Highlight": the card's word); empty for none. */
  lit?: string;
};

type Span = { from: number; to: number };

/** A stretch of the line, the piece being said in it underlined. */
function said(text: string, stretch: Span, now: Span): ReactNode {
  const from = Math.max(stretch.from, Math.min(now.from, stretch.to));
  const to = Math.max(from, Math.min(now.to, stretch.to));
  if (to <= from) return text.slice(stretch.from, stretch.to);
  return (
    <>
      {text.slice(stretch.from, from)}
      <span className="sub-now">{text.slice(from, to)}</span>
      {text.slice(to, stretch.to)}
    </>
  );
}

/** The line showing: the words lit (where they first stand) in one box, and the piece being said underlined wherever it falls. */
function lineOf(text: string, now: Span, lit: string): ReactNode {
  const at = lit ? text.indexOf(lit) : -1;
  if (at < 0) return said(text, { from: 0, to: text.length }, now);
  const end = at + lit.length;
  return (
    <>
      {said(text, { from: 0, to: at }, now)}
      <mark className="sub-mark">{said(text, { from: at, to: end }, now)}</mark>
      {said(text, { from: end, to: text.length }, now)}
    </>
  );
}

/** What's showing: the line being said, and the piece of it being said; none between lines. */
type Showing = { text: string; from: number; to: number } | null;

/**
 * A clip's subtitles on a card, following it as it plays: the line being said at that moment, the piece of it being
 * said underlined, nothing between lines (the owner, 2026-10-18: "the timestamps and words sourced from the video", as
 * the extension draws them over YouTube; a field's words laid over the whole clip came first and stood there from the
 * first frame to the last). Put in the box that holds the clip's picture (`MediaView`'s `over`), it reads the picture's
 * own `<video>` there; its words are sized with the box's height, so they're the same share of the clip on the card and
 * on the full screen. The band is the app's `.sub-band`, the one the extension draws too.
 */
export function ClipSubtitles({ cues, style, time, lit = "" }: Props) {
  const ground = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [showing, setShowing] = useState<Showing>(null);
  // Read with each frame rather than followed: a clip being made hands over new ones as its ends are pulled.
  const said = useRef(cues);
  said.current = cues;
  const at = useRef(time);
  at.current = time;

  useEffect(() => {
    const box = ground.current?.parentElement;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      if (box.clientHeight > 0) setScale(box.clientHeight / SUBTITLE_REF_HEIGHT);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Looked at with each frame drawn, and told only when what shows changes, so nothing is drawn again within a piece.
  useEffect(() => {
    const video = ground.current?.parentElement?.querySelector("video") ?? null;
    if (!video && !at.current) return;
    let frame = 0;
    const look = () => {
      frame = requestAnimationFrame(look);
      const seconds = at.current ? at.current() : (video?.currentTime ?? null);
      const now = seconds === null ? null : cueAt(said.current, seconds * 1000);
      const next: Showing = now ? { text: now.cue.text, from: now.piece?.from ?? 0, to: now.piece?.to ?? 0 } : null;
      setShowing((was) => (was?.text === next?.text && was?.from === next?.from && was?.to === next?.to ? was : next));
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, []);

  const vars = { ...subtitleVars(style), "--sub-scale": String(scale) } as CSSProperties;
  return (
    <div ref={ground} className="sub-ground" style={vars}>
      {showing ? (
        <div className="sub-band" lang={langOf(showing.text)}>
          {lineOf(showing.text, showing, lit)}
        </div>
      ) : null}
    </div>
  );
}
