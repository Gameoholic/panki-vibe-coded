import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_TIME_MAX_MS, NO_PACE } from "@panki/contracts";
import { paceFor, pacesOf, type PaceAnswer } from "../src/pace";
import { MEDIA_MIN, NO_TODAY, backtest, mediaFitOf, sideMediaOf, type ReplayAnswer, type SideMedia } from "../src/paceBacktest";

/*
 * A deck's pace from its answers (`pace.ts`), and the backtest of the time left worked out from it (`paceBacktest.ts`).
 * Run with `pnpm --dir apps/api test`.
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
  ...over,
});

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
  assert.deepEqual(byDeck.get("deck"), { newMs: 30_000, reviewMs: 9_000, showingMs: 9_600, againMs: 7_000 });
});

test("the same card on another day is another run, a review once it's started", () => {
  const { byDeck } = pacesOf([answer("a", at(1, 9), 20_000, { start: true }), answer("a", at(2, 9), 8_000)], dayOf);
  assert.deepEqual(byDeck.get("deck"), { newMs: 20_000, reviewMs: 8_000, showingMs: 14_000, againMs: null });
});

test("a showing is at most CARD_TIME_MAX_MS, and a run with one unmeasured counts for nothing", () => {
  const { byDeck } = pacesOf(
    [answer("a", at(1, 9), CARD_TIME_MAX_MS * 3), answer("b", at(1, 9), 6_000), answer("b", at(1, 10), 0, { thinkMs: null })],
    dayOf,
  );
  assert.deepEqual(byDeck.get("deck"), { newMs: null, reviewMs: CARD_TIME_MAX_MS, showingMs: CARD_TIME_MAX_MS, againMs: null });
});

test("a deck without a kind of run takes the account's; a deck with no answers is the account's whole", () => {
  const paces = pacesOf([answer("a", at(1, 9), 20_000, { start: true, deckId: "other" }), answer("b", at(1, 9), 6_000)], dayOf);
  assert.deepEqual(paceFor(paces, "deck"), { newMs: 20_000, reviewMs: 6_000, showingMs: 6_000, againMs: null });
  assert.deepEqual(paceFor(paces, "empty"), { newMs: 20_000, reviewMs: 6_000, showingMs: 13_000, againMs: null });
  assert.deepEqual(paceFor(null, "deck"), NO_PACE);
});

const NONE: SideMedia = { sum: null, word: null };
const replayed = (cardId: string, instant: number, ms: number, over: Partial<ReplayAnswer> = {}): ReplayAnswer => ({
  ...answer(cardId, instant, ms),
  sessionId: "s",
  fromAgain: false,
  toAgain: false,
  front: NONE,
  back: NONE,
  ...over,
});

test("a side's clips: their lengths summed, one with no length kept counting for nothing, the word's place from the first that has one", () => {
  assert.deepEqual(sideMediaOf([{ lengthMs: 3_000, wordMs: null }, { lengthMs: null, wordMs: null }, { lengthMs: 5_000, wordMs: 1_200 }]), { sum: 8_000, word: 1_200 });
  assert.deepEqual(sideMediaOf([{ lengthMs: null, wordMs: null }]), NONE);
});

test("a side's share is fitted from its own span against its own clips, never below 0, and only from enough showings", () => {
  const clip = (ms: number): SideMedia => ({ sum: ms, word: null });
  // The front takes 2 s plus its clip once over; the back nothing to do with the clips.
  const answers = Array.from({ length: MEDIA_MIN }, (_, i) => replayed(`c${i}`, at(1, 9 + i / 60), 0, { thinkMs: 2_000 + 1_000 * i, decideMs: 3_000, front: clip(1_000 * i), back: clip(1_000 * i) }));
  const fit = mediaFitOf(answers, "sum");
  assert.deepEqual(fit.front, { share: 1, meanMs: 4_500, points: MEDIA_MIN });
  assert.deepEqual(fit.back, { share: 0, meanMs: 4_500, points: MEDIA_MIN });
  assert.deepEqual(mediaFitOf(answers.slice(1), "sum"), { front: null, back: null });
  assert.deepEqual(mediaFitOf(answers, "word"), { front: null, back: null });
});

test("a variant with clips stretches a long clip's card and shrinks a short one's, from the deck's fit before the session", () => {
  const clip = (ms: number): SideMedia => ({ sum: ms, word: null });
  // Before: a card takes 2 s plus its clip, clips of 0 to 9 s.
  const history = Array.from({ length: MEDIA_MIN }, (_, i) => replayed(`h${i}`, at(1, 9 + i / 60), 0, { sessionId: null, thinkMs: 2_000 + 1_000 * i, decideMs: 0, front: clip(1_000 * i) }));
  const session = [replayed("long", at(2, 9), 0, { thinkMs: 11_000, decideMs: 0, front: clip(9_000) }), replayed("short", at(2, 9.1), 0, { thinkMs: 2_000, decideMs: 0, front: clip(0) })];
  const [plain, clips] = backtest([...history, ...session], dayOf, at(2, 0), [
    { name: "plain", pace: (p) => p, ease: NO_TODAY },
    { name: "clips", pace: (p) => p, ease: NO_TODAY, media: "sum" },
  ], 2);
  // Plain: 6.5 s a card, 13 s for 13 s at the start, then 6.5 s for 2 s.
  assert.deepEqual(plain, { name: "plain", sessions: 1, startMs: 0, startShare: 0, throughMs: 2_250 });
  // With the clips each card is its own: 11 s and 2 s, right before each answer.
  assert.deepEqual(clips, { name: "clips", sessions: 1, startMs: 0, startShare: 0, throughMs: 0 });
});

test("the backtest sets each session's time left against what it took, from the pace of the days before it", () => {
  const history = [replayed("a", at(1, 9), 10_000, { sessionId: null }), replayed("b", at(1, 9.1), 10_000, { sessionId: null })];
  // The pace says 10 s a review; the session took 20 s a card.
  const session = [replayed("a", at(2, 9), 20_000), replayed("b", at(2, 9.1), 20_000), replayed("c", at(2, 9.2), 20_000)];
  const [before, today] = backtest([...history, ...session], dayOf, at(2, 0), [
    { name: "pace", pace: (p) => p, ease: NO_TODAY },
    { name: "today", pace: (p) => p, ease: 0 },
  ]);
  // At the start, 30 s for 60 s; then 20 s for 40 s, and 10 s for 20 s.
  assert.deepEqual(before, { name: "pace", sessions: 1, startMs: 30_000, startShare: 0.5, throughMs: 20_000 });
  // With nothing easing it in, today's speed is the session's own from the first card done: right after it.
  assert.deepEqual(today, { name: "today", sessions: 1, startMs: 30_000, startShare: 0.5, throughMs: 10_000 });
});
