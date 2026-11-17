import assert from "node:assert/strict";
import { test } from "node:test";
import { lineLocked } from "../src/card";
import { ROLES, cleanMap, mapOf, roleOf, valuesFor, withMap, withRole } from "../src/roles";
import { NewCardType, ROLE_IDS, type CardField, type RoleId } from "../src/type";

/*
 * The Field mapping on the card type (`roles.ts`): what each field keeps, read back as a map held to what fits, written
 * onto the fields, and whether a type has one of its own. Run with `pnpm --dir packages/contracts test`.
 */

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const [WORD, LINE, MEANING, CLIP, EXAMPLES, NOTE] = [1, 2, 3, 4, 5, 6].map(id) as [string, string, string, string, string, string];
const field = (fieldId: string, kind: CardField["kind"], fills: RoleId | null = null): CardField => ({
  id: fieldId,
  name: fieldId,
  kind,
  side: "front",
  required: false,
  tellsApart: false,
  perExample: false,
  fills,
});

test("a type's map is what its fields keep, held to what each kind takes", () => {
  const fields = [field(WORD, "text", "word"), field(LINE, "line", "sentence"), field(MEANING, "text", "dictMeaning"), field(CLIP, "media", "clip"), field(EXAMPLES, "examples", "explanation"), field(NOTE, "text", "clip")];
  assert.deepEqual(mapOf({ fields }), { word: WORD, dictMeaning: MEANING, clip: CLIP, sentence: LINE });
});

test("every field starts at None, a Line and Example sentences too, and each can be mapped and set back to None", () => {
  const fields = [field(WORD, "text"), field(LINE, "line"), field(EXAMPLES, "examples")];
  assert.deepEqual(mapOf({ fields }), {});
  const mapped = withMap(fields, withRole(withRole({}, LINE, "sentence"), EXAMPLES, "examples"));
  assert.deepEqual(mapOf({ fields: mapped }), { sentence: LINE, examples: EXAMPLES });
  const back = withMap(mapped, withRole(withRole(mapOf({ fields: mapped }), LINE, null), EXAMPLES, null));
  assert.deepEqual(mapOf({ fields: back }), {});
  assert.ok(back.every((f) => f.fills === null));
});

test("a Line takes the Line or nothing, Example sentences their rows or nothing; the Line also goes in any field of words", () => {
  const line = field(LINE, "line");
  const examples = field(EXAMPLES, "examples");
  const text = field(WORD, "text");
  assert.deepEqual(
    ROLE_IDS.filter((role) => ROLES[role].takes(line)),
    ["sentence"],
  );
  assert.deepEqual(
    ROLE_IDS.filter((role) => ROLES[role].takes(examples)),
    ["examples"],
  );
  assert.equal(ROLES.sentence.takes(text), true);
  assert.equal(ROLES.examples.takes(text), false);
});

test("the deck's read-only Line is the field the mapping fills with it, on a card from a video", () => {
  assert.equal(lineLocked({ id: LINE }, { fromVideo: true }, { sentence: LINE }), true);
  assert.equal(lineLocked({ id: LINE }, { fromVideo: true }, {}), false);
  assert.equal(lineLocked({ id: LINE }, { fromVideo: false }, { sentence: LINE }), false);
  assert.equal(lineLocked({ id: NOTE }, { fromVideo: true }, { sentence: NOTE }), true);
});

test("a piece kept on two fields goes to the first", () => {
  const fields = [field(WORD, "text", "word"), field(NOTE, "text", "word")];
  assert.deepEqual(mapOf({ fields }), { word: WORD });
});

test("written onto the fields and read back, a map is the same; a piece given to another field leaves the first", () => {
  const fields = [field(WORD, "text"), field(MEANING, "text"), field(CLIP, "media"), field(LINE, "line")];
  const map = withRole(withRole(withRole({}, WORD, "word"), MEANING, "dictMeaning"), CLIP, "clip");
  const written = withMap(fields, cleanMap(map, { fields }));
  assert.deepEqual(mapOf({ fields: written }), cleanMap(map, { fields }));
  assert.equal(written.find((f) => f.id === LINE)?.fills, null);
  const moved = withMap(written, withRole(mapOf({ fields: written }), MEANING, "word"));
  assert.equal(roleOf(mapOf({ fields: moved }), MEANING), "word");
  assert.equal(roleOf(mapOf({ fields: moved }), WORD), null);
});

test("a field's kept piece that's no longer one reads as none, and a type refuses a piece on two fields", () => {
  const read = NewCardType.parse({ id: id(9), name: "T", fields: [{ ...field(WORD, "text"), fills: "reading" }] });
  assert.equal(read.fields[0]?.fills, null);
  const twice = NewCardType.safeParse({ id: id(9), name: "T", fields: [field(WORD, "text", "word"), field(NOTE, "text", "word")] });
  assert.equal(twice.success, false);
});

test("a card's values: a piece's words where a field takes one, what's typed where it takes none or only Panki AI fills it", () => {
  const fields = [field(WORD, "text", "word"), field(MEANING, "text"), field(NOTE, "text", "explanation"), field(CLIP, "media", "clip")];
  const type = { fields };
  const values = valuesFor(type, mapOf(type), { word: " 探す " }, { [MEANING]: "to look for", [NOTE]: "Panki AI's", [WORD]: "typed over", [CLIP]: "not a clip" });
  assert.deepEqual(values, { [WORD]: "探す", [MEANING]: "to look for", [NOTE]: "Panki AI's" });
});
