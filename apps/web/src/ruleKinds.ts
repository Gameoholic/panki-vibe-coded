/** @panki Automations in words and fields: a sentence (`ruleWords`), optional limits and knobs (`RULE_LIMITS`, `RULE_KNOBS`), amounts, icons, a line's tint (`lineTint`). */
import {
  MICROS_PER_CENT,
  NO_ACCOUNT_ACTIONS,
  RULE_ACTIONS,
  RULE_MB_MAX,
  RULE_MICROS_MAX,
  RULE_MINUTES_MAX,
  RULE_SECONDS_MAX,
  RULE_TRIGGERS,
  SUBJECT_WORDS,
  actionOf,
  actionsOf,
  capWords,
  openingActionsOf,
  ruleKnobsOf,
  type AccountActions,
  type Rule,
  type RuleActionId,
  type RuleCap,
  type RuleTriggerId,
} from "@panki/contracts";
import type { IconName } from "./components/Icon";

const MICROS_PER_DOLLAR = 100 * MICROS_PER_CENT;

/** The kinds of amount a limit or a cap is typed in. */
export type AmountKind = "dollars" | "minutes" | "mb" | "seconds";
/** How an amount is typed (in what it's shown as) and said (from what it's kept as). */
export type Amount = {
  /** Before the number in its field: "$"; empty for none. */
  prefix: string;
  /** After the number, before what it counts: "min"; empty for none. */
  unit: string;
  /** Shown to this many decimals and typed no finer. */
  decimals: number;
  /** What − and + move it by, as shown. */
  step: number;
  /** Its bounds, as shown. */
  min: number;
  max: number;
  /** What's kept, as it's shown, and back. */
  shown: (kept: number) => number;
  kept: (shown: number) => number;
  /** What's kept, in words: "$0.50", "30 min". */
  words: (kept: number) => string;
};
const whole = (n: number) => Math.round(n);
const same = (n: number) => n;
export const AMOUNTS: Record<AmountKind, Amount> = {
  // Kept as micro-dollars, typed in dollars to the cent, a dime a step.
  dollars: {
    prefix: "$",
    unit: "",
    decimals: 2,
    step: 0.1,
    min: 0,
    max: RULE_MICROS_MAX / MICROS_PER_DOLLAR,
    shown: (micros) => micros / MICROS_PER_DOLLAR,
    kept: (dollars) => Math.round(dollars * 100) * MICROS_PER_CENT,
    words: capWords,
  },
  // A video's length, in whole minutes, five a step.
  minutes: { prefix: "", unit: "min", decimals: 0, step: 5, min: 1, max: RULE_MINUTES_MAX, shown: same, kept: whole, words: (n) => `${n.toLocaleString("en")} min` },
  // The room a download takes, in whole MB, a hundred a step.
  mb: { prefix: "", unit: "MB", decimals: 0, step: 100, min: 1, max: RULE_MB_MAX, shown: same, kept: whole, words: (n) => `${n.toLocaleString("en")} MB` },
  // How long a video's been watched, its whole watch time, five seconds a step.
  seconds: { prefix: "", unit: "s watched", decimals: 0, step: 5, min: 0, max: RULE_SECONDS_MAX, shown: same, kept: whole, words: (n) => `${n.toLocaleString("en")} s` },
};

/** What follows an amount's number in its field: its unit, then what it counts ("min a video", "a day"). */
export const amountSuffix = (amount: Amount, counts: string): string => [amount.unit, counts].filter((part) => part !== "").join(" ");

/** The optional limits a rule can hold: its action's caps (`RuleCap`), and its trigger's wait (`seconds`). */
export type RuleLimit = RuleCap | "seconds";
/**
 * Every limit is optional, one entry each: an automation without one simply doesn't have it (null). The editor draws a
 * row for each one it holds, taken off by its ×, and offers to add each it could hold and doesn't (`add`), starting
 * from its action's own start. `applies` says whether the rule can hold it; `label` is its row's (Up to, Only after);
 * `counts` what its amount is of ("a video"); `said` its part of the sentence.
 */
