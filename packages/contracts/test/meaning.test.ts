import assert from "node:assert/strict";
import { test } from "node:test";
import { customOf, glossesOf, meaningTicked, meaningVerdictOf, meaningWithout, readMeaning, tidyMeaning, touchUpProblem, type MeaningRow, type TouchUpNow } from "../src/touchUp";

/*
 * The Meaning field read as glosses (`readMeaning`) and what Touch up makes of it (`meaningVerdictOf`,
 * `touchUpProblem`). Run with `pnpm --dir packages/contracts test`.
 */

const M1 = "elegant; graceful; refined";
const M2 = "comfortable; luxurious";
const M3 = "at leisure; free from care";
const LIST = [M1, M2, M3];

test("glosses are split on either semicolon and line breaks, trimmed, empties dropped", () => {
  assert.deepEqual(glossesOf(" table;;  tabletop ;\nyes；agreement; "), ["table", "tabletop", "yes", "agreement"]);
  assert.deepEqual(glossesOf(";;;;"), []);
  assert.equal(tidyMeaning("comfortable; luxurious;;;;"), "comfortable; luxurious");
  assert.equal(tidyMeaning("yes;  agreement;"), "yes; agreement");
});

test("a dictionary meaning is ticked only while it stands whole", () => {
  assert.deepEqual(readMeaning(M2, LIST), { runs: [{ kind: "dictionary", number: 2, words: M2 }], ticked: [2], custom: [] });
  // One letter short: the whole run is a custom meaning, and meaning 2 isn't ticked.
  assert.deepEqual(readMeaning("comfortable; luxuriou", LIST).custom, ["comfortable; luxuriou"]);
  assert.deepEqual(readMeaning("comfortable; luxuriou", LIST).ticked, []);
  // Out of the dictionary's order it isn't the meaning's whole.
  assert.deepEqual(readMeaning("luxurious; comfortable", LIST).custom, ["luxurious; comfortable"]);
  // One gloss of it alone isn't either.
  assert.deepEqual(readMeaning("comfortable", LIST).custom, ["comfortable"]);
});

test("glosses are compared bare: spaces, capitals and punctuation aside", () => {
  assert.deepEqual(readMeaning("Comfortable ;  LUXURIOUS.", LIST).ticked, [2]);
  assert.deepEqual(readMeaning("comfortable；luxurious", LIST).ticked, [2]);
});

test("runs left over are custom meanings, two only with a dictionary meaning between", () => {
  assert.deepEqual(readMeaning("comfortable; luxurious; well-fare", LIST).custom, ["well-fare"]);
  const between = readMeaning("wealthy; comfortable; luxurious; well-fare", LIST);
  assert.deepEqual(between.ticked, [2]);
  assert.deepEqual(between.custom, ["wealthy", "well-fare"]);
  assert.deepEqual(
    between.runs.map((run) => `${run.kind} ${run.number}`),
    ["custom 1", "dictionary 2", "custom 2"],
  );
  assert.deepEqual(readMeaning("comfortable; luxurious; wealthy; well-fare", LIST).custom, ["wealthy; well-fare"]);
  assert.deepEqual(readMeaning(`${M1}; ${M2}; ${M3}`, LIST).ticked, [1, 2, 3]);
});

test("the longest whole is matched first, then the dictionary's order", () => {
  const nested = [M1, "comfortable", "comfortable; at ease"];
  assert.deepEqual(readMeaning("comfortable; at ease", nested), { runs: [{ kind: "dictionary", number: 3, words: "comfortable; at ease" }], ticked: [3], custom: [] });
  // Glosses one meaning took can't be another's.
  assert.deepEqual(readMeaning("a; b", ["a; b", "a; b"]).ticked, [1]);
});

