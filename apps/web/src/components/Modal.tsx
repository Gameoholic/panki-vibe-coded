import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  /** The id of the element inside that asks the question; it names the dialog. */
  labelledBy: string;
  /** Escape, or a press on the dimmed page: the answer that changes nothing. */
  onClose: () => void;
  children: ReactNode;
};

/**
 * A question that can't wait, over the dimmed page: only for stopping something already under way, like leaving a
 * screen with unsaved changes. Anything the owner opens on purpose is a panel anchored to what opened it instead.
 */
export function Modal({ labelledBy, onClose, children }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="modal-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={boxRef} className="panel modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}
