import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { finishesAt, GOAL_KINDS, minutesWords, STREAK_PERIODS, weekStartOf, type Settings, type StreakRule } from "@panki/contracts";
import { marksOf, settingsFrom, type SettingRow, type WatchMarkRow } from "../db";
import { dayTalliesOf, streakStatesOf } from "../streaks";
import { coverage } from "../tiles";
import { addDays, dayReader, dayStartAt, type Day } from "../time";

/**
 * `pnpm watch:report <panki.sqlite> <yyyy-mm-dd>`: everything kept of one of the account's days of watching, to tell
 * whether its Time watching adds up. Each stretch in the order it came, each video's share, the day's total worked out
 * through the same functions the Today tile and the streaks use, and what lies between the stretches (a skip, a pause,
 * a part rewatched, a batch that waited, watching across the day's turnover).
 *
 * `pnpm watch:report <panki.sqlite> --scan`: every day kept, for watching that played on with nothing kept: a video
 * whose stretches stop part-way and that Panki then saw played into its end (a finish by end), or that went on further
 * in about the time it would take to play there; with what each day's time goals would have read with it.
 *
 * Opens the database it's given read-only and changes nothing; run it on a copy, never on an account's live file.
 * Prints no account, key or sign-in.
 */

type Stretch = { id: string; videoId: string; fromMs: number; toMs: number; spentMs: number; rate: number; at: number; device: string; forgottenAt: number | null };
type Video = { videoId: string; title: string; channel: string | null; lengthMs: number };
type Mark = WatchMarkRow & { source: string; forgottenAt: number | null };

const HOUR = 3_600_000;
/** How far from the turnover a stretch of the day before or after is listed, in case its watching ran across it. */
const NEAR_TURNOVER_MS = HOUR;
/** A gap on the video or the clock under this is the watcher's own ticking and the send's way to Panki, not a skip or a pause. */
const SLACK_MS = 2_000;
/** How a finish by end is read here: at the video's real end, since a Video end is the shared store's, which this copy of an account doesn't hold. */
const FINISH_WORDS = "A finish by end is the page seeing the video play to its Video end, else its real end; read here at its real end (a Video end is everyone's, not in this copy).";
/** The scan counts a gap as watching played on and not kept only from this much up: shorter ones are a short skip's noise. */
const SCAN_LEAST_MS = 30_000;
/** How long a viewer may have paused, on top of the time playing would take, for a finish to still be the same viewing. */
const PAUSE_ROOM_MS = 30 * 60_000;
/** Below this share of the time playing would take, the video reached its end by a jump, not by playing. */
const PLAYED_SHARE = 0.8;

const pad = (n: number) => String(n).padStart(2, "0");
/** A span as a player's clock, to the tenth of a second: "2:03.4", "1:02:03.4", "-0:05.0". */
function clockOf(ms: number): string {
  const tenths = Math.round(Math.abs(ms) / 100);
  const s = Math.floor(tenths / 10);
  const [h, m, rest] = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60];
  const body = h > 0 ? `${h}:${pad(m)}:${pad(rest)}` : `${m}:${pad(rest)}`;
  return `${ms < 0 ? "-" : ""}${body}.${tenths % 10}`;
}
const exactly = (ms: number) => `${(ms / 1000).toFixed(1)} s = ${(ms / 60_000).toFixed(2)} min`;

/** The instant the account's day `day` begins: found from midday UTC of its date, stepped a day at a time for a zone far from UTC. */
function dayBegins(day: Day, dayOf: (at: number) => Day, hour: number, zone: string): number {
  let guess = Date.parse(`${day}T12:00:00Z`);
  for (let i = 0; i < 3 && dayOf(guess) !== day; i++) guess += dayOf(guess) < day ? 24 * HOUR : -24 * HOUR;
  return dayStartAt(guess, hour, zone);
}

