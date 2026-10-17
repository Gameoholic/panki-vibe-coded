import type { CSSProperties } from "react";
import {
  STAY,
  WaitUnit,
  isBurned,
  isNew,
  mainAnswers,
  stageIndex,
  waitMinutes,
  type Card,
  type CardPlace,
  type SrsAfter,
  type SrsAnswer,
  type SrsStage,
  type SrsType,
  type Step,
  type Wait,
} from "@panki/contracts";

/**
 * The SRS in words and looks, one home: the units a wait is counted in, the steps an answer can be set to, how a
 * stage, a place and a wait are phrased, and the colour a stage takes from its place on the ladder. The ids are the
 * contracts'; nothing else in the app names one.
 */
export const WAIT_UNITS: Record<WaitUnit, { one: string; many: string; short: string }> = {
  min: { one: "minute", many: "minutes", short: "m" },
  h: { one: "hour", many: "hours", short: "h" },
  d: { one: "day", many: "days", short: "d" },
  w: { one: "week", many: "weeks", short: "w" },
  mo: { one: "month", many: "months", short: "mo" },
};
export const WAIT_UNIT_OPTIONS = WaitUnit.options.map((id) => ({ id, label: WAIT_UNITS[id].short }));

/** The fixed steps, in the menu's order. The ask-agains (`AGAIN_OPTIONS`) and "go to a stage" are made per type. */
export type StepOptionId = "up1" | "up2" | "stay" | "down1" | "down2" | "burn" | "retry" | "hidden";
export const STEP_OPTIONS: readonly { id: StepOptionId; step: Step }[] = [
  { id: "up1", step: { kind: "move", by: 1 } },
  { id: "up2", step: { kind: "move", by: 2 } },
  { id: "stay", step: STAY },
  { id: "down1", step: { kind: "move", by: -1 } },
  { id: "down2", step: { kind: "move", by: -2 } },
  { id: "burn", step: { kind: "burn" } },
  { id: "retry", step: { kind: "retry" } },
  // The answer isn't offered at that point of the chart (the owner, 2026-10-17: no Bury inside an ask-again).
  { id: "hidden", step: { kind: "hidden" } },
];
/** The two ways to ask again before deciding: after a wait (a later review), or right away (the same review). */
export const AGAIN_OPTIONS: readonly { id: "again" | "again-now"; label: string; now: boolean }[] = [
  { id: "again", label: "Ask again later", now: false },
  { id: "again-now", label: "Ask again right away", now: true },
];
/** The moves along the ladder as one short row on the box's card, lowest first. */
export const MOVE_OPTIONS: readonly { id: StepOptionId; label: string }[] = [
  { id: "down2", label: "↓ 2" },
  { id: "down1", label: "↓ 1" },
  { id: "stay", label: "Stay" },
  { id: "up1", label: "↑ 1" },
  { id: "up2", label: "↑ 2" },
];
const MOVE_WORDS: Record<number, string> = { 1: "Up one", 2: "Up two", 0: "Stays", [-1]: "Down one", [-2]: "Down two" };

/** The option a step is: one of the fixed ones, `again`, or `to:<stage id>`. */
export function stepKey(step: Step | undefined): string {
  if (!step) return "stay";
  if (step.kind === "move") return step.by === 1 ? "up1" : step.by === 2 ? "up2" : step.by === -1 ? "down1" : step.by === -2 ? "down2" : "stay";
  if (step.kind === "to") return `to:${step.stage}`;
  return step.kind;
}
type Named = Pick<SrsType, "stages" | "after" | "burnedName">;
export function stepLabel(type: Named, step: Step | undefined): string {
  if (!step) return MOVE_WORDS[0] ?? "";
  if (step.kind === "move") return MOVE_WORDS[step.by] ?? "Stays";
  if (step.kind === "burn") return type.burnedName;
  if (step.kind === "retry") return "Keep asking";
  if (step.kind === "hidden") return "Button hidden";
  if (step.kind === "again") return `Ask again ${step.now ? "right away" : waitWords(step.wait)}`;
  return `Go to ${stageName(type, type.stages.findIndex((s) => s.id === step.stage))}`;
}

/** What rung number `idx` is called: New before the first, the stage's name (or "Stage N"), the end past the top. */
export function stageName(type: Named, idx: number): string {
  if (idx < 0) return "New";
  const stage = type.stages[idx];
  if (!stage) return type.after === "burn" ? type.burnedName : `Stage ${idx + 1}`;
  return stage.name || `Stage ${idx + 1}`;
}
export function placeName(type: Named, place: CardPlace): string {
  if (isBurned(type, place)) return type.burnedName;
  return stageName(type, stageIndex(type, place));
}

