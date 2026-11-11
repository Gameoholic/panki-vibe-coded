/** @panki About how long a review has left, beside its counts, its finish time on the clock pointed at or pressed (`TimeLeft`, `timeWords`). */
import { useState } from "react";
import { durationWords, hourWords } from "../words";
import { Button } from "./Button";
import { Tip } from "./Tip";

/** A time left in words, rough as it is, to the minute and never "0 min": "~14 min", "~1 h 5 min". The review's counts and its Start say it so. */
export const timeWords = (ms: number) => `~${durationWords(Math.max(60, ms / 1000))}`;

/**
 * "~14 min left" after a review's counts. Pointed at, the app's hint says when that is on the clock ("Done by
 * 21:47"); pressed, the words say it in their place until pressed again, so a phone, which has no hover, has it too.
 * The clock is read as it's asked for, so the time stays true however long the review has stood.
 */
export function TimeLeft({ ms }: { ms: number }) {
  // When it was pointed at, and the middle of the words, where the hint's arrow points.
  const [over, setOver] = useState<{ at: number; x: number } | null>(null);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const done = (from: number) => `Done by ${hourWords(from + ms)}`;
  const point = (e: { currentTarget: HTMLElement }) => setOver({ at: Date.now(), x: e.currentTarget.offsetWidth / 2 });
  return (
    <span className="time-left">
      <Button
        className="time-left-words"
        aria-pressed={doneAt !== null}
        onMouseEnter={point}
        onMouseLeave={() => setOver(null)}
        onFocus={point}
        onBlur={() => setOver(null)}
        onClick={() => setDoneAt(doneAt === null ? Date.now() : null)}
      >
        {doneAt === null ? `${timeWords(ms)} left` : done(doneAt)}
      </Button>
      {over !== null && doneAt === null ? (
        <Tip x={over.x} y={0}>
          {done(over.at)}
        </Tip>
      ) : null}
    </span>
  );
}
