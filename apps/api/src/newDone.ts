import { isNew, type CardPlace } from "@panki/contracts";
import { asAt, holdStands, inOrder, type Changed, type ReplayHold, type ReplayPlace } from "./cleared";

/**
 * All new cards done, worked out on read by replaying the account's history, never stored: the moments at which an
 * answer landed with no living deck left with a new card to start that day (as `deckCountsOf`'s `newCount` reads it
 * now). All reviews done's twin (`cleared.ts`), built the same way. Pure: every row comes in.
 *
 * A deck's new cards for a day are done once the new cards started in it that day (their first answers) have reached
 * its New cards a day as it stood at that moment, or it has no new card left to start: every card of it made by then
 * and not removed has been started, or is held (a suspend until it's lifted, a bury until its end). A deck at 0 needs
 * nothing. A card's place is its last place row's, so one moved back to New by a switch of type is to start again, and
 * a new card inside an ask-again has been started. A card made later in the day undoes no moment already reached.
 * Undone rows aren't in the history at all: what was taken back never happened.
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

/** The moments an answer (or a hold given as one) landed with every deck's new cards for the day done, oldest first. */
export function newDoneMoments(input: NewDoneInput): number[] {
  const deckOf = new Map(input.decks.map((d) => [d.id, d]));
  type Kept = { deckId: string; createdAt: number; removedAt: number | null; place: CardPlace | null; holds: ReplayHold[] };
  const cards = new Map<string, Kept>(input.cards.map((c) => [c.id, { deckId: c.deckId, createdAt: c.createdAt, removedAt: c.removedAt, place: null, holds: [] }]));
  // New cards started in each deck, by the day: a card's first answer.
  const started = new Map<string, number>();
  const startedKey = (deckId: string, at: number) => `${deckId}|${input.dayOf(at)}`;

  /** Whether a card is a new card to start at `at`: made by then, not removed, never answered, and not held. */
  const toStart = (card: Kept, at: number): boolean =>
    card.createdAt <= at &&
    (card.removedAt === null || card.removedAt > at) &&
    (card.place === null || (isNew(card.place) && card.place.node.length === 0)) &&
    !card.holds.some((h) => holdStands(h, at));

  /** Whether every living deck has its new cards for the day done at `at`. */
  const allDone = (at: number): boolean => {
    const reached = new Map<string, boolean>();
    for (const card of cards.values()) {
      const deck = deckOf.get(card.deckId);
      if (!deck || (deck.removedAt !== null && deck.removedAt <= at)) continue;
      let is = reached.get(deck.id);
      if (is === undefined) {
        const limit = asAt(deck.newPerDay, input.limitChanges.get(deck.id), at);
        is = (started.get(startedKey(deck.id, at)) ?? 0) >= limit;
        reached.set(deck.id, is);
      }
      if (!is && toStart(card, at)) return false;
    }
    return true;
  };

  const moments: number[] = [];
  for (const e of inOrder(input.places, input.holds)) {
    const card = cards.get(e.place?.cardId ?? e.hold?.cardId ?? "");
    if (!card) continue;
    if (e.place) {
      card.place = e.place.to;
      if (e.place.answer && e.place.start) started.set(startedKey(card.deckId, e.at), (started.get(startedKey(card.deckId, e.at)) ?? 0) + 1);
    } else if (e.hold) card.holds.push(e.hold);
    const answered = e.hold !== undefined || e.place?.answer === true;
    if (answered && allDone(e.at)) moments.push(e.at);
  }
  return moments;
}
