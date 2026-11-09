/** @panki A deck, and its own settings with their defaults (`Deck`, `NewDeck`, `DeckSettings`, `DEFAULT_DECK_SETTINGS`). */
import { z } from "zod";
import { SrsAnswerId, SrsTypeId } from "./srs";
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
 * What of a review is each deck's own: how many new cards and reviews a day, and the Hold button's answer. Only what was
 * changed is stored, the rest reads as `DEFAULT_DECK_SETTINGS`, so a new setting is no migration. How every review runs,
 * the same for every deck, is the account's (`ReviewSettings`); a deck that kept those keys from before keeps them,
 * read by nothing.
 */
export const DeckSettings = z.object({
  /** New cards started a day in this deck. */
  newPerDay: z.number().int().min(0).max(999),
  /** Reviews of this deck a day at most, new cards not counted; null is no limit. */
  reviewsPerDay: z.number().int().min(1).max(9999).nullable(),
  /**
   * The answer the Hold button gives in this deck once it's held past the back of a card: one of
   * the deck's SRS type's answers, by its id; none, the hold stops at the back. The deck's, since a device's keys know
   * answers only by their place and a built-in SRS type can't be changed. An id its SRS type doesn't have (the type
   * changed since) is none.
   */
  holdAnswer: SrsAnswerId.nullable(),
});
export type DeckSettings = z.infer<typeof DeckSettings>;
export const DEFAULT_DECK_SETTINGS: DeckSettings = { newPerDay: 10, reviewsPerDay: null, holdAnswer: null };

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
