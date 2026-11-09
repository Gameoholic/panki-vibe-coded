/** @panki The SRS types that come with the app, and a new type as a copy of another (`makeStarter`, `SRS_STARTER_IDS`, `copySrsType`, `emptySrsType`). */
import { BURY_WAIT, type Flow, type NewSrsType, type SrsAfter, type Step, type WaitUnit } from "./srs";
import { STAGE_RAMP } from "./stageColour";

/**
 * The SRS types that come with the app. They are real types in the list, made by the API when it opens a database
 * that lacks one, and they can't be deleted; they're edited like any other, and a new type starts as a copy of
 * any type in the list (`copySrsType`). Here is only what each is made of.
 *
 * An id here is the key the API keeps on the row it made (`srs_types.builtin`), by which it finds that row again on
 * every start to bring it up to date: it never changes, whatever the type is called on screen. `wanikaniPlus` is
 * Panki Default; renaming the key would make the API take it for a missing type and add a second one.
 */
export type SrsStarterId = "wanikaniPlus" | "wanikani" | "anki";
export const SRS_STARTER_IDS: readonly SrsStarterId[] = ["wanikaniPlus", "wanikani", "anki"];
export const DEFAULT_STARTER: SrsStarterId = "wanikaniPlus";

/** A stage: its wait, its name, and its own colour (left out, the default ramp's). */
type Rung = [n: number, unit: WaitUnit, name: string, colour?: string];
type Starter = {
  name: string;
  /** What sets it apart, under its name in the list. */
  description: string;
  stages: Rung[];
  after: SrsAfter;
  /** What the wait is multiplied by on each rung past the top, when the ladder keeps growing. */
  growBy?: number;
  /** The answers in order; one marked "aside" is set apart on the review screen and asks before it's applied, unless `asks` says it doesn't. */
  answers: (string | [name: string, where: "aside", asks?: boolean])[];
  /** The default rules, given the answers' ids and the stages' ids, each in order. */
  flow: (answerIds: string[], stageIds: string[]) => Flow;
  /** The stages with rules of their own, by stage id. */
  overrides?: (answerIds: string[], stageIds: string[]) => Record<string, Flow>;
  /** Lesson's rules: a card not learned yet, before the first stage. */
  lesson: (answerIds: string[], stageIds: string[]) => Flow;
};

const move = (by: number): Step => ({ kind: "move", by });
const to = (stage: string): Step => ({ kind: "to", stage });
/** A starter's ask-again is capped: never later than the stage itself would bring the card back. */
const again = (n: number, unit: WaitUnit, then: Flow): Step => ({ kind: "again", wait: { n, unit }, then, capped: true });
/** Asked again in the same review; `then` says what each answer does there. Its wait is only kept for when "right away" is switched off. */
const now = (then: Flow): Step => ({ kind: "again", wait: { n: 1, unit: "d" }, now: true, then });
const id = (ids: string[], i: number): string => ids[i] ?? "";

/**
 * Panki Default (`wanikaniPlus`): WaniKani's ladder with rules of its own. Forgot keeps the card in the review, asked
 * again and again until it's got right; what happens then depends on the stage. On the early ones it drops a stage,
 * never below Learning 1. From `WK_CHANCE_FROM` on (Familiar 1), where a stage is weeks of work, it gets one more chance
 * first: asked again tomorrow (never later than the stage), and only a second Forgot drops it, after it too has been
 * asked until right. The answers set apart work the same everywhere: Reset sends the card back to the first stage,
 * Learning 1, to climb again, Easy lifts it three, and two from `WK_CHANCE_FROM` on, the stages of weeks and months, and
 * Snooze and Suspend put the card aside where it stands. All four ask for confirmation. New (`wanikaniPlusLesson`): Ok
 * or Easy learns it, and Forgot asks it again until it's got right, then learns it.
 */
