/** @panki Every tile Stats and the home show, one registry (`WIDGETS`, `widgetOf`) in one anatomy (`Tile`, `StreakTile`, `Widget`); Status, today and every streak's checks. */
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref, type RefObject } from "react";
import {
  FRAME_UNITS,
  GOAL_KINDS,
  GOAL_KIND_IDS,
  STAT_WINDOWS,
  STREAKS_MAX,
  STREAK_PERIODS,
  goalRuleWords,
  goalSaysWords,
  periodCountWords,
  streakNameOf,
  type ContinueVideo,
  type Day,
  type Deck,
  type FinishedVideo,
  type FrameWay,
  type SavedVideo,
  type Settings,
  type SettingsUpdate,
  type SrsType,
  type StatFrame,
  type StatWindow,
  type Stats,
  type StreakPer,
  type StreakRule,
  type StreakState,
  type WindowId,
  type WindowStats,
} from "@panki/contracts";
import { api } from "./api";
import { Columns, DOW, HeatMap, LineChart, Rows, addDays, dayDate, daysFrom, stepOf, sundayOf, weeksTo, type HeatStep, type RowSpec } from "./charts";
import { QuietIconButton } from "./components/AiRun";
import { Ask } from "./components/Ask";
import { Button } from "./components/Button";
import { Dropdown } from "./components/Dropdown";
import { Icon } from "./components/Icon";
import { LinkView } from "./components/LinkView";
import { FramePicker, frameShort } from "./components/FramePicker";
import { Segmented } from "./components/Segmented";
import { Skeleton } from "./components/Skeleton";
import { StreakEditor } from "./components/StreakEditor";
import { useAnchored } from "./hooks/useAnchored";
import { useDismiss } from "./hooks/useDismiss";
import { useSavedSoon } from "./hooks/useSavedSoon";
import { rememberShape, shapeOf } from "./skeletonMemory";
import { BURNED_TINT, NEW_WORDS, tintOf } from "./srsKinds";
import { readTilePick, writeTilePick } from "./tilePicks";
import { count, dayWords, durationWords, fullDayWords, hourOfDayWords, hourSpanWords, langOf, leftWords, monthWords, monthYearWords, shortDayWords } from "./words";

/**
 * The widgets, one registry: every tile Stats shows (all of them, in this order, but the streaks') and the home can carry
 * (`home`). Each says its name, the windows it covers and its default, the views of its breakdown, and how it draws
 * itself from the stats; every one is drawn in the one anatomy (`Tile`). A new widget is one entry here and nothing
 * else; the home's layout keeps ids, so an id is never renamed: Activity is `heat` (Days studied, `days`, is in it),
 * Time watching `watched` (Watch time, `watch-time`, is in it), Time studying `time` (Time reviewing before Round 7). The streaks are a family of their
 * own: one tile each (`StreakTile`), on the Streaks screen and wherever the home puts them; `streak` is the one Streak
 * tile's id from before streaks were many, which a home's layout may still hold (`layout.ts` → `fitStreaks`).
 */
export type WidgetId =
  | "due"
  | "status"
  | "streak"
  | "heat"
  | "reviews"
  | "right"
  | "ladder"
  | "coming"
  | "new"
  | "tough"
  | "added"
  | "time"
  | "pace"
  | "watched"
  | "channels"
  | "continue"
  | "saved"
  | "recent";

/**
 * What a widget may need besides the stats: the decks in scope, the types, the settings, a way to have the stats asked
 * for again once a tile has changed what they're made of (a video put away), a change to the settings saved (a streak
 * edited from its tile, the stats asked for again after it).
 */
export type WidgetContext = {
  decks: Deck[];
  srsTypes: SrsType[];
  settings: Settings;
  onStale: () => void;
  onSettings: (patch: SettingsUpdate) => Promise<Settings>;
};

/** A change against the window before: up or down by so much, green or red only where one of them is better. */
type Delta = { same: true; before: string } | { same: false; up: boolean; n: string; before: string; good: boolean | null };
/** The tile's number: its parts each with a unit ("3 h", "12 min"), the change, a word at the right ("Best 40"). */
type Figure = { parts: readonly (readonly [string, string])[]; delta?: Delta | null; aside?: string };
/** What a tile draws for its window and view: the one empty line, or its figure, chart, foot and Show more. */
type TileOut = { empty: string } | { empty?: undefined; figure?: Figure; chart?: ReactNode; foot?: ReactNode; more?: ReactNode };
type TileInput = {
  stats: Stats;
  ctx: WidgetContext;
  /** The window picked's numbers; null for a tile with no window. */
  win: WindowStats | null;
  /** A custom frame ahead's numbers (Coming up's Custom…), in place of a window's; null otherwise. */
  next: CustomAhead | null;
  view: string;
  /** What the number measures, of the tile's `measures`; "" for a tile with one thing to measure. */
  measure: string;
  /** What's under the pointer in the chart, said in the foot line. */
  onAt: (words: string | null) => void;
};
type View = { id: string; label: string };
type CustomAhead = NonNullable<Stats["customAhead"]>;

type TileEntry = {
  id: Exclude<WidgetId, "streak">;
  name: string;
  /** Wants two columns of the board where it has them. */
  wide?: boolean;
  /** Offered on the home; Stats shows every one but the streaks'. */
  home: boolean;
  /** Heads the Streaks screen rather than standing on Stats (Status); on the home like any tile. */
  streaksScreen?: true;
  windows?: readonly StatWindow[];
  /** The window it opens on until one is picked on this device. */
  window?: StatWindow;
  /** Its windows look ahead (Coming up): its Custom… frame is the next N units from today, its panel saying "Next". */
  ahead?: true;
  /**
   * What its number measures, where it measures more than one thing (Time watching: Time spent / Of video): a second,
   * small `Segmented` before its views, the number, the change, the chart and Show more all following it.
   */
  measures?: readonly View[];
  views?: readonly View[];
  /** The view it opens on until one is picked on this device; the first, unless said. */
  view?: string;
  /** The windows a view isn't offered on: Today is drawn by the hour (as is a range of one day). */
  noViewsOn?: readonly StatWindow[];
  make: (input: TileInput) => TileOut;
};

// ---------- Words ----------

// Every date and time here is the account's formats', from `words.ts` (`dayWords`, `shortDayWords`, `hourOfDayWords`…).
const num = (n: number) => n.toLocaleString();
const DOW_LONG = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;
/** Time spent, from ms: "48 min", "3 h 12 min". */
const spent = (ms: number) => durationWords(ms / 1000);
/** Time spent as a figure's parts: "48" "min", or "3" "h" "12" "min". */
function spentParts(ms: number): [string, string][] {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return [[num(minutes), "min"]];
  const rest = minutes % 60;
  return rest ? [[num(Math.floor(minutes / 60)), "h"], [String(rest), "min"]] : [[num(Math.floor(minutes / 60)), "h"]];
}
/** Time spent on a column's cap, short: "1.5 h", "40 min". */
const spentCap = (ms: number) => (ms >= 3_600_000 ? `${(ms / 3_600_000).toFixed(1)} h` : `${Math.round(ms / 60_000)} min`);
/** A share to one decimal, as a number: 87.5. */
const pct1 = (part: number, of: number) => (of === 0 ? 0 : Math.round((part / of) * 1000) / 10);
const sayReviews = (n: number) => count(n, "review", "reviews");
const sayCards = (n: number) => count(n, "card", "cards");
/** Where the largest value stands; the first of equals. */
const argmax = (values: readonly number[]) => values.reduce((best, v, j) => (v > (values[best] ?? 0) ? j : best), 0);
const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/**
 * The windows in words, the shared vocabulary of every tile: the control's (Today, 7 d, 30 d, 1 y, All time), what the
 * change is against, and the stretch in a sentence ("these 30 days", "the past year").
 */
const WINDOW_WORDS: Record<StatWindow, { label: string; before: string | null; these: string | null }> = {
  today: { label: "Today", before: "yesterday by this hour", these: "today" },
  days7: { label: "7 d", before: "the 7 days before", these: "these 7 days" },
  days30: { label: "30 d", before: "the 30 days before", these: "these 30 days" },
  months12: { label: "1 y", before: "the year before", these: "the past year" },
  all: { label: "All time", before: null, these: null },
};
/** The word a custom frame's panel puts before its amount, by the way the tile looks (its entry's `ahead`). */
const FRAME_LEAD: Record<FrameWay, string> = { last: "Last", next: "Next" };
/** A custom frame in a sentence: "3 weeks", "1 day". */
const frameWords = (frame: StatFrame) => count(frame.n, FRAME_UNITS[frame.unit].name.toLowerCase().replace(/s$/, ""), FRAME_UNITS[frame.unit].name.toLowerCase());
/** What a window's change is against, its one empty line, and the stretch in a sentence: a fixed window's, or a custom frame's. */
function windowWords(win: WindowStats): { before: string | null; empty: string; these: string } {
  if (win.window === "custom") {
    const said = win.frame ? frameWords(win.frame) : count(daysFrom(win.from, win.to) + 1, "day", "days");
    return { before: `the ${said} before`, empty: `Nothing in the last ${said}.`, these: `the last ${said}` };
  }
  const words = WINDOW_WORDS[win.window];
  return { before: words.before, empty: words.these === null ? "Nothing yet." : `Nothing in ${words.these}.`, these: words.these ?? "all time" };
}
const beforeWords = (win: WindowStats) => (win.before === null ? null : windowWords(win).before);
/**
 * A tile's one empty line: for Today, the tile's own words with its own verb ("Nothing reviewed today yet."), never a
 * generated "Nothing today."; for a longer window, "Nothing in these 30 days.".
 */
