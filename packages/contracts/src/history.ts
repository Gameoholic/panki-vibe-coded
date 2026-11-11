/** @panki What happened, as kept: review sessions, the events ledger, days and videos for the stats (`ReviewSession`, `NewEvent`, `EVENT_KINDS`, `Day`, `ContinueVideo`). */
import { z } from "zod";
import { CardId } from "./card";
import { DeckId } from "./deck";
import { HexColour, SrsStageId, SrsTypeId } from "./srs";
import { GoalKind, StreakId, StreakPer } from "./streaks";
import { VideoId } from "./transcription";
import { SAVED_MAX, SavedVideo } from "./watching";

/**
 * The silo: everything that happens is kept, needed now or not. What a stat might one day want is recorded where
 * it happens, with its timing. The API stamps every time; the browser only ever sends how long something took
 * (a span measured on its own clock), never when.
 */

/** A span in ms, measured by the browser between two of its own moments. */
export const Ms = z.number().int().nonnegative().max(86_400_000);

/** A session with one deck. Minted by the browser, so a retried start returns the one that already exists. */
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
/** Ending a session. One left part-way says which card was on screen and for how long, so that showing counts too. */
export const ReviewSessionEnd = z.object({
  how: z.enum(["done", "left"]),
  cardId: CardId.optional(),
  shownMs: Ms.optional(),
  revealed: z.boolean().optional(),
  /** Where that card stood: on its front, or turned to its back. */
  phase: z.enum(["front", "back"]).optional(),
});
export type ReviewSessionEnd = z.infer<typeof ReviewSessionEnd>;
export const ReviewSessionResponse = z.object({ session: ReviewSession });

/**
 * The ledger: one row per thing that happens in the browser that no table is shaped for. A new kind is a new entry
 * here and nothing else; the API stores the kind and the data as they come. `at` is the browser's clock, kept as a
 * hint for ordering inside a batch; the API's own stamp is the time that counts.
 */
// `tile`: a tile's window or view picked on the device (its id, and the window or the view it was set to).
export const EVENT_KINDS = ["app-open", "app-show", "app-hide", "screen", "layout", "theme", "sort", "keys", "pick", "example", "tile"] as const;
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
 * The most one showing of a card counts for in the time spent studying, 2 minutes: a card left on screen while away isn't time spent on it. What's kept is the time as measured; only
 * what's worked out from it is capped.
 */
export const CARD_TIME_MAX_MS = 120_000;

/** A day on the account's clock, "YYYY-MM-DD", turning over at the Settings' hour. */
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type Day = z.infer<typeof Day>;
const Count = z.number().int().nonnegative();

/** A run of days, as the pill of an extension from before reads a streak: Sunday-first this week, today's place in it. */
const Streak = z.object({
  /** Days in a row, counting today if it counts and yesterday if not. */
  current: Count,
  best: Count,
  /** This week, Sunday first: whether each day counted. Days still to come are false. */
  week: z.array(z.boolean()).length(7),
  /** Today's index in `week`, 0 = Sunday. */
  todayIndex: z.number().int().min(0).max(6),
});

/**
 * One of the account's streaks as it stands, worked out on read over every deck from each period's facts
 * (`PeriodFacts`), a period being what the streak's type counts per (`STREAK_PERIODS`: Daily a day, Weekly a week from
 * Sunday), from the day Count from names on: the run, this period's goals by group, and whether YouTube's reminder is
 * on for it now (`atRisk`, a code name never said on screen): Streaks on, a run to lose, this period not counting yet,
 * its last day, and the clock past Starts at; whether it shows on YouTube is `Settings.reminderOnYouTube`'s to say.
 * Every period is named by the day it starts on.
 */
export const StreakState = z.object({
  id: StreakId,
  name: z.string(),
  per: StreakPer,
  /** Periods in a row, counting this one if it counts and the one before if not. */
  current: Count,
  best: Count,
  /**
   * The row the tile draws, oldest first: for a streak per day this week's days, Sunday first; per week the past seven
   * weeks, this one last. Whether each counted; days still to come didn't.
   */
  row: z.array(z.object({ start: Day, counted: z.boolean() })).length(7),
  /** This period's place in `row`. */
  rowNow: z.number().int().min(0).max(6),
  /** Whether this period counts already. */
  now: z.boolean(),
  /**
   * Each group of goals over this period, the group nearest to being met first (others in the streak's order), each goal
   * in its group's order: what it holds so far and what it needs. The first group is what YouTube's reminder says is left.
   */
  groups: z.array(z.array(z.object({ kind: GoalKind, have: Count, need: Count }))),
  /** The account's days left in this period, today among them: 1 for a streak per day. */
  daysLeft: Count,
  atRisk: z.boolean(),
  /** Whole hours until the day turns, rounded up, at any hour. */
  hoursLeft: Count,
  /** The periods that counted in the past 26 weeks (this week's Sunday and the 25 weeks before), oldest first. */
  counted: z.array(Day),
  /** How many of the recent periods counted, this one among them: the past 30 for a streak per day, the past 26 per week. */
  recent: z.object({ n: Count, of: Count }),
  /** The longest runs ever, longest first (the latest of runs alike first), 3 at most; the last period of a run still going is this one or the one before. */
  runs: z.array(z.object({ from: Day, to: Day, n: Count })).max(3),
});
export type StreakState = z.infer<typeof StreakState>;

