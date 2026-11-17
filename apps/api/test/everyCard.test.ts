import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { CardField, NewCardType } from "@panki/contracts";
import { openDb } from "../src/db";

/*
 * Every card of every deck, as searching every deck reads them (`db.ts` → `everyCard`, `GET /api/cards`), over a
 * made-up account in a folder of its own. Run with `pnpm --dir apps/api test`.
 */

const NOW = Date.UTC(2026, 10, 17);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [TYPE, WORD, SENTENCE, DECK_A, DECK_B, GONE] = [1, 2, 3, 4, 5, 6].map(id) as [string, string, string, string, string, string];
const field = (fieldId: string, perExample: boolean): CardField => ({ id: fieldId, name: fieldId, kind: "text", side: "front", required: false, tellsApart: false, perExample, fills: null });
// A field that goes with an example: a deck's own list pins the example a review shows; searching must not.
const TYPE_MADE: NewCardType = { id: TYPE, name: "Words", fields: [field(WORD, false), field(SENTENCE, true)] };

/** An account of its own, thrown away after. */
function withDb(run: (db: ReturnType<typeof openDb>) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "panki-every-card-"));
  const db = openDb(dir, () => NOW, "UTC");
  try {
    run(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("every living card, deck by deck in the order they were made, a deleted deck's left out", () => {
  withDb((db) => {
    db.insertType(TYPE_MADE, NOW);
    const srs = db.listSrsTypes()[0];
    assert.ok(srs, "An account starts with an SRS type.");
    db.insertDeck({ id: DECK_A, name: "A", typeId: TYPE, srsTypeId: srs.id }, NOW);
    db.insertDeck({ id: DECK_B, name: "B", typeId: TYPE, srsTypeId: srs.id }, NOW + 1);
    db.insertDeck({ id: GONE, name: "Gone", typeId: TYPE, srsTypeId: srs.id }, NOW + 2);
    db.insertCard(DECK_A, { id: id(10), values: { [WORD]: "行く", [SENTENCE]: "駅まで行く。" } }, NOW);
    db.insertCard(DECK_B, { id: id(11), values: { [WORD]: "食べる" } }, NOW);
    db.insertCard(DECK_B, { id: id(12), values: { [WORD]: "飲む" } }, NOW + 1);
    db.insertCard(GONE, { id: id(13), values: { [WORD]: "見る" } }, NOW);
    db.removeCard(DECK_B, id(12), NOW + 2);
    db.removeDeck(GONE, NOW + 3);
    const every = db.everyCard(NOW + 4);
    assert.deepEqual(
      every.map((deck) => ({ deckId: deck.deckId, cards: deck.cards.map((card) => card.values[WORD]) })),
      [
        { deckId: DECK_A, cards: ["行く"] },
        { deckId: DECK_B, cards: ["食べる"] },
      ],
    );
  });
});

test("reading every card pins no example, as a deck's own list does", () => {
  withDb((db) => {
    db.insertType(TYPE_MADE, NOW);
    const srs = db.listSrsTypes()[0];
    assert.ok(srs);
    db.insertDeck({ id: DECK_A, name: "A", typeId: TYPE, srsTypeId: srs.id }, NOW);
    db.insertCard(DECK_A, { id: id(10), values: { [WORD]: "行く", [SENTENCE]: "駅まで行く。" } }, NOW);
    const added = db.insertExample(DECK_A, id(10), { id: id(20), values: { [SENTENCE]: "学校に行く。" } }, NOW);
    assert.notEqual(typeof added, "string");
    const read = db.everyCard(NOW).flatMap((deck) => deck.cards);
    assert.equal(read.length, 1);
    assert.equal(read[0]?.shownExample ?? null, null);
  });
});
