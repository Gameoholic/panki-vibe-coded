import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes something that opened under a button when a press lands outside it, or Escape is pressed. The press is
 * judged by the path it took, not its target: inside a shadow root (the extension's places on a page) the target seen
 * from the window is the root's host, and every press would read as one outside. A closed shadow root goes further
 * and hides its insides from a listener on the window altogether, so the press is heard twice: on the element's own
 * root (the shadow root, or the document), where the path is whole, and on the window for presses anywhere else on
 * the page, where a path through the host is left to the first. (2026-10-17: the strip's menu closed itself on every
 * press inside it until this, and "Forget a part…" seemed to do nothing.) The app's `Dropdown` and the extension's
 * menus are all this; never a second way of closing on a press outside.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void) {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    const element = ref.current;
    if (!element) return;
    const root = element.getRootNode();
    const host = root instanceof ShadowRoot ? root.host : null;
    const outside = (e: Event) => !e.composedPath().includes(element);
    const onDownInside = (e: Event) => {
      if (outside(e)) latest.current();
    };
    const onDownOutside = (e: Event) => {
      if (host && e.composedPath().includes(host)) return;
      if (outside(e)) latest.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current();
    };
    root.addEventListener("pointerdown", onDownInside);
    window.addEventListener("pointerdown", onDownOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("pointerdown", onDownInside);
      window.removeEventListener("pointerdown", onDownOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [ref, open]);
}
