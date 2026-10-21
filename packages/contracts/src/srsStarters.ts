import { BURY_WAIT, type Flow, type NewSrsType, type SrsAfter, type Step, type WaitUnit } from "./srs";

/**
 * The SRS types that come with the app. They are real types in the list, made by the API when it opens a database
 * that lacks one, and they can't be deleted; the owner edits them like any other, and a new type starts as a copy of
 * any type in the list (`copySrsType`). Here is only what each is made of.
 */
export type SrsStarterId = "wanikaniPlus" | "wanikani" | "anki";
export const SRS_STARTER_IDS: readonly SrsStarterId[] = ["wanikaniPlus", "wanikani", "anki"];
export const DEFAULT_STARTER: SrsStarterId = "wanikaniPlus";

type Rung = [n: number, unit: WaitUnit, name?: string];
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
 * Wanikani+: the owner's own rules on WaniKani's ladder. Forgot keeps the card in the review, asked again and again
 * until it's got right; what happens then depends on the stage. On the early ones it drops a stage, never below
 * Apprentice 1. From `WK_CHANCE_FROM` on, where a stage is weeks of work, it gets one more chance first: asked again
 * tomorrow (never later than the stage), and only a second Forgot drops it, after it too has been asked until right.
 * The answers set apart work the same everywhere: Reset sends the card back to the first stage, Apprentice 1, to climb
 * again (it was Relearn, back to the first stage, then for a few hours back to New; the owner, 2026-10-21: "make it
 * Reset… puts it into the first stage after New"), Easy lifts it two (it was called Bury until 2026-10-17; the owner
 * kept the sound of it in mind for a button that hides a card, which this one never did), and Snooze and Suspend put
 * the card aside where it stands (the owner, 2026-10-21). All four ask for confirmation (Easy, Snooze and Suspend went
 * without for a day, 2026-10-21, and came back to it at the owner's word). New (`wanikaniPlusLesson`): Ok or Easy learns it, and Forgot asks it again until it's got
 * right, then learns it.
 */
const WK_CHANCE_FROM = 4;
function wanikaniPlusFlow(a: string[], s: string[], chance: boolean): Flow {
  const [forgot, ok, reset, easy, bury, suspend] = [id(a, 0), id(a, 1), id(a, 2), id(a, 3), id(a, 4), id(a, 5)];
  const apart = (): Flow => ({ [reset]: to(id(s, 0)), [easy]: move(2), [bury]: { kind: "bury", wait: { ...BURY_WAIT } }, [suspend]: { kind: "suspend" } });
  // Once a card is forgotten, neither Easy nor Bury is offered until it leaves the ask-again: a card just forgotten is no
  // card to skip ahead (the owner, 2026-10-18), nor to bury ("there's no reason to bury a card if I already failed it",
  // 2026-10-17). Suspend stays: a card failed again and again is the one to take out and fix.
  const forgotten = (): Flow => ({ ...apart(), [easy]: { kind: "hidden" }, [bury]: { kind: "hidden" } });
  /** Kept in the review until it's got right, and then `then`. */
  const untilRight = (then: Step): Step => now({ [forgot]: { kind: "retry" }, [ok]: then, ...forgotten() });
  // On the second-chance day a Forgot is asked until right too, before the stage drops; the card was forgotten the day before.
  const after: Step = chance ? again(1, "d", { [forgot]: untilRight(move(-1)), [ok]: move(0), ...forgotten() }) : move(-1);
  return { [forgot]: untilRight(after), [ok]: move(1), ...apart() };
}
/**
 * Wanikani+ for a new card: WaniKani's lesson, where nothing is held against a card (the owner, 2026-10-21: asked
 * again until it's got right in the same review, "and then graduate to Apprentice 1"). Reset has nothing to do there.
 */
function wanikaniPlusLesson(a: string[]): Flow {
  const [forgot, ok, reset, easy, bury, suspend] = [id(a, 0), id(a, 1), id(a, 2), id(a, 3), id(a, 4), id(a, 5)];
  const hidden: Step = { kind: "hidden" };
  return {
    [forgot]: now({ [forgot]: { kind: "retry" }, [ok]: move(1), [reset]: { ...hidden }, [easy]: { ...hidden }, [bury]: { ...hidden }, [suspend]: { kind: "suspend" } }),
    [ok]: move(1),
    [reset]: { ...hidden },
    [easy]: move(2),
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

// Lesson was the first of these until 2026-10-21, when it became every type's own, before the first stage (New on screen).
const WK_NAMES = ["Apprentice 1", "Apprentice 2", "Apprentice 3", "Apprentice 4", "Guru 1", "Guru 2", "Master", "Enlightened"];

const STARTERS: Record<SrsStarterId, Starter> = {
  wanikaniPlus: {
    name: "Wanikani+",
    description: "Wanikani with a forgiveness mechanism from Guru 1 up: a card you forget there is asked again the next day, and drops a stage only if you forget it again. Adds Easy (skip two stages), Reset (back to Apprentice 1), Snooze (back in 24 hours) and Suspend (out until you bring it back).",
    stages: [[4, "h"], [8, "h"], [1, "d"], [2, "d"], [1, "w"], [2, "w"], [1, "mo"], [4, "mo"]],
    after: "burn",
    // The third was Relearn and the fifth Bury until the owner renamed them Reset and Snooze, 2026-10-21; the fifth's rule is still the `bury` step.
    // Every one set apart asks for confirmation (Easy, Snooze and Suspend again at the owner's word, 2026-10-21, once a
    // held key could be the yes: held longer instead of asked, `keys.ts` → `askMs`).
    answers: ["Forgot", "Ok", ["Reset", "aside"], ["Easy", "aside"], ["Snooze", "aside"], ["Suspend", "aside"]],
    flow: (a, s) => wanikaniPlusFlow(a, s, false),
    overrides: (a, s) => Object.fromEntries(s.slice(WK_CHANCE_FROM).map((stageId) => [stageId, wanikaniPlusFlow(a, s, true)])),
    lesson: (a) => wanikaniPlusLesson(a),
  },
  // WaniKani's waits are an hour short of the round figure (23 h, not a day), so a review lands a little earlier each
  // day; the last is past what a wait in hours holds, and is the round 4 months.
  wanikani: {
    name: "Wanikani",
    description: "Ported from WaniKani.",
    stages: [[4, "h"], [8, "h"], [23, "h"], [47, "h"], [167, "h"], [335, "h"], [719, "h"], [4, "mo"]],
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
  // is the next, Easy skips one. While learning, Easy graduates straight to the stage nearest four days. (The first step
  // was a stage of its own, Learning 1, until Lesson took its place, 2026-10-21; the second is Learning now.)
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
 * One of the types that come with the app, with fresh ids from `mint` (`crypto.randomUUID`). Given `as` (the type
 * already made from it), it's the same type as the app defines it today under the ids that one has, stage for stage
 * and answer for answer, so one that exists can be brought up to date without its cards losing their place.
 */
export function makeStarter(starter: SrsStarterId, mint: () => string, as?: { id: string; stageIds: readonly string[]; answerIds: readonly string[] }): NewSrsType {
  const s = STARTERS[starter];
  const wk = starter === "anki" ? [] : WK_NAMES;
  const answers = s.answers.map((a, i) => {
    const id = as?.answerIds[i] ?? mint();
    return typeof a === "string" ? { id, name: a } : { id, name: a[0], aside: true, confirm: a[2] ?? true };
  });
  const stages = s.stages.map(([n, unit, name], i) => ({ id: as?.stageIds[i] ?? mint(), name: name ?? wk[i] ?? "", wait: { n, unit } }));
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
 * needs a stage and two answers); it's the blank page the owner builds on.
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
 * one never touches the other. Its name says what it's a copy of until the owner gives it one.
 */
export function copySrsType(base: Pick<NewSrsType, "name" | "description" | "stages" | "answers" | "flow" | "overrides" | "lesson" | "after" | "growBy" | "burnedName">, mint: () => string): NewSrsType {
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
  };
}