export type LimitEntry = {
  amount: AmountKind;
  label: string;
  add: string;
  off: string;
  applies: (rule: Rule) => boolean;
  counts: (rule: Rule) => string;
  read: (rule: Rule) => number | null;
  write: (rule: Rule, kept: number | null) => Rule;
  start: (rule: Rule) => number;
};
const subjectOf = (rule: Rule) => SUBJECT_WORDS[RULE_ACTIONS[rule.do].subject];
export const RULE_LIMITS: Record<RuleLimit, LimitEntry> = {
  minutes: {
    amount: "minutes",
    label: "Up to",
    add: "Add a length limit",
    off: "Take off the length limit",
    applies: (rule) => RULE_ACTIONS[rule.do].caps.includes("minutes"),
    counts: subjectOf,
    read: (rule) => rule.maxMinutes,
    write: (rule, kept) => ({ ...rule, maxMinutes: kept }),
    start: (rule) => RULE_ACTIONS[rule.do].start.maxMinutes ?? 30,
  },
  mb: {
    amount: "mb",
    label: "Up to",
    add: "Add a size limit",
    off: "Take off the size limit",
    applies: (rule) => RULE_ACTIONS[rule.do].caps.includes("mb"),
    counts: subjectOf,
    read: (rule) => rule.maxMb,
    write: (rule, kept) => ({ ...rule, maxMb: kept }),
    start: (rule) => RULE_ACTIONS[rule.do].start.maxMb ?? 1_000,
  },
  seconds: {
    amount: "seconds",
    label: "Only after",
    add: "Add a wait",
    off: "Take off the wait",
    applies: (rule) => ruleKnobsOf(rule).includes("seconds"),
    counts: () => "",
    read: (rule) => rule.watchedSeconds,
    write: (rule, kept) => ({ ...rule, watchedSeconds: kept }),
    start: (rule) => RULE_ACTIONS[rule.do].start.watchedSeconds ?? 20,
  },
};
/** The limits in the order the editor and the sentence say them: what it runs on, then the wait. */
export const RULE_LIMIT_IDS: readonly RuleLimit[] = ["minutes", "mb", "seconds"];

/** A choice of a knob's, by its id, with a quiet word beside it ("Default"). */
export type KnobOption = { id: string; label: string; note?: string };
/**
 * The knobs a rule takes beside its limits, one entry each, its action's: today which of its place's Panki AI actions it
 * sends (`aiAction`, the account's own actions, the place's default named as such and kept as none, so it follows the
 * default). Each reads the account's actions (`book`).
 */
export type KnobEntry = {
  label: string;
  options: (rule: Rule, book: AccountActions) => readonly KnobOption[];
  read: (rule: Rule, book: AccountActions) => string;
  write: (rule: Rule, id: string, book: AccountActions) => Rule;
  /** What it adds to the sentence after what the rule does: ": Explain", the action asked after a colon so a verb or a noun reads. */
  said: (rule: Rule, book: AccountActions) => string;
  /** What titles the rule in place of what it does, on its node and its row: "Explain"; null for none. */
  title: (rule: Rule, book: AccountActions) => string | null;
};
/** The place's default action, the first it ticks as a conversation opens; null where there's none. */
function defaultActionOf(rule: Rule, book: AccountActions): string | null {
  const place = RULE_ACTIONS[rule.do].place;
  return place ? (openingActionsOf(book, place)[0] ?? actionsOf(book, place)[0]?.id ?? null) : null;
}
/** The action a rule sends: its own while the account still has it, else the place's default. */
function aiActionOf(rule: Rule, book: AccountActions): string | null {
  return rule.aiAction !== null && actionOf(book, rule.aiAction) !== null ? rule.aiAction : defaultActionOf(rule, book);
}
export const RULE_KNOBS: Record<"aiAction", KnobEntry> = {
  aiAction: {
    label: "Action",
    options: (rule, book) => {
      const place = RULE_ACTIONS[rule.do].place;
      const fallback = defaultActionOf(rule, book);
      return place ? actionsOf(book, place).map((action) => ({ id: action.id, label: action.name, ...(action.id === fallback ? { note: "Default" } : {}) })) : [];
    },
    read: (rule, book) => aiActionOf(rule, book) ?? "",
    write: (rule, id, book) => ({ ...rule, aiAction: id === defaultActionOf(rule, book) ? null : id }),
    said: (rule, book) => {
      const name = aiActionNameOf(rule, book);
      return name === null ? "" : `: ${name}`;
    },
    title: aiActionNameOf,
  },
};
/** The name of the action a rule asks; null where its place has none. */
function aiActionNameOf(rule: Rule, book: AccountActions): string | null {
  const id = aiActionOf(rule, book);
  return id === null ? null : (actionOf(book, id)?.name ?? null);
}
/** The knobs a rule's action takes, as `RULE_KNOBS` draws them (its trigger's wait is a limit). */
export const knobsOf = (rule: Rule): (keyof typeof RULE_KNOBS)[] => ruleKnobsOf(rule).flatMap((knob) => (knob === "aiAction" ? [knob] : []));

