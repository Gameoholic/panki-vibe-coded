/** @panki Streaks: goal kinds and streak types, one registry each (`GOAL_KINDS`, `STREAK_PERIODS`, `StreakRule`, `goalFits`, `groupsSwitchedTo`, `goalMet`, `goalLeftWords`, `goalRuleWords`). */
import { z } from "zod";

/**
 * A streak is a name, its type (what it counts per: a day or a week), and its goals (Conditions on screen), each a kind and a number, every one of them
 * needed for a period to count. Nothing is stored of a streak but its rule (a setting, `Settings.streaks`): which
 * periods counted is worked out on every read from what was kept of each day (`PeriodFacts`), so a rule changed reads
 * the whole past again under it.
 */

/**
 * What a period held, as every goal reads it: each a whole number over the account's days in it. Minutes are whole
 * minutes of the time spent (each showing of a card at most `CARD_TIME_MAX_MS`), summed over the period and rounded down
 * once. `cleared` is 1 when, on a day in it, an answer landed with nothing left due in any deck (All reviews done), and
 * `newDone` 1 when one landed with every deck's new cards for the day done (All new cards done), each worked out on read
 * by replaying the history, never stored; else 0.
 */
export const PeriodFacts = z.object({
  reviews: z.number().int().nonnegative(),
  started: z.number().int().nonnegative(),
  reviewMinutes: z.number().int().nonnegative(),
  watchMinutes: z.number().int().nonnegative(),
  cleared: z.number().int().min(0).max(1),
  newDone: z.number().int().min(0).max(1),
});
export type PeriodFacts = z.infer<typeof PeriodFacts>;
export const NO_PERIOD_FACTS: PeriodFacts = { reviews: 0, started: 0, reviewMinutes: 0, watchMinutes: 0, cleared: 0, newDone: 0 };

/** A streak's type, what it counts per (a day or a week), in the order offered. Each is one entry of `STREAK_PERIODS` and nothing else knows one by name. */
export const STREAK_PER_IDS = ["day", "week"] as const;
export const StreakPer = z.enum(STREAK_PER_IDS);
export type StreakPer = z.infer<typeof StreakPer>;

export type StreakPeriodEntry = {
  /** Its name in Streak type. */
  name: string;
  /** A run of them said: "1 day", "3 weeks". */
  one: string;
  many: string;
  /** The one going on, in a sentence ("to go today") and heading one ("Today counts"). */
  now: string;
  Now: string;
  /** How many of the account's days it spans; a week runs Sunday to Saturday, as the heat map's columns. */
  days: 1 | 7;
  /** How many of the latest a streak's Show more says counted ("12 of the past 30 days"). */
  recent: number;
  /** Whether the YouTube pill says the unit after the run ("3 weeks"); a streak per day is its number alone. */
  unitOnPill: boolean;
};

/** Every period a streak can count per, one registry: its words and its length. */
export const STREAK_PERIODS: Record<StreakPer, StreakPeriodEntry> = {
  day: { name: "Daily", one: "day", many: "days", now: "today", Now: "Today", days: 1, recent: 30, unitOnPill: false },
  week: { name: "Weekly", one: "week", many: "weeks", now: "this week", Now: "This week", days: 7, recent: 26, unitOnPill: true },
};

/** A run of periods in words: "1 day", "3 weeks". */
export const periodCountWords = (per: StreakPer, n: number): string => `${n.toLocaleString()} ${n === 1 ? STREAK_PERIODS[per].one : STREAK_PERIODS[per].many}`;

/** The kinds a goal can be, in the order they're offered. Each is one entry of `GOAL_KINDS` and nothing else knows one by name. */
export const GOAL_KIND_IDS = ["reviews", "new", "reviewing", "watching", "cleared", "newDone"] as const;
export const GoalKind = z.enum(GOAL_KIND_IDS);
export type GoalKind = z.infer<typeof GoalKind>;

/** What's left of a goal, said: a count of things (one and many), minutes of something, or a thing done once. */
type LeftWords = { kind: "count"; one: string; many: string } | { kind: "minutes"; doing: string } | { kind: "once"; words: string };

export type GoalKindEntry = {
  /** Its name on screen: in a goal's row, on a tile. */
  name: string;
  /** Which of a period's facts it reads. */
  fact: keyof PeriodFacts;
  /** Whether it takes a number; one that doesn't is met by its fact being 1. */
  numbered: boolean;
  /** The unit after its number in a goal's row, when it has one. */
  suffix: string;
  /** Whether a review gets it done: YouTube's reminder offers Review only while such a goal is left. */
  byReviewing: boolean;
  /** The highest number it takes. */
  max: number;
  /** The number a goal of it starts at when it's added. */
  start: number;
  left: LeftWords;
  /** The streak types it fits: a goal that means nothing over a week is a daily streak's alone. */
  fits: readonly StreakPer[];
  /** The one line under its row, when without it the goal couldn't be guessed. */
  why?: string;
};