/** A video's parts covered, merged: each part watched once, however often it was rewatched. */
function spansOf(stretches: readonly Stretch[]): [number, number][] {
  const sorted = stretches.map((s): [number, number] => [s.fromMs, s.toMs]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

type Gap = { kind: "back" | "skip" | "lost" | "skipAfter" | "still" | "on"; video: number; clock: number };
/**
 * What lies between two stretches of one video, the later one's start against the earlier one's end. The clock's gap
 * is from when the earlier one reached Panki to when the later one began (its arrival less its time), so it holds the
 * send's own way and means little for stretches that waited in one batch.
 */
function gapOf(prev: Stretch, next: Stretch): Gap {
  const video = next.fromMs - prev.toMs;
  const clock = next.at - next.spentMs - prev.at;
  const kind: Gap["kind"] =
    video < -SLACK_MS
      ? "back"
      : video > SLACK_MS && clock < SLACK_MS
        ? "skip"
        : video > SLACK_MS && Math.abs(video / next.rate - clock) <= Math.max(SLACK_MS, clock * 0.2)
          ? "lost"
          : video > SLACK_MS
            ? "skipAfter"
            : clock > SLACK_MS
              ? "still"
              : "on";
  return { kind, video, clock };
}
function between(prev: Stretch, next: Stretch): string {
  const { kind, video, clock } = gapOf(prev, next);
  const said = `video ${clockOf(video)}, clock ${clockOf(clock)}`;
  const words: Record<Gap["kind"], string> = {
    back: `went back ${clockOf(-video)}: that part watched again`,
    skip: `skipped ahead ${clockOf(video)}`,
    lost: `played on with nothing kept for ${clockOf(clock)}: watching LOST?`,
    skipAfter: `skipped ahead ${clockOf(video)} after ${clockOf(clock)} away`,
    still: `stood still ${clockOf(clock)}: paused, buffering or away`,
    on: "played straight on",
  };
  return `${words[kind]} (${said})`;
}

/** Everything the report and the scan read of an account, read once. */
function readAccount(db: DatabaseSync) {
  const settings = settingsFrom(db.prepare("SELECT key, value FROM settings").all() as SettingRow[]);
  // As the API reads it (`db.ts` → `zoneOf`): the account's own zone, else the server's, here this machine's.
  const zone = settings.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dayOf = dayReader(settings.dayStartHour, zone);
  const wall = (withDate: boolean) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit", ...(withDate ? { year: "numeric", month: "2-digit", day: "2-digit" } : {}) });
  const markRows = db.prepare("SELECT video_id AS videoId, kind, at, source, forgotten_at AS forgottenAt FROM watch_marks ORDER BY at ASC, id ASC").all() as Mark[];
  const marks = marksOf(markRows.filter((m) => m.forgottenAt === null));
  const counts = (videoId: string) => marks.get(videoId)?.counted ?? true;
  const videos = new Map((db.prepare("SELECT video_id AS videoId, title, channel_name AS channel, length_ms AS lengthMs FROM watch_videos").all() as Video[]).map((v) => [v.videoId, v]));
  // In the order they came, as every read of the API's takes them (`selectWatchStretches`).
  const all = db
    .prepare("SELECT id, video_id AS videoId, from_ms AS fromMs, to_ms AS toMs, spent_ms AS spentMs, rate, at, device, forgotten_at AS forgottenAt FROM watch_stretches ORDER BY at ASC, rowid ASC")
    .all() as Stretch[];
  const kept = all.filter((s) => s.forgottenAt === null);
  return {
    settings,
    zone,
    dayOf,
    timeOf: (at: number) => wall(false).format(at),
    momentOf: (at: number) => wall(true).format(at),
    markRows,
    counts,
    videos,
    all,
    kept,
    counted: kept.filter((s) => counts(s.videoId)),
  };
}
type Account = ReturnType<typeof readAccount>;

/** A time goal as a streak reads it on a day: its streak, what it has and needs in minutes, and the other goals in its group. */
type TimeGoal = { streak: string; per: string; have: number; need: number; others: string[] };

/**
 * Each streak's Time watching goals as they stood for `day`'s period (its day, or its whole week), through the streaks'
 * own tally and test (`streaks.ts`), fed only the stretches given: the other goals of a group are named, not read.
 */
function timeGoalsOn(settings: Settings, stretches: readonly { at: number; spentMs: number }[], day: Day, dayOf: (at: number) => Day): TimeGoal[] {
  const tallies = dayTalliesOf({ answers: [], showings: [], stretches, cleared: [], newDone: [], cards: [], dayOf });
  const lastOf = (rule: StreakRule): Day => (STREAK_PERIODS[rule.per].days === 1 ? day : addDays(weekStartOf(day, settings.weekEndsOn), 6));
  return settings.streaks.flatMap((rule) => {
    const [state] = streakStatesOf([rule], tallies, lastOf(rule), settings.weekEndsOn, { on: false, pastStart: false, hoursLeft: 0 });
    if (!state) return [];
    return state.groups.flatMap((group) =>
      group.flatMap((g) =>
        GOAL_KINDS[g.kind].fact === "watchMinutes"
          ? [{ streak: state.name, per: state.per, have: g.have, need: g.need, others: group.filter((o) => o.kind !== g.kind).map((o) => GOAL_KINDS[o.kind].name) }]
          : [],
      ),
    );
  });
}

function dayReport(account: Account, day: Day) {
  const { settings, zone, dayOf, timeOf, momentOf, markRows, counts, videos, all, kept, counted } = account;
  const start = dayBegins(day, dayOf, settings.dayStartHour, zone);
  const end = dayStartAt(start + 26 * HOUR, settings.dayStartHour, zone);
  const ofDay = kept.filter((s) => dayOf(s.at) === day);

  console.log(`Day ${day} on the account's clock: ${momentOf(start)} to ${momentOf(end)} (${zone}${settings.timeZone ? "" : ", none kept: this machine's zone stands in"}, the day turns at ${settings.dayStartHour}:00)`);
  console.log("A stretch counts toward the day it reached Panki on, all its time there, whenever its watching began.");
  console.log(FINISH_WORDS);

  // ---------- Each stretch ----------
  console.log(`\nEach stretch kept that day (${ofDay.length}), in the order it came:`);
  const batchOf = new Map<number, number>();
  for (const s of ofDay) batchOf.set(s.at, (batchOf.get(s.at) ?? 0) + 1);
  const lastOfVideo = new Map<string, Stretch>();
  let running = 0;
  ofDay.forEach((s, i) => {
    const v = videos.get(s.videoId);
    const adds = counts(s.videoId) ? s.spentMs : 0;
    running += adds;
    const covered = s.toMs - s.fromMs;
    const notes: string[] = [];
    if (s.rate !== 1) notes.push(`at ${s.rate}×: ${clockOf(covered)} of video in ${clockOf(s.spentMs)} on the clock`);
    else if (Math.abs(covered - s.spentMs) > SLACK_MS) notes.push(`the clock (${clockOf(s.spentMs)}) and the video (${clockOf(covered)}) differ by ${clockOf(s.spentMs - covered)}`);
    if (!counts(s.videoId)) notes.push("not counted: its video is left out of the count");
    if ((batchOf.get(s.at) ?? 0) > 1) notes.push(`reached Panki in one batch with ${(batchOf.get(s.at) ?? 1) - 1} more: it waited`);
    if (s.at - s.spentMs < start) notes.push(`began about ${clockOf(start - (s.at - s.spentMs))} before the turnover, all of it counted here`);
    if (v && s.toMs > v.lengthMs + SLACK_MS) notes.push("ends past the video's length");
    const prev = lastOfVideo.get(s.videoId);
    lastOfVideo.set(s.videoId, s);
    console.log(
      `#${String(i + 1).padStart(3)} ${timeOf(s.at)}  ${s.videoId}  ${clockOf(s.fromMs).padStart(9)} → ${clockOf(s.toMs).padEnd(9)} spent ${clockOf(s.spentMs).padStart(7)}  ${s.rate}×  +${(adds / 1000).toFixed(1).padStart(6)} s  day so far ${clockOf(running)}  ${s.device}`,
    );
    if (prev) console.log(`      since this video's last stretch: ${between(prev, s)}`);
    else console.log(`      this video's first stretch of the day`);
    for (const n of notes) console.log(`      ${n}`);
  });

  // ---------- The day's Time watching ----------
  // The streaks' own tally of each day (`streaks.ts`), fed the stretches that count, as `db.ts` → stats feeds it; the
  // Today tile sums the same `spentMs` over the same day (`tiles.ts`, `inSpan`).
  const tallies = dayTalliesOf({ answers: [], showings: [], stretches: counted, cleared: [], newDone: [], cards: [], dayOf });
  const watchMs = tallies.get(day)?.watchMs ?? 0;
  const tileMs = counted.filter((s) => dayOf(s.at) === day).reduce((sum, s) => sum + s.spentMs, 0);
  console.log("\nThe day's Time watching:");
  console.log(`  exactly ${exactly(watchMs)}${tileMs === watchMs ? "" : ` (the tile's sum differs: ${exactly(tileMs)})`}`);
  console.log(`  in whole minutes down: ${Math.floor(watchMs / 60_000)} min (what a streak's condition counts, and the Today tile once time done is rounded down)`);
  console.log(`  to the nearest minute: ${Math.round(watchMs / 60_000)} min (what the Today tile said while it rounded to the nearest minute)`);
  const forgotten = all.filter((s) => s.forgottenAt !== null && dayOf(s.at) === day);
  const uncounted = ofDay.filter((s) => !counts(s.videoId));
  if (forgotten.length > 0) console.log(`  not in it: ${forgotten.length} forgotten stretches, ${clockOf(forgotten.reduce((n, s) => n + s.spentMs, 0))}`);
  if (uncounted.length > 0) console.log(`  not in it: ${uncounted.length} stretches of videos left out of the count, ${clockOf(uncounted.reduce((n, s) => n + s.spentMs, 0))}`);
  for (const g of timeGoalsOn(settings, counted, day, dayOf)) {
    console.log(`  streak "${g.streak}" (per ${g.per}): Time watching ${g.have} min of ${minutesWords(g.need)}, ${g.have >= g.need ? "met" : "not met"}`);
  }

  // ---------- Each video ----------
  console.log("\nEach video watched that day, in the order it was first watched:");
  const fresh = coverage();
  running = 0;
  const order = [...new Set(ofDay.map((s) => s.videoId))];
  const before = new Map<string, number>();
  for (const s of ofDay) {
    if (!before.has(s.videoId)) before.set(s.videoId, running);
    if (counts(s.videoId)) running += s.spentMs;
  }
  let runtime = 0;
  for (const id of order) {
    const v = videos.get(id);
    const own = ofDay.filter((s) => s.videoId === id);
    const spent = own.reduce((n, s) => n + s.spentMs, 0);
    const once = own.reduce((n, s) => n + fresh(id, s.fromMs, s.toMs), 0);
    runtime += once;
    const spans = spansOf(own);
    const holes: string[] = [];
    let at = 0;
    for (const [a, b] of spans) {
      if (a - at > SLACK_MS) holes.push(`${clockOf(at)}–${clockOf(a)}`);
      at = b;
    }
    if (v && v.lengthMs - at > SLACK_MS) holes.push(`${clockOf(at)}–${clockOf(v.lengthMs)}`);
    const sumCovered = own.reduce((n, s) => n + s.toMs - s.fromMs, 0);
    const first = own[0];
    const last = own[own.length - 1];
    console.log(`\n${id}  "${v?.title ?? "(its words never came)"}"  ${v?.channel ?? "(no channel)"}  length ${v ? clockOf(v.lengthMs) : "unknown"}`);
    console.log(`  ${own.length} stretches, ${first ? timeOf(first.at - first.spentMs) : ""} to ${last ? timeOf(last.at) : ""}; ${counts(id) ? "counted" : "NOT counted"}`);
    console.log(`  Time watching before its first stretch: ${clockOf(before.get(id) ?? 0)}; it added ${counts(id) ? clockOf(spent) : "nothing"} (exactly ${exactly(counts(id) ? spent : 0)})`);
    console.log(`  of the video: ${clockOf(sumCovered)} played in all, ${clockOf(once)} of it once (runtime watched), ${clockOf(sumCovered - once)} rewatched`);
    console.log(`  parts never played that day: ${holes.length > 0 ? holes.join(", ") : "none"}`);
    const rates = [...new Set(own.map((s) => s.rate))];
    if (rates.some((r) => r !== 1)) console.log(`  speeds: ${rates.map((r) => `${r}×`).join(", ")}`);
    for (const m of markRows.filter((m) => m.videoId === id && dayOf(m.at) === day)) {
      console.log(`  mark: ${m.kind} by ${m.source} at ${timeOf(m.at)}${m.forgottenAt === null ? "" : " (forgotten)"}`);
    }
    const elsewhere = kept.filter((s) => s.videoId === id && dayOf(s.at) !== day);
    if (elsewhere.length > 0) {
      const days = [...new Set(elsewhere.map((s) => dayOf(s.at)))].sort();
      console.log(`  also watched on ${days.join(", ")}: ${clockOf(elsewhere.reduce((n, s) => n + s.spentMs, 0))} in ${elsewhere.length} stretches`);
    }
  }
  console.log(`\nRuntime watched that day, each part of each video once: ${clockOf(runtime)}`);

  // ---------- Across the turnover ----------
  const near = kept.filter((s) => (s.at >= start - NEAR_TURNOVER_MS && s.at < start) || (s.at >= end && s.at < end + NEAR_TURNOVER_MS));
  console.log(`\nStretches of the day before or after within ${NEAR_TURNOVER_MS / 60_000} min of the turnover: ${near.length === 0 ? "none" : ""}`);
  for (const s of near) console.log(`  ${momentOf(s.at)}  ${s.videoId}  ${clockOf(s.fromMs)} → ${clockOf(s.toMs)}  spent ${clockOf(s.spentMs)}  counted on ${dayOf(s.at)}`);

  console.log("\nNot readable here: stretches that never reached Panki (closed with the tab while waiting, or given way after 100 waited). A gap marked LOST? above is where one would be.");
}

/** Watching that played on with nothing kept, as the scan finds it: its video, the moment it stopped being kept, and how much went. */
type Loss = { day: Day; videoId: string; stoppedAt: number; stoppedMs: number; lostMs: number; clockMs: number; by: string };

/**
 * The finishes by end that came with nothing kept since the video's last stretch short of its end, each sorted by how
 * the clock between bears out playing there: played on (the loss, at least the video between at its speed), reached
 * by a jump (nothing lost), or too long after to tell (a later visit).
 */
function finishGaps(account: Account) {
  const { dayOf, markRows, videos, kept } = account;
  const lost: Loss[] = [];
  const jumped: Loss[] = [];
  const unclear: Loss[] = [];
  for (const m of markRows) {
    if (m.kind !== "finish" || m.source !== "end" || m.forgottenAt !== null) continue;
    const v = videos.get(m.videoId);
    const own = kept.filter((s) => s.videoId === m.videoId);
    const last = own.filter((s) => s.at <= m.at).at(-1);
    if (!v || !last) continue;
    const endZone = finishesAt(v.lengthMs);
    if (last.toMs >= endZone - SLACK_MS) continue;
    // The stretch open as the finish was said lands after it, going on from where the last one ended: nothing lost.
    const after = own.find((s) => s.at > m.at);
    if (after && after.fromMs - last.toMs <= SLACK_MS && after.fromMs - last.toMs >= -SLACK_MS) continue;
    const videoMs = (endZone - last.toMs) / last.rate;
    const clockMs = m.at - last.at;
    const found: Loss = { day: dayOf(m.at), videoId: m.videoId, stoppedAt: last.at, stoppedMs: last.toMs, lostMs: Math.min(videoMs, clockMs), clockMs, by: `finished at ${account.momentOf(m.at)}` };
    if (clockMs < videoMs * PLAYED_SHARE) jumped.push(found);
    else if (clockMs > videoMs + PAUSE_ROOM_MS) unclear.push(found);
    else lost.push(found);
  }
  return { lost, jumped, unclear };
}

/** Two stretches of one video, one after the other, the video gone on about as far as the clock with nothing kept between. */
function playedOnGaps(account: Account): Loss[] {
  const { dayOf, kept } = account;
  const lastOf = new Map<string, Stretch>();
  const found: Loss[] = [];
  for (const s of kept) {
    const prev = lastOf.get(s.videoId);
    lastOf.set(s.videoId, s);
    if (!prev) continue;
    const gap = gapOf(prev, s);
    if (gap.kind !== "lost" || gap.clock < SCAN_LEAST_MS) continue;
    found.push({ day: dayOf(prev.at), videoId: s.videoId, stoppedAt: prev.at, stoppedMs: prev.toMs, lostMs: gap.clock, clockMs: gap.clock, by: `kept again at ${clockOf(s.fromMs)} (${account.momentOf(s.at - s.spentMs)})` });
  }
  return found;
}

/**
 * A video whose stretches stop short of its end with no finish after, the next video starting about when this one would
 * have ended had it played on: possibly watched to its end with nothing kept, though leaving it and coming back reads
 * the same. Said apart, never counted.
 */
function possibleTails(account: Account): Loss[] {
  const { dayOf, markRows, videos, kept } = account;
  const found: Loss[] = [];
  kept.forEach((s, i) => {
    const next = kept[i + 1];
    const v = videos.get(s.videoId);
    if (!next || !v || next.videoId === s.videoId) return;
    // The video's last stretch of this viewing: nothing more of it before another video started.
    if (kept.slice(i + 1).find((o) => o.videoId === s.videoId && o.at - s.at < HOUR)) return;
    const leftMs = (finishesAt(v.lengthMs) - s.toMs) / s.rate;
    if (leftMs < SCAN_LEAST_MS) return;
    if (markRows.some((m) => m.videoId === s.videoId && m.kind === "finish" && m.at >= s.at && m.at <= next.at)) return;
    const clockMs = next.at - next.spentMs - s.at;
    if (Math.abs(clockMs - leftMs) > Math.max(SCAN_LEAST_MS, leftMs * 0.2)) return;
    found.push({ day: dayOf(s.at), videoId: s.videoId, stoppedAt: s.at, stoppedMs: s.toMs, lostMs: leftMs, clockMs, by: `the next video began ${account.momentOf(next.at - next.spentMs)}` });
  });
  return found;
}

function scan(account: Account) {
  const { settings, dayOf, videos, kept, counted, counts } = account;
  const days = [...new Set(kept.map((s) => dayOf(s.at)))].sort();
  const finishes = account.markRows.filter((m) => m.kind === "finish" && m.source === "end" && m.forgottenAt === null).length;
  console.log(`Every day kept, ${days[0] ?? "none"} to ${days.at(-1) ?? "none"}: ${days.length} days, ${kept.length} stretches, ${finishes} finishes by end.`);
  console.log(`${FINISH_WORDS} A finish made before a video's Video end was read, or under the old window before the end, reads a little off.`);

  const { lost: finishLost, jumped, unclear } = finishGaps(account);
  // A gap a finish already accounts for, kept again past it on a later visit, is the same loss: counted once.
  const seen = new Set(finishLost.map((l) => `${l.videoId}|${l.stoppedAt}`));
  const lost = [...finishLost, ...playedOnGaps(account).filter((l) => !seen.has(`${l.videoId}|${l.stoppedAt}`))].sort((a, b) => a.stoppedAt - b.stoppedAt);
  const describe = (l: Loss) => {
    const v = videos.get(l.videoId);
    return `${l.day}  ${l.videoId}  "${v?.title ?? "(its words never came)"}"  ${v?.channel ?? "(no channel)"}  length ${v ? clockOf(v.lengthMs) : "unknown"}\n      kept up to ${clockOf(l.stoppedMs)} (${account.momentOf(l.stoppedAt)}), ${l.by}`;
  };

  console.log(`\nRecording stopped, and the video played on with nothing kept (${lost.length}):`);
  let total = 0;
  const flips: string[] = [];
  for (const l of lost) {
    total += counts(l.videoId) ? l.lostMs : 0;
    console.log(`\n${describe(l)}`);
    console.log(`      at least ${clockOf(l.lostMs)} lost (the clock between: ${clockOf(l.clockMs)})${counts(l.videoId) ? "" : "; its video is left out of the count, so nothing toward the day"}`);
  }
  // Each day's time goals as kept and with what it lost, each loss on the day it stopped being kept.
  const byDay = new Map<Day, number>();
  for (const l of lost) if (counts(l.videoId)) byDay.set(l.day, (byDay.get(l.day) ?? 0) + l.lostMs);
  if (byDay.size > 0) console.log("\nEach such day's time goals, as kept → with what was lost:");
  for (const [day, ms] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const at = (kept.filter((s) => dayOf(s.at) === day).at(-1)?.at ?? 0) - 1;
    const asKept = timeGoalsOn(settings, counted, day, dayOf);
    const withLost = timeGoalsOn(settings, [...counted, { at, spentMs: Math.round(ms) }], day, dayOf);
    console.log(`  ${day}: ${clockOf(ms)} lost`);
    asKept.forEach((g, i) => {
      const w = withLost[i];
      if (!w) return;
      const flipped = g.have < g.need && w.have >= w.need;
      if (flipped) flips.push(`${day} "${g.streak}"`);
      const others = g.others.length > 0 ? ` (its group also asks ${g.others.join(", ")}, not read here)` : "";
      console.log(`    "${g.streak}" (per ${g.per}): Time watching ${g.have} → ${w.have} min of ${minutesWords(g.need)}: ${flipped ? "WOULD HAVE BEEN MET" : g.have >= g.need ? "met anyway" : "not met either way"}${others}`);
    });
  }
  console.log(`\nIn all: ${lost.length} on ${byDay.size} days, at least ${clockOf(total)} of Time watching lost; time goals that would have been met: ${flips.length === 0 ? "none" : flips.join(", ")}.`);

  console.log(`\nReached the end by a jump, nothing lost (${jumped.length}):`);
  for (const l of jumped) console.log(`  ${l.day}  ${l.videoId}  kept up to ${clockOf(l.stoppedMs)}, ${l.by}, ${clockOf(l.clockMs)} after`);
  console.log(`\nFinished long after its last stretch, too far apart to tell a loss from a later visit (${unclear.length}):`);
  for (const l of unclear) console.log(`  ${l.day}  ${l.videoId}  kept up to ${clockOf(l.stoppedMs)} (${account.momentOf(l.stoppedAt)}), ${l.by}`);
  const tails = possibleTails(account);
  console.log(`\nPossibly played to its end with nothing kept, no finish to say so: the next video began about when this one would have ended (${tails.length}, not in the total):`);
  for (const l of tails) console.log(`  ${l.day}  ${l.videoId}  kept up to ${clockOf(l.stoppedMs)} (${account.momentOf(l.stoppedAt)}), ${l.by}: ${clockOf(l.lostMs)} left of it`);
  console.log("\nA viewing with nothing kept at all, or left before its end, leaves no trace to find.");
}

function main() {
  const [path, what] = process.argv.slice(2);
  if (!path || !existsSync(path) || !what || (what !== "--scan" && !/^\d{4}-\d{2}-\d{2}$/.test(what))) {
    console.log("Give the full path to a copy of an account's panki.sqlite, then a day of the account's as yyyy-mm-dd, or --scan for every day.");
    return;
  }
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const account = readAccount(db);
    if (what === "--scan") scan(account);
    else dayReport(account, what);
  } finally {
    db.close();
  }
}

main();
