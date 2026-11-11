/** @panki A key held on a button until it does its thing, a tap told from a hold (`useHold`, `keepTap`, `keepDouble`, `TAP_MS`, `DOUBLE_MS`). */
import { useEffect, useRef } from "react";
import { DOUBLE_PRESS, isModifier, pressed } from "../keys";

/** How long a hold let go early takes to go back to nothing. */
const LET_GO_MS = 160;

/**
 * Keys a tap of which does something right now, as each listener has them (`useHeardKeys`: a player's Space tapped,
 * while there's a clip to play), by how many: a hold of the same key on the same screen can't yet tell itself from
 * that tap as it goes down, so it stays still for its first moment (`TAP_MS`), and a tap shows no hold beginning
 * (a key pressed and let go at once never looks like a hold). Any key,
 * any hold: nothing here knows which.
 */
const liveTaps = new Map<string, number>();
/** Notes a key whose tap does something right now; what it gives back lets go of it. */
export function keepTap(key: string): () => void {
  liveTaps.set(key, (liveTaps.get(key) ?? 0) + 1);
  return () => {
    const left = (liveTaps.get(key) ?? 1) - 1;
    if (left > 0) liveTaps.set(key, left);
    else liveTaps.delete(key);
  };
}
const tapLive = (e: KeyboardEvent) => [...liveTaps.keys()].some((key) => pressed(e, key));
/**
 * The one line between a tap and a hold of a key that's both: let go sooner, it's the tap;
 * held past it, the hold's ring begins to fill, and letting go then is a hold let go early, which does nothing. So the
 * ring showing always means a hold. The hold itself still takes as long as it's set to (every hold is longer than this).
 * 0.2 s, long enough for a quick tap.
 */
export const TAP_MS = 200;
/**
 * A second press of a key this soon after the first is a double press (`keys.ts` → `DOUBLE_PRESS`, any key set to
 * it); a press of a key whose double press does something waits this long before it's a press.
 */
export const DOUBLE_MS = 300;

/** Keys a double press of which does something right now, by how many listen for it (`keepDouble`): a press of one waits `DOUBLE_MS`. */
const liveDoubles = new Map<string, number>();
/** Notes a key whose double press does something right now; what it gives back lets go of it. */
export function keepDouble(key: string): () => void {
  liveDoubles.set(key, (liveDoubles.get(key) ?? 0) + 1);
  return () => {
    const left = (liveDoubles.get(key) ?? 1) - 1;
    if (left > 0) liveDoubles.set(key, left);
    else liveDoubles.delete(key);
  };
}
const doubleLive = (e: KeyboardEvent) => [...liveDoubles.keys()].some((key) => pressed(e, key));

/**
 * Shift, Ctrl or Alt down by itself (`keys.ts` → `isModifier`): each one down now, and whether it
 * still is its own press, nothing else having gone down since (Ctrl+Z is Z's, never Ctrl's). Heard on the window before
 * anything else (capture), and let go of just after its key goes up, so whoever hears that can still ask.
 */
const modifiersDown = new Map<string, boolean>();
if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (e) => {
      const named = e.key.toLowerCase();
      for (const key of modifiersDown.keys()) if (key !== named) modifiersDown.set(key, false);
      if (isModifier(e.key) && !e.repeat) modifiersDown.set(named, true);
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (e) => {
      const named = e.key.toLowerCase();
      if (isModifier(e.key)) window.setTimeout(() => modifiersDown.delete(named), 0);
    },
    true,
  );
}
/** Whether Shift, Ctrl or Alt is its own press: down (or just let go) with nothing else pressed meanwhile. */
const ownModifier = (key: string) => modifiersDown.get(key.toLowerCase()) === true;

/**
 * A key held on a button until it does its thing (`keys.ts`, a bind to hold): how far along, 0 to 1, is written on the
 * button as `--hold` each frame, and what draws it is the CSS's (its keycap, `.key.is-hold`). Let go early, it eases back and nothing
 * happens; the window losing the focus lets go too. One hold at a time. The review is the pattern.
 */
