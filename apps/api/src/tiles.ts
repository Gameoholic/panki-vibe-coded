import { STAT_WINDOWS, type FrameWay, type SeriesUnit, type StatFrame, type Stats, type StatWindow, type TrendUnit, type WindowId, type WindowStats } from "@panki/contracts";
import { addDays, addMonths, daysBetween, monthOf, shiftMonths, weekdayOf, type Day } from "./time";

/**
 * What every tile shows over each window, worked out on read from the rows as they're kept (`db.ts` → `stats` gathers
 * them). Pure: the clock, the account's days and hours, and every row come in. Every number is a whole one.
 */

const DAY_MS = 86_400_000;

/** An answer that stands (not undone), with the stage its card stood on as it was answered (null when that stage is no longer on its ladder). */
export type TileAnswer = { at: number; cardId: string; deckId: string; miss: number | null; stage: string | null; started: boolean; living: boolean };
/**
 * A card shown, its time already capped and split front, back in that order (`CARD_TIME_MAX_MS`). `measured` when it
 * stands and both its spans were measured, as the typical card reads it.
 */
export type TileShowing = { at: number; deckId: string; frontMs: number; backMs: number; measured: boolean };
export type TileSession = { startedAt: number; deckId: string };
export type TileCard = { createdAt: number; deckId: string; source: "typed" | "youtube" | "web" };
/** A stretch watched of a video that counts: when, the time it took, and the part of the video it covered. */
export type TileStretch = { at: number; videoId: string; channel: string | null; spentMs: number; fromMs: number; toMs: number };
/** A card made from a YouTube video, any deck's, deleted since or not, with the video's channel when it was known. */
export type TileVideoCard = { createdAt: number; channel: string | null };
export type TileStage = { key: string; name: string; colour: string | null };
export type TilesInput = {
  now: number;
  today: Day;
  day: (at: number) => Day;
  /** The hour an instant falls in, in the day's order. */
  hour: (at: number) => number;
  answers: readonly TileAnswer[];
  showings: readonly TileShowing[];
  sessions: readonly TileSession[];
  cards: readonly TileCard[];
  stretches: readonly TileStretch[];
  videoCards: readonly TileVideoCard[];
  /** When each finished video was finished. */
  finishes: readonly number[];
  /** The decks in scope, in their order. */
  decks: readonly string[];
  /** Every stage a breakdown may name, in the ladders' order, New first. */
  stages: readonly TileStage[];
  /** A deck's New cards a day as it stood on a day; null before the deck was made. */
  limitOf: (deckId: string, day: Day) => number | null;
  /** A living card as Toughest cards names it. */
  cardFacts: (cardId: string) => { deckId: string; front: string; stage: { name: string; colour: string | null } | null } | null;
  /** A custom frame a tile asked for over the past, its days named (`frameSpan`), worked out as a window of its own (`Stats.custom`). */
  range: FrameRange | null;
};

/** A custom frame and the days it covers. */
export type FrameRange = { frame: StatFrame; from: Day; to: Day };

type Span = { from: Day; to: Day };
type Buckets = { spans: Span[]; indexOf: (d: Day) => number };
/** A window to work out: its days, the window before to compare with (none for All time), how it comes over time. */
type Frame = { window: WindowId; frame?: StatFrame; span: Span; before: Span | null; unit: SeriesUnit; trendUnit: TrendUnit };

function bucketsOf(spans: Span[]): Buckets {
  const at = new Map<Day, number>();
  spans.forEach((s, i) => {
    for (let d = s.from; d <= s.to; d = addDays(d, 1)) at.set(d, i);
  });
  return { spans, indexOf: (d) => at.get(d) ?? -1 };
}
const eachDay = (span: Span): Span[] => {
  const out: Span[] = [];
  for (let d = span.from; d <= span.to; d = addDays(d, 1)) out.push({ from: d, to: d });
  return out;
};
const eachMonth = (span: Span): Span[] => {
  const out: Span[] = [];
  for (let m = monthOf(span.from); m <= span.to; m = addMonths(m, 1)) {
    const end = addDays(addMonths(m, 1), -1);
    out.push({ from: m < span.from ? span.from : m, to: end > span.to ? span.to : end });
  }
  return out;
};
/** Seven days at a time running back from the window's end, the oldest cut short. */
const eachWeek = (span: Span): Span[] => {
  const out: Span[] = [];
  for (let end = span.to; end >= span.from; end = addDays(end, -7)) {
    const from = addDays(end, -6);
    out.unshift({ from: from < span.from ? span.from : from, to: end });
  }
  return out;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return sorted.length % 2 === 1 ? mid : Math.round((mid + (sorted[sorted.length / 2 - 1] ?? mid)) / 2);
};
const zeros = (n: number) => Array.from({ length: n }, () => 0);

