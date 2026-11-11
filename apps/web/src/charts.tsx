/** @panki The tiles' charts, each drawn once: columns (stacked too), rows, a line, days as a heat map at any length (`Columns`, `Rows`, `LineChart`, `HeatMap`). Never a second drawing of a chart. */
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Day } from "@panki/contracts";
import { ScrollEdges } from "./components/ScrollEdges";
import { monthWords } from "./words";

/**
 * Every chart says what's under the pointer through `onAt` (the tile puts it in its foot line, so a finger has it too:
 * a press says it as a hover does) and `null` once the pointer leaves. None of them draws a bubble of its own.
 */
type Pointed = { onAt: (words: string | null) => void };

const DAY_MS = 86_400_000;
/** A day on the account's clock ("YYYY-MM-DD") as a moment at UTC midnight, so date arithmetic never crosses a zone. */
export const dayDate = (day: Day) => new Date(`${day}T00:00:00Z`);
export const dayOf = (date: Date): Day => date.toISOString().slice(0, 10);
export const addDays = (day: Day, n: number): Day => dayOf(new Date(dayDate(day).getTime() + n * DAY_MS));
export const daysFrom = (from: Day, to: Day) => Math.round((dayDate(to).getTime() - dayDate(from).getTime()) / DAY_MS);
/** The days of the week as every chart labels them, by calendar weekday (0 Sunday, `weekdayOf`): three letters, never two or an initial. */
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Thin columns on a hairline, the largest named on its cap, a label under each that has one. `stacks` draws each
 * column as its parts, bottom up, each in its colour; `ticks` a dashed mark at each column's own line (a limit). The
 * column `now` is lit, those from `ahead` on fainter. A column never vanishes: a small share still shows a stub, and
 * one at nothing a faint one (`is-zero`), so a gap in the row never reads as a day or an hour missing.
 */
