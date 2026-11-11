/** @panki How long a review's session has gone on, beside its counts, ticking (`TimeStudying`). */
import { useEffect, useState } from "react";
import { durationWords } from "../words";

/** How often the clock is read again: each second, so the minute turns when it does. */
const TICK_MS = 1000;

/**
 * "12 min studying" after a review's counts: the time since its session started (`from`, on the clock), to the whole
 * minute down, "<1 min" before the first; it ticks while the screen is open, and a new session starts it afresh.
 */
export function TimeStudying({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(tick);
  }, [from]);
  const minutes = Math.floor(Math.max(0, now - from) / 60_000);
  return <span className="time-studying">{minutes === 0 ? "<1 min studying" : `${durationWords(minutes * 60)} studying`}</span>;
}
