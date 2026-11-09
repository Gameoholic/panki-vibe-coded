/** @panki How every review runs, the account's, the same for every deck, and the defaults (`ReviewSettings`, `DEFAULT_REVIEW_SETTINGS`, `ExampleShown`, `againPlaceOf`). */
import { z } from "zod";

/** The most cards Cards at a time can keep in play. */
export const POOL_MAX = 99;

/**
 * How every review runs, the same for every deck: the account's own, flat on its `Settings` (Settings → General →
 * Reviews). What differs from deck to deck (how many new cards and reviews a day, the Hold button's answer) is the deck's
 * own `DeckSettings`. Only what was changed is stored, the rest reads as `DEFAULT_REVIEW_SETTINGS`.
 */
export const ReviewSettings = z.object({
  /**
   * Whether a review opens on today's cards (the reviews and the new ones, each ticked) before the first one, to untick
   * what's left for the next review and to add new cards past today's count; off, it starts straight in.
   */
  todayFirst: z.boolean(),
  /** Where the day's new cards sit among the reviews: before them, after them, or scattered at random among them. */
  newPlace: z.enum(["first", "last", "scattered"]),
  /** New cards in the order they were added, or shuffled. */
  newOrder: z.enum(["added", "shuffled"]),
  /** Which due cards come first: at random, or the longest overdue. */
  reviewOrder: z.enum(["random", "overdue"]),
  /**
   * Where a card asked again in the same review goes back in: the end of the line, or anywhere at random. With a
   * `pool` it's always anywhere, whatever is stored: the pool is the line, so it comes back within the cards in play
   * (`againPlaceOf`).
   */
  againPlace: z.enum(["end", "random"]),
  /** How many different cards are in play at once: the next one only joins when one of them is done for now. Null is all of them. */
  pool: z.number().int().min(1).max(POOL_MAX).nullable(),
  /**
   * Which of a card's examples a review shows (a card's own, then each one added to it, `Card.examples`): each in turn,
   * one review after another; the newest; or one at random.
   */
  exampleShown: z.enum(["rotate", "newest", "random"]),
});
export type ReviewSettings = z.infer<typeof ReviewSettings>;
export type ExampleShown = ReviewSettings["exampleShown"];
export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = { todayFirst: true, newPlace: "last", newOrder: "added", reviewOrder: "random", againPlace: "end", pool: null, exampleShown: "rotate" };
/** The keys of how every review runs, the ones a deck kept before they were the account's. */
export const REVIEW_SETTING_KEYS = Object.keys(ReviewSettings.shape) as (keyof ReviewSettings)[];

/** Where a card asked again really goes back in: with only so many cards in play, anywhere among them. */
export const againPlaceOf = (settings: Pick<ReviewSettings, "againPlace" | "pool">): ReviewSettings["againPlace"] => (settings.pool === null ? settings.againPlace : "random");
