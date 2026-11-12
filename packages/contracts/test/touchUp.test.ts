import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_ACTIONS, requiredFor } from "../src/aiActions";
import { answerOfWire, numberedSubtitles, subtitleLinesOf, touchUpProblem, touchUpShape, type TouchUpNow, type TouchUpWire } from "../src/touchUp";

/*
 * Touch up's one answer shape (`touchUp.ts`): every send answers a reply and each key it may answer, answered or left
 * untouched; the one reader, and the one checker with what a send requires. Run with `pnpm --dir packages/contracts test`.
 */

const NOW: TouchUpNow = { values: { reading: "まつ", explanation: "" }, ticked: [] };
const UNTOUCHED_FILLED = { judgement: "", proposed: "", why: "", error: "" } as const;
const UNTOUCHED_EMPTY = { proposed: "", why: "", error: "" } as const;
const KEYS = ["reading", "explanation"] as const;

test("every send's shape is the reply and a key for each field it may answer, a field sent empty with no judgement", () => {
  const shape = touchUpShape(KEYS, NOW, 0);
  const read = shape.safeParse({ reply: "", reading: UNTOUCHED_FILLED, explanation: UNTOUCHED_EMPTY });
  assert.ok(read.success);
  assert.ok(!shape.safeParse({ reading: UNTOUCHED_FILLED, explanation: UNTOUCHED_EMPTY }).success);
  assert.ok(!shape.safeParse({ reply: "", reading: UNTOUCHED_FILLED }).success);
});

test("a key that's empty all through is untouched and left out; a change asked for is a judgement null", () => {
  const wire: TouchUpWire = {
    reply: " Changed now. ",
    reading: { judgement: "", proposed: "まち", why: "As asked.", error: "" },
    explanation: UNTOUCHED_EMPTY,
  };
  const read = answerOfWire(wire);
  assert.equal(read.reply, "Changed now.");
  assert.deepEqual(read.answer, { reading: { judgement: null, proposed: "まち", why: "As asked." } });
});

test("a field sent empty may stay empty, said with a why alone; it holds against every rule", () => {
  const read = answerOfWire({ reply: "", reading: { judgement: "good", proposed: "", why: "Right.", error: "" }, explanation: { proposed: "", why: "The Meaning says it all.", error: "" } });
  assert.deepEqual(read.answer.explanation, { judgement: null, proposed: null, why: "The Meaning says it all." });
  assert.equal(touchUpProblem(read, { meanings: [], now: NOW, requires: requiredFor(KEYS, [AI_ACTIONS.touchUp]) }).broken, null);
});

test("a required key left untouched fails the whole message, said in Panki's words", () => {
  const wire: TouchUpWire = { reply: "", reading: { judgement: "good", proposed: "", why: "Right.", error: "" }, explanation: UNTOUCHED_EMPTY };
  const read = answerOfWire(wire);
  const problems = touchUpProblem(read, { meanings: [], now: NOW, requires: requiredFor(KEYS, [AI_ACTIONS.touchUp]) });
  assert.deepEqual(problems.missing, ["explanation"]);
  assert.equal(problems.plain, "Panki AI didn't answer the Explanation.");
  assert.equal(problems.broken, "Expected the Explanation answered. Got it untouched.");
  assert.deepEqual(touchUpProblem(read, { meanings: [], now: NOW, requires: requiredFor(KEYS, []) }).broken, null);
  // A reply required and left empty fails too, said first.
  const quiet = touchUpProblem(read, { meanings: [], now: NOW, requires: ["explanation"], reply: true });
  assert.equal(quiet.plain, "Panki AI didn't reply. Panki AI didn't answer the Explanation.");
});

test("a left-out key that came back answered fails the whole message, said in Panki's words", () => {
  const wire: TouchUpWire = { reply: "", reading: { judgement: "good", proposed: "", why: "Right.", error: "" }, explanation: { proposed: "Written.", why: "Was empty.", error: "" } };
  const read = answerOfWire(wire);
  const problems = touchUpProblem(read, { meanings: [], now: NOW, requires: ["reading"], leaves: ["explanation"] });
  assert.deepEqual(problems.leftOut, ["explanation"]);
  assert.equal(problems.plain, "Panki AI answered the Explanation, which this message told it to leave out.");
  assert.equal(problems.broken, "Expected the Explanation left untouched. Got it answered.");
});

