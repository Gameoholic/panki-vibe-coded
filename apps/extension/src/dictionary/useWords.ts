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
/**
 * How many lines' words are kept, the oldest let go first. A whole transcript is listed beside the video (the panel's
 * Beside the video view), so it's more than a long video's lines: at 400, cleared whole, such a list was asked about
 * over and over.
 */
const KEEP = 5000;
/** How long a line must stay as it is before it's asked about. */
const SETTLE_MS = 120;
/** How many lines are asked about at once: a whole transcript listed asks about every line, in turn, never all together. */
const AT_ONCE = 4;
const waiting: string[] = [];

const followers = new Set<() => void>();
const told = () => {
  for (const follower of followers) follower();
};
const subscribe = (follower: () => void) => {
  followers.add(follower);
  return () => {
    followers.delete(follower);
  };
};

function want(text: string) {
  if (text === "" || lattices.has(text) || asking.has(text) || waiting.includes(text)) return;
  waiting.push(text);
  next();
}

/** The next line waiting asked about, while fewer than `AT_ONCE` are on their way. */
function next() {
  while (asking.size < AT_ONCE) {
    const text = waiting.shift();
    if (text === undefined) return;
    if (lattices.has(text)) continue;
    asking.add(text);
    void askLattice(text).then((answer) => {
      asking.delete(text);
      if (answer.ok) {
        if (lattices.size >= KEEP) {
          const oldest = lattices.keys().next();
          if (!oldest.done) lattices.delete(oldest.value);
        }
        lattices.set(text, answer.lattice);
        told();
      }
      next();
    });
  }
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
  // This line's own words, so an answer about another line draws nothing here: a whole transcript listed is a line each.
  const lattice = useSyncExternalStore(subscribe, () => lattices.get(text) ?? null);
  useEffect(() => {
    if (lattice) return;
    const soon = setTimeout(() => want(text), SETTLE_MS);
    return () => clearTimeout(soon);
  }, [text, lattice]);
  // `forcedKey` says when `forced` has really changed; the list itself is new on every draw.
  const forcedKey = forced.map((f) => `${f.from}-${f.to}`).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => wordsOf(text, lattice, forced), [text, lattice, forcedKey]);
}
