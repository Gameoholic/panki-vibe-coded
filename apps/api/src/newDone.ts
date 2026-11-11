import { isNew, type CardPlace } from "@panki/contracts";
import { asAt, holdStands, inOrder, type Changed, type ReplayHold, type ReplayPlace } from "./cleared";

/**
 * All new cards done, worked out on read by replaying the account's history, never stored: the moments at which an
 * answer landed with every living deck's new cards for the day learned. All reviews done's twin (`cleared.ts`), built
 * the same way. Pure: every row comes in.
 *
 * A deck's new cards for a day are done once every new card started in it that day (its first answer) is learned, and
 * the day's starts have reached its New cards a day as it stood at that moment (as `deckCountsOf`'s `newCount` counts
 * them off) or it has no new card left to start: every card of it made by then and not removed started, or held. A
 * card is learned once its review is finished: out of any ask-again, on a stage or burned; one answered and left asking
 * again, with or without a wait, isn't yet, so a day of Forgot alone never counts, and one left waiting past the day's
 * end counts for neither day (the next day's done asks nothing of it: it's neither started that day nor to start). One
 * an answer sends back to New is a new card again, to start and learn again that day, its starts each counted. A card
 * out while a hold stands (a suspend until it's lifted, a bury until its end) is neither to start nor to learn, as a
 * held card isn't due in All reviews done. A deck at 0 needs nothing. A card's place is its last place row's, so one
 * moved back to New by a switch of type is to start again. A card made later in the day undoes no moment already
 * reached. Undone rows aren't in the history at all: what was taken back never happened.
 */

export type NewDoneInput = {
  cards: readonly { id: string; deckId: string; createdAt: number; removedAt: number | null }[];
  decks: readonly { id: string; removedAt: number | null; newPerDay: number }[];
  places: readonly ReplayPlace[];
  holds: readonly ReplayHold[];
  /** Each deck's New cards a day changes, oldest first (`deck_settings_changes`). */
  limitChanges: ReadonlyMap<string, readonly Changed<number>[]>;
  /** The account's day an instant falls in, for the new cards counted against a deck's New cards a day. */
  dayOf: (at: number) => string;
};

/** The moments an answer (or a hold given as one) landed with every deck's new cards for the day learned, oldest first. */
export function newDoneMoments(input: NewDoneInput): number[] {
  type Kept = { deckId: string; createdAt: number; removedAt: number | null; place: CardPlace | null; holds: ReplayHold[] };
  const cards = new Map<string, Kept>(input.cards.map((c) => [c.id, { deckId: c.deckId, createdAt: c.createdAt, removedAt: c.removedAt, place: null, holds: [] }]));
  // The new cards started in each deck on each day: how many starts (each a first answer, as the door counts them off
  // New cards a day) and which cards, every one of them to learn.
  type Started = { n: number; cards: Set<Kept> };
  const started = new Map<string, Started>();
  const startedKey = (deckId: string, at: number) => `${deckId}|${input.dayOf(at)}`;

  /** Whether a card is out at `at`: removed by then, or held. */
  const out = (card: Kept, at: number): boolean => (card.removedAt !== null && card.removedAt <= at) || card.holds.some((h) => holdStands(h, at));
  /** Whether a card is a new card to start at `at`: made by then, not out, and never answered (or sent back to New). */
  const toStart = (card: Kept, at: number): boolean => card.createdAt <= at && !out(card, at) && (card.place === null || (isNew(card.place) && card.place.node.length === 0));
  /** Whether a card is learned: its review finished, out of any ask-again and on a stage or burned. */
  const learned = (card: Kept): boolean => card.place !== null && !isNew(card.place) && card.place.node.length === 0;

  /** Whether every living deck has its new cards for the day done at `at`. */
  const allDone = (at: number): boolean => {
    // Each living deck: every new card started in it today learned (or out), and whether its starts reached its limit.
    const reached = new Map<string, boolean>();
    for (const deck of input.decks) {
      if (deck.removedAt !== null && deck.removedAt <= at) continue;
      const today = started.get(startedKey(deck.id, at));
      for (const card of today?.cards ?? []) if (!learned(card) && !out(card, at)) return false;
      reached.set(deck.id, (today?.n ?? 0) >= asAt(deck.newPerDay, input.limitChanges.get(deck.id), at));
    }
    // A deck short of its limit is done only with no new card left to start; one gone, or at its limit, asks nothing more.
    for (const card of cards.values()) {
      if (reached.get(card.deckId) === false && toStart(card, at)) return false;
    }
    return true;
  };

  const moments: number[] = [];
  for (const e of inOrder(input.places, input.holds)) {
    const card = cards.get(e.place?.cardId ?? e.hold?.cardId ?? "");
    if (!card) continue;
    if (e.place) {
      card.place = e.place.to;
      if (e.place.answer && e.place.start) {
        const key = startedKey(card.deckId, e.at);
        const today = started.get(key) ?? { n: 0, cards: new Set<Kept>() };
        today.n += 1;
        today.cards.add(card);
        started.set(key, today);
      }
    } else if (e.hold) card.holds.push(e.hold);
    const answered = e.hold !== undefined || e.place?.answer === true;
    if (answered && allDone(e.at)) moments.push(e.at);
  }
  return moments;
}
