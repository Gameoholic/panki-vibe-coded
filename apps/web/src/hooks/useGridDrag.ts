import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

type Options = {
  /** The lifted tile was let go over another. What that does (the two swap, or the rest shift along) is the caller's. */
  onMove: (fromId: string, toId: string) => void;
  /** A press has become a drag. */
  onStart?: (id: string) => void;
  /** How long a press that stays still takes to lift, in ms. */
  hold: number;
  /**
   * A press that moves lifts at once, and the tile is under the pointer from there. Without it a move before the hold
   * is up is a scroll, and the press is let go. A finger only ever lifts this way on a tile that has given up
   * scrolling (`touch-action: none`), since anywhere else its move belongs to the page.
   */
  eager?: boolean;
  enabled?: boolean;
};

type Press = { id: string; el: HTMLElement; pointerId: number; x: number; y: number; lastX: number; lastY: number; slides: boolean; timer: ReturnType<typeof setTimeout> | null };
/** Where a tile lay on the page when the drag began: where the pointer has to be to mean it. */
type Slot = { id: string; left: number; top: number; right: number; bottom: number };
/** The copy of the lifted tile that follows the pointer: where it was gripped, and where its "fixed" is measured from. */
type Ghost = { el: HTMLElement; gripX: number; gripY: number; originX: number; originY: number };

/** A press that drifts further than this has become a move: a drag where a move lifts, a scroll where it doesn't. */
const SLACK = 6;
/** How long the others take to slide out of the way, and the carried tile to come down where it lands. */
const SLIDE_MS = 180;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** The carried tile is drawn a touch larger than it lies. */
const LIFT_SCALE = 1.03;

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where an element lies on the page, whatever the scroll. */
function slotOf(id: string, el: Element): Slot {
  const r = el.getBoundingClientRect();
  return { id, left: r.left + window.scrollX, top: r.top + window.scrollY, right: r.right + window.scrollX, bottom: r.bottom + window.scrollY };
}
const within = (slot: Slot, x: number, y: number) => x >= slot.left && x <= slot.right && y >= slot.top && y <= slot.bottom;

/**
 * A copy of the tile to carry: the same markup, so it looks exactly like what was picked up, put beside the tile so
 * every style still reaches it, and taken out of the page's flow. It answers to nothing: no ids, inert, no pointer.
 */
function makeGhost(tile: HTMLElement, x: number, y: number): Ghost | null {
  const copy = tile.cloneNode(true);
  if (!(copy instanceof HTMLElement) || !tile.parentElement) return null;
  const rect = tile.getBoundingClientRect();
  for (const el of [copy, ...copy.querySelectorAll("[id]")]) el.removeAttribute("id");
  copy.removeAttribute("data-id");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  copy.classList.add("tile-ghost");
  Object.assign(copy.style, { position: "fixed", left: "0", top: "0", margin: "0", width: `${rect.width}px`, height: `${rect.height}px`, pointerEvents: "none" });
  tile.parentElement.append(copy);
  // "Fixed" is measured from the window unless something above has made itself the frame; wherever it starts, start there.
  const origin = copy.getBoundingClientRect();
  return { el: copy, gripX: x - rect.left, gripY: y - rect.top, originX: origin.left, originY: origin.top };
}
function carry(ghost: Ghost, x: number, y: number) {
  ghost.el.style.transform = `translate(${x - ghost.gripX - ghost.originX}px, ${y - ghost.gripY - ghost.originY}px) scale(${LIFT_SCALE})`;
}

/**
 * Drag a tile across a grid, with a mouse or a finger alike (pointer events: Android Chrome starts no native drag
 * from a touch). Spread `rootProps` on the element that holds the tiles; every tile carries `data-id`, and anything
 * inside the root that must never start a drag (a tile's ×) carries `data-no-drag`.
 *
 * The tile really is carried: a copy of it follows the pointer, and `lifted` and `over` say what is held and what it
 * is over, so the caller can draw the board as letting go right now would leave it; the tile itself (`is-lift`) then
 * lies faint where it will land, and whatever moved to make room slides there. What it is over is read from where
 * the tiles lay when the drag began, never from where they've slid to since, so a tile that moves out of the way
 * can't slide back under the pointer and start the two trading places for ever. Let go, the copy comes down onto the
 * tile and `onMove` is called once; between tiles or off the board, what's shown is what's kept.
 *
 * The click that follows a lift is swallowed, so a held door never opens.
 */
