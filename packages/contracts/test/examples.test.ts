import assert from "node:assert/strict";
import { test } from "node:test";
import { columnOrder, defaultLayout, examplesAt, examplesOn, examplesPlaceOf, examplesToColumn, moveInColumn } from "../src/cardLayout";
import { EXAMPLES_SLOT, type LayoutPart } from "../src/layout";
import type { CardField } from "../src/type";

/*
 * Where a card's example arrows stand (`cardLayout.ts`). Run with `pnpm --dir packages/contracts test`.
 */

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const [WORD, SENTENCE, CLIP, MEANING, NOTE] = [1, 2, 3, 4, 5].map(id) as [string, string, string, string, string];
const field = (fieldId: string, kind: CardField["kind"], side: CardField["side"], perExample = false): CardField => ({
  id: fieldId,
  name: fieldId,
  kind,
  side,
  required: false,
  tellsApart: false,
  perExample,
});
const fields = [field(WORD, "text", "front"), field(SENTENCE, "text", "front", true), field(CLIP, "media", "front", true), field(MEANING, "text", "back"), field(NOTE, "text", "back")];
/** The word, the sentence and the meaning in the main column, the clip in the side one. */
const layout: LayoutPart[] = defaultLayout(fields).map((p) => (p.fieldId === CLIP ? { ...p, column: "side" } : p));
/** A column's order with the arrows named, to read at a glance. */
const ids = (order: string[]) => order.map((x) => (x === EXAMPLES_SLOT ? "arrows" : x));

test("nobody laid them out: right after the example's last part the front shows, in its column", () => {
  assert.deepEqual(examplesAt(layout, fields, null), { column: "side", after: CLIP });
  const backOnlyClip = layout.map((p) => (p.fieldId === CLIP ? { ...p, front: "hide" as const } : p));
  assert.deepEqual(examplesAt(backOnlyClip, fields, null), { column: "main", after: SENTENCE });
  assert.equal(examplesAt(layout, fields.map((f) => ({ ...f, perExample: false })), null), null);
});

test("on the front only while a part of the example shows there; always on the back", () => {
  const backOnly = layout.map((p) => (p.fieldId === CLIP || p.fieldId === SENTENCE ? { ...p, front: "hide" as const } : p));
  assert.equal(examplesOn(layout, fields, "front"), true);
  assert.equal(examplesOn(backOnly, fields, "front"), false);
  assert.equal(examplesOn(backOnly, fields, "back"), true);
});

test("a column's order holds the arrows where they stand", () => {
  assert.deepEqual(ids(columnOrder(layout, fields, "back", "side", null)), [CLIP, "arrows"]);
  assert.deepEqual(ids(columnOrder(layout, fields, "back", "main", null)), [WORD, SENTENCE, MEANING, NOTE]);
  assert.deepEqual(ids(columnOrder(layout, fields, "back", "main", { column: "main", after: SENTENCE })), [WORD, SENTENCE, "arrows", MEANING, NOTE]);
  assert.deepEqual(ids(columnOrder(layout, fields, "back", "main", { column: "main", after: null })), ["arrows", WORD, SENTENCE, MEANING, NOTE]);
  // After a part of the other column: under whatever stands above it in this one.
  assert.deepEqual(ids(columnOrder(layout, fields, "back", "main", { column: "main", after: CLIP })), [WORD, SENTENCE, "arrows", MEANING, NOTE]);
});

test("never splits a row", () => {
  const row = layout.map((p) => (p.fieldId === NOTE ? { ...p, beside: true } : p));
  assert.deepEqual(ids(columnOrder(row, fields, "back", "main", { column: "main", after: MEANING })), [WORD, SENTENCE, MEANING, NOTE, "arrows"]);
});

test("the arrows dragged in their column stand after what's before them", () => {
  const place = { column: "main" as const, after: SENTENCE };
  // [WORD, SENTENCE, arrows, MEANING, NOTE]: the arrows to the end, then to the top.
  assert.deepEqual(moveInColumn(layout, fields, "back", "main", place, 2, 4).examples, { column: "main", after: NOTE });
  assert.deepEqual(moveInColumn(layout, fields, "back", "main", place, 2, 0).examples, { column: "main", after: null });
  // Nobody laid them out, and they're dragged: they're laid out from then on.
  const moved = moveInColumn(layout, fields, "back", "side", null, 1, 0);
  assert.deepEqual(moved.examples, { column: "side", after: SENTENCE });
  assert.deepEqual(ids(columnOrder(moved.layout, fields, "back", "side", moved.examples)), ["arrows", CLIP]);
});

test("a part dragged leaves the arrows where they're seen, and past them alone moves nothing", () => {
  const place = { column: "main" as const, after: SENTENCE };
  // The word dragged to the meaning's place: [SENTENCE, arrows, MEANING, WORD, NOTE].
  const down = moveInColumn(layout, fields, "back", "main", place, 0, 3);
  assert.deepEqual(ids(columnOrder(down.layout, fields, "back", "main", down.examples)), [SENTENCE, "arrows", MEANING, WORD, NOTE]);
  // The sentence dragged onto the arrows: only the arrows move, up before it.
  const past = moveInColumn(layout, fields, "back", "main", place, 1, 2);
  assert.deepEqual(past.layout, layout);
  assert.deepEqual(ids(columnOrder(past.layout, fields, "back", "main", past.examples)), [WORD, "arrows", SENTENCE, MEANING, NOTE]);
  // Nobody laid them out: they follow the example as a part moves.
  const followed = moveInColumn(layout, fields, "back", "main", null, 1, 0);
  assert.equal(followed.examples, null);
});

test("moved to the other column, and read back from what's kept", () => {
  assert.deepEqual(examplesToColumn(layout, fields, null, "main"), { column: "main", after: CLIP });
  assert.equal(examplesPlaceOf(null, fields), null);
  assert.equal(examplesPlaceOf({ shown: true, size: "normal", corner: "top-left" }, fields), null);
  assert.deepEqual(examplesPlaceOf({ examples: { column: "side", after: WORD } }, fields), { column: "side", after: WORD });
  assert.equal(examplesPlaceOf({ examples: { column: "side", after: id(9) } }, fields), null);
  assert.equal(examplesPlaceOf({ examples: { column: "nowhere", after: WORD } }, fields), null);
});
