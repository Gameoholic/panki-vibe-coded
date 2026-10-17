import { useEffect, useRef, useState } from "react";

const SAVE_AFTER_MS = 300;

/**
 * A handful of settings that save themselves: a change shows at once and is sent a moment later, a few quick ones as
 * one save. Gives back what's on screen now, `patch` to change some of it, and what went wrong with the last save.
 * For short settings only; anything that takes a while to set up is saved on purpose instead.
 */
export function useSavedSoon<T extends object>(saved: T, save: (patch: Partial<T>) => Promise<T>): [current: T, patch: (change: Partial<T>) => void, failure: string | null] {
  const [current, setCurrent] = useState(saved);
  const [failure, setFailure] = useState<string | null>(null);
  const pending = useRef<Partial<T>>({});
  const timer = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  function patch(change: Partial<T>) {
    setCurrent((c) => ({ ...c, ...change }));
    pending.current = { ...pending.current, ...change };
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const toSave = pending.current;
      pending.current = {};
      timer.current = null;
      try {
        const result = await saveRef.current(toSave);
        // What was typed while the save was on its way stays on screen.
        setCurrent({ ...result, ...pending.current });
        setFailure(null);
      } catch (e) {
        setFailure(e instanceof Error ? e.message : "Something went wrong.");
      }
    }, SAVE_AFTER_MS);
  }
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return [current, patch, failure];
}
