import { useEffect, useRef } from "react";
import { heard, pressed, type Heard } from "../keys";
import { useHold } from "./useHold";

/**
 * An action's keys heard on the window (`keys.ts` → `Heard`: its own and its second): pressed, or held as long as each
 * says (`useHold`, how far along drawn on `at`'s element), anywhere on the page but in something typed into. A press
 * of a key that something else on the screen takes held (Space tapped plays the clip, Space held shows the answer) acts
 * as it's let go, and only when let go sooner than that (`tapUnder`). `wanted` says whether this one is the one to act
 * (every clip hears the full screen key; only the one it's for acts). A player's keys and the full screen's are this.
 */
export function useHeardKeys(keys: readonly (Heard | null)[], at: () => HTMLElement | null, act: () => void, wanted: () => boolean = () => true) {
  const held = useHold();
  // Read through refs, so the listeners stand while what they call changes with each drawing.
  const now = useRef({ at, act, wanted });
  now.current = { at, act, wanted };
  const listened = keys.filter((key): key is Heard => key !== null);
  const signature = JSON.stringify(listened);
  useEffect(() => {
    if (listened.length === 0) return;
    /** When a tap of a key began, by the key: it acts as it's let go, if that's soon enough. */
    const tapping = new Map<string, number>();
    const onKey = (e: KeyboardEvent) => {
      const hit = listened.find((key) => heard(e, key.key));
      if (!hit || !now.current.wanted()) return;
      e.preventDefault();
      if (hit.tapUnder > 0) {
        tapping.set(e.key, performance.now());
        return;
      }
      held.begin(e.key, now.current.at(), hit.holdMs, () => now.current.act());
    };
    const onUp = (e: KeyboardEvent) => {
      held.release(e.key);
      const began = tapping.get(e.key);
      if (began === undefined) return;
      tapping.delete(e.key);
      const hit = listened.find((key) => pressed(e, key.key));
      if (hit && performance.now() - began < hit.tapUnder) now.current.act();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps -- the keys are what `signature` says; the rest is read through refs
}
