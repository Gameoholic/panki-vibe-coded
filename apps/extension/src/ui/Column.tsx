/** @panki The column the panel and the drawer stand in beside the video and in full screen, its left edge dragged for its width (`Column`). Never a second column. */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ScrollEdges } from "@web/components/ScrollEdges";

/** How far an arrow key on the edge moves it, in pixels. */
const KEY_STEP = 16;

type Props = {
  /**
   * The left edge dragged: the width it's dragged to, in pixels (from the pointer to the column's right edge, which
   * stays put), as it goes, and `settled` once let go, or on a key, the moment to keep it. The page holds it inside its
   * bounds (`modules.ts` → `panelWidthOf`) and lays the column out.
   */
  onWidth: (width: number, settled: boolean) => void;
};

/**
 * The column the Panki panel and the capture drawer stand in beside the video (the Beside the video view as tall as the
 * player, the site's full screen as tall as the screen): one box of Panki's that scrolls inside itself, the drawer over
 * the panel, so opening the drawer never makes the column taller than the room it had. The two places themselves are
 * put in the column's host by the page and drawn here through the slot; the column is only their scroller, with Panki's
 * fade and thin bar (`ScrollEdges`) in place of the browser's. Its left edge is a grip, dragged to make the column
 * wider or narrower (← and → with the keyboard); the page keeps the width. In full screen, folded away, the page leaves
 * its host as wide as nothing and hides everything in it (`is-folded`); the button in the video's corner brings it back (`ui/PanelButton.tsx`).
 */
export function Column({ onWidth }: Props) {
  const box = useRef<HTMLDivElement>(null);
  /** The pointer holding the edge, and the width it was last dragged to: what's kept when it's let go (the event letting go carries no place of its own). */
  const held = useRef<{ id: number; width: number } | null>(null);
  const [holding, setHolding] = useState(false);
  const widthAt = (x: number) => Math.round((box.current?.getBoundingClientRect().right ?? x) - x);
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    // It keeps following a pointer that strays off it, over the video.
    e.currentTarget.setPointerCapture(e.pointerId);
    held.current = { id: e.pointerId, width: box.current?.offsetWidth ?? 0 };
    setHolding(true);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const h = held.current;
    if (!h || h.id !== e.pointerId) return;
    h.width = widthAt(e.clientX);
    onWidth(h.width, false);
  }
  function onLostPointerCapture(e: PointerEvent<HTMLDivElement>) {
    const h = held.current;
    if (!h || h.id !== e.pointerId) return;
    held.current = null;
    setHolding(false);
    onWidth(h.width, true);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    onWidth((box.current?.offsetWidth ?? 0) + (e.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP), true);
  }
  return (
    <>
      <div ref={box} className="panki-column">
        <div className="panki-column-body">
          <slot />
        </div>
      </div>
      <div
        className={`panki-column-grip ${holding ? "is-held" : ""}`.trim()}
        role="separator"
        aria-orientation="vertical"
        aria-label="Panel width"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onLostPointerCapture={onLostPointerCapture}
        onKeyDown={onKeyDown}
      />
      <ScrollEdges of={box} />
    </>
  );
}