/**
 * The windows a tile can cover, one registry; their words are the web's. Today is the account's day so far; 7 and 30
 * days end today; 12 months (1 y on screen) are the 12 calendar months, this one included; All time starts on the
 * first day with anything kept.
 */
export const STAT_WINDOWS = ["today", "days7", "days30", "months12", "all"] as const;
export const StatWindow = z.enum(STAT_WINDOWS);
export type StatWindow = z.infer<typeof StatWindow>;
/** A window's numbers: one of the fixed windows, or `custom`, the range a tile asked for (`Stats.custom`). */
export const WindowId = z.enum([...STAT_WINDOWS, "custom"]);
export type WindowId = z.infer<typeof WindowId>;

/**
 * The units a custom time frame counts in, one registry: its name in the picker, its short form after the number in
 * a tile's dropdown ("3 w", like 7 d and 1 y), and the most of it a frame takes.
 */
export const FRAME_UNIT_IDS = ["day", "week", "month", "year"] as const;
export const FrameUnit = z.enum(FRAME_UNIT_IDS);
export type FrameUnit = z.infer<typeof FrameUnit>;
export const FRAME_UNITS: Record<FrameUnit, { name: string; short: string; max: number }> = {
  day: { name: "Days", short: "d", max: 365 },
  week: { name: "Weeks", short: "w", max: 104 },
  month: { name: "Months", short: "mo", max: 60 },
  year: { name: "Years", short: "y", max: 10 },
};
/**
 * A custom time frame, an amount of a unit (Custom…, "Last 3 weeks"): the days it covers are the API's to name, the
 * last ones ending today, or for a tile that looks ahead the next ones from today (`GET /api/stats?last=3&unit=week`,
 * `?next=`).
 */
export const StatFrame = z
  .object({ n: z.number().int().min(1), unit: FrameUnit })
  .superRefine((f, ctx) => {
    if (f.n > FRAME_UNITS[f.unit].max) ctx.addIssue({ code: "custom", message: `Expected ${FRAME_UNITS[f.unit].max} at most. Got ${f.n}.`, path: ["n"] });
  });
export type StatFrame = z.infer<typeof StatFrame>;
/** Which way a frame runs from today: the last N units (every tile looking back) or the next N (Coming up). */
export const FrameWay = z.enum(["last", "next"]);
export type FrameWay = z.infer<typeof FrameWay>;

/**
 * How a window's numbers come over time (`unit`): the day alone (`one`, read by the hour), a day at a time, or a
 * calendar month at a time; and a trend's (`trendUnit`, `pace`): a day, a week, or a month.
 */
export const SeriesUnit = z.enum(["one", "day", "month"]);
export type SeriesUnit = z.infer<typeof SeriesUnit>;
export const TrendUnit = z.enum(["day", "week", "month"]);
export type TrendUnit = z.infer<typeof TrendUnit>;

/**
 * A stretch of a window over time, by the day it starts on, as its `unit` says (the first month starting on the
 * window's first day), and for a trend (`pace`) as its `trendUnit` says, a week being 7 days running back
 * from the window's end, the oldest cut short.
 */
const Bucket = z.object({ start: Day, n: Count });
const Share = z.object({ right: Count, of: Count });
/** A count for each hour of the day in the day's order: the first is the hour the day turns over at (Settings). */
const Hours = z.array(Count).length(24);
/** Each weekday, Sunday first: the sum over the window, and how many of that weekday the window holds, for an average. */
const Weekdays = z.array(z.object({ n: Count, days: Count })).length(7);
/** One side of Time per card: its median in ms (none without a measured showing), the window before's, and its trend. */
const PaceSide = z.object({ ms: Count.nullable(), before: Count.nullable(), series: z.array(z.object({ start: Day, ms: Count.nullable() })) });
/** A stage as a breakdown names it: its id (or `new`), its name, its colour as it stands; null draws it plain. */
const StageKey = z.object({ key: z.string(), name: z.string(), colour: HexColour.nullable() });

/**
 * Everything the tiles show over one window, worked out on read for the decks in scope (the watching parts for the
 * whole account, whatever is in scope). Every number an integer; the browser divides. `before` is the window just
 * before to compare with (Today's is yesterday up to this moment); null for All time, and a part's `before` is null
 * then too.
 */
