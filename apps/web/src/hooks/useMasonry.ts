/** @panki The board packed by height (`useMasonry`): each tile keeps its own height and the next one in its column comes up under it; the doors share the tallest door's. */
import { useEffect, useRef } from "react";

/** The board's rows, in px: a tile takes as many as its height needs, so nothing is stretched by its neighbours. */
const ROW_PX = 2;

/** Every door but Review is one height, the tallest one's, so a row of doors stays even. */
const isEvenDoor = (el: HTMLElement) => el.dataset.id?.startsWith("door-") === true && el.dataset.id !== "door-review";

/**
 * Lays the grid's children out by their own heights: the grid, marked `data-packed`, is cut into rows of `ROW_PX`
 * and each child spans as many as it needs, its gap below it as a margin (`.board[data-packed]`'s CSS), so a short tile beside a tall one stays short and
 * the next tile in its column fills the space under it. Laid out as soon as the board or its children change, before
 * the page is painted, and again whenever a child changes size (a Show more, a chart loading), a frame later.
 * Returns the ref for the grid itself.
 */
export function useMasonry() {
  const root = useRef<HTMLElement | null>(null);
  const watch = useRef<{ resize: ResizeObserver; children: MutationObserver; frame: number } | null>(null);

  function lay() {
    const grid = root.current;
    if (!grid) return;
    // Packed before anything is measured, so each child is read at its own height, not its row's. An attribute,
    // which React leaves alone when it writes the board's classes.
    grid.dataset.packed = "";
    const gap =parseFloat(getComputedStyle(grid).getPropertyValue("--board-gap")) || 0;
    // The copy carried while arranging floats over the board and has no place in it.
    const items = [...grid.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains("tile-ghost"));
    const doors = items.filter(isEvenDoor);
    for (const door of doors) door.style.minHeight = "";
    const heights = new Map(items.map((el) => [el, el.getBoundingClientRect().height]));
    const tallestDoor = Math.max(0, ...doors.map((door) => heights.get(door) ?? 0));
    for (const el of items) {
      const even = isEvenDoor(el);
      if (even) el.style.minHeight = `${tallestDoor}px`;
      const height = even ? tallestDoor : (heights.get(el) ?? 0);
      el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + gap) / ROW_PX))}`;
    }
  }

  function watchChildren() {
    const w = watch.current;
    const grid = root.current;
    if (!w || !grid) return;
    w.resize.disconnect();
    for (const el of grid.children) w.resize.observe(el);
  }

  // A size changed by laying out is seen again a frame later, never inside the observer's own pass.
  function soon() {
    const w = watch.current;
    if (!w || w.frame) return;
    w.frame = requestAnimationFrame(() => {
      w.frame = 0;
      lay();
    });
  }

  useEffect(
    () => () => {
      const w = watch.current;
      if (!w) return;
      w.resize.disconnect();
      w.children.disconnect();
      cancelAnimationFrame(w.frame);
      watch.current = null;
      root.current = null;
    },
    [],
  );

  // Called with null and then the grid again on every render a ref is handed in fresh (one merged by hand): only a
  // grid that isn't the one already watched starts over; the watching ends with the board.
  return (el: HTMLElement | null) => {
    if (el === null || (el === root.current && watch.current)) return;
    if (watch.current) {
      watch.current.resize.disconnect();
      watch.current.children.disconnect();
      cancelAnimationFrame(watch.current.frame);
      watch.current = null;
    }
    root.current = el;
    watch.current = {
      resize: new ResizeObserver(soon),
      // Children added, taken away or put in another order: laid out at once, before the page is painted.
      children: new MutationObserver(() => {
        watchChildren();
        lay();
      }),
      frame: 0,
    };
    watch.current.children.observe(el, { childList: true });
    watchChildren();
    lay();
  };
}
