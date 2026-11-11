import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { CARD_TIME_MAX_MS, NO_PACE } from "@panki/contracts";
import { clipReader } from "../src/clips";
import { CLIP_MIN, clipFitOf, paceFor, pacesOf, type PaceAnswer } from "../src/pace";
import { NO_TODAY, backtest, type ReplayAnswer } from "../src/paceBacktest";

/*
 * A deck's pace from its answers (`pace.ts`), a card's clips as it reads them (`clips.ts`), and the backtest of the
 * time left worked out from them (`paceBacktest.ts`). Run with `pnpm --dir apps/api test`.
 */

const H = 3_600_000;
const D = 24 * H;
const DAY1 = Date.UTC(2026, 10, 2);
const at = (day: number, hour: number) => DAY1 + (day - 1) * D + hour * H;
const dayOf = (instant: number) => new Date(instant).toISOString().slice(0, 10);
const answer = (cardId: string, instant: number, ms: number, over: Partial<PaceAnswer> = {}): PaceAnswer => ({
  cardId,
  deckId: "deck",
  at: instant,
  start: false,
  thinkMs: ms / 2,
  decideMs: ms / 2,
  clipMs: null,
  ...over,
});
const NO_CLIPS = { clipMsPerS: null, clipMeanMs: null };

test("a new card's day is every showing of it that day, a review's likewise; a showing after a day's first is an asked-again one", () => {
  const { byDeck } = pacesOf(
    [
      answer("a", at(1, 9), 20_000, { start: true }),
      answer("a", at(1, 9.1), 10_000),
      answer("b", at(1, 9.2), 6_000),
      answer("c", at(1, 9.3), 8_000),
      answer("c", at(1, 9.4), 4_000),
    ],
    dayOf,
  );
  assert.deepEqual(byDeck.get("deck"), { newMs: 30_000, reviewMs: 9_000, showingMs: 9_600, againMs: 7_000, ...NO_CLIPS });
});

test("the same card on another day is another run, a review once it's started", () => {
  const { byDeck } = pacesOf([answer("a", at(1, 9), 20_000, { start: true }), answer("a", at(2, 9), 8_000)], dayOf);
  assert.deepEqual(byDeck.get("deck"), { newMs: 20_000, reviewMs: 8_000, showingMs: 14_000, againMs: null, ...NO_CLIPS });
});

test("a showing is at most CARD_TIME_MAX_MS, and a run with one unmeasured counts for nothing", () => {
  const { byDeck } = pacesOf(
    [answer("a", at(1, 9), CARD_TIME_MAX_MS * 3), answer("b", at(1, 9), 6_000), answer("b", at(1, 10), 0, { thinkMs: null })],
    dayOf,
  );
  assert.deepEqual(byDeck.get("deck"), { newMs: null, reviewMs: CARD_TIME_MAX_MS, showingMs: CARD_TIME_MAX_MS, againMs: null, ...NO_CLIPS });
});

test("a deck without a kind of run takes the account's; a deck with no answers is the account's whole", () => {
  const paces = pacesOf([answer("a", at(1, 9), 20_000, { start: true, deckId: "other" }), answer("b", at(1, 9), 6_000)], dayOf);
  assert.deepEqual(paceFor(paces, "deck"), { newMs: 20_000, reviewMs: 6_000, showingMs: 6_000, againMs: null, ...NO_CLIPS });
  assert.deepEqual(paceFor(paces, "empty"), { newMs: 20_000, reviewMs: 6_000, showingMs: 13_000, againMs: null, ...NO_CLIPS });
  assert.deepEqual(paceFor(null, "deck"), NO_PACE);
});

/** CLIP_MIN showings whose front takes 2 s plus its clip once over, clips of 0 to 9 s. */
const clipped = (deckId = "deck") =>
  Array.from({ length: CLIP_MIN }, (_, i) => answer(`${deckId}${i}`, at(1, 9 + i / 60), 0, { deckId, thinkMs: 2_000 + 1_000 * i, decideMs: 3_000, clipMs: 1_000 * i }));

test("the front's stretch is its own time against its clips, never below 0, and only from enough showings with a spread", () => {
  assert.deepEqual(clipFitOf(clipped()), { clipMsPerS: 1_000, clipMeanMs: 4_500 });
  assert.deepEqual(clipFitOf(clipped().slice(1)), NO_CLIPS);
  assert.deepEqual(clipFitOf(clipped().map((a) => ({ ...a, clipMs: 3_000 }))), NO_CLIPS);
  assert.deepEqual(clipFitOf(clipped().map((a, i) => ({ ...a, thinkMs: 20_000 - 1_000 * i }))), { clipMsPerS: 0, clipMeanMs: 4_500 });
});

test("a deck with too few clipped showings takes the account's stretch, its clips and its share together", () => {
  const paces = pacesOf([...clipped("other"), answer("x", at(1, 9), 6_000, { clipMs: 9_000 })], dayOf);
  assert.equal(paceFor(paces, "other").clipMsPerS, 1_000);
  assert.notEqual(paces.all.clipMsPerS, null);
  assert.deepEqual([paceFor(paces, "deck").clipMsPerS, paceFor(paces, "deck").clipMeanMs], [paces.all.clipMsPerS, paces.all.clipMeanMs]);
});

