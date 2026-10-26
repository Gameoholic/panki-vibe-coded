import { z } from "zod";
import { DEFAULT_SUBTITLE_STYLE, SubtitleStyle } from "./subtitleStyle";
import { TranscribeLanguage } from "./transcription";

export const SrsTypeId = z.uuid();
export const SrsStageId = z.uuid();
export const SrsAnswerId = z.uuid();

/**
 * A wait is a count of one unit. The minutes each unit holds live here because the API (due dates) and the web
 * (previews, button labels) both count with them; the words for each unit are the web's `WAIT_UNITS` registry.
 */
export const WaitUnit = z.enum(["min", "h", "d", "w", "mo"]);
export type WaitUnit = z.infer<typeof WaitUnit>;
export const MINUTES_PER_UNIT: Record<WaitUnit, number> = { min: 1, h: 60, d: 1440, w: 10080, mo: 43200 };
export const WAIT_MAX = 999;
export const Wait = z.object({ n: z.number().int().min(1).max(WAIT_MAX), unit: WaitUnit });
export type Wait = z.infer<typeof Wait>;
export const waitMinutes = (wait: Wait) => wait.n * MINUTES_PER_UNIT[wait.unit];

/** One rung of the ladder: a name (shown as "Stage N" when empty) and how long a card waits there. Cards start on the first rung; its wait is how long a card sent back to it (or kept on it) stays away. A stage's wait can be none at all (`n` 0): a card landing there is due at once, but for the next review: reaching a stage is the end of the chart for that sitting, only an ask-again with no wait keeps a card in the one under way (the owner, 2026-10-17). */
export const StageWait = Wait.extend({ n: z.number().int().min(0).max(WAIT_MAX) });
export const SrsStage = z.object({ id: SrsStageId, name: z.string().trim().max(60), wait: StageWait });
export type SrsStage = z.infer<typeof SrsStage>;
/**
 * One button on the review screen. An `aside` answer is a rare one (start over, already knew it): it sits apart from
 * the main ones and takes no part in the preview's sums. `confirm` asks before it's applied.
 */
export const SrsAnswer = z.object({ id: SrsAnswerId, name: z.string().trim().min(1).max(30), aside: z.boolean().optional(), confirm: z.boolean().optional() });
export type SrsAnswer = z.infer<typeof SrsAnswer>;
/** The everyday answers, worst first: all but the ones set apart (every one of them, should none be left). */
export function mainAnswers<A extends { aside?: boolean | undefined }>(answers: readonly A[]): readonly A[] {
  const main = answers.filter((a) => !a.aside);
  return main.length > 0 ? main : answers;
}

/**
 * What an answer does to a card: move up or down the ladder (relative to where it is),
 * burn it, go to one stage in particular, or ask again after a wait and let the next answer decide (any depth).
 * An ask-again with `capped` never waits longer than the card's stage does: "tomorrow" on a two-week stage, but four
 * hours on a four-hour one (`againWait`). Left out means not capped, so rules saved before it existed read as they were.
 * An ask-again with `now` has no wait at all: the card is asked again in the same review, and its `wait` is kept
 * only so switching it off brings the old wait back. `retry` asks the same thing again right away without moving
 * anywhere, not even deeper into the ask-again it's in: inside a right-away ask-again it keeps a card in the review
 * until another answer lets it out. `hidden` takes the answer away at that point: its button isn't offered at all
 * (the owner, 2026-10-17: no Bury inside an ask-again, "there's no reason to bury a card if I already failed it");
 * sent all the same, it does nothing (`STAY`). `bury` and `suspend` put the card aside where it stands (`HoldKind`):
 * a bury for its `wait`, a suspend until it's brought back. `lesson` sends the card back to Lesson (New on screen), a
 * new card again that waits for a day's new cards: the one way back there once a card has left it. No type that comes
 * with the app takes it since Wanikani+'s Reset goes to the first stage instead (the owner, 2026-10-21).
 */
export type Step =
  | { kind: "move"; by: number }
  | { kind: "burn" }
  | { kind: "lesson" }
  | { kind: "retry" }
  | { kind: "hidden" }
  | { kind: "bury"; wait: Wait }
  | { kind: "suspend" }
  | { kind: "to"; stage: string }
  | { kind: "again"; wait: Wait; then: Flow; capped?: boolean | undefined; now?: boolean | undefined };
