import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SUBTITLE_REF_HEIGHT, cueAt, subtitleVars, type MediaCues, type SubtitleStyle } from "@panki/contracts";
import { langOf } from "../words";

/** Where a clip is, in seconds from its start, as its picture shows it; null while it's at rest (not playing). */
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

/**
 * Where some words first stand in a line, spaces and line breaks aside: a line of the site's captions can break
 * anywhere, and the word on the card was taken from the line as one run of letters. Null when they aren't there.
 */
function whereIn(text: string, words: string): Span | null {
  const want = words.replace(/\s+/g, "");
  if (want === "") return null;
  /** Where each letter of the line that isn't a space stands in it. */
  const places: number[] = [];
  let bare = "";
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (/\s/.test(char)) continue;
    places.push(i);
    bare += char;
  }
  const found = bare.indexOf(want);
  if (found < 0) return null;
  return { from: places[found] ?? 0, to: (places[found + want.length - 1] ?? 0) + 1 };
}

/** A stretch of the line, the piece being said in it underlined. */
function underlined(text: string, stretch: Span, now: Span): ReactNode {
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
  const where = whereIn(text, lit);
  if (!where) return underlined(text, { from: 0, to: text.length }, now);
  return (
    <>
      {underlined(text, { from: 0, to: where.from }, now)}
      <mark className="sub-mark">{underlined(text, where, now)}</mark>
      {underlined(text, { from: where.to, to: text.length }, now)}
    </>
  );
}

/** What's showing: the line being said, and the piece of it being said; none between lines. */
type Showing = { text: string; from: number; to: number } | null;

/** What a clip at rest shows: the line its lit words are in (the line the card is about), or else its first; nothing underlined. */
function restOf(cues: MediaCues, lit: string): Showing {
  const cue = cues.find((c) => whereIn(c.text, lit) !== null) ?? cues[0];
  return cue ? { text: cue.text, from: 0, to: 0 } : null;
}

/**
 * A clip's subtitles on a card, following it as it plays: the line being said at that moment, the piece of it being
 * said underlined, nothing between lines (the owner, 2026-10-18: "the timestamps and words sourced from the video", as
 * the extension draws them over YouTube; a field's words laid over the whole clip came first and stood there from the
 * first frame to the last). At rest (before it's played, and once it's over) it shows the line the card is about, its
 * word lit, so the card shows its subtitles without being played: in the layout editor and the drawer most of all (the
 * owner, 2026-10-18, seeing none there). Put in the box that holds the clip's picture (`MediaView`'s `over`), it reads
 * the picture's own `<video>` there; its words are sized with the box's height, so they're the same share of the clip on
 * the card and on the full screen. The band is the app's `.sub-band`, the one the extension draws too.
 */
export function ClipSubtitles({ cues, style, time, lit = "" }: Props) {
  const ground = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [showing, setShowing] = useState<Showing>(null);
  // Read with each frame rather than followed: a clip being made hands over new ones as its ends are pulled.
  const heard = useRef(cues);
  heard.current = cues;
  const at = useRef(time);
  at.current = time;
  const word = useRef(lit);
  word.current = lit;

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
    /** Where the clip is, or null at rest: not playing, at its start or its end (a pause on the way follows where it stopped). */
    const where = (): number | null => {
      if (at.current) return at.current();
      if (!video || (video.paused && (video.currentTime === 0 || video.ended))) return null;
      return video.currentTime;
    };
    const look = () => {
      frame = requestAnimationFrame(look);
      const seconds = where();
      let next: Showing;
      if (seconds === null) next = restOf(heard.current, word.current);
      else {
        const now = cueAt(heard.current, seconds * 1000);
        next = now ? { text: now.cue.text, from: now.piece?.from ?? 0, to: now.piece?.to ?? 0 } : null;
      }
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
