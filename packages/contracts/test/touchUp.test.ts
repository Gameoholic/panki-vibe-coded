import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_ACTIONS, requiredFor } from "../src/aiActions";
import { answerOfWire, touchUpProblem, touchUpShape, type TouchUpNow, type TouchUpWire } from "../src/touchUp";

/*
 * Touch up's one answer shape (`touchUp.ts`): every send answers a reply and each key it may answer, answered or left
 * untouched; the one reader, and the one checker with what a send requires. Run with `pnpm --dir packages/contracts test`.
 */

const NOW: TouchUpNow = { values: { sentence: "駅で待ってるね", explanation: "" }, ticked: [] };
const UNTOUCHED_FILLED = { judgement: "", proposed: "", why: "", error: "" } as const;
const UNTOUCHED_EMPTY = { proposed: "", why: "", error: "" } as const;
const KEYS = ["sentence", "explanation"] as const;

test("every send's shape is the reply and a key for each field it may answer, a field sent empty with no judgement", () => {
  const shape = touchUpShape(KEYS, NOW, 0);
  const read = shape.safeParse({ reply: "", sentence: UNTOUCHED_FILLED, explanation: UNTOUCHED_EMPTY });
  assert.ok(read.success);
  assert.ok(!shape.safeParse({ sentence: UNTOUCHED_FILLED, explanation: UNTOUCHED_EMPTY }).success);
  assert.ok(!shape.safeParse({ reply: "", sentence: UNTOUCHED_FILLED }).success);
});

test("a key that's empty all through is untouched and left out; a change asked for is a judgement null", () => {
  const wire: TouchUpWire = {
    reply: " Shorter now. ",
    sentence: { judgement: "", proposed: "駅で待ってる", why: "Shorter, as asked.", error: "" },
    explanation: UNTOUCHED_EMPTY,
  };
  const read = answerOfWire(wire);
  assert.equal(read.reply, "Shorter now.");
  assert.deepEqual(read.answer, { sentence: { judgement: null, proposed: "駅で待ってる", why: "Shorter, as asked." } });
});

test("a required key left untouched fails the whole message, said in Panki's words", () => {
  const wire: TouchUpWire = { reply: "", sentence: { judgement: "good", proposed: "", why: "It stands alone.", error: "" }, explanation: UNTOUCHED_EMPTY };
  const read = answerOfWire(wire);
  const problems = touchUpProblem(read, { meanings: [], now: NOW, requires: requiredFor(KEYS, [AI_ACTIONS.touchUp]) });
  assert.deepEqual(problems.missing, ["explanation"]);
  assert.equal(problems.plain, "Panki AI didn't answer the Explanation.");
  assert.equal(problems.broken, "Expected the Explanation answered. Got it untouched.");
  assert.deepEqual(touchUpProblem(read, { meanings: [], now: NOW, requires: requiredFor(KEYS, []) }).broken, null);
  assert.deepEqual(touchUpProblem(read, { meanings: [], now: NOW, requires: requiredFor(KEYS, [AI_ACTIONS.touchUpSentence]) }).broken, null);
  // A reply required and left empty fails too, said first.
  const quiet = touchUpProblem(read, { meanings: [], now: NOW, requires: ["explanation"], reply: true });
  assert.equal(quiet.plain, "Panki AI didn't reply. Panki AI didn't answer the Explanation.");
});

test("a left-out key that came back answered fails the whole message, said in Panki's words", () => {
  const wire: TouchUpWire = { reply: "", sentence: { judgement: "good", proposed: "", why: "It stands alone.", error: "" }, explanation: { proposed: "Written.", why: "Was empty.", error: "" } };
  const read = answerOfWire(wire);
  const problems = touchUpProblem(read, { meanings: [], now: NOW, requires: ["sentence"], leaves: ["explanation"] });
  assert.deepEqual(problems.leftOut, ["explanation"]);
  assert.equal(problems.plain, "Panki AI answered the Explanation, which this message told it to leave out.");
  assert.equal(problems.broken, "Expected the Explanation left untouched. Got it answered.");
});

test("an answer that says nothing at all fails; the error is an answer", () => {
  const nothing = answerOfWire({ reply: "", sentence: UNTOUCHED_FILLED, explanation: UNTOUCHED_EMPTY });
  assert.equal(touchUpProblem(nothing, { meanings: [], now: NOW, requires: [] }).broken, "Expected a reply or a field answered. Got neither.");
  const error = answerOfWire({ reply: "", sentence: UNTOUCHED_FILLED, explanation: { proposed: "", why: "No sentence to go on.", error: "no_context" } });
  assert.deepEqual(touchUpProblem(error, { meanings: [], now: NOW, requires: ["explanation"] }), { broken: null, plain: null, missing: [], leftOut: [] });
});

test("Panki's rules hold whatever was asked: good with a proposal, meh without one, a why missing", () => {
  const held = { meanings: [], now: NOW, requires: [] };
  const of = (sentence: TouchUpWire["sentence"]) => touchUpProblem(answerOfWire({ reply: "Done.", sentence, explanation: UNTOUCHED_EMPTY }), held).broken;
  assert.equal(of({ judgement: "good", proposed: "x", why: "Fine.", error: "" }), 'Expected proposed "" at sentence, judged good. Got a value.');
  assert.equal(of({ judgement: "meh", proposed: "", why: "Too long.", error: "" }), 'Expected a proposed value at sentence, judged meh. Got "".');
  assert.equal(of({ judgement: "bad", proposed: "x", why: " ", error: "" }), "Expected a why at sentence. Got an empty one.");
});

test("the Meaning untouched is no rows and nothing proposed; touched, it's held to a row per meaning", () => {
  const now: TouchUpNow = { values: { meaning: "to wait" }, ticked: [1] };
  const untouched = answerOfWire({ reply: "Fine.", meaning: { meanings: [], proposed: "", why: "", error: "" } });
  assert.deepEqual(untouched.answer, {});
  const short = answerOfWire({ reply: "", meaning: { meanings: [], proposed: "to await", why: "Nearer.", error: "" } });
  assert.equal(touchUpProblem(short, { meanings: ["to wait", "to stay"], now, requires: [] }).broken, "Expected one row per meaning (2). Got 0.");
});
