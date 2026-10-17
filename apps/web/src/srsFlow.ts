import { STAY, WAIT_MAX, branchAt, stepAt, type Flow, type SrsAnswer, type SrsType, type Step, type Wait } from "@panki/contracts";
import { AGAIN_OPTIONS, STEP_OPTIONS } from "./srsKinds";

/**
 * Editing a type's rules without touching the one in state: every change returns a new type. A scope is which
 * rules are being edited: "all" for the default rules, or a stage's id for its own (made from the default ones the
 * first time that stage is edited). A path is the answers taken to reach a step: the answer itself at the root,
 * then the answer taken inside each ask-again.
 */
export type Scope = "all" | string;
/** The end of the ladder as something to look at on the chart: it has no rules, so nothing there is edited. */
export const BURNED_SCOPE: Scope = "burned";

export function edit(type: SrsType, change: (draft: SrsType) => void): SrsType {
  const draft = structuredClone(type);
  change(draft);
  settle(draft);
  return draft;
}
/** Whether two steps do the same thing, however they were arrived at. */
function sameStep(a: Step, b: Step, answers: readonly SrsAnswer[]): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "move" && b.kind === "move") return a.by === b.by;
  if (a.kind === "to" && b.kind === "to") return a.stage === b.stage;
  if (a.kind === "again" && b.kind === "again") {
    return a.wait.n === b.wait.n && a.wait.unit === b.wait.unit && Boolean(a.capped) === Boolean(b.capped) && Boolean(a.now) === Boolean(b.now) && sameFlow(a.then, b.then, answers);
  }
  return true;
}
/** Whether two sets of rules do the same for every answer (one with no rule stays, as it does when a card is answered). */
function sameFlow(a: Flow, b: Flow, answers: readonly SrsAnswer[]): boolean {
  return answers.every((answer) => sameStep(a[answer.id] ?? STAY, b[answer.id] ?? STAY, answers));
}
/**
 * A stage whose own rules have come back to the default ones has no rules of its own any more, however it got
 * there (a change undone by hand counts): it follows the default again, and nothing offers to sync it.
 */
function settle(draft: SrsType) {
  for (const [stageId, own] of Object.entries(draft.overrides)) {
    if (sameFlow(own, draft.flow, draft.answers)) delete draft.overrides[stageId];
  }
}
/** The rules a scope shows: a stage's own when it has them, else the default. */
export function scopeFlow(type: SrsType, scope: Scope): Flow {
  return scope === "all" ? type.flow : (type.overrides[scope] ?? type.flow);
}
/** The rules a scope edits, on a draft: a stage edited for the first time gets its own copy of the default. */
function ownFlow(draft: SrsType, scope: Scope): Flow {
  if (scope === "all") return draft.flow;
  return (draft.overrides[scope] ??= structuredClone(draft.flow));
}
export function hasOwnRules(type: SrsType, scope: Scope): boolean {
  return scope !== "all" && Boolean(type.overrides[scope]);
}
export function getStep(type: SrsType, scope: Scope, path: readonly string[]): Step | undefined {
  return stepAt(scopeFlow(type, scope), path);
}
function stepOf(key: string): Step {
  if (key.startsWith("to:")) return { kind: "to", stage: key.slice(3) };
  return structuredClone(STEP_OPTIONS.find((o) => o.id === key)?.step ?? STAY);
}
/** Sets what the answer at the end of `path` does: a fixed step, `to:<stage id>`, or one of `AGAIN_OPTIONS` to ask again first. */
export function setStep(type: SrsType, scope: Scope, path: readonly string[], key: string): SrsType {
  const again = AGAIN_OPTIONS.find((o) => o.id === key);
  if (again) return wrapInAgain(type, scope, path, again.now);
  const last = path[path.length - 1];
  if (last === undefined) return type;
  return edit(type, (draft) => {
    branchAt(ownFlow(draft, scope), path.slice(0, -1))[last] = stepOf(key);
  });
}
/** Puts an ask-again in front of a step, after a wait or (`now`) in the same review: the same answer then leads to what the step was; the other answers keep the stage. */
export function wrapInAgain(type: SrsType, scope: Scope, path: readonly string[], now = false): SrsType {
  const last = path[path.length - 1];
  if (last === undefined) return type;
  return edit(type, (draft) => {
    const branch = branchAt(ownFlow(draft, scope), path.slice(0, -1));
    const old = branch[last] ?? STAY;
    if (old.kind === "again") return;
    const then: Flow = {};
    for (const answer of draft.answers) then[answer.id] = answer.id === last ? structuredClone(old) : { ...STAY };
    branch[last] = { kind: "again", wait: { n: 1, unit: "d" }, then, capped: true, ...(now ? { now: true } : {}) };
  });
}
/** Takes an ask-again out: the step becomes what the same answer led to inside it. */
export function flattenAgain(type: SrsType, scope: Scope, path: readonly string[]): SrsType {
  const last = path[path.length - 1];
  if (last === undefined) return type;
  return edit(type, (draft) => {
    const branch = branchAt(ownFlow(draft, scope), path.slice(0, -1));
    const step = branch[last];
    if (!step || step.kind !== "again") return;
    branch[last] = step.then[last] ?? { ...STAY };
  });
}
export function setAgainWait(type: SrsType, scope: Scope, path: readonly string[], patch: Partial<Wait>): SrsType {
  return edit(type, (draft) => {
    const step = stepAt(ownFlow(draft, scope), path);
    if (step && step.kind === "again") Object.assign(step.wait, patch);
  });
}
/** Whether an ask-again is asked right away, in the same review, instead of after its wait. */
export function setAgainNow(type: SrsType, scope: Scope, path: readonly string[], now: boolean): SrsType {
  return edit(type, (draft) => {
    const step = stepAt(ownFlow(draft, scope), path);
    if (step && step.kind === "again") step.now = now;
  });
}
/** Whether an ask-again never waits longer than the card's stage does. */
export function setAgainCapped(type: SrsType, scope: Scope, path: readonly string[], capped: boolean): SrsType {
  return edit(type, (draft) => {
    const step = stepAt(ownFlow(draft, scope), path);
    if (step && step.kind === "again") step.capped = capped;
  });
}
/** A stage goes back to the default rules. */
export function syncToDefault(type: SrsType, scope: Scope): SrsType {
  return edit(type, (draft) => {
    delete draft.overrides[scope];
  });
}

