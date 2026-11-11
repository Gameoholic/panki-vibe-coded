import { dueAt, isBurned, type CardPlace, type SrsLadder } from "@panki/contracts";

/**
 * All reviews done, worked out on read by replaying the account's history, never stored: the moments at which an
 * answer landed with no card left due in any living deck, within each deck's reviews a day as they stood that day
 * (as `deckCountsOf`'s `dueCount` reads it now). Pure: every row and the ladders as they stood come in.
 *
 * Each living card's due moment is kept as the history goes: its place is its last place row's (an answer, a switch of
 * type, a stage taken away), and it's due at its last answer's time plus the wait its place has under the ladder as it
 * stood at that moment (the type's save in force then, the deck's type in force then), frozen there as the stored
 * mark was, so a wait retuned later moves no due moment already reached. A card is out while a hold of its stands
 * (a suspend until it's lifted, a bury until its end), and from its own or its deck's removal on. New and burned cards
 * are never due. Undone rows aren't in the history at all: what was taken back never happened.
 */

/** A place row that stands (not undone), oldest first: an answer, or the place changed by a switch or a stage removed. */
export type ReplayPlace = { cardId: string; at: number; answer: boolean; to: CardPlace; start: boolean };
/** A hold that stands (not undone): a bury to its end, a suspend until lifted; lifting a bury early ends it too. */
export type ReplayHold = { cardId: string; at: number; kind: "bury" | "suspend"; until: number | null; liftedAt: number | null };
/** A change of a value over time: what it was from before it, what it became at it. */
export type Changed<T> = { at: number; from: T; to: T };

export type ReplayInput = {
  cards: readonly { id: string; deckId: string; removedAt: number | null }[];
  decks: readonly { id: string; removedAt: number | null; srsTypeId: string; reviewsPerDay: number | null }[];
  places: readonly ReplayPlace[];
  holds: readonly ReplayHold[];
  /** Each SRS type as it is now, and its logged saves, oldest first (`srs_type_changes`). */
  ladders: ReadonlyMap<string, SrsLadder>;
  ladderChanges: ReadonlyMap<string, readonly Changed<SrsLadder | null>[]>;
  /** Each deck's switches of type, oldest first (`deck_srs_changes`). */
  deckTypeChanges: ReadonlyMap<string, readonly Changed<string>[]>;
  /** Each deck's reviews a day changes, oldest first (`deck_settings_changes`). */
  capChanges: ReadonlyMap<string, readonly Changed<number | null>[]>;
  /** The account's day an instant falls in, for the reviews counted against a deck's reviews a day. */
  dayOf: (at: number) => string;
};

/** A value as it stood at a moment: the from of the first change after it, or the to of the last one at or before it. */
export function asAt<T>(now: T, changes: readonly Changed<T>[] | undefined, at: number): T {
  if (!changes || changes.length === 0) return now;
  let value = changes[0]!.from;
  for (const c of changes) {
    if (c.at > at) break;
    value = c.to;
  }
  return value;
}

/** Whether a hold keeps its card out at `at`: a suspend until it's lifted, a bury until its end or lifted early. */
export const holdStands = (h: ReplayHold, at: number): boolean => {
  const end = h.kind === "suspend" ? (h.liftedAt ?? Infinity) : Math.min(h.until ?? Infinity, h.liftedAt ?? Infinity);
  return h.at <= at && at < end;
};

/** A row of the history as a replay walks it: a place row or a hold. */
export type ReplayEvent = { at: number; place?: ReplayPlace; hold?: ReplayHold };
/** Every row in the order it happened; a place row before a hold at the same moment, as the API writes them. */
export function inOrder(places: readonly ReplayPlace[], holds: readonly ReplayHold[]): ReplayEvent[] {
  const events: ReplayEvent[] = [...places.map((place) => ({ at: place.at, place })), ...holds.map((hold) => ({ at: hold.at, hold }))];
  return events.sort((a, b) => a.at - b.at || Number(a.place === undefined) - Number(b.place === undefined));
}

/** The moments an answer (or a hold given as one) landed with nothing left due, oldest first. */
export function clearedMoments(input: ReplayInput): number[] {
  const deckOf = new Map(input.decks.map((d) => [d.id, d]));
  type Kept = { deckId: string; removedAt: number | null; place: CardPlace | null; lastAt: number | null; due: number | null; holds: ReplayHold[] };
  const cards = new Map<string, Kept>(input.cards.map((c) => [c.id, { deckId: c.deckId, removedAt: c.removedAt, place: null, lastAt: null, due: null, holds: [] }]));
  const ladderAt = (deckId: string, at: number): SrsLadder | null => {
    const deck = deckOf.get(deckId);
    if (!deck) return null;
    const typeId = asAt(deck.srsTypeId, input.deckTypeChanges.get(deckId), at);
    const now = input.ladders.get(typeId) ?? null;
    return asAt<SrsLadder | null>(now, input.ladderChanges.get(typeId), at) ?? now;
  };
  // The due moment of a card as its place and last answer stand, under the ladder in force at `at`.
  const dueOf = (card: Kept, at: number): number | null => {
    if (card.place === null || card.lastAt === null) return null;
    const ladder = ladderAt(card.deckId, at);
    if (!ladder || isBurned(ladder, card.place)) return null;
    return dueAt(ladder, card.place, card.lastAt);
  };
  const held = (card: Kept, at: number) => card.holds.some((h) => holdStands(h, at));
  // Reviews counted against each deck's reviews a day, by the day: answers that weren't a new card's start.
  const reviewed = new Map<string, number>();
  const reviewedKey = (deckId: string, at: number) => `${deckId}|${input.dayOf(at)}`;

  /** Whether nothing is due at `at` in any living deck, within what's left of each deck's reviews a day. */
  const nothingDue = (at: number): boolean => {
    const full = new Map<string, boolean>();
    const capped = (deckId: string): boolean => {
      let is = full.get(deckId);
      if (is === undefined) {
        const deck = deckOf.get(deckId);
        const cap = deck ? asAt(deck.reviewsPerDay, input.capChanges.get(deckId), at) : null;
        is = cap !== null && (reviewed.get(reviewedKey(deckId, at)) ?? 0) >= cap;
        full.set(deckId, is);
      }
      return is;
    };
    for (const card of cards.values()) {
      if (card.due === null || card.due > at) continue;
      if (card.removedAt !== null && card.removedAt <= at) continue;
      const deck = deckOf.get(card.deckId);
      if (!deck || (deck.removedAt !== null && deck.removedAt <= at)) continue;
      if (held(card, at) || capped(card.deckId)) continue;
      return false;
    }
    return true;
  };

  const moments: number[] = [];
  for (const e of inOrder(input.places, input.holds)) {
    const card = cards.get(e.place?.cardId ?? e.hold?.cardId ?? "");
    if (!card) continue;
    if (e.place) {
      card.place = e.place.to;
      if (e.place.answer) {
        card.lastAt = e.at;
        if (!e.place.start) reviewed.set(reviewedKey(card.deckId, e.at), (reviewed.get(reviewedKey(card.deckId, e.at)) ?? 0) + 1);
      }
      card.due = dueOf(card, e.at);
    } else if (e.hold) card.holds.push(e.hold);
    const answered = e.hold !== undefined || e.place?.answer === true;
    if (answered && nothingDue(e.at)) moments.push(e.at);
  }
  return moments;
}