const emptyOf = (win: WindowStats, today = "Nothing here today yet.") => (win.window === "today" ? today : windowWords(win).empty);

function deltaOf(cur: number, prev: number | null, before: string | null, betterUp: boolean | null): Delta | null {
  if (prev === null || before === null || prev === 0) return null;
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return { same: true, before };
  return { same: false, up: p > 0, n: `${Math.abs(p)}%`, before, good: betterUp === null ? null : p > 0 === betterUp };
}
/** A share's change in points: "2.4 points". */
function pointsOf(cur: number, prev: number | null, before: string | null): Delta | null {
  if (prev === null || before === null) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return { same: true, before };
  return { same: false, up: d > 0, n: `${Math.abs(d)} points`, before, good: d > 0 };
}

// ---------- A window over time ----------

/**
 * A day's label under its column among `n` days: its weekday up to a week of columns ("Sun"), else the date with its
 * month on each Sunday ("18 Oct", "Oct 18"; a bare day number said nothing of which month) and nothing on the rest.
 */
const dayLabel = (day: Day, n: number): string => (n > 7 ? (dayDate(day).getUTCDay() === 0 ? shortDayWords(day) : "") : (DOW[dayDate(day).getUTCDay()] ?? ""));

/**
 * Each stretch a window's numbers come in, as a column's label and the words said for it, read from the window's units
 * (any length, a range's too): a day (its weekday up to a week of columns, else the date on each Sunday), a week
 * running to the day before the next, or a calendar month. `weeks` reads the trend's unit.
 */
function stretchesOf(win: WindowStats, starts: readonly Day[], weeks = false): { labels: string[]; words: string[] } {
  const unit = weeks ? win.trendUnit : win.unit;
  const byDay = unit === "day" || unit === "one";
  const byWeek = unit === "week";
  const labels = starts.map((start) => {
    if (byWeek) return shortDayWords(start);
    if (byDay) return dayLabel(start, starts.length);
    // A month is its three letters, never an initial; past a year of columns only each quarter's first is labelled, so they never crowd.
    return starts.length <= 13 || dayDate(start).getUTCMonth() % 3 === 0 ? monthWords(start) : "";
  });
  const words = starts.map((start, j) => {
    if (byWeek) {
      const next = starts[j + 1];
      const end = next === undefined ? win.to : addDays(next, -1);
      return `${shortDayWords(start)} – ${shortDayWords(end)}`;
    }
    return byDay ? dayWords(start) : monthYearWords(start);
  });
  return { labels, words };
}

/** An hour of the day's order (0 is the hour the day turns at) on the clock. */
const hourAt = (j: number, dayStart: number) => (dayStart + j) % 24;
/** An hour's column label, in the account's time format, on every sixth hour alone: "06:00", "12:00" or "6 am", "12 pm". */
const hourLabel = (j: number, dayStart: number) => (hourAt(j, dayStart) % 6 === 0 ? hourOfDayWords(hourAt(j, dayStart)) : "");

type Counted = {
  win: WindowStats;
  view: string;
  series: readonly { start: Day; n: number }[];
  hours: readonly number[];
  weekdays?: readonly { n: number; days: number }[];
  say: (n: number) => string;
  cap?: (n: number) => string;
  stats: Stats;
  ctx: WidgetContext;
  onAt: (words: string | null) => void;
};

/** A count over a window drawn the one way every tile draws one: over time, by the hour (always, for Today), or by the weekday. */
function byView({ win, view, series, hours, weekdays, say, cap, stats, ctx, onAt }: Counted): { chart: ReactNode; foot: string | null } {
  const dayStart = ctx.settings.dayStartHour;
  const capOf = cap ?? num;
  // A day alone (Today, or a range of one day) is drawn by the hour; only Today has an hour that is now.
  if (win.unit === "one" || view === "hour") {
    const total = sum(hours);
    const now = win.window === "today" ? stats.ahead.nowHour : -1;
    const best = argmax(hours);
    // A column is an hour's span ("15:00–16:00"), said whole; the axis keeps single ticks.
    const said = (j: number) => `${hourSpanWords(hourAt(j, dayStart))} · ${say(hours[j] ?? 0)}`;
    return {
      chart: <Columns values={hours} labels={hours.map((_, j) => hourLabel(j, dayStart))} words={said} now={now} ahead={now >= 0 ? now + 1 : -1} cap={capOf} onAt={onAt} />,
      foot: total === 0 ? null : win.unit === "one" ? `Busiest: ${said(best)}` : `Busiest: ${hourSpanWords(hourAt(best, dayStart))} · ${Math.round(((hours[best] ?? 0) / total) * 100)}% of the total`,
    };
  }
  if (view === "weekday" && weekdays) {
    const values = weekdays.map((w) => (w.days > 0 ? Math.round(w.n / w.days) : 0));
    const averaged = weekdays.some((w) => w.days > 1);
    const said = (d: number) => `${DOW_LONG[d] ?? ""} · ${say(values[d] ?? 0)}${averaged ? " a day" : ""}`;
    return { chart: <Columns values={values} labels={DOW} words={said} cap={capOf} onAt={onAt} />, foot: `Busiest: ${said(argmax(values))}` };
  }
  const values = series.map((s) => s.n);
  const { labels, words } = stretchesOf(
    win,
    series.map((s) => s.start),
  );
  const said = (j: number) => `${words[j] ?? ""} · ${say(values[j] ?? 0)}`;
  return { chart: <Columns values={values} labels={labels} words={said} now={values.length - 1} cap={capOf} onAt={onAt} />, foot: `Busiest: ${said(argmax(values))}` };
}

const OVER_TIME: readonly View[] = [
  { id: "time", label: "Until today" },
  { id: "hour", label: "By hour" },
  { id: "weekday", label: "By weekday" },
];
/** Time per card's sides, its views: the card on screen to the flip, the flip to the answer, both. */
const PACE_SIDES = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
  { id: "total", label: "Total" },
] as const;
/** Time watching's measures: the clock, or how much of the videos was covered, each part once. */
const WATCH_MEASURES: readonly View[] = [
  { id: "spent", label: "Time spent" },
  { id: "video", label: "Of video" },
];
const deckName = (ctx: WidgetContext, deckId: string) => ctx.decks.find((d) => d.id === deckId)?.name ?? "";

/** A block of Show more: its small title, then what it shows. */
function MoreBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-more-block">
      <p className="w-sub">{title}</p>
      {children}
    </div>
  );
}

// ---------- The ladder ----------

type Ladder = Stats["ladders"][number];
type LadderCounts = { fresh: number; burned: number; stages: readonly number[] };
/** A ladder's rows: New, each stage in its colour, Burned. */
function ladderRows(ladder: Ladder, counts: LadderCounts): RowSpec[] {
  return [
    ladder.newColour ? { key: "new", name: NEW_WORDS.name, n: counts.fresh, tint: tintOf(ladder.newColour) } : { key: "new", name: NEW_WORDS.name, n: counts.fresh, className: "is-new" },
    ...ladder.stages.map((stage, i) => ({ key: stage.id, name: stage.name || `Stage ${i + 1}`, n: counts.stages[i] ?? 0, tint: tintOf(stage.colour) })),
    { key: "burned", name: ladder.burnedName, n: counts.burned, tint: BURNED_TINT, className: "is-burned" },
  ];
}
const ladderTotal = (l: LadderCounts) => l.fresh + l.burned + sum(l.stages);

// ---------- Watching ----------

/** The channels' colours, the most watched first; every other channel past the five shares the last. */
const CHANNEL_TINTS = ["var(--mark-blue)", "var(--mark-violet)", "var(--mark-green)", "var(--mark-orange)", "var(--mark-pink)", "var(--line-strong)"] as const;
const OTHERS_TINT = CHANNEL_TINTS[5];
const channelTint = (top: readonly string[], name: string) => CHANNEL_TINTS[Math.min(top.indexOf(name) < 0 ? 5 : top.indexOf(name), 5)] ?? OTHERS_TINT;

/** How many videos a tile of videos shows (Continue watching, Saved for later, Recently watched); the rest wait their turn. */
const VIDEOS_SHOWN = 4;

/** Removing a video from Continue watching, asked from its trash (the tile here, the shelf on YouTube's home says the same). One home for the words. */
const REMOVE_CONTINUE = { question: "Remove from Continue watching?", go: { words: "Remove", busy: "Removing…" } };

/**
 * The videos left part-way, newest first, each the video's own card opening on YouTube where it was stopped, with a
 * trash that removes it from here, asking first in its row, a trash so it's clear it removes (it comes back when it's
 * played again, and what was watched is kept). One removed leaves at once; the stats
 * are asked for again so the count catches up.
 */