const r1 = (x: number) => (Math.round(x * 10) / 10).toString();
/** A span of minutes in the shortest words: "now", "30 min", "4 h", "1.5 d", "2 w", "4 mo", "1.2 y". */
export function spanWords(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${r1(minutes / 60)} h`;
  if (minutes < 10080) return `${r1(minutes / 1440)} d`;
  if (minutes < 40320) return `${r1(minutes / 10080)} w`;
  if (minutes < 518400) return `${r1(minutes / 43200)} mo`;
  return `${r1(minutes / 518400)} y`;
}
/** How long a stage waits, in the shortest words; a stage set to no wait says so. */
export function stageWaitWords(stage: Pick<SrsStage, "wait">): string {
  return stage.wait.n === 0 ? "no wait" : spanWords(waitMinutes(stage.wait));
}
/** A span of minutes in longer words, for a sentence: "about 2 months", "about a year and a half". */
export function longSpan(minutes: number): string {
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)} days`;
  if (minutes < 40320) return `${Math.round(minutes / 10080)} weeks`;
  if (minutes < 518400) return `about ${Math.round(minutes / 43200)} months`;
  const years = minutes / 518400;
  return years < 1.75 ? "about a year and a half" : `about ${Math.round(years)} years`;
}
/** A wait as when it is: "tomorrow", "in 4 hours", "in 2 weeks". */
export function waitWords(wait: Wait): string {
  if (wait.n === 1 && wait.unit === "d") return "tomorrow";
  return `in ${wait.n} ${wait.n === 1 ? WAIT_UNITS[wait.unit].one : WAIT_UNITS[wait.unit].many}`;
}
/** When an ask-again really comes back, after "again": "tomorrow", "in 4 hours", or "right away" for one asked in the same review. */
export function againWords(minutes: number): string {
  return minutes <= 0 ? "right away" : waitWords(minutesAsWait(minutes));
}
/** Minutes as a wait in whole units, for "again tomorrow" after an answer. */
export function minutesAsWait(minutes: number): Wait {
  if (minutes >= 1440) return { n: Math.max(1, Math.round(minutes / 1440)), unit: "d" };
  if (minutes >= 60) return { n: Math.max(1, Math.round(minutes / 60)), unit: "h" };
  return { n: Math.max(1, Math.round(minutes)), unit: "min" };
}
/** When a card comes back, beside it in a list: "new", "due now", "in 3 h", "in 2 d", "in 3 w", or the end. */
export function dueWords(type: Named, card: Pick<Card, "place" | "dueAt">, now: number): string {
  if (isBurned(type, card.place)) return type.burnedName.toLowerCase();
  if (isNew(card.place) || card.dueAt === null) return "new";
  const days = (card.dueAt - now) / 86_400_000;
  if (days <= 0) return "due now";
  if (days < 1) return `in ${Math.max(1, Math.round(days * 24))} h`;
  if (days < 14) return `in ${Math.round(days)} d`;
  if (days < 60) return `in ${Math.round(days / 7)} w`;
  return `in ${Math.round(days / 30)} mo`;
}

/** Among the main answers the first is the one that hurts, the last the one that helps, the ones between are mid; one set apart is quiet. */
export function answerClass(answers: readonly SrsAnswer[], i: number): "ans-down" | "ans-mid" | "ans-up" | "ans-aside" {
  const answer = answers[i];
  if (!answer || answer.aside) return "ans-aside";
  const main = mainAnswers(answers);
  const at = main.indexOf(answer);
  return main.length > 1 && at === 0 ? "ans-down" : at === main.length - 1 ? "ans-up" : "ans-mid";
}
/** A stage's colour comes from its place on the ladder: a hue ramp from the first stage to the last; lightness and saturation are theme tokens. */
const TINT = { hue: 228, span: 66 };
export function tintStyle(i: number, n: number): CSSProperties {
  const t = n <= 1 ? 0 : Math.min(1, Math.max(0, i) / (n - 1));
  const h = Math.round(TINT.hue + t * TINT.span);
  return { "--tint-bg": `hsl(${h} var(--tint-s) var(--tint-l))`, "--tint-fg": `hsl(${h} var(--tint-fs) var(--tint-fl))` } as CSSProperties;
}
export function placeTint(type: Named, place: CardPlace): CSSProperties | undefined {
  if (isBurned(type, place)) return undefined;
  return tintStyle(Math.min(stageIndex(type, place), type.stages.length - 1), type.stages.length);
}

export const AFTER_OPTIONS: readonly { id: Exclude<SrsAfter, "burn">; label: string }[] = [
  { id: "repeat", label: "at the last wait" },
  { id: "grow", label: "with the wait growing" },
];

/** A type in one line, under its name in the list: "9 stages · 4h → 4mo, then Burned · 2 answers" (the first wait to the last; the first stage has none). */
export function typeSummary(type: SrsType): string {
  const first = type.stages[1];
  const last = type.stages[type.stages.length - 1];
  const span = first && last ? `${first.wait.n}${WAIT_UNITS[first.wait.unit].short} → ${last.wait.n}${WAIT_UNITS[last.wait.unit].short}` : "";
  const tail = type.after === "burn" ? `then ${type.burnedName}` : type.after === "repeat" ? "then repeats" : "then keeps growing";
  return `${type.stages.length} ${type.stages.length === 1 ? "stage" : "stages"} · ${span}, ${tail} · ${type.answers.length} answers`;
}
