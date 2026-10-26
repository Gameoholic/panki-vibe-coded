import { createContext, useEffect, useRef, useState, type RefObject } from "react";

/**
 * A review whose clip fills the screen (the owner, 2026-10-25: "I usually always do them in full screen mode… a smaller
 * condensed version of the card"; "if I'm on full screen on a card, it won't exit full screen for the next card"):
 * the screen is filled by the whole review, not by one clip's player, so it stays filled as one card gives way to the
 * next. The card's clip takes the screen and the rest of the review stands in a rail at its right (A of
 * https://claude.ai/artifact/LJ8v6mgrDgiDhyQnh7Zpee, the owner's pick after trying it beside B, glass: "rail is
 * better"), which can be closed to leave the clip alone until the screen is next filled ("it will simply reappear if I
 * exit out of full screen and open it again"). Whether the screen is filled is this device's, kept across reviews: a
 * review opened hours later fills it again, at the first key or press when the browser won't fill it unasked.
 */

type Kept = { full: boolean };
const KEY = "panki.review.stage";
const DEFAULT: Kept = { full: false };

// A look and whether the card was open were kept beside `full` for a day while the owner tried a rail and glass; a
// browser that kept them keeps them unread.
function readKept(): Kept {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT;
    const { full } = parsed as Record<string, unknown>;
    return { full: typeof full === "boolean" ? full : DEFAULT.full };
  } catch {
    return DEFAULT;
  }
}
function writeKept(kept: Kept) {
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Nothing kept: the next review starts on the page, a press away from filling the screen.
  }
}

/** What a clip's player fills the screen with when something holds the screen for it (`MediaView`): the review's own. */
export type ScreenStage = { full: boolean; toggle: () => void };
export const ScreenStageContext = createContext<ScreenStage | null>(null);

/**
 * The stage for a review: `place` is the review's own element, which fills the screen and stays while its cards change;
 * `present` is whether it's there (a review at its end shows its tally instead, and extra study or an answer undone
 * there brings it back). Leaving the screen filled by the browser's way (Escape) is kept as leaving it; the review
 * ending, or being left, isn't: the end's tally leaves the screen (the owner, 2026-10-26: it "looks bad in the full
 * screen view"), and the next review, or the card an Undo there brings back, fills it again. `open` is whether the rail
 * is shown: closed, it stays closed until the screen is filled again.
 */
export function useScreenStage(place: RefObject<HTMLElement | null>, present: boolean) {
  const [full, setFull] = useState(false);
  const [open, setOpen] = useState(true);
  const keptNow = useRef(readKept());
  /** The element last seen filling the screen. React keeps the review's element for the end's tally, out of the ref but still filling the screen. */
  const filled = useRef<Element | null>(null);
  function keep(next: Kept) {
    keptNow.current = next;
    writeKept(next);
  }

  function enter() {
    const el = place.current;
    // A browser that won't (a phone that only lets a bare video fill the screen) leaves it as it is.
    void el?.requestFullscreen?.().catch(() => undefined);
  }
  function toggle() {
    if (place.current !== null && document.fullscreenElement === place.current) void document.exitFullscreen().catch(() => undefined);
    else enter();
  }

  useEffect(() => {
    function follow() {
      const el = place.current;
      const now = el !== null && document.fullscreenElement === el;
      setFull(now);
      // The rail closed is for this time the screen is filled: the next time, it's there again.
      if (!now) setOpen(true);
      // Left while the review is still here: the owner's choice, kept. Gone with the review's element: not a choice.
      if (now) {
        filled.current = el;
        keep({ full: true });
      } else if (el !== null && el.isConnected && keptNow.current.full) keep({ full: false });
    }
    document.addEventListener("fullscreenchange", follow);
    // At the end, the tally is drawn in the element that filled the screen: the screen is left, and it isn't a choice.
    if (!present && filled.current !== null && document.fullscreenElement === filled.current) void document.exitFullscreen().catch(() => undefined);
    // As it stands now: a screen the review's last element filled was left with it, unheard.
    const fullNow = place.current !== null && document.fullscreenElement === place.current;
    if (fullNow) filled.current = place.current;
    setFull(fullNow);
    // Filled when the last review was left so: asked for at once (allowed straight after the press that opened the
    // review), else at the first key or press here, which the browser lets fill the screen.
    let alive = true;
    let waiting = false;
    function retry() {
      waiting = false;
      window.removeEventListener("keydown", retry, true);
      window.removeEventListener("click", retry, true);
      if (keptNow.current.full && document.fullscreenElement === null) enter();
    }
    if (keptNow.current.full && document.fullscreenElement === null && place.current !== null) {
      void place.current.requestFullscreen?.().catch(() => {
        if (!alive) return;
        waiting = true;
        window.addEventListener("keydown", retry, true);
        window.addEventListener("click", retry, true);
      });
    }
    return () => {
      alive = false;
      document.removeEventListener("fullscreenchange", follow);
      if (waiting) {
        window.removeEventListener("keydown", retry, true);
        window.removeEventListener("click", retry, true);
      }
    };
    // Once each time the review's element comes: it stays while its cards change.
  }, [present]); // eslint-disable-line react-hooks/exhaustive-deps -- `place`, `keep` and `enter` read through refs

  return {
    screen: { full, toggle } satisfies ScreenStage,
    open,
    /** The rail closed, leaving the clip alone, until the screen is next filled. */
    close: () => setOpen(false),
  };
}
