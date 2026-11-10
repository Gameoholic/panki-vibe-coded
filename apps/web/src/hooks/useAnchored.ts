/** @panki A menu that must never be cut off by a box scrolling around it, fixed in the window under its anchor (`useAnchored`). */
import { useEffect, type RefObject } from "react";

/** The gap between what opened and its menu, and the least room kept from the window's edges. */
const GAP = 4;
const EDGE = 8;

/**
 * Keeps an open menu beside what opened it in the window itself (`position: fixed`), so no box that scrolls around it
 * cuts it off (Explain's templates menu in the pop-up, say). Under the anchor where it fits, over it where there's more room above, held inside the window's width, and as
 * tall as the room it has, scrolling inside itself past that. Placed again every frame while open, so it follows a page
 * or a pop-up that scrolls or moves. It stays where it is in the DOM (inside the extension's shadow root, so its styles
 * still reach it, and `useDismiss` still hears presses in it); a box around it that makes a fixed element its own
 * (a transform, a filter) is made up for by measuring where it really landed.
 *
 * Given a `width`, it's its anchor's, as a `Dropdown`'s list is when it opens in place: at least as wide (`"least"`),
 * or exactly as wide, for a list whose choices wrap (`"same"`, a wide one's); never wider than the window. Set here,
 * every frame, never as a share in CSS: a share of a fixed element is a share of the window. Without one, the menu's
 * own CSS sizes it (the templates menu).
 *
 * It starts at its anchor's left edge; `align: "auto"` has it end at the anchor's right edge instead when the anchor
 * stands in the window's right half, so it hangs back over the row the anchor is in rather than off past it (`Ask`).
 */
export function useAnchored(
  anchor: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
  open: boolean,
  width?: "least" | "same",
  align: "start" | "auto" = "start",
) {
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      const at = anchor.current?.getBoundingClientRect();
      const element = menu.current;
      if (at && element) {
        if (width) {
          const most = Math.max(0, window.innerWidth - 2 * EDGE);
          const wide = `${Math.min(at.width, most)}px`;
          element.style.maxWidth = `${most}px`;
          element.style.minWidth = wide;
          element.style.width = width === "same" ? wide : "";
        }
        const below = window.innerHeight - at.bottom - GAP - EDGE;
        const above = at.top - GAP - EDGE;
        // Its whole height: `scrollHeight` leaves out the border. Only the room caps it, never its own height: the
        // browser reports that in whole pixels while, zoomed, the real one is a fraction more, and a cap of the whole
        // number left the box a fraction short, so a scrollbar came, the words wrapped narrower, the next frame's
        // measure was taller, the bar went, and the panel jittered every frame.
        const edges = element.offsetHeight - element.clientHeight;
        const natural = Math.ceil(element.scrollHeight + edges);
        const up = natural > below && above > below;
        const room = Math.max(0, up ? above : below);
        element.style.maxHeight = `${room}px`;
        const height = Math.min(natural, room);
        const top = up ? at.top - GAP - height : at.bottom + GAP;
        const fromRight = align === "auto" && at.left + at.width / 2 > window.innerWidth / 2;
        const start = fromRight ? at.right - element.offsetWidth : at.left;
        const left = Math.max(EDGE, Math.min(start, window.innerWidth - element.offsetWidth - EDGE));
        // Where it lands against where it was put: a containing box other than the window shifts it by that much.
        element.style.top = `${top}px`;
        element.style.left = `${left}px`;
        const landed = element.getBoundingClientRect();
        if (Math.abs(landed.top - top) > 0.5 || Math.abs(landed.left - left) > 0.5) {
          element.style.top = `${2 * top - landed.top}px`;
          element.style.left = `${2 * left - landed.left}px`;
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor, menu, open, width, align]);
}
