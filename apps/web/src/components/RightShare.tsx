/** @panki The share of a review's answers so far that were right, beside its counts (`RightShare`, `rightOf`). */
import { missOf, type SrsAnswer } from "@panki/contracts";

/**
 * How many of the answers given were right, of how many were judged, as Right and Toughest cards judge them
 * (`missOf`): an answer set apart is neither, so it counts toward neither.
 */
export function rightOf(given: Readonly<Record<string, number>>, answers: readonly SrsAnswer[]): { right: number; of: number } {
  let right = 0;
  let of = 0;
  for (const [answerId, n] of Object.entries(given)) {
    const miss = missOf(answers, answerId);
    if (miss === null) continue;
    of += n;
    if (miss === 0) right += n;
  }
  return { right, of };
}

/** "75% right" after a review's counts, rounded once to a whole percent; nothing before the first answer that's judged. */
export function RightShare({ right, of }: { right: number; of: number }) {
  if (of === 0) return null;
  return <span className="review-right">{`${Math.round((right * 100) / of)}% right`}</span>;
}
