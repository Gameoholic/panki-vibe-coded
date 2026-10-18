import { Fragment, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DEFAULT_DECK_SETTINGS, mainAnswers, type Settings, type SrsType } from "@panki/contracts";
import { count } from "../words";
import { Dropdown } from "./Dropdown";
import { Tip } from "./Tip";
import { longSpan, spanWords, tintStyle } from "../srsKinds";
import { ASAP, forecast, journey, type JourneyStep } from "../srsPreview";

type Props = {
  type: SrsType;
  settings: Settings;
};

/** The chart's box: its size, the room under the bars for the axis words and over them for the peak, and how many last days are lit. */
const CHART = { w: 300, h: 64, pad: 2, foot: 14, head: 4, tail: 14 };

function StepPill({ type, idx, wait, again }: { type: SrsType; idx: number; wait: number; again: boolean }) {
  const n = type.stages.length;
  const style = again ? undefined : tintStyle(Math.min(idx, n - 1), n);
  return (
    <span className={`jstep ${again ? "is-again" : ""}`.trim()} style={style}>
      {again ? "again · " : ""}
      {spanWords(wait)}
    </span>
  );
}

function Journey({ type, steps }: { type: SrsType; steps: JourneyStep[] }) {
  return (
    <div className="journey">
      {steps.map((s, i) => {
        const arrow = i < steps.length - 1 ? <span className="jarrow">→</span> : null;
        if (s.kind === "done")
          return (
            <span key={i} className="jend is-done">
              {type.burnedName.toLowerCase()} · {s.reviews} reviews · {longSpan(s.total)}
            </span>
          );
        if (s.kind === "forever")
          return (
            <span key={i} className="jend">
              … every {spanWords(s.wait)}, for good
            </span>
          );
        if (s.kind === "more")
          return (
            <span key={i} className="jend">
              … and on, growing
            </span>
          );
        return (
          <Fragment key={i}>
            <StepPill type={type} idx={s.idx} wait={s.wait} again={s.again} />
            {arrow}
          </Fragment>
        );
      })}
    </div>
  );
}

/** How many new cards a day the forecast can be tried with, and how far ahead it can look. */
const NEW_CHOICES = [5, 10, 15, 20, 30, 50];
const MONTH_CHOICES = [1, 3, 6, 12];
const MONTH_DAYS = 30;
/** How often the owner reviews, for the forecast: a card that comes due waits for the next sitting. */
const SITTING_OPTIONS: readonly { id: number; label: string }[] = [
  { id: 1, label: "reviewing once a day" },
  { id: 2, label: "reviewing twice a day" },
  { id: 3, label: "reviewing 3 times a day" },
  { id: ASAP, label: "reviewing as soon as it's due" },
];

/** The live preview beside the editor: one card's journey, and how many reviews a day the type comes to, tried with a pace and a horizon picked here. */
export function FlowPreview({ type, settings }: Props) {
  const steps = useMemo(() => journey(type), [type]);
  const [newPerDay, setNewPerDay] = useState(DEFAULT_DECK_SETTINGS.newPerDay);
  const [months, setMonths] = useState(3);
  const [sittings, setSittings] = useState(1);
  const days = useMemo(() => forecast(type, { ...settings, newPerDay }, months * MONTH_DAYS, sittings), [type, settings, newPerDay, months, sittings]);
  const newOptions = NEW_CHOICES.map((n) => ({ id: n, label: `${n} new cards a day` }));
  const monthOptions = MONTH_CHOICES.map((m) => ({ id: m, label: m === 12 ? "after a year" : m === 1 ? "after a month" : `after ${m} months` }));
  const horizon = months === 12 ? "year 1" : `month ${months}`;
  const max = Math.max(1, ...days);
  const peak = Math.max(...days);
  const tail = Math.round(days.slice(-CHART.tail).reduce((a, b) => a + b, 0) / CHART.tail);
  const barW = (CHART.w - CHART.pad * 2) / days.length;
  const barH = (v: number) => (v / max) * (CHART.h - CHART.foot - CHART.head);
  /** The day under the pointer or the finger, and where its bar's top is in the plot, for the hint. */
  const [at, setAt] = useState<{ i: number; x: number; y: number } | null>(null);
  const pointed = at && at.i < days.length ? at : null;
  function point(e: ReactPointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const across = ((e.clientX - box.left) / box.width) * CHART.w;
    const i = Math.max(0, Math.min(days.length - 1, Math.floor((across - CHART.pad) / barW)));
    const x = ((CHART.pad + (i + 0.5) * barW) / CHART.w) * box.width;
    const y = ((CHART.h - CHART.foot - barH(days[i] ?? 0)) / CHART.h) * box.height;
    setAt({ i, x, y });
  }
  const best = mainAnswers(type.answers).at(-1)?.name ?? "";

  // A type started empty has nothing to play out yet.
  if (type.stages.length === 0 || type.answers.length === 0) {
    return (
      <section className="panel preview" aria-label="Preview">
        <h3 className="panel-title">Preview</h3>
        <p className="empty">{type.stages.length === 0 ? "No stages yet." : "No answers yet."}</p>
      </section>
    );
  }

  return (
    <section className="panel preview" aria-label="Preview">
      <h3 className="panel-title">One card, {best} each time</h3>
      <Journey type={type} steps={steps} />
      <h3 className="panel-title">Reviews a day</h3>
      <div className="cost">
        <div className="cost-picks">
          <Dropdown id="preview-new" label="New cards a day" options={newOptions} value={newPerDay} onChange={setNewPerDay} />
          <Dropdown id="preview-sittings" label="How often you review" options={SITTING_OPTIONS} value={sittings} onChange={setSittings} />
          <Dropdown id="preview-months" label="How far ahead" options={monthOptions} value={months} onChange={setMonths} />
        </div>
        <div className="cost-plot" onPointerMove={point} onPointerDown={point} onPointerLeave={() => setAt(null)}>
          <svg className="cost-chart" viewBox={`0 0 ${CHART.w} ${CHART.h}`} preserveAspectRatio="none" aria-hidden="true">
            {days.map((v, i) => (
              <rect
                key={i}
                x={(CHART.pad + i * barW).toFixed(1)}
                y={(CHART.h - CHART.foot - barH(v)).toFixed(1)}
                width={Math.max(1, barW - 0.6).toFixed(1)}
                height={barH(v).toFixed(1)}
                rx="1"
                className={`${i >= days.length - CHART.tail ? "is-tail" : ""} ${pointed?.i === i ? "is-at" : ""}`.trim()}
              />
            ))}
          <text x={CHART.pad} y={CHART.h - 2}>
            day 1
          </text>
          <text x={CHART.w - CHART.pad} y={CHART.h - 2} textAnchor="end">
            {horizon}
          </text>
            <text x={CHART.pad} y={10}>
              peak {peak}
            </text>
          </svg>
          {pointed ? (
            <Tip x={pointed.x} y={pointed.y}>
              Day {pointed.i + 1} · {count(days[pointed.i] ?? 0, "review", "reviews")}
            </Tip>
          ) : null}
        </div>
        {/* The day pointed at is said in the line too: a finger has no hint bubble. */}
        <p className="cost-words">
          {pointed ? (
            <>
              Day {pointed.i + 1}: <b>{days[pointed.i] ?? 0}</b> {(days[pointed.i] ?? 0) === 1 ? "review" : "reviews"}.
            </>
          ) : (
            <>
              About <b>{tail}</b> reviews a day by {horizon}.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
