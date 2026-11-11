/** @panki A box that scrolls inside itself: a fade at an edge with more past it, and a thin bar while scrolled (`ScrollEdges`). Never the browser's bar, never a second fade. */
import { useRef, type RefObject } from "react";
import { useScrollEdges } from "../hooks/useScrollEdges";

type Props = {
  /** The box that scrolls inside itself. */
  of: RefObject<HTMLElement | null>;
  /** Which way it scrolls: down (`y`, to begin with) or sideways (`x`, the fades at its sides and the bar along its foot). */
  axis?: "x" | "y";
  /** A press on the thumb, for a box whose own presses mean something to what holds it (the pop-up kept open). */
  onPointerDown?: () => void;
};

/**
 * Panki's look for a box that scrolls inside itself: a fade at an edge with more past it and a thin bar that shows
 * while it scrolls or the pointer is on it (`hooks/useScrollEdges.ts`, `app.css` → `.scroll-edges`). Rendered right
 * after its box, in the same place, so the two come and go together; laid over the box, never inside it, so nothing
 * of it moves with the box's scroll.
 */
export function ScrollEdges({ of, axis = "y", onPointerDown }: Props) {
  const edges = useRef<HTMLSpanElement>(null);
  useScrollEdges(of, edges, axis);
  return (
    <span ref={edges} className={axis === "x" ? "scroll-edges is-x" : "scroll-edges"} aria-hidden="true" onPointerDown={onPointerDown}>
      <span className="scroll-thumb" />
    </span>
  );
}
