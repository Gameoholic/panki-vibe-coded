import { useEffect, useState } from "react";
import { hourWords } from "@web/words";

/**
 * When the video will end on this device's clock (the owner, 2026-10-25: "shows at what time, local time, the video
 * will end"): "Ends 21:47" after the player's own time, the time left played at the speed it plays at. A paused video
 * ends later the longer it stands, so it's read again every second as well as when the video moves. Nothing for a
 * live stream (no end) or before the video's length is known; the page takes it off while an ad plays. A YouTube
 * utility: there whether or not Panki is on.
 */
const AGAIN_MS = 1000;
const EVENTS = ["timeupdate", "ratechange", "durationchange", "play", "pause", "seeked"] as const;

export function EndTime({ video }: { video: HTMLVideoElement }) {
  const [ends, setEnds] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const left = video.duration - video.currentTime;
      setEnds(Number.isFinite(left) && left >= 0 && video.playbackRate > 0 ? Date.now() + (left / video.playbackRate) * 1000 : null);
    };
    read();
    for (const type of EVENTS) video.addEventListener(type, read);
    const timer = setInterval(read, AGAIN_MS);
    return () => {
      for (const type of EVENTS) video.removeEventListener(type, read);
      clearInterval(timer);
    };
  }, [video]);
  if (ends === null) return null;
  return <span className="yt-end">Ends {hourWords(ends)}</span>;
}
