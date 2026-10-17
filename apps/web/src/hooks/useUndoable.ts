import { useCallback, useEffect, useState } from "react";

type History<T> = { past: T[]; present: T; future: T[]; group: string | null };
/** How many steps back can be undone. */
const HISTORY_MAX = 60;

/**
 * Something being edited on screen, with its history. `change` makes a new present: a run of changes given one
 * `group` (a field's keystrokes) undoes as one step. `undo` and `redo` walk it, and so do Ctrl+Z and Ctrl+Shift+Z or
 * Ctrl+Y while no text box has the keys (a box undoes its own typing). `amend` changes the present without making a
 * step: what the API says of it after a save. The SRS editor and the card layout editor are both this.
 */
export function useUndoable<T>(initial: T) {
  const [hist, setHist] = useState<History<T>>(() => ({ past: [], present: initial, future: [], group: null }));

  const change = useCallback((next: T, group?: string) => {
    setHist((h) => {
      if (group && group === h.group) return { ...h, present: next };
      return { past: [...h.past.slice(-(HISTORY_MAX - 1)), h.present], present: next, future: [], group: group ?? null };
    });
  }, []);
  const undo = useCallback(() => {
    setHist((h) => {
      const previous = h.past[h.past.length - 1];
      if (previous === undefined) return h;
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], group: null };
    });
  }, []);
  const redo = useCallback(() => {
    setHist((h) => {
      const [next, ...rest] = h.future;
      if (next === undefined) return h;
      return { past: [...h.past, h.present], present: next, future: rest, group: null };
    });
  }, []);
  const amend = useCallback((edit: (present: T) => T) => {
    setHist((h) => ({ ...h, present: edit(h.present) }));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) undo();
      else if ((key === "z" && e.shiftKey) || key === "y") redo();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return { present: hist.present, change, undo, redo, amend, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0 };
}
