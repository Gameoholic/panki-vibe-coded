/** @panki A deck, and its own settings with their defaults (`Deck`, `NewDeck`, `DeckSettings`, `DEFAULT_DECK_SETTINGS`). */
import { z } from "zod";
import { SrsTypeId } from "./srs";
import { CardTypeId } from "./type";

/** Minted by the browser, so a retried POST returns the deck that already exists instead of a second one. */
export const DeckId = z.uuid();

export const NewDeck = z.object({
  id: DeckId,
  name: z.string().trim().min(1).max(100),
  /** What a card in this deck is made of. Set once, when the deck is made. */
  typeId: CardTypeId,
  /** How its cards are scheduled. Picked when the deck is made and changeable in its settings. */
  srsTypeId: SrsTypeId,
});

/**
 * What of a review is each deck's own: how many new cards and reviews a day. Only what was changed is stored, the rest
 * reads as `DEFAULT_DECK_SETTINGS`, so a new setting is no migration. How every review runs, the same for every deck, is
 * the account's (`ReviewSettings`); a deck that kept those keys from before keeps them, read by nothing, as it does an
 * older shape's `holdAnswer`.
 */
export const DeckSettings = z.object({
  /** New cards started a day in this deck. */
  newPerDay: z.number().int().min(0).max(999),
  /** Reviews of this deck a day at most, new cards not counted; null is no limit. */
  reviewsPerDay: z.number().int().min(1).max(9999).nullable(),
});
export type DeckSettings = z.infer<typeof DeckSettings>;
export const DEFAULT_DECK_SETTINGS: DeckSettings = { newPerDay: 10, reviewsPerDay: null };

/**
 * How long this deck's cards tend to take, from its answers of the past 30 days, each showing at most
 * `CARD_TIME_MAX_MS`, in ms: a new card on the day it's started and a review on its day, every showing of it that day
 * (a miss and the asking again included), one showing of a card, and one showing of a card already shown that day
 * (`againMs`: asked again after a miss, or still being learned). A showing's front stretches with how far into its
 * clip the picked word starts: `wordAtMsPerS` ms of it for each second, against `wordAtMeanMs`, the mean
 * (`Card.wordAtMs`). What the deck has none of is the account's over every deck; null with none at all. What a review's
 * time left is worked out from (`pace.ts`).
 */
export const DeckPace = z.object({
  newMs: z.number().int().nonnegative().nullable(),
  reviewMs: z.number().int().nonnegative().nullable(),
  showingMs: z.number().int().nonnegative().nullable(),
  /** None from an older server: a card asked again then takes `showingMs` a showing. */
  againMs: z.number().int().nonnegative().nullable().default(null),
  /** None from an older server, or with too few showings with the word's place to tell: where a card's word is then changes nothing. */
  wordAtMsPerS: z.number().int().nonnegative().nullable().default(null),
  wordAtMeanMs: z.number().int().nonnegative().nullable().default(null),
});
export type DeckPace = z.infer<typeof DeckPace>;
export const NO_PACE: DeckPace = { newMs: null, reviewMs: null, showingMs: null, againMs: null, wordAtMsPerS: null, wordAtMeanMs: null };

export const Deck = NewDeck.extend({
  settings: DeckSettings,
  /** Stamped by the API, ms since epoch. */
  createdAt: z.number().int().nonnegative(),
  /** Derived by the API from the cards table on every read, never stored. */
  cardCount: z.number().int().nonnegative(),
  /** Derived on every read with the API's clock and the settings: how many cards a review of this deck would show now, already within today's limits. */
  dueCount: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  /** Past today's limits: every new card not yet started, and every card due, whatever New cards a day and Reviews a day say. */
  newAvailable: z.number().int().nonnegative(),
  dueAvailable: z.number().int().nonnegative(),
  /** Derived on every read; none from an older server. */
  pace: DeckPace.default(NO_PACE),
});

/** What a deck's settings can change: the name, the SRS type its cards follow, and any of its own settings. The rules are NewDeck's and DeckSettings', never restated. */
export const DeckUpdate = z.object({
  name: NewDeck.shape.name.optional(),
  srsTypeId: SrsTypeId.optional(),
  settings: DeckSettings.partial().optional(),
});

export type NewDeck = z.infer<typeof NewDeck>;
export type Deck = z.infer<typeof Deck>;
export type DeckUpdate = z.infer<typeof DeckUpdate>;

export const DeckList = z.object({ decks: z.array(Deck) });
export const DeckResponse = z.object({ deck: Deck });
