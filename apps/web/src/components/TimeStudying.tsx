/** @panki How long a review's session has gone on with Panki in view, beside its counts, ticking, its start on the clock pointed at or pressed (`TimeStudying`). */
import { useEffect, useState } from "react";
import { activeBetween, momentNow, type Moment } from "../away";
import { durationWords, hourWords } from "../words";
import { Button } from "./Button";
import { Tip } from "./Tip";

/** How often the clock is read again: each second, so the minute turns when it does. */
const TICK_MS = 1000;

/**
 * "12 min studying" after a review's counts: the time since its session started (`from`, on the clock), to the whole
 * minute down, "<1 min" before the first; it ticks while the screen is open, and a new session starts it afresh.
 * Pointed at, the app's hint says when it started ("Started at 21:12"), under the words as the time left's does;
 * pressed, the words say it in their place until pressed again, so a phone, which has no hover, has it too.
 */
export function TimeStudying({ from, since }: { from: number; since?: Moment }) {
  const [now, setNow] = useState(() => Date.now());
  // Where the hint points: the middle of the words' foot.
  const [over, setOver] = useState<{ x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(tick);
  }, [from]);
  // In view only, when the session's start moment is known; the explainers' made-up sessions count the clock alone.
  const minutes = Math.floor((since ? activeBetween(since, momentNow()) : Math.max(0, now - from)) / 60_000);
  const started = `Started at ${hourWords(from)}`;
  const point = (e: { currentTarget: HTMLElement }) => setOver({ x: e.currentTarget.offsetWidth / 2, y: e.currentTarget.offsetHeight });
  return (
    <span className="time-studying">
      <Button
        className="time-studying-words"
        aria-pressed={pressed}
        onMouseEnter={point}
        onMouseLeave={() => setOver(null)}
        onFocus={point}
        onBlur={() => setOver(null)}
        onClick={() => setPressed(!pressed)}
      >
        {pressed ? started : minutes === 0 ? "<1 min studying" : `${durationWords(minutes * 60)} studying`}
      </Button>
      {over !== null && !pressed ? (
        <Tip x={over.x} y={over.y} below>
          {started}
        </Tip>
      ) : null}
    </span>
  );
}