/** A rule for every answer, by answer id. An answer with no rule stays where it is. */
export type Flow = Record<string, Step>;
export const MOVE_MAX = 2;
export const Step: z.ZodType<Step, Step> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("move"), by: z.number().int().min(-MOVE_MAX).max(MOVE_MAX) }),
    z.object({ kind: z.literal("burn") }),
    z.object({ kind: z.literal("lesson") }),
    z.object({ kind: z.literal("retry") }),
    z.object({ kind: z.literal("hidden") }),
    z.object({ kind: z.literal("bury"), wait: Wait }),
    z.object({ kind: z.literal("suspend") }),
    z.object({ kind: z.literal("to"), stage: SrsStageId }),
    z.object({ kind: z.literal("again"), wait: Wait, then: Flow, capped: z.boolean().optional(), now: z.boolean().optional() }),
  ]),
);
export const Flow: z.ZodType<Flow, Flow> = z.lazy(() => z.record(SrsAnswerId, Step));
export const STAY: Step = { kind: "move", by: 0 };
/** How long a Bury puts a card aside until it's set otherwise: the owner's default, 2026-10-21. */
export const BURY_WAIT: Wait = { n: 24, unit: "h" };
/**
 * Stored rules as they read today. "Back to the start" was a step of its own until 2026-10-10; "go to a stage" does
 * the same job, so a stored one reads as going to the first stage. A Bury had no wait for its first hours (it lasted
 * until the day turned); one saved then reads as `BURY_WAIT`. Run on what the database holds, before parsing.
 */
export function upgradeFlow(raw: unknown, firstStageId: string | undefined): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  return Object.fromEntries(
    Object.entries(raw).map(([answerId, step]: [string, unknown]) => {
      if (typeof step !== "object" || step === null) return [answerId, step];
      const s = step as { kind?: unknown; then?: unknown; wait?: unknown };
      if (s.kind === "start") return [answerId, firstStageId ? { kind: "to", stage: firstStageId } : STAY];
      if (s.kind === "bury" && s.wait === undefined) return [answerId, { kind: "bury", wait: { ...BURY_WAIT } }];
      if (s.kind === "again") return [answerId, { ...s, then: upgradeFlow(s.then, firstStageId) }];
      return [answerId, step];
    }),
  );
}

/**
 * Putting a card aside, Anki's two (the owner, 2026-10-21): buried, it's out of reviews for as long as the step says
 * (24 hours to begin with; it was until the day turned for its first hours); suspended, until it's brought back from
 * its deck's list (where a buried one can be brought back early too). Neither moves it: its place and its schedule stay as they were, so a
 * card that fell due meanwhile is due the moment it's back. Neither is an answer the stats count, and a new card put
 * aside doesn't use up the day's new cards.
 */
// A bury is Snooze on screen since 2026-10-21 (the owner's word); `bury` stays its id in every rule and row already kept.
export const HoldKind = z.enum(["bury", "suspend"]);
export type HoldKind = z.infer<typeof HoldKind>;

/** What happens after the last stage: the card is burned (never comes back), keeps coming back at the last wait, or the wait keeps growing. */
export const SrsAfter = z.enum(["burn", "repeat", "grow"]);
export type SrsAfter = z.infer<typeof SrsAfter>;

export const STAGES_MAX = 30;
export const DESCRIPTION_MAX = 300;
export const ANSWERS_MIN = 2;
export const ANSWERS_MAX = 6;
export const GROW_MIN = 1.1;
export const GROW_MAX = 5;

const SrsShape = z.object({
  id: SrsTypeId,
  name: z.string().trim().min(1).max(100),
  /** What it is, in the owner's words, beside the line worked out from its stages; empty when there's nothing to say. */
  description: z.string().trim().max(DESCRIPTION_MAX).default(""),
  stages: z.array(SrsStage).min(1).max(STAGES_MAX),
  answers: z.array(SrsAnswer).min(ANSWERS_MIN).max(ANSWERS_MAX),
  /** The default rules, for every stage. */
  flow: Flow,
  /** A stage's own rules, by stage id, when it has them. */
  overrides: z.record(SrsStageId, Flow),
  /**
   * Lesson's rules (New on screen, since the owner named it so, 2026-10-21): what each answer does to a new card, before
   * the first stage. Every type has them; Lesson is no stage, and nothing but a `lesson` step goes back to it (`resolve`).
   */
  lesson: Flow,
  after: SrsAfter,
  /** With `after: "grow"`, what the wait is multiplied by on each rung past the top. */
  growBy: z.number().min(GROW_MIN).max(GROW_MAX),
  /** What the end of the ladder is called, when there is one. */
  burnedName: z.string().trim().min(1).max(40),
});
type SrsRules = Pick<z.infer<typeof SrsShape>, "stages" | "answers" | "flow" | "overrides" | "lesson">;

