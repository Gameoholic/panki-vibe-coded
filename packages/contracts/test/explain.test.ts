import assert from "node:assert/strict";
import { test } from "node:test";
import { ExplainShape, explainOfWire, explainProblem, type ExplainShape as Wire } from "../src/prompt";

/*
 * Explain's one answer shape ("Touch up, steered" step 4): the wire read into Panki's own shape, and the one checker,
 * against what the send requires. Run with `pnpm --dir packages/contracts test`.
 */

const NONE = { meaning: "", reason: "" };
const wire = (over: Partial<Wire>): Wire => ExplainShape.parse({ reply: "", meanings: [], proposedMeaning: NONE, ...over });
const fits = (meaning: number) => ({ meaning, accuracy: "fits" as const, reason: "it fits" });
const wrong = (meaning: number) => ({ meaning, accuracy: "wrong" as const, reason: "it doesn't" });

test("No rows and nothing proposed is the meanings left untouched; rows come back in the list's order", () => {
  assert.deepEqual(explainOfWire(wire({ reply: " A café. " })), { reply: "A café.", judged: null });
  const read = explainOfWire(wire({ reply: "x", meanings: [wrong(2), fits(1)] }));
  assert.deepEqual(read.judged?.meanings.map((row) => row.meaning), [1, 2]);
  assert.equal(read.judged?.proposed, null);
  const proposed = explainOfWire(wire({ meanings: [wrong(1)], proposedMeaning: { meaning: " stage name ", reason: " a channel " } }));
  assert.deepEqual(proposed.judged?.proposed, { meaning: "stage name", reason: "a channel" });
});

test("Every answer says something: a reply or the meanings judged", () => {
  assert.match(explainProblem(explainOfWire(wire({})), { count: 2, requires: [] }).broken ?? "", /Expected a reply or the meanings judged/);
  assert.equal(explainProblem(explainOfWire(wire({ reply: "Polite enough." })), { count: 2, requires: [] }).broken, null);
});

test("Judged, the meanings' rules hold: a row each, and a proposed meaning exactly when none fits", () => {
  const held = { count: 2, requires: [] };
  assert.match(explainProblem(explainOfWire(wire({ meanings: [fits(1)] })), held).broken ?? "", /one row per meaning \(2\)/);
  assert.match(explainProblem(explainOfWire(wire({ meanings: [wrong(1), wrong(2)] })), held).broken ?? "", /a proposed meaning when no row fits/);
  assert.match(explainProblem(explainOfWire(wire({ meanings: [fits(1), wrong(2)], proposedMeaning: { meaning: "x", reason: "y" } })), held).broken ?? "", /no proposed meaning beside a fitting row/);
  assert.equal(explainProblem(explainOfWire(wire({ meanings: [fits(1), wrong(2)] })), held).broken, null);
});

test("A required part that didn't come back fails the whole message, said in Panki's words", () => {
  const replyAlone = explainProblem(explainOfWire(wire({ reply: "A café." })), { count: 2, requires: ["reply", "meanings"] });
  assert.deepEqual(replyAlone.missing, ["meanings"]);
  assert.equal(replyAlone.plain, "Panki AI didn't judge the meanings.");
  assert.equal(replyAlone.broken, "Expected the meanings judged. Got them untouched.");
  const judgedAlone = explainProblem(explainOfWire(wire({ meanings: [fits(1), wrong(2)] })), { count: 2, requires: ["reply", "meanings"] });
  assert.deepEqual(judgedAlone.missing, ["reply"]);
  assert.equal(judgedAlone.plain, "Panki AI didn't reply.");
  const grammar = explainProblem(explainOfWire(wire({ reply: "Grammar." })), { count: 2, requires: ["reply"] });
  assert.deepEqual(grammar, { broken: null, plain: null, missing: [], leftOut: [] });
});

test("A left-out part that came back fails the whole message, said in Panki's words", () => {
  const said = explainProblem(explainOfWire(wire({ reply: "Polite.", meanings: [fits(1), wrong(2)] })), { count: 2, requires: ["meanings"], leaves: ["reply"] });
  assert.deepEqual(said.leftOut, ["reply"]);
  assert.equal(said.plain, "Panki AI replied, which this message told it not to.");
  const judged = explainProblem(explainOfWire(wire({ reply: "Polite.", meanings: [fits(1), wrong(2)] })), { count: 2, requires: ["reply"], leaves: ["meanings"] });
  assert.equal(judged.plain, "Panki AI judged the meanings, which this message told it to leave out.");
});

test("With no meanings to judge, judging them is a proposed meaning", () => {
  const held = { count: 0, requires: ["meanings" as const] };
  assert.deepEqual(explainProblem(explainOfWire(wire({ reply: "A name." })), held).missing, ["meanings"]);
  const read = explainOfWire(wire({ proposedMeaning: { meaning: "Hajime Shacho; proper name", reason: "a YouTuber" } }));
  assert.deepEqual(explainProblem(read, held), { broken: null, plain: null, missing: [], leftOut: [] });
});
