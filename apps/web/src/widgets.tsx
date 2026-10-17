import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import type { Day, Deck, Settings, SrsType, Stats } from "@panki/contracts";
import { Button } from "./components/Button";
import { Tip } from "./components/Tip";
import { tintStyle } from "./srsKinds";
import { count, dateWords, langOf } from "./words";

/**
 * The widgets, one registry: every tile the Stats tab shows (all of them, in this order) and the home can carry
 * (`home`). Each knows its name, whether it spans both columns, and how to draw itself from the stats. A new widget
 * is one entry here and nothing else; the home's layout keeps ids, so an id is never renamed.
 */
export type WidgetId = "due" | "streak" | "heat" | "reviews" | "right" | "ladder" | "coming" | "days" | "added" | "time" | "tough";

/** What a widget may need besides the stats: the decks in scope, the types, the settings, and the way into a review. */
export type WidgetContext = {
  decks: Deck[];
  srsTypes: SrsType[];
  settings: Settings;
  onReview: () => void;
};

export type WidgetEntry = {
  id: WidgetId;
  name: string;
  /** Wants two columns of the board where it has them. */
  wide?: boolean;
  /** Offered on the home; the Stats tab shows every one. */
  home: boolean;
  /** The quiet words at the right of the title row, saying what the tile covers ("This week", "30 days"); from the stats when they depend on them. */
  control?: string | ((stats: Stats) => string);
  render: (stats: Stats, ctx: WidgetContext) => ReactNode;
};

const DAY_MS = 86_400_000;
/** The days of the week, Sunday first: the owner's week. */
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTH_INITIAL = new Intl.DateTimeFormat(undefined, { month: "narrow", timeZone: "UTC" });
const DAY_WORDS = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** A day on the owner's clock ("YYYY-MM-DD") as a moment at UTC midnight, so date arithmetic never crosses a zone. */
const dayDate = (day: Day) => new Date(`${day}T00:00:00Z`);
const dayOf = (date: Date): Day => date.toISOString().slice(0, 10);
/** A whole-number percentage with one decimal when it has one: "87", "87.5". */
const pct = (part: number, of: number) => (of === 0 ? 0 : Number(((part / of) * 100).toFixed(1)));
const num = (n: number) => n.toLocaleString();

/** The one quiet line a tile says while the silo has nothing for it yet. */
function Quiet({ children = "Nothing yet" }: { children?: ReactNode }) {
  return <p className="w-quiet">{children}</p>;
}