test("an answer that says nothing at all fails; the error is an answer", () => {
  const nothing = answerOfWire({ reply: "", reading: UNTOUCHED_FILLED, explanation: UNTOUCHED_EMPTY });
  assert.equal(touchUpProblem(nothing, { meanings: [], now: NOW, requires: [] }).broken, "Expected a reply or a field answered. Got neither.");
  const error = answerOfWire({ reply: "", reading: UNTOUCHED_FILLED, explanation: { proposed: "", why: "No sentence to go on.", error: "no_context" } });
  assert.deepEqual(touchUpProblem(error, { meanings: [], now: NOW, requires: ["explanation"] }), { broken: null, plain: null, missing: [], leftOut: [] });
});

test("Panki's rules hold whatever was asked: good with a proposal, meh without one, a why missing", () => {
  const held = { meanings: [], now: NOW, requires: [] };
  const of = (reading: TouchUpWire["reading"]) => touchUpProblem(answerOfWire({ reply: "Done.", reading, explanation: UNTOUCHED_EMPTY }), held).broken;
  assert.equal(of({ judgement: "good", proposed: "x", why: "Fine.", error: "" }), 'Expected proposed "" at reading, judged good. Got a value.');
  assert.equal(of({ judgement: "meh", proposed: "", why: "Too long.", error: "" }), 'Expected a proposed value at reading, judged meh. Got "".');
  assert.equal(of({ judgement: "bad", proposed: "x", why: " ", error: "" }), "Expected a why at reading. Got an empty one.");
});

const SUBTITLES = "何されてる？\n\n殴られてる。 \nこういう澤部さん。";
const LINES = { lines: subtitleLinesOf(SUBTITLES), word: "殴られてる" };
const SENTENCE_NOW: TouchUpNow = { values: { sentence: "殴られてる。" }, ticked: [] };

test("subtitles are numbered a line each, blank lines left out", () => {
  assert.equal(numberedSubtitles(SUBTITLES), "1\t何されてる？\n2\t殴られてる。\n3\tこういう澤部さん。");
});

test("a Sentence is the subtitle lines its numbers name, copied, in order and within the lines there are", () => {
  const of = (first: number, last: number) => answerOfWire({ reply: "", sentence: { judgement: "meh", first, last, why: "Needs the question.", error: "" } }, LINES).answer.sentence;
  assert.deepEqual(of(1, 2), { judgement: "meh", proposed: "何されてる？\n殴られてる。", why: "Needs the question." });
  assert.deepEqual(of(2, 1), of(1, 2));
  assert.deepEqual(of(2, 9), { judgement: "meh", proposed: "殴られてる。\nこういう澤部さん。", why: "Needs the question." });
  // Good copies nothing; untouched is 0 and 0 with no judgement.
  assert.deepEqual(answerOfWire({ reply: "", sentence: { judgement: "good", first: 0, last: 0, why: "Stands alone.", error: "" } }, LINES).answer.sentence, {
    judgement: "good",
    proposed: null,
    why: "Stands alone.",
  });
  assert.equal(answerOfWire({ reply: "x", sentence: { judgement: "", first: 0, last: 0, why: "", error: "" } }, LINES).answer.sentence, undefined);
});

test("a Sentence whose lines can't be used is set aside, that part alone, never failing the message", () => {
  const aside = (wire: TouchUpWire["sentence"], lines = LINES) => answerOfWire({ reply: "", sentence: wire }, lines).answer.sentence;
  assert.equal((aside({ judgement: "meh", first: 3, last: 3, why: "x", error: "" }) as { error?: string }).error, "rewrote");
  assert.equal((aside({ judgement: "meh", first: 0, last: 0, why: "x", error: "" }) as { error?: string }).error, "rewrote");
  assert.equal((aside({ judgement: "meh", first: 1, last: 2, why: "x", error: "" }, { lines: [], word: "" }) as { error?: string }).error, "rewrote");
  const read = answerOfWire({ reply: "", sentence: { judgement: "meh", first: 3, last: 3, why: "x", error: "" } }, LINES);
  assert.equal(touchUpProblem(read, { meanings: [], now: SENTENCE_NOW, requires: ["sentence"] }).broken, null);
});

test("the Meaning untouched is no rows and nothing proposed; touched, it's held to a row per meaning", () => {
  const now: TouchUpNow = { values: { meaning: "to wait" }, ticked: [1] };
  const untouched = answerOfWire({ reply: "Fine.", meaning: { meanings: [], proposed: "", why: "", error: "" } });
  assert.deepEqual(untouched.answer, {});
  const short = answerOfWire({ reply: "", meaning: { meanings: [], proposed: "to await", why: "Nearer.", error: "" } });
  assert.equal(touchUpProblem(short, { meanings: ["to wait", "to stay"], now, requires: [] }).broken, "Expected one row per meaning (2). Got 0.");
});
