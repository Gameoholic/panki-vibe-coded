// Temporary: the prompt trial, removed whole once the owner picks (aiActions.ts → the key above TRIAL_ACTIONS).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { trialResultsOf } from "@panki/contracts";
import { openDb } from "../src/db";

/*
 * The blind trial as an account keeps it (`promptTrial.ts`, temporary): each use and each rating rows of the ledger, the
 * counts the next pick evens out, and the results read back. Run with `pnpm --dir apps/api test`.
 */

const NOW = Date.UTC(2026, 10, 21);

/** An account of its own, thrown away after. */
function withDb(run: (db: ReturnType<typeof openDb>) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "panki-prompt-trial-"));
  const db = openDb(dir, () => NOW, "UTC");
  try {
    run(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("each answer that went with the trial is a use; the counts are each wording's uses", () => {
  withDb((db) => {
    const trial = db.promptTrial;
    assert.deepEqual(trial.counts(), {});
    const first = trial.keepUse({ explain: "explainPebble" }, NOW);
    trial.keepUse({ explain: "explainPebble", explainContext: "contextKettle" }, NOW + 1);
    assert.ok(first > 0);
    assert.deepEqual(trial.counts(), { explainPebble: 2, contextKettle: 1 });
  });
});

test("a rating names a use; the latest stands, taken back is none; a use that isn't there takes none", () => {
  withDb((db) => {
    const trial = db.promptTrial;
    const use = trial.keepUse({ explain: "explainWalrus" }, NOW);
    assert.equal(trial.rate(use, "up", NOW), true);
    assert.equal(trial.rate(use, "down", NOW + 1), true);
    assert.equal(trial.rate(use + 100, "up", NOW), false);
    let walrus = trialResultsOf(trial.uses(), trial.ratings()).sets[0]?.rows.find((row) => row.codename === "Walrus");
    assert.deepEqual(walrus, { codename: "Walrus", used: 1, up: 0, down: 1 });
    trial.rate(use, null, NOW + 2);
    walrus = trialResultsOf(trial.uses(), trial.ratings()).sets[0]?.rows.find((row) => row.codename === "Walrus");
    assert.deepEqual(walrus, { codename: "Walrus", used: 1, up: 0, down: 0 });
  });
});

test("Clear results starts the trial over: counts and results from nothing, a use from before can't be rated, nothing deleted", () => {
  withDb((db) => {
    const trial = db.promptTrial;
    const old = trial.keepUse({ explain: "explainTeapot" }, NOW);
    trial.rate(old, "up", NOW);
    trial.clear(NOW + 1);
    assert.deepEqual(trial.counts(), {});
    assert.deepEqual(trial.uses(), []);
    assert.deepEqual(trial.ratings(), []);
    assert.ok(trialResultsOf(trial.uses(), trial.ratings()).sets.every((set) => set.rows.every((row) => row.used === 0 && row.up === 0 && row.down === 0)));
    // A thumb under an answer from before the clear is ignored.
    assert.equal(trial.rate(old, "down", NOW + 2), false);
    // What comes after counts, and a later clear starts over again from there.
    const fresh = trial.keepUse({ explain: "explainTeapot" }, NOW + 3);
    assert.equal(trial.rate(fresh, "up", NOW + 4), true);
    let teapot = trialResultsOf(trial.uses(), trial.ratings()).sets[0]?.rows.find((row) => row.codename === "Teapot");
    assert.deepEqual(teapot, { codename: "Teapot", used: 1, up: 1, down: 0 });
    assert.deepEqual(trial.counts(), { explainTeapot: 1 });
    trial.clear(NOW + 5);
    teapot = trialResultsOf(trial.uses(), trial.ratings()).sets[0]?.rows.find((row) => row.codename === "Teapot");
    assert.deepEqual(teapot, { codename: "Teapot", used: 0, up: 0, down: 0 });
  });
});

test("the trial's rows are the ledger's alone to read: the browser's events never count as uses", () => {
  withDb((db) => {
    db.insertEvents([{ kind: "screen", at: NOW, path: "/" }], { sessionId: "s", device: "d" }, NOW);
    assert.deepEqual(db.promptTrial.uses(), []);
  });
});
