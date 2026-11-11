import { NO_PERIOD_FACTS, STREAK_PERIODS, goalFits, goalHave, goalMet, goalNeed, type Goal, type PeriodFacts, type StreakPer, type StreakRule, type StreakState } from "@panki/contracts";
import { addDays, daysBetween, runOf, runsOf, weekdayOf, type Day } from "./time";

/** What YouTube's reminder needs of the clock (on with Streaks): whether it's past the hour it starts at today, and whole hours until the day turns. */
export type ReminderClock = { on: boolean; pastStart: boolean; hoursLeft: number };

/**
 * What one of the account's days held, as the goals read it: counts, the time spent in ms (rounded to minutes only once
 * a period's days are summed), 1 when an answer that day left all reviews done, else 0, and the same for all new cards
 * done, each learned (both replayed from the history, `cleared.ts` and `newDone.ts`).
 */
export type DayTally = { reviews: number; started: number; reviewMs: number; watchMs: number; cleared: number; newDone: number };

/**
 * A streak's period on the account's calendar, the one place it's decided. Each period is named by the day it starts
 * on: a day is itself, a week its Sunday (the weekday counted back modulo the period's length, so a day stays put). The
 * tile's row is a day's week, Sunday first, or the past seven weeks, this one last.
 */
function calendarOf(per: StreakPer, today: Day) {
  const { days, recent } = STREAK_PERIODS[per];
  const startOf = (d: Day): Day => addDays(d, -(weekdayOf(d) % days));
  const now = startOf(today);
  const rowFrom = days === 1 ? addDays(today, -weekdayOf(today)) : addDays(now, -6 * days);
  return {
    days,
    startOf,
    now,
    row: Array.from({ length: 7 }, (_, i) => addDays(rowFrom, i * days)),
    daysLeft: daysBetween(today, addDays(now, days)),
    recentFrom: addDays(now, -(recent - 1) * days),
    recent,
  };
}

/**
 * Streaks about to be kept, Count from settled by the server's clock alone: All time stays; Now (whatever day the
 * browser sends) keeps the day the same streak already had, or today when it's newly Now, so the browser never names
 * the day.
 */
export function streaksStamped(next: readonly StreakRule[], before: readonly StreakRule[], today: Day): StreakRule[] {
  return next.map((rule) => {
    if (rule.countFrom === "all") return rule;
    const kept = before.find((b) => b.id === rule.id)?.countFrom;
    return { ...rule, countFrom: kept !== undefined && kept !== "all" && kept !== "now" ? kept : today };
  });
}

/** The first day a streak counts: none for All time, else the day Count from keeps (today, for a "now" not yet stamped). */
function firstDayOf(rule: StreakRule, today: Day): Day | null {
  return rule.countFrom === "all" ? null : rule.countFrom === "now" ? today : rule.countFrom;
}

/**
 * Each period's facts from the streak's first day up to today: the days in it summed, minutes rounded down once over
 * the sum. A day before the first counts for nothing, so a week Count from starts in counts from that day on.
 */
function periodFactsOf(tallies: ReadonlyMap<Day, DayTally>, startOf: (d: Day) => Day, first: Day | null, today: Day): Map<Day, PeriodFacts> {
  const sums = new Map<Day, DayTally>();
  for (const [d, t] of tallies) {
    if (d > today || (first !== null && d < first)) continue;
    const p = startOf(d);
    const sum = sums.get(p) ?? { reviews: 0, started: 0, reviewMs: 0, watchMs: 0, cleared: 0, newDone: 0 };
    sums.set(p, {
      reviews: sum.reviews + t.reviews,
      started: sum.started + t.started,
      reviewMs: sum.reviewMs + t.reviewMs,
      watchMs: sum.watchMs + t.watchMs,
      cleared: Math.max(sum.cleared, t.cleared),
      newDone: Math.max(sum.newDone, t.newDone),
    });
  }
  return new Map([...sums].map(([p, s]) => [p, { reviews: s.reviews, started: s.started, reviewMinutes: Math.floor(s.reviewMs / 60_000), watchMinutes: Math.floor(s.watchMs / 60_000), cleared: s.cleared, newDone: s.newDone }]));
}

/**
 * Whether a period's facts meet a streak, the one test of its conditions: every goal of any one group met ("and" binds
 * tighter than "or"). A group with none left that fits the type is no group; with none left at all, nothing counts.
 */
function groupsMet(groups: readonly (readonly Goal[])[], facts: PeriodFacts): boolean {
  return groups.some((group) => group.length > 0 && group.every((g) => goalMet(g, facts)));
}

/** How near a group is to being met, 0 to 1: each goal's share of its need, capped at whole, averaged. */
function nearness(group: readonly { have: number; need: number }[]): number {
  return group.length === 0 ? 0 : group.reduce((sum, g) => sum + (g.need > 0 ? Math.min(1, g.have / g.need) : 1), 0) / group.length;
}

/**
 * Every streak as it stands today, worked out from each day's tallies: a period counts when its days together meet
 * every goal of any one of the streak's groups, so a rule changed reads the whole past again. Nothing is stored.
 * YouTube's reminder is on for a streak (`atRisk`) while Streaks is on, it has a run to lose, this period doesn't count
 * yet, today is its last day and the clock is past Starts at.
 */
export function streakStatesOf(rules: readonly StreakRule[], tallies: ReadonlyMap<Day, DayTally>, today: Day, clock: ReminderClock): StreakState[] {
  const sixMonthsFrom = addDays(today, -weekdayOf(today) - 25 * 7);
  return rules.map((rule) => {
    const cal = calendarOf(rule.per, today);
    const facts = periodFactsOf(tallies, cal.startOf, firstDayOf(rule, today), today);
    // A goal kept that doesn't fit the streak's type is read as not there.
    const groups = rule.groups.map((group) => group.filter((g) => goalFits(g.kind, rule.per))).filter((group) => group.length > 0);
    const counted = new Set<Day>();
    for (const [p, f] of facts) if (groupsMet(groups, f)) counted.add(p);
    const sorted = [...counted].sort();
    const nowFacts = facts.get(cal.now) ?? NO_PERIOD_FACTS;
    const countsNow = counted.has(cal.now);
    const { current, best } = runOf(counted, cal.now, cal.days);
    // The group nearest to being met first, the rest as the streak has them.
    const progress = groups
      .map((group) => group.map((g) => ({ kind: g.kind, have: goalHave(g, nowFacts), need: goalNeed(g) })))
      .map((group, i) => ({ group, i, near: nearness(group) }))
      .sort((a, b) => b.near - a.near || a.i - b.i)
      .map((x) => x.group);
    return {
      id: rule.id,
      name: rule.name,
      per: rule.per,
      current,
      best,
      row: cal.row.map((start) => ({ start, counted: counted.has(start) })),
      rowNow: cal.row.indexOf(cal.now),
      now: countsNow,
      groups: progress,
      daysLeft: cal.daysLeft,
      atRisk: clock.on && clock.pastStart && !countsNow && current > 0 && cal.daysLeft === 1,
      hoursLeft: clock.hoursLeft,
      counted: sorted.filter((p) => p >= sixMonthsFrom),
      recent: { n: sorted.filter((p) => p >= cal.recentFrom).length, of: cal.recent },
      runs: runsOf(sorted, cal.days)
        .sort((a, b) => b.n - a.n || b.to.localeCompare(a.to))
        .slice(0, 3),
    };
  });
}
