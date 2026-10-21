import { useEffect, useRef } from "react";

/** How long a hold let go early takes to go back to nothing. */
const LET_GO_MS = 160;

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

  /** Starts holding `key` on `el`; `done` once it's been held for `ms` (at once for none). Nothing while another hold is on. */
  function begin(key: string, el: HTMLElement | null, ms: number, done: () => void) {
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
    const hold = { key, el, raf: 0 };
    current.current = hold;
    const tick = (t: number) => {
      const share = Math.min(1, (t - t0) / ms);
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

  return { begin, release };
}
