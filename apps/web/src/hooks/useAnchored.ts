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
 */
export function useAnchored(anchor: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      const at = anchor.current?.getBoundingClientRect();
      const element = menu.current;
      if (at && element) {
        const below = window.innerHeight - at.bottom - GAP - EDGE;
        const above = at.top - GAP - EDGE;
        // Its whole height: `scrollHeight` leaves out the border, and a max height of that, the box being border-box, put a
        // scrollbar on a menu that fit; rounded up, never short.
        const edges = element.offsetHeight - element.clientHeight;
        const natural = Math.ceil(element.scrollHeight + edges);
        const up = natural > below && above > below;
        const room = Math.max(0, up ? above : below);
        element.style.maxHeight = `${Math.min(natural, room)}px`;
        const height = Math.min(natural, room);
        const top = up ? at.top - GAP - height : at.bottom + GAP;
        const left = Math.max(EDGE, Math.min(at.left, window.innerWidth - element.offsetWidth - EDGE));
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
  }, [anchor, menu, open]);
}
