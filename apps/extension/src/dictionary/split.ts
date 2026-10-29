import { tokensOf, type Token } from "../capture/words";
import type { Lattice } from "./found";

/** A stretch of a line taken as one word by hand (picked among the words that start there): the line is split around it, whatever the dictionary would rather. */
export type Forced = { from: number; to: number };

/** What a piece costs where no word of the dictionary fits: the browser's own splitter's piece, or a single letter. Far more than any word, so a word always wins where there is one. */
const UNKNOWN = 30;

type Edge = { to: number; cost: number; word: boolean; term?: string };

/**
 * A line split into words. With a dictionary: the split whose words cost least in all (`Lattice`: every word starting
 * at each place, a common word costing less, every word costing something), where no word fits the browser's own
 * splitter's pieces stand in, and a stretch taken as one word by hand is always one. Without a dictionary (or before
 * its answer is in) it's the browser's split, as it always was.
 */
export function wordsOf(text: string, lattice: Lattice | null, forced: readonly Forced[] = []): Token[] {
  const browser = tokensOf(text);
  const fixed = forced.filter((f) => f.from >= 0 && f.to <= text.length && f.to > f.from);
  if ((lattice === null || lattice.length === 0) && fixed.length === 0) return browser;

  const n = text.length;
  const words = new Map<number, { length: number; cost: number; term: string }[]>();
  for (const place of lattice ?? []) words.set(place.at, place.options);
  const pieces = new Map(browser.map((token) => [token.start, token]));
  const crosses = (from: number, to: number) => fixed.some((f) => from < f.to && to > f.from && !(from === f.from && to === f.to));

  function edgesFrom(i: number): Edge[] {
    const own = fixed.find((f) => f.from === i);
    if (own) {
      // A stretch taken by hand is still the dictionary's word when it's one.
      const term = words.get(i)?.find((option) => option.length === own.to - i)?.term;
      return [{ to: own.to, cost: 0, word: true, ...(term ? { term } : {}) }];
    }
    const edges: Edge[] = [];
    for (const option of words.get(i) ?? []) edges.push({ to: i + option.length, cost: option.cost, word: true, term: option.term });
    const piece = pieces.get(i);
    if (piece) edges.push({ to: piece.end, cost: piece.word ? UNKNOWN : 0, word: piece.word });
    const char = text.charAt(i);
    const letter = /[\p{L}\p{N}]/u.test(char);
    edges.push({ to: i + 1, cost: letter ? UNKNOWN : 0, word: letter });
    return edges.filter((edge) => edge.to <= n && !crosses(i, edge.to));
  }

  const best = new Float64Array(n + 1).fill(Infinity);
  const back: (Edge & { from: number })[] = new Array<Edge & { from: number }>(n + 1);
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    const here = best[i] ?? Infinity;
    if (here === Infinity) continue;
    for (const edge of edgesFrom(i)) {
      const cost = here + edge.cost;
      if (cost < (best[edge.to] ?? Infinity)) {
        best[edge.to] = cost;
        back[edge.to] = { ...edge, from: i };
      }
    }
  }
  if ((best[n] ?? Infinity) === Infinity) return browser;
  const out: Token[] = [];
  for (let at = n; at > 0; ) {
    const edge = back[at];
    if (!edge) return browser;
    out.push({ text: text.slice(edge.from, at), word: edge.word, start: edge.from, end: at, ...(edge.term ? { term: edge.term } : {}) });
    at = edge.from;
  }
  return out.reverse();
}
