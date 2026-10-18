import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SUBTITLE_REF_HEIGHT, cueAt, subtitleVars, type MediaCues, type SubtitleStyle } from "@panki/contracts";
import { langOf } from "../words";

type Props = {
  /** What's said in the clip, as it was heard on the video when it was recorded (`Card.cues`). */
  cues: MediaCues;
  /** How they look: the app's own subtitle style (`Settings.subtitleStyle`). */
  style: SubtitleStyle;
};

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
export function ClipSubtitles({ cues, style }: Props) {
  const ground = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [showing, setShowing] = useState<Showing>(null);

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
    if (!video) return;
    let frame = 0;
    const look = () => {
      frame = requestAnimationFrame(look);
      const now = cueAt(cues, video.currentTime * 1000);
      const next: Showing = now ? { text: now.cue.text, from: now.piece?.from ?? 0, to: now.piece?.to ?? 0 } : null;
      setShowing((was) => (was?.text === next?.text && was?.from === next?.from && was?.to === next?.to ? was : next));
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, [cues]);

  const vars = { ...subtitleVars(style), "--sub-scale": String(scale) } as CSSProperties;
  return (
    <div ref={ground} className="sub-ground" style={vars}>
      {showing ? (
        <div className="sub-band" lang={langOf(showing.text)}>
          {showing.text.slice(0, showing.from)}
          {showing.to > showing.from ? <span className="sub-now">{showing.text.slice(showing.from, showing.to)}</span> : null}
          {showing.text.slice(showing.to > showing.from ? showing.to : showing.from)}
        </div>
      ) : null}
    </div>
  );
}
