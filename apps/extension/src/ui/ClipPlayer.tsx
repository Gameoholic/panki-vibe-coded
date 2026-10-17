import { useEffect, useRef, useState } from "react";
import { MediaBar } from "@web/components/MediaView";

type Props = {
  /** The page's own video: the clip is a stretch of it until it's recorded. */
  video: HTMLVideoElement;
  start: number;
  /** Null while the clip's last words are still being said. */
  end: number | null;
  /** The card will hold the sound alone: no picture is shown. */
  soundOnly: boolean;
  /** Whether the clip is being played right now. */
  playing: boolean;
  /** Something else is being played on the page's video right now (the word's sound, while this is the sentence's clip): the picture here holds still, since it isn't this that's playing. */
  held: boolean;
  /** What the clip is, in the owner's words (its field's name). */
  label: string;
  onToggle: () => void;
};

/** How wide the picture is drawn, in pixels: the card's frame is narrower than this on any screen. */
const PICTURE = 480;

/**
 * A clip on the card before it's a file: what the card's player will look like, with the player's own bar. Its
 * picture is the video's own, drawn again here as the video shows it, and playing it plays the stretch on the page's
 * player. Nothing is recorded or fetched for it: a clip is made once, when its card is added.
 */
export function ClipPlayer({ video, start, end, soundOnly, playing, held, label, onToggle }: Props) {
  const picture = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(start);

  useEffect(() => {
    // The page's one video is what every cut is heard on. While another cut has it, what it shows isn't this clip
    // playing, so it isn't drawn here: the picture stays as it was, and catches up once the video is let go.
    if (soundOnly || held) return;
    let frame = 0;
    /** The moment of the video last drawn; a picture is only drawn again when the video has moved. */
    let drawn = -1;
    const again = () => {
      drawn = -1;
    };
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const el = picture.current;
      // While it's on its way somewhere the video still holds the picture of where it was.
      if (!el || video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === drawn) return;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      const height = Math.round((PICTURE * video.videoHeight) / video.videoWidth);
      if (el.width !== PICTURE || el.height !== height) {
        el.width = PICTURE;
        el.height = height;
      }
      el.getContext("2d")?.drawImage(video, 0, 0, PICTURE, height);
      drawn = video.currentTime;
    };
    video.addEventListener("seeked", again);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("seeked", again);
    };
  }, [video, soundOnly, held]);

  // The bar follows the video the way the app's player follows its file: as often as the video says where it is.
  useEffect(() => {
    if (!playing) return;
    const tell = () => setNow(video.currentTime);
    tell();
    video.addEventListener("timeupdate", tell);
    return () => video.removeEventListener("timeupdate", tell);
  }, [video, playing]);

  const length = end === null ? null : Math.max(0, end - start);
  const at = playing ? Math.max(0, Math.min(now - start, length ?? Infinity)) : 0;
  return (
    // Its presses are its own: a press anywhere else on the card turns the card over.
    <div className={`media media-player media-${soundOnly ? "audio" : "video"}`} onClick={(e) => e.stopPropagation()}>
      {soundOnly ? null : <canvas ref={picture} className="media-frame" aria-hidden="true" onClick={onToggle} />}
      <MediaBar playing={playing} at={at} length={length} label={label} onToggle={onToggle} />
    </div>
  );
}