test("a card's clips: the front's lengths summed, a sound or the word's own cut no part of them, an example's own clip in place of the card's", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE card_fields (id TEXT, side TEXT, kind TEXT, removed_at INTEGER);
    CREATE TABLE card_values (card_id TEXT, field_id TEXT, value TEXT);
    CREATE TABLE card_example_values (example_id TEXT, field_id TEXT, value TEXT);
    CREATE TABLE media (id TEXT, kind TEXT);
    CREATE TABLE media_recordings (media_id TEXT, cut TEXT, start_ms INTEGER, end_ms INTEGER);
    CREATE TABLE card_sources (card_id TEXT, start_ms INTEGER, end_ms INTEGER, capture TEXT);
    CREATE TABLE card_examples (id TEXT, start_ms INTEGER, end_ms INTEGER, capture TEXT);
    INSERT INTO card_fields VALUES ('clip', 'front', 'media', NULL), ('clip2', 'front', 'media', NULL), ('sound', 'front', 'media', NULL), ('word', 'front', 'media', NULL), ('back', 'back', 'media', NULL), ('text', 'front', 'text', NULL);
    INSERT INTO media VALUES ('v1', 'video'), ('v2', 'video'), ('a1', 'audio'), ('w1', 'video'), ('v3', 'video'), ('e1', 'video');
    INSERT INTO media_recordings VALUES ('v1', 'clip', 10000, 13000), ('w1', 'word', 11000, 11400), ('e1', 'clip', 50000, 56000);
    INSERT INTO card_sources VALUES ('c', 9000, 15000, '{"word":{"startMs":12000,"byHand":false}}');
    INSERT INTO card_examples VALUES ('ex', 49000, 57000, NULL);
    INSERT INTO card_values VALUES ('c', 'clip', 'v1'), ('c', 'clip2', 'v2'), ('c', 'sound', 'a1'), ('c', 'word', 'w1'), ('c', 'back', 'v3'), ('c', 'text', 'hello');
    INSERT INTO card_example_values VALUES ('ex', 'clip', 'e1');
  `);
  const clipsOf = clipReader(db);
  // v1 as recorded (3 s), v2 its card's stretch (6 s); the sound and the word's cut left out; the word 2 s into v1.
  assert.deepEqual(clipsOf("c", null), { front: { sum: 9_000, word: 2_000 }, back: { sum: 6_000, word: 3_000 } });
  // The example's own clip (6 s) in place of v1, v2 still the card's.
  assert.deepEqual(clipsOf("c", "ex").front, { sum: 12_000, word: 3_000 });
  assert.deepEqual(clipsOf("none", null), { front: { sum: null, word: null }, back: { sum: null, word: null } });
  db.close();
});

const replayed = (cardId: string, instant: number, ms: number, over: Partial<ReplayAnswer> = {}): ReplayAnswer => ({
  ...answer(cardId, instant, ms),
  sessionId: "s",
  fromAgain: false,
  toAgain: false,
  wordMs: null,
  ...over,
});

test("the backtest sets each session's time left against what it took, from the pace of the days before it", () => {
  const history = [replayed("a", at(1, 9), 10_000, { sessionId: null }), replayed("b", at(1, 9.1), 10_000, { sessionId: null })];
  // The pace says 10 s a review; the session took 20 s a card.
  const session = [replayed("a", at(2, 9), 20_000), replayed("b", at(2, 9.1), 20_000), replayed("c", at(2, 9.2), 20_000)];
  const [before, today] = backtest([...history, ...session], dayOf, at(2, 0), [
    { name: "pace", again: true, front: "none", ease: NO_TODAY },
    { name: "today", again: true, front: "none", ease: 0 },
  ]);
  // At the start, 30 s for 60 s; then 20 s for 40 s, and 10 s for 20 s.
  assert.deepEqual(before, { name: "pace", sessions: 1, startMs: 30_000, startShare: 0.5, throughMs: 20_000 });
  // With nothing easing it in, today's speed is the session's own from the first card done: right after it.
  assert.deepEqual(today, { name: "today", sessions: 1, startMs: 30_000, startShare: 0.5, throughMs: 10_000 });
});

test("with clips, a long clip's card is priced longer and a short one's shorter, from the deck's fit before the session", () => {
  // Before: a card takes 2 s plus its clip, clips of 0 to 9 s, all on the front.
  const history = clipped().map((a) => replayed(a.cardId, a.at, 0, { ...a, decideMs: 0, sessionId: null }));
  const session = [replayed("long", at(2, 9), 0, { thinkMs: 11_000, decideMs: 0, clipMs: 9_000 }), replayed("short", at(2, 9.1), 0, { thinkMs: 2_000, decideMs: 0, clipMs: 0 })];
  const [plain, clips] = backtest(
    [...history, ...session],
    dayOf,
    at(2, 0),
    [
      { name: "plain", again: true, front: "none", ease: NO_TODAY },
      { name: "clips", again: true, front: "clips", ease: NO_TODAY },
    ],
    2,
  );
  // Plain: 6.5 s a card, 13 s for 13 s at the start, then 6.5 s for 2 s.
  assert.deepEqual(plain, { name: "plain", sessions: 1, startMs: 0, startShare: 0, throughMs: 2_250 });
  // With the clips each card is its own: 11 s and 2 s, right before each answer.
  assert.deepEqual(clips, { name: "clips", sessions: 1, startMs: 0, startShare: 0, throughMs: 0 });
});
