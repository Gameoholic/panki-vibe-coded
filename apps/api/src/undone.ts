/**
 * An answer taken back with Undo only gives the card another go: the look before it and the look after it are one
 * look at the card. Pure: the rows come in oldest first, with the account's day reader.
 */

/** A showing of a card as the readers of time take it: whose, when, whether its answer was undone, and its spans. */
export type TimedShowing = { cardId: string; at: number; undone?: boolean; thinkMs: number | null; decideMs: number | null };

/** Two spans as one; not measured when either wasn't. */
const plus = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

/**
 * The showings with each undone one folded into the next showing of the same card on the same day, its front and its
 * back added to that one's, so 10 s, Undo, then 5 s is one showing of 15 s, however many times it's undone. An undone
 * showing the card never had another go after that day stays as it was, undone. Nothing is dropped: the time in all is
 * the same, and the rows come out in the order they came in.
 */
export function foldUndone<T extends TimedShowing>(rows: readonly T[], dayOf: (at: number) => string): T[] {
  const out: (T | null)[] = [];
  /** The undone showings of a card on a day still waiting for its next go: where they stand in `out`, and their spans summed. */
  const waiting = new Map<string, { at: number[]; thinkMs: number | null; decideMs: number | null }>();
  for (const row of rows) {
    const key = `${row.cardId}|${dayOf(row.at)}`;
    const held = waiting.get(key);
    if (row.undone) {
      out.push(row);
      waiting.set(key, held ? { at: [...held.at, out.length - 1], thinkMs: plus(held.thinkMs, row.thinkMs), decideMs: plus(held.decideMs, row.decideMs) } : { at: [out.length - 1], thinkMs: row.thinkMs, decideMs: row.decideMs });
      continue;
    }
    if (held) {
      for (const i of held.at) out[i] = null;
      waiting.delete(key);
      out.push({ ...row, thinkMs: plus(held.thinkMs, row.thinkMs), decideMs: plus(held.decideMs, row.decideMs) });
    } else {
      out.push(row);
    }
  }
  return out.filter((row): row is T => row !== null);
}
