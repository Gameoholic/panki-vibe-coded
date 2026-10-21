import { z } from "zod";
import { CardId } from "./card";
import { DeckId } from "./deck";
import { SrsStageId, SrsTypeId } from "./srs";

/**
 * The silo: everything that happens is kept, needed now or not. What a stat might one day want is recorded where
 * it happens, with its timing. The API stamps every time; the browser only ever sends how long something took
 * (a span measured on its own clock), never when.
 */

/** A span in ms, measured by the browser between two of its own moments. */
export const Ms = z.number().int().nonnegative().max(86_400_000);

/** A sitting with one deck. Minted by the browser, so a retried start returns the one that already exists. */
export const ReviewSessionId = z.uuid();
export const NewReviewSession = z.object({
  id: ReviewSessionId,
  /** The day's review, or extra study started from the end screen. */
  kind: z.enum(["review", "extra"]),
});
export type NewReviewSession = z.infer<typeof NewReviewSession>;
export const ReviewSession = NewReviewSession.extend({
  deckId: DeckId,
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().nullable(),
  /** How it ended: every card done, or the screen left with cards to go. Null while it runs. */
  endedHow: z.enum(["done", "left"]).nullable(),
});
export type ReviewSession = z.infer<typeof ReviewSession>;
/** Ending a sitting. One left part-way says which card was on screen and for how long, so that showing counts too. */
export const ReviewSessionEnd = z.object({
  how: z.enum(["done", "left"]),
  cardId: CardId.optional(),
  shownMs: Ms.optional(),
  revealed: z.boolean().optional(),
});
export type ReviewSessionEnd = z.infer<typeof ReviewSessionEnd>;
export const ReviewSessionResponse = z.object({ session: ReviewSession });

/**
 * The ledger: one row per thing that happens in the browser that no table is shaped for. A new kind is a new entry
 * here and nothing else; the API stores the kind and the data as they come. `at` is the browser's clock, kept as a
 * hint for ordering inside a batch; the API's own stamp is the time that counts.
 */
export const EVENT_KINDS = ["app-open", "app-show", "app-hide", "screen", "layout", "theme", "sort"] as const;
export const EventKind = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof EventKind>;
export const NewEvent = z.object({
  kind: EventKind,
  at: z.number().int().nonnegative(),
  /** The screen's address, for `screen`. */
  path: z.string().max(300).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type NewEvent = z.infer<typeof NewEvent>;
export const EventBatch = z.object({ events: z.array(NewEvent).min(1).max(100) });
export type EventBatch = z.infer<typeof EventBatch>;

/** A day on the owner's clock, "YYYY-MM-DD", turning over at the Settings' hour. */
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type Day = z.infer<typeof Day>;
const Count = z.number().int().nonnegative();

/**
 * What the Stats tab shows, worked out by the API on every read for all decks or one. Every number is an integer;
 * the browser divides for a percentage. A "miss" is an answer with the first main answer; everything set apart
 * counts as neither right nor a miss.
 */
export const Stats = z.object({
  /** The deck, or null for every deck. */
  deckId: DeckId.nullable(),
  today: Day,
  reviews: z.object({ total: Count, today: Count, days7: Count, days30: Count }),
  /** Answers that were right, out of the answers that were right or a miss: the past 30 days, and the 30 before. */
  right: z.object({
    days30: z.object({ right: Count, of: Count }),
    before: z.object({ right: Count, of: Count }),
  }),
  streak: z.object({
    /** Days in a row with a review, counting today if it has one and yesterday if not. */
    current: Count,
    best: Count,
    /** This week, Sunday first: whether each day had a review. Days still to come are false. */
    week: z.array(z.boolean()).length(7),
    /** Today's index in `week`, 0 = Sunday. */
    todayIndex: z.number().int().min(0).max(6),
  }),
  days: z.object({ studied: Count, since: z.number().int().nonnegative().nullable() }),
  /** Reviews a day for the past year, only the days that had any. */
  byDay: z.array(z.object({ day: Day, n: Count })),
  /** Cards on each stage: one ladder per SRS type the scope's decks use. */
  ladders: z.array(
    z.object({
      srsTypeId: SrsTypeId,
      name: z.string(),
      stages: z.array(z.object({ id: SrsStageId, name: z.string(), n: Count })),
      burnedName: z.string(),
      burned: Count,
      fresh: Count,
    }),
  ),
  /** Reviews due on each of the next 7 days, today first (what's left of it). */
  coming: z.array(Count).length(7),
  /** Cards added in each of the past 12 weeks, oldest first; the last is this week. */
  added: z.array(Count).length(12),
  time: z.object({
    /** Minutes aren't stored: ms spent in reviews each of the past 14 days, oldest first. */
    byDay: z.array(z.object({ day: Day, ms: Count })),
    /** The typical time from a card coming up to its answer, past 30 days; null before any. */
    perCardMs: Count.nullable(),
    sessions30: Count,
  }),
  /** The cards missed most in the past 30 days, most first. */
  tough: z.array(z.object({ cardId: CardId, deckId: DeckId, front: z.string(), misses: Count })),
});
export type Stats = z.infer<typeof Stats>;
export const StatsResponse = z.object({ stats: Stats });
