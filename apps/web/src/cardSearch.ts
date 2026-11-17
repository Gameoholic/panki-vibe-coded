/** @panki Searching cards in the app, a deck's (`searchCards`) and every deck's (`searchEvery`), both the contracts' one `rankCards`, and what's found lit (`lightingOf`). */
import { cardLighting, rankCards, searchWords, type Card, type CardType, type LitRun, type SearchWords, type SrsType } from "@panki/contracts";
import { FLAG_WORDS, HOLD_KINDS, placeName } from "./srsKinds";

/**
 * Searching cards in the app. Every place that searches cards goes through here, and here through the contracts' one
 * function (`textSearch.ts` → `rankCards`, `cardLighting`): what's searched, how a word is found, how cards rank and
 * how ties fall are decided there alone, so a deck's Search and every deck's can never drift apart. This file only
 * says where a card stands in the app's words (its stage's name, snoozed, suspended, flagged), which are searched too.
 */

/** A deck's card type and SRS type: what says what a card's values are and where it stands. */
type Of = { type: CardType; srsType?: SrsType | undefined };

/** Where a card stands, in the app's words: its place's name, put aside, flagged. */
function standingOf(card: Card, srsType: SrsType | undefined): string[] {
  const words: string[] = [];
  if (srsType) words.push(placeName(srsType, card.place));
  if (card.hold) words.push(HOLD_KINDS[card.hold.kind].state);
  if (card.flaggedAt !== null) words.push(FLAG_WORDS.state);
  return words;
}

/** Cards, each with its own deck's types, that have every word of `query` on them, the best first, each with its score; none for nothing typed. */
export function searchEvery<T extends Of & { card: Card }>(items: readonly T[], query: string) {
  return rankCards(
    items.map((item) => ({ ...item, standing: standingOf(item.card, item.srsType) })),
    query,
  );
}

/** A deck's cards searched (`searchEvery`, the same search); all of them, as they are, for nothing typed. */
export function searchCards(cards: readonly Card[], query: string, of: Of): Card[] {
  if (searchWords(query).length === 0) return [...cards];
  return searchEvery(
    cards.map((card) => ({ card, ...of })),
    query,
  ).map((found) => found.card);
}

export type Lighting = {
  /** Any words of the card's, its found parts lit. */
  runs: (text: string) => LitRun[];
  /** The first of the card's values found in, as it stands on the card: where to say it was found when what's drawn of the card doesn't show it. */
  foundIn: string | null;
};

/** What was found of `words` on a card, to light wherever it's drawn (`cardLighting`). */
export function lightingOf(card: Card, words: SearchWords, of: Of): Lighting {
  return cardLighting({ card, type: of.type, standing: standingOf(card, of.srsType) }, words);
}
