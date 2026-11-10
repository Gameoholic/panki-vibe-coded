/** @panki The Add button's burst as a card lands: a ring rippling out and dots flying off (`Burst`). Never a second celebration. */
import type { CSSProperties } from "react";

/** How many dots fly off, and how far: across the button's width, less its height, since it's wide and low. */
const DOTS = 10;
const REACH = { x: 70, y: 34 };

/**
 * What the Add button does the moment the card is in (`Panel.tsx`, `.btn.capture-add.is-added`): drawn into the button
 * as it turns, a ring rippling out from its middle and a few dots flying off, once, then gone. Decoration only: the
 * button's own words say what happened.
 */
export function Burst() {
  return (
    <span className="capture-burst" aria-hidden="true">
      <i className="capture-ring" />
      {Array.from({ length: DOTS }, (_, i) => {
        const angle = (i / DOTS) * Math.PI * 2;
        const style = { "--dx": `${Math.round(Math.cos(angle) * REACH.x)}px`, "--dy": `${Math.round(Math.sin(angle) * REACH.y)}px` } as CSSProperties;
        return <i key={i} className="capture-dot" style={style} />;
      })}
    </span>
  );
}
