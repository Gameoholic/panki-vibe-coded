import type { CSSProperties } from "react";
import {
  BURY_WAIT,
  STAY,
  WaitUnit,
  isBurned,
  mainAnswers,
  stageIndex,
  waitMinutes,
  type Card,
  type CardPlace,
  type HoldKind,
  type SrsAfter,
  type SrsAnswer,
  type SrsStage,
  type SrsType,
  type Step,
  type Wait,
} from "@panki/contracts";
import type { IconName } from "./components/Icon";

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

/**
 * New in words: every type's place before its first stage, where a card not learned yet stands (`LESSON_SCOPE`,
 * `LESSON_IDX` and `SrsType.lesson` in the code, where it was born as Lesson; the owner had it New on screen the same
 * day, 2026-10-21, "new cards also makes it explicit"). A card landing there is named by it alone: it has no wait to
 * say ("with the new cards" followed it for an hour, until the owner had it out).
 */
export const NEW_WORDS = { name: "New", note: "new cards" };

/**
 * Putting a card aside, in words and looks: the mark beside it, what it is while it lasts and the button that brings
 * it back (on a card's row in its deck). When it comes back, which for a bury is its own wait, is `holdBack`,
 * `holdAsks` and, on the chart, `holdNote`.
 */
export const HOLD_KINDS: Record<HoldKind, { icon: IconName; state: string; lift: string }> = {
  // Snooze on screen (the owner, 2026-10-21: "I think it makes more sense that way"); `bury` in what's kept, as it was.
  bury: { icon: "moon", state: "snoozed", lift: "Unsnooze" },
  suspend: { icon: "pause", state: "suspended", lift: "Unsuspend" },
};
export type HoldStep = Extract<Step, { kind: HoldKind }>;
export const isHold = (step: Step | undefined): step is HoldStep => step?.kind === "bury" || step?.kind === "suspend";
/** When a card put aside comes back, under the answer that does it: "back in 24 hours", "back tomorrow", "until brought back". */
export function holdBack(step: HoldStep): string {
  return step.kind === "bury" ? `back ${waitWords(step.wait)}` : "until brought back";
}
/**
 * The line under a box on the chart that puts a card aside, for a card at `place` (the stage it's shown for): "then
 * comes back as Guru 1", "skipped until unsuspended" (the button that brings it back, in its deck's list; it said "until
 * brought back" until the owner asked for a little more, 2026-10-21). Short enough for the box's one line.
 */
export function holdNote(kind: HoldKind, place: string): string {
  return kind === "bury" ? `then comes back as ${place}` : "skipped until unsuspended";
}
/** The question when an answer that puts a card aside asks first. */
export function holdAsks(step: HoldStep): string {
  return step.kind === "bury" ? `This card comes back ${waitWords(step.wait)}, where it stands.` : "This card leaves reviews until it's brought back from its deck.";
}

/**
 * The fixed steps, in the menu's order, with the mark the rarer ones carry, and the chip's own words for a step whose
 * label carries its wait (Bury's chip is lit whatever the wait). The ask-agains (`AGAIN_OPTIONS`) and "go to a stage"
 * are made per type.
 */