export const FLOW_PROBLEMS = {
  answer: "A rule names an answer the type doesn't have.",
  stage: "A rule names a stage the type doesn't have.",
};

/** What's wrong with a type's rules: a rule keyed by an answer it doesn't have, or pointing at a stage it doesn't have. Pure, run in the web and at the boundary. */
export function srsProblem(type: SrsRules): string | null {
  const answers = new Set(type.answers.map((a) => a.id));
  const stages = new Set(type.stages.map((s) => s.id));
  function check(flow: Flow): string | null {
    for (const [answerId, step] of Object.entries(flow)) {
      if (!answers.has(answerId)) return FLOW_PROBLEMS.answer;
      if (step.kind === "to" && !stages.has(step.stage)) return FLOW_PROBLEMS.stage;
      if (step.kind === "again") {
        const inner = check(step.then);
        if (inner) return inner;
      }
    }
    return null;
  }
  for (const stageId of Object.keys(type.overrides)) if (!stages.has(stageId)) return FLOW_PROBLEMS.stage;
  for (const flow of [type.flow, type.lesson, ...Object.values(type.overrides)]) {
    const problem = check(flow);
    if (problem) return problem;
  }
  return null;
}
function checkRules(type: SrsRules, ctx: z.RefinementCtx) {
  const problem = srsProblem(type);
  if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["flow"] });
}

/** What the browser sends to make a type. The ids are minted by the browser, so a retry is harmless. */
export const NewSrsType = SrsShape.superRefine(checkRules);
/**
 * The whole type again. Stages and answers left out are hidden; `moves` says where the cards sitting on a hidden
 * stage go (the id of a stage that stays), and the API refuses the save while a stage with cards has no move.
 */
export const SrsTypeUpdate = SrsShape.omit({ id: true }).extend({ moves: z.record(SrsStageId, SrsStageId).optional() }).superRefine(checkRules);
export const SrsType = SrsShape.extend({
  /** Stamped by the API, ms since epoch. */
  createdAt: z.number().int().nonnegative(),
  /** One of the types that come with the app: edited like any other, never deleted. */
  builtin: z.boolean(),
  /** Derived by the API on every read: how many decks use it. */
  deckCount: z.number().int().nonnegative(),
  /** Derived on every read: how many cards sit on each stage, by stage id; a stage with none is left out. */
  cardCounts: z.record(SrsStageId, z.number().int().nonnegative()),
});
export type NewSrsType = z.infer<typeof NewSrsType>;
export type SrsTypeUpdate = z.infer<typeof SrsTypeUpdate>;
export type SrsType = z.infer<typeof SrsType>;
export const SrsTypeList = z.object({ types: z.array(SrsType) });
export const SrsTypeResponse = z.object({ type: SrsType });

/**
 * Where a card stands. In Lesson (New on screen: never learned, or sent back by a `lesson` step): no stage, not burned. On a stage:
 * its id, `past` rungs beyond the top when it has climbed past the last stage (the wait repeats or grows there), and
 * `node` the answers taken inside an ask-again since it landed (in Lesson too). Burned: the end, never due again.
 * Derived from the card's last answer, never stored on the card.
 */
export const CardPlace = z.object({
  stageId: SrsStageId.nullable(),
  past: z.number().int().min(0),
  node: z.array(SrsAnswerId),
  burned: z.boolean(),
});
export type CardPlace = z.infer<typeof CardPlace>;
export const NEW_PLACE: CardPlace = { stageId: null, past: 0, node: [], burned: false };
export const BURNED_PLACE: CardPlace = { stageId: null, past: 0, node: [], burned: true };
/**
 * In Lesson (New on screen): not learned yet. A new card is, and so is one a `lesson` step sent back: either waits for
 * a day's new cards (the owner, 2026-10-21: "it will literally be treated as a new card"). Its own history, kept in its
 * places, tells the two apart.
 */
