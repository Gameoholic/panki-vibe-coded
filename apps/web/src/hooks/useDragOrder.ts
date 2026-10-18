import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

type Drag = { from: number; to: number; dy: number; slot: number };

/**
 * Where each row's middle is, top to bottom. A row with nothing on screen (a card's reading, written over its word and
 * with no row of its own) takes the middle of the next row that has one, or of the last: it's passed over with that
 * row. As a 0 it stood at the very top of the page, and nothing could be dragged past it (the owner, 2026-10-18: "the
 * word itself can't be reordered").
 */
function centresOf(rects: readonly (DOMRect | undefined)[]): number[] {
  const known = rects.map((r) => (r ? r.top + r.height / 2 : null));
  const present = (c: number | null): c is number => c !== null;
  return known.map((c, i) => c ?? known.slice(i + 1).find(present) ?? known.slice(0, i).reverse().find(present) ?? 0);
}

/**
 * Reorder rows by dragging a handle, with a mouse or a finger alike (pointer events: Android Chrome starts no native
 * drag from a touch), or with the arrow keys on the handle. The rows keep their places in the DOM while dragging:
 * the held one follows the pointer, the others slide out of its way, and the move is committed on release through
 * `onMove`. Give each row `rowRef(i)` and `rowStyle(i)`, and its handle `handleProps(i)`.
 */
export function useDragOrder(count: number, onMove: (from: number, to: number) => void) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const start = useRef<{ y: number; centres: number[] } | null>(null);
  const current = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [focusAt, setFocusAt] = useState<number | null>(null);

  // A row moved by key takes its handle's focus with it: the DOM node moves, and a moved node loses focus.
  useEffect(() => {
    if (focusAt === null) return;
    rows.current[focusAt]?.querySelector<HTMLElement>("[data-drag-handle]")?.focus();
    setFocusAt(null);
  }, [focusAt]);

  function set(d: Drag | null) {
    current.current = d;
    setDrag(d);
  }
  function finish(commit: boolean) {
    const d = current.current;
    start.current = null;
    set(null);
    if (d && commit && d.to !== d.from) onMove(d.from, d.to);
  }

  function rowRef(i: number) {
    return (el: HTMLElement | null) => {
      rows.current[i] = el;
    };
  }
  function rowStyle(i: number): CSSProperties | undefined {
    if (!drag) return undefined;
    if (i === drag.from) return { transform: `translateY(${drag.dy}px)` };
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return { transform: `translateY(${-drag.slot}px)` };
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return { transform: `translateY(${drag.slot}px)` };
    return undefined;
  }
  function handleProps(i: number) {
    return {
      "data-drag-handle": true,
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        // Every row's place by index, one for each: a row never drawn leaves a hole in the list of rows, and `map` skips
        // holes, so the place it left was no place at all and nothing could be dragged past it (2026-10-18, twice).
        const rects = Array.from({ length: count }, (_, k) => rows.current[k]?.getBoundingClientRect());
        const mine = rects[i];
        if (!mine) return;
        // The room between two rows, from the first two that are drawn.
        const [first, second] = rects.filter((r): r is DOMRect => r !== undefined);
        const gap = first && second ? second.top - first.bottom : 0;
        start.current = { y: e.clientY, centres: centresOf(rects) };
        e.currentTarget.setPointerCapture(e.pointerId);
        set({ from: i, to: i, dy: 0, slot: mine.height + gap });
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        const s = start.current;
        const d = current.current;
        if (!s || !d) return;
        const dy = e.clientY - s.y;
        const centre = (s.centres[i] ?? 0) + dy;
        let to = i;
        while (to > 0 && centre < (s.centres[to - 1] ?? -Infinity)) to--;
        while (to < s.centres.length - 1 && centre > (s.centres[to + 1] ?? Infinity)) to++;
        set({ ...d, dy, to });
      },
      onPointerUp() {
        finish(true);
      },
      onPointerCancel() {
        finish(false);
      },
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        // To the next row that's drawn: one with nothing on screen (a reading over its word) is passed over, so each press moves it where it shows.
        const by = e.key === "ArrowUp" ? -1 : 1;
        let to = i + by;
        while (to >= 0 && to < count && !rows.current[to]) to += by;
        if (to < 0 || to >= count) return;
        onMove(i, to);
        setFocusAt(to);
      },
    };
  }

  return { rowRef, rowStyle, handleProps, dragging: drag?.from ?? null };
}
