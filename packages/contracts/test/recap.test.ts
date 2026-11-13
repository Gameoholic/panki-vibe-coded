import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionsOf, watchedOf, type RecapStretch } from "../src/recap";

/*
 * A finished video's watch sessions and the parts of it watched (`recap.ts`). Run with `pnpm --dir packages/contracts test`.
 */

const MIN = 60_000;
const day = (at: number) => (at < 1_000 * MIN ? "2026-11-12" : "2026-11-13");
const stretch = (fromMin: number, toMin: number, atMin: number, spentMin = toMin - fromMin): RecapStretch => ({ fromMs: fromMin * MIN, toMs: toMin * MIN, spentMs: spentMin * MIN, at: atMin * MIN });

test("stretches with short pauses between them are one session; a long pause starts another", () => {
  const sessions = sessionsOf([stretch(0, 2, 102), stretch(2, 4, 104), stretch(4, 6, 200), stretch(6, 8, 1_100)], day);
  assert.equal(sessions.length, 3);
  assert.deepEqual(sessions[0], { day: "2026-11-12", startedAt: 100 * MIN, endedAt: 104 * MIN, fromMs: 0, toMs: 4 * MIN });
  assert.deepEqual(sessions[1], { day: "2026-11-12", startedAt: 198 * MIN, endedAt: 200 * MIN, fromMs: 4 * MIN, toMs: 6 * MIN });
  assert.equal(sessions[2]?.day, "2026-11-13");
});

test("a session runs over the video from its earliest moment to its latest, a jump back included", () => {
  const [only] = sessionsOf([stretch(5, 7, 102), stretch(1, 3, 105)], day);
  assert.equal(only?.fromMs, 1 * MIN);
  assert.equal(only?.toMs, 7 * MIN);
});

test("the parts watched are each once, overlapping and touching stretches joined, a part skipped left out", () => {
  const spans = watchedOf([stretch(4, 6, 0), stretch(0, 2, 0), stretch(1, 3, 0), { fromMs: 3 * MIN + 1_000, toMs: 3.5 * MIN }]);
  assert.deepEqual(spans, [
    { fromMs: 0, toMs: 3.5 * MIN },
    { fromMs: 4 * MIN, toMs: 6 * MIN },
  ]);
});
