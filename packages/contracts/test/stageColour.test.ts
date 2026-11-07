import assert from "node:assert/strict";
import { test } from "node:test";
import { NEW_PLACE, BURNED_PLACE, SrsType } from "../src/srs";
import { makeStarter } from "../src/srsStarters";
import { BURNED_COLOUR, STAGE_RAMP, newColourOf, placeColour, rampColour, stageColourAt } from "../src/stageColour";

/*
 * A stage's colour (`stageColour.ts`) and Panki Default's ladder. Run with `pnpm --dir packages/contracts test`.
 */

let n = 0;
const mint = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

test("the ramp runs from its first colour to its last, through the middle one", () => {
  assert.equal(rampColour(0, 9), STAGE_RAMP[0]);
  assert.equal(rampColour(4, 9), STAGE_RAMP[1]);
  assert.equal(rampColour(8, 9), STAGE_RAMP[2]);
  assert.equal(rampColour(0, 1), STAGE_RAMP[0]);
  assert.match(rampColour(2, 9), /^#[0-9a-f]{6}$/);
});

test("Panki Default: its stages' names, one green per kind, its key unchanged", () => {
  const type = makeStarter("wanikaniPlus", mint);
  assert.equal(type.name, "Panki Default");
  assert.deepEqual(
    type.stages.map((s) => s.name),
    ["Learning 1", "Learning 2", "Learning 3", "Learning 4", "Familiar 1", "Familiar 2", "Strong 1", "Strong 2"],
  );
  assert.deepEqual(
    type.stages.map((_, i) => stageColourAt(type, i)),
    [0, 0, 0, 0, 1, 1, 2, 2].map((k) => STAGE_RAMP[k]),
  );
});

test("brought up to date, Panki Default keeps every stage id in its place", () => {
  const made = makeStarter("wanikaniPlus", mint);
  const again = makeStarter("wanikaniPlus", mint, { id: made.id, stageIds: made.stages.map((s) => s.id), answers: made.answers });
  assert.deepEqual(
    again.stages.map((s) => s.id),
    made.stages.map((s) => s.id),
  );
});

test("a stage's own colour wins; a place is its stage's, grey burned, none new", () => {
  const type = SrsType.parse({ ...makeStarter("anki", mint), createdAt: 0, builtin: false, deckCount: 0, cardCounts: {} });
  const first = type.stages[0];
  assert.ok(first);
  assert.equal(stageColourAt(type, 0), STAGE_RAMP[0]);
  const own = { ...type, stages: type.stages.map((s, i) => (i === 0 ? { ...s, colour: "#123456" } : s)) };
  assert.equal(stageColourAt(own, 0), "#123456");
  assert.equal(placeColour(own, { stageId: first.id, past: 0, node: [], burned: false }), "#123456");
  assert.equal(placeColour(own, NEW_PLACE), null);
  assert.equal(placeColour(own, BURNED_PLACE), BURNED_COLOUR);
});

test("New's colour is the type's own, none without one; it never reaches a stage", () => {
  const type = SrsType.parse({ ...makeStarter("anki", mint), createdAt: 0, builtin: false, deckCount: 0, cardCounts: {} });
  assert.equal(newColourOf(type), null);
  const coloured = SrsType.parse({ ...type, newColour: "#AABBCC" });
  assert.equal(newColourOf(coloured), "#aabbcc");
  assert.equal(placeColour(coloured, NEW_PLACE), "#aabbcc");
  assert.equal(placeColour(coloured, { ...NEW_PLACE, node: [type.answers[0]?.id ?? ""] }), "#aabbcc");
  assert.equal(placeColour(coloured, BURNED_PLACE), BURNED_COLOUR);
  assert.equal(stageColourAt(coloured, 0), STAGE_RAMP[0]);
  assert.equal(SrsType.safeParse({ ...type, newColour: "blue" }).success, false);
});