export function useGridDrag({ onMove, onStart, hold, eager = false, enabled = true }: Options) {
  const root = useRef<HTMLElement | null>(null);
  const press = useRef<Press | null>(null);
  const live = useRef<{ lifted: string | null; over: string | null }>({ lifted: null, over: null });
  const ghost = useRef<Ghost | null>(null);
  /** Where every tile lay when the drag began, the lifted one among them. */
  const slots = useRef<Slot[]>([]);
  /** Where everything stood just before the order changed, to slide each thing from there to where it stands after. */
  const before = useRef<Map<HTMLElement, DOMRect> | null>(null);
  const slides = useRef(new WeakMap<Element, Animation>());
  /** Let go, and the copy hasn't come down yet: nothing new is picked up meanwhile. */
  const settling = useRef(false);
  /** The tile whose copy comes down after the next render, once the board stands as it will. */
  const toLand = useRef<string | null>(null);
  const swallow = useRef(false);
  const alive = useRef(true);
  const [lifted, setLifted] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Letting go where nothing changes sets no state of its own; this makes sure the render that lands the copy happens.
  const [, setLandings] = useState(0);
  const latest = useRef({ onMove, onStart, hold, eager, enabled });
  latest.current = { onMove, onStart, hold, eager, enabled };

  // The page must not scroll under a lifted tile. React's touch listeners are passive, so this one is added by hand.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (live.current.lifted !== null && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (press.current?.timer) clearTimeout(press.current.timer);
      ghost.current?.el.remove();
      ghost.current = null;
    };
  }, []);

  function clearPress() {
    const p = press.current;
    if (p?.timer) clearTimeout(p.timer);
    press.current = null;
  }
  function set(next: { lifted: string | null; over: string | null }) {
    live.current = next;
    setLifted(next.lifted);
    setOver(next.over);
  }
  const tiles = () => [...(root.current?.querySelectorAll<HTMLElement>("[data-id]") ?? [])];
  function remember() {
    before.current = new Map(tiles().map((tile) => [tile, tile.getBoundingClientRect()]));
  }

  function lift(p: Press) {
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    const el = root.current;
    if (!el) return;
    try {
      // The root, not the tile: the tile may move in the page as the board rearranges under the pointer.
      el.setPointerCapture(p.pointerId);
    } catch {
      // The pointer is already gone; the drag ends on its own.
    }
    slots.current = tiles().flatMap((tile) => (tile.dataset.id ? [slotOf(tile.dataset.id, tile)] : []));
    ghost.current = makeGhost(p.el, p.x, p.y);
    if (ghost.current) carry(ghost.current, p.lastX, p.lastY);
    set({ lifted: p.id, over: null });
    latest.current.onStart?.(p.id);
  }
  function finish(commit: boolean) {
    const { lifted: from, over: to } = live.current;
    clearPress();
    if (from === null || settling.current) return;
    settling.current = true;
    // The click follows the release at once; when none does (a finger's tap after a drag is dropped by the browser), the next one must not pay for it.
    swallow.current = true;
    setTimeout(() => {
      swallow.current = false;
    }, 300);
    // Kept: the board already stands as it was shown, so nothing moves but the copy. Called off: what was shown slides back.
    if (commit && to !== null) latest.current.onMove(from, to);
    else if (to !== null) remember();
    toLand.current = from;
    set({ lifted: from, over: null });
    setLandings((n) => n + 1);
  }
  /** The copy comes down onto its tile and is gone; the tile is itself again. */
  function land(at: DOMRect | null, quiet: boolean) {
    const g = ghost.current;
    const done = () => {
      g?.el.remove();
      if (ghost.current === g) ghost.current = null;
      settling.current = false;
      if (alive.current) set({ lifted: null, over: null });
    };
    if (!g || !at || quiet) {
      done();
      return;
    }
    const down = `translate(${at.left - g.originX}px, ${at.top - g.originY}px)`;
    g.el.animate([{ transform: g.el.style.transform }, { transform: down }], { duration: SLIDE_MS, easing: EASE, fill: "forwards" }).finished.then(done, done);
  }

  // After the order changed: everything that moved slides from where it stood to where it stands, and a copy that
  // was let go comes down onto its tile.
  useLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    const landing = toLand.current;
    toLand.current = null;
    if (!was && landing === null) return;
    const quiet = still();
    // A slide still under way would give its half-way place; where a thing lies is read with it stopped.
    const placeOf = (el: Element) => {
      slides.current.get(el)?.cancel();
      return el.getBoundingClientRect();
    };
    const home = landing === null ? undefined : tiles().find((tile) => tile.dataset.id === landing);
    const landAt = home ? placeOf(home) : null;
    if (was && !quiet) {
      for (const [el, from] of was) {
        if (!el.isConnected) continue;
        const to = placeOf(el);
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        slides.current.set(el, el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: SLIDE_MS, easing: EASE }));
      }
    }
    if (landing !== null) land(landAt, quiet);
  });

  const rootProps = {
    ref(el: HTMLElement | null) {
      root.current = el;
    },
    className: lifted !== null ? "is-dragging" : "",
    onPointerDown(e: PointerEvent<HTMLElement>) {
      const { enabled: on, hold: wait, eager: quick } = latest.current;
      if (!on || e.button !== 0 || ghost.current || !(e.target instanceof Element)) return;
      if (e.target.closest("[data-no-drag]")) return;
      const tile = e.target.closest<HTMLElement>("[data-id]");
      if (!tile || !e.currentTarget.contains(tile)) return;
      const id = tile.dataset.id;
      if (!id) return;
      clearPress();
      const slides = quick && (e.pointerType !== "touch" || getComputedStyle(tile).touchAction === "none");
      const p: Press = { id, el: tile, pointerId: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, slides, timer: null };
      press.current = p;
      p.timer = setTimeout(() => lift(p), wait);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      if (!p || settling.current) return;
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      if (live.current.lifted === null) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= SLACK) return;
        if (p.slides) lift(p);
        else clearPress();
        return;
      }
      if (ghost.current) carry(ghost.current, e.clientX, e.clientY);
      const x = e.clientX + window.scrollX;
      const y = e.clientY + window.scrollY;
      // Back over where it was picked up is "as it was"; between tiles or off the board, what's shown stays.
      const hit = slots.current.find((slot) => within(slot, x, y));
      if (!hit) return;
      const next = hit.id === p.id ? null : hit.id;
      if (next === live.current.over) return;
      remember();
      set({ ...live.current, over: next });
    },
    onPointerUp() {
      finish(true);
    },
    onPointerCancel() {
      finish(false);
    },
    // A long press would open the browser's own menu on a phone; a press that may lift is ours.
    onContextMenu(e: MouseEvent<HTMLElement>) {
      if (press.current || live.current.lifted !== null) e.preventDefault();
    },
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (!swallow.current) return;
      swallow.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return {
    rootProps,
    /** The id being carried, until its copy has come down. */
    lifted,
    /** The id it would be dropped on if let go now; null over nothing, or back where it was picked up. */
    over,
    /** `is-lift` on the tile being carried: it lies faint where it will land while its copy follows the pointer. */
    tileClass: (id: string) => (lifted === id ? "is-lift" : ""),
    /** The lifted tile keeps the finger: no scrolling from it while it's held. */
    tileStyle: (id: string): CSSProperties | undefined => (lifted === id ? { touchAction: "none" } : undefined),
  };
}
