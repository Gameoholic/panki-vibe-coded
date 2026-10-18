import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SUBTITLE_REF_HEIGHT, subtitleVars, type SubtitleStyle } from "@panki/contracts";

type Props = {
  /** How it looks: the account's subtitle style, the one the extension draws over a YouTube video. */
  style: SubtitleStyle;
  children: ReactNode;
};

/**
 * Subtitles over a picture: the band laid over the box it's put in (which is positioned), at the style's height and
 * place, its words sized with that box's height so they're the same share of any picture (a card's small clip, the
 * same clip filling the screen). A card's clip draws one with a field's words (the owner, 2026-10-18: "render the
 * subtitles onto the card's video, same as we do on YouTube"); the extension's band over a YouTube video is the same
 * `.sub-band`. Words only: nothing on it is pressed, so the picture under it still is.
 */
export function Subtitle({ style, children }: Props) {
  const ground = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const box = ground.current?.parentElement;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      if (box.clientHeight > 0) setScale(box.clientHeight / SUBTITLE_REF_HEIGHT);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const vars = { ...subtitleVars(style), "--sub-scale": String(scale) } as CSSProperties;
  return (
    <div ref={ground} className="sub-ground" style={vars}>
      <div className="sub-band">{children}</div>
    </div>
  );
}
