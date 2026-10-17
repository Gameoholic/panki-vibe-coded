import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Token } from "../capture/words";
import { askLattice } from "../messages";
import type { Lattice } from "./found";
import { wordsOf, type Forced } from "./split";

/**
 * Lines split into words, on a page's script: what the worker said each line's words are, kept here so every part of
 * the screen splits the same line the same way at the same moment (the line under the player, the drawer's sentence,
 * a double-click in it). Until the worker's answer is in, a line is split the browser's way; it's asked a moment after
 * a line stops changing, since a line being written grows a word at a time.
 */
const lattices = new Map<string, Lattice>();
const asking = new Set<string>();
const KEEP = 400;
/** How long a line must stay as it is before it's asked about. */
const SETTLE_MS = 120;

let version = 0;
const followers = new Set<() => void>();
const told = () => {
  version++;
  for (const follower of followers) follower();
};
const subscribe = (follower: () => void) => {
  followers.add(follower);
  return () => {
    followers.delete(follower);
  };
};
const snapshot = () => version;

function want(text: string) {
  if (text === "" || lattices.has(text) || asking.has(text)) return;
  asking.add(text);
  void askLattice(text).then((answer) => {
    asking.delete(text);
    if (!answer.ok) return;
    if (lattices.size >= KEEP) lattices.clear();
    lattices.set(text, answer.lattice);
    told();
  });
}

/** The dictionaries changed (the worker says so in its `lookState` answer): every line is asked about again. */
let signature: string | null = null;
export function dictionariesAre(next: string) {
  if (signature === next) return;
  const first = signature === null;
  signature = next;
  if (first) return;
  lattices.clear();
  told();
}

/** A line's words as they're known right now; for an event's handler, where a hook can't be. */
export function wordsNow(text: string, forced: readonly Forced[] = []): Token[] {
  return wordsOf(text, lattices.get(text) ?? null, forced);
}

/** A line's words, split again whenever the worker has said more about them. */
export function useWords(text: string, forced: readonly Forced[] = []): Token[] {
  const known = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    if (lattices.has(text)) return;
    const soon = setTimeout(() => want(text), SETTLE_MS);
    return () => clearTimeout(soon);
  }, [text, known]);
  // `forcedKey` says when `forced` has really changed; the list itself is new on every draw.
  const forcedKey = forced.map((f) => `${f.from}-${f.to}`).join(",");
  return useMemo(() => wordsNow(text, forced), [text, known, forcedKey]);
}
