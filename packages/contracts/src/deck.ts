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
 * How a review of one deck runs; each deck has its own. Only what the owner changed is stored, the rest reads as
 * `DEFAULT_DECK_SETTINGS`, so a new setting is no migration.
 */
export const POOL_MAX = 99;
export const DeckSettings = z.object({
  /** New cards started a day in this deck. */
  newPerDay: z.number().int().min(0).max(999),
  /** Where the day's new cards sit among the reviews: before them, after them, or scattered at random among them. */
  newPlace: z.enum(["first", "last", "scattered"]),
  /** New cards in the order they were added, or shuffled. */
  newOrder: z.enum(["added", "shuffled"]),
  /** Reviews of this deck a day at most, new cards not counted; null is no limit. */
  reviewsPerDay: z.number().int().min(1).max(9999).nullable(),
  /** Which due cards come first: at random, or the longest overdue. */
  reviewOrder: z.enum(["random", "overdue"]),
  /**
   * Where a card asked again in the same review goes back in: the end of the line, or anywhere at random. With a
   * `pool` it's always anywhere, whatever is stored: the pool is the line, so it comes back within the cards in play
   * (`againPlaceOf`). "A few cards on" (`soon`) went at the owner's word, 2026-10-23; a deck that kept it reads as the
   * default.
   */
  againPlace: z.enum(["end", "random"]),
  /** How many different cards are in play at once: the next one only joins when one of them is done for now. Null is all of them. */
  pool: z.number().int().min(1).max(POOL_MAX).nullable(),
  /**
   * Which of a card's examples a review shows (a card's own, then each one added to it, `Card.examples`): each in turn,
   * one review after another; the newest; or one at random.
   */
  exampleShown: z.enum(["rotate", "newest", "random"]),
  /**
   * Whether a review opens on today's cards (the reviews and the new ones, each ticked) before the first one, to untick
   * what's left for the next review and to add new cards past today's count (the owner's pick, B of
   * https://claude.ai/artifact/1sSZsVseDpRJpDQE1F2u62, 2026-10-26); off, it starts straight in, as it always did.
   */
  todayFirst: z.boolean(),
});
export type DeckSettings = z.infer<typeof DeckSettings>;
export type ExampleShown = DeckSettings["exampleShown"];
export const DEFAULT_DECK_SETTINGS: DeckSettings = { newPerDay: 10, newPlace: "last", newOrder: "added", reviewsPerDay: null, reviewOrder: "random", againPlace: "end", pool: null, exampleShown: "rotate", todayFirst: true };
/** Where a card asked again really goes back in: with only so many cards in play, anywhere among them. */
export const againPlaceOf = (settings: Pick<DeckSettings, "againPlace" | "pool">): DeckSettings["againPlace"] => (settings.pool === null ? settings.againPlace : "random");

export const Deck = NewDeck.extend({
  settings: DeckSettings,
  /** Stamped by the API, ms since epoch. */
  createdAt: z.number().int().nonnegative(),
  /** Derived by the API from the cards table on every read, never stored. */
  cardCount: z.number().int().nonnegative(),
  /** Derived on every read with the API's clock and the settings: how many cards a review of this deck would show now, already within today's limits. */
  dueCount: z.number().int().nonnegative(),
  newCount: z.number().int().nonnegative(),
  /** Every new card not yet started, past today's limit too: what's there to learn at all. */
  newAvailable: z.number().int().nonnegative(),
});

/** What a deck's settings can change: the name, the SRS type its cards follow, and any of how its reviews run. The rules are NewDeck's and DeckSettings', never restated. */
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
