import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_CONVERSATION, branchOf, commit, commitsOf, historyOf, mainRuns, mapCommits, merge, reset, startConversation, tip, type Commit, type Conversation } from "../src/conversation";

/*
 * Touch up's Conversation: main and a branch per field (`conversation.ts`). Run with `pnpm --dir packages/contracts test`.
 */

type C = { key: string };
let ids = 0;
/** A commit asked at `field` (null under the head), changing the keys given. */
function turn(field: string | null, question: string, changed: string[] = []): Commit<C> {
  return {
    id: ++ids,
    run: null,
    field,
    question,
    reply: `re: ${question}`,
    said: [
      { role: "user", text: question },
      { role: "assistant", text: `re: ${question}` },
    ],
    changed: changed.map((key) => ({ key })),
  };
}
function run(): Conversation<C> {
  return startConversation<C>({ id: ++ids, run: "Touch up", field: null, question: "", reply: "", said: [{ role: "assistant", text: "{run}" }], changed: [{ key: "meaning" }] });
}
const texts = (conversation: Conversation<C>, where: string | null) => historyOf(conversation, where).map((each) => each.text);
const questions = (commits: readonly Commit<C>[]) => commits.map((each) => each.question);

test("no conversation has no tip and nothing to send", () => {
  assert.equal(tip(NO_CONVERSATION), null);
  assert.deepEqual(historyOf(NO_CONVERSATION, null), []);
  assert.deepEqual(historyOf(NO_CONVERSATION, "f1"), []);
});

test("the run is main's first commit and its tip", () => {
  const c = run();
  assert.equal(c.main.length, 1);
  assert.equal(tip(c), c.main[0]?.id);
  assert.deepEqual(texts(c, null), ["{run}"]);
  assert.equal(c.branches.size, 0);
});

test("a head follow-up is a commit on main, changed or not", () => {
  let c = run();
  c = commit(c, null, turn(null, "why?"));
  c = commit(c, null, turn(null, "shorter", ["line"]));
  assert.deepEqual(questions(c.main), ["", "why?", "shorter"]);
  assert.deepEqual(texts(c, null), ["{run}", "why?", "re: why?", "shorter", "re: shorter"]);
});

test("a branch is cut from the tip, its commits sent after main's and never on main", () => {
  let c = run();
  const cutAt = tip(c);
  c = commit(c, "f1", turn("f1", "is it formal?"));
  const branch = branchOf(c, "f1");
  assert.equal(branch.base, cutAt);
  assert.deepEqual(questions(branch.commits), ["is it formal?"]);
  assert.equal(c.main.length, 1);
  assert.deepEqual(texts(c, "f1"), ["{run}", "is it formal?", "re: is it formal?"]);
  assert.deepEqual(texts(c, null), ["{run}"]);
  // Another field's branch, not yet cut, sends main alone.
  assert.deepEqual(texts(c, "f2"), ["{run}"]);
});

test("a branch commit that changes a field merges the whole branch onto main, and the branch stands empty on the new tip", () => {
  let c = run();
  c = commit(c, "f1", turn("f1", "q1"));
  c = commit(c, "f1", turn("f1", "q2"));
  c = commit(c, "f1", turn("f1", "q3", ["meaning"]));
  assert.deepEqual(questions(c.main), ["", "q1", "q2", "q3"]);
  assert.equal(tip(c), c.main.at(-1)?.id);
  const branch = branchOf(c, "f1");
  assert.deepEqual(branch.commits, []);
  assert.equal(branch.base, tip(c));
  assert.equal(branch.reset, false);
  assert.deepEqual(texts(c, null), ["{run}", "q1", "re: q1", "q2", "re: q2", "q3", "re: q3"]);
});

test("when main's tip moves every other branch is reset, said once, until the next question there", () => {
  let c = run();
  c = commit(c, "f2", turn("f2", "a"));
  c = commit(c, "f3", turn("f3", "b"));
  c = commit(c, "f1", turn("f1", "c", ["line"]));
  for (const field of ["f2", "f3"]) {
    const branch = branchOf(c, field);
    assert.deepEqual(branch.commits, []);
    assert.equal(branch.base, tip(c));
    assert.equal(branch.reset, true);
  }
  assert.equal(branchOf(c, "f1").reset, false);
  c = commit(c, "f2", turn("f2", "again"));
  assert.equal(branchOf(c, "f2").reset, false);
  assert.equal(branchOf(c, "f3").reset, true);
  assert.deepEqual(texts(c, "f2"), ["{run}", "c", "re: c", "again", "re: again"]);
});

test("a head commit moves the tip, so it resets every branch too, changed or not", () => {
  let c = run();
  c = commit(c, "f1", turn("f1", "a"));
  c = commit(c, null, turn(null, "unrelated"));
  assert.deepEqual(branchOf(c, "f1").commits, []);
  assert.equal(branchOf(c, "f1").reset, true);
  assert.equal(branchOf(c, "f1").base, tip(c));
});

test("a branch commit that changes nothing leaves main and the other branches as they are", () => {
  let c = run();
  c = commit(c, "f2", turn("f2", "a"));
  const before = tip(c);
  c = commit(c, "f1", turn("f1", "b"));
  assert.equal(tip(c), before);
  assert.deepEqual(questions(branchOf(c, "f2").commits), ["a"]);
});

test("reset leaves a branch with nothing in it unsaid, and an uncut field alone", () => {
  let c = run();
  c = commit(c, "f1", turn("f1", "a", ["meaning"]));
  assert.equal(reset(c, "f1").branches.get("f1")?.reset, false);
  assert.equal(reset(c, "f9").branches.has("f9"), false);
});

test("merge by itself fast-forwards", () => {
  let c = run();
  c = commit(c, "f1", turn("f1", "a"));
  c = merge(c, "f1");
  assert.deepEqual(questions(c.main), ["", "a"]);
  assert.deepEqual(branchOf(c, "f1").commits, []);
});

test("the head folds a merged branch's unchanged commits before the one that changed", () => {
  let c = run();
  c = commit(c, null, turn(null, "head"));
  c = commit(c, "f1", turn("f1", "q1"));
  c = commit(c, "f1", turn("f1", "q2"));
  c = commit(c, "f1", turn("f1", "q3", ["meaning"]));
  c = commit(c, "f1", turn("f1", "q4", ["meaning"]));
  const runs = mainRuns(c);
  assert.deepEqual(
    runs.map((each) => [each.commit.question, questions(each.folded)]),
    [
      ["", []],
      ["head", []],
      ["q3", ["q1", "q2"]],
      ["q4", []],
    ],
  );
});

test("every commit, and every commit changed in place", () => {
  let c = run();
  c = commit(c, null, turn(null, "h", ["line"]));
  c = commit(c, "f1", turn("f1", "b"));
  assert.deepEqual(questions(commitsOf(c)), ["", "h", "b"]);
  const marked = mapCommits(c, (each) => ({ ...each, reply: "x" }));
  assert.ok(commitsOf(marked).every((each) => each.reply === "x"));
  assert.deepEqual(questions(branchOf(marked, "f1").commits), ["b"]);
});