export const isNew = (place: CardPlace) => place.stageId === null && !place.burned;
/** Lesson as a rung number: before the first stage. */
export const LESSON_IDX = -1;

/** What resolving an answer needs of a type. */
export type SrsLadder = Pick<z.infer<typeof SrsShape>, "stages" | "flow" | "overrides" | "lesson" | "after" | "growBy">;

/** A card's rung as a number: `LESSON_IDX` in Lesson, 0 the first stage, and on past the top. A stage that's gone counts as the first. */
export function stageIndex(type: Pick<SrsLadder, "stages">, place: CardPlace): number {
  if (place.stageId === null) return LESSON_IDX;
  const i = type.stages.findIndex((s) => s.id === place.stageId);
  return (i < 0 ? 0 : i) + place.past;
}
/** The place a rung number is: Lesson, a stage, or `past` rungs beyond the top. */
export function placeAt(type: Pick<SrsLadder, "stages">, idx: number): CardPlace {
  const len = type.stages.length;
  if (idx < 0) return NEW_PLACE;
  const stage = type.stages[Math.min(idx, len - 1)];
  if (!stage) return NEW_PLACE;
  return { stageId: stage.id, past: Math.max(0, idx - len + 1), node: [], burned: false };
}
/** Burned, or past the top of a ladder that now ends in Burned. */
export const isBurned = (type: Pick<SrsLadder, "after">, place: CardPlace) => place.burned || (place.past > 0 && type.after === "burn");
/** How long a card waits on a rung, in minutes; null when there is no coming back. Rounded once. */
export function waitAt(type: SrsLadder, idx: number): number | null {
  const len = type.stages.length;
  const stage = type.stages[idx];
  if (idx < 0) return null;
  if (stage) return waitMinutes(stage.wait);
  const last = type.stages[len - 1];
  if (!last || type.after === "burn") return null;
  const base = waitMinutes(last.wait);
  return type.after === "repeat" ? base : Math.round(base * Math.pow(type.growBy, idx - len + 1));
}
/**
 * How long an ask-again waits for a card on a rung, in minutes: nothing when it's a right-away one (the same review),
 * else its own wait, or when it's capped the shorter of that and the stage's own. Where nothing comes back, there's
 * nothing to cap by.
 */
export function againWait(type: SrsLadder, idx: number, step: Extract<Step, { kind: "again" }>): number {
  if (step.now) return 0;
  const own = waitMinutes(step.wait);
  if (!step.capped) return own;
  const cap = waitAt(type, Math.max(0, idx));
  return cap === null ? own : Math.min(own, cap);
}
/** The rules a card on a rung follows: Lesson's in Lesson; on a stage, the stage's own when it has them, else the default; past the top, the default. */
export function flowOf(type: Pick<SrsLadder, "stages" | "flow" | "overrides" | "lesson">, idx: number): Flow {
  if (idx < 0) return type.lesson;
  const stage = type.stages[idx];
  return (stage && type.overrides[stage.id]) ?? type.flow;
}

/**
 * Lesson's rules for a type that has none of its own (one made before Lesson had rules, 2026-10-21): the first of
 * the main answers, when there's more than one, asks again right away until another lets the card out; every other
 * main answer sends it to the first stage, learned; an answer set apart puts the card aside as it does on a stage, or
 * isn't offered in Lesson at all.
 */
export function defaultLesson(type: Pick<SrsLadder, "flow"> & { answers: readonly SrsAnswer[] }): Flow {
  const main = mainAnswers(type.answers);
  const miss = main.length > 1 ? main[0] : undefined;
  const plain = (answer: SrsAnswer): Step => {
    if (main.includes(answer)) return { kind: "move", by: 1 };
    const own = type.flow[answer.id];
    if (own?.kind === "bury") return { kind: "bury", wait: { ...own.wait } };
    if (own?.kind === "suspend") return { kind: "suspend" };
    return { kind: "hidden" };
  };
  const lesson: Flow = {};
  for (const answer of type.answers) lesson[answer.id] = plain(answer);
  if (miss) {
    const then: Flow = {};
    for (const answer of type.answers) then[answer.id] = answer === miss ? { kind: "retry" } : plain(answer);
    lesson[miss.id] = { kind: "again", wait: { n: 1, unit: "d" }, now: true, then };
  }
  return lesson;
}
/** The branch a path of answers opens: the flow itself, or the `then` of the ask-again each answer led into. */
export function branchAt(flow: Flow, node: readonly string[]): Flow {
  let current = flow;
  for (const answerId of node) {
    const step = current[answerId];
    if (!step || step.kind !== "again") break;
    current = step.then;
  }
  return current;
}
/** The step a path of answers leads to: the last answer's rule inside the branch the ones before it opened. */
export function stepAt(flow: Flow, path: readonly string[]): Step | undefined {
  const last = path[path.length - 1];
  if (last === undefined) return undefined;
  return branchAt(flow, path.slice(0, -1))[last];
}

