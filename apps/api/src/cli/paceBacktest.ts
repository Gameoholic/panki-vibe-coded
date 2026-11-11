import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CaptureFacts, DEFAULT_SETTINGS } from "@panki/contracts";
import { backtest, mediaFitOf, sideMediaOf, variantsOf, type MediaMeasure, type ReplayAnswer, type SideFile, type SideMedia } from "../paceBacktest";
import { PACE_DAYS } from "../pace";
import { dayReader } from "../time";

/**
 * `pnpm pace:backtest <panki.sqlite>`: how far off a review's time left would have been over the sessions of the past
 * `PACE_DAYS`, each way of working it out side by side, a card's clips among them. Opens the database it's given
 * read-only and changes nothing; run it on a copy, never on an account's live file.
 *
 * A file's length is what's kept of it: a recording's own stretch, else, for a file that isn't a dictionary's word
 * sound, the stretch of the video its card or example was taken from. Where the picked word starts in the clip is the
 * capture's word less the clip's start. Which example an answer showed is the one it names.
 */

const EASES = [2, 5, 10, 20];

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`.padStart(9);

/** Where a card or an example was taken from: the video's stretch and the picked word's start, each when kept. */
type Taken = { startMs: number | null; endMs: number | null; wordMs: number | null };

function takenOf(row: { startMs: number | null; endMs: number | null; capture: string | null }): Taken {
  let wordMs: number | null = null;
  try {
    const capture = CaptureFacts.safeParse(row.capture === null ? null : JSON.parse(row.capture));
    wordMs = capture.success ? (capture.data.word?.startMs ?? null) : null;
  } catch {
    wordMs = null;
  }
  return { startMs: row.startMs, endMs: row.endMs, wordMs };
}

function main() {
  const path = process.argv[2];
  if (!path || !existsSync(path)) {
    console.log("Give the path to a copy of an account's panki.sqlite.");
    return;
  }
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const all = <T>(sql: string) => db.prepare(sql).all() as T[];
    const setting = (key: string): unknown => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as unknown) : undefined;
    };
    const hour = typeof setting("dayStartHour") === "number" ? (setting("dayStartHour") as number) : DEFAULT_SETTINGS.dayStartHour;
    const zone = typeof setting("timeZone") === "string" && setting("timeZone") !== "" ? (setting("timeZone") as string) : Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Every file field of each card type, and the files each card and example holds in them.
    const fields = all<{ id: string; typeId: string; side: "front" | "back" }>("SELECT id, type_id AS typeId, side FROM card_fields WHERE kind = 'media' AND removed_at IS NULL");
    const fieldsOfType = new Map<string, typeof fields>();
    for (const f of fields) fieldsOfType.set(f.typeId, [...(fieldsOfType.get(f.typeId) ?? []), f]);
    const cardTypes = new Map(all<{ cardId: string; typeId: string }>("SELECT c.id AS cardId, d.type_id AS typeId FROM cards c JOIN decks d ON d.id = c.deck_id").map((r) => [r.cardId, r.typeId]));
    const valuesOf = (rows: { owner: string; fieldId: string; value: string }[]) => {
      const byOwner = new Map<string, Map<string, string>>();
      for (const r of rows) byOwner.set(r.owner, (byOwner.get(r.owner) ?? new Map<string, string>()).set(r.fieldId, r.value));
      return byOwner;
    };
    const cardFiles = valuesOf(all("SELECT v.card_id AS owner, v.field_id AS fieldId, v.value FROM card_values v JOIN card_fields f ON f.id = v.field_id WHERE f.kind = 'media'"));
    const exampleFiles = valuesOf(all("SELECT v.example_id AS owner, v.field_id AS fieldId, v.value FROM card_example_values v JOIN card_fields f ON f.id = v.field_id WHERE f.kind = 'media'"));
    const recordings = new Map(all<{ mediaId: string; cut: string; startMs: number; endMs: number }>("SELECT media_id AS mediaId, cut, start_ms AS startMs, end_ms AS endMs FROM media_recordings").map((r) => [r.mediaId, r]));
    const wordSounds = new Set(all<{ mediaId: string }>("SELECT media_id AS mediaId FROM forvo_recordings").map((r) => r.mediaId));
    const files = new Set(all<{ id: string }>("SELECT id FROM media").map((r) => r.id));
    const cardTaken = new Map(all<{ id: string; startMs: number | null; endMs: number | null; capture: string | null }>("SELECT card_id AS id, start_ms AS startMs, end_ms AS endMs, capture FROM card_sources").map((r) => [r.id, takenOf(r)]));
    const exampleTaken = new Map(all<{ id: string; startMs: number | null; endMs: number | null; capture: string | null }>("SELECT id, start_ms AS startMs, end_ms AS endMs, capture FROM card_examples").map((r) => [r.id, takenOf(r)]));

    /** A file as kept: its recording's stretch, else its source's for a file that isn't a word sound; the word's start in it from the source's capture. */
    const fileOf = (mediaId: string, taken: Taken | undefined): SideFile | null => {
      if (!files.has(mediaId)) return null;
      const recording = recordings.get(mediaId);
      if (recording) {
        const wordMs = recording.cut === "clip" && taken?.wordMs != null ? Math.max(0, taken.wordMs - recording.startMs) : null;
        return { lengthMs: Math.max(0, recording.endMs - recording.startMs), wordMs };
      }
      if (wordSounds.has(mediaId) || !taken || taken.startMs === null || taken.endMs === null) return { lengthMs: null, wordMs: null };
      return { lengthMs: Math.max(0, taken.endMs - taken.startMs), wordMs: taken.wordMs === null ? null : Math.max(0, taken.wordMs - taken.startMs) };
    };
    /** What each side of a card showed of its clips, with the example an answer named: its own files where it has them, the card's elsewhere. */
    const mediaOf = (cardId: string, exampleId: string | null): { front: SideMedia; back: SideMedia } => {
      const sides: Record<"front" | "back", SideFile[]> = { front: [], back: [] };
      for (const field of fieldsOfType.get(cardTypes.get(cardId) ?? "") ?? []) {
        const fromExample = exampleId === null ? undefined : exampleFiles.get(exampleId)?.get(field.id);
        const value = fromExample ?? cardFiles.get(cardId)?.get(field.id) ?? "";
        const file = value === "" ? null : fileOf(value, fromExample !== undefined && exampleId !== null ? exampleTaken.get(exampleId) : cardTaken.get(cardId));
        if (file) sides[field.side].push(file);
      }
      return { front: sideMediaOf(sides.front), back: sideMediaOf(sides.back) };
    };

    const rows = all<Omit<ReplayAnswer, "start" | "fromAgain" | "toAgain" | "front" | "back"> & { start: number; fromAgain: number; toAgain: number; exampleId: string | null }>(
      `SELECT p.card_id AS cardId, c.deck_id AS deckId, p.at, (p.stage_from IS NULL AND p.burned_from = 0 AND p.node_from = '[]') AS start,
         p.think_ms AS thinkMs, p.decide_ms AS decideMs, p.session_id AS sessionId, p.example_id AS exampleId,
         p.node_from <> '[]' AS fromAgain, p.node_to <> '[]' AS toAgain
       FROM card_places p JOIN cards c ON c.id = p.card_id WHERE p.reason = 'answer' ORDER BY p.at ASC, p.id ASC`,
    );
    const answers: ReplayAnswer[] = rows.map(({ exampleId, ...r }) => ({ ...r, start: r.start === 1, fromAgain: r.fromAgain === 1, toAgain: r.toAgain === 1, ...mediaOf(r.cardId, exampleId) }));
    const since = Date.now() - PACE_DAYS * 86_400_000;
    const recent = answers.filter((a) => a.at >= since);
    const errors = backtest(answers, dayReader(hour, zone), since, variantsOf(EASES));

    console.log(`${recent.length} answers in the past ${PACE_DAYS} days`);
    for (const [measure, words] of [["sum", "a clip length"], ["word", "the word's place in its clip"]] as [MediaMeasure, string][]) {
      const known = (side: "front" | "back") => recent.filter((a) => a[side][measure] !== null).length;
      console.log(`  with ${words}: ${known("front")} on the front, ${known("back")} on the back`);
    }
    for (const measure of ["sum", "longest", "word"] as MediaMeasure[]) {
      const fit = mediaFitOf(recent, measure);
      const said = (side: "front" | "back") => {
        const f = fit[side];
        return f === null ? "too few to fit" : `${f.share.toFixed(2)} ms a ms over ${f.points} showings, mean ${seconds(f.meanMs).trim()}`;
      };
      console.log(`  fit by ${measure}, all decks: front ${said("front")}; back ${said("back")}`);
    }
    console.log(`\n${"".padEnd(30)}${"sessions".padStart(9)}${"at start".padStart(10)}${"share".padStart(8)}${"through".padStart(10)}`);
    for (const e of errors) console.log(`${e.name.padEnd(30)}${String(e.sessions).padStart(9)}${seconds(e.startMs)}${`${Math.round(e.startShare * 100)}%`.padStart(8)}${seconds(e.throughMs)}`);
  } finally {
    db.close();
  }
}

main();
