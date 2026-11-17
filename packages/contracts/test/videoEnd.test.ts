import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RULES, RULE_ACTIONS, RULE_TRIGGERS, ruleActionsFor, ruleProblem } from "../src/rules";
import { FIND_VIDEO_END, VIDEO_END_LINES_LEAST, VIDEO_END_TAIL_MS, transcriptFinished } from "../src/transcription";
import { videoEndLines, videoEndPieces, videoEndProblem, type EndLine } from "../src/videoEnd";
import { WATCH, finishesAt, inEnd } from "../src/watching";

/*
 * Where a video counts as finished (`watching.ts` → `finishesAt`), the transcript finished (`transcriptFinished`), and
 * what Find where the video ends is sent and held to (`videoEnd.ts`), with its automation (`rules.ts`). Run with
 * `pnpm --dir packages/contracts test`.
 */

const MIN = 60_000;

test("with no Video end a video is finished only at its real end, within the player's rounding", () => {
  const length = 10 * MIN;
  assert.equal(finishesAt(length), length - WATCH.endSlackMs);
  assert.equal(inEnd(length - 20_000, length), false);
  assert.equal(inEnd(length - WATCH.endSlackMs - 1, length), false);
  assert.equal(inEnd(length - WATCH.endSlackMs, length), true);
  assert.equal(inEnd(length, length), true);
});

test("with a Video end a video is finished once it plays past there, never later than its real end", () => {
  const length = 10 * MIN;
  assert.equal(finishesAt(length, 8 * MIN), 8 * MIN);
  assert.equal(inEnd(8 * MIN - 1, length, 8 * MIN), false);
  assert.equal(inEnd(8 * MIN, length, 8 * MIN), true);
  // A Video end moved past the real end finishes at the real end.
  assert.equal(finishesAt(length, length + 5_000), length - WATCH.endSlackMs);
  assert.equal(finishesAt(length, null), length - WATCH.endSlackMs);
});

test("a transcript is finished when what's transcribed covers the video end to end in one stretch", () => {
  const length = 10 * MIN;
  assert.equal(transcriptFinished([{ startMs: 0, endMs: length }], length), true);
  assert.equal(transcriptFinished([{ startMs: 800, endMs: length - 1_500 }], length), true);
  assert.equal(transcriptFinished([{ startMs: 0, endMs: 5 * MIN }, { startMs: 6 * MIN, endMs: length }], length), false);
  assert.equal(transcriptFinished([{ startMs: 0, endMs: length - 30_000 }], length), false);
  assert.equal(transcriptFinished([], length), false);
});

/** A line a minute, each 20 s long, over a video of this many minutes. */
const linesOver = (minutes: number): EndLine[] => Array.from({ length: minutes }, (_, i) => ({ startMs: i * MIN, endMs: i * MIN + 20_000, text: `line ${i + 1}` }));

test("it's sent the lines of the video's last 15 minutes, never fewer than the last 30", () => {
  const long = linesOver(120);
  const length = 120 * MIN;
  const sent = videoEndLines(long, length);
  assert.ok(sent.length >= VIDEO_END_LINES_LEAST);
  assert.equal(sent.at(-1), long.at(-1));
  assert.ok(sent.every((line, i) => line === long[long.length - sent.length + i]), "the end of the lines, in order");
  // A short video: every line.
  assert.deepEqual(videoEndLines(linesOver(10), 10 * MIN), linesOver(10));
  // A video whose last 15 minutes hold few lines still has its last 30 read.
  const sparse = [...linesOver(40), { startMs: 70 * MIN, endMs: 70 * MIN + 5_000, text: "late" }];
  const sparseSent = videoEndLines(sparse, 80 * MIN);
  assert.equal(sparseSent.length, VIDEO_END_LINES_LEAST);
  assert.equal(sparseSent.at(-1)?.text, "late");
  // Fewer lines than that, all of them.
  assert.equal(videoEndLines(linesOver(3), 60 * MIN).length, 3);
  assert.ok(VIDEO_END_TAIL_MS > 0);
});

test("the lines are numbered with when each starts, and the video's length beside them", () => {
  const pieces = videoEndPieces(
    [
      { startMs: 65_000, endMs: 70_000, text: "ありがとう" },
      { startMs: 3_725_000, endMs: 3_730_000, text: "また" },
    ],
    3_800_000,
  );
  assert.equal(pieces.transcript, "1\t1:05\tありがとう\n2\t1:02:05\tまた");
  assert.equal(pieces.videoLength, "1:03:20");
});

test("an answer must name a line it was sent, with a reason", () => {
  assert.equal(videoEndProblem({ line: 3, reason: "Thanks for watching, then credits." }, 5), null);
  assert.notEqual(videoEndProblem({ line: 0, reason: "x" }, 5), null);
  assert.notEqual(videoEndProblem({ line: 6, reason: "x" }, 5), null);
  assert.notEqual(videoEndProblem({ line: 2, reason: "  " }, 5), null);
});

test("When a transcript is finished, find where the video ends: an automation every account starts with, On", () => {
  assert.equal(RULE_ACTIONS.findVideoEnd.name, FIND_VIDEO_END);
  assert.equal(RULE_ACTIONS.findVideoEnd.paid, true);
  assert.equal(RULE_TRIGGERS.transcriptWhole.does.findVideoEnd, "find where the video ends");
  assert.ok(ruleActionsFor("transcriptWhole").includes("findVideoEnd"));
  const rule = DEFAULT_RULES.find((r) => r.do === "findVideoEnd");
  assert.ok(rule);
  assert.equal(rule.when, "transcriptWhole");
  assert.equal(rule.on, true);
  assert.equal(ruleProblem(rule), null);
  // Only after a transcript is finished.
  assert.equal(ruleProblem({ ...rule, when: "chunkIn" }) !== null, true);
});
