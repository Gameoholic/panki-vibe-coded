import type { ReactNode } from "react";

type Props = {
  /** Where its arrow points, inside the nearest positioned parent. */
  x: number;
  y: number;
  children: ReactNode;
};

/** The app's hint: a small dark bubble above a point, shown while a mouse rests on something. Never the browser's `title`. Not shown on a touch screen, where the words are in the menu instead. */
export function Tip({ x, y, children }: Props) {
  return (
    <div className="tip" role="tooltip" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}
