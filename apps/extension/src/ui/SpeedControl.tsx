import { useEffect, useRef, useState } from "react";
import { Button } from "@web/components/Button";
import { useDismiss } from "@web/hooks/useDismiss";

/**
 * The player's speed, changed without opening the site's own settings (the owner, 2026-10-21, the first YouTube
 * utility after Hide Shorts): a button among the player's own controls saying the speed it plays at, and under a
 * press a small row of the site's own speeds above it, one pressed to play at it. It reads the player itself, so a
 * speed set the site's way shows here too. A utility of the site's own: there whether or not Panki is on.
 */
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const speedWords = (rate: number) => `${Number(rate.toFixed(2))}×`;

export function SpeedControl({ video }: { video: HTMLVideoElement }) {
  const [rate, setRate] = useState(video.playbackRate);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, () => setOpen(false));
  useEffect(() => {
    const read = () => setRate(video.playbackRate);
    read();
    video.addEventListener("ratechange", read);
    return () => video.removeEventListener("ratechange", read);
  }, [video]);
  return (
    <div ref={root} className="yt-speed">
      <Button className="yt-speed-button" aria-label={`Playback speed, ${speedWords(rate)}`} aria-expanded={open} onClick={() => setOpen((was) => !was)}>
        {speedWords(rate)}
      </Button>
      {open ? (
        <div className="yt-speed-pop" role="group" aria-label="Playback speed">
          {SPEEDS.map((speed) => (
            <Button
              key={speed}
              variant="chip"
              className="yt-speed-chip"
              aria-pressed={Math.abs(rate - speed) < 0.001}
              onClick={() => {
                video.playbackRate = speed;
                setOpen(false);
              }}
            >
              {speedWords(speed)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
