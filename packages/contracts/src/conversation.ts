/** @panki A place's Conversation, main and a branch per field, as commits (`Conversation`, `Commit`, `branchOf`, `mainRuns`, `historyOf`). Never a second record of one. */
import type { ExplainMessage } from "./prompt";

/**
 * Every Panki AI place's Conversation: **main** and, for Touch up alone, **a branch per field**. Everything that's sent
 * with a follow-up, and where each question and reply is drawn (the web's `AiConversation`, every place's), follows
 * from these few rules; this file is their one home, which `docs/AI.md` ("How every place is built", rule 16) points
 * to. A place without branches (Explain) uses main alone.
 *
 * - **main** is the head's conversation. Every turn is a **commit**: a question and its reply. The first send, a run or
 *   a message, is main's first commit; a later run is a commit on main like any send from the composer. A follow-up
 *   asked under the head is always a commit on main, whether it changed fields or not.
 * - **A field has a branch**, cut from main's **tip** (its latest commit) the first time a follow-up is asked under that
 *   field. Its commits live only on the branch: drawn under the field, sent to the model with main's history before
 *   them (`historyOf`), never part of main's string.
 * - **A branch commit whose reply changes any field merges the branch into main** (`merge`): all of the branch's
 *   commits land on main in order (a fast-forward), so main's string holds the question the reply answered and what
 *   the earlier questions on that branch established. Main's tip is then that reply. In the head the branch's commits
 *   that changed nothing are folded under one quiet line (`mainRuns`), the changing one shown with its field and what it
 *   changed. The branch is then empty again, standing on the new tip.
 * - **When main's tip moves, every other branch is reset to the new tip** (`reset`): its commits discarded, visually
 *   too (`Branch.reset` until the next question asked there), nothing said of them. The tip moves on
 *   every commit on main and on every merge, so a branch always stands on the tip and every merge is a fast-forward.
 * - **Accept and Dismiss are not commits**: they change the card, which every commit already sends as it stands.
 *
 * The whole thing is the Conversation: `main`, `branches` by field, and the verbs `commit`, `tip`, `merge`, `reset`.
 * Plain values and pure functions: a question on its way isn't a commit yet (the drawer holds it apart until its reply
 * is in), and nothing here knows how a commit is drawn. `C` is what a commit changed, one entry per field, as its
 * holder keeps it (the drawer: the key, the proposal's colour and how it was decided); none is "changed nothing".
 */

/** A turn: a question and its reply, the run's included (`run`, its template's name; no question). */
export type Commit<C> = {
  /** Unique within the drawer, rising: a later commit has a higher id. */
  id: number;
  /** The run, by its template's name; null for a follow-up. */
  run: string | null;
  /** The field it was asked under, by its id; null for the run and for a follow-up asked under the head. */
  field: string | null;
  /** What was typed: a follow-up's question, a message's words, the run's instructions ("" for none). */
  question: string;
  /** Every action it went with, by name in its place's order, the one it goes by (`run`) among them: what its bubble heads with. */
  actions?: readonly string[];
  reply: string;
  /** What it adds to the conversation the model is sent, as sent: the question as it went (none for the run) and the reply as the model wrote it. */
  said: readonly ExplainMessage[];
  /** The fields its reply changed, each once; empty for a reply that changed nothing. */
  changed: readonly C[];
  /** Its reply stopped at Max answer length, kept as it came: Panki says so under it. Only a place that keeps a cut reply (Explain) sets it. */
  cut?: boolean;
};

/** A field's branch: the commit of main it stands on, its own commits, and whether it was reset since a question was last asked there. */
export type Branch<C> = {
  /** Main's tip when it was cut or last reset; null only on a conversation with no commits. */
  base: number | null;
  commits: readonly Commit<C>[];
  /** Its commits were discarded when main's tip moved, until the next question there: nothing of them is drawn under the field. */
  reset: boolean;
};

export type Conversation<C> = {
  main: readonly Commit<C>[];
  /** By field id; a field has one from the first follow-up asked under it. */
  branches: ReadonlyMap<string, Branch<C>>;
};

/** No conversation: before a run, or after one that failed. */
export const NO_CONVERSATION: Conversation<never> = { main: [], branches: new Map() };

/**
 * A conversation begun by its first send, the run or a message (a card's conversation can open with either): main holds
 * its one commit, and no field has a branch.
 */
export const startConversation = <C>(first: Commit<C>): Conversation<C> => ({ main: [first], branches: new Map() });

/** Main's tip: its latest commit's id, or null with none. */
export const tip = <C>(conversation: Conversation<C>): number | null => conversation.main.at(-1)?.id ?? null;