export function useHold() {
  const current = useRef<{ key: string; el: HTMLElement; raf: number; stop: () => void } | null>(null);
  const easing = useRef(new Map<HTMLElement, number>());
  /** When each key's double press began here, by the key: its second press within `DOUBLE_MS` is the double. */
  const firsts = useRef(new Map<string, number>());
  /** Presses here waiting out a double press of their key, by the key: a second press calls one off. */
  const waiting = useRef(new Map<string, number>());

  const set = (el: HTMLElement, share: number) => el.style.setProperty("--hold", share.toFixed(4));
  function settle(el: HTMLElement, from: number) {
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / LET_GO_MS);
      set(el, from * (1 - k));
      if (k < 1) easing.current.set(el, requestAnimationFrame(step));
      else easing.current.delete(el);
    };
    easing.current.set(el, requestAnimationFrame(step));
  }

  /**
   * Starts holding the key going down (`e`) on `el`; `done` once it's been held for `ms` (at once for none). Nothing
   * while another hold is on. While a tap of the key does something too, the fill waits out the tap (`TAP_MS`), then
   * fills over the rest, so it's still done when it's set to be.
   */
  function begin(e: KeyboardEvent, el: HTMLElement | null, ms: number, done: () => void) {
    const key = e.key;
    const named = key.toLowerCase();
    if (current.current) return;
    // Shift, Ctrl or Alt pressed (or pressed twice) is its own press only if nothing else went down while it was: heard
    // as it goes up, then as any press is.
    if (ms <= 0 && isModifier(key)) {
      if (e.type === "keyup") {
        if (ownModifier(key)) pressNow(e, named, ms, done);
        return;
      }
      const up = (u: KeyboardEvent) => {
        if (u.key.toLowerCase() !== named) return;
        window.removeEventListener("keyup", up);
        if (ownModifier(key)) pressNow(u, named, ms, done);
      };
      window.addEventListener("keyup", up);
      return;
    }
    if (ms <= 0) {
      pressNow(e, named, ms, done);
      return;
    }
    if (!el) return;
    const going = easing.current.get(el);
    if (going !== undefined) {
      cancelAnimationFrame(going);
      easing.current.delete(el);
    }
    const t0 = performance.now();
    const still = tapLive(e) ? Math.min(TAP_MS, ms) : 0;
    // A hold of Shift, Ctrl or Alt lets go the moment another key goes down: it's that key's, held with it.
    const other = (d: KeyboardEvent) => {
      if (d.key.toLowerCase() !== named) release();
    };
    const watching = isModifier(key);
    if (watching) window.addEventListener("keydown", other, true);
    const hold = { key, el, raf: 0, stop: () => watching && window.removeEventListener("keydown", other, true) };
    current.current = hold;
    const tick = (t: number) => {
      const share = ms === still ? (t - t0 >= ms ? 1 : 0) : Math.min(1, Math.max(0, t - t0 - still) / (ms - still));
      set(el, share);
      if (share < 1) {
        hold.raf = requestAnimationFrame(tick);
        return;
      }
      current.current = null;
      hold.stop();
      set(el, 0);
      done();
    };
    hold.raf = requestAnimationFrame(tick);
  }

  /** A press, or a double press (`DOUBLE_PRESS`), heard now. */
  function pressNow(e: KeyboardEvent, named: string, ms: number, done: () => void) {
    // A double press: the first press noted, the second within `DOUBLE_MS` does it.
    if (ms === DOUBLE_PRESS) {
      const first = firsts.current.get(named);
      const now = performance.now();
      if (first !== undefined && now - first < DOUBLE_MS) {
        firsts.current.delete(named);
        done();
      } else firsts.current.set(named, now);
      return;
    }
    // A press; one of a key whose double press does something waits to see it isn't that, a second press of it in time
    // calling it off.
    if (!doubleLive(e)) {
      done();
      return;
    }
    const pending = waiting.current.get(named);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      waiting.current.delete(named);
      return;
    }
    waiting.current.set(
      named,
      window.setTimeout(() => {
        waiting.current.delete(named);
        done();
      }, DOUBLE_MS),
    );
  }

  /** Lets go of the hold on `key` (any key, left out); what it was for doesn't happen. */
  function release(key?: string) {
    const hold = current.current;
    if (!hold || (key !== undefined && hold.key.toLowerCase() !== key.toLowerCase())) return;
    cancelAnimationFrame(hold.raf);
    hold.stop();
    current.current = null;
    settle(hold.el, parseFloat(hold.el.style.getPropertyValue("--hold") || "0"));
  }

  useEffect(() => {
    const away = () => release();
    window.addEventListener("blur", away);
    const pending = waiting.current;
    return () => {
      window.removeEventListener("blur", away);
      release();
      for (const timer of pending.values()) window.clearTimeout(timer);
    };
    // Once: `release` reads only refs.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Whether a hold is on just now. */
  const holding = () => current.current !== null;

  return { begin, release, holding };
}
