/** @panki A panel laid over the screen, moved anywhere and kept where it was put (`FloatPanel`). Never a second floating panel. */
import { useRef, type CSSProperties, type ReactNode } from "react";
import { useDragPanel } from "../hooks/useDragPanel";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ScrollEdges } from "./ScrollEdges";

type Props = {
  /** What its ids go by, and its key on this device (`panki.float.<id>`): where it stands and whether it's folded. */
  id: string;
  /** Its name, at the left of its header. */
  title: ReactNode;
  /** What it is, for a screen reader. */
  label: string;
  /** Buttons in its header, before the fold: an editor's Undo and Redo. */
  tools?: ReactNode;
  children: ReactNode;
};

/**
 * A panel laid over the screen, standing above what's under it without moving it: dragged anywhere by its header with
 * a mouse or a finger and kept inside the window, folded to its header by its chevron, and found where it was left on
 * this device (docked at the right under the screen's header to begin with). Its body scrolls inside itself past the
 * window's foot. On a phone it's a sheet at the foot of the screen, the whole width, folded to its header to begin with
 * and pulled up by it to open. Placed inside what fills the screen, it stands there too.
 */
export function FloatPanel({ id, title, label, tools, children }: Props) {
  const panel = useRef<HTMLElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const place = useDragPanel(`panki.float.${id}`, panel, head);
  const style = { ...place.style, ...(place.room === null ? {} : { "--float-room": `${place.room}px` }) } as CSSProperties;
  return (
    <section
      ref={panel}
      id={id}
      className={`float-panel ${place.phone ? "is-sheet" : ""} ${place.folded ? "is-folded" : ""} ${place.dragging ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
      style={style}
      aria-label={label}
    >
      <div ref={head} className="float-head" {...place.handlers}>
        <span className="float-grab" aria-hidden="true" />
        <div className="float-title">{title}</div>
        {tools ? <span className="float-tools">{tools}</span> : null}
        <Button id={`${id}-fold`} className="btn-icon" aria-label={place.folded ? "Unfold" : "Fold"} aria-expanded={!place.folded} onClick={place.toggle}>
          {/* Which way it opens: down from its header on a computer, up from the screen's foot on a phone. */}
          <Icon name={place.folded !== place.phone ? "down" : "up"} />
        </Button>
      </div>
      {place.folded ? null : (
        <>
          <div ref={body} className="float-body">
            {children}
          </div>
          <ScrollEdges of={body} />
        </>
      )}
    </section>
  );
}
