import type { CSSProperties, ReactNode } from "react";
import { TRANSCRIBE_MODES, TRANSCRIBE_MODE_IDS, type TranscribeEstimate, type TranscribeMode } from "@panki/contracts";
import { aboutWords as about } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { MODE_ICONS, ModeChip } from "./ModeChip";
import { Toggle } from "./Toggle";

/**
 * The transcription modes side by side, as plans are on a pricing page (the owner, 2026-10-20: "a chart to compare
 * between them, like cost, speed etc., with x's and v's"): a column per mode, a row per way they differ, every row
 * lined up across the columns. The column of the mode everyone starts on is lit; under each, whether it's on and the
 * press that makes it the default. What it takes to start is measured (`TranscribeEstimate`), the rest is what each
 * mode is. The words are the owner's, worked over on the plan page (https://claude.ai/artifact/Ewy5PU1JTWAgPFABVGwt2V).
 * On a phone each mode is a card of its own, every cell with its row's name.
 */

type Mark = "yes" | "no" | "some";
const MARK_ICON: Record<Mark, "check" | "close" | "minus"> = { yes: "check", no: "close", some: "minus" };
/** A cell: how the mode fares, what it comes to, and a quieter line under that. */
type Cell = { mark: Mark; text: ReactNode; under?: string };

/** Each row, its name and each mode's cell in it, the estimate filling in what's measured. */
function rowsOf(estimate: TranscribeEstimate): { name: string; cells: Record<TranscribeMode, Cell> }[] {
  const first = estimate.firstWordsMs === null ? null : about(estimate.firstWordsMs / 1000);
  const minutes = estimate.lengthMs === null ? null : Math.max(1, Math.round(estimate.lengthMs / 60_000));
  const full: Cell =
    estimate.secondsPerMinute === null || minutes === null
      ? { mark: "no", text: "No data yet" }
      : { mark: "no", text: `Average video, ${minutes} min: ${about(estimate.secondsPerMinute * minutes)}`, under: `${estimate.secondsPerMinute.toFixed(1)} s per minute in the video` };
  return [
    {
      name: "Speed",
      cells: {
        full,
        live: { mark: "yes", text: first ?? "No data yet" },
        hybrid: { mark: "yes", text: first ?? "No data yet" },
        auto: { mark: "yes", text: first === null ? "No data yet" : `${first}, or longer if the video is long` },
      },
    },
    {
      name: "Downloads",
      cells: {
        full: { mark: "yes", text: "Entire video" },
        live: { mark: "some", text: "In chunks: what you watch, plus the lead" },
        hybrid: { mark: "yes", text: "In chunks, then the entire video" },
        auto: { mark: "some", text: "Entire video, or in chunks if the video is long" },
      },
    },
    {
      name: "Seeking",
      cells: {
        full: { mark: "yes", text: "Covered anywhere once downloaded" },
        live: { mark: "no", text: `${first ?? "A few seconds"} for new words at the new timestamp` },
        hybrid: { mark: "some", text: `${first ?? "A few seconds"} for new words until the download finishes, then covered anywhere` },
        auto: { mark: "some", text: "Covered anywhere once downloaded, unless the video is long" },
      },
    },
    {
      name: "Accuracy",
      cells: {
        full: { mark: "yes", text: "Best: the full context of the video" },
        live: { mark: "no", text: "Lower: processed in chunks" },
        hybrid: { mark: "yes", text: "Best once the entire video is downloaded" },
        auto: { mark: "some", text: "Best, unless the video is long" },
      },
    },
    {
      name: "Cost",
      cells: {
        full: { mark: "no", text: "Every minute of the video, watched or not" },
        live: { mark: "yes", text: "Only what's watched" },
        hybrid: { mark: "no", text: "Every minute of the video, plus the first few again" },
        auto: { mark: "some", text: "Every minute of the video, unless it's long, then only what's watched" },
      },
    },
    {
      name: "Hidden player",
      cells: {
        full: { mark: "yes", text: "None" },
        live: { mark: "no", text: "Runs" },
        hybrid: { mark: "some", text: "Runs only until the entire video is downloaded" },
        auto: { mark: "some", text: "Runs only until the entire video is downloaded, unless the video is long" },
      },
    },
  ];
}

/** What each mode is, under its name. */
const ABOUT: Record<TranscribeMode, ReactNode> = {
  full: "Downloads the entire video in one go at the start.",
  live: "A hidden player runs ahead of you in the background, recording chunks that are transcribed one at a time, while you watch.",
  hybrid: "Transcribes in chunks while the entire video downloads in the background. When the download finishes, its transcript replaces the chunks and the hidden player stops.",
  auto: (
    <>
      Picks <ModeChip mode="hybrid" /> or <ModeChip mode="live" /> based on the video's length.
    </>
  ),
};

type Props = {
  /** The mode everyone starts on, and those switched off. */
  mode: TranscribeMode;
  modesOff: readonly TranscribeMode[];
  estimate: TranscribeEstimate;
  onDefault: (mode: TranscribeMode) => void;
  onOn: (mode: TranscribeMode, on: boolean) => void;
};

export function ModeCompare({ mode, modesOff, estimate, onDefault, onOn }: Props) {
  const rows = rowsOf(estimate);
  return (
    <div className="mode-compare" style={{ "--mode-rows": rows.length + 2 } as CSSProperties}>
      <div className="mode-col mode-names" aria-hidden="true">
        <span className="mode-cell mode-head" />
        {rows.map((row) => (
          <span key={row.name} className="mode-cell mode-name">
            {row.name}
          </span>
        ))}
        <span className="mode-cell mode-foot" />
      </div>
      {TRANSCRIBE_MODE_IDS.map((id) => {
        const isDefault = id === mode;
        const on = isDefault || !modesOff.includes(id);
        return (
          <section key={id} className={`mode-col ${isDefault ? "is-default" : ""} ${on ? "" : "is-off"}`.trim()} aria-labelledby={`mode-${id}-name`}>
            <div className="mode-cell mode-head">
              <span className="mode-title">
                <Icon name={MODE_ICONS[id]} />
                <span id={`mode-${id}-name`}>{TRANSCRIBE_MODES[id].name}</span>
                {isDefault ? <span className="mode-default">Default</span> : null}
              </span>
              <span className="mode-about">{ABOUT[id]}</span>
            </div>
            {rows.map((row) => {
              const cell = row.cells[id];
              return (
                <div key={row.name} className={`mode-cell mode-says is-${cell.mark}`}>
                  <span className="mode-row-name">{row.name}</span>
                  <Icon name={MARK_ICON[cell.mark]} className="mode-mark" />
                  <span>
                    {cell.text}
                    {cell.under ? <small>{cell.under}</small> : null}
                  </span>
                </div>
              );
            })}
            <div className="mode-cell mode-foot">
              <Toggle id={`mode-${id}-on`} says={{ on: "On", off: "Off" }} on={on} disabled={isDefault} onChange={(next) => onOn(id, next)} />
              {isDefault ? null : (
                <Button id={`mode-${id}-default`} disabled={!on} onClick={() => onDefault(id)}>
                  Make default
                </Button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