/**
 * How much of each video has been covered so far, as merged spans per video: `add` takes a stretch's span and gives
 * back the ms of it no stretch added before had covered, then counts it covered. Fed in the order watched, the adds sum
 * to each video's covered length counted once (the union of its spans), whatever the rewatching.
 */
function coverage(): (videoId: string, fromMs: number, toMs: number) => number {
  const covered = new Map<string, [number, number][]>();
  return (videoId, fromMs, toMs) => {
    const [a, b] = fromMs <= toMs ? [fromMs, toMs] : [toMs, fromMs];
    const spans = covered.get(videoId) ?? [];
    let fresh = b - a;
    for (const [x, y] of spans) fresh -= Math.max(0, Math.min(b, y) - Math.max(a, x));
    const merged: [number, number][] = [];
    let at: [number, number] = [a, b];
    for (const s of spans) {
      if (s[1] < at[0] || s[0] > at[1]) merged.push(s);
      else at = [Math.min(at[0], s[0]), Math.max(at[1], s[1])];
    }
    merged.push(at);
    covered.set(
      videoId,
      merged.sort((p, q) => p[0] - q[0]),
    );
    return Math.max(0, fresh);
  };
}
const add = <K>(map: Map<K, number>, key: K, n: number) => map.set(key, (map.get(key) ?? 0) + n);
const shownMs = (s: TileShowing) => s.frontMs + s.backMs;