test("ticking appends a meaning whole, unticking takes out exactly its run", () => {
  assert.equal(meaningTicked(M2, LIST, 3), `${M2}; ${M3}`);
  assert.equal(meaningTicked(`${M2};;`, LIST, 2), M2);
  assert.equal(meaningWithout("comfortable; luxurious; well-off", LIST, (run) => run.kind === "dictionary" && run.number === 2), "well-off");
  assert.equal(meaningTicked("", LIST, 1), M1);
});

const nowOf = (meaning: string): TouchUpNow => ({ values: { meaning: tidyMeaning(meaning) }, ticked: [] });
const row = (meaning: number, judgement: MeaningRow["judgement"]): MeaningRow => ({ meaning, judgement, why: "Because." });

test("a custom meaning is a row after the dictionary's, judged like them", () => {
  const now = nowOf("comfortable; luxurious; well-fare");
  assert.deepEqual(customOf(now, LIST), ["well-fare"]);
  const verdict = meaningVerdictOf({ meanings: [row(1, "meh"), row(2, "good"), row(3, "bad"), row(4, "bad")], proposed: null, why: "Meaning 2 fits." }, now, LIST);
  assert.equal(verdict.kind, "change");
  if (verdict.kind !== "change") return;
  assert.equal(verdict.accepted, M2);
  assert.deepEqual(
    verdict.marks.map((mark) => `${mark.kind} ${mark.number} ${mark.mark}`),
    ["dictionary 2 keep", "custom 1 bad"],
  );
  assert.deepEqual(
    verdict.rows.filter((r) => r.ticked).map((r) => `${r.kind} ${r.number}`),
    ["dictionary 2", "custom 1"],
  );
});

test("a custom meaning that fits keeps its place; one that fits beside it is added after", () => {
  const verdict = meaningVerdictOf({ meanings: [row(1, "meh"), row(2, "good"), row(3, "bad"), row(4, "good")], proposed: null, why: "Both fit." }, nowOf("a life of ease"), LIST);
  assert.equal(verdict.kind, "change");
  if (verdict.kind === "change") assert.equal(verdict.accepted, `a life of ease; ${M2}`);
  const good = meaningVerdictOf({ meanings: [row(1, "bad"), row(2, "bad"), row(3, "bad"), row(4, "good")], proposed: null, why: "Yours fits." }, nowOf("deep and husky"), LIST);
  assert.equal(good.kind, "good");
});

test("no row good: Panki AI's meaning in place of what's held", () => {
  const verdict = meaningVerdictOf({ meanings: [row(1, "bad"), row(2, "meh"), row(3, "bad")], proposed: "naive;  overly optimistic", why: "Near." }, nowOf(M2), LIST);
  assert.equal(verdict.kind, "propose");
  if (verdict.kind !== "propose") return;
  assert.equal(verdict.proposed, "naive; overly optimistic");
  assert.deepEqual(
    verdict.marks.map((mark) => mark.mark),
    ["meh"],
  );
});

test("a proposed meaning that repeats a row is refused", () => {
  const now = nowOf(M2);
  const answer = (proposed: string) => ({ meaning: { meanings: [row(1, "bad"), row(2, "meh"), row(3, "bad")], proposed, why: "Near." } });
  assert.equal(touchUpProblem(answer("Comfortable, luxurious"), LIST, now), "Expected a meaning not in the list. Got meaning 2's words.");
  assert.equal(touchUpProblem(answer("naive; overly optimistic"), LIST, now), null);
  const own = nowOf("well-fare");
  const withOwn = { meaning: { meanings: [row(1, "bad"), row(2, "bad"), row(3, "bad"), row(4, "meh")], proposed: "well fare", why: "Near." } };
  assert.equal(touchUpProblem(withOwn, LIST, own), "Expected a meaning not in the list. Got custom meaning 1's words.");
  // A custom meaning is a row the answer must have.
  assert.equal(touchUpProblem({ meaning: { meanings: [row(1, "bad"), row(2, "bad"), row(3, "bad")], proposed: "x", why: "Near." } }, LIST, own), "Expected one row per meaning (4). Got 3.");
});