export type Outcome = {
  place: CardPlace;
  /** Minutes until the card comes back; null when it never does, or not until it's brought back (Suspend). */
  wait: number | null;
  again: boolean;
  burned: boolean;
  /** The card put aside where it stands (Bury, Suspend), its place untouched; null for every answer that moves it. */
  hold: HoldKind | null;
};
const BURNED: Outcome = { place: BURNED_PLACE, wait: null, again: false, burned: true, hold: null };

/** Whether an answer is offered to a card where it stands: every answer is, but one whose rule there is `hidden`. */
export function offered(type: Pick<SrsLadder, "stages" | "flow" | "overrides" | "lesson">, place: CardPlace, answerId: string): boolean {
  return branchAt(flowOf(type, stageIndex(type, place)), place.node)[answerId]?.kind !== "hidden";
}

/** What answering does to a card: where it goes and how long it waits. Pure: the API records it, the web labels the buttons with it. */
export function resolve(type: SrsLadder, place: CardPlace, answerId: string, flowOverride?: Flow): Outcome {
  const idx = stageIndex(type, place);
  const flow = flowOverride ?? flowOf(type, idx);
  const step = branchAt(flow, place.node)[answerId] ?? STAY;
  if (step.kind === "again") return { place: { ...place, node: [...place.node, answerId] }, wait: againWait(type, idx, step), again: true, burned: false, hold: null };
  if (step.kind === "burn") return BURNED;
  // Back in Lesson it's a new card again: no wait of its own, it waits for a day's new cards.
  if (step.kind === "lesson") return { place: NEW_PLACE, wait: null, again: false, burned: false, hold: null };
  if (step.kind === "retry") return { place, wait: 0, again: true, burned: false, hold: null };
  if (step.kind === "bury") return { place, wait: waitMinutes(step.wait), again: false, burned: false, hold: "bury" };
  if (step.kind === "suspend") return { place, wait: null, again: false, burned: false, hold: "suspend" };
  // An answer not offered here can't be pressed; sent all the same, it does what an answer with no rule does.
  if (step.kind === "hidden") return resolve(type, place, "", flow);
  let next: number;
  if (step.kind === "move") next = idx + step.by;
  else {
    const target = type.stages.findIndex((s) => s.id === step.stage);
    next = target < 0 ? idx : target;
  }
  // Out of Lesson, the first stage is as low as a card goes: only a `lesson` step takes it back (the owner, 2026-10-21:
  // "a card can never go back to Lesson… it will be rock bottom at Apprentice 1"). In Lesson, staying is staying there.
  next = Math.max(idx < 0 ? LESSON_IDX : 0, next);
  const len = type.stages.length;
  if (next >= len) {
    if (type.after === "burn") return BURNED;
    if (type.after === "repeat") next = len - 1;
  }
  return { place: placeAt(type, next), wait: waitAt(type, next), again: false, burned: false, hold: null };
}

/** How long a card waits from its last answer, in minutes, with the rules as they are now: the ask-again's wait when it's inside one, else its stage's. Null when nothing is due. */
export function waitNow(type: SrsLadder, place: CardPlace): number | null {
  if (isBurned(type, place)) return null;
  const idx = stageIndex(type, place);
  if (place.node.length > 0) {
    const step = stepAt(flowOf(type, idx), place.node);
    if (step && step.kind === "again") return againWait(type, idx, step);
    return waitAt(type, Math.max(0, idx));
  }
  return waitAt(type, idx);
}

