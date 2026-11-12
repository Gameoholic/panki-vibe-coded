/** @panki Time while Panki is out of view, its tab hidden or another window in front, so a card's clock stops while it's away (`momentNow`, `activeBetween`, `Moment`). */

/**
 * Panki is away while its tab isn't seen (another tab, the window minimised, the screen locked, another app on the
 * phone) or another window has the focus. Focus gone into something inside the page isn't away: `hasFocus` still says
 * the page has it. Looking away from a window that still has the focus can't be told; a card's own cap covers that.
 */
const isAway = () => document.visibilityState === "hidden" || !document.hasFocus();

/** Time away before the current stretch, and when the current one began; on `performance.now()`'s clock. */
let awayBefore = 0;
let awaySince: number | null = null;

function update() {
  const now = performance.now();
  const away = isAway();
  if (away && awaySince === null) awaySince = now;
  if (!away && awaySince !== null) {
    awayBefore += now - awaySince;
    awaySince = null;
  }
}

if (typeof document !== "undefined") {
  update();
  document.addEventListener("visibilitychange", update);
  window.addEventListener("focus", update);
  // The focus may only be moving inside the page; where it lands is known a moment later.
  window.addEventListener("blur", () => setTimeout(update, 0));
}

/** A moment on the browser's clock, and how much time away there had been by then. */
export type Moment = { at: number; away: number };

export function momentNow(): Moment {
  const at = performance.now();
  return { at, away: awayBefore + (awaySince === null ? 0 : at - awaySince) };
}

/** The time between two moments that Panki was in view, in ms. */
export const activeBetween = (from: Moment, to: Moment) => Math.max(0, to.at - from.at - (to.away - from.away));