export function addAnswer(type: SrsType, id: string): SrsType {
  return edit(type, (draft) => {
    draft.answers.push({ id, name: "" });
    draft.flow[id] = { ...STAY };
  });
}
function stripAnswer(flow: Flow, id: string) {
  delete flow[id];
  for (const step of Object.values(flow)) if (step.kind === "again") stripAnswer(step.then, id);
}
/** Takes an answer out, and every rule it had, at every depth. */
export function removeAnswer(type: SrsType, id: string): SrsType {
  return edit(type, (draft) => {
    draft.answers = draft.answers.filter((a) => a.id !== id);
    stripAnswer(draft.flow, id);
    for (const flow of Object.values(draft.overrides)) stripAnswer(flow, id);
  });
}
/** Whether an answer sits apart from the main ones on the review screen, and whether it asks before it's applied. */
export function patchAnswer(type: SrsType, id: string, patch: { aside?: boolean; confirm?: boolean }): SrsType {
  return edit(type, (draft) => {
    const answer = draft.answers.find((a) => a.id === id);
    if (answer) Object.assign(answer, patch);
  });
}
export function renameAnswer(type: SrsType, id: string, name: string): SrsType {
  return edit(type, (draft) => {
    const answer = draft.answers.find((a) => a.id === id);
    if (answer) answer.name = name;
  });
}

/** A new stage at the end waits twice as long as the last one. */
export function addStage(type: SrsType, id: string): SrsType {
  return edit(type, (draft) => {
    const last = draft.stages[draft.stages.length - 1];
    const wait: Wait = last ? { n: Math.min(WAIT_MAX, Math.max(1, last.wait.n * 2)), unit: last.wait.unit } : { n: 1, unit: "d" };
    draft.stages.push({ id, name: "", wait });
  });
}
function stripStage(flow: Flow, id: string) {
  for (const [answerId, step] of Object.entries(flow)) {
    if (step.kind === "to" && step.stage === id) flow[answerId] = { ...STAY };
    else if (step.kind === "again") stripStage(step.then, id);
  }
}
/** Takes a stage out: its own rules go, and a rule that sent cards to it now keeps them where they are. */
export function removeStage(type: SrsType, id: string): SrsType {
  return edit(type, (draft) => {
    draft.stages = draft.stages.filter((s) => s.id !== id);
    delete draft.overrides[id];
    stripStage(draft.flow, id);
    for (const flow of Object.values(draft.overrides)) stripStage(flow, id);
  });
}
export function moveStage(type: SrsType, from: number, to: number): SrsType {
  return edit(type, (draft) => {
    const [moved] = draft.stages.splice(from, 1);
    if (moved) draft.stages.splice(to, 0, moved);
  });
}
export function patchStage(type: SrsType, id: string, patch: { name?: string; wait?: Partial<Wait> }): SrsType {
  return edit(type, (draft) => {
    const stage = draft.stages.find((s) => s.id === id);
    if (!stage) return;
    if (patch.name !== undefined) stage.name = patch.name;
    if (patch.wait) Object.assign(stage.wait, patch.wait);
  });
}

/** The rules as a tree for drawing: each node is an answer taken and the step it leads to, with children when it asks again. */
export type TreeNode = { answer: SrsAnswer; step: Step; path: string[]; children: TreeNode[] };
export function tree(type: SrsType, flow: Flow, path: string[] = []): TreeNode[] {
  return type.answers.map((answer) => {
    const step = branchAt(flow, path)[answer.id] ?? STAY;
    const own = [...path, answer.id];
    return { answer, step, path: own, children: step.kind === "again" ? tree(type, flow, own) : [] };
  });
}
