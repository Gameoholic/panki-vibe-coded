/** @panki Rows lifted to the top of a list while they wait on something, sliding there and back (`useHoist`, `goTo`). Never a second way of reordering rows by themselves. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** What `useHoist` gives back: the order to draw the rows in, the box's ref, and a way to go to a row. */
export type Hoist = {
  order: readonly string[];
  /** On the box whose direct children are the rows, each marked `data-hoist` with its key. */
  ref: (box: HTMLElement | null) => void;
  /** The box that scrolls round the row brought to it (that box alone, never the page around it), then the row lit for a moment (`.is-lit`). */
  go: (key: string) => void;
};

/**
 * Rows lifted to the top of a list while they're waiting on something, each sliding from where it stood to where it
 * goes: the capture drawer's fields while a Touch up proposal waits under them, and the explainer that plays it.
 *
 * `all` is every row's key in its own order, `up` the keys to lift; `order` is `up`'s in `all`'s order, then the rest
 * in theirs. Every child of the box is slid as the order changes (FLIP), the ones with no key too, so nothing under the
 * rows jumps. A row holding the focus never moves while it holds it, so nobody typing loses their place: it goes where
 * it belongs once the focus leaves.
 */
export function useHoist(all: readonly string[], up: readonly string[]): Hoist {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const lastShown = useRef<readonly string[]>([]);
  const lifted = new Set(up);
  const wanted = [...all.filter((key) => lifted.has(key)), ...all.filter((key) => !lifted.has(key))];
  const at = held === null ? -1 : lastShown.current.indexOf(held);
  const order = held !== null && at >= 0 && wanted.includes(held) ? holdAt(wanted, held, at) : wanted;
  const said = order.join("\n");

  // The row the focus is in, heard as it comes and goes. Whether it's really gone is asked a moment later, since a
  // focused element that's moved, or taken off the page with its note, may say nothing as it goes.
  const focused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!box) return;
    const rowOf = (target: EventTarget | null) => {
      const row = target instanceof Element ? target.closest<HTMLElement>("[data-hoist]") : null;
      return row && row.parentElement === box ? row : null;
    };
    const onIn = (event: FocusEvent) => {
      const row = rowOf(event.target);
      focused.current = row && event.target instanceof HTMLElement ? event.target : null;
      setHeld(row?.dataset.hoist ?? null);
    };
    const onOut = () => {
      window.setTimeout(() => {
        if (rowOf(activeIn(box))) return;
        focused.current = null;
        setHeld(null);
      }, 0);
    };
    box.addEventListener("focusin", onIn);
    box.addEventListener("focusout", onOut);
    return () => {
      box.removeEventListener("focusin", onIn);
      box.removeEventListener("focusout", onOut);
    };
  }, [box]);
  // A held row whose focus went without a word: let go.
  useEffect(() => {
    if (held === null || !box) return;
    const row = rowByKey(box, held);
    const active = activeIn(box);
    if (!row || !active || !row.contains(active)) setHeld(null);
  });

  // Every child's top as it stood at the last draw, so a change of order slides each from there to its new place.
  const tops = useRef(new Map<Element, number>());
  const lastSaid = useRef(said);
  const settling = useRef(0);
  useLayoutEffect(() => {
    if (!box) return;
    const now = topsIn(box);
    if (said !== lastSaid.current && !reduced()) {
      // A focused element moved round the page can lose its focus: it's given back where it stands now.
      const was = focused.current;
      if (was && was.isConnected && box.contains(was) && activeIn(box) !== was) was.focus({ preventScroll: true });
      const moving: HTMLElement[] = [];
      for (const [row, to] of now) {
        const from = tops.current.get(row);
        if (!(row instanceof HTMLElement) || from === undefined || Math.abs(from - to) < 1) continue;
        row.style.transition = "none";
        row.style.transform = `translateY(${from - to}px)`;
        moving.push(row);
      }
      if (moving.length > 0) {
        void box.offsetHeight;
        for (const row of moving) {
          row.style.transition = `transform ${HOIST_MS}ms ${HOIST_EASE}`;
          row.style.transform = "";
        }
        const turn = ++settling.current;
        window.setTimeout(() => {
          if (settling.current !== turn) return;
          for (const row of moving) row.style.transition = "";
        }, HOIST_MS + 20);
      }
    }
    lastSaid.current = said;
    lastShown.current = order;
    tops.current = now;
  });
  // What's above a row can grow or shrink between draws (a fold opening): the tops are taken again as the box changes size.
  useEffect(() => {
    if (!box) return;
    const observer = new ResizeObserver(() => {
      tops.current = topsIn(box);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);

  const go = useCallback((key: string) => goToRow(box, key), [box]);
  return { order, ref: setBox, go };
}

/** How long a row takes to slide to its new place, and how it eases: one home. */
const HOIST_MS = 420;
const HOIST_EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/** How long a row stays lit once it's gone to: `.is-lit`'s animation (`app.css`, "The capture drawer's fields"). */
const LIT_MS = 1500;
/** How far above a row gone to it stands, so its lit outline isn't cut off by the scroller's edge. */
const GO_ABOVE = 16;

/** `order` with `key` kept at `index`, the rest in their order around it. */
function holdAt(order: readonly string[], key: string, index: number): readonly string[] {
  const rest = order.filter((each) => each !== key);
  rest.splice(Math.min(index, rest.length), 0, key);
  return rest;
}

/**
 * Each child's top within the box as laid out: by its offset, which no transform touches, neither the slide it's in
 * just now nor a scale on something round the box (the explainers draw the drawer scaled to their window).
 */
function topsIn(box: HTMLElement): Map<Element, number> {
  return new Map(
    [...box.children]
      .filter((row): row is HTMLElement => row instanceof HTMLElement)
      .map((row) => [row, row.offsetTop - (row.offsetParent === box ? 0 : box.offsetTop)]),
  );
}

/** What has the focus where the box is drawn: the page, or the shadow root it stands in. */
function activeIn(box: Element): Element | null {
  const root = box.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null;
}

function rowByKey(box: Element, key: string): HTMLElement | null {
  return [...box.children].find((row): row is HTMLElement => row instanceof HTMLElement && row.dataset.hoist === key) ?? null;
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The next box up that scrolls, within the root the element is drawn in (the page, or one of Panki's shadow roots).
 * Never past it: a place of Panki's that stands in another's (the drawer in the column beside the video) is slotted into
 * a closed shadow root, whose scroller can't be seen from here, and a box of the site's found further up would be the
 * wrong one to scroll. Null when there's none to be seen.
 */
function scrollerOf(el: Element): HTMLElement | null {
  let at: Node | null = el.parentNode;
  while (at && !(at instanceof ShadowRoot)) {
    if (at instanceof HTMLElement) {
      const { overflowY } = getComputedStyle(at);
      if ((overflowY === "auto" || overflowY === "scroll") && at.scrollHeight > at.clientHeight) return at;
    }
    at = at.parentNode;
  }
  return null;
}

function goToRow(box: HTMLElement | null, key: string) {
  const row = box ? rowByKey(box, key) : null;
  if (row) goTo(row);
}

/**
 * The one way to something a press names (a round's chip going to its field, the field's name on a follow-up, the
 * word's "Meanings" chip going to its rows): its scroller brought to it, then it lit for a moment (`.is-lit`). The
 * scroll is Panki's own, aimed afresh every frame at where it stands now, so a fold closing above it or a row sliding as
 * it goes doesn't leave it short (the browser's smooth scroll aims once, and was left short); it lands exactly, and stops
 * at once if the scroller is moved by hand meanwhile. Where its scroller can't be seen from here (the drawer in the
 * column beside the video, a closed shadow root round it), the browser brings it into view the least it can, which
 * reaches through every box round it, and it's lit once that's had its time.
 */
export function goTo(row: HTMLElement) {
  const turn = (lighting.get(row) ?? 0) + 1;
  lighting.set(row, turn);
  const light = () => {
    if (lighting.get(row) !== turn) return;
    row.classList.remove("is-lit");
    void row.offsetWidth;
    row.classList.add("is-lit");
    window.setTimeout(() => {
      if (lighting.get(row) === turn) row.classList.remove("is-lit");
    }, LIT_MS);
  };
  const scroller = scrollerOf(row);
  if (!scroller) {
    row.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
    window.setTimeout(light, reduced() ? 0 : GO_MS);
    return;
  }
  const target = () => {
    const room = scroller.scrollHeight - scroller.clientHeight;
    return Math.min(room, Math.max(0, row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - GO_ABOVE));
  };
  const from = scroller.scrollTop;
  const span = reduced() ? 0 : Math.min(GO_MS, 120 + Math.abs(target() - from) / 4);
  const start = performance.now();
  let set = from;
  const step = (now: number) => {
    if (lighting.get(row) !== turn) return;
    // Moved by hand since the last frame: the scroll is theirs now, and the row is lit where it stands.
    if (Math.abs(scroller.scrollTop - set) > 2) {
      light();
      return;
    }
    const t = span === 0 ? 1 : Math.min(1, (now - start) / span);
    const eased = 1 - Math.pow(1 - t, 3);
    set = Math.round(from + (target() - from) * eased);
    scroller.scrollTop = set;
    set = scroller.scrollTop;
    if (t < 1) requestAnimationFrame(step);
    else light();
  };
  requestAnimationFrame(step);
}
/** Each row's latest going-to, so an earlier one's scroll and timers leave a later one alone. */
const lighting = new WeakMap<HTMLElement, number>();
/** The longest a scroll to a row takes; a short way takes less. */
const GO_MS = 420;