/** Every window's numbers, in `STAT_WINDOWS`' order, the range asked for, and the days studied for Activity. */
export function tilesOf(input: TilesInput): Pick<Stats, "windows" | "custom" | "activity"> {
  const { today, day, hour } = input;
  const answers = input.answers.map((a) => ({ ...a, day: day(a.at) }));
  const showings = input.showings.map((s) => ({ ...s, day: day(s.at) }));
  const sessions = input.sessions.map((s) => ({ ...s, day: day(s.startedAt) }));
  const cards = input.cards.map((c) => ({ ...c, day: day(c.createdAt) }));
  const stretches = input.stretches.map((s) => ({ ...s, day: day(s.at) }));
  const videoCards = input.videoCards.map((c) => ({ ...c, day: day(c.createdAt) }));
  const finishes = input.finishes.map((at) => ({ at, day: day(at) }));

  const firsts = [answers[0]?.day, showings.reduce<Day | undefined>((m, s) => (m === undefined || s.day < m ? s.day : m), undefined), cards.reduce<Day | undefined>((m, c) => (m === undefined || c.day < m ? c.day : m), undefined), stretches[0]?.day];
  const first = firsts.reduce<Day>((m, d) => (d !== undefined && d < m ? d : m), today);
  const yesterday = addDays(today, -1);
  const cutoff = input.now - DAY_MS;

  /** A fixed window as a frame: its days, the window before, and how it comes over time. */
  function frameOf(window: StatWindow): Frame {
    switch (window) {
      case "today":
        return { window, span: { from: today, to: today }, before: { from: yesterday, to: yesterday }, unit: "one", trendUnit: "day" };
      case "days7":
      case "days30": {
        const n = window === "days7" ? 7 : 30;
        return { window, span: { from: addDays(today, 1 - n), to: today }, before: { from: addDays(today, 1 - 2 * n), to: addDays(today, -n) }, unit: "day", trendUnit: n === 7 ? "day" : "week" };
      }
      case "months12":
        return { window, span: { from: addMonths(today, -11), to: today }, before: { from: addMonths(today, -23), to: addDays(addMonths(today, -11), -1) }, unit: "month", trendUnit: "month" };
      case "all":
        return { window, span: { from: first, to: today }, before: null, unit: "month", trendUnit: "month" };
    }
  }

  function windowOf(frame: Frame): WindowStats {
    const { window, span, before } = frame;
    const inSpan = (d: Day) => d >= span.from && d <= span.to;
    // Today's window before is yesterday up to this moment of it; every other window's is the whole span before.
    const inBefore = (d: Day, at: number) => (before === null ? false : window === "today" ? d === yesterday && at <= cutoff : d >= before.from && d <= before.to);
    const spansBy = (unit: SeriesUnit | TrendUnit) => (unit === "one" ? [span] : unit === "day" ? eachDay(span) : unit === "week" ? eachWeek(span) : eachMonth(span));
    const series = bucketsOf(spansBy(frame.unit));
    const trend = bucketsOf(spansBy(frame.trendUnit));
    const spanDays = eachDay(span).map((s) => s.from);
    const weekdayDays = zeros(7);
    for (const d of spanDays) weekdayDays[weekdayOf(d)] = (weekdayDays[weekdayOf(d)] ?? 0) + 1;
    const beforeOr = (n: number) => (before === null ? null : n);

    // Reviews, Right, New cards and Toughest cards: the answers.
    let reviews = 0;
    let reviewsBefore = 0;
    const reviewSeries = zeros(series.spans.length);
    const reviewHours = zeros(24);
    const reviewWeekdays = zeros(7);
    const reviewStages = new Map<string, number>();
    const share = () => ({ right: 0, of: 0 });
    const right = share();
    const rightBefore = share();
    const rightSeries = series.spans.map(share);
    const rightStages = new Map<string, { right: number; of: number }>();
    const judge = (to: { right: number; of: number }, miss: number) => {
      to.of += 1;
      if (miss === 0) to.right += 1;
    };
    let started = 0;
    let startedBefore = 0;
    const startedSeries = zeros(series.spans.length);
    const startedByDay = new Map<Day, number>();
    let misses = 0;
    let missesBefore = 0;
    const byCard = new Map<string, { misses: number; of: number; lastAt: number }>();
    for (const a of answers) {
      // An answer is a review (a card already started) or a new card (its first answer, starting it), never both, and the
      // two are never added together: Reviews counts the one, New cards the other.
      if (inBefore(a.day, a.at)) {
        if (a.started) startedBefore += 1;
        else reviewsBefore += 1;
        if (a.miss !== null) judge(rightBefore, a.miss);
        if (a.miss === 1) missesBefore += 1;
      }
      if (!inSpan(a.day)) continue;
      const b = series.indexOf(a.day);
      if (!a.started) {
        reviews += 1;
        if (b >= 0) reviewSeries[b] = (reviewSeries[b] ?? 0) + 1;
        const h = hour(a.at);
        reviewHours[h] = (reviewHours[h] ?? 0) + 1;
        const wd = weekdayOf(a.day);
        reviewWeekdays[wd] = (reviewWeekdays[wd] ?? 0) + 1;
        if (a.stage !== null) add(reviewStages, a.stage, 1);
      }
      if (a.started) {
        started += 1;
        if (b >= 0) startedSeries[b] = (startedSeries[b] ?? 0) + 1;
        add(startedByDay, a.day, 1);
      }
      if (a.miss === null) continue;
      judge(right, a.miss);
      const bucket = rightSeries[b];
      if (bucket) judge(bucket, a.miss);
      if (a.stage !== null) {
        const s = rightStages.get(a.stage) ?? share();
        judge(s, a.miss);
        rightStages.set(a.stage, s);
      }
      // A miss on a card since deleted still counts; it just isn't a card to work on any more.
      if (a.miss === 1) misses += 1;
      if (!a.living) continue;
      const card = byCard.get(a.cardId) ?? { misses: 0, of: 0, lastAt: 0 };
      card.of += 1;
      if (a.miss === 1) card.misses += 1;
      card.lastAt = Math.max(card.lastAt, a.at);
      byCard.set(a.cardId, card);
    }

    // New cards against the limits as they stood each day.
    let limit = 0;
    let daysReached = 0;
    let daysWithLimit = 0;
    const limitSeries = zeros(series.spans.length);
    for (const d of spanDays) {
      let dayLimit = 0;
      for (const deckId of input.decks) {
        const n = input.limitOf(deckId, d);
        if (n === null) continue;
        dayLimit += n;
      }
      limit += dayLimit;
      const b = series.indexOf(d);
      if (b >= 0) limitSeries[b] = (limitSeries[b] ?? 0) + dayLimit;
      if (dayLimit === 0) continue;
      daysWithLimit += 1;
      if ((startedByDay.get(d) ?? 0) >= dayLimit) daysReached += 1;
    }

    const missed = [...byCard.entries()].filter(([, c]) => c.misses > 0);
    const toughCards = missed
      .sort(([, x], [, y]) => y.misses - x.misses || y.misses * x.of - x.misses * y.of || y.lastAt - x.lastAt)
      .flatMap(([cardId, c]) => {
        const facts = input.cardFacts(cardId);
        return facts ? [{ cardId, deckId: facts.deckId, front: facts.front, misses: c.misses, of: c.of, stage: facts.stage }] : [];
      })
      .slice(0, 15);

    // Added: the cards made, deleted since or not; what was done is counted as done.
    let addedN = 0;
    let addedBefore = 0;
    const addedSeries = zeros(series.spans.length);
    const sources = { typed: 0, youtube: 0, web: 0 };
    for (const c of cards) {
      if (inBefore(c.day, c.createdAt)) addedBefore += 1;
      if (!inSpan(c.day)) continue;
      addedN += 1;
      const b = series.indexOf(c.day);
      if (b >= 0) addedSeries[b] = (addedSeries[b] ?? 0) + 1;
      sources[c.source] += 1;
    }

    // Time studying and Time per card: the showings.
    let ms = 0;
    let msBefore = 0;
    const timeSeries = zeros(series.spans.length);
    const timeHours = zeros(24);
    const spent = { frontMs: 0, backMs: 0 };
    // Time per card, each side: front (on screen to the flip), back (the flip to the answer), total.
    const SIDES = { total: shownMs, front: (s: TileShowing) => s.frontMs, back: (s: TileShowing) => s.backMs } as const;
    type Side = keyof typeof SIDES;
    const sideNames = Object.keys(SIDES) as Side[];
    const paceNow = { total: [] as number[], front: [] as number[], back: [] as number[] };
    const paceBefore = { total: [] as number[], front: [] as number[], back: [] as number[] };
    const paceTrend = { total: trend.spans.map((): number[] => []), front: trend.spans.map((): number[] => []), back: trend.spans.map((): number[] => []) };
    for (const s of showings) {
      const total = shownMs(s);
      if (inBefore(s.day, s.at)) {
        msBefore += total;
        if (s.measured) for (const side of sideNames) paceBefore[side].push(SIDES[side](s));
      }
      if (!inSpan(s.day)) continue;
      ms += total;
      const b = series.indexOf(s.day);
      if (b >= 0) timeSeries[b] = (timeSeries[b] ?? 0) + total;
      const h = hour(s.at);
      timeHours[h] = (timeHours[h] ?? 0) + total;
      spent.frontMs += s.frontMs;
      spent.backMs += s.backMs;
      if (!s.measured) continue;
      for (const side of sideNames) {
        paceNow[side].push(SIDES[side](s));
        paceTrend[side][trend.indexOf(s.day)]?.push(SIDES[side](s));
      }
    }
    const paceOf = (side: Side) => ({
      ms: median(paceNow[side]),
      before: before === null ? null : median(paceBefore[side]),
      series: trend.spans.map((t, i) => ({ start: t.from, ms: median(paceTrend[side][i] ?? []) })),
    });
    const sessionCount = sessions.filter((s) => inSpan(s.day)).length;

    // Watching: the stretches that count, whatever decks are in scope.
    let watchMs = 0;
    let watchBefore = 0;
    const watchSeries = zeros(series.spans.length);
    const watchHours = zeros(24);
    const watchWeekdays = zeros(7);
    const videos = new Set<string>();
    const channelMs = new Map<string, number>();
    // Of video: what each stretch adds of its video that the window (or the window before) hadn't covered yet.
    const fresh = coverage();
    const freshBefore = coverage();
    let videoMs = 0;
    let videoBefore = 0;
    const videoSeries = zeros(series.spans.length);
    const videoHours = zeros(24);
    const videoWeekdays = zeros(7);
    const channelVideoMs = new Map<string, number>();
    for (const s of stretches) {
      if (inBefore(s.day, s.at)) {
        watchBefore += s.spentMs;
        videoBefore += freshBefore(s.videoId, s.fromMs, s.toMs);
      }
      if (!inSpan(s.day)) continue;
      watchMs += s.spentMs;
      const added = fresh(s.videoId, s.fromMs, s.toMs);
      videoMs += added;
      const b = series.indexOf(s.day);
      if (b >= 0) {
        watchSeries[b] = (watchSeries[b] ?? 0) + s.spentMs;
        videoSeries[b] = (videoSeries[b] ?? 0) + added;
      }
      const h = hour(s.at);
      watchHours[h] = (watchHours[h] ?? 0) + s.spentMs;
      videoHours[h] = (videoHours[h] ?? 0) + added;
      const wd = weekdayOf(s.day);
      watchWeekdays[wd] = (watchWeekdays[wd] ?? 0) + s.spentMs;
      videoWeekdays[wd] = (videoWeekdays[wd] ?? 0) + added;
      videos.add(s.videoId);
      if (s.channel !== null) {
        add(channelMs, s.channel, s.spentMs);
        add(channelVideoMs, s.channel, added);
      }
    }
    // The cards made from each channel's videos, for Channels' Cards.
    const channelCards = new Map<string, number>();
    for (const c of videoCards) if (inSpan(c.day) && c.channel !== null) add(channelCards, c.channel, 1);
    const channels = [...channelMs.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
    const top = channels.slice(0, 5).map(([name]) => name);
    const topSeries = series.spans.map((s) => ({ start: s.from, ms: top.map(() => 0), othersMs: 0 }));
    for (const s of stretches) {
      if (!inSpan(s.day)) continue;
      const bucket = topSeries[series.indexOf(s.day)];
      if (!bucket) continue;
      const at = s.channel === null ? -1 : top.indexOf(s.channel);
      if (at >= 0) bucket.ms[at] = (bucket.ms[at] ?? 0) + s.spentMs;
      else bucket.othersMs += s.spentMs;
    }

    const stageRows = input.stages.filter((s) => (reviewStages.get(s.key) ?? 0) > 0);
    return {
      window,
      from: span.from,
      to: span.to,
      before,
      unit: frame.unit,
      trendUnit: frame.trendUnit,
      frame: frame.frame ?? null,
      reviews: {
        n: reviews,
        before: beforeOr(reviewsBefore),
        series: series.spans.map((s, i) => ({ start: s.from, n: reviewSeries[i] ?? 0 })),
        hours: reviewHours,
        weekdays: reviewWeekdays.map((n, i) => ({ n, days: weekdayDays[i] ?? 0 })),
        stages: stageRows.map((s) => ({ ...s, n: reviewStages.get(s.key) ?? 0 })),
      },
      right: {
        ...right,
        before: before === null ? null : rightBefore,
        series: series.spans.map((s, i) => ({ start: s.from, ...(rightSeries[i] ?? share()) })),
        stages: input.stages.flatMap((s) => {
          const r = rightStages.get(s.key);
          return r && r.of > 0 ? [{ ...s, ...r }] : [];
        }),
      },
      started: {
        n: started,
        limit,
        before: beforeOr(startedBefore),
        series: series.spans.map((s, i) => ({ start: s.from, n: startedSeries[i] ?? 0, limit: limitSeries[i] ?? 0 })),
        daysReached,
        daysWithLimit,
      },
      tough: { misses, before: beforeOr(missesBefore), missedCards: missed.length, cards: toughCards },
      added: {
        n: addedN,
        before: beforeOr(addedBefore),
        series: series.spans.map((s, i) => ({ start: s.from, n: addedSeries[i] ?? 0 })),
        sources,
      },
      time: {
        ms,
        before: beforeOr(msBefore),
        series: series.spans.map((s, i) => ({ start: s.from, n: timeSeries[i] ?? 0 })),
        hours: timeHours,
        sides: spent,
        sessions: sessionCount,
      },
      pace: { total: paceOf("total"), front: paceOf("front"), back: paceOf("back") },
      watching: {
        ms: watchMs,
        before: beforeOr(watchBefore),
        series: series.spans.map((s, i) => ({ start: s.from, n: watchSeries[i] ?? 0 })),
        hours: watchHours,
        weekdays: watchWeekdays.map((n, i) => ({ n, days: weekdayDays[i] ?? 0 })),
        ofVideo: {
          ms: videoMs,
          before: beforeOr(videoBefore),
          series: series.spans.map((s, i) => ({ start: s.from, n: videoSeries[i] ?? 0 })),
          hours: videoHours,
          weekdays: videoWeekdays.map((n, i) => ({ n, days: weekdayDays[i] ?? 0 })),
        },
        videos: videos.size,
        channels: channels.map(([name, n]) => ({ name, ms: n, ofVideoMs: channelVideoMs.get(name) ?? 0, cards: channelCards.get(name) ?? 0 })),
        finished: finishes.filter((f) => inSpan(f.day)).length,
        top,
        topSeries,
      },
    };
  }

  // Days studied: every day with a review, time studying or watching.
  const byDay = new Map<Day, { reviews: number; ms: number; watchMs: number }>();
  const dayOf = (d: Day) => {
    const entry = byDay.get(d) ?? { reviews: 0, ms: 0, watchMs: 0 };
    byDay.set(d, entry);
    return entry;
  };
  // A review is an answer to a card already started; a new card's first answer is a new card, never a review.
  for (const a of answers) if (!a.started) dayOf(a.day).reviews += 1;
  for (const s of showings) dayOf(s.day).ms += shownMs(s);
  for (const s of stretches) dayOf(s.day).watchMs += s.spentMs;
  const activity = [...byDay.entries()]
    .filter(([d, e]) => d <= today && daysBetween(d, today) >= 0 && (e.reviews > 0 || e.ms > 0 || e.watchMs > 0))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, e]) => ({ day: d, ...e }));

  return { windows: STAT_WINDOWS.map((w) => windowOf(frameOf(w))), custom: input.range ? windowOf(rangeFrame(input.range)) : null, activity };
}