/** A field's branch as it stands, or, before its first question, the one it would be cut as: empty, on main's tip. */
export const branchOf = <C>(conversation: Conversation<C>, field: string): Branch<C> =>
  conversation.branches.get(field) ?? { base: tip(conversation), commits: [], reset: false };

function withBranch<C>(conversation: Conversation<C>, field: string, branch: Branch<C>): Conversation<C> {
  const branches = new Map(conversation.branches);
  branches.set(field, branch);
  return { ...conversation, branches };
}

/**
 * What a question asked at `where` is sent with, after the prompt: on main (null), main's commits; on a field's branch,
 * main's commits up to the branch's base, then the branch's own.
 */
export function historyOf<C>(conversation: Conversation<C>, where: string | null): ExplainMessage[] {
  const said = (commits: readonly Commit<C>[]) => commits.flatMap((each) => each.said);
  if (where === null) return said(conversation.main);
  const branch = branchOf(conversation, where);
  const at = branch.base === null ? -1 : conversation.main.findIndex((each) => each.id === branch.base);
  const before = branch.base === null ? [] : at === -1 ? conversation.main : conversation.main.slice(0, at + 1);
  return [...said(before), ...said(branch.commits)];
}

/** A field's branch fast-forwarded onto main: its commits land on main in order, and it stands empty on the new tip. */
export function merge<C>(conversation: Conversation<C>, field: string): Conversation<C> {
  const branch = branchOf(conversation, field);
  const main = [...conversation.main, ...branch.commits];
  return withBranch({ ...conversation, main }, field, { base: main.at(-1)?.id ?? null, commits: [], reset: false });
}

/** A field's branch reset to main's tip: its commits discarded, and said so under the field when there were any (or it was already). */
export function reset<C>(conversation: Conversation<C>, field: string): Conversation<C> {
  const branch = conversation.branches.get(field);
  if (!branch) return conversation;
  return withBranch(conversation, field, { base: tip(conversation), commits: [], reset: branch.reset || branch.commits.length > 0 });
}

/** Main's tip moved: every branch but `except`'s is reset to the new tip. */
function tipMoved<C>(conversation: Conversation<C>, except: string | null): Conversation<C> {
  return [...conversation.branches.keys()].filter((field) => field !== except).reduce((was, field) => reset(was, field), conversation);
}

/**
 * A reply in, as a commit where its question was asked: on main (null) it moves the tip; on a field's branch it's the
 * branch's, cut first if the field had none, its reset note gone, and if it changed any field it merges the branch, which
 * moves the tip. Whenever the tip moves every other branch is reset.
 */
export function commit<C>(conversation: Conversation<C>, where: string | null, next: Commit<C>): Conversation<C> {
  if (where === null) return tipMoved({ ...conversation, main: [...conversation.main, next] }, null);
  const branch = branchOf(conversation, where);
  const grown = withBranch(conversation, where, { base: branch.base, commits: [...branch.commits, next], reset: false });
  return next.changed.length > 0 ? tipMoved(merge(grown, where), where) : grown;
}

/**
 * Main as the head draws it: each commit, with the commits that came with it from its branch and changed nothing before
 * it (`folded`, drawn under one quiet line); every other commit on its own.
 */
export function mainRuns<C>(conversation: Conversation<C>): { commit: Commit<C>; folded: Commit<C>[] }[] {
  const runs: { commit: Commit<C>; folded: Commit<C>[] }[] = [];
  let waiting: Commit<C>[] = [];
  const flush = () => {
    runs.push(...waiting.map((each) => ({ commit: each, folded: [] })));
    waiting = [];
  };
  for (const each of conversation.main) {
    const fromBranch = each.run === null && each.field !== null;
    if (waiting.length > 0 && !(fromBranch && waiting[0]?.field === each.field)) flush();
    if (fromBranch && each.changed.length === 0) {
      waiting.push(each);
      continue;
    }
    runs.push({ commit: each, folded: waiting });
    waiting = [];
  }
  flush();
  return runs;
}

/** Every commit there is, main's and every branch's, oldest first. */
export const commitsOf = <C>(conversation: Conversation<C>): Commit<C>[] =>
  [...conversation.main, ...[...conversation.branches.values()].flatMap((branch) => branch.commits)].sort((a, b) => a.id - b.id);

/** Every commit, main's and every branch's, as `change` makes it; where each stands is left as it is. */
export function mapCommits<C>(conversation: Conversation<C>, change: (each: Commit<C>) => Commit<C>): Conversation<C> {
  const branches = new Map([...conversation.branches].map(([field, branch]) => [field, { ...branch, commits: branch.commits.map(change) }] as const));
  return { main: conversation.main.map(change), branches };
}
