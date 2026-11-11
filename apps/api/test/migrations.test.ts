import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { migrate } from "../src/db";

/*
 * Migration 53 over a made-up database brought to 52 first: the listening span merged into the front's and its
 * columns dropped, a session left listening said to be on its front, each layout part's `listen` and
 * `listenSubtitles` named `blur` and `blurSubtitles`, and nothing else touched. Run with `pnpm --dir apps/api test`.
 */

const NOW = Date.UTC(2026, 10, 11);
type Row = Record<string, unknown>;

/** A database as migration 52 left it; foreign keys off, so a row needs nothing else to stand on. */
function at52(): DatabaseSync {
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false });
  migrate(db, NOW, 52);
  assert.equal(version(db), 52);
  return db;
}
const version = (db: DatabaseSync) => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
const columnsOf = (db: DatabaseSync, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string; notnull: number; dflt_value: unknown; pk: number }[]);

let n = 0;
/** A row of a table with the values given, every other column that must hold something filled with a made-up one. */
function insert(db: DatabaseSync, table: string, values: Row): void {
  const row: Row = {};
  for (const c of columnsOf(db, table)) {
    if (c.name in values) row[c.name] = values[c.name];
    else if (c.notnull === 1 && c.dflt_value === null) row[c.name] = c.type.toUpperCase().includes("INT") ? ++n : `made-up-${++n}`;
    else if (c.pk === 1 && !c.type.toUpperCase().includes("INT")) row[c.name] = `made-up-${++n}`;
  }
  const names = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${names.map((k) => `"${k}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`).run(...(Object.values(row) as (string | number | null)[]));
}
const all = (db: DatabaseSync, sql: string) => db.prepare(sql).all() as Row[];
const sumOf = (db: DatabaseSync, sql: string) => Number((db.prepare(sql).get() as { n: number | null }).n ?? 0);

/** Parts as they were kept before 53: the old names among keys of every kind, in an order of their own. */
const PARTS = [
  { fieldId: "f1", front: "show", back: "show", listen: "blur", size: "big", listenSubtitles: "show", showOnPlay: null, staged: false },
  { fieldId: "f2", listenSubtitles: "word", front: "show", listen: "hide", back: "show", showOnPlay: 3, subtitles: true },
  // Laid out before Listen first: no old names to rename.
  { fieldId: "f3", front: "hide", back: "show" },
];

function made(): DatabaseSync {
  const db = at52();
  for (const [think, listen] of [
    [1000, 500],
    [2000, null],
    [null, null],
    [null, 300],
    [0, 0],
  ]) {
    insert(db, "card_places", { think_ms: think, listen_ms: listen, decide_ms: 700 });
  }
  insert(db, "card_holds", { think_ms: 100, listen_ms: 50, decide_ms: 9 });
  insert(db, "card_holds", { think_ms: 10, listen_ms: null, decide_ms: 9 });
  for (const phase of ["listen", "front", "back", null, "listen"]) insert(db, "review_sessions", { left_phase: phase, left_shown_ms: 4000 });
  insert(db, "card_types", { id: "laid", layout: JSON.stringify(PARTS), listen: JSON.stringify({ on: true }) });
  insert(db, "card_types", { id: "bare", layout: "[]", listen: null });
  insert(db, "card_types", { id: "broken", layout: "not a layout", listen: JSON.stringify({ on: false }) });
  return db;
}

test("53 merges each listening span into its front's, row by row, and drops the column", () => {
  const db = made();
  const before = all(db, "SELECT id, think_ms AS think, decide_ms AS decide, at, card_id AS cardId FROM card_places ORDER BY id");
  const frontBefore = sumOf(db, "SELECT SUM(COALESCE(think_ms, 0) + COALESCE(listen_ms, 0)) AS n FROM card_places");
  const holdsBefore = sumOf(db, "SELECT SUM(COALESCE(think_ms, 0) + COALESCE(listen_ms, 0)) AS n FROM card_holds");
  migrate(db, NOW);
  assert.equal(version(db), 53);
  for (const table of ["card_places", "card_holds"]) assert.ok(!columnsOf(db, table).some((c) => c.name === "listen_ms"), `${table}.listen_ms is gone`);
  const after = all(db, "SELECT id, think_ms AS think, decide_ms AS decide, at, card_id AS cardId FROM card_places ORDER BY id");
  assert.equal(after.length, before.length);
  assert.deepEqual(
    after.map((r) => r.think),
    [1500, 2000, null, 300, 0],
  );
  // Everything but the front's time as it was.
  assert.deepEqual(
    after.map(({ think: _, ...rest }) => rest),
    before.map(({ think: _, ...rest }) => rest),
  );
  assert.equal(sumOf(db, "SELECT SUM(think_ms) AS n FROM card_places"), frontBefore);
  assert.equal(sumOf(db, "SELECT SUM(think_ms) AS n FROM card_holds"), holdsBefore);
  assert.deepEqual(
    all(db, "SELECT think_ms AS think FROM card_holds ORDER BY id").map((r) => r.think),
    [150, 10],
  );
});

test("53 says a session left while listening was on its front, and leaves the rest", () => {
  const db = made();
  const before = all(db, "SELECT id, left_shown_ms AS shown FROM review_sessions ORDER BY rowid");
  migrate(db, NOW);
  assert.deepEqual(
    all(db, "SELECT left_phase AS phase FROM review_sessions ORDER BY rowid").map((r) => r.phase),
    ["front", "front", "back", null, "front"],
  );
  assert.deepEqual(all(db, "SELECT id, left_shown_ms AS shown FROM review_sessions ORDER BY rowid"), before);
});

test("53 names each part's blurred front blur, its values, keys and order otherwise as they were, and drops Listen first", () => {
  const db = made();
  const typesBefore = all(db, "SELECT id, name, created_at AS createdAt FROM card_types ORDER BY rowid");
  migrate(db, NOW);
  assert.ok(!columnsOf(db, "card_types").some((c) => c.name === "listen"), "card_types.listen is gone");
  assert.deepEqual(all(db, "SELECT id, name, created_at AS createdAt FROM card_types ORDER BY rowid"), typesBefore);
  const layout = (id: string) => (db.prepare("SELECT layout FROM card_types WHERE id = ?").get(id) as { layout: string }).layout;
  const parts = JSON.parse(layout("laid")) as Row[];
  assert.equal(parts.length, PARTS.length);
  parts.forEach((part, i) => {
    const was = PARTS[i] as Row;
    assert.ok(!("listen" in part) && !("listenSubtitles" in part));
    assert.equal(part.blur, was.listen);
    assert.equal(part.blurSubtitles, was.listenSubtitles);
    // Renamed back, it's exactly what was kept, key for key and in its order.
    const back = Object.fromEntries(Object.entries(part).map(([k, v]) => [k === "blur" ? "listen" : k === "blurSubtitles" ? "listenSubtitles" : k, v]));
    assert.equal(JSON.stringify(back), JSON.stringify(was));
  });
  assert.equal(layout("bare"), "[]");
  assert.equal(layout("broken"), "not a layout");
});

test("53 runs once: a database brought up to date stays as it is", () => {
  const db = made();
  migrate(db, NOW);
  const once = all(db, "SELECT think_ms AS think FROM card_places ORDER BY id");
  migrate(db, NOW);
  assert.equal(version(db), 53);
  assert.deepEqual(all(db, "SELECT think_ms AS think FROM card_places ORDER BY id"), once);
});
