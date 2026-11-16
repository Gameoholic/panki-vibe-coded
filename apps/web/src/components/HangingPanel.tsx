/** @panki A panel of settings hanging from the button that opened it, Esc or a press outside closing it: a streak's (`HangingPanel`). Never a centred modal. */
import { useRef, type ReactNode, type RefObject } from "react";
import { useAnchored } from "../hooks/useAnchored";
import { useDismiss } from "../hooks/useDismiss";

type Props = {
  /** What it hangs from; a press on it again is that button's, never one outside. */
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Its small title, at its top. */
  title: string;
  /** What it is, for a screen reader. */
  label: string;
  /** What went wrong with the last save, under the title. */
  failure: string | null;
  /**
   * Where it starts: at its anchor's left edge (`start`, a row or a button at the column's left), or ending at its right
   * edge when the anchor stands in the window's right half (`auto`, a tile's settings button).
   */
  align?: "start" | "auto";
  children: ReactNode;
};

/**
 * Something's own settings, in a panel hanging from the button that opened it as a question hangs from its button
 * (`Ask`), placed in the window so no box scrolling around it cuts it off (`useAnchored`). Its foot, under a hairline,
 * is `.tile-panel-foot`: Delete for one that's kept, Cancel and Create for a new one.
 */
export function HangingPanel({ anchor, open, onClose, title, label, failure, align = "auto", children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useAnchored(anchor, panel, open, undefined, align);
  useDismiss(panel, open, onClose, anchor);
  return (
    <div ref={panel} className="menu tile-panel" role="dialog" aria-label={label} hidden={!open} data-no-drag>
      <p className="panel-title">{title}</p>
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
      {children}
    </div>
  );
}
