import { useLayoutEffect, useRef, type RefObject } from "react";

/** How long the bar stays after the last scroll before it fades. */
export const BAR_STAYS_MS = 1000;
/**
 * How soon after a wheel, a finger or a key a scroll counts as the viewer's own. A scroll the page makes by itself (a
 * transcript following the line being said) moves the fades but never brings the bar up.
 */
const BY_HAND_MS = 1000;
/** Under this much more, an edge has nothing past it: a scroll position is a fraction of a pixel off at its ends. */
const SLACK = 1;

/**
 * Panki's own look for a box that scrolls inside itself, drawn on `edges` (`components/ScrollEdges.tsx`), the element
 * rendered right after the box: never the browser's own bar. The box is marked `data-scroll-edges`, which hides the
 * browser's bar; `edges` is laid over the box's padding box and told, as classes and variables, whether the box runs
 * over at all (`is-over`), which edges have more past them (`data-more`, "top bottom"), how far it's scrolled and how
 * much of it shows (`--scroll-at`, `--scroll-seen`, shares of its height), and whether the viewer is scrolling it
 * (`is-scrolling`, until `BAR_STAYS_MS` after the last scroll) or pulling its thumb (`is-dragging`). `app.css` draws the
 * rest. Whichever element the box's ref holds after each render is the one followed, so a box that comes and goes (a
 * menu opened and closed) is picked up as it comes.
 */
export function useScrollEdges(box: RefObject<HTMLElement | null>, edges: RefObject<HTMLElement | null>) {
  const held = useRef<{ el: HTMLElement; bar: HTMLElement; stop: () => void } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const bar = edges.current;
    if (held.current?.el === el && held.current.bar === bar) return;
    held.current?.stop();
    held.current = el && bar ? { el, bar, stop: follow(el, bar) } : null;
  });
  useLayoutEffect(
    () => () => {
      held.current?.stop();
      held.current = null;
    },
    [],
  );
}

/**
 * Follows one box onto its bar until the returned stop. Where the box stands is read again whenever it, its parent or
 * its contents change size, its style or class changes, the window is resized or anything scrolls, and as the pointer
 * comes onto it.
 */
function follow(el: HTMLElement, bar: HTMLElement): () => void {
  const thumb = bar.firstElementChild instanceof HTMLElement ? bar.firstElementChild : null;
  el.dataset.scrollEdges = "";
  let frame = 0;
  let quiet = 0;
  let byHand = -Infinity;

  /** Whether the box runs over, which edges have more past them, and the thumb's place: on every scroll. */
  const track = () => {
    const room = el.scrollHeight - el.clientHeight;
    const over = room > SLACK && el.getClientRects().length > 0;
    bar.classList.toggle("is-over", over);
    if (!over) return false;
    const top = el.scrollTop;
    bar.dataset.more = `${top > SLACK ? "top" : ""} ${top < room - SLACK ? "bottom" : ""}`.trim();
    bar.style.setProperty("--scroll-at", String(Math.min(1, Math.max(0, top / room))));
    bar.style.setProperty("--scroll-seen", String(el.clientHeight / el.scrollHeight));
    return true;
  };
  /**
   * Over the box's padding box, in whatever box the two are placed in: put by the box's own offsets, then moved by
   * however far that landed from the box (a containing block other than the box's offset parent: a transform on the
   * way, or a menu fixed to the window). Its corners and its layer are the box's own, so its fades round with it and
   * stand over it.
   */
  const measure = () => {
    frame = 0;
    if (!track()) return;
    const style = getComputedStyle(el);
    bar.style.borderRadius = style.borderRadius;
    bar.style.zIndex = style.zIndex;
    bar.style.width = `${el.clientWidth}px`;
    bar.style.height = `${el.clientHeight}px`;
    let top = el.offsetTop + el.clientTop;
    let left = el.offsetLeft + el.clientLeft;
    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
    const at = el.getBoundingClientRect();
    const landed = bar.getBoundingClientRect();
    const dy = at.top + el.clientTop - landed.top;
    const dx = at.left + el.clientLeft - landed.left;
    if (Math.abs(dy) > 0.5 || Math.abs(dx) > 0.5) {
      top += dy;
      left += dx;
      bar.style.top = `${top}px`;
      bar.style.left = `${left}px`;
    }
  };
  const soon = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  const onScroll = () => {
    track();
    soon();
    const showing = bar.classList.contains("is-scrolling");
    if (!showing && performance.now() - byHand > BY_HAND_MS) return;
    bar.classList.add("is-scrolling");
    clearTimeout(quiet);
    quiet = window.setTimeout(() => bar.classList.remove("is-scrolling"), BAR_STAYS_MS);
  };
  const onHand = () => {
    byHand = performance.now();
  };

  // The thumb pulled: the box scrolled by as much of its length as the thumb moved along its track.
  const onGrab = (e: PointerEvent) => {
    if (!thumb || e.button !== 0) return;
    e.preventDefault();
    thumb.setPointerCapture(e.pointerId);
    bar.classList.add("is-dragging");
    const from = e.clientY;
    const start = el.scrollTop;
    const onMove = (m: PointerEvent) => {
      onHand();
      const along = bar.clientHeight - thumb.offsetHeight;
      el.scrollTop = start + ((m.clientY - from) * (el.scrollHeight - el.clientHeight)) / Math.max(1, along);
    };
    const onLet = () => {
      bar.classList.remove("is-dragging");
      thumb.removeEventListener("pointermove", onMove);
      thumb.removeEventListener("pointerup", onLet);
      thumb.removeEventListener("pointercancel", onLet);
    };
    thumb.addEventListener("pointermove", onMove);
    thumb.addEventListener("pointerup", onLet);
    thumb.addEventListener("pointercancel", onLet);
  };
  // A press on the thumb is the thumb's: the card or the chart under it doesn't take it as pressed.
  const onThumbClick = (e: MouseEvent) => e.stopPropagation();

  const sized = new ResizeObserver(soon);
  const watch = () => {
    sized.disconnect();
    sized.observe(el);
    if (el.parentElement) sized.observe(el.parentElement);
    for (const child of el.children) sized.observe(child);
  };
  watch();
  const changed = new MutationObserver((records) => {
    if (records.some((record) => record.type === "childList")) watch();
    soon();
  });
  changed.observe(el, { childList: true, attributes: true, attributeFilter: ["style", "class"] });

  const passive = { passive: true } as const;
  el.addEventListener("scroll", onScroll, passive);
  el.addEventListener("wheel", onHand, passive);
  el.addEventListener("touchmove", onHand, passive);
  el.addEventListener("keydown", onHand, passive);
  el.addEventListener("pointerenter", soon);
  thumb?.addEventListener("pointerdown", onGrab);
  thumb?.addEventListener("click", onThumbClick);
  window.addEventListener("resize", soon);
  window.addEventListener("scroll", soon, { capture: true, passive: true });
  measure();

  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(quiet);
    sized.disconnect();
    changed.disconnect();
    el.removeEventListener("scroll", onScroll);
    el.removeEventListener("wheel", onHand);
    el.removeEventListener("touchmove", onHand);
    el.removeEventListener("keydown", onHand);
    el.removeEventListener("pointerenter", soon);
    thumb?.removeEventListener("pointerdown", onGrab);
    thumb?.removeEventListener("click", onThumbClick);
    window.removeEventListener("resize", soon);
    window.removeEventListener("scroll", soon, { capture: true });
    delete el.dataset.scrollEdges;
    bar.classList.remove("is-over", "is-scrolling", "is-dragging");
  };
}