/** Thin columns on a hairline, the largest labelled with its number on its cap, a label under each that has one. */
function Columns({ values, labels, classOf }: { values: readonly number[]; labels?: readonly string[]; classOf?: (i: number) => string }) {
  const max = Math.max(0, ...values);
  const top = max > 0 ? values.indexOf(max) : -1;
  return (
    <div className="w-cols" style={{ "--cols": values.length } as CSSProperties} aria-hidden="true">
      {values.map((v, i) => (
        <div key={i} className="w-col">
          <span className="w-col-cap">{i === top ? num(v) : ""}</span>
          <span className="w-col-plot">
            <span className={`w-col-bar ${classOf?.(i) ?? ""}`.trim()} style={{ height: max > 0 ? `${(v / max) * 100}%` : "0%" }} />
          </span>
          <span className="w-col-label">{labels?.[i] ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

/** A year of days, Sunday at the top of each column, the last column today's week; darker for more. */
function Heat({ stats }: { stats: Stats }) {
  const COLS = 53;
  const ROWS = 7;
  const CELL = 10;
  const PITCH = 12;
  const today = dayDate(stats.today);
  const todayMs = today.getTime();
  const firstMs = todayMs - today.getUTCDay() * DAY_MS - (COLS - 1) * 7 * DAY_MS;
  const counts = new Map(stats.byDay.map((d) => [d.day, d.n]));
  const max = Math.max(1, ...stats.byDay.map((d) => d.n));
  const cells: { col: number; row: number; day: Day; n: number; step: number }[] = [];
  const months: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let col = 0; col < COLS; col++) {
    const sundayMs = firstMs + col * 7 * DAY_MS;
    const month = new Date(sundayMs).getUTCMonth();
    // A month is named where its first Sunday lands; the first column's is cut off, so it goes unnamed.
    if (month !== lastMonth) {
      if (col > 0) months.push({ col, label: MONTH_INITIAL.format(new Date(sundayMs)) });
      lastMonth = month;
    }
    for (let row = 0; row < ROWS; row++) {
      const ms = sundayMs + row * DAY_MS;
      if (ms > todayMs) break;
      const day = dayOf(new Date(ms));
      const n = counts.get(day) ?? 0;
      cells.push({ col, row, day, n, step: n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 4)) });
    }
  }
  const total = stats.byDay.reduce((sum, d) => sum + d.n, 0);
  const width = COLS * PITCH - (PITCH - CELL);
  const height = ROWS * PITCH - (PITCH - CELL);
  // The day under the pointer: the app's own hint above its cell, and the line under the chart says it too for a finger.
  const [at, setAt] = useState<{ day: Day; n: number; x: number; y: number } | null>(null);
  function point(e: ReactPointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((((e.clientX - box.left) / box.width) * width) / PITCH);
    const row = Math.floor((((e.clientY - box.top) / box.height) * height) / PITCH);
    const cell = cells.find((c) => c.col === col && c.row === row);
    if (!cell) {
      setAt(null);
      return;
    }
    setAt({ day: cell.day, n: cell.n, x: ((cell.col * PITCH + CELL / 2) / width) * box.width, y: ((cell.row * PITCH) / height) * box.height });
  }
  return (
    <>
      <div className="heat-months" style={{ "--cols": COLS } as CSSProperties} aria-hidden="true">
        {months.map((m) => (
          <span key={m.col} style={{ gridColumn: m.col + 1 }}>
            {m.label}
          </span>
        ))}
      </div>
      <div className="heat-plot" onPointerMove={point} onPointerDown={point} onPointerLeave={() => setAt(null)}>
        <svg className="heat" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${count(total, "review", "reviews")} in the past year`}>
          {cells.map((c) => (
            <rect key={c.day} x={c.col * PITCH} y={c.row * PITCH} width={CELL} height={CELL} rx="2" className={`heat-cell is-${c.step} ${at?.day === c.day ? "is-at" : ""}`.trim()} />
          ))}
        </svg>
        {at ? (
          <Tip x={at.x} y={at.y}>
            {DAY_WORDS.format(dayDate(at.day))} · {count(at.n, "review", "reviews")}
          </Tip>
        ) : null}
      </div>
      <p className="w-line">{at ? `${DAY_WORDS.format(dayDate(at.day))} · ${count(at.n, "review", "reviews")}` : `${num(total)} reviews · weeks start Sunday`}</p>
    </>
  );
}

/** A half ring filled to a share of the whole. */
function Ring({ share }: { share: number }) {
  return (
    <svg className="w-ring" viewBox="0 0 100 54" aria-hidden="true">
      <path className="w-ring-track" d="M8 50A42 42 0 0 1 92 50" />
      {share > 0 ? <path className="w-ring-fill" d="M8 50A42 42 0 0 1 92 50" pathLength={100} strokeDasharray={`${share} 100`} /> : null}
    </svg>
  );
}

/** One row of the ladder: a name, a thin bar scaled to the largest row, the count. */
function LadderRow({ name, n, max, className = "", style }: { name: string; n: number; max: number; className?: string; style?: CSSProperties }) {
  return (
    <div className={`w-row ${className}`.trim()} style={style}>
      <span className="w-row-name">{name}</span>
      <span className="w-bar">
        <span className="w-bar-fill" style={{ width: max > 0 ? `${(n / max) * 100}%` : "0%" }} />
      </span>
      <span className="w-row-n">{num(n)}</span>
    </div>
  );
}

export const WIDGETS: readonly WidgetEntry[] = [
  {
    id: "due",
    name: "Due now",
    home: false,
    render(stats, ctx) {
      const decks = ctx.decks.filter((d) => stats.deckId === null || d.id === stats.deckId);
      const due = decks.reduce((sum, d) => sum + d.dueCount, 0);
      const fresh = decks.reduce((sum, d) => sum + d.newCount, 0);
      return (
        <>
          <div className="w-hero">{num(due + fresh)}</div>
          <p className="w-line">
            {num(due)} due · {num(fresh)} new
          </p>
          {/* Blue only with something to do, the same rule as the Review door. */}
          <div className="add-actions add-actions-start">
            <Button variant={due + fresh > 0 ? "primary" : "ghost"} onClick={ctx.onReview}>
              Review
            </Button>
          </div>
        </>
      );
    },
  },
  {
    id: "streak",
    name: "Streak",
    home: true,
    control: "This week",
    render(stats) {
      const { current, best, week, todayIndex } = stats.streak;
      return (
        <>
          <div className="w-hero-row">
            <span className="w-hero">{num(current)}</span>
            <span className="w-unit">{current === 1 ? "day" : "days"}</span>
            <span className="w-aside">Best {num(best)}</span>
          </div>
          <div className="w-week" aria-label={`This week: ${count(week.filter(Boolean).length, "day", "days")} studied`}>
            {DOW.map((dow, i) => (
              <span key={dow} className={`w-day ${week[i] ? "is-on" : ""} ${i === todayIndex ? "is-today" : ""} ${i > todayIndex ? "is-ahead" : ""}`.trim()}>
                <span className="w-block" />
                <span className="w-dow">{dow}</span>
              </span>
            ))}
          </div>
        </>
      );
    },
  },
  {
    id: "heat",
    name: "Past year",
    wide: true,
    home: true,
    control: "‹ Past year ›",
    render: (stats) => <Heat stats={stats} />,
  },
  {
    id: "reviews",
    name: "Reviews",
    home: true,
    control: "All time",
    render(stats) {
      const { total, today, days7, days30 } = stats.reviews;
      return (
        <>
          <div className="w-hero">{num(total)}</div>
          <div className="w-stats">
            <span className="w-stat">
              <span className="w-stat-label">Today</span>
              <span className="w-stat-n">{num(today)}</span>
            </span>
            <span className="w-stat">
              <span className="w-stat-label">7 days</span>
              <span className="w-stat-n">{num(days7)}</span>
            </span>
            <span className="w-stat">
              <span className="w-stat-label">30 days</span>
              <span className="w-stat-n">{num(days30)}</span>
            </span>
          </div>
        </>
      );
    },
  },
  {
    id: "right",
    name: "Right",
    home: true,
    control: "30 days",
    render(stats) {
      const { days30, before } = stats.right;
      if (days30.of === 0) return <Quiet />;
      const share = pct(days30.right, days30.of);
      return (
        <>
          <div className="w-meter">
            <Ring share={share} />
            <span className="w-hero">{share}%</span>
          </div>
          <p className="w-line">
            {before.of === 0 ? "Nothing in the 30 before" : `${pct(before.right, before.of)}% the 30 before`} · a miss is the first answer
          </p>
        </>
      );
    },
  },
  {
    id: "ladder",
    name: "Ladder",
    home: true,
    // One ladder: its type's name; several: each ladder names itself inside.
    control: (stats) => (stats.ladders.length === 1 ? (stats.ladders[0]?.name ?? "") : ""),
    render(stats) {
      if (stats.ladders.length === 0) return <Quiet />;
      return (
        <div className="w-ladders">
          {stats.ladders.map((ladder) => {
            const n = ladder.stages.length;
            const max = Math.max(ladder.fresh, ladder.burned, ...ladder.stages.map((s) => s.n));
            return (
              <div key={ladder.srsTypeId} className="w-ladder">
                {stats.ladders.length > 1 ? <p className="w-sub">{ladder.name}</p> : null}
                <LadderRow name="New" n={ladder.fresh} max={max} className="is-new" />
                {ladder.stages.map((stage, i) => (
                  <LadderRow key={stage.id} name={stage.name || `Stage ${i + 1}`} n={stage.n} max={max} style={tintStyle(i, n)} />
                ))}
                <LadderRow name={ladder.burnedName} n={ladder.burned} max={max} className="is-burned" />
              </div>
            );
          })}
        </div>
      );
    },
  },
  {
    id: "coming",
    name: "Coming up",
    home: true,
    control: "7 days",
    render(stats) {
      const labels = stats.coming.map((_, i) => DOW[(stats.streak.todayIndex + i) % 7] ?? "");
      return (
        <>
          <Columns values={stats.coming} labels={labels} />
          <p className="w-line">{count(stats.coming.reduce((sum, n) => sum + n, 0), "review", "reviews")} in the next 7 days</p>
        </>
      );
    },
  },
  {
    id: "days",
    name: "Days studied",
    home: true,
    render(stats) {
      const { studied, since } = stats.days;
      return (
        <>
          <div className="w-hero">{num(studied)}</div>
          <p className="w-line">days with a review · {since === null ? "since your first review" : `since ${dateWords(since)}`}</p>
        </>
      );
    },
  },
  {
    id: "added",
    name: "Added",
    home: true,
    control: "12 weeks",
    render(stats) {
      const last = stats.added.length - 1;
      return (
        <>
          <Columns values={stats.added} classOf={(i) => (i === last ? "is-now" : "is-past")} />
          <p className="w-line">{count(stats.added.reduce((sum, n) => sum + n, 0), "card", "cards")} in 12 weeks</p>
        </>
      );
    },
  },
  {
    id: "time",
    name: "Time",
    home: true,
    control: "2 weeks",
    render(stats) {
      const { byDay, perCardMs, sessions30 } = stats.time;
      if (byDay.every((d) => d.ms === 0)) return <Quiet />;
      const minutes = byDay.map((d) => Math.round(d.ms / 60_000));
      // Every other day is named; there's no room for all fourteen.
      const labels = byDay.map((d, i) => (i % 2 === 0 ? (DOW[dayDate(d.day).getUTCDay()] ?? "") : ""));
      const perCard = perCardMs === null ? null : Math.round(perCardMs / 1000);
      return (
        <>
          <Columns values={minutes} labels={labels} />
          <p className="w-line">
            {perCard === null ? "" : `${num(perCard)} s a card · `}
            {count(sessions30, "sitting", "sittings")} in 30 days
          </p>
        </>
      );
    },
  },
  {
    id: "tough",
    name: "Toughest cards",
    home: true,
    control: "This month",
    render(stats) {
      if (stats.tough.length === 0) return <Quiet>No misses in the past 30 days</Quiet>;
      return (
        <div className="w-list">
          {stats.tough.slice(0, 5).map((card) => (
            <div key={card.cardId} className="w-item">
              <span className="w-item-front" lang={langOf(card.front)}>
                {card.front}
              </span>
              <span className="w-item-n">missed {num(card.misses)}×</span>
            </div>
          ))}
        </div>
      );
    },
  },
];

/** The entry an id names; the registry is the one list, so a stored id that names nothing is simply not there. */
export const widgetOf = (id: string): WidgetEntry | undefined => WIDGETS.find((w) => w.id === id);

/** The words at the right of a widget's title row, or none. */
export function controlOf(entry: WidgetEntry, stats: Stats | null): string {
  if (typeof entry.control === "function") return stats ? entry.control(stats) : "";
  return entry.control ?? "";
}

type WidgetProps = {
  entry: WidgetEntry;
  /** The words at the right of the title row (`controlOf`). */
  control?: string;
  /** Anything laid over the tile: the × at its corner while the home is being arranged. */
  overlay?: ReactNode;
  className?: string;
  style?: CSSProperties | undefined;
  ref?: Ref<HTMLElement>;
  children: ReactNode;
};

/** The tile every widget is drawn in: a panel with its name as the small title and its control at the right, then its body. */
export function Widget({ entry, control = "", overlay, className = "", style, ref, children }: WidgetProps) {
  const titleId = `widget-${entry.id}`;
  return (
    <section ref={ref} style={style} className={`panel widget ${className}`.trim()} data-id={entry.id} aria-labelledby={titleId}>
      <div className="w-head">
        <h3 id={titleId} className="panel-title">
          {entry.name}
        </h3>
        {control ? <span className="w-ctl">{control}</span> : null}
      </div>
      {children}
      {overlay}
    </section>
  );
}
