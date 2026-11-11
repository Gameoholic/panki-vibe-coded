/** @panki The one hint bubble, on hover or focus, above its point or below it (`Tip`). Never a `title` attribute, never a hover bubble drawn by hand. */
import type { ReactNode } from "react";

type Props = {
  /** Where its arrow points, inside the nearest positioned parent. */
  x: number;
  y: number;
  /** Under the point rather than over it: for what stands at the top of a screen, where over it would be cut off. */
  below?: boolean;
  children: ReactNode;
};

/** The app's hint: a small dark bubble above a point (or below it), shown while a mouse rests on something. Never the browser's `title`. Not shown on a touch screen, where the words are in the menu instead. */
export function Tip({ x, y, below = false, children }: Props) {
  return (
    <div className={below ? "tip is-below" : "tip"} role="tooltip" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}