export const WindowStats = z.object({
  window: WindowId,
  from: Day,
  to: Day,
  before: z.object({ from: Day, to: Day }).nullable(),
  unit: SeriesUnit,
  trendUnit: TrendUnit,
  /** The custom frame these days are (`window` "custom"), for its words ("the last 3 weeks"); null for a fixed window. */
  frame: StatFrame.nullable(),
  /**
   * Reviews given, undone ones left out, each with the stage the card stood on as it was answered: an answer to a card
   * already started. A new card's first answer is `started`'s alone; the two are never added together.
   */
  reviews: z.object({
    n: Count,
    before: Count.nullable(),
    series: z.array(Bucket),
    hours: Hours,
    weekdays: Weekdays,
    stages: z.array(StageKey.extend({ n: Count })),
  }),
  /** Right out of right or a miss (`Stats`' note on a miss), by stage; never by card type, a deck's one type being the deck filter's. */
  right: Share.extend({
    before: Share.nullable(),
    series: z.array(Share.extend({ start: Day })),
    stages: z.array(StageKey.extend(Share.shape)),
  }),
  /**
   * New cards started (an answer given a card in New), against each deck's New cards a day as it stood on each day
   * (`deck_settings_changes`), counted from the day the deck was made. `daysReached` is the days whose cards started
   * reached the day's limit, of `daysWithLimit` days that had one.
   */
  started: z.object({
    n: Count,
    limit: Count,
    before: Count.nullable(),
    series: z.array(z.object({ start: Day, n: Count, limit: Count })),
    daysReached: Count,
    daysWithLimit: Count,
  }),
  /** Misses, and the living cards missed most, most first, 15 at most, each with its answers judged and where it stands now. */
  tough: z.object({
    misses: Count,
    before: Count.nullable(),
    missedCards: Count,
    cards: z
      .array(
        z.object({
          cardId: CardId,
          deckId: DeckId,
          front: z.string(),
          misses: Count,
          of: Count,
          stage: z.object({ name: z.string(), colour: HexColour.nullable() }).nullable(),
        }),
      )
      .max(15),
  }),
  /** Living cards made, by where they came from (`card_sources`): typed (none), a YouTube video, any other page. */
  added: z.object({
    n: Count,
    before: Count.nullable(),
    series: z.array(Bucket),
    sources: z.object({ typed: Count, youtube: Count, web: Count }),
  }),
  /** Time studying in ms, as `time.byDay` counts it, by side (each showing's capped time split front, back, in that order). */
  time: z.object({
    ms: Count,
    before: Count.nullable(),
    series: z.array(Bucket),
    hours: Hours,
    sides: z.object({ frontMs: Count, backMs: Count }),
    sessions: Count,
  }),
  /**
   * Time per card: the typical time a card takes, the median over the showings with both spans measured, in ms, for
   * each side: `front` from the card on screen to the flip, `back` from the flip to the answer, `total` the two. Each
   * with the window before's and a trend over the window.
   */
  pace: z.object({
    total: PaceSide,
    front: PaceSide,
    back: PaceSide,
  }),
  /**
   * The account's watching, as `Watching` counts it: videos and channels watched, videos finished, each channel's time
   * and the cards made from its videos. `ms` is time spent, the clock (what streaks count). `ofVideo` is how much of the
   * videos was watched: for each video, the distinct stretch of it covered in the window (the union of its stretches'
   * `from_ms`–`to_ms`), counted once however often or fast it was played, summed over the videos; worked out on read
   * from the stretches, nothing kept. Its breakdowns give each stretch what it added that no stretch of the same video
   * earlier in the window had covered, so they add up to the whole.
   */
  watching: z.object({
    ms: Count,
    before: Count.nullable(),
    series: z.array(Bucket),
    hours: Hours,
    weekdays: Weekdays,
    ofVideo: z.object({ ms: Count, before: Count.nullable(), series: z.array(Bucket), hours: Hours, weekdays: Weekdays }),
    videos: Count,
    channels: z.array(z.object({ name: z.string(), ms: Count, ofVideoMs: Count, cards: Count })),
    finished: Count,
    /** The five channels watched most and every other, over time. */
    top: z.array(z.string()).max(5),
    topSeries: z.array(z.object({ start: Day, ms: z.array(Count), othersMs: Count })),
  }),
});
export type WindowStats = z.infer<typeof WindowStats>;

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
 * A video watched to its end (finished: the latest of its finish and unfinish marks is a finish), for Recently watched,
 * which lists only finished videos: when it was last finished.
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
 * speed), only videos that count; days are the account's own. Video tracking is each browser's, so the tiles show
 * what's kept, and their ordinary empty state with none.
 */