function ContinueRows({ videos, onStale }: { videos: readonly ContinueVideo[]; onStale: () => void }) {
  const [gone, setGone] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  /** The video whose trash is asking first, the question hanging from it. */
  const [asking, setAsking] = useState<string | null>(null);
  const removeAt = useRef<HTMLButtonElement>(null);
  async function putAway(videoId: string) {
    setAsking(null);
    setFailure(null);
    setGone((was) => [...was, videoId]);
    try {
      await api.markVideo(videoId, "put-away");
      onStale();
    } catch (e) {
      setGone((was) => was.filter((id) => id !== videoId));
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    }
  }
  const shown = videos
    .filter((v) => !gone.includes(v.videoId))
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, VIDEOS_SHOWN);
  return (
    <div className="w-videos">
      {shown.map((v) => (
        <div key={v.videoId} className={`w-video ${asking === v.videoId ? "is-asking" : ""}`.trim()}>
          <LinkView
            // No time in its address, as on YouTube's own home: the extension's Where you stopped last decides what
            // happens as it opens (a time there would read as the link's own, and its button would never come).
            meta={{ link: { videoId: v.videoId, seconds: null }, title: v.title, channel: v.channel ? { name: v.channel } : null }}
            label="Continue watching"
            pictures={{ thumbnail: api.videoPictures(v.videoId).thumbnail, avatar: null }}
            progress={{ share: v.lengthMs > 0 ? v.stoppedAtMs / v.lengthMs : 0, left: leftWords(v.stoppedAtMs, v.lengthMs) }}
          />
          <Button
            ref={asking === v.videoId ? removeAt : undefined}
            className="btn-icon is-danger w-video-x"
            aria-label="Remove from Continue watching"
            aria-pressed={asking === v.videoId}
            aria-expanded={asking === v.videoId}
            onClick={() => setAsking((was) => (was === v.videoId ? null : v.videoId))}
          >
            <Icon name="trash" />
          </Button>
          {asking === v.videoId ? (
            <Ask
              idPrefix={`continue-remove-${v.videoId}`}
              anchor={removeAt}
              question={REMOVE_CONTINUE.question}
              go={REMOVE_CONTINUE.go}
              busy={false}
              failure={null}
              onKeep={() => setAsking(null)}
              onGo={() => void putAway(v.videoId)}
            />
          ) : null}
        </div>
      ))}
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The videos finished, the latest first, each the video's own card opening it on YouTube from its start. Nothing takes
 * one out: it's a history, like YouTube's; the strip's
 * Finished chip on the video's own page is where it's said to be unfinished.
 */
function RecentRows({ videos }: { videos: readonly FinishedVideo[] }) {
  return (
    <div className="w-videos">
      {videos.slice(0, VIDEOS_SHOWN).map((v) => (
        <div key={v.videoId} className="w-video">
          <LinkView
            meta={{ link: { videoId: v.videoId, seconds: null }, title: v.title, channel: v.channel ? { name: v.channel } : null }}
            label="Recently watched"
            pictures={{ thumbnail: api.videoPictures(v.videoId).thumbnail, avatar: null }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * The videos saved for later, as Continue watching is drawn, newest first, each the video's
 * own card opening it on YouTube from its start (where it was stopped is the extension's to offer), with a trash that
 * takes the save back, asking first in its row. One taken back leaves at once; the stats are asked for again so the count catches up.
 */
function SavedRows({ videos, onStale }: { videos: readonly SavedVideo[]; onStale: () => void }) {
  const [gone, setGone] = useState<readonly string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  /** The video whose trash is asking first, the question hanging from it. */
  const [asking, setAsking] = useState<string | null>(null);
  const removeAt = useRef<HTMLButtonElement>(null);
  async function unsave(videoId: string) {
    setAsking(null);
    setFailure(null);
    setGone((was) => [...was, videoId]);
    try {
      await api.unsaveVideo(videoId);
      onStale();
    } catch (e) {
      setGone((was) => was.filter((id) => id !== videoId));
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    }
  }
  const shown = videos.filter((v) => !gone.includes(v.videoId)).slice(0, VIDEOS_SHOWN);
  return (
    <div className="w-videos">
      {shown.map((v) => (
        <div key={v.videoId} className={`w-video ${asking === v.videoId ? "is-asking" : ""}`.trim()}>
          <LinkView
            meta={{ link: { videoId: v.videoId, seconds: null }, title: v.title, channel: v.channel ? { name: v.channel } : null }}
            label="Saved for later"
            pictures={{ thumbnail: api.videoPictures(v.videoId).thumbnail, avatar: null }}
          />
          <Button
            ref={asking === v.videoId ? removeAt : undefined}
            className="btn-icon is-danger w-video-x"
            aria-label="Remove from Saved for later"
            aria-pressed={asking === v.videoId}
            aria-expanded={asking === v.videoId}
            onClick={() => setAsking((was) => (was === v.videoId ? null : v.videoId))}
          >
            <Icon name="trash" />
          </Button>
          {asking === v.videoId ? (
            <Ask
              idPrefix={`saved-remove-${v.videoId}`}
              anchor={removeAt}
              question="Remove from Saved for later?"
              go={{ words: "Remove", busy: "Removing…" }}
              busy={false}
              failure={null}
              onKeep={() => setAsking(null)}
              onGo={() => void unsave(v.videoId)}
            />
          ) : null}
        </div>
      ))}
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

// ---------- Status ----------

/** The time left of a streak's period: the days while there's more than one, then the hours until the day turns. */
const timeLeftOf = (streak: StreakState) => `${streak.daysLeft > 1 ? count(streak.daysLeft, "day", "days") : `${num(streak.hoursLeft)} h`} left`;

/**
 * What today held, as facts read from today's numbers (every deck, the account's day): reviews, new cards against the
 * day's limit, extra study (reviews and new cards apart, never added together), time studying, time watching, cards
 * added. A zero is said as one.
 */
function TodayFacts({ stats }: { stats: Stats }) {
  const today = stats.windows.find((w) => w.window === "today");
  if (!today) return null;
  const { started } = today;
  const extra = [stats.extraToday.reviews > 0 ? sayReviews(stats.extraToday.reviews) : null, stats.extraToday.started > 0 ? count(stats.extraToday.started, "new card", "new cards") : null].filter((p) => p !== null);
  const facts: readonly (readonly [string, string])[] = [
    ["Reviews", num(today.reviews.n)],
    ["New cards", started.limit > 0 ? `${num(started.n)} / ${num(started.limit)}` : num(started.n)],
    ["Extra study", extra.length > 0 ? extra.join(" · ") : "None"],
    ["Time studying", spent(today.time.ms)],
    ["Time watching", spent(today.watching.ms)],
    ["Cards added", num(today.added.n)],
  ];
  return (
    <dl className="w-facts" aria-label="Today">
      {facts.map(([label, value]) => (
        <div key={label} className="w-fact">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Every streak as a build's checks, in the account's order: a row each, tinted whole, green with a tick once its period
 * counts and red with a cross until then, at any hour; its name and its run, that it counts or the time left, and under
 * them every condition in its own words ("Reviews ≥ 20", "All reviews done"), each with its own tick or cross, its
 * groups apart with "or" between them as the streak's tile has them.
 */
function StatusRows({ streaks }: { streaks: readonly StreakState[] }) {
  return (
    <div className="w-status">
      {streaks.map((s) => {
        const name = streakNameOf(s);
        return (
          <div key={s.id} className={`w-status-row ${s.now ? "is-pass" : "is-fail"}`}>
            <span className="w-status-mark" role="img" aria-label={s.now ? "Counts" : "Doesn't count yet"}>
              <Icon name={s.now ? "check" : "cross"} />
            </span>
            <span className="w-status-name" lang={langOf(name)}>
              {name}
            </span>
            <span className="w-status-run">
              <Icon name="flame" />
              {periodCountWords(s.per, s.current)}
            </span>
            <span className="w-status-said">{s.now ? `${STREAK_PERIODS[s.per].Now} counts` : timeLeftOf(s)}</span>
            <ul className="w-checks">
              {s.groups.map((group, gi) => (
                <Fragment key={gi}>
                  {gi > 0 ? <li className="w-goal-or">or</li> : null}
                  {group.map((g, ci) => {
                    const met = g.have >= g.need;
                    return (
                      <li key={ci} className={`w-check ${met ? "is-met" : "is-unmet"}`}>
                        <span className="w-check-mark" role="img" aria-label={met ? "Done" : "Not done"}>
                          <Icon name={met ? "check" : "cross"} />
                        </span>
                        {goalRuleWords(g.kind, g.need)}
                      </li>
                    );
                  })}
                </Fragment>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ---------- The registry ----------

export const WIDGETS: readonly TileEntry[] = [
  {
    id: "due",
    name: "Due now",
    home: false,
    make({ stats, ctx }) {
      const decks = ctx.decks.filter((d) => stats.deckId === null || d.id === stats.deckId);
      if (decks.length === 0) return { empty: "No decks yet." };
      const total = sum(decks.map((d) => d.dueCount + d.newCount));
      // Coming due before the account's day turns over; said as today, never the hour it turns at.
      const later = stats.ahead.laterToday;
      return {
        figure: { parts: [[num(total), total === 1 ? "card" : "cards"]] },
        chart: (
          <div className="w-list">
            {decks.map((d) => (
              <div key={d.id} className="w-item">
                <span className="w-item-front" lang={langOf(d.name)}>
                  {d.name}
                </span>
                <span className="w-item-n">
                  <b>{num(d.dueCount)}</b> due · <b>{num(d.newCount)}</b> new
                </span>
              </div>
            ))}
          </div>
        ),
        foot: later > 0 ? `${num(later)} more ${later === 1 ? "comes" : "come"} due today.` : "Nothing more comes due today.",
      };
    },
  },
  {
    // Today and every streak over all decks, whatever the deck filter, as each streak's own tile counts it.
    id: "status",
    name: "Status",
    home: true,
    streaksScreen: true,
    make({ stats, ctx }) {
      const streaks = ctx.settings.streaksOn ? stats.streaks : [];
      return {
        chart: (
          <>
            <TodayFacts stats={stats} />
            {streaks.length > 0 ? (
              <>
                <p className="w-status-head">Streaks</p>
                <StatusRows streaks={streaks} />
              </>
            ) : null}
          </>
        ),
      };
    },
  },
  {
    id: "heat",
    name: "Activity",
    wide: true,
    home: true,
    windows: ["days30", "months12", "all"],
    window: "months12",
    views: [
      { id: "reviews", label: "Reviews" },
      { id: "time", label: "Time studying" },
      { id: "watching", label: "Time watching" },
    ],
    make({ stats, win, view, onAt }) {
      if (!win) return { empty: "" };
      const days = new Map(stats.activity.map((a) => [a.day, view === "watching" ? a.watchMs : view === "time" ? a.ms : a.reviews]));
      const get = (day: Day) => days.get(day) ?? 0;
      const say = view === "reviews" ? sayReviews : spent;
      const inside = (from: Day, to: Day) => [...days.entries()].filter(([d, v]) => d >= from && d <= to && v > 0);
      const shown = inside(win.from, win.to);
      if (shown.length === 0) return { empty: emptyOf(win) };
      const total = sum(shown.map(([, v]) => v));
      const [best, max] = shown.reduce((top, entry) => (entry[1] > top[1] ? entry : top));
      const prev = win.before === null ? null : inside(win.before.from, win.before.to).length;
      const step = (day: Day) => stepOf(get(day), max);
      const wordsOf = (day: Day) => `${dayWords(day)} · ${get(day) === 0 ? "nothing" : say(get(day))}`;
      // Every window the one map, at a year's cell size: 30 d is its weeks, All time the whole history, scrolling sideways when wider.
      const first = sundayOf(win.from);
      const chart = <HeatMap first={first} cols={weeksTo(first, win.to)} from={win.from} to={win.to} step={step} wordsOf={wordsOf} onAt={onAt} label={say(total)} size="year" />;
      return {
        figure: { parts: [[num(shown.length), `${shown.length === 1 ? "day" : "days"} ${view === "watching" ? "watched" : "studied"}`]], delta: deltaOf(shown.length, prev, beforeWords(win), true) },
        chart,
        foot: `${say(total)} · busiest ${dayWords(best)}, ${say(max)}`,
      };
    },
  },
  {
    id: "reviews",
    name: "Reviews",
    home: true,
    windows: STAT_WINDOWS,
    window: "days30",
    views: OVER_TIME,
    noViewsOn: ["today"],
    make({ stats, ctx, win, view, onAt }) {
      if (!win) return { empty: "" };
      const r = win.reviews;
      if (r.n === 0) return { empty: emptyOf(win, "Nothing reviewed today yet.") };
      const { chart, foot } = byView({ win, view, series: r.series, hours: r.hours, weekdays: r.weekdays, say: sayReviews, stats, ctx, onAt });
      return {
        figure: { parts: [[num(r.n), r.n === 1 ? "review" : "reviews"]], delta: deltaOf(r.n, r.before, beforeWords(win), true) },
        chart,
        foot,
        more: (
          <MoreBlock title="By stage">
            <Rows rows={r.stages.map((s) => ({ key: s.key, name: s.name, n: s.n, ...(s.colour ? { tint: tintOf(s.colour) } : { className: "is-new" }) }))} />
          </MoreBlock>
        ),
      };
    },
  },
  {
    id: "right",
    name: "Right",
    home: true,
    windows: ["days7", "days30", "months12", "all"],
    window: "days30",
    views: [
      { id: "time", label: "Until today" },
      { id: "stage", label: "Stage" },
    ],
    make({ win, view, onAt }) {
      if (!win) return { empty: "" };
      const r = win.right;
      if (r.of === 0) return { empty: emptyOf(win) };
      const share = pct1(r.right, r.of);
      const shareRow = (key: string, name: string, x: { right: number; of: number }, tint?: CSSProperties): RowSpec => ({ key, name, n: pct1(x.right, x.of), says: `${pct1(x.right, x.of)}%`, lang: langOf(name), ...(tint ? { tint } : {}) });
      const countRow = (row: RowSpec, x: { right: number; of: number }): RowSpec => ({ ...row, says: `${num(x.right)} of ${num(x.of)}` });
      const stageRows = r.stages.map((s) => shareRow(s.key, s.name, s, s.colour ? tintOf(s.colour) : undefined));
      let chart: ReactNode;
      if (view === "stage") chart = <Rows rows={stageRows} max={100} track />;
      else {
        const values = r.series.map((s) => (s.of === 0 ? null : pct1(s.right, s.of)));
        const { labels, words } = stretchesOf(
          win,
          r.series.map((s) => s.start),
        );
        chart = <LineChart values={values} labels={labels} words={(j) => `${words[j] ?? ""} · ${values[j] ?? 0}% right`} fmt={(v) => `${Math.round(v)}%`} onAt={onAt} />;
      }
      return {
        figure: { parts: [[`${share}%`, "right"]], delta: r.before && r.before.of > 0 ? pointsOf(share, pct1(r.before.right, r.before.of), beforeWords(win)) : null },
        chart,
        foot: `${num(r.right)} right of ${count(r.of, "answer", "answers")}`,
        more: (
          <MoreBlock title="By stage">
            <Rows rows={r.stages.map((s, i) => countRow(stageRows[i] ?? shareRow(s.key, s.name, s), s))} max={100} track said />
          </MoreBlock>
        ),
      };
    },
  },
  {
    id: "ladder",
    name: "Ladder",
    home: true,
    // The cards on each stage now, one ladder per SRS type in scope.
    make({ stats }) {
      const ladders = stats.ladders;
      const total = sum(ladders.map((l) => ladderTotal({ fresh: l.fresh, burned: l.burned, stages: l.stages.map((s) => s.n) })));
      if (total === 0) return { empty: "No cards yet." };
      const burned = sum(ladders.map((l) => l.burned));
      return {
        figure: { parts: [[num(total), total === 1 ? "card" : "cards"]] },
        chart: (
          <div className="w-ladders">
            {ladders.map((l) => (
              <div key={l.srsTypeId} className="w-ladder">
                {ladders.length > 1 ? <p className="w-sub">{l.name}</p> : null}
                <Rows rows={ladderRows(l, { fresh: l.fresh, burned: l.burned, stages: l.stages.map((s) => s.n) })} />
              </div>
            ))}
          </div>
        ),
        foot: `${num(burned)} burned · ${num(stats.burned30)} in 30 days`,
      };
    },
  },
  {
    id: "coming",
    name: "Coming up",
    home: true,
    windows: ["today", "days7", "days30"],
    window: "days7",
    ahead: true,
    make({ stats, ctx, win, next, onAt }) {
      const { ahead } = stats;
      const dayStart = ctx.settings.dayStartHour;
      // Custom…: the next N days, weeks, months or years from today, a day a column up to 62 days, else a month.
      if (next) {
        const values = next.series.map((b) => b.n);
        const starts = next.series.map((b) => b.start);
        const byDay = next.unit === "day";
        const labels = starts.map((d) => (byDay ? dayLabel(d, starts.length) : starts.length <= 13 || dayDate(d).getUTCMonth() % 3 === 0 ? monthWords(d) : ""));
        const said = (j: number) => `${byDay ? (j === 0 ? "Today" : dayWords(starts[j] ?? stats.today)) : monthYearWords(starts[j] ?? stats.today)} · ${sayReviews(values[j] ?? 0)}`;
        const total = sum(values);
        if (total === 0) return { empty: `Nothing coming up in the next ${frameWords(next.frame)}.` };
        return {
          figure: { parts: [[num(total), total === 1 ? "review" : "reviews"]] },
          chart: <Columns values={values} labels={labels} words={said} now={0} onAt={onAt} />,
          foot: `Heaviest: ${said(argmax(values))}`,
        };
      }
      if (!win) return { empty: "" };
      let values: number[];
      let labels: string[];
      let said: (j: number) => string;
      if (win.window === "today") {
        values = ahead.hours.slice(ahead.nowHour);
        labels = values.map((_, j) => hourLabel(ahead.nowHour + j, dayStart));
        said = (j) => `${j === 0 ? "Now" : hourSpanWords(hourAt(ahead.nowHour + j, dayStart))} · ${sayReviews(values[j] ?? 0)}`;
      } else {
        values = ahead.days.slice(0, win.window === "days7" ? 7 : 30);
        const days = values.map((_, j) => addDays(stats.today, j));
        labels = days.map((d) => dayLabel(d, days.length));
        said = (j) => `${j === 0 ? "Today" : dayWords(days[j] ?? stats.today)} · ${sayReviews(values[j] ?? 0)}`;
      }
      const total = sum(values);
      if (total === 0) return { empty: win.window === "today" ? "Nothing due today." : `Nothing coming up in the next ${values.length} days.` };
      return {
        figure: { parts: [[num(total), total === 1 ? "review" : "reviews"]] },
        chart: <Columns values={values} labels={labels} words={said} now={0} onAt={onAt} />,
        foot: win.window === "today" ? `${sayReviews(values[0] ?? 0)} due now · the rest later today` : `Heaviest: ${said(argmax(values))}`,
      };
    },
  },
  {
    id: "new",
    name: "New cards",
    home: true,
    windows: ["today", "days7", "days30", "months12"],
    window: "days7",
    make({ win, onAt }) {
      if (!win) return { empty: "" };
      const s = win.started;
      if (win.window === "today") {
        if (s.limit === 0) return { empty: "No new cards today." };
        return {
          figure: { parts: [[num(s.n), `of ${num(s.limit)}`]] },
          chart: <Rows rows={[{ key: "today", name: "Started today", n: s.n, says: `${num(s.n)} / ${num(s.limit)}` }]} max={s.limit} track said />,
          foot: s.n >= s.limit ? "Today's limit reached" : `${count(s.limit - s.n, "new card", "new cards")} left today`,
        };
      }
      if (s.n === 0) return { empty: emptyOf(win) };
      const values = s.series.map((b) => b.n);
      const ticks = s.series.map((b) => b.limit);
      const { labels, words } = stretchesOf(
        win,
        s.series.map((b) => b.start),
      );
      return {
        figure: { parts: [[num(s.n), s.n === 1 ? "new card" : "new cards"]], delta: deltaOf(s.n, s.before, beforeWords(win), true) },
        chart: <Columns values={values} ticks={ticks} labels={labels} words={(j) => `${words[j] ?? ""} · ${num(values[j] ?? 0)} of ${num(ticks[j] ?? 0)}`} now={values.length - 1} onAt={onAt} />,
        foot: win.unit === "month" ? (s.limit > 0 ? `${Math.round((s.n / s.limit) * 100)}% of the limit` : null) : `Limit reached on ${num(s.daysReached)} of ${count(s.daysWithLimit, "day", "days")}`,
      };
    },
  },
  {
    id: "tough",
    name: "Toughest cards",
    home: true,
    windows: ["days7", "days30", "months12", "all"],
    window: "days30",
    make({ ctx, win }) {
      if (!win) return { empty: "" };
      const t = win.tough;
      if (t.misses === 0) return { empty: win.window === "all" ? "No misses yet." : `No misses in ${windowWords(win).these}.` };
      const rate = (c: { misses: number; of: number }) => (c.of === 0 ? 0 : Math.round((c.misses / c.of) * 100));
      // The stage missed most, of those with enough answers to say so.
      const judged = win.right.stages.filter((s) => s.of >= 20);
      const missRates = judged.map((s) => 100 - pct1(s.right, s.of));
      const worst = judged[argmax(missRates)];
      return {
        figure: { parts: [[num(t.misses), t.misses === 1 ? "miss" : "misses"]], delta: deltaOf(t.misses, t.before, beforeWords(win), false) },
        chart: (
          <div className="w-list">
            {t.cards.slice(0, 5).map((c) => (
              <div key={c.cardId} className="w-item">
                <span className="w-item-front" lang={langOf(c.front)}>
                  {c.front}
                </span>
                <span className="w-item-n">
                  missed <b>{num(c.misses)}</b> of {num(c.of)} · {rate(c)}%
                </span>
              </div>
            ))}
          </div>
        ),
        foot: worst ? `Missed most in ${worst.name} · ${Math.round(missRates[argmax(missRates)] ?? 0)}%` : null,
        more:
          t.cards.length > 5 ? (
            <MoreBlock title={`${sayCards(t.missedCards)} missed`}>
              <div className="w-table">
                {t.cards.map((c) => (
                  <Fragment key={c.cardId}>
                    <span lang={langOf(c.front)}>
                      <b>{c.front}</b>
                    </span>
                    <span className="is-quiet">{deckName(ctx, c.deckId)}</span>
                    <span>{c.stage ? <span className="w-pill" style={c.stage.colour ? tintOf(c.stage.colour) : undefined}>{c.stage.name}</span> : null}</span>
                    <span className="is-num">
                      {num(c.misses)} of {num(c.of)}
                    </span>
                    <span className="is-num is-quiet">{rate(c)}%</span>
                  </Fragment>
                ))}
              </div>
            </MoreBlock>
          ) : undefined,
      };
    },
  },
  {
    id: "added",
    name: "Added",
    home: true,
    windows: ["days7", "days30", "months12", "all"],
    window: "days30",
    views: [
      { id: "time", label: "Until today" },
      { id: "source", label: "Source" },
    ],
    make({ stats, ctx, win, view, onAt }) {
      if (!win) return { empty: "" };
      const a = win.added;
      if (a.n === 0) return { empty: emptyOf(win) };
      const sources = [
        { key: "typed", name: "Typed manually", n: a.sources.typed, says: "typed manually" },
        { key: "youtube", name: "YouTube", n: a.sources.youtube, says: "from YouTube" },
        { key: "web", name: "Web pages", n: a.sources.web, says: "from web pages" },
      ];
      const top = sources[argmax(sources.map((s) => s.n))] ?? sources[0];
      const topWords = top ? `${Math.round((top.n / a.n) * 100)}% ${top.says}` : null;
      let chart: ReactNode;
      let foot: string | null;
      if (view === "source") {
        chart = <Rows rows={sources.map(({ key, name, n }) => ({ key, name, n }))} />;
        foot = topWords;
      } else ({ chart, foot } = byView({ win, view: "time", series: a.series, hours: [], say: sayCards, stats, ctx, onAt }));
      return {
        figure: { parts: [[num(a.n), a.n === 1 ? "card" : "cards"]], delta: deltaOf(a.n, a.before, beforeWords(win), true) },
        chart,
        foot,
      };
    },
  },
  {
    id: "time",
    name: "Time studying",
    home: true,
    windows: STAT_WINDOWS,
    window: "days30",
    views: [
      { id: "time", label: "Until today" },
      { id: "hour", label: "By hour" },
      { id: "side", label: "Side" },
    ],
    noViewsOn: ["today"],
    make({ stats, ctx, win, view, onAt }) {
      if (!win) return { empty: "" };
      const t = win.time;
      if (t.ms === 0) return { empty: emptyOf(win, "Nothing studied today yet.") };
      let chart: ReactNode;
      // A card each answer, a review's or a new card's: the time covers both, so a card's share is over both counts.
      const cards = win.reviews.n + win.started.n;
      let foot: string | null = `${count(t.sessions, "session", "sessions")} · ${cards > 0 ? (t.ms / cards / 1000).toFixed(1) : "0"} s a card`;
      // The time on each side of the flip: the front to it, the back after it.
      if (view === "side" && win.unit !== "one") {
        const sides = [
          { key: "front", name: "Front of card", n: t.sides.frontMs },
          { key: "back", name: "Back of card", n: t.sides.backMs },
        ].filter((p) => p.n > 0);
        chart = <Rows rows={sides.map((p) => ({ ...p, says: spent(p.n) }))} said />;
      } else {
        const drawn = byView({ win, view, series: t.series, hours: t.hours, say: spent, cap: spentCap, stats, ctx, onAt });
        chart = drawn.chart;
        if (view === "hour") foot = drawn.foot;
      }
      return {
        figure: { parts: spentParts(t.ms), delta: deltaOf(t.ms, t.before, beforeWords(win), null) },
        chart,
        foot,
      };
    },
  },
  {
    id: "pace",
    name: "Time per card",
    home: true,
    windows: ["days30", "months12", "all"],
    window: "months12",
    // Front: the card on screen to the flip; Back: the flip to the answer; Total: both.
    views: PACE_SIDES,
    view: "total",
    make({ win, view, onAt }) {
      if (!win) return { empty: "" };
      const side = PACE_SIDES.find((s) => s.id === view) ?? PACE_SIDES[2];
      const p = win.pace[side.id];
      if (win.pace.total.ms === null) return { empty: emptyOf(win) };
      const seconds = (ms: number) => (ms / 1000).toFixed(1);
      const values = p.series.map((s) => (s.ms === null ? null : Math.round(s.ms / 100) / 10));
      const { labels, words } = stretchesOf(
        win,
        p.series.map((s) => s.start),
        true,
      );
      // The foot says the other two sides, in the order a card goes, as one line: "Front 5.6 s · back 1.8 s".
      const others = PACE_SIDES.filter((s) => s.id !== side.id).flatMap((s) => {
        const ms = win.pace[s.id].ms;
        return ms === null ? [] : [`${s.label} ${seconds(ms)} s`];
      });
      const footLine = others.map((said, i) => (i === 0 ? said : said.charAt(0).toLowerCase() + said.slice(1)));
      return {
        // Faster is better: down is the good way.
        figure: { parts: [[p.ms === null ? "–" : seconds(p.ms), "s a card"]], delta: p.ms === null ? null : deltaOf(Math.round(p.ms / 100), p.before === null ? null : Math.round(p.before / 100), beforeWords(win), false) },
        chart: <LineChart values={values} labels={labels} words={(j) => `${words[j] ?? ""} · ${values[j] ?? 0} s a card`} fmt={(v) => `${v.toFixed(1)} s`} onAt={onAt} />,
        foot: footLine.length > 0 ? footLine.join(" · ") : null,
      };
    },
  },
  // Time watching (`win.watching`, `stats.watching`): the account's, whatever decks are in scope.
  {
    id: "watched",
    name: "Time watching",
    home: true,
    windows: STAT_WINDOWS,
    window: "days7",
    measures: WATCH_MEASURES,
    views: OVER_TIME,
    noViewsOn: ["today"],
    make({ stats, ctx, win, view, measure, onAt }) {
      if (!win) return { empty: "" };
      const w = win.watching;
      // Nothing watched is said once, whichever is measured, so the measure stays to switch back from.
      if (w.ms === 0) return { empty: emptyOf(win, "Nothing watched today yet.") };
      // Time spent is the clock; Of video, each part of a video once (`WindowStats.watching.ofVideo`).
      const ofVideo = measure === "video";
      const m = ofVideo ? w.ofVideo : { ms: w.ms, before: w.before, series: w.series, hours: w.hours, weekdays: w.weekdays };
      const say = ofVideo ? (ms: number) => `${spent(ms)} of video` : spent;
      const drawn = byView({ win, view, series: m.series, hours: m.hours, weekdays: m.weekdays, say, cap: spentCap, stats, ctx, onAt });
      const facts = `${count(w.videos, "video", "videos")} · ${count(w.channels.length, "channel", "channels")} · ${num(w.finished)} finished`;
      const channelMs = (c: (typeof w.channels)[number]) => (ofVideo ? c.ofVideoMs : c.ms);
      // "1 h 40 min of video": the last unit carries it.
      const parts = spentParts(m.ms);
      return {
        figure: { parts: ofVideo ? parts.map(([n, unit], i) => [n, i === parts.length - 1 ? `${unit} of video` : unit] as const) : parts, delta: deltaOf(m.ms, m.before, beforeWords(win), true) },
        chart: drawn.chart,
        foot: view === "time" || win.unit === "one" ? facts : drawn.foot,
        more: (
          <MoreBlock title="By channel">
            <Rows rows={[...w.channels].sort((a, b) => channelMs(b) - channelMs(a) || a.name.localeCompare(b.name)).map((c) => ({ key: c.name, name: c.name, n: channelMs(c), says: spent(channelMs(c)), lang: langOf(c.name) }))} long said />
          </MoreBlock>
        ),
      };
    },
  },
  {
    id: "channels",
    name: "Channels",
    home: true,
    windows: ["days7", "days30", "months12", "all"],
    window: "days30",
    views: [
      { id: "time", label: "Time" },
      { id: "cards", label: "Cards" },
    ],
    make({ win, view, onAt }) {
      if (!win) return { empty: "" };
      const w = win.watching;
      const rows = w.channels.filter((c) => c.ms > 0);
      if (rows.length === 0) return { empty: emptyOf(win) };
      const byCards = view === "cards";
      const sorted = [...rows].sort((a, b) => (byCards ? b.cards - a.cards : b.ms - a.ms) || a.name.localeCompare(b.name));
      const stacks = w.topSeries.map((s) => [...w.top.map((name, i) => ({ n: s.ms[i] ?? 0, colour: channelTint(w.top, name) })), { n: s.othersMs, colour: OTHERS_TINT }]);
      const totals = stacks.map((parts) => sum(parts.map((p) => p.n)));
      const { labels, words } = stretchesOf(
        win,
        w.topSeries.map((s) => s.start),
      );
      const others = rows.length - w.top.length;
      return {
        figure: { parts: [[num(rows.length), rows.length === 1 ? "channel" : "channels"]] },
        chart: <Rows rows={sorted.slice(0, 5).map((c) => ({ key: c.name, name: c.name, n: byCards ? c.cards : c.ms, says: byCards ? sayCards(c.cards) : spent(c.ms), tint: tintOf(channelTint(w.top, c.name)), lang: langOf(c.name) }))} long said />,
        foot: byCards ? `${sayCards(sum(rows.map((c) => c.cards)))} from videos` : `${spent(w.ms)} watched`,
        more: (
          <MoreBlock title="Over time">
            <Columns values={totals} stacks={stacks} labels={labels} words={(j) => `${words[j] ?? ""} · ${spent(totals[j] ?? 0)}`} cap={spentCap} onAt={onAt} />
            <div className="w-legend">
              {w.top.map((name) => (
                <span key={name} lang={langOf(name)}>
                  <i style={{ "--tint": channelTint(w.top, name) } as CSSProperties} />
                  {name}
                </span>
              ))}
              {others > 0 ? (
                <span>
                  <i style={{ "--tint": OTHERS_TINT } as CSSProperties} />
                  {count(others, "other", "others")}
                </span>
              ) : null}
            </div>
          </MoreBlock>
        ),
      };
    },
  },
  {
    id: "continue",
    name: "Continue watching",
    wide: true,
    home: true,
    make({ stats, ctx }) {
      const { continuing } = stats.watching;
      if (continuing.length === 0) return { empty: "No videos left part-way." };
      return { chart: <ContinueRows videos={continuing} onStale={ctx.onStale} />, foot: `${count(continuing.length, "video", "videos")} left part-way` };
    },
  },
  {
    // Saving is asked for, so it's shown whether or not Video tracking is on (unlike the watching tiles above).
    id: "saved",
    name: "Saved for later",
    wide: true,
    home: true,
    make({ stats, ctx }) {
      if (stats.saved.length === 0) return { empty: "No videos saved." };
      return { chart: <SavedRows videos={stats.saved} onStale={ctx.onStale} />, foot: `${count(stats.saved.length, "video", "videos")} saved` };
    },
  },
  {
    id: "recent",
    name: "Recently watched",
    wide: true,
    home: true,
    make({ stats }) {
      const { finished, finished30 } = stats.watching;
      if (finished.length === 0) return { empty: "No videos finished." };
      return { chart: <RecentRows videos={finished} />, foot: `${count(finished30, "video", "videos")} finished in 30 days` };
    },
  },
  // A layout that still names a tile no longer here (Together, Together · this week, Cards from videos) drops it (`layout.ts`).
];

/** The entry an id names; the registry is the one list, so a stored id that names nothing is simply not there. */
export const widgetOf = (id: string): TileEntry | undefined => WIDGETS.find((w) => w.id === id);

// ---------- The streaks ----------

/** A streak's tile on the board, as the home's layout keeps it: `streak:` and the streak's id. */
export const STREAK_TILE = "streak:";
export const streakTileId = (streakId: string): `${typeof STREAK_TILE}${string}` => `${STREAK_TILE}${streakId}`;
export const streakIdOfTile = (tileId: string): string | null => (tileId.startsWith(STREAK_TILE) ? tileId.slice(STREAK_TILE.length) : null);

// ---------- The tile ----------

type FrameProps = {
  /** The tile's id on the board (`data-id`), and what its height is remembered by. */
  id: string;
  name: string;
  /** How many of the board's columns it takes. */
  span: number;
  /** Its body is a skeleton while its numbers load, held at the height last drawn here. */
  loading: boolean;
  /** At the right of its name: the window, the settings button, Show more. */
  tools?: ReactNode;
  /** Its height isn't remembered while Show more is open. */
  open?: boolean;
  /** Anything laid over the tile: the × at its corner while the home is being arranged. */
  overlay?: ReactNode;
  className?: string;
  style?: CSSProperties | undefined;
  children: ReactNode;
};

/**
 * The frame every tile stands in: a panel with its name as the small title and its tools at the right, then its body.
 * Its real height is remembered on this device, and held while its body is a skeleton, so nothing grows or shrinks as
 * its numbers arrive (`skeletonMemory.ts`).
 */
export function Widget({ id, name, span, loading, tools, open = false, overlay, className = "", style, children }: FrameProps) {
  const titleId = `widget-${id}`;
  const kept = loading ? shapeOf(`tile:${id}`, 0) : 0;
  const remember: Ref<HTMLElement> | undefined = loading || open ? undefined : (el) => (el === null ? undefined : rememberShape(`tile:${id}`, el.offsetHeight));
  return (
    <section
      ref={remember}
      className={`panel widget ${open ? "is-open" : ""} ${className}`.replace(/\s+/g, " ").trim()}
      style={{ ...style, ...(span > 1 ? ({ "--w": span } as CSSProperties) : undefined), ...(kept > 0 ? { minHeight: `${kept}px` } : undefined) }}
      data-id={id}
      aria-labelledby={titleId}
    >
      <div className="w-head">
        <h3 id={titleId} className="panel-title">
          {name}
        </h3>
        {tools ? (
          <div className="w-tools" data-no-drag>
            {tools}
          </div>
        ) : null}
      </div>
      {children}
      {overlay}
    </section>
  );
}

function FigureRow({ figure }: { figure: Figure }) {
  const { delta } = figure;
  return (
    <div className="w-figure">
      <div className="w-hero-row">
        {figure.parts.map(([n, unit], j) => (
          <Fragment key={j}>
            <span className="w-hero">{n}</span>
            {unit ? <span className="w-unit">{unit}</span> : null}
          </Fragment>
        ))}
        {figure.aside ? <span className="w-aside">{figure.aside}</span> : null}
      </div>
      {delta ? (
        <p className="w-delta">
          {delta.same ? (
            `Same as ${delta.before}`
          ) : (
            <>
              <span className={`w-delta-n ${delta.good === true ? "is-good" : delta.good === false ? "is-bad" : ""}`.trim()}>
                <Icon name={delta.up ? "up" : "down"} />
                {delta.n}
              </span>
              <span>vs {delta.before}</span>
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

/** Show more and Show less, at a tile's head. */
function MoreButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <QuietIconButton className="w-more-button" icon={open ? "collapse" : "expand"} words={open ? "Show less" : "Show more"} open={open} onClick={onToggle} />;
}

/**
 * A range's numbers for one tile (Custom…), asked for on their own (`GET /api/stats?from=&to=`, `Stats.custom`) for the
 * decks the page's stats are for, again whenever those are asked for again; the last ones stay while the next come.
 * Nothing without a range.
 */
function useFrameStats(frame: StatFrame | null, way: FrameWay, stats: Stats | null): { win: WindowStats | null; ahead: CustomAhead | null; failure: string | null } {
  const [got, setGot] = useState<{ key: string; win: WindowStats | null; ahead: CustomAhead | null; failure: string | null } | null>(null);
  const key = frame && stats ? `${stats.deckId ?? ""}|${way}|${frame.n}|${frame.unit}` : null;
  useEffect(() => {
    if (!frame || !stats || key === null) return;
    let cancelled = false;
    api.stats(stats.deckId, { way, frame }).then(
      (answer) => {
        const missing = way === "last" ? answer.custom === null : answer.customAhead === null;
        if (!cancelled) setGot({ key, win: answer.custom, ahead: answer.customAhead, failure: missing ? "Couldn't load these days." : null });
      },
      (e: unknown) => {
        if (!cancelled) setGot({ key, win: null, ahead: null, failure: e instanceof Error ? e.message : "Couldn't load these days." });
      },
    );
    return () => {
      cancelled = true;
    };
    // The page's stats asked for again (a deck picked, a tile's change) ask for the frame's again too.
  }, [stats, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return got && got.key === key ? got : { win: null, ahead: null, failure: null };
}

type TileProps = {
  entry: TileEntry;
  stats: Stats | null;
  ctx: WidgetContext | null;
  overlay?: ReactNode;
  className?: string;
  style?: CSSProperties | undefined;
};

/**
 * A stat as a tile, the one anatomy: its name, the window it covers as a small dropdown and Show more where there's more
 * (taking the whole row, in place, never remembered); the number with its unit and the change against the window
 * before; the views of its breakdown; the chart, what's under the pointer said in the foot line; one line of fact; the
 * one empty line. The window and the view are this device's (`tilePicks.ts`).
 */
export function Tile({ entry, stats, ctx, overlay, className, style }: TileProps) {
  // Every tile with a time frame takes a custom one; one that looks ahead counts it from today on.
  const framed = entry.windows !== undefined;
  const way: FrameWay = entry.ahead ? "next" : "last";
  const [frame, setFrame] = useState<StatFrame | null>(() => (framed ? (readTilePick(entry.id).frame ?? null) : null));
  const [win, setWin] = useState<WindowId | null>(() => {
    if (!entry.windows) return null;
    const kept = readTilePick(entry.id).window;
    if (kept === "custom" && frame) return kept;
    return kept && kept !== "custom" && entry.windows.includes(kept) ? kept : (entry.window ?? entry.windows[0] ?? null);
  });
  const [view, setView] = useState<string>(() => {
    const kept = readTilePick(entry.id).view;
    return entry.views?.some((v) => v.id === kept) && kept ? kept : (entry.view ?? entry.views?.[0]?.id ?? "");
  });
  const [measure, setMeasure] = useState<string>(() => {
    const kept = readTilePick(entry.id).measure;
    return entry.measures?.some((m) => m.id === kept) && kept ? kept : (entry.measures?.[0]?.id ?? "");
  });
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const windowAt = useRef<HTMLSpanElement>(null);
  const custom = useFrameStats(win === "custom" ? frame : null, way, stats);
  const loading = stats === null || ctx === null || (win === "custom" && custom.win === null && custom.ahead === null && custom.failure === null);
  const winStats = stats === null || win === null ? null : win === "custom" ? custom.win : (stats.windows.find((w) => w.window === win) ?? null);
  const next = win === "custom" ? custom.ahead : null;
  const out = loading ? null : win === "custom" && custom.failure !== null ? { empty: custom.failure } : entry.make({ stats, ctx, win: winStats, next, view, measure, onAt: setAt });
  const shown = out && out.empty === undefined ? out : null;
  const more = shown?.more ?? null;
  // A day alone is drawn by the hour: no views over it, Today's or a range's of one day.
  const views = entry.views && shown && !(entry.noViewsOn && winStats?.unit === "one") ? entry.views : null;
  const isOpen = open && more !== null;
  const options: { id: WindowId | "pick"; label: string }[] = [
    ...(entry.windows ?? []).map((w) => ({ id: w, label: WINDOW_WORDS[w].label })),
    ...(framed && frame ? [{ id: "custom" as const, label: frameShort(frame) }] : []),
    ...(framed ? [{ id: "pick" as const, label: "Custom…" }] : []),
  ];
  return (
    <Widget
      id={entry.id}
      name={entry.name}
      span={isOpen ? 3 : entry.wide ? 2 : 1}
      loading={loading}
      open={isOpen}
      overlay={overlay}
      className={className ?? ""}
      style={style}
      tools={
        entry.windows || more ? (
          <>
            {entry.windows && win ? (
              <span ref={windowAt} className="w-window">
                <Dropdown
                  id={`tile-${entry.id}-window`}
                  label={`${entry.name}: window`}
                  size="sm"
                  anchored
                  options={options}
                  value={win}
                  onChange={(next) => {
                    if (next === "pick") {
                      setPicking(true);
                      return;
                    }
                    setWin(next);
                    setAt(null);
                    if (next === "custom") {
                      if (frame) writeTilePick(entry.id, { window: "custom", frame });
                    } else writeTilePick(entry.id, { window: next });
                  }}
                />
              </span>
            ) : null}
            {framed && picking ? (
              <FramePicker
                idPrefix={`tile-${entry.id}-frame`}
                anchor={windowAt}
                open={picking}
                frame={frame}
                lead={FRAME_LEAD[way]}
                onClose={() => setPicking(false)}
                onPick={(next) => {
                  setPicking(false);
                  setFrame(next);
                  setWin("custom");
                  setAt(null);
                  writeTilePick(entry.id, { window: "custom", frame: next });
                }}
              />
            ) : null}
            {more ? <MoreButton open={isOpen} onToggle={() => setOpen(!open)} /> : null}
          </>
        ) : null
      }
    >
      {out === null ? (
        <Skeleton shape="tile" />
      ) : out.empty !== undefined ? (
        <p className="w-quiet">{out.empty}</p>
      ) : (
        <>
          {out.figure ? <FigureRow figure={out.figure} /> : null}
          {views || entry.measures ? (
            <div className="w-views" data-no-drag>
              {entry.measures ? (
                <Segmented
                  idPrefix={`tile-${entry.id}-measure`}
                  label={`${entry.name}: measure`}
                  size="sm"
                  options={entry.measures}
                  value={measure}
                  onChange={(next) => {
                    setMeasure(next);
                    setAt(null);
                    writeTilePick(entry.id, { measure: next });
                  }}
                />
              ) : null}
              {views ? (
                <Segmented
                  idPrefix={`tile-${entry.id}-view`}
                  label={`${entry.name}: show`}
                  size="sm"
                  options={views}
                  value={view}
                  onChange={(next) => {
                    setView(next);
                    setAt(null);
                    writeTilePick(entry.id, { view: next });
                  }}
                />
              ) : null}
            </div>
          ) : null}
          {out.chart}
          {at || out.foot ? <p className="w-foot">{at ?? out.foot}</p> : null}
          {isOpen ? <div className="w-more">{more}</div> : null}
        </>
      )}
    </Widget>
  );
}

/** The panel a streak is made or changed in, hanging from the button that opened it as a question hangs from its button. */
function StreakPanelFrame({ anchor, open, onClose, title, label, failure, children }: { anchor: RefObject<HTMLButtonElement | null>; open: boolean; onClose: () => void; title: string; label: string; failure: string | null; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useAnchored(anchor, panel, open, undefined, "auto");
  useDismiss(panel, open, onClose, anchor);
  return (
    <div ref={panel} className="menu tile-panel" role="dialog" aria-label={label} hidden={!open} data-no-drag>
      <p className="panel-title">{title}</p>
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
      {children}
    </div>
  );
}

type SavedStreaks = { streaks: StreakRule[]; pillStreak: Settings["pillStreak"] };

/**
 * A streak's own settings, hanging from its tile's settings button: the streak's editor for that streak alone, saved a
 * moment after each change, and Delete asking first (not for the last streak). Kept while the tile stands once it's
 * been opened, so a change made just before it closes still goes up. What it sends is the account's streaks as they
 * stand with this one's change, so a streak made or changed since it opened is never sent back as it was.
 */
function StreakPanel({ rule, ctx, open, anchor, onClose }: { rule: StreakRule; ctx: WidgetContext; open: boolean; anchor: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const [current, patch, failure] = useSavedSoon<SavedStreaks>({ streaks: ctx.settings.streaks, pillStreak: ctx.settings.pillStreak }, async (change) => {
    const saved = await ctx.onSettings(change);
    return { streaks: saved.streaks, pillStreak: saved.pillStreak };
  });
  const [asking, setAsking] = useState(false);
  const deleteAt = useRef<HTMLButtonElement>(null);
  const streak = current.streaks.find((s) => s.id === rule.id) ?? rule;
  const name = streakNameOf(streak);
  const streaks = ctx.settings.streaks;
  return (
    <StreakPanelFrame anchor={anchor} open={open} onClose={onClose} title="Streak" label={`${name}: settings`} failure={failure}>
      <StreakEditor idPrefix={`tile-streak-${rule.id}`} streak={streak} anchored onChange={(change) => patch({ streaks: streaks.map((s) => (s.id === rule.id ? { ...streak, ...change } : s)) })} />
      <div className="tile-panel-foot">
        <Button ref={deleteAt} id={`tile-streak-${rule.id}-delete`} className="is-danger" aria-pressed={asking} aria-expanded={asking} disabled={streaks.length <= 1} onClick={() => setAsking(!asking)}>
          <Icon name="trash" />
          Delete
        </Button>
        {asking ? (
          <Ask
            idPrefix={`tile-streak-${rule.id}-delete`}
            anchor={deleteAt}
            question={`Delete the streak “${name}”?`}
            go={{ words: "Delete", busy: "Deleting…" }}
            busy={false}
            failure={null}
            onKeep={() => setAsking(false)}
            onGo={() => {
              setAsking(false);
              onClose();
              patch({ streaks: streaks.filter((s) => s.id !== rule.id), ...(ctx.settings.pillStreak === rule.id ? { pillStreak: null } : {}) });
            }}
          />
        ) : null}
      </div>
    </StreakPanelFrame>
  );
}

/** A streak not yet made: what the editor opens on, a daily streak counting the whole history with the first condition at its start. */
function freshStreak(): StreakRule {
  const kind = GOAL_KIND_IDS[0];
  return { id: crypto.randomUUID(), name: "New streak", per: "day", countFrom: "all", groups: [[{ kind, n: GOAL_KINDS[kind].start }]] };
}

/** A new streak's editor, hanging from the dashed tile: nothing is made until Create, and backing out leaves nothing behind. */
function NewStreakPanel({ ctx, anchor, onClose }: { ctx: WidgetContext; anchor: RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const [draft, setDraft] = useState(freshStreak);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function create() {
    setBusy(true);
    setFailure(null);
    try {
      await ctx.onSettings({ streaks: [...ctx.settings.streaks, draft] });
      onClose();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Couldn't make the streak.");
      setBusy(false);
    }
  }
  return (
    <StreakPanelFrame anchor={anchor} open onClose={onClose} title="New streak" label="New streak" failure={failure}>
      <StreakEditor idPrefix="tile-streak-new" streak={draft} anchored disabled={busy} onChange={(change) => setDraft((d) => ({ ...d, ...change }))} />
      <div className="tile-panel-foot">
        <Button id="tile-streak-new-cancel" onClick={onClose}>
          Cancel
        </Button>
        <Button id="tile-streak-new-create" variant="primary" disabled={busy} onClick={() => void create()}>
          <Icon name="add" />
          {busy ? "Creating…" : "Create"}
        </Button>
      </div>
    </StreakPanelFrame>
  );
}

/**
 * The dashed tile after the streaks on the Streaks screen: pressed, a new streak's editor hangs from it. Greyed while the
 * account has as many streaks as it may, and as its own shape while the settings load.
 */
export function NewStreakTile({ ctx }: { ctx: WidgetContext | null }) {
  const [open, setOpen] = useState(false);
  const at = useRef<HTMLButtonElement>(null);
  const full = ctx !== null && ctx.settings.streaks.length >= STREAKS_MAX;
  return (
    <>
      <Button ref={at} id="tile-streak-new" className="tile-new" aria-expanded={open} disabled={ctx === null || full} onClick={() => setOpen(!open)}>
        <Icon name="add" />
        New streak
      </Button>
      {ctx && open ? <NewStreakPanel ctx={ctx} anchor={at} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type StreakTileProps = {
  /** Its id on the board (`streakTileId`). */
  id: string;
  /** The streak as the settings keep it; none while they load. */
  rule: StreakRule | undefined;
  /** The streak as the stats work it out; none while they load. */
  state: StreakState | undefined;
  /** Today, the account's. */
  today: Day | null;
  ctx: WidgetContext | null;
  overlay?: ReactNode;
  className?: string;
  style?: CSSProperties | undefined;
};

/**
 * How each streak type's period is drawn, the web's one place for it: the row's words, a cell's label under its
 * block, the period said in full, and the period a day falls in (Show more's map is of days).
 */
const PERIOD_DRAWN: Record<StreakPer, { row: string; label: (start: Day) => string; said: (start: Day) => string; startOf: (day: Day) => Day }> = {
  day: { row: "This week", label: (d) => DOW[dayDate(d).getUTCDay()] ?? "", said: dayWords, startOf: (d) => d },
  week: { row: "Past 7 weeks", label: shortDayWords, said: (d) => `Week of ${shortDayWords(d)}`, startOf: sundayOf },
};

/** A streak's row of seven periods: a block each, filled for one that counted, the one going on ringed, days still to come fainter, its label under each. */
function PeriodRow({ state }: { state: StreakState }) {
  const drawn = PERIOD_DRAWN[state.per];
  const n = state.row.filter((p) => p.counted).length;
  return (
    <div className="w-periods" aria-label={`${drawn.row}: ${periodCountWords(state.per, n)} counted`}>
      {state.row.map((p, i) => (
        <span key={p.start} className={`w-period ${p.counted ? "is-on" : ""} ${i === state.rowNow ? "is-now" : ""} ${i > state.rowNow ? "is-ahead" : ""}`.replace(/\s+/g, " ").trim()}>
          <span className="w-block" />
          <span className="w-period-label">{drawn.label(p.start)}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * One streak as a tile: its name, the run and the best, each goal over the period going on with its bar and its state
 * as a mark (a tick, the count in red, or a cross), and the row of periods (this week's days, or the past seven weeks);
 * the time left is Status's. Its settings button opens the streak's own editor beside it; Show
 * more is the past six months and the longest runs.
 */
export function StreakTile({ id, rule, state, today, ctx, overlay, className = "", style }: StreakTileProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState(false);
  const [at, setAt] = useState<string | null>(null);
  const settingsAt = useRef<HTMLButtonElement>(null);
  // Nothing known of it yet (the Stats tab's shells while the settings load): no name to say.
  const named = rule ?? state;
  const name = named ? streakNameOf(named) : "";
  const loading = !state || !ctx || today === null;
  const period = STREAK_PERIODS[state?.per ?? "day"];
  const tools = (
    <>
      {rule && ctx ? (
        <QuietIconButton
          ref={settingsAt}
          className="w-streak-settings"
          icon="settings"
          words="Streak settings"
          open={editing}
          onClick={() => {
            setEditing(!editing);
            setOpened(true);
          }}
        />
      ) : null}
      {!loading ? <MoreButton open={open} onToggle={() => setOpen(!open)} /> : null}
      {rule && ctx && opened ? <StreakPanel rule={rule} ctx={ctx} open={editing} anchor={settingsAt} onClose={() => setEditing(false)} /> : null}
    </>
  );
  return (
    <Widget id={id} name={name} span={open && !loading ? 3 : 1} loading={loading} open={open} overlay={overlay} className={className} style={style} tools={tools}>
      {loading || !state || today === null ? (
        <Skeleton shape="tile" />
      ) : (
        <>
          <FigureRow figure={{ parts: [[num(state.current), state.current === 1 ? period.one : period.many]], aside: `Best ${num(state.best)}` }} />
          <div className="w-goals">
            {/* Each group, the nearest to being met first, an "or" between groups as the editor draws it. */}
            {state.groups.map((group, gi) => (
              <Fragment key={gi}>
                {gi > 0 ? <p className="w-goal-or">or</p> : null}
                {group.map((g, ci) => {
                  const kind = GOAL_KINDS[g.kind];
                  const met = g.have >= g.need;
                  // Its state as a mark, no words: met a tick; not yet, the count so far in red, or a cross where there's no count.
                  return (
                    <div key={ci} className={`w-goal ${met ? "is-met" : "is-unmet"}`}>
                      <span className="w-goal-name">{kind.name}</span>
                      {met ? (
                        <span className="w-goal-n" role="img" aria-label="Met">
                          <Icon name="check" />
                        </span>
                      ) : kind.numbered ? (
                        <span className="w-goal-n">{goalSaysWords(g.kind, g.have, g.need)}</span>
                      ) : (
                        <span className="w-goal-n" role="img" aria-label="Not met">
                          <Icon name="cross" />
                        </span>
                      )}
                      {kind.numbered ? (
                        <span className="w-bar is-track">
                          <span className="w-bar-fill" style={{ width: `${g.need > 0 ? Math.min(100, (g.have / g.need) * 100) : 0}%` }} />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <PeriodRow state={state} />
          {open ? <StreakMore state={state} today={today} name={name} at={at} onAt={setAt} /> : null}
        </>
      )}
    </Widget>
  );
}

/**
 * A streak's Show more: the past six months as days, each lit when the period it's in counted (a week that counted is a
 * whole column), how many of the recent periods did, and the longest runs.
 */
function StreakMore({ state, today, name, at, onAt }: { state: StreakState; today: Day; name: string; at: string | null; onAt: (words: string | null) => void }) {
  const counted = new Set(state.counted);
  const drawn = PERIOD_DRAWN[state.per];
  const period = STREAK_PERIODS[state.per];
  const now = state.row[state.rowNow]?.start ?? today;
  const first = addDays(sundayOf(today), -25 * 7);
  const step = (day: Day): HeatStep => (counted.has(drawn.startOf(day)) ? 4 : 0);
  const wordsOf = (day: Day) => `${drawn.said(drawn.startOf(day))} · ${counted.has(drawn.startOf(day)) ? "counted" : drawn.startOf(day) === now ? "not yet" : "didn't count"}`;
  return (
    <div className="w-more">
      <MoreBlock title="Past 6 months">
        <HeatMap first={first} cols={26} from={first} to={today} step={step} wordsOf={wordsOf} onAt={onAt} label={`${name}, past 6 months`} />
        <p className="w-foot">{at ?? `${num(state.recent.n)} of the past ${periodCountWords(state.per, state.recent.of)} counted`}</p>
      </MoreBlock>
      <MoreBlock title="Longest runs">
        {state.runs.length === 0 ? (
          <p className="w-quiet">No runs yet.</p>
        ) : (
          <div className="w-runs">
            {state.runs.map((r) => (
              <div key={r.from} className="w-run">
                <b>{periodCountWords(state.per, r.n)}</b>
                <span>
                  {shortDayWords(r.from)} – {r.to === now ? period.now : fullDayWords(r.to)}
                </span>
              </div>
            ))}
          </div>
        )}
      </MoreBlock>
    </div>
  );
}
