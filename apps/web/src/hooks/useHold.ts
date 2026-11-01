import { useEffect, useRef } from "react";
import { pressed } from "../keys";

/** How long a hold let go early takes to go back to nothing. */
const LET_GO_MS = 160;

/**
 * Keys a tap of which does something right now, as each listener has them (`useHeardKeys`: a player's Space tapped,
 * while there's a clip to play), by how many: a hold of the same key on the same screen can't yet tell itself from
 * that tap as it goes down, so it stays still for its first moment (`TAP_MS`), and a tap shows no hold beginning
 * (the owner, 2026-10-29: "when I press space and instantly release it also thinks I'm trying to hold it"). Any key,
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
 * The one line between a tap and a hold of a key that's both (the owner, 2026-10-29): let go sooner, it's the tap;
 * held past it, the hold's ring begins to fill, and letting go then is a hold let go early, which does nothing. So the
 * ring showing always means a hold. The hold itself still takes as long as it's set to (every hold is longer than this).
 * 0.2 s, the owner's pick (2026-11-01; 0.15 s from 2026-10-29, after trying 0.1 s).
 */
export const TAP_MS = 200;
/** A second press of a key this soon after a tap of it is a double press (the Hold button's Back to start, 2026-11-02). */
export const DOUBLE_MS = 350;

/**
 * A key held on a button until it does its thing (`keys.ts`, a bind to hold): how far along, 0 to 1, is written on the
 * button as `--hold` each frame, and what draws it is the CSS's (its keycap, `.key.is-hold`). Let go early, it eases back and nothing
 * happens; the window losing the focus lets go too. One hold at a time. The review is the pattern.
 */
export function useHold() {
  const current = useRef<{ key: string; el: HTMLElement; raf: number } | null>(null);
  const easing = useRef(new Map<HTMLElement, number>());

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
   * fills over the rest, so it's still done when it's set to be. `e` can be a name instead of a key (a pointer held on a
   * button, the Hold button's "pointer"), let go by that name; `quiet` says whether the fill waits out a tap whatever
   * the keys say (the Hold button's first stage does, a tap of it being Back to start; its later stages don't).
   */
  function begin(e: KeyboardEvent | string, el: HTMLElement | null, ms: number, done: () => void, quiet?: boolean) {
    const key = typeof e === "string" ? e : e.key;
    if (current.current) return;
    // A hold of no time is a press.
    if (ms <= 0) {
      done();
      return;
    }
    if (!el) return;
    const going = easing.current.get(el);
    if (going !== undefined) {
      cancelAnimationFrame(going);
      easing.current.delete(el);
    }
    const t0 = performance.now();
    const still = (quiet ?? (typeof e !== "string" && tapLive(e))) ? Math.min(TAP_MS, ms) : 0;
    const hold = { key, el, raf: 0 };
    current.current = hold;
    const tick = (t: number) => {
      const share = ms === still ? (t - t0 >= ms ? 1 : 0) : Math.min(1, Math.max(0, t - t0 - still) / (ms - still));
      set(el, share);
      if (share < 1) {
        hold.raf = requestAnimationFrame(tick);
        return;
      }
      current.current = null;
      set(el, 0);
      done();
    };
    hold.raf = requestAnimationFrame(tick);
  }

  /** Lets go of the hold on `key` (any key, left out); what it was for doesn't happen. */
  function release(key?: string) {
    const hold = current.current;
    if (!hold || (key !== undefined && hold.key.toLowerCase() !== key.toLowerCase())) return;
    cancelAnimationFrame(hold.raf);
    current.current = null;
    settle(hold.el, parseFloat(hold.el.style.getPropertyValue("--hold") || "0"));
  }

  useEffect(() => {
    const away = () => release();
    window.addEventListener("blur", away);
    return () => {
      window.removeEventListener("blur", away);
      release();
    };
    // Once: `release` reads only refs.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Whether a hold is on just now. */
  const holding = () => current.current !== null;

  return { begin, release, holding };
}