const WK_CHANCE_FROM = 4;
/** How many stages Easy lifts a card: below `WK_CHANCE_FROM` (and from New), and from there on. */
const WK_EASY = 3;
const WK_EASY_HIGH = 2;
function wanikaniPlusFlow(a: string[], s: string[], chance: boolean): Flow {
  const [forgot, ok, easy, bury, suspend, reset] = [id(a, 0), id(a, 1), id(a, 2), id(a, 3), id(a, 4), id(a, 5)];
  const apart = (): Flow => ({ [reset]: to(id(s, 0)), [easy]: move(chance ? WK_EASY_HIGH : WK_EASY), [bury]: { kind: "bury", wait: { ...BURY_WAIT } }, [suspend]: { kind: "suspend" } });
  // Once a card is forgotten, neither Easy nor Bury is offered until it leaves the ask-again: a card just forgotten is no
  // card to skip ahead, nor to bury. Suspend stays: a card failed again and again is the one to take out and fix.
  const forgotten = (): Flow => ({ ...apart(), [easy]: { kind: "hidden" }, [bury]: { kind: "hidden" } });
  /** Kept in the review until it's got right, and then `then`. */
  const untilRight = (then: Step): Step => now({ [forgot]: { kind: "retry" }, [ok]: then, ...forgotten() });
  // On the second-chance day a Forgot is asked until right too, before the stage drops; the card was forgotten the day before.
  const after: Step = chance ? again(1, "d", { [forgot]: untilRight(move(-1)), [ok]: move(0), ...forgotten() }) : move(-1);
  return { [forgot]: untilRight(after), [ok]: move(1), ...apart() };
}
/**
 * Panki Default for a new card: WaniKani's lesson, where nothing is held against a card: asked again until
 * it's got right in the same review, and then on to Learning 1. Reset has nothing to do there.
 */
function wanikaniPlusLesson(a: string[]): Flow {
  const [forgot, ok, easy, bury, suspend, reset] = [id(a, 0), id(a, 1), id(a, 2), id(a, 3), id(a, 4), id(a, 5)];
  const hidden: Step = { kind: "hidden" };
  return {
    [forgot]: now({ [forgot]: { kind: "retry" }, [ok]: move(1), [reset]: { ...hidden }, [easy]: { ...hidden }, [bury]: { ...hidden }, [suspend]: { kind: "suspend" } }),
    [ok]: move(1),
    [reset]: { ...hidden },
    [easy]: move(WK_EASY),
    [bury]: { kind: "bury", wait: { ...BURY_WAIT } },
    [suspend]: { kind: "suspend" },
  };
}

/**
 * Wanikani, as WaniKani does it. A wrong answer keeps the item in the review until it's answered right, and then it
 * drops: by ceil(misses / 2) stages, doubled from Guru up, never below Apprentice 1. Misses are counted by nesting
 * (each one is a box deeper) as far as `WK_MISSES`; past that the card is asked until right at the same penalty. The
 * lesson's own quiz never penalises (`wanikaniLesson`): the card goes to Apprentice 1 once it's got right.
 */
const WK_GURU = 4;
const WK_MISSES = 4;
function wanikaniFlow(a: string[], s: string[], rung: number): Flow {
  const [forgot, ok] = [id(a, 0), id(a, 1)];
  const dropTo = (misses: number): Step => {
    const target = Math.max(0, rung - Math.ceil(misses / 2) * (rung >= WK_GURU ? 2 : 1));
    return target === rung ? move(0) : to(id(s, target));
  };
  const missed = (misses: number): Step => now({ [forgot]: misses < WK_MISSES ? missed(misses + 1) : { kind: "retry" }, [ok]: dropTo(misses) });
  return { [forgot]: missed(1), [ok]: move(1) };
}
function wanikaniLesson(a: string[]): Flow {
  const [forgot, ok] = [id(a, 0), id(a, 1)];
  return { [forgot]: now({ [forgot]: { kind: "retry" }, [ok]: move(1) }), [ok]: move(1) };
}

// Lesson isn't among these: it's every type's own, before the first stage (New on screen).
// Panki Default's stages are named for how well a card is known, and coloured one green per kind: every Learning stage
// the ramp's light green, every Familiar its middle one, every Strong its dark one.
const [LEARNING, FAMILIAR, STRONG] = STAGE_RAMP;