export function Columns({
  values,
  labels,
  words,
  onAt,
  now = -1,
  ahead = -1,
  cap = (v: number) => v.toLocaleString(),
  ticks,
  stacks,
}: Pointed & {
  values: readonly number[];
  labels: readonly string[];
  words: (j: number) => string;
  now?: number;
  ahead?: number;
  cap?: (v: number) => string;
  ticks?: readonly number[];
  stacks?: readonly (readonly { n: number; colour: string }[])[];
}) {
  const [atJ, setAtJ] = useState<number | null>(null);
  const max = Math.max(0, ...values, ...(ticks ?? []));
  const top = Math.max(0, ...values) > 0 ? values.indexOf(Math.max(...values)) : -1;
  const point = (j: number) => {
    setAtJ(j);
    onAt(words(j));
  };
  const share = (v: number, of: number) => (of > 0 ? `${(v / of) * 100}%` : "0%");
  return (
    <div
      className="w-cols"
      style={{ "--cols": values.length } as CSSProperties}
      onPointerLeave={() => {
        setAtJ(null);
        onAt(null);
      }}
    >
      {values.map((v, j) => (
        <div key={j} className={`w-col ${j === now ? "is-now" : ""} ${ahead >= 0 && j >= ahead ? "is-ahead" : ""} ${atJ === j ? "is-at" : ""} ${v === 0 ? "is-zero" : ""}`.replace(/\s+/g, " ").trim()} onPointerEnter={() => point(j)} onPointerDown={() => point(j)}>
          <span className="w-col-cap">{j === top ? cap(v) : ""}</span>
          <span className="w-col-plot">
            {stacks ? (
              <span className="w-stack" style={{ height: share(v, max) }}>
                {(stacks[j] ?? []).map((part, s) => (
                  <span key={s} style={{ "--tint": part.colour, height: share(part.n, v) } as CSSProperties} />
                ))}
              </span>
            ) : (
              <span className="w-col-bar" style={{ height: share(v, max) }} />
            )}
            {ticks ? <span className="w-col-tick" style={{ bottom: share(ticks[j] ?? 0, max) }} /> : null}
          </span>
          <span className="w-col-label">{labels[j] ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

export type RowSpec = {
  key: string;
  name: string;
  n: number;
  /** What the row says at its end, when it isn't the number itself: "87.5%", "3 h 12 min", "4 / 10". */
  says?: string;
  /** Its colour as a tint (`srsKinds.ts` → `tintOf`): a stage's, a channel's. */
  tint?: CSSProperties | undefined;
  className?: string;
  lang?: "ja" | undefined;
};

/**
 * Rows: a name, a thin bar, the number. The bar is scaled to the largest row, or to `max` (100 for a share); `track`
 * draws the bar's whole length under it. `said` and `long` give the number and the name more room.
 */
export function Rows({ rows, max, track = false, said = false, long = false }: { rows: readonly RowSpec[]; max?: number; track?: boolean; said?: boolean; long?: boolean }) {
  const top = max ?? Math.max(0, ...rows.map((r) => r.n));
  return (
    <div className={`w-rows ${long ? "is-long" : ""}`.trim()}>
      {rows.map((r) => (
        <div key={r.key} className={`w-row ${said ? "is-said" : ""} ${r.className ?? ""}`.replace(/\s+/g, " ").trim()} style={r.tint}>
          <span className="w-row-name" lang={r.lang}>
            {r.name}
          </span>
          <span className={`w-bar ${track ? "is-track" : ""}`.trim()}>
            <span className="w-bar-fill" style={{ width: top > 0 ? `${Math.min(100, (r.n / top) * 100)}%` : "0%" }} />
          </span>
          <span className="w-row-n">{r.says ?? r.n.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A value over time as a line on its window, the highest and the lowest it reached named at their height. A gap (null)
 * is a stretch with nothing to say; the dot stands on the last point, or on the one under the pointer.
 */
export function LineChart({ values, labels, words, fmt, onAt }: Pointed & { values: readonly (number | null)[]; labels: readonly string[]; words: (j: number) => string; fmt: (v: number) => string }) {
  const [atJ, setAtJ] = useState<number | null>(null);
  const real = values.filter((v): v is number => v !== null);
  if (real.length === 0) return null;
  const hi0 = Math.max(...real);
  const lo0 = Math.min(...real);
  const pad = (hi0 - lo0) * 0.18 || Math.max(1, hi0 * 0.05);
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const n = values.length;
  const x = (j: number) => (n === 1 ? 50 : (j / (n - 1)) * 100);
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const points = values.flatMap((v, j) => (v === null ? [] : [[x(j), y(v)] as const]));
  const line = points.map((p, j) => `${j ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = first && last ? `${line} L${last[0].toFixed(2)} 100 L${first[0].toFixed(2)} 100 Z` : "";
  const lastJ = values.reduce<number>((at, v, j) => (v === null ? at : j), 0);
  const shownJ = atJ ?? lastJ;
  const shown = values[shownJ] ?? null;
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const j = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - box.left) / box.width) * (n - 1))));
    if ((values[j] ?? null) === null) return;
    setAtJ(j);
    onAt(words(j));
  }
  return (
    <div className="w-linechart">
      <div className="w-line-axis" aria-hidden="true">
        <span style={{ top: `${y(hi0)}%` }}>{fmt(hi0)}</span>
        {hi0 !== lo0 ? <span style={{ top: `${y(lo0)}%` }}>{fmt(lo0)}</span> : null}
      </div>
      <div
        className="w-line-plot"
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => {
          setAtJ(null);
          onAt(null);
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="w-line-area" d={area} />
          <path className="w-line-path" d={line} />
        </svg>
        {shown !== null ? <span className={`w-line-dot ${atJ !== null ? "is-at" : ""}`.trim()} style={{ left: `${x(shownJ)}%`, top: `${y(shown)}%` }} /> : null}
      </div>
      <div className="w-line-labels" style={{ "--cols": labels.length } as CSSProperties}>
        {labels.map((l, j) => (
          <span key={j}>{l}</span>
        ))}
      </div>
    </div>
  );
}

/** How dark a day is drawn, 0 for nothing, 1 to 4 for more. */
export type HeatStep = 0 | 1 | 2 | 3 | 4;
/** A value as one of the four steps of the largest. */
export const stepOf = (v: number, max: number): HeatStep => (v <= 0 || max <= 0 ? 0 : (Math.max(1, Math.min(4, Math.ceil((v / max) * 4))) as HeatStep));

const CELL = 10;
const PITCH = 12;

/** The columns a year's map has: its cells' size is the one every map of `size` "year" is drawn at. */
const YEAR_COLS = 53;

/**
 * Days as a heat map: a column a week from `first`, the first day of a week of the account's (`weekStartOf`), at the
 * top; only the days from `from` to `to`
 * drawn; the months named above where each begins. Scaled to the width it's in (`fit`), or (`year`) at the size a
 * year's 53 columns fill the width with, so a few weeks are a few columns at the left and more than a year runs on to
 * the right, scrolling sideways inside its box.
 */
export function HeatMap({ first, cols, from, to, step, wordsOf, onAt, label, size = "fit" }: Pointed & { first: Day; cols: number; from: Day; to: Day; step: (day: Day) => HeatStep; wordsOf: (day: Day) => string; label: string; size?: "fit" | "year" }) {
  const box = useRef<HTMLDivElement>(null);
  if (size === "fit") return <HeatGrid first={first} cols={cols} from={from} to={to} step={step} wordsOf={wordsOf} onAt={onAt} label={label} />;
  return (
    <div className="heat-frame">
      <div ref={box} className="heat-scroll">
        <HeatGrid first={first} cols={cols} from={from} to={to} step={step} wordsOf={wordsOf} onAt={onAt} label={label} share={`${(cols / YEAR_COLS) * 100}%`} />
      </div>
      <ScrollEdges of={box} axis="x" />
    </div>
  );
}

/** The map itself, as wide as its box (or `share`, a share of it). */
function HeatGrid({ first, cols, from, to, step, wordsOf, onAt, label, share }: Pointed & { first: Day; cols: number; from: Day; to: Day; step: (day: Day) => HeatStep; wordsOf: (day: Day) => string; label: string; share?: string }) {
  const [at, setAt] = useState<Day | null>(null);
  const cells: { col: number; row: number; day: Day; step: HeatStep }[] = [];
  const months: { col: number; label: string }[] = [];
  let lastMonth = "";
  for (let col = 0; col < cols; col++) {
    const weekFirst = addDays(first, col * 7);
    const shown: Day[] = [];
    for (let row = 0; row < 7; row++) {
      const day = addDays(weekFirst, row);
      if (day < from || day > to) continue;
      shown.push(day);
      cells.push({ col, row, day, step: step(day) });
    }
    const named = shown[0] ?? weekFirst;
    const month = named.slice(0, 7);
    if (month !== lastMonth) {
      // Three letters need about three columns: a month cut short at the map's start gives way to the next.
      const previous = months[months.length - 1];
      if (previous && col - previous.col < 3) months.pop();
      months.push({ col, label: monthWords(named) });
      lastMonth = month;
    }
  }
  const width = cols * PITCH - (PITCH - CELL);
  const height = 7 * PITCH - (PITCH - CELL);
  function point(e: ReactPointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((((e.clientX - box.left) / box.width) * width) / PITCH);
    const row = Math.floor((((e.clientY - box.top) / box.height) * height) / PITCH);
    const cell = cells.find((c) => c.col === col && c.row === row);
    setAt(cell?.day ?? null);
    onAt(cell ? wordsOf(cell.day) : null);
  }
  return (
    <div className="heat-year" style={share === undefined ? undefined : { width: share }}>
      <div className="heat-months" style={{ "--cols": cols } as CSSProperties} aria-hidden="true">
        {months.map((m) => (
          <span key={m.col} style={{ gridColumn: m.col + 1 }}>
            {m.label}
          </span>
        ))}
      </div>
      <div
        className="heat-plot"
        onPointerMove={point}
        onPointerDown={point}
        onPointerLeave={() => {
          setAt(null);
          onAt(null);
        }}
      >
        <svg className="heat" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
          {cells.map((c) => (
            <rect key={c.day} x={c.col * PITCH} y={c.row * PITCH} width={CELL} height={CELL} rx="2" className={`heat-cell is-${c.step} ${at === c.day ? "is-at" : ""}`.trim()} />
          ))}
        </svg>
      </div>
    </div>
  );
}

/** How many week columns run from the week's first day `first` (`weekStartOf`) to a day. */
export const weeksTo = (first: Day, to: Day) => Math.floor(daysFrom(first, to) / 7) + 1;
