import { useEffect, useState, type AnimationEvent } from "react";
import { Mark } from "../brand/Mark";

/** The overlay's closing keyframes in app.css; when they end, the moment is over. */
const CLOSING = "intro-out";
/** If the browser never reports the closing animation (motion off, a tab in the background), lift anyway. */
const LONGEST_MS = 3000;

function wantsMotion() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The opening moment: the tile lands, the two strokes of パ wipe in, the ring pops, the name rises, and the
 * whole thing lifts away to show the app. Plays once per page load, never inside the app, and not at all for
 * someone who asked their device for less motion. Timings live in app.css next to the keyframes.
 */
export function Intro() {
  const [playing, setPlaying] = useState(wantsMotion);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setPlaying(false), LONGEST_MS);
    return () => window.clearTimeout(timer);
  }, [playing]);

  if (!playing) return null;

  function onAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (e.animationName === CLOSING) setPlaying(false);
  }

  return (
    <div className="intro" onAnimationEnd={onAnimationEnd} aria-hidden="true">
      <div className="intro-stage">
        <Mark className="intro-mark" size={112} />
        <span className="intro-name">Panki</span>
      </div>
    </div>
  );
}
