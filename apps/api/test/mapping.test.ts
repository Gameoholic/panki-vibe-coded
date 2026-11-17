import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { mapOf, type CardField, type NewCardType } from "@panki/contracts";
import { openDb } from "../src/db";

/*
 * A card type's Field mapping kept on its fields, set by hand in the card type editor and saved with the type, over a
 * made-up account in a folder of its own. Run with `pnpm --dir apps/api test`.
 */

const NOW = Date.UTC(2026, 10, 17);
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const [TYPE, WORD, LINE, MEANING, NOTE] = [1, 2, 3, 4, 5].map(id) as [string, string, string, string, string];
const field = (fieldId: string, kind: CardField["kind"], fills: CardField["fills"] = null): CardField => ({ id: fieldId, name: fieldId, kind, side: "front", required: false, tellsApart: false, perExample: false, fills });
const TYPE_MADE: NewCardType = { id: TYPE, name: "Words", fields: [field(WORD, "text"), field(LINE, "line"), field(MEANING, "text"), field(NOTE, "text")] };

/** An account of its own, thrown away after. */
function withDb(run: (db: ReturnType<typeof openDb>) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "panki-mapping-"));
  const db = openDb(dir, () => NOW, "UTC");
  try {
    run(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a type's save keeps what fills each field, and reads it back", () => {
  withDb((db) => {
    db.insertType(TYPE_MADE, NOW);
    const saved = db.updateType(TYPE, { name: "Words", fields: [field(WORD, "text", "word"), field(LINE, "line", "sentence"), field(MEANING, "text", "dictMeaning"), field(NOTE, "text")] }, NOW);
    assert.deepEqual(mapOf(saved), { word: WORD, sentence: LINE, dictMeaning: MEANING });
    assert.deepEqual(mapOf(db.getType(TYPE) ?? saved), { word: WORD, sentence: LINE, dictMeaning: MEANING });
  });
});

test("a type starts with every field on None, its Line taking the sentence whatever's set", () => {
  withDb((db) => {
    const made = db.insertType(TYPE_MADE, NOW);
    assert.ok(made.fields.every((f) => f.fills === null));
    assert.deepEqual(mapOf(made), { sentence: LINE });
  });
});
