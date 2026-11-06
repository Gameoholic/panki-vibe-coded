import { useRef } from "react";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { ScrollEdges } from "@web/components/ScrollEdges";

/** The grip at the column's inner edge in full screen: the column folded away, and back. */
export type ColumnHandle = {
  folded: boolean;
  /** Which side of the screen the column stands at: the grip stands just off its other edge, on the video. */
  side: "left" | "right";
  onToggle: () => void;
};

/**
 * The column the Panki panel and the capture drawer stand in beside the video (the Beside the video view as tall as the
 * player, the site's full screen as tall as the screen): one box of Panki's that scrolls inside itself, the drawer over
 * the panel, so opening the drawer never makes the column taller than the room it had. The two places themselves are
 * put in the column's host by the page and drawn here through the slot; the column is only their scroller, with Panki's
 * fade and thin bar (`ScrollEdges`) in place of the browser's. In full screen it has a `handle`: a thin grip on its
 * inner edge, over the video, that folds the column away (the video alone filling the screen, the grip staying at the
 * screen's edge) and brings it back; folded, the page leaves the column's host as wide as nothing (`is-folded`).
 */
export function Column({ handle }: { handle: ColumnHandle | null }) {
  const box = useRef<HTMLDivElement>(null);
  // The chevron points where the press sends the column: off the screen's edge, or back in from it.
  const out = handle !== null && (handle.side === "right") !== handle.folded;
  return (
    <>
      <div ref={box} className="panki-column">
        <div className="panki-column-body">
          <slot />
        </div>
      </div>
      <ScrollEdges of={box} />
      {handle ? (
        <Button
          className={`btn-icon panki-column-handle is-${handle.side}`}
          aria-label={handle.folded ? "Show panel" : "Hide panel"}
          aria-expanded={!handle.folded}
          onClick={(event) => {
            handle.onToggle();
            // Pressed with a mouse, the focus isn't left on it: the hide key is heard from the page, never from inside Panki.
            if (event.detail > 0) event.currentTarget.blur();
          }}
        >
          <Icon name={out ? "forward" : "back"} />
        </Button>
      ) : null}
    </>
  );
}