/** A limit as the sentence says it: "30 min", "only after 20 s watched"; null for one it doesn't hold. */
function limitSaid(rule: Rule, limit: RuleLimit): string | null {
  const entry = RULE_LIMITS[limit];
  const kept = entry.read(rule);
  if (!entry.applies(rule) || kept === null) return null;
  const words = AMOUNTS[entry.amount].words(kept);
  return limit === "seconds" ? `only after ${words} watched` : words;
}
const capFirst = (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/**
 * A rule's title, on its node and its row: the action it asks Panki AI for by its own name ("Explain", "Touch up"),
 * Panki AI's spark before it (`asksPankiAi`), never "Ask Panki AI: Explain"; else what it does, its trigger's words for
 * it capitalized ("Start transcribing").
 */
export function ruleTitle(rule: Rule, book: AccountActions): string {
  const titled = knobsOf(rule).flatMap((knob) => RULE_KNOBS[knob].title(rule, book) ?? [])[0];
  return titled ?? capFirst(RULE_TRIGGERS[rule.when].does[rule.do] ?? RULE_ACTIONS[rule.do].name);
}
/** Whether a rule asks Panki AI for one of a place's actions: its title then wears Panki AI's spark. */
export const asksPankiAi = (rule: Rule): boolean => RULE_ACTIONS[rule.do].place !== undefined;
const knobsSaid = (rule: Rule, book: AccountActions) => knobsOf(rule).map((knob) => RULE_KNOBS[knob].said(rule, book)).join("");
/** A rule's limits as its node's chips: "up to 30 min, 1,000 MB", "only after 20 s watched"; none for one with none. */
export function limitChips(rule: Rule): string[] {
  const upTo = (["minutes", "mb"] as const).flatMap((limit) => limitSaid(rule, limit) ?? []);
  const wait = limitSaid(rule, "seconds");
  return [...(upTo.length > 0 ? [`up to ${upTo.join(", ")}`] : []), ...(wait ? [wait] : [])];
}

/**
 * A rule as it acts, in one sentence from the registries, its limits in brackets after what its trigger is about and
 * left out where it has none: "When a video (up to 30 min) plays, start transcribing"; "When a video (up to 30 min)
 * plays, only after 20 s watched, transcribe the entire video in the background"; "When a transcript is finished, proofread
 * the entire video"; "When the Word pop-up opens, ask Panki AI: Explain". The account's actions name what it asks; left out,
 * Panki's own as they come.
 */
export function ruleWords(rule: Rule, book: AccountActions = NO_ACCOUNT_ACTIONS): string {
  const trigger = RULE_TRIGGERS[rule.when];
  const upTo = (["minutes", "mb"] as const).flatMap((limit) => limitSaid(rule, limit) ?? []);
  const about = trigger.name.startsWith(trigger.about);
  const when = upTo.length > 0 && about ? `${trigger.about} (up to ${upTo.join(", ")})${trigger.name.slice(trigger.about.length)}` : trigger.name;
  const wait = limitSaid(rule, "seconds");
  // As the registry writes it after the comma ("ask Panki AI", "start transcribing"), a name in it kept as it is.
  const does = trigger.does[rule.do] ?? RULE_ACTIONS[rule.do].name.toLowerCase();
  return `When ${when}${wait ? `, ${wait}` : ""}, ${does}${knobsSaid(rule, book)}`;
}

/** Each trigger's icon on its node, and each action's on an automation's. */
export const TRIGGER_ICONS: Record<RuleTriggerId, IconName> = {
  transcriptWhole: "subtitles",
  chunkIn: "subtitles",
  partIn: "again",
  videoPlays: "play",
  videoSaved: "bookmark",
  drawerOpens: "type",
  popupOpens: "search",
};
export const ACTION_ICONS: Record<RuleActionId, IconName> = {
  proofread: "check",
  transcribe: "lead",
  transcribeWhole: "download",
  download: "downloaded",
  drawerAction: "ai",
  popupAction: "ai",
};

/**
 * The tint of the line joining an automation to its trigger: the accent for the most used of the account's over the
 * window shown, fading toward the line's grey for the least, by its runs; null (plain grey, dashed) for one Off or that
 * never ran there. A mix of the theme's own tokens, so every theme follows.
 */
export function lineTint(runs: number, most: number, on: boolean): string | null {
  if (!on || runs <= 0 || most <= 0) return null;
  const share = Math.round(25 + 75 * (runs / most));
  return `color-mix(in srgb, var(--accent) ${share}%, var(--line-strong))`;
}
