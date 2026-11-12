/** @panki How long ago a review's session started, beside its counts, ticking; its start and the time spent studying in it pointed at or pressed (`TimeStudying`). */
import { useEffect, useState } from "react";
import { activeBetween, momentNow, type Moment } from "../away";
import { durationWords, hourWords } from "../words";
import { Button } from "./Button";
import { Tip } from "./Tip";

/** How often the clock is read again: each second, so the minute turns when it does. */
const TICK_MS = 1000;

/** Whole minutes as the line says them: "<1 min" before the first, then "12 min", "1 h 5 min". */
const minutesWords = (ms: number) => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  return minutes === 0 ? "<1 min" : durationWords(minutes * 60);
};

/**
 * "12 min elapsed" after a review's counts: plain clock time since its session started (`from`), away or not, a
 * reminder of when it began and never a stat; it ticks while the screen is open, and a new session starts it afresh.
 * Pointed at, the app's hint says when it started and the time spent studying in it, with Panki in view
 * (`since`; the clock alone for the explainers' made-up sessions); pressed, the words say the same in their place until
 * pressed again, so a phone, which has no hover, has it too.
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
  const elapsed = `${minutesWords(now - from)} elapsed`;
  const started = `Started at ${hourWords(from)}`;
  const studying = `${minutesWords(since ? activeBetween(since, momentNow()) : now - from)} studying`;
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
        {pressed ? `${started} · ${studying}` : elapsed}
      </Button>
      {over !== null && !pressed ? (
        <Tip x={over.x} y={over.y} below>
          {started}
          <br />
          {studying}
        </Tip>
      ) : null}
    </span>
  );
}