/** Every kind of goal, one registry: what it counts, its unit, its words, the streak types it fits. */
export const GOAL_KINDS: Record<GoalKind, GoalKindEntry> = {
  reviews: { name: "Reviews", fact: "reviews", numbered: true, suffix: "", byReviewing: true, max: 999, start: 20, left: { kind: "count", one: "review", many: "reviews" }, fits: STREAK_PER_IDS },
  new: { name: "New cards", fact: "started", numbered: true, suffix: "", byReviewing: true, max: 999, start: 5, left: { kind: "count", one: "new card", many: "new cards" }, fits: STREAK_PER_IDS },
  // Time on reviews and new cards alike, so it's "studying" on screen; the id stays `reviewing`, as streaks keep it.
  reviewing: { name: "Time studying", fact: "reviewMinutes", numbered: true, suffix: "min", byReviewing: true, max: 600, start: 15, left: { kind: "minutes", doing: "studying" }, fits: STREAK_PER_IDS },
  watching: { name: "Time watching", fact: "watchMinutes", numbered: true, suffix: "min", byReviewing: false, max: 600, start: 30, left: { kind: "minutes", doing: "watching" }, fits: STREAK_PER_IDS },
  // Nothing left due is a moment of a day: over a week it would ask only that it happened once.
  cleared: { name: "All reviews done", fact: "cleared", numbered: false, suffix: "", byReviewing: true, max: 1, start: 1, left: { kind: "once", words: "all reviews" }, fits: ["day"], why: "Reviewed every due card at some point in the day." },
  // Every deck has a New cards a day (0 to 999), so this carries no number of its own: a deck at 0 needs nothing.
  newDone: { name: "All new cards done", fact: "newDone", numbered: false, suffix: "", byReviewing: true, max: 1, start: 1, left: { kind: "once", words: "all new cards" }, fits: ["day"], why: "Started every new card up to each deck's New cards a day at some point in the day." },
};

/** Whether a kind of goal fits a streak type. */
export const goalFits = (kind: GoalKind, per: StreakPer): boolean => GOAL_KINDS[kind].fits.includes(per);
/** The kinds a streak of a type is offered, in the registry's order. */
export const goalKindsFor = (per: StreakPer): GoalKind[] => GOAL_KIND_IDS.filter((kind) => goalFits(kind, per));

/**
 * A streak's groups once it's switched to a type: in each group the goals that fit, kept as they are; a group left
 * empty goes; when none is left, one group of the first kind that fits at its starting number, since a streak keeps
 * one goal at least.
 */
export function groupsSwitchedTo(per: StreakPer, groups: readonly (readonly Goal[])[]): Goal[][] {
  const kept = groups.map((group) => group.filter((g) => goalFits(g.kind, per))).filter((group) => group.length > 0);
  if (kept.length > 0) return kept;
  const first = goalKindsFor(per)[0] ?? "reviews";
  return [[{ kind: first, n: GOAL_KINDS[first].start }]];
}

/** The most goals a streak has, over all its groups. */
export const GOALS_MAX = 10;
/** The most streaks an account keeps. */
export const STREAKS_MAX = 10;
export const STREAK_NAME_MAX = 40;

export const Goal = z.object({ kind: GoalKind, n: z.number().int().min(1).max(999) });
export type Goal = z.infer<typeof Goal>;

/** A streak's id: minted by the browser as it's added, never shown. */
export const StreakId = z.string().min(1).max(64);

/**
 * **Count from** on screen: `"all"` (All time) counts the whole history; a day ("YYYY-MM-DD", the account's) counts the
 * run from that day on (Now). The browser sends `"now"` to ask for Now and never a day of its own: the API keeps the
 * day it was first asked for, or today (`streaks.ts` → `streaksStamped`), so `"now"` is never kept.
 */
