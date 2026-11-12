import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS } from "@panki/contracts";
import { clipReader, type CardClips } from "../clips";
import { PACE_DAYS, wordAtFitOf, type PaceAnswer } from "../pace";
import { backtest, variantsOf, type ReplayAnswer } from "../paceBacktest";
import { dayReader } from "../time";

/**
 * `pnpm pace:backtest <panki.sqlite>`: how far off a review's time left would have been over the sessions of the past
 * `PACE_DAYS`, each way of working it out side by side, the live one ("Asked-again + word's place") among them. Opens
 * the database it's given read-only and changes nothing; run it on a copy, never on an account's live file. A card's
 * clips are read as the API reads them (`clips.ts`), with the example each answer names.
 */

const EASES = [2, 5, 10, 20];

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`.padStart(9);

function main() {
  const path = process.argv[2];
  if (!path || !existsSync(path)) {
    console.log("Give the full path to a copy of an account's panki.sqlite.");
    return;
  }
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const setting = (key: string): unknown => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as unknown) : undefined;
    };
    const hour = typeof setting("dayStartHour") === "number" ? (setting("dayStartHour") as number) : DEFAULT_SETTINGS.dayStartHour;
    const zone = typeof setting("timeZone") === "string" && setting("timeZone") !== "" ? (setting("timeZone") as string) : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const clipsOf = clipReader(db);
    const read = new Map<string, CardClips>();
    const clipsOfAnswer = (cardId: string, exampleId: string | null) => {
      const key = `${cardId}|${exampleId ?? ""}`;
      const clips = read.get(key) ?? clipsOf(cardId, exampleId);
      read.set(key, clips);
      return clips;
    };
    const rows = db
      .prepare(
        `SELECT p.card_id AS cardId, c.deck_id AS deckId, p.at, (p.stage_from IS NULL AND p.burned_from = 0 AND p.node_from = '[]') AS start,
           p.think_ms AS thinkMs, p.decide_ms AS decideMs, p.session_id AS sessionId, p.example_id AS exampleId,
           p.node_from <> '[]' AS fromAgain, p.node_to <> '[]' AS toAgain, p.undone_at IS NOT NULL AS undone
         FROM card_places p JOIN cards c ON c.id = p.card_id WHERE p.reason = 'answer' ORDER BY p.at ASC, p.id ASC`,
      )
      .all() as (Omit<PaceAnswer, "start" | "wordAtMs" | "undone"> & { sessionId: string | null; exampleId: string | null; start: number; fromAgain: number; toAgain: number; undone: number })[];
    const answers: (ReplayAnswer & { backClipMs: number | null })[] = rows.map(({ exampleId, ...r }) => {
      const { front, back } = clipsOfAnswer(r.cardId, exampleId);
      return { ...r, start: r.start === 1, fromAgain: r.fromAgain === 1, toAgain: r.toAgain === 1, undone: r.undone === 1, wordAtMs: front.word, clipMs: front.sum, backClipMs: back.sum };
    });
    const since = Date.now() - PACE_DAYS * 86_400_000;
    const recent = answers.filter((a) => a.at >= since);
    const errors = backtest(answers, dayReader(hour, zone), since, variantsOf(EASES));

    console.log(`${recent.length} answers in the past ${PACE_DAYS} days`);
    console.log(`  with a clip length: ${recent.filter((a) => a.clipMs !== null).length} on the front, ${recent.filter((a) => a.backClipMs !== null).length} on the back`);
    console.log(`  with the word's place in its clip: ${recent.filter((a) => a.wordAtMs !== null).length} on the front`);
    for (const [name, view] of [
      ["clip lengths", (a: ReplayAnswer) => ({ ...a, wordAtMs: a.clipMs })],
      ["word's place", (a: ReplayAnswer) => a],
    ] as const) {
      const fit = wordAtFitOf(recent.map(view));
      const said = fit.wordAtMsPerS === null || fit.wordAtMeanMs === null ? "too few to fit" : `${fit.wordAtMsPerS} ms of front a second, mean ${seconds(fit.wordAtMeanMs).trim()}`;
      console.log(`  fit by ${name}, all decks: ${said}`);
    }
    console.log(`\n${"".padEnd(30)}${"sessions".padStart(9)}${"at start".padStart(10)}${"share".padStart(8)}${"through".padStart(10)}`);
    for (const e of errors) console.log(`${e.name.padEnd(30)}${String(e.sessions).padStart(9)}${seconds(e.startMs)}${`${Math.round(e.startShare * 100)}%`.padStart(8)}${seconds(e.throughMs)}`);
  } finally {
    db.close();
  }
}

main();