export const Watching = z.object({
  today: Count,
  days7: Count,
  days30: Count,
  videos30: Count,
  channels30: Count,
  /** The past 14 days, oldest first; today last. */
  byDay: z.array(z.object({ day: Day, ms: Count })).length(14),
  /** The channels watched most in the past 30 days, most first. */
  channels: z.array(z.object({ name: z.string(), ms: Count })).max(5),
  continuing: z.array(ContinueVideo),
  /** The videos finished, the latest finished first, `WATCH.finishedMax` at most; none from an older server. */
  finished: z.array(FinishedVideo).default([]),
  /** How many videos were finished in the past 30 days. */
  finished30: Count.default(0),
});
export type Watching = z.infer<typeof Watching>;

/**
 * What the Stats tab shows, worked out by the API on every read for all decks or one. Every number is an integer;
 * the browser divides for a percentage. A "miss" is an answer with the first main answer; everything set apart
 * counts as neither right nor a miss. The tiles read `windows`, `streaks`, `ahead`, `activity` and the ladders;
 * `reviews`, `right`, `days`, `byDay`, `coming`, `added` and `time` stay as an extension from before parses them, and
 * the extension's pill reads `reviews.today`, `time.byDay` and `streak`.
 */
export const Stats = z.object({
  /** The deck, or null for every deck. */
  deckId: DeckId.nullable(),
  today: Day,
  /** Reviews (answers to cards already started), never a new card's first answer: the pill's Reviews today. */
  reviews: z.object({ total: Count, today: Count, days7: Count, days30: Count }),
  /**
   * Today's extra study (the Today tile): the answers given today in sessions started as extra study (`ReviewSession.kind`
   * "extra"), reviews and new cards apart, never added together; already counted among today's reviews and new cards.
   * Nothing from an older server.
   */
  extraToday: z.object({ reviews: Count, started: Count }).default({ reviews: 0, started: 0 }),
  /** Answers that were right, out of the answers that were right or a miss: the past 30 days, and the 30 before. */
  right: z.object({
    days30: z.object({ right: Count, of: Count }),
    before: z.object({ right: Count, of: Count }),
  }),
  /** The streak the YouTube pill shows (`Settings.pillStreak`), as the pill of an extension from before reads it. */
  streak: Streak,
  /** Every streak of the account's, in its order, over every deck whatever is in scope. None from an older server. */
  streaks: z.array(StreakState).default([]),
  /** Each window's numbers, in `STAT_WINDOWS`' order. */
  windows: z.array(WindowStats).length(STAT_WINDOWS.length),
  /** The frame asked for over the past (`?last=&unit=`), worked out as every window is (`window` "custom"); null when none was. */
  custom: WindowStats.nullable().default(null),
  /**
   * The frame asked for ahead (`?next=&unit=`, Coming up's Custom…): reviews coming due from today to its last day, as
   * `ahead.days` counts them, a day at a time up to 62 days and a calendar month at a time past that (the first month
   * starting today); null when none was asked for.
   */
  customAhead: z
    .object({ frame: StatFrame, from: Day, to: Day, unit: z.enum(["day", "month"]), series: z.array(Bucket) })
    .nullable()
    .default(null),
  /**
   * Every day with a review, time studying or watching, oldest first, for the days studied: answers, ms studying (in
   * scope), ms watched (the account's).
   */
  activity: z.array(z.object({ day: Day, reviews: Count, ms: Count, watchMs: Count })),
  /**
   * Reviews coming due, as `coming` counts them: today by the hour in the day's order (the hours gone by 0, overdue
   * ones in the hour it is, `nowHour`), how many come due later today, and each of the next 30 days today first.
   */
  ahead: z.object({
    hours: Hours,
    nowHour: z.number().int().min(0).max(23),
    laterToday: Count,
    days: z.array(Count).length(30),
  }),
  /** Cards burned in the past 30 days: burned now less burned as the 30 days began. */
  burned30: Count,
  days: z.object({ studied: Count, since: z.number().int().nonnegative().nullable() }),
  /** Reviews a day for the past year, only the days that had any. */
  byDay: z.array(z.object({ day: Day, n: Count })),
  /** Cards on each stage: one ladder per SRS type the scope's decks use. */
  ladders: z.array(
    z.object({
      srsTypeId: SrsTypeId,
      name: z.string(),
      /** Each stage with its colour as it stands (`stageColourAt`). */
      stages: z.array(z.object({ id: SrsStageId, name: z.string(), n: Count, colour: z.string() })),
      burnedName: z.string(),
      burned: Count,
      fresh: Count,
      /** New's colour, when the type has one (`newColourOf`); its row is drawn plain without. */
      newColour: HexColour.optional(),
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
