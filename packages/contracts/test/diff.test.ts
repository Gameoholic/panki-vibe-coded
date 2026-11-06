import assert from "node:assert/strict";
import { test } from "node:test";
import { diffTokensOf, textDiff, type DiffRun } from "../src/diff";

/*
 * A text field's proposal as a diff (`diff.ts`). Run with `pnpm --dir packages/contracts test`.
 */

const shown = (runs: DiffRun[] | null) => runs?.map((run) => `${run.kind === "keep" ? "" : run.kind === "drop" ? "-" : "+"}[${run.text}]`).join("") ?? null;
/** Kept and added joined are always the new text. */
const after = (runs: DiffRun[]) =>
  runs
    .filter((run) => run.kind !== "drop")
    .map((run) => run.text)
    .join("");

test("tokens: English by word, Japanese by character, spaces and punctuation alone, nothing lost", () => {
  assert.deepEqual(diffTokensOf("I don't  know."), ["I", " ", "don", "'", "t", "  ", "know", "."]);
  assert.deepEqual(diffTokensOf("東京へ行きます。"), ["東", "京", "へ", "行", "き", "ま", "す", "。"]);
  assert.deepEqual(diffTokensOf("café 2024年"), ["café", " ", "2024", "年"]);
  const text = "Mixed テキスト with 漢字, numbers 42!";
  assert.equal(diffTokensOf(text).join(""), text);
});

test("a changed English word is one word struck and one added", () => {
  const runs = textDiff("the big dog barked", "the small dog barked");
  assert.equal(shown(runs), "[the ]-[big]+[small][ dog barked]");
  assert.equal(after(runs ?? []), "the small dog barked");
});

test("a changed phrase is one struck phrase and one added, the space between joined", () => {
  const runs = textDiff("it was a very big red dog today", "it was a rather small red dog today");
  assert.equal(shown(runs), "[it was a ]-[very big]+[rather small][ red dog today]");
});

test("Japanese differs by character", () => {
  const runs = textDiff("東京へ行きました。", "東京に行きました。");
  assert.equal(shown(runs), "[東京]-[へ]+[に][行きました。]");
});

test("an added word stands with its space, never a lone marked space", () => {
  const runs = textDiff("a dog", "a brown dog");
  assert.ok(runs);
  assert.equal(after(runs), "a brown dog");
  assert.ok(runs.every((run) => run.kind === "keep" || run.text.trim() !== ""));
  assert.ok(runs.some((run) => run.kind === "add" && run.text.includes("brown")));
});

test("only whitespace changed draws no mark", () => {
  const runs = textDiff("a  dog", "a dog");
  assert.ok(runs);
  assert.ok(runs.every((run) => run.kind === "keep"));
  assert.equal(after(runs), "a dog");
});

test("a rewrite keeping under a third falls back to two blocks", () => {
  assert.equal(textDiff("The cat sat on the mat quietly.", "A completely different sentence about birds."), null);
});

test("the same text is all kept; an empty one filled is all added", () => {
  assert.equal(shown(textDiff("same words", "same words")), "[same words]");
  assert.equal(shown(textDiff("", "new")), "+[new]");
});

test("text taken away at the end is struck, the rest kept", () => {
  assert.equal(shown(textDiff("彼は走った、速く。", "彼は走った。")), "[彼は走った]-[、速く][。]");
});