/**
 * The days a custom frame covers, the server's to name: the last N units ending today, or the next N from today; a
 * week is 7 days, a month runs to the same day of the month (held to its last day), a year 12 months.
 */
export function frameSpan(way: FrameWay, frame: StatFrame, today: Day): Span {
  const days = frame.unit === "day" ? frame.n : frame.unit === "week" ? 7 * frame.n : null;
  const months = frame.unit === "month" ? frame.n : frame.unit === "year" ? 12 * frame.n : 0;
  if (way === "last") return { from: days !== null ? addDays(today, 1 - days) : addDays(shiftMonths(today, -months), 1), to: today };
  return { from: today, to: days !== null ? addDays(today, days - 1) : addDays(shiftMonths(today, months), -1) };
}

/**
 * A frame asked for ahead (Coming up's Custom…): the reviews coming due each day of it (`coming`, a count a day from
 * today), a day at a time up to 62 days and a calendar month at a time past that, the first month starting today.
 */
export function aheadOf(frame: StatFrame, span: Span, coming: readonly number[]): NonNullable<Stats["customAhead"]> {
  const n = daysBetween(span.from, span.to) + 1;
  const unit = n <= 62 ? "day" : "month";
  const buckets = unit === "day" ? eachDay(span) : eachMonth(span);
  return {
    frame,
    from: span.from,
    to: span.to,
    unit,
    series: buckets.map((b) => {
      let total = 0;
      for (let k = daysBetween(span.from, b.from); k <= daysBetween(span.from, b.to); k++) total += coming[k] ?? 0;
      return { start: b.from, n: total };
    }),
  };
}

/**
 * A frame asked for over the past as a window: its days, the same number of days just before it, and how it comes
 * over time by its length: a day alone by the hour, up to 62 days a day at a time, past that a month at a time; a
 * trend a day at a time up to 14 days, a week up to 92, else a month.
 */
function rangeFrame(range: FrameRange): Frame {
  const { from, to } = range;
  const n = daysBetween(from, to) + 1;
  return {
    window: "custom",
    frame: range.frame,
    span: { from, to },
    before: { from: addDays(from, -n), to: addDays(from, -1) },
    unit: n === 1 ? "one" : n <= 62 ? "day" : "month",
    trendUnit: n <= 14 ? "day" : n <= 92 ? "week" : "month",
  };
}