const STARTERS: Record<SrsStarterId, Starter> = {
  wanikaniPlus: {
    name: "Panki Default",
    description: "Wanikani's ladder with a forgiveness mechanism from Familiar 1 up: a card you forget there is asked again the next day, and drops a stage only if you forget it again. Also adds Easy (three stages up, two from Familiar 1), Snooze (back in 24 hours), Suspend (out until you bring it back) and Reset (back to Learning 1).",
    stages: [
      [4, "h", "Learning 1", LEARNING],
      [8, "h", "Learning 2", LEARNING],
      [1, "d", "Learning 3", LEARNING],
      [2, "d", "Learning 4", LEARNING],
      [1, "w", "Familiar 1", FAMILIAR],
      [2, "w", "Familiar 2", FAMILIAR],
      [1, "mo", "Strong 1", STRONG],
      [4, "mo", "Strong 2", STRONG],
    ],
    after: "burn",
    // Snooze's rule is the `bury` step. Easy third, on key 3, and Reset last, matched to what each account has by name.
    // Every one set apart asks for confirmation, a held key being the yes: held longer instead of asked, `keys.ts` → `askMs`.
    answers: ["Forgot", "Ok", ["Easy", "aside"], ["Snooze", "aside"], ["Suspend", "aside"], ["Reset", "aside"]],
    flow: (a, s) => wanikaniPlusFlow(a, s, false),
    overrides: (a, s) => Object.fromEntries(s.slice(WK_CHANCE_FROM).map((stageId) => [stageId, wanikaniPlusFlow(a, s, true)])),
    lesson: (a) => wanikaniPlusLesson(a),
  },
  // WaniKani's waits are an hour short of the round figure (23 h, not a day), so a review lands a little earlier each
  // day; the last is past what a wait in hours holds, and is the round 4 months.
  wanikani: {
    name: "Wanikani",
    description: "Ported from WaniKani.",
    stages: [
      [4, "h", "Apprentice 1"],
      [8, "h", "Apprentice 2"],
      [23, "h", "Apprentice 3"],
      [47, "h", "Apprentice 4"],
      [167, "h", "Guru 1"],
      [335, "h", "Guru 2"],
      [719, "h", "Master"],
      [4, "mo", "Enlightened"],
    ],
    after: "burn",
    answers: ["Forgot", "Ok"],
    // A stage added later has no count of its own to go by: it drops one, as an Apprentice stage does.
    flow: (a) => ({ [id(a, 0)]: now({ [id(a, 0)]: { kind: "retry" }, [id(a, 1)]: move(-1) }), [id(a, 1)]: move(1) }),
    overrides: (a, s) => Object.fromEntries(s.map((stageId, rung) => [stageId, wanikaniFlow(a, s, rung)])),
    lesson: (a) => wanikaniLesson(a),
  },
  // Anki works out every wait from the card's own ease, which a ladder of fixed stages can't hold; this is its default
  // deck laid on one. A new card is Lesson, Anki's first learning step: asked again in the same review on Again or
  // Hard, on to the second step (ten minutes) on Good. Then a day, and each stage about 2.5 times the last, growing on
  // past the top. Again on a learned card sends it back to relearn (ten minutes, then a day); Hard keeps the stage, Good
  // is the next, Easy skips one. While learning, Easy graduates straight to the stage nearest four days. Lesson is the
  // first learning step; Learning is the second.
  anki: {
    name: "Anki",
    description: "Ported from Anki.",
    stages: [[10, "min", "Learning"], [1, "d", "Young 1"], [3, "d", "Young 2"], [1, "w", "Young 3"], [19, "d", "Young 4"], [47, "d", "Mature 1"], [4, "mo", "Mature 2"]],
    after: "grow",
    // Gentler than the ladder's own steps: past four months, two and a half times more each time is years too soon.
    growBy: 1.5,
    answers: ["Again", "Hard", "Good", "Easy"],
    flow: (a, s) => ({ [id(a, 0)]: to(id(s, 0)), [id(a, 1)]: move(0), [id(a, 2)]: move(1), [id(a, 3)]: move(2) }),
    overrides: (a, s) => ({
      [id(s, 0)]: { [id(a, 0)]: move(0), [id(a, 1)]: move(0), [id(a, 2)]: move(1), [id(a, 3)]: to(id(s, 2)) },
    }),
    lesson: (a, s) => {
      const learning = (): Flow => ({ [id(a, 0)]: { kind: "retry" }, [id(a, 1)]: { kind: "retry" }, [id(a, 2)]: move(1), [id(a, 3)]: to(id(s, 2)) });
      return { [id(a, 0)]: now(learning()), [id(a, 1)]: now(learning()), [id(a, 2)]: move(1), [id(a, 3)]: to(id(s, 2)) };
    },
  },
};

/**
 * Which of the answers already made each of the app's answers is: the one of the same name, so moving an answer in the
 * app's order keeps it the same answer (Easy moved to third, Reset to last, in Panki Default), and
 * every answer given in the past still reads as the one it was; failing that, the one in its place that no other has
 * taken, so a renamed answer stays itself (Relearn became Reset so); failing that, a new one.
 */