export type StepOptionId = "up1" | "up2" | "stay" | "down1" | "down2" | "burn" | "lesson" | "retry" | "hidden" | HoldKind;
export const STEP_OPTIONS: readonly { id: StepOptionId; step: Step; icon?: IconName; chip?: string }[] = [
  { id: "up1", step: { kind: "move", by: 1 } },
  { id: "up2", step: { kind: "move", by: 2 } },
  { id: "stay", step: STAY },
  { id: "down1", step: { kind: "move", by: -1 } },
  { id: "down2", step: { kind: "move", by: -2 } },
  { id: "burn", step: { kind: "burn" }, icon: "flame" },
  // The one way back to New once a card has left it.
  { id: "lesson", step: { kind: "lesson" }, icon: "undo" },
  { id: "retry", step: { kind: "retry" } },
  // The answer isn't offered at that point of the chart (the owner, 2026-10-17: no Bury inside an ask-again).
  { id: "hidden", step: { kind: "hidden" }, icon: "close" },
  { id: "bury", step: { kind: "bury", wait: BURY_WAIT }, icon: HOLD_KINDS.bury.icon, chip: "Snooze" },
  { id: "suspend", step: { kind: "suspend" }, icon: HOLD_KINDS.suspend.icon },
];
/** The mark a step carries on its box and its chip, when it has one. */
export function stepIcon(step: Step | undefined): IconName | null {
  const key = stepKey(step);
  return STEP_OPTIONS.find((o) => o.id === key)?.icon ?? null;
}
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
  if (step.kind === "lesson") return `${NEW_WORDS.name} again`;
  if (step.kind === "retry") return "Keep asking";
  if (step.kind === "hidden") return "Button hidden";
  if (step.kind === "bury") return `Snooze for ${lengthWords(step.wait)}`;
  if (step.kind === "suspend") return "Suspend";
  if (step.kind === "again") return `Ask again ${step.now ? "right away" : waitWords(step.wait)}`;
  return `Go to ${stageName(type, type.stages.findIndex((s) => s.id === step.stage))}`;
}

/** What rung number `idx` is called: New before the first, the stage's name (or "Stage N"), the end past the top. */
export function stageName(type: Named, idx: number): string {
  if (idx < 0) return NEW_WORDS.name;
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
  return `in ${lengthWords(wait)}`;
}
/** A wait as how long it lasts: "24 hours", "1 day", "2 weeks". */
export function lengthWords(wait: Wait): string {
  return `${wait.n} ${wait.n === 1 ? WAIT_UNITS[wait.unit].one : WAIT_UNITS[wait.unit].many}`;
}
/** When an ask-again really comes back, after "again": "tomorrow", "in 4 hours", or "right away" for one asked in the same review. */
export function againWords(minutes: number): string {
  return minutes <= 0 ? "right away" : waitWords(minutesAsWait(minutes));
}
/**
 * When a card that has reached a stage comes back: the stage's wait, or "next review" for a stage with none. It's due
 * at once, but reaching a stage ends the card for the sitting under way; only an ask-again right away comes back in it,
 * and "right away" is that one's alone (the owner, 2026-10-18: "'Right away' should be reserved for the 'again right
 * away'").
 */
export function backWords(minutes: number): string {
  return minutes <= 0 ? "next review" : spanWords(minutes);
}
/** Minutes as a wait in whole units, for "again tomorrow" after an answer. */
export function minutesAsWait(minutes: number): Wait {
  if (minutes >= 1440) return { n: Math.max(1, Math.round(minutes / 1440)), unit: "d" };
  if (minutes >= 60) return { n: Math.max(1, Math.round(minutes / 60)), unit: "h" };
  return { n: Math.max(1, Math.round(minutes)), unit: "min" };
}
/**
 * When a card comes back, beside it in a list: "due now", "in 3 h", "in 2 d", "in 3 w", the end, or put aside
 * ("snoozed"). Nothing for a new card, whose place already says it (it said "new" under "Lesson" until the owner
 * asked what that meant, 2026-10-21).
 */
export function dueWords(type: Named, card: Pick<Card, "place" | "dueAt" | "hold">, now: number): string | null {
  if (card.hold) return HOLD_KINDS[card.hold.kind].state;
  if (isBurned(type, card.place)) return type.burnedName.toLowerCase();
  if (card.dueAt === null) return null;
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

/** A type in one line, under its name in the list: "8 stages · 4h → 4mo, then Burned · 2 answers" (the first wait to the last; a stage with none is passed over). */
export function typeSummary(type: SrsType): string {
  const first = type.stages.find((s) => s.wait.n > 0);
  const last = type.stages[type.stages.length - 1];
  const span = first && last ? `${first.wait.n}${WAIT_UNITS[first.wait.unit].short} → ${last.wait.n}${WAIT_UNITS[last.wait.unit].short}` : "";
  const tail = type.after === "burn" ? `then ${type.burnedName}` : type.after === "repeat" ? "then repeats" : "then keeps growing";
  return `${type.stages.length} ${type.stages.length === 1 ? "stage" : "stages"} · ${span}, ${tail} · ${type.answers.length} answers`;
}