export const CountFrom = z.union([z.literal("all"), z.literal("now"), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
export type CountFrom = z.infer<typeof CountFrom>;

/** A streak kept before its goals stood in groups had one list of them (`goals`): read as one group, nothing rewritten. */
const fromOneList = (kept: unknown): unknown => {
  if (typeof kept !== "object" || kept === null || "groups" in kept || !("goals" in kept)) return kept;
  return { ...kept, groups: [(kept as { goals: unknown }).goals] };
};

/**
 * One streak as the account keeps it: its name, its type (`per`; a streak kept before there was a choice is daily),
 * Count from (All time where a streak kept before has none), its goals in groups (Conditions on screen: every goal of a
 * group is needed and any one group will do, so "and" binds tighter than "or"; each number within its kind's). Whether
 * a streak reminds is the account's Streak reminder alone; a `remind` a streak kept from before had of its own is read by
 * nothing (an unknown key, dropped as it parses). A goal kept that doesn't fit the type (`goalFits`) is read as not
 * there rather than refused, so a rule kept before the kinds said which types they fit still reads; the editor never
 * makes one (`groupsSwitchedTo`). The old default (Reviews ≥ 1 alone, while that meant any card answered) became today's
 * once, in the API's migration 54, never on read: read as today's, the same streak made by hand could never be kept.
 */
export const StreakRule = z.preprocess(
  fromOneList,
  z
    .object({
      id: StreakId,
      name: z.string().trim().max(STREAK_NAME_MAX),
      per: StreakPer.default("day"),
      countFrom: CountFrom.default("all"),
      groups: z.array(z.array(Goal).min(1).max(GOALS_MAX)).min(1).max(GOALS_MAX),
    })
    .superRefine((streak, ctx) => {
      if (streak.groups.flat().length > GOALS_MAX) ctx.addIssue({ code: "custom", message: `Expected ${GOALS_MAX} conditions at most. Got ${streak.groups.flat().length}.`, path: ["groups"] });
      streak.groups.forEach((group, i) =>
        group.forEach((g, j) => {
          if (g.n > GOAL_KINDS[g.kind].max) ctx.addIssue({ code: "custom", message: `Expected ${GOAL_KINDS[g.kind].max} at most. Got ${g.n}.`, path: ["groups", i, j, "n"] });
        }),
      );
    }),
);
export type StreakRule = z.infer<typeof StreakRule>;

/** The account's streaks, at least one, each id once. */
export const StreakRules = z
  .array(StreakRule)
  .min(1)
  .max(STREAKS_MAX)
  .refine((streaks) => new Set(streaks.map((s) => s.id)).size === streaks.length, { message: "Each streak has an id of its own." });

/**
 * The streak every account starts with: any card answered a day, a review or a new card, what the Streak tile counted
 * before streaks had goals. A review and a new card are never added together, so it's two groups: Reviews ≥ 1 or New
 * cards ≥ 1.
 */
export const DEFAULT_STREAKS: StreakRule[] = [
  {
    id: "streak",
    name: "Streak",
    per: "day",
    countFrom: "all",
    groups: [[{ kind: "reviews", n: 1 }], [{ kind: "new", n: 1 }]],
  },
];

/** The number a goal needs its period's fact to reach: its own, or 1 for a kind without one. */
export const goalNeed = (goal: Goal): number => (GOAL_KINDS[goal.kind].numbered ? goal.n : 1);
/** What a period's facts come to for a goal. */
export const goalHave = (goal: Pick<Goal, "kind">, facts: PeriodFacts): number => facts[GOAL_KINDS[goal.kind].fact];
/** Whether a period's facts meet a goal. */
export const goalMet = (goal: Goal, facts: PeriodFacts): boolean => goalHave(goal, facts) >= goalNeed(goal);

/** A streak's name as it's shown: its own, or "New streak" while it has none. */
export const streakNameOf = (streak: { name: string }): string => streak.name.trim() || "New streak";

/** What's left of a goal in words: "12 reviews", "10 min studying", "all reviews". `left` is the need less the have. */
export function goalLeftWords(kind: GoalKind, left: number): string {
  const words = GOAL_KINDS[kind].left;
  if (words.kind === "count") return `${left.toLocaleString()} ${left === 1 ? words.one : words.many}`;
  if (words.kind === "minutes") return `${left.toLocaleString()} min ${words.doing}`;
  return words.words;
}

/** A goal as its rule, in words: "Reviews ≥ 20", "Time studying ≥ 15 min", "All reviews done" (`need` is `goalNeed`'s). */
export function goalRuleWords(kind: GoalKind, need: number): string {
  const entry = GOAL_KINDS[kind];
  return entry.numbered ? `${entry.name} ≥ ${need.toLocaleString()}${entry.suffix ? ` ${entry.suffix}` : ""}` : entry.name;
}

/** How far a counted goal is in its period: "37 / 50", "12 / 15 min". One without a count is shown by its mark alone. */
export function goalSaysWords(kind: GoalKind, have: number, need: number): string {
  const entry = GOAL_KINDS[kind];
  return `${have.toLocaleString()} / ${need.toLocaleString()}${entry.suffix ? ` ${entry.suffix}` : ""}`;
}

/** A goal over the period going on: what it holds so far and what it needs (`StreakState.groups`). */
type GoalProgress = { kind: GoalKind; have: number; need: number };
/** The group YouTube's reminder speaks of: the one nearest to being met, which a streak's state puts first. */
export const nearestGroup = (streak: { groups: readonly (readonly GoalProgress[])[] }): readonly GoalProgress[] => streak.groups[0] ?? [];
/** Whether a review would help a streak now: a goal of its nearest group not met yet that reviewing gets done (`byReviewing`). */
export const reviewHelps = (streak: { groups: readonly (readonly GoalProgress[])[] }): boolean => nearestGroup(streak).some((g) => g.have < g.need && GOAL_KINDS[g.kind].byReviewing);

/** The goals not met yet, their left words joined: "12 reviews and 10 min studying". */
export function streakLeftWords(goals: readonly { kind: GoalKind; have: number; need: number }[]): string {
  const parts = goals.filter((g) => g.have < g.need).map((g) => goalLeftWords(g.kind, g.need - g.have));
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
