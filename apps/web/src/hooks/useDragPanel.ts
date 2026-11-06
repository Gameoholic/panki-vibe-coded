import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/**
 * A panel laid over the screen (`FloatPanel`): where it stands and whether it's folded, kept on this device under a key
 * of its own. On a computer it's dragged anywhere by its header and kept inside the window; unplaced, it's docked at the
 * right under the screen's header. On a phone (the app's one breakpoint) it's a sheet at the foot of the screen, its
 * header pulled up to open it and down to fold it, folded to begin with.
 */

/** The app's one phone breakpoint (`app.css`). */
const PHONE = "(max-width: 640px)";
/** The least room kept between the panel and the window's edges, and from the screen's header when docked. */
const EDGE = 8;
/** How far a header pulled on a phone goes before it opens or folds the sheet; less is a tap, which turns it over. */
const PULL_PX = 24;
/** How far a press on the header moves before it's a drag rather than a press. */
const DRAG_PX = 4;

/** What's kept: where it was put (null while docked), and whether it's folded on a computer and open on a phone. */
type Kept = { x: number | null; y: number | null; folded: boolean; sheetOpen: boolean };
const DEFAULT: Kept = { x: null, y: null, folded: false, sheetOpen: false };

function readKept(key: string): Kept {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return DEFAULT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT;
    const { x, y, folded, sheetOpen } = parsed as Record<string, unknown>;
    const place = typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y);
    return {
      x: place ? x : null,
      y: place ? y : null,
      folded: typeof folded === "boolean" ? folded : DEFAULT.folded,
      sheetOpen: typeof sheetOpen === "boolean" ? sheetOpen : DEFAULT.sheetOpen,
    };
  } catch {
    return DEFAULT;
  }
}
function writeKept(key: string, kept: Kept) {
  try {
    localStorage.setItem(key, JSON.stringify(kept));
  } catch {
    // Nothing kept: it stands docked next time, which is a drag away from where it was.
  }
}

function subscribePhone(listener: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const onPhone = () => window.matchMedia(PHONE).matches;

/** Where the panel docks under the screen's header: the top of the screen's body as it stands, or the window's edge without one. */
function dockTop(): number {
  const body = document.querySelector(".main");
  // Where it stands on the page unscrolled, so the page scrolling never moves a docked panel.
  const top = (body?.getBoundingClientRect().top ?? 0) + window.scrollY;
  return Math.max(EDGE, Math.round(top) + EDGE);
}

/** Where a drag started: the pointer, and where the panel stood. */
type Held = { id: number; x: number; y: number; left: number; top: number; moved: boolean };

export function useDragPanel(key: string, panel: RefObject<HTMLElement | null>, head: RefObject<HTMLElement | null>) {
  const [kept, setKept] = useState<Kept>(() => readKept(key));
  const phone = useSyncExternalStore(subscribePhone, onPhone);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState({ w: 0, head: 0 });
  const [docked, setDocked] = useState(dockTop);
  const held = useRef<Held | null>(null);
  /** On a phone, how far the header has been pulled from where it was pressed. */
  const pull = useRef<{ id: number; y: number } | null>(null);

  function keep(next: Kept) {
    setKept(next);
    writeKept(key, next);
  }

  useEffect(() => {
    const onResize = () => {
      setView({ w: window.innerWidth, h: window.innerHeight });
      setDocked(dockTop());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // Its width and its header's height, so it's held inside the window whatever it's given; and where it docks, which
  // moves as the screen's header comes in.
  useLayoutEffect(() => {
    const w = panel.current?.offsetWidth ?? 0;
    const h = head.current?.offsetHeight ?? 0;
    if (w !== size.w || h !== size.head) setSize({ w, head: h });
    const dock = dockTop();
    if (dock !== docked) setDocked(dock);
  });

  /** A place held inside the window: the whole header always there to take hold of. */
  const clamp = (x: number, y: number) => ({
    x: Math.round(Math.max(EDGE, Math.min(x, view.w - size.w - EDGE))),
    y: Math.round(Math.max(EDGE, Math.min(y, view.h - size.head - EDGE))),
  });
  const placed = kept.x !== null && kept.y !== null ? clamp(kept.x, kept.y) : null;
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const at = drag ?? placed;

  /** The header pressed: a drag on a computer, a pull on a phone; a press on one of its buttons is the button's. */
  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || (e.target instanceof Element && e.target.closest("button") !== null)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (phone) {
      pull.current = { id: e.pointerId, y: e.clientY };
      return;
    }
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    held.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: box.left, top: box.top, moved: false };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const h = held.current;
    if (!h || h.id !== e.pointerId) return;
    const dx = e.clientX - h.x;
    const dy = e.clientY - h.y;
    if (!h.moved && Math.abs(dx) + Math.abs(dy) < DRAG_PX) return;
    h.moved = true;
    setDrag(clamp(h.left + dx, h.top + dy));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const p = pull.current;
    if (p && p.id === e.pointerId) {
      pull.current = null;
      const dy = e.clientY - p.y;
      // Pulled up it opens, down it folds; a tap turns it over.
      const open = dy < -PULL_PX ? true : dy > PULL_PX ? false : !kept.sheetOpen;
      if (open !== kept.sheetOpen) keep({ ...kept, sheetOpen: open });
      return;
    }
    const h = held.current;
    if (!h || h.id !== e.pointerId) return;
    held.current = null;
    if (h.moved && drag) keep({ ...kept, x: drag.x, y: drag.y });
    setDrag(null);
  }
  function onPointerCancel() {
    held.current = null;
    pull.current = null;
    setDrag(null);
  }

  return {
    phone,
    /** Folded to its header: on a phone, the sheet closed. */
    folded: phone ? !kept.sheetOpen : kept.folded,
    toggle: () => (phone ? keep({ ...kept, sheetOpen: !kept.sheetOpen }) : keep({ ...kept, folded: !kept.folded })),
    dragging: drag !== null,
    /** Where it stands on a computer: put somewhere, or docked at the right under the screen's header. */
    style: phone ? undefined : at ? { left: `${at.x}px`, top: `${at.y}px` } : { right: `${EDGE * 2}px`, top: `${docked}px` },
    /** How tall it may stand on a computer, from where it stands to the window's foot. */
    room: phone ? null : Math.max(size.head, view.h - (at?.y ?? docked) - EDGE),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
