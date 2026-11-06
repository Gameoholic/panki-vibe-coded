import { useRef } from "react";
import { ScrollEdges } from "@web/components/ScrollEdges";

/**
 * The column the Panki panel and the capture drawer stand in beside the video (the Beside the video view as tall as the
 * player, Theatre mode as tall as the screen): one box of Panki's that scrolls inside itself, the drawer over the panel,
 * so opening the drawer never makes the column taller than the room it had. The two places themselves are put in the
 * column's host by the page and drawn here through the slot; the column is only their scroller, with Panki's fade and
 * thin bar (`ScrollEdges`) in place of the browser's.
 */
export function Column() {
  const box = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={box} className="panki-column">
        <div className="panki-column-body">
          <slot />
        </div>
      </div>
      <ScrollEdges of={box} />
    </>
  );
}