function answerIdsAs(names: readonly string[], made: readonly { id: string; name: string }[], mint: () => string): string[] {
  const byName = names.map((name) => made.find((a) => a.name === name)?.id);
  const taken = new Set(byName.filter((id) => id !== undefined));
  return byName.map((id, i) => {
    if (id !== undefined) return id;
    const inPlace = made[i]?.id;
    if (inPlace !== undefined && !taken.has(inPlace)) {
      taken.add(inPlace);
      return inPlace;
    }
    return mint();
  });
}

/**
 * One of the types that come with the app, with fresh ids from `mint` (`crypto.randomUUID`). Given `as` (the type
 * already made from it), it's the same type as the app defines it today under the ids that one has: its stages
 * position for position, its answers by name (`answerIdsAs`), so one that exists can be brought up to date without its
 * cards losing their place or a past answer its meaning.
 */
export function makeStarter(starter: SrsStarterId, mint: () => string, as?: { id: string; stageIds: readonly string[]; answers: readonly { id: string; name: string }[] }): NewSrsType {
  const s = STARTERS[starter];
  const names = s.answers.map((a) => (typeof a === "string" ? a : a[0]));
  const ids = as ? answerIdsAs(names, as.answers, mint) : names.map(() => mint());
  const answers = s.answers.map((a, i) => {
    const id = ids[i] ?? mint();
    return typeof a === "string" ? { id, name: a } : { id, name: a[0], aside: true, confirm: a[2] ?? true };
  });
  const stages = s.stages.map(([n, unit, name, colour], i) => ({ id: as?.stageIds[i] ?? mint(), name, wait: { n, unit }, ...(colour ? { colour } : {}) }));
  const answerIds = answers.map((a) => a.id);
  const stageIds = stages.map((st) => st.id);
  return {
    id: as?.id ?? mint(),
    name: s.name,
    description: s.description,
    stages,
    answers,
    flow: s.flow(answerIds, stageIds),
    overrides: s.overrides?.(answerIds, stageIds) ?? {},
    lesson: s.lesson(answerIds, stageIds),
    after: s.after,
    growBy: s.growBy ?? 2,
    burnedName: "Burned",
  };
}

/** How many stages one that comes with the app has today: a type made from it with another count needs a migration to line its stages up. */
export const starterStageCount = (starter: SrsStarterId): number => STARTERS[starter].stages.length;

/**
 * A new type that starts from nothing at all: no stages, no answers, no rules. It can't be saved like that (a type
 * needs a stage and two answers); it's a blank page to build on.
 */
export function emptySrsType(mint: () => string): NewSrsType {
  return {
    id: mint(),
    name: "New SRS type",
    description: "",
    stages: [],
    answers: [],
    flow: {},
    overrides: {},
    lesson: {},
    after: "burn",
    growBy: 2,
    burnedName: "Burned",
  };
}

/**
 * A new type that starts as another: the same stages, answers and rules under ids of its own (`mint`), so editing
 * one never touches the other. Its name says what it's a copy of until it's given one.
 */
export function copySrsType(base: Pick<NewSrsType, "name" | "description" | "stages" | "answers" | "flow" | "overrides" | "lesson" | "after" | "growBy" | "burnedName" | "newColour">, mint: () => string): NewSrsType {
  const stageIds = new Map(base.stages.map((s) => [s.id, mint()]));
  const answerIds = new Map(base.answers.map((a) => [a.id, mint()]));
  const copyStep = (step: Step): Step => {
    if (step.kind === "to") return { kind: "to", stage: stageIds.get(step.stage) ?? step.stage };
    if (step.kind === "again") return { ...step, wait: { ...step.wait }, then: copyFlow(step.then) };
    if (step.kind === "bury") return { kind: "bury", wait: { ...step.wait } };
    return { ...step };
  };
  const copyFlow = (flow: Flow): Flow => Object.fromEntries(Object.entries(flow).map(([answerId, step]) => [answerIds.get(answerId) ?? answerId, copyStep(step)]));
  return {
    id: mint(),
    name: `${base.name} copy`.slice(0, 100),
    description: base.description,
    stages: base.stages.map((s) => ({ ...s, id: stageIds.get(s.id) ?? s.id, wait: { ...s.wait } })),
    answers: base.answers.map((a) => ({ ...a, id: answerIds.get(a.id) ?? a.id })),
    flow: copyFlow(base.flow),
    overrides: Object.fromEntries(Object.entries(base.overrides).map(([stageId, flow]) => [stageIds.get(stageId) ?? stageId, copyFlow(flow)])),
    lesson: copyFlow(base.lesson),
    after: base.after,
    growBy: base.growBy,
    burnedName: base.burnedName,
    ...(base.newColour ? { newColour: base.newColour } : {}),
  };
}
