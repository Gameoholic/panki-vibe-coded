import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

type Drag = { from: number; to: number; dy: number; slot: number };

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
        const rects = rows.current.slice(0, count).map((el) => el?.getBoundingClientRect());
        const mine = rects[i];
        const first = rects[0];
        const second = rects[1];
        if (!mine) return;
        const gap = first && second ? second.top - first.bottom : 0;
        start.current = { y: e.clientY, centres: rects.map((r) => (r ? r.top + r.height / 2 : 0)) };
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
        const to = e.key === "ArrowUp" ? i - 1 : i + 1;
        if (to < 0 || to >= count) return;
        onMove(i, to);
        setFocusAt(to);
      },
    };
  }

  return { rowRef, rowStyle, handleProps, dragging: drag?.from ?? null };
}
