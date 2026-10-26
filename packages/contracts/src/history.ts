import { z } from "zod";
import { CardId } from "./card";
import { DeckId } from "./deck";
import { SrsStageId, SrsTypeId } from "./srs";
import { VideoId } from "./transcription";
import { SAVED_MAX, SavedVideo } from "./watching";

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
export const EVENT_KINDS = ["app-open", "app-show", "app-hide", "screen", "layout", "theme", "sort", "keys", "pick", "example"] as const;
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

/**
 * The most one showing of a card counts for in the time spent reviewing (the owner, 2026-10-26: "cap the time per card
 * to 2 minutes"): a card left on screen while away isn't time spent on it. What's kept is the time as measured; only
 * what's worked out from it is capped.
 */
export const CARD_TIME_MAX_MS = 120_000;

/** A day on the owner's clock, "YYYY-MM-DD", turning over at the Settings' hour. */
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type Day = z.infer<typeof Day>;
const Count = z.number().int().nonnegative();

/** A run of days, as the review streak counts them: Sunday-first this week, today's place in it. */
const Streak = z.object({
  /** Days in a row, counting today if it counts and yesterday if not. */
  current: Count,
  best: Count,
  /** This week, Sunday first: whether each day counted. Days still to come are false. */
  week: z.array(z.boolean()).length(7),
  /** Today's index in `week`, 0 = Sunday. */
  todayIndex: z.number().int().min(0).max(6),
});

/** A video left part-way, to be continued: where it was stopped, newest first. */
export const ContinueVideo = z.object({
  videoId: VideoId,
  title: z.string(),
  channel: z.string(),
  lengthMs: Count,
  stoppedAtMs: Count,
  /** When it was last watched, ms since epoch (the API's stamp). */
  lastAt: Count,
});
export type ContinueVideo = z.infer<typeof ContinueVideo>;

/**
 * A video watched to its end (finished: the latest of its finish and unfinish marks is a finish), for Recently watched
 * (the owner, 2026-10-25: "a 'recently watched' and it's for videos we FINISHED watching"): when it was last finished.
 */
export const FinishedVideo = z.object({
  videoId: VideoId,
  title: z.string(),
  channel: z.string(),
  lengthMs: Count,
  /** When it was finished, ms since epoch: the mark that made it so. */
  finishedAt: Count,
});
export type FinishedVideo = z.infer<typeof FinishedVideo>;

/**
 * The account's watching as the immersion tiles read it. Every span is ms on the clock (the time spent, whatever the
 * speed), only videos that count; days are the account's own. With Video tracking off, `on` is false and the tiles say so.
 */
export const Watching = z.object({
  on: z.boolean(),
  today: Count,
  days7: Count,
  days30: Count,
  videos30: Count,
  channels30: Count,
  /** The past 14 days, oldest first; today last. */
  byDay: z.array(z.object({ day: Day, ms: Count })).length(14),
  /** The channels watched most in the past 30 days, most first. */
  channels: z.array(z.object({ name: z.string(), ms: Count })).max(5),
  // A watch streak against a daily goal stood here until the owner had both out, 2026-10-21 ("I don't want a target goal
  // for immersion nor streaks… it might change in the future, we store the data"): every stretch is still kept.
  continuing: z.array(ContinueVideo),
  /** The videos finished, the latest finished first, `WATCH.finishedMax` at most; none from an older server. */
  finished: z.array(FinishedVideo).default([]),
});
export type Watching = z.infer<typeof Watching>;

// Together (everyone on this Panki, each as far as they shared: the owner's friend's idea, "お互いの観たYouTube動画を記録して、
// 毎日観ないとストリークが切れるシステム") stood here for a day, 2026-10-21, until the owner shelved everything about other
// people for a later feature: "everything to do with other people and not your own data is shelved".

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
  /** Days with a review. */
  streak: Streak,
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
    /**
     * Minutes aren't stored: ms spent in reviews each of the past 14 days, oldest first. Every showing of a card counts,
     * whatever its answer did (Snooze and Suspend too, an undone one too) and a card left on screen, each at most
     * `CARD_TIME_MAX_MS`.
     */
    byDay: z.array(z.object({ day: Day, ms: Count })),
    /** The typical time from a card coming up to its answer, past 30 days, each at most `CARD_TIME_MAX_MS`; null before any. */
    perCardMs: Count.nullable(),
    sessions30: Count,
  }),
  /** The cards missed most in the past 30 days, most first. */
  tough: z.array(z.object({ cardId: CardId, deckId: DeckId, front: z.string(), misses: Count })),
  /** The account's watching, whatever decks are in scope (`watching.ts`). */
  watching: Watching,
  /** The videos saved for later, newest first: the account's own, whatever decks are in scope, and whether or not its watching is kept (saving is asked for). */
  saved: z.array(SavedVideo).max(SAVED_MAX),
});
export type Stats = z.infer<typeof Stats>;
export const StatsResponse = z.object({ stats: Stats });