/** Spread the waits a little, so cards learned together don't all land on one morning: ±10 %, the same every time for the same answer. */
export const FUZZ = 0.1;
export function fuzzFactor(seed: number): number {
  const hash = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return 1 - FUZZ + (hash % 2001) / 10000;
}
/** When a card is next due, ms since epoch: its last answer plus the wait its place has now. Null when it never is. */
export function dueAt(type: SrsLadder, place: CardPlace, lastAt: number, fuzzSeed: number, fuzz: boolean): number | null {
  const wait = waitNow(type, place);
  if (wait === null) return null;
  return Math.round(lastAt + wait * 60_000 * (fuzz ? fuzzFactor(fuzzSeed) : 1));
}

/**
 * The settings that run every review of every deck, in the Settings tab. One row of defaults, the owner changes them.
 * What differs from deck to deck (how many new cards, where they go, how a review is paced) is the deck's own
 * `DeckSettings`.
 */
export const Settings = z.object({
  fuzz: z.boolean(),
  /** The hour the day turns over, so a review at 01:00 counts for the day before. */
  dayStartHour: z.number().int().min(0).max(23),
  /**
   * How a card's clip's subtitles look in the app (`subtitleStyle.ts`), set in Settings. The app's own: the extension
   * keeps its own for YouTube, in the browser (the owner, 2026-10-18: the two were one for a few hours, then "it's
   * fine to have the subtitle settings separate between the app and the extension").
   */
  subtitleStyle: SubtitleStyle,
  /**
   * The zone the account's days turn over in, by its name in the time zone database ("Asia/Tokyo"). Each account's own,
   * never Panki's (the owner, 2026-10-21: "each user defines their own time zone, default is their machine's"): empty
   * only until the account first opens Panki or the extension, which write the device's own zone in its place. Until
   * then the server's clock stands in.
   */
  timeZone: z.string().max(64).refine((zone) => zone === "" || isTimeZone(zone), { message: "That isn't a time zone." }),
  /**
   * The language this account's videos are transcribed in, told to the engine. Each account's own, nothing Panki-wide
   * (the owner, 2026-10-21: "transcription language is also per user and not per the entire app"); English to begin
   * with. An account from before keeps Japanese, the language every video was transcribed in until then (migration 29).
   */
  language: TranscribeLanguage,
  /**
   * Whether the account's watching is kept at all (`watching.ts`): its own alone, shown to nobody else. Off to begin
   * with (the owner, 2026-10-21; it was on that morning); an account that had already kept some watching keeps it on
   * (migration 30).
   */
  videoTracking: z.boolean(),
  // `dailyGoal` (minutes a day that kept the watch streak) went with the streak, 2026-10-21. A row kept of it is read by nothing.
  // `shareWatching` (Off, Minutes and streak, Also what I watch) went the same day: "either we share all or nothing". A row kept of it is read by nothing.
});
export type Settings = z.infer<typeof Settings>;
export const DEFAULT_SETTINGS: Settings = {
  fuzz: true,
  dayStartHour: 4,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  timeZone: "",
  language: "eng",
  videoTracking: false,
};
export const SettingsUpdate = Settings.partial();
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;
/** The account's settings, all of them its own. */
export const SettingsResponse = z.object({ settings: Settings });

/** Whether the time zone database knows a zone by this name. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * An answer as it was given: its own id, minted by the browser, so the same answer sent again is kept once, and Undo
 * names it to take it back (`DELETE /decks/:deckId/cards/:cardId/answers/:givenId`).
 */
export const GivenId = z.uuid();

/**
 * What the browser sends when a card is answered. The time and the outcome are the API's; the browser adds the
 * sitting it happened in and how long the card was on screen before the flip (`thinkMs`) and after it (`decideMs`),
 * spans measured on its own clock, kept for the stats.
 */
export const CardAnswer = z.object({
  /** Left out, the answer can't be undone, and sending it again gives it twice. */
  givenId: GivenId.optional(),
  answerId: SrsAnswerId,
  sessionId: z.uuid().optional(),
  thinkMs: z.number().int().nonnegative().max(86_400_000).optional(),
  decideMs: z.number().int().nonnegative().max(86_400_000).optional(),
  /** Which of the card's examples it was shown with (`card.ts` → `exampleShownOf`); left out, its own. */
  exampleId: z.uuid().optional(),
});
export type CardAnswer = z.infer<typeof CardAnswer>;
