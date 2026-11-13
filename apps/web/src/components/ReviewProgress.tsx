/** @panki How far through a review its cards are, a thin bar across the top of the window (`ReviewProgress`). Never a second bar of it. */

/**
 * A thin bar across the very top of the window, filled as far as the review's cards are done: `done` the cards that
 * have left it, `of` those and the ones still in its line. A card asked again is still in the line, so a miss never
 * moves the bar back; it fills once the card leaves. Inside the review's own element, so it stays when the review fills
 * the screen.
 */
export function ReviewProgress({ done, of }: { done: number; of: number }) {
  const share = of > 0 ? done / of : 0;
  return (
    <div className="review-progress" role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={of} aria-valuenow={done}>
      <span className="review-progress-fill" style={{ transform: `scaleX(${share})` }} />
    </div>
  );
}
