import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  DEFAULT_TRANSCRIPTION,
  DEFAULT_WATCHING_SETTINGS,
  DEFAULT_WORD_AUDIO,
  WatchingSettings,
  type WatchingSettingsUpdate,
  ForvoVoice,
  Provides,
  ServerDictionary,
  type Redo,
  Transcript,
  Transcription,
  WholeJob,
  WordAudio,
  openDictionary,
  providesOf,
  realignLine,
  type EngineId,
  type HeardLanguage,
  type LineWord,
  type Stretch,
  type TranscribeEstimate,
  type TranscribeLanguage,
  type TranscriptLineFix,
  type TranscriptWord,
  type TranscriptionUpdate,
  type User,
  type VideoPicture,
  type WordAudioSourceId,
  type WordAudioUpdate,
} from "@panki/contracts";
import type { AuthDb } from "./authDb";
import type { Db } from "./db";
import { userDir } from "./dbs";
import { dictionaryDir, mediaDir, removeFile, sharedDictionaryDir } from "./mediaFiles";

export type Shared = ReturnType<typeof openShared>;

/** A Forvo recording as everyone's copy of it is kept: who said which word, from where, and its bytes (an mp3). */
export type SharedRecording = { word: string; by: string; country: string; mime: string; bytes: Buffer };

/** What a key is for: a source of word audio (Forvo), or one of the transcription engines. */
export type Service = WordAudioSourceId | EngineId;

/**
 * A piece as the route hands it in: where its sound is in the video, the language the engine was told and what it
 * said of the language as it answered (kept, deciding nothing). Every piece's words are kept: until 2026-10-18 the
 * engine was sometimes asked the language instead of told it, and a piece heard surely in another language wasn't.
 */
export type NewPiece = {
  id: string;
  videoId: string;
  /** Listened through from here with nothing to send before the sound begins at `startMs`: quiet, heard, covered (a `transcript_quiet` row). */
  heardFrom: number;
  startMs: number;
  endMs: number;
  engine: EngineId;
  userId: string;
  told: string;
  language: HeardLanguage;
  /** How long the engine took over it. */
  engineMs: number;
  /** A run's first piece with sound: how long after the run began it was sent; null for the rest. */
  runMs: number | null;
  /** A piece of a part being transcribed again: kept standing aside until the part is done (`finishRedo`); null for the rest. */
  redoId: string | null;
};
/** A word the engine heard, with its times in the video's own ms. */
export type NewWord = { text: string; startMs: number; endMs: number };
/** A stretch the silent player listened through and found nothing to send: heard, with nothing said. Its id is the extension's, as a piece's is; `redoId` as a piece's. */
export type NewQuiet = { id: string; videoId: string; startMs: number; endMs: number; userId: string; redoId: string | null };
type RedoRow = { id: string; videoId: string; askedStart: number; askedEnd: number; startMs: number; endMs: number; state: "running" | "done" | "cancelled" };
/** A whole-video download as it's asked for: the video, its length as the extension read it, and what it's to be heard with. */
export type NewJob = { id: string; videoId: string; engine: EngineId; language: TranscribeLanguage; lengthMs: number; userId: string };
/** A whole-video download as it's kept, for the one that runs it. */
export type JobRow = {
  id: string;
  videoId: string;
  engine: EngineId;
  language: TranscribeLanguage;
  lengthMs: number;
  state: WholeJob["state"];
  attempts: number;
  askedAt: number;
  startedAt: number | null;
  endedAt: number | null;
  words: number | null;
  replaced: number | null;
  message: string | null;
  /** Who asked for it: its pieces are theirs, as a chunk is whoever's run sent it. */
  userId: string;
};

/** Two kept stretches this close (or overlapping) read as one, so a transcript's coverage is a few long stretches, not a list of pieces. */
const MERGE_GAP_MS = 100;
/**
 * About how long each of a whole video's own pieces is: its words are kept in pieces of the video this long, each
 * ending in the gap between two words, so a part of it can be forgotten (and heard again in chunks) as a chunk's can.
 */
const JOB_PIECE_MS = 30_000;
/** How far back what's measured is read from, to tell how long a download takes and what it costs (`TranscribeEstimate`). */
const ESTIMATE_MS = 30 * 24 * 60 * 60 * 1000;

type SettingRow = { key: string; value: string };
/** A group of the shared settings: each key's own rule (the schema's shape), the whole read as one, and its defaults. */
type Checked = { success: true; data: unknown } | { success: false };
type Group<T extends Record<string, unknown>> = { shape: Record<string, { safeParse(value: unknown): Checked }>; parse(value: unknown): T; defaults: T };
const TRANSCRIPTION: Group<Transcription> = { shape: Transcription.shape, parse: (value) => Transcription.parse(value), defaults: DEFAULT_TRANSCRIPTION };
const WORD_AUDIO: Group<WordAudio> = { shape: WordAudio.shape, parse: (value) => WordAudio.parse(value), defaults: DEFAULT_WORD_AUDIO };
const WATCHING: Group<WatchingSettings> = { shape: WatchingSettings.shape, parse: (value) => WatchingSettings.parse(value), defaults: DEFAULT_WATCHING_SETTINGS };
/** A living word: the engine's own, and its latest fix's text and times, when it has one (a fix to "" took it out of the line). */
type WordRow = { id: number; heard: string; startMs: number; endMs: number; fixed: string | null; fixedStart: number | null; fixedEnd: number | null };
type StretchRow = { startMs: number; endMs: number };
/** A living word of another piece, with that piece's own edges. */
type InsideRow = { id: number; startMs: number; pieceStart: number; pieceEnd: number };

/**
 * What every account shares lives in `shared.sqlite`, apart from `auth.sqlite` and from every account's own data (the
 * owner's decision of 2026-10-17, with the admin flag): the keys for the services Panki calls, the dictionaries kept on
 * Panki, how transcribing runs, and every transcript. Same discipline as `db.ts`: migrations in order, `user_version`
 * records how far we got, nothing is ever deleted but a key, whose old values are secrets.
 */
const MIGRATIONS: ReadonlyArray<(db: DatabaseSync) => void> = [
  (db) => {
    // One key per service (Forvo, each engine), typed in Settings by an admin. Kept apart from `settings` because
    // those keep every value they had; of a key only that it was set, forgotten or moved here, and when.
    db.exec(`
      CREATE TABLE service_keys (
        service TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        set_at INTEGER NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE service_key_changes (
        id INTEGER PRIMARY KEY,
        service TEXT NOT NULL,
        what TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    // The dictionaries kept on Panki, the same row an account's `dictionary_files` was, plus who uploaded it. The zip
    // is `shared/dictionaries/<id>`. Removing one keeps its row with the time it went; the zip is deleted for the room.
    db.exec(`
      CREATE TABLE dictionary_files (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        revision TEXT NOT NULL,
        description TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        uploaded_at INTEGER NOT NULL,
        uploaded_by TEXT NOT NULL DEFAULT '',
        removed_at INTEGER
      )
    `);
    // How transcribing runs, for everyone: only the keys an admin changed; reading merges them over the contracts'
    // DEFAULT_TRANSCRIPTION. Every change keeps what it was and what it became.
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE settings_changes (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL,
        from_value TEXT NOT NULL,
        to_value TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    // One transcript per video, shared by everyone: what the engine last heard its language as. The words are below.
    db.exec(`
      CREATE TABLE transcripts (
        video_id TEXT PRIMARY KEY,
        language TEXT,
        language_probability REAL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    // Every piece of sound sent to an engine, paid for whether or not its words were kept: `checked` is that the engine
    // was asked what language it heard, `kept` that its words were taken into the transcript.
    db.exec(`
      CREATE TABLE transcript_pieces (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL REFERENCES transcripts(video_id),
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        engine TEXT NOT NULL,
        language TEXT,
        language_probability REAL,
        checked INTEGER NOT NULL,
        kept INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX transcript_pieces_video_id ON transcript_pieces (video_id)");
    // Every word an engine heard, with its times in the video's own ms. Never deleted: one that lost its place to a
    // neighbouring piece's hearing of the same moment gets `removed_at` and stands aside.
    db.exec(`
      CREATE TABLE transcript_words (
        id INTEGER PRIMARY KEY,
        video_id TEXT NOT NULL,
        piece_id TEXT NOT NULL REFERENCES transcript_pieces(id),
        text TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
    db.exec("CREATE INDEX transcript_words_video_start ON transcript_words (video_id, start_ms)");
    // A word changed by hand, kept beside the engine's word, never over it: a word's text is its latest fix's.
    db.exec(`
      CREATE TABLE transcript_fixes (
        id INTEGER PRIMARY KEY,
        word_id INTEGER NOT NULL REFERENCES transcript_words(id),
        from_text TEXT NOT NULL,
        to_text TEXT NOT NULL,
        user_id TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
  },
  (db) => {
    // Every request Panki makes to a service that counts them (Forvo: 500 a day), with when, so an admin can see
    // how much of the day's allowance is used; Forvo's API tells nothing of it itself (2026-10-17).
    db.exec(`
      CREATE TABLE service_calls (
        id INTEGER PRIMARY KEY,
        service TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX service_calls_service_at ON service_calls (service, at)");
  },
  (db) => {
    // The first day, a video whose first piece the engine couldn't make out (a 3-second intro it heard as "eng", 12%
    // sure) counted as not Japanese, and was never transcribed by itself again. Now what the engine heard says
    // something only when it was at least half sure (`verdictOf`), and a video transcribed told Japanese (Transcribe
    // pressed) is Japanese by that word. Every video's language is read again by those rules, so none stays stuck.
    db.exec("UPDATE transcripts SET language = NULL, language_probability = NULL WHERE language_probability IS NOT NULL AND language_probability < 0.5");
    db.exec(`
      UPDATE transcripts SET language = 'jpn', language_probability = NULL
      WHERE (language IS NULL OR language NOT IN ('jpn', 'ja'))
        AND EXISTS (SELECT 1 FROM transcript_pieces p JOIN transcript_words w ON w.piece_id = p.id WHERE p.video_id = transcripts.video_id AND p.checked = 0)
    `);
  },
  (db) => {
    // A stretch of the video the silent player listened through and found nothing to send (the quiet between two
    // pieces, a jingle, music under nobody's voice): heard, with nothing said, so it counts as covered without a call
    // to any engine. Until now such quiet was dropped, and the transcript had a hole wherever nobody spoke (the owner,
    // 2026-10-17: "what are the pauses in between the yellow lines?"). The id is the extension's, as a piece's is: the
    // same stretch again changes nothing; the quiet before a piece's sound carries that piece's id.
    db.exec(`
      CREATE TABLE transcript_quiet (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL REFERENCES transcripts(video_id),
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX transcript_quiet_video_id ON transcript_quiet (video_id)");
  },
  (db) => {
    // A transcript forgotten, whole or a stretch of it, "to start from scratch" (the owner, 2026-10-17): nothing is
    // deleted; the pieces and the quiet of the stretch stand aside with `removed_at`, their words with them, and the
    // stretch is uncovered again, to be transcribed afresh when a run passes it. What was paid for stays counted.
    db.exec("ALTER TABLE transcript_pieces ADD COLUMN removed_at INTEGER");
    db.exec("ALTER TABLE transcript_quiet ADD COLUMN removed_at INTEGER");
  },
  (db) => {
    // What everyone shares is changed by whichever admin, and a transcript forgotten by whoever asks: from here on the
    // rows say who (2026-10-17; a row from before reads as nobody). And every ask to forget is kept as it came, whether
    // or not anything stood in the stretch, since the pieces' `removed_at` alone can't tell one ask from the next.
    db.exec("ALTER TABLE settings_changes ADD COLUMN user_id TEXT");
    db.exec("ALTER TABLE service_key_changes ADD COLUMN user_id TEXT");
    db.exec("ALTER TABLE dictionary_files ADD COLUMN removed_by TEXT");
    db.exec(`
      CREATE TABLE transcript_forgets (
        id INTEGER PRIMARY KEY,
        video_id TEXT NOT NULL REFERENCES transcripts(video_id),
        start_ms INTEGER,
        end_ms INTEGER,
        user_id TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX transcript_forgets_video_id ON transcript_forgets (video_id)");
  },
  (db) => {
    // A video's pictures, kept once each for everyone (2026-10-18): its thumbnail and its channel's picture, which a
    // card's video metadata shows, and which stay when the video or the channel is gone. A few kilobytes each, so they're
    // kept in here, and go into every backup with the rest. Where each was fetched from, who asked first and when are
    // kept with it; it's never changed or removed.
    db.exec(`
      CREATE TABLE video_pictures (
        video_id TEXT NOT NULL,
        picture TEXT NOT NULL CHECK (picture IN ('thumbnail', 'avatar')),
        mime TEXT NOT NULL,
        bytes BLOB NOT NULL,
        source TEXT NOT NULL,
        user_id TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (video_id, picture)
      )
    `);
    // Forvo's recordings, kept once for everyone (the owner, the same day: "I want Forvo… cached globally, not per
    // account"): the first account to pick one fetches it from Forvo, and every account after gets a copy of these
    // bytes as its own card's file, with no request to Forvo. Each account's own files stay its own, as its cards name
    // them; those it held before are gathered in here at startup (`gatherShared`). A few dozen kilobytes each.
    db.exec(`
      CREATE TABLE forvo_recordings (
        forvo_id INTEGER PRIMARY KEY,
        word TEXT NOT NULL,
        by TEXT NOT NULL,
        country TEXT NOT NULL,
        mime TEXT NOT NULL,
        bytes BLOB NOT NULL,
        user_id TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      )
    `);
  },
  (db) => {
    // A word's recordings on Forvo, as its list was the one time it was asked for (the owner, 2026-10-18: "saved on
    // disk globally, cached forever so we never go to the API for a word we already asked for in the past"): the
    // recordings kept with it (`forvo_recordings`), best liked first, as JSON. A word with none is kept as none.
    db.exec(`
      CREATE TABLE forvo_words (
        word TEXT PRIMARY KEY,
        voices TEXT NOT NULL,
        user_id TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      )
    `);
  },
  (db) => {
    // A whole video downloaded by the engine and transcribed in one call (2026-10-20): each download asked for, with
    // what it came to. Its words are kept as a chunk's are, under pieces of its own (`job_id`), about half a minute of
    // the video each, so a part of it can be forgotten as a chunk can. What was measured, to tell how long the next one
    // will take and what it will cost: the engine's credits counted across a download, and the sound they paid for (the
    // video, and any chunks sent meanwhile); how long the engine took over each chunk, and, for a run's first chunk, how
    // long after the run began it was sent. And a word fixed by hand can be moved in time now, as a line is fixed with
    // the pencil: each fix keeps where the word stood after it (null on the fixes from before, where it stood as heard),
    // and a fix to nothing takes the word out of the line.
    db.exec("ALTER TABLE transcript_pieces ADD COLUMN job_id TEXT");
    db.exec("ALTER TABLE transcript_pieces ADD COLUMN engine_ms INTEGER");
    db.exec("ALTER TABLE transcript_pieces ADD COLUMN run_ms INTEGER");
    db.exec("CREATE INDEX transcript_pieces_job_id ON transcript_pieces (job_id)");
    db.exec("ALTER TABLE transcript_fixes ADD COLUMN start_ms INTEGER");
    db.exec("ALTER TABLE transcript_fixes ADD COLUMN end_ms INTEGER");
    db.exec(`
      CREATE TABLE transcript_jobs (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL REFERENCES transcripts(video_id),
        engine TEXT NOT NULL,
        language TEXT NOT NULL,
        length_ms INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('running', 'done', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        asked_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        words INTEGER,
        replaced INTEGER,
        credits INTEGER,
        sound_ms INTEGER,
        message TEXT,
        user_id TEXT NOT NULL
      )
    `);
    db.exec("CREATE INDEX transcript_jobs_video_id ON transcript_jobs (video_id, asked_at)");
  },
  (db) => {
    // A word reads as its latest fix, looked up for every word each time a transcript is read, which is every few
    // seconds while a whole video downloads; and a line fixed with the pencil makes a fix of every word it changes.
    db.exec("CREATE INDEX transcript_fixes_word_id ON transcript_fixes (word_id, id)");
  },
  (db) => {
    // A part of a video transcribed again (the owner, 2026-10-20: "Re-transcribe a part", in place of forgetting one):
    // each ask, with the stretch it widened to and what came of it. Its pieces and quiet (`redo_id`) are kept standing
    // aside as they come, so the transcript doesn't change while it runs; when it's done, what stood over the stretch
    // stands aside and they stand in its place, in one transaction. Cancelled, they stay aside, paid for and kept.
    db.exec(`
      CREATE TABLE transcript_redos (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL REFERENCES transcripts(video_id),
        asked_start_ms INTEGER NOT NULL,
        asked_end_ms INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('running', 'done', 'cancelled')),
        user_id TEXT NOT NULL,
        asked_at INTEGER NOT NULL,
        ended_at INTEGER
      )
    `);
    db.exec("CREATE INDEX transcript_redos_video_id ON transcript_redos (video_id)");
    db.exec("ALTER TABLE transcript_pieces ADD COLUMN redo_id TEXT");
    db.exec("ALTER TABLE transcript_quiet ADD COLUMN redo_id TEXT");
    db.exec("CREATE INDEX transcript_pieces_redo_id ON transcript_pieces (redo_id)");
  },
  (db) => {
    // What a kept dictionary provides, counted from its rows as the extension counts what it imports, so the options
    // page can say so before it's added (the owner, 2026-10-25). JSON of the contracts' `Provides`; null until it's
    // counted: at upload, or at startup for one kept before (`countDictionaries`).
    db.exec("ALTER TABLE dictionary_files ADD COLUMN provides TEXT");
  },
];

function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  MIGRATIONS.forEach((step, i) => {
    if (i < user_version) return;
    db.exec("BEGIN");
    try {
      step(db);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
}

/** How far a moment is from the nearer edge of a stretch: the farther in, the better a piece heard it. */
const depth = (at: number, stretch: Stretch) => Math.min(at - stretch.startMs, stretch.endMs - at);
/** Whether another kept piece reaching over a moment heard it at least as far from its own edge as this piece (`stretch`) did: this piece's word there loses. */
const beaten = (others: readonly StretchRow[], at: number, stretch: Stretch) => others.some((q) => q.startMs <= at && at <= q.endMs && depth(at, stretch) <= depth(at, q));

/** The stretches in order, those that overlap or nearly touch made one. */
function mergeStretches(rows: StretchRow[]): Stretch[] {
  const merged: Stretch[] = [];
  for (const row of rows) {
    const last = merged[merged.length - 1];
    if (last && row.startMs <= last.endMs + MERGE_GAP_MS) last.endMs = Math.max(last.endMs, row.endMs);
    else merged.push({ startMs: row.startMs, endMs: row.endMs });
  }
  return merged;
}

/** The middle of some numbers (between the two middle ones for an even count); null for none. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** A kept dictionary's row as it's told of: what it provides read from its JSON, null while it's uncounted (or the JSON doesn't read). */
function dictionaryOf(row: unknown): ServerDictionary {
  const { provides, ...rest } = z.looseObject({ provides: z.string().nullable() }).parse(row);
  let counted: Provides | null = null;
  if (provides !== null) {
    try {
      counted = Provides.parse(JSON.parse(provides));
    } catch {
      counted = null;
    }
  }
  return ServerDictionary.parse({ ...rest, provides: counted });
}

/** A word as it reads now: its latest fix's text and times, or the engine's. */
const wordOf = (w: WordRow): LineWord => ({ id: w.id, text: w.fixed ?? w.heard, startMs: w.fixedStart ?? w.startMs, endMs: w.fixedEnd ?? w.endMs });

/** A download as the extension is told of it. */
const wholeJobOf = (job: JobRow): WholeJob =>
  WholeJob.parse({ id: job.id, state: job.state, askedAt: job.askedAt, endedAt: job.endedAt, lengthMs: job.lengthMs, words: job.words, replaced: job.replaced, message: job.message });

/**
 * A whole video's words cut into pieces of about `JOB_PIECE_MS`, each ending halfway across the gap between two words
 * (never inside a word), the first from the video's start and the last to its end, so together they cover all of it.
 */
function piecesOfVideo(words: readonly NewWord[], lengthMs: number): { startMs: number; endMs: number; words: NewWord[] }[] {
  const sorted = [...words].sort((a, b) => a.startMs - b.startMs);
  const end = Math.max(lengthMs, ...sorted.map((w) => w.endMs));
  const pieces: { startMs: number; endMs: number; words: NewWord[] }[] = [];
  let open: { startMs: number; endMs: number; words: NewWord[] } = { startMs: 0, endMs: end, words: [] };
  let before: NewWord | null = null;
  for (const word of sorted) {
    if (before && word.startMs - open.startMs >= JOB_PIECE_MS && word.startMs >= before.endMs) {
      const cut = Math.round((before.endMs + word.startMs) / 2);
      pieces.push({ ...open, endMs: cut });
      open = { startMs: cut, endMs: end, words: [] };
    }
    open.words.push(word);
    before = word;
  }
  pieces.push(open);
  return pieces;
}

export function openShared(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "shared.sqlite"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  // A command run beside the API (`pnpm backup`) may hold the file for a moment: a locked write waits instead of failing.
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);

  function transaction<T>(work: () => T): T {
    db.exec("BEGIN");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  const selectKey = db.prepare("SELECT key FROM service_keys WHERE service = ?");
  const upsertKey = db.prepare("INSERT INTO service_keys (service, key, set_at) VALUES (?, ?, ?) ON CONFLICT (service) DO UPDATE SET key = excluded.key, set_at = excluded.set_at");
  const deleteKey = db.prepare("DELETE FROM service_keys WHERE service = ?");
  const insertKeyChange = db.prepare("INSERT INTO service_key_changes (service, what, at, user_id) VALUES (?, ?, ?, ?)");
  const insertCall = db.prepare("INSERT INTO service_calls (service, at) VALUES (?, ?)");
  const countCalls = db.prepare("SELECT COUNT(*) AS n FROM service_calls WHERE service = ? AND at >= ?");

  const dictionaryColumns = "id, title, revision, description, bytes, provides, uploaded_at AS uploadedAt";
  const selectDictionaryFiles = db.prepare(`SELECT ${dictionaryColumns} FROM dictionary_files WHERE removed_at IS NULL ORDER BY uploaded_at ASC, id ASC`);
  const selectDictionaryFile = db.prepare(`SELECT ${dictionaryColumns} FROM dictionary_files WHERE id = ? AND removed_at IS NULL`);
  const selectAnyDictionaryFile = db.prepare(`SELECT ${dictionaryColumns} FROM dictionary_files WHERE id = ?`);
  const selectDictionaryFileHash = db.prepare("SELECT sha256 FROM dictionary_files WHERE id = ?");
  const selectDictionaryFileByTitle = db.prepare(`SELECT ${dictionaryColumns} FROM dictionary_files WHERE title = ? AND removed_at IS NULL`);
  const insertDictionaryFile = db.prepare(
    "INSERT OR IGNORE INTO dictionary_files (id, title, revision, description, bytes, provides, sha256, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const removeDictionaryFile = db.prepare("UPDATE dictionary_files SET removed_at = ?, removed_by = ? WHERE id = ? AND removed_at IS NULL");
  const setDictionaryProvides = db.prepare("UPDATE dictionary_files SET provides = ? WHERE id = ? AND provides IS NULL");

  const selectSettings = db.prepare("SELECT key, value FROM settings");
  const upsertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  const insertSettingChange = db.prepare("INSERT INTO settings_changes (key, from_value, to_value, at, user_id) VALUES (?, ?, ?, ?, ?)");

  const selectTranscript = db.prepare("SELECT language FROM transcripts WHERE video_id = ?");
  const insertTranscript = db.prepare("INSERT OR IGNORE INTO transcripts (video_id, language, language_probability, created_at, updated_at) VALUES (?, NULL, NULL, ?, ?)");
  // Told a language and hearing words in it, the video is in that language by the teller's word, unless it's that already.
  const tellTranscriptLanguage = db.prepare("UPDATE transcripts SET language = ?, language_probability = NULL, updated_at = ? WHERE video_id = ? AND language IS NOT ?");
  const touchTranscript = db.prepare("UPDATE transcripts SET updated_at = ? WHERE video_id = ?");
  // A word reads as its latest fix, when it has one: its text and, since 2026-10-20, where it stands (a fix from before
  // that keeps where it was heard); the engine's own word and times stay beside it.
  const wordColumns = `w.id, w.text AS heard, w.start_ms AS startMs, w.end_ms AS endMs, f.to_text AS fixed, f.start_ms AS fixedStart, f.end_ms AS fixedEnd
    FROM transcript_words w LEFT JOIN transcript_fixes f ON f.id = (SELECT MAX(x.id) FROM transcript_fixes x WHERE x.word_id = w.id)`;
  const selectWords = db.prepare(`SELECT ${wordColumns} WHERE w.video_id = ? AND w.removed_at IS NULL ORDER BY COALESCE(f.start_ms, w.start_ms) ASC, w.id ASC`);
  const selectLivingWord = db.prepare(`SELECT ${wordColumns} WHERE w.id = ? AND w.video_id = ? AND w.removed_at IS NULL`);
  // What's covered: the kept pieces' sound, and the quiet listened through.
  const selectKeptStretches = db.prepare(`
    SELECT start_ms AS startMs, end_ms AS endMs FROM transcript_pieces WHERE video_id = ? AND kept = 1 AND removed_at IS NULL
    UNION ALL SELECT start_ms, end_ms FROM transcript_quiet WHERE video_id = ? AND removed_at IS NULL
    ORDER BY startMs ASC, endMs ASC`);
  // Forgetting a stretch: what reaches into it stands aside, its words with it; the whole video is the stretch from 0 on.
  const forgetPieces = db.prepare("UPDATE transcript_pieces SET removed_at = ? WHERE video_id = ? AND removed_at IS NULL AND start_ms < ? AND end_ms > ?");
  const forgetPieceWords = db.prepare(
    "UPDATE transcript_words SET removed_at = ? WHERE video_id = ? AND removed_at IS NULL AND piece_id IN (SELECT id FROM transcript_pieces WHERE video_id = ? AND removed_at = ?)",
  );
  const forgetQuiet = db.prepare("UPDATE transcript_quiet SET removed_at = ? WHERE video_id = ? AND removed_at IS NULL AND start_ms < ? AND end_ms > ?");
  const forgetLanguage = db.prepare("UPDATE transcripts SET language = NULL, language_probability = NULL, updated_at = ? WHERE video_id = ?");
  const insertForget = db.prepare("INSERT INTO transcript_forgets (video_id, start_ms, end_ms, user_id, at) VALUES (?, ?, ?, ?, ?)");
  const selectQuiet = db.prepare("SELECT 1 FROM transcript_quiet WHERE id = ? AND video_id = ?");
  const insertQuiet = db.prepare("INSERT OR IGNORE INTO transcript_quiet (id, video_id, start_ms, end_ms, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const selectPiece = db.prepare("SELECT id FROM transcript_pieces WHERE id = ? AND video_id = ?");
  const insertPiece = db.prepare(
    "INSERT OR IGNORE INTO transcript_pieces (id, video_id, start_ms, end_ms, engine, language, language_probability, checked, kept, user_id, created_at, engine_ms, run_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  // A whole video's own pieces: never asked the language, always kept.
  const insertJobPiece = db.prepare(
    "INSERT INTO transcript_pieces (id, video_id, start_ms, end_ms, engine, language, language_probability, checked, kept, user_id, created_at, job_id) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)",
  );
  // The chunks standing (not a whole video's own pieces), which a whole video replaces.
  const countChunks = db.prepare("SELECT COUNT(*) AS n FROM transcript_pieces WHERE video_id = ? AND removed_at IS NULL AND job_id IS NULL");
  // A whole video's own pieces standing over a stretch: a chunk they cover isn't heard again.
  const selectJobPiecesOver = db.prepare(
    "SELECT start_ms AS startMs, end_ms AS endMs FROM transcript_pieces WHERE video_id = ? AND job_id IS NOT NULL AND removed_at IS NULL AND start_ms < ? AND end_ms > ? ORDER BY start_ms ASC",
  );
  const jobColumns = `id, video_id AS videoId, engine, language, length_ms AS lengthMs, state, attempts, asked_at AS askedAt, started_at AS startedAt,
    ended_at AS endedAt, words, replaced, message, user_id AS userId`;
  const insertJob = db.prepare("INSERT INTO transcript_jobs (id, video_id, engine, language, length_ms, state, asked_at, user_id) VALUES (?, ?, ?, ?, ?, 'running', ?, ?)");
  const selectJob = db.prepare(`SELECT ${jobColumns} FROM transcript_jobs WHERE id = ?`);
  const selectLatestJob = db.prepare(`SELECT ${jobColumns} FROM transcript_jobs WHERE video_id = ? ORDER BY asked_at DESC, rowid DESC LIMIT 1`);
  const selectRunningJobs = db.prepare(`SELECT ${jobColumns} FROM transcript_jobs WHERE state = 'running' ORDER BY asked_at ASC`);
  const startJob = db.prepare("UPDATE transcript_jobs SET started_at = ?, attempts = attempts + 1 WHERE id = ? AND state = 'running'");
  const failJob = db.prepare("UPDATE transcript_jobs SET state = 'failed', ended_at = ?, message = ? WHERE id = ? AND state = 'running'");
  const doneJob = db.prepare("UPDATE transcript_jobs SET state = 'done', ended_at = ?, words = ?, replaced = ?, credits = ?, sound_ms = ? WHERE id = ?");
  // What's measured, to tell how long the next download takes and what it costs.
  const selectDoneJobs = db.prepare(
    "SELECT length_ms AS lengthMs, started_at AS startedAt, ended_at AS endedAt, credits, sound_ms AS soundMs FROM transcript_jobs WHERE engine = ? AND state = 'done' AND ended_at >= ?",
  );
  const selectFirstWords = db.prepare("SELECT run_ms + engine_ms AS ms FROM transcript_pieces WHERE engine = ? AND run_ms IS NOT NULL AND engine_ms IS NOT NULL AND created_at >= ?");
  const sumChunkSound = db.prepare("SELECT COALESCE(SUM(end_ms - start_ms), 0) AS ms FROM transcript_pieces WHERE engine = ? AND job_id IS NULL AND created_at >= ? AND created_at <= ?");
  // The living words of the video's other pieces that begin inside a stretch, each with its own piece's edges.
  const selectWordsInside = db.prepare(`
    SELECT w.id, w.start_ms AS startMs, q.start_ms AS pieceStart, q.end_ms AS pieceEnd
    FROM transcript_words w JOIN transcript_pieces q ON q.id = w.piece_id
    WHERE w.video_id = ? AND w.removed_at IS NULL AND q.removed_at IS NULL AND w.piece_id != ? AND w.start_ms >= ? AND w.start_ms <= ?`);
  // The video's other kept pieces that reach into a stretch.
  const selectPiecesOver = db.prepare(
    "SELECT start_ms AS startMs, end_ms AS endMs FROM transcript_pieces WHERE video_id = ? AND kept = 1 AND removed_at IS NULL AND id != ? AND start_ms <= ? AND end_ms >= ?",
  );
  const removeWord = db.prepare("UPDATE transcript_words SET removed_at = ? WHERE id = ?");
  const insertWord = db.prepare("INSERT INTO transcript_words (video_id, piece_id, text, start_ms, end_ms, removed_at) VALUES (?, ?, ?, ?, ?, ?)");
  // A part transcribed again: its pieces, quiet and words written standing aside as they come (`redo_id`), and stood in
  // when it's done, one piece at a time in order.
  const insertRedoPiece = db.prepare(
    "INSERT OR IGNORE INTO transcript_pieces (id, video_id, start_ms, end_ms, engine, language, language_probability, checked, kept, user_id, created_at, engine_ms, run_ms, redo_id, removed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?)",
  );
  const insertRedoQuiet = db.prepare("INSERT OR IGNORE INTO transcript_quiet (id, video_id, start_ms, end_ms, user_id, created_at, redo_id, removed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const insertRedo = db.prepare(
    "INSERT OR IGNORE INTO transcript_redos (id, video_id, asked_start_ms, asked_end_ms, start_ms, end_ms, state, user_id, asked_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)",
  );
  const selectRedo = db.prepare(
    "SELECT id, video_id AS videoId, asked_start_ms AS askedStart, asked_end_ms AS askedEnd, start_ms AS startMs, end_ms AS endMs, state FROM transcript_redos WHERE id = ? AND video_id = ?",
  );
  const endRedo = db.prepare("UPDATE transcript_redos SET state = ?, ended_at = ? WHERE id = ? AND state = 'running'");
  // The edges of what stands reaching into a stretch: a part asked to be transcribed again is widened to them.
  const selectStandingOver = db.prepare(`
    SELECT MIN(startMs) AS startMs, MAX(endMs) AS endMs FROM (
      SELECT start_ms AS startMs, end_ms AS endMs FROM transcript_pieces WHERE video_id = ? AND kept = 1 AND removed_at IS NULL AND start_ms < ? AND end_ms > ?
      UNION ALL SELECT start_ms, end_ms FROM transcript_quiet WHERE video_id = ? AND removed_at IS NULL AND start_ms < ? AND end_ms > ?)`);
  const selectRedoPieces = db.prepare("SELECT id, start_ms AS startMs, end_ms AS endMs FROM transcript_pieces WHERE redo_id = ? AND video_id = ? ORDER BY start_ms ASC, created_at ASC");
  const selectPieceWords = db.prepare("SELECT id, start_ms AS startMs FROM transcript_words WHERE piece_id = ?");
  const standPiece = db.prepare("UPDATE transcript_pieces SET removed_at = NULL WHERE id = ?");
  const standWord = db.prepare("UPDATE transcript_words SET removed_at = NULL WHERE id = ?");
  const standRedoQuiet = db.prepare("UPDATE transcript_quiet SET removed_at = NULL WHERE redo_id = ? AND video_id = ?");

  /** A part asked to be transcribed again, widened to the edges of every piece and quiet standing over it: what stands aside when it's done is heard again whole, and each edge is one a chunk was cut at, in a pause. */
  function widened(videoId: string, asked: Stretch): Stretch {
    const over = selectStandingOver.get(videoId, asked.endMs, asked.startMs, videoId, asked.endMs, asked.startMs) as { startMs: number | null; endMs: number | null };
    return { startMs: Math.min(asked.startMs, over.startMs ?? asked.startMs), endMs: Math.max(asked.endMs, over.endMs ?? asked.endMs) };
  }

  /** The living words of the video's other pieces inside a piece's stretch that this piece heard farther from its own edge: they stand aside, so one word survives at each moment. */
  function outdo(videoId: string, pieceId: string, stretch: Stretch, now: number) {
    for (const w of selectWordsInside.all(videoId, pieceId, stretch.startMs, stretch.endMs) as InsideRow[]) {
      if (depth(w.startMs, stretch) > depth(w.startMs, { startMs: w.pieceStart, endMs: w.pieceEnd })) removeWord.run(now, w.id);
    }
  }
  const insertFix = db.prepare("INSERT INTO transcript_fixes (word_id, from_text, to_text, start_ms, end_ms, user_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const sumPieces = db.prepare("SELECT COALESCE(SUM(end_ms - start_ms), 0) AS ms FROM transcript_pieces");
  const selectPicture = db.prepare("SELECT mime, bytes FROM video_pictures WHERE video_id = ? AND picture = ?");
  const selectHasWords = db.prepare(`
    SELECT 1 FROM transcript_words w JOIN transcript_pieces p ON p.id = w.piece_id
    WHERE w.video_id = ? AND w.removed_at IS NULL AND p.removed_at IS NULL AND p.kept = 1 LIMIT 1`);
  const insertPicture = db.prepare("INSERT OR IGNORE INTO video_pictures (video_id, picture, mime, bytes, source, user_id, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const selectForvoRecording = db.prepare("SELECT word, by, country, mime, bytes FROM forvo_recordings WHERE forvo_id = ?");
  const hasForvoRecording = db.prepare("SELECT 1 FROM forvo_recordings WHERE forvo_id = ?");
  const insertForvoRecording = db.prepare("INSERT OR IGNORE INTO forvo_recordings (forvo_id, word, by, country, mime, bytes, user_id, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const selectForvoWord = db.prepare("SELECT voices FROM forvo_words WHERE word = ?");
  const insertForvoWord = db.prepare("INSERT OR IGNORE INTO forvo_words (word, voices, user_id, fetched_at) VALUES (?, ?, ?, ?)");

  /**
   * One group of the shared settings (how transcribing runs, where word audio comes from), each read over its defaults
   * key by key: a stored value that no longer fits its setting's rule reads as the default, normalised on read, never
   * rewritten. The groups share the one `settings` table; their keys don't meet.
   */
  function groupFrom<T extends Record<string, unknown>>({ shape, parse, defaults }: Group<T>, rows: SettingRow[]): T {
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const merged: Record<string, unknown> = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const raw = stored.get(key);
      if (raw === undefined) continue;
      const parsed = shape[key]?.safeParse(JSON.parse(raw));
      if (parsed?.success) merged[key] = parsed.data;
    }
    return parse(merged);
  }
  /** Each setting of a group given is stored when it differs from what it reads as now, with a row of what it changed from and to, and who changed it. */
  function updateGroup<T extends Record<string, unknown>>(group: Group<T>, patch: Partial<T>, now: number, userId: string): T {
    return transaction(() => {
      const before = groupFrom(group, selectSettings.all() as SettingRow[]);
      for (const key of Object.keys(group.defaults) as (keyof T & string)[]) {
        const value = patch[key];
        if (value === undefined) continue;
        const [from, to] = [JSON.stringify(before[key]), JSON.stringify(value)];
        if (from === to) continue;
        upsertSetting.run(key, to);
        insertSettingChange.run(key, from, to, now, userId);
      }
      return groupFrom(group, selectSettings.all() as SettingRow[]);
    });
  }
  const transcriptionFrom = (rows: SettingRow[]): Transcription => groupFrom(TRANSCRIPTION, rows);

  return {
    /** The key kept for a service, typed in Settings; null when there's none. Read only to call that service, never sent back. */
    key(service: Service): string | null {
      const row = selectKey.get(service) as { key: string } | undefined;
      return row?.key ?? null;
    },
    /** Keeps a service's key, or forgets it (null). That it was set or forgotten, when and by whom is kept; the key's old values are not. */
    setKey(service: Service, key: string | null, now: number, userId: string): void {
      transaction(() => {
        if (key === null) deleteKey.run(service);
        else upsertKey.run(service, key, now);
        insertKeyChange.run(service, key === null ? "forgotten" : "set", now, userId);
      });
    },
    /** One request made to a service that counts them. */
    recordCall(service: Service, now: number): void {
      insertCall.run(service, now);
    },
    /** How many requests went to a service since a moment. */
    callsSince(service: Service, since: number): number {
      return (countCalls.get(service, since) as { n: number }).n;
    },

    /** Which of these videos Panki has subtitles for: a word heard in it that still stands, from a piece kept and standing. */
    transcribedOf(videoIds: readonly string[]): Set<string> {
      return new Set(videoIds.filter((videoId) => selectHasWords.get(videoId) !== undefined));
    },

    /** One of a video's pictures as it was kept; null when it hasn't been yet. */
    picture(videoId: string, picture: VideoPicture): { mime: string; bytes: Buffer } | null {
      const row = selectPicture.get(videoId, picture) as { mime: string; bytes: Uint8Array } | undefined;
      return row ? { mime: row.mime, bytes: Buffer.from(row.bytes) } : null;
    },
    /** Keeps one of a video's pictures, once: the first kept stays, whoever asks after. `source` is where it was fetched from. */
    keepPicture(videoId: string, picture: VideoPicture, kept: { mime: string; bytes: Buffer }, source: string, now: number, userId: string): void {
      insertPicture.run(videoId, picture, kept.mime, kept.bytes, source, userId, now);
    },

    /** A Forvo recording as it was kept for everyone; null when nobody has picked it yet. */
    forvoRecording(forvoId: number): SharedRecording | null {
      const row = selectForvoRecording.get(forvoId) as (Omit<SharedRecording, "bytes"> & { bytes: Uint8Array }) | undefined;
      return row ? { ...row, bytes: Buffer.from(row.bytes) } : null;
    },
    hasForvoRecording(forvoId: number): boolean {
      return hasForvoRecording.get(forvoId) !== undefined;
    },
    /** Keeps a Forvo recording for everyone, once: the first kept stays. */
    keepForvoRecording(forvoId: number, recording: SharedRecording, userId: string, now: number): void {
      insertForvoRecording.run(forvoId, recording.word, recording.by, recording.country, recording.mime, recording.bytes, userId, now);
    },
    /** A word's recordings as they were kept the one time it was asked of Forvo; null for a word never asked for. */
    forvoWord(word: string): ForvoVoice[] | null {
      const row = selectForvoWord.get(word) as { voices: string } | undefined;
      if (!row) return null;
      const voices = z.array(ForvoVoice).safeParse(JSON.parse(row.voices));
      return voices.success ? voices.data : null;
    },
    /** Keeps a word's recordings, once: the first kept stays. */
    keepForvoWord(word: string, voices: readonly ForvoVoice[], userId: string, now: number): void {
      insertForvoWord.run(word, JSON.stringify(voices), userId, now);
    },

    /** The dictionaries kept on Panki, oldest first. */
    listDictionaryFiles(): ServerDictionary[] {
      return selectDictionaryFiles.all().map(dictionaryOf);
    },
    /** One kept dictionary; null when there's none by that id (or it was removed). */
    getDictionaryFile(id: string): ServerDictionary | null {
      const row = selectDictionaryFile.get(id);
      return row ? dictionaryOf(row) : null;
    },
    /** The kept dictionary called this, if there is one: two of the same name would be one dictionary twice. */
    dictionaryFileTitled(title: string): ServerDictionary | null {
      const row = selectDictionaryFileByTitle.get(title);
      return row ? dictionaryOf(row) : null;
    },
    /** What a kept dictionary was counted to provide. Counted once: a count already kept stays. */
    setDictionaryProvides(id: string, provides: Provides): void {
      setDictionaryProvides.run(JSON.stringify(provides), id);
    },
    /** The hash of the bytes an id already names, removed or not; null when the id is free. */
    dictionaryFileHash(id: string): string | null {
      const row = selectDictionaryFileHash.get(id) as { sha256: string } | undefined;
      return row?.sha256 ?? null;
    },
    /** Idempotent: the same id again returns the row that's already there, untouched. `uploadedAt` is the API's clock, or the time a moved row already had. */
    insertDictionaryFile(file: Omit<ServerDictionary, "uploadedAt"> & { sha256: string }, uploadedBy: string, uploadedAt: number): ServerDictionary {
      insertDictionaryFile.run(file.id, file.title, file.revision, file.description, file.bytes, file.provides && JSON.stringify(file.provides), file.sha256, uploadedAt, uploadedBy);
      return dictionaryOf(selectAnyDictionaryFile.get(file.id));
    },
    /** Takes one off the list, keeping its row with the time it went and who took it off; whether there was one to take off. */
    removeDictionaryFile(id: string, now: number, userId: string): boolean {
      return removeDictionaryFile.run(now, userId, id).changes > 0;
    },

    getTranscription(): Transcription {
      return transcriptionFrom(selectSettings.all() as SettingRow[]);
    },
    updateTranscription(patch: TranscriptionUpdate, now: number, userId: string): Transcription {
      return updateGroup(TRANSCRIPTION, patch, now, userId);
    },
    /** Where word audio comes from, for everyone. */
    getWordAudio(): WordAudio {
      return groupFrom(WORD_AUDIO, selectSettings.all() as SettingRow[]);
    },
    updateWordAudio(patch: WordAudioUpdate, now: number, userId: string): WordAudio {
      return updateGroup(WORD_AUDIO, patch, now, userId);
    },
    /** How watching is told, for everyone (`WatchingSettings`): when a video counts as watched to its end. */
    getWatching(): WatchingSettings {
      return groupFrom(WATCHING, selectSettings.all() as SettingRow[]);
    },
    updateWatching(patch: WatchingSettingsUpdate, now: number, userId: string): WatchingSettings {
      return updateGroup(WATCHING, patch, now, userId);
    },

    /**
     * A video's transcript as it stands: the living words in order, each as its latest fix (one fixed to nothing left
     * out), the stretches kept so far, and its latest whole-video download. A video never transcribed is empty.
     */
    transcript(videoId: string): Transcript {
      const row = selectTranscript.get(videoId) as { language: string | null } | undefined;
      const words: TranscriptWord[] = (selectWords.all(videoId) as WordRow[]).flatMap((w) => {
        const now = wordOf(w);
        return now.text === "" ? [] : [{ ...now, ...(w.fixed === null ? {} : { heard: w.heard }) }];
      });
      const job = selectLatestJob.get(videoId) as JobRow | undefined;
      return Transcript.parse({
        videoId,
        language: row?.language ?? null,
        words,
        covered: mergeStretches(selectKeptStretches.all(videoId, videoId) as StretchRow[]),
        job: job ? wholeJobOf(job) : null,
      });
    },
    /** Whether a whole video's own pieces, standing, cover a stretch of it: a chunk of that stretch isn't sent to the engine again. */
    coveredByJob(videoId: string, startMs: number, endMs: number): boolean {
      const over = mergeStretches(selectJobPiecesOver.all(videoId, endMs, startMs) as StretchRow[]);
      return over.some((stretch) => stretch.startMs <= startMs + MERGE_GAP_MS && stretch.endMs >= endMs - MERGE_GAP_MS);
    },
    /** Whether the video already has this piece (or this stretch of nothing): sent again, it's the one that's there. */
    hasPiece(videoId: string, pieceId: string): boolean {
      return selectPiece.get(pieceId, videoId) !== undefined || selectQuiet.get(pieceId, videoId) !== undefined;
    },
    /** A stretch listened through with nothing to send: covered from now on (a part's being transcribed again: once it's done), no engine asked. The same one again changes nothing. */
    insertQuiet(quiet: NewQuiet, now: number): void {
      transaction(() => {
        insertTranscript.run(quiet.videoId, now, now);
        if (quiet.redoId !== null) {
          insertRedoQuiet.run(quiet.id, quiet.videoId, quiet.startMs, quiet.endMs, quiet.userId, now, quiet.redoId, now);
          return;
        }
        const added = insertQuiet.run(quiet.id, quiet.videoId, quiet.startMs, quiet.endMs, quiet.userId, now);
        if (added.changes > 0) touchTranscript.run(now, quiet.videoId);
      });
    },
    /**
     * A piece and the words it heard, in one transaction. The same piece again (a retry) changes nothing. When its words
     * are kept they're stitched to the neighbours': the extension cuts where nobody speaks, but a forced cut or a jump
     * makes two pieces that overlap by a second or two, both hearing the word at the edge. By geometry alone, the piece
     * that heard a moment farther from its own edge keeps its word; the other's stands aside (`removed_at`), so exactly
     * one survives at each moment. A new word that loses is still written, with `removed_at` set as it lands. A piece of
     * a part being transcribed again is written standing aside, its quiet and words with it, and stitched when the part
     * is done (`finishRedo`).
     */
    insertPiece(piece: NewPiece, words: readonly NewWord[], now: number): void {
      transaction(() => {
        insertTranscript.run(piece.videoId, now, now);
        if (piece.redoId !== null) {
          const staged = insertRedoPiece.run(
            piece.id,
            piece.videoId,
            piece.startMs,
            piece.endMs,
            piece.engine,
            piece.language.code,
            piece.language.probability,
            piece.userId,
            now,
            piece.engineMs,
            piece.runMs,
            piece.redoId,
            now,
          );
          if (staged.changes === 0) return;
          if (piece.heardFrom < piece.startMs) insertRedoQuiet.run(piece.id, piece.videoId, piece.heardFrom, piece.startMs, piece.userId, now, piece.redoId, now);
          for (const v of words) insertWord.run(piece.videoId, piece.id, v.text, v.startMs, v.endMs, now);
          return;
        }
        const added = insertPiece.run(
          piece.id,
          piece.videoId,
          piece.startMs,
          piece.endMs,
          piece.engine,
          piece.language.code,
          piece.language.probability,
          // Never asked the language (`checked`), and its words always kept.
          0,
          1,
          piece.userId,
          now,
          piece.engineMs,
          piece.runMs,
        );
        if (added.changes === 0) return;
        // The quiet listened through before the sound: heard, covered, under the piece's own id.
        if (piece.heardFrom < piece.startMs) insertQuiet.run(piece.id, piece.videoId, piece.heardFrom, piece.startMs, piece.userId, now);
        // The video's language is the one it was told, once words are heard in it.
        if (words.length > 0) tellTranscriptLanguage.run(piece.told, now, piece.videoId, piece.told);
        else touchTranscript.run(now, piece.videoId);
        const stretch: Stretch = { startMs: piece.startMs, endMs: piece.endMs };
        outdo(piece.videoId, piece.id, stretch, now);
        const others = selectPiecesOver.all(piece.videoId, piece.id, piece.endMs, piece.startMs) as StretchRow[];
        for (const v of words) insertWord.run(piece.videoId, piece.id, v.text, v.startMs, v.endMs, beaten(others, v.startMs, stretch) ? now : null);
      });
    },
    /**
     * A transcript forgotten, a stretch of it or the whole (null): every piece and every quiet reaching into the stretch
     * stands aside with its words (`removed_at`, never deleted), so the stretch is uncovered and transcribed afresh when
     * a run passes it; the whole video forgotten forgets what language it was heard as too, to start from scratch. What
     * was paid for stays counted (`secondsTranscribed`). The ask itself is kept (`transcript_forgets`), with who made it.
     */
    forget(videoId: string, stretch: Stretch | null, now: number, userId: string): void {
      transaction(() => {
        // A video asked about is one the store knows, so the ask has a transcript to belong to (an empty one, when it was never heard).
        insertTranscript.run(videoId, now, now);
        insertForget.run(videoId, stretch?.startMs ?? null, stretch?.endMs ?? null, userId, now);
        const startMs = stretch?.startMs ?? 0;
        const endMs = stretch?.endMs ?? Number.MAX_SAFE_INTEGER;
        forgetPieces.run(now, videoId, endMs, startMs);
        forgetPieceWords.run(now, videoId, videoId, now);
        forgetQuiet.run(now, videoId, endMs, startMs);
        if (stretch === null) forgetLanguage.run(now, videoId);
        else touchTranscript.run(now, videoId);
      });
    },
    /**
     * A part of a video asked to be transcribed again: widened to the edges of every piece and quiet reaching into it
     * (what will stand aside when it's done, so it's heard again whole and leaves no hole), and kept as under way. The
     * same ask again is the one there; null when its id is another video's.
     */
    startRedo(redo: { id: string; videoId: string; asked: Stretch; userId: string }, now: number): Redo | null {
      return transaction(() => {
        insertTranscript.run(redo.videoId, now, now);
        const { startMs, endMs } = widened(redo.videoId, redo.asked);
        insertRedo.run(redo.id, redo.videoId, redo.asked.startMs, redo.asked.endMs, startMs, endMs, redo.userId, now);
        const row = selectRedo.get(redo.id, redo.videoId) as RedoRow | undefined;
        return row ? { id: row.id, startMs: row.startMs, endMs: row.endMs } : null;
      });
    },
    /** What a part would widen to if it were asked to be transcribed again now: said as it's typed, so the times typed are the times done. */
    redoStretch(videoId: string, asked: Stretch): Stretch {
      return widened(videoId, asked);
    },
    /** Whether a part of the video is being transcribed again under this id: its pieces are taken only while it is. */
    redoRunning(videoId: string, redoId: string): boolean {
      return (selectRedo.get(redoId, videoId) as RedoRow | undefined)?.state === "running";
    },
    /**
     * A part transcribed again, done: in one transaction, what stood over the part asked stands aside, as a forget would
     * have it, and the part's own pieces stand in its place, one at a time in order, each stitched to what stands as a
     * new piece is (`insertPiece`), with their quiet. False when it isn't under way (done, cancelled, or not this video's).
     */
    finishRedo(videoId: string, redoId: string, told: string, now: number): boolean {
      return transaction(() => {
        const redo = selectRedo.get(redoId, videoId) as RedoRow | undefined;
        if (!redo || redo.state !== "running") return false;
        forgetPieces.run(now, videoId, redo.askedEnd, redo.askedStart);
        forgetPieceWords.run(now, videoId, videoId, now);
        forgetQuiet.run(now, videoId, redo.askedEnd, redo.askedStart);
        let heard = 0;
        for (const piece of selectRedoPieces.all(redoId, videoId) as { id: string; startMs: number; endMs: number }[]) {
          standPiece.run(piece.id);
          const stretch: Stretch = { startMs: piece.startMs, endMs: piece.endMs };
          outdo(videoId, piece.id, stretch, now);
          const others = selectPiecesOver.all(videoId, piece.id, piece.endMs, piece.startMs) as StretchRow[];
          for (const word of selectPieceWords.all(piece.id) as { id: number; startMs: number }[]) {
            if (beaten(others, word.startMs, stretch)) removeWord.run(now, word.id);
            else {
              standWord.run(word.id);
              heard++;
            }
          }
        }
        standRedoQuiet.run(redoId, videoId);
        if (heard > 0) tellTranscriptLanguage.run(told, now, videoId, told);
        else touchTranscript.run(now, videoId);
        endRedo.run("done", now, redoId);
        return true;
      });
    },
    /** A part being transcribed again given up: what it heard stays aside, paid for and kept; the transcript is as it was. */
    cancelRedo(videoId: string, redoId: string, now: number): void {
      const redo = selectRedo.get(redoId, videoId) as RedoRow | undefined;
      if (redo?.state === "running") endRedo.run("cancelled", now, redoId);
    },
    /** A word changed by hand: a fix from what it reads as now, where it stands now. False when no living word with that id is the video's; the same text again changes nothing. */
    fixWord(videoId: string, wordId: number, text: string, userId: string, now: number): boolean {
      return transaction(() => {
        const row = selectLivingWord.get(wordId, videoId) as WordRow | undefined;
        const current = row ? wordOf(row) : null;
        if (!current || current.text === "") return false;
        if (current.text !== text) insertFix.run(wordId, current.text, text, current.startMs, current.endMs, userId, now);
        return true;
      });
    },
    /**
     * A line fixed by hand (the pencil): what it says now laid back onto its words (`realignLine`), each keeping its
     * place in the line as its ends move, and every word that changed in text or time a fix of its own, kept beside the
     * engine's. False when one of the words isn't a living word of the video's.
     */
    fixLine(videoId: string, fix: TranscriptLineFix, userId: string, now: number): boolean {
      return transaction(() => {
        const words: LineWord[] = [];
        for (const id of new Set(fix.wordIds)) {
          const row = selectLivingWord.get(id, videoId) as WordRow | undefined;
          const current = row ? wordOf(row) : null;
          if (!current || current.text === "") return false;
          words.push({ ...current, text: current.text.trim() });
        }
        words.sort((a, b) => a.startMs - b.startMs || a.id - b.id);
        const fixed = realignLine(words, fix.text, fix.startMs, fix.endMs);
        fixed.forEach((after, i) => {
          const before = words[i];
          if (!before || (after.text === before.text && after.startMs === before.startMs && after.endMs === before.endMs)) return;
          insertFix.run(after.id, before.text, after.text, after.startMs, after.endMs, userId, now);
        });
        touchTranscript.run(now, videoId);
        return true;
      });
    },

    /** A whole-video download asked for, running from now; the video is one the store knows from here on. */
    insertJob(job: NewJob, now: number): WholeJob {
      return transaction(() => {
        insertTranscript.run(job.videoId, now, now);
        insertJob.run(job.id, job.videoId, job.engine, job.language, job.lengthMs, now, job.userId);
        return wholeJobOf(selectJob.get(job.id) as JobRow);
      });
    },
    /** A download as it's kept; null for none by that id. */
    job(id: string): JobRow | null {
      return (selectJob.get(id) as JobRow | undefined) ?? null;
    },
    /** The video's download under way, if one is: a second isn't asked for. */
    runningJob(videoId: string): WholeJob | null {
      const job = selectLatestJob.get(videoId) as JobRow | undefined;
      return job && job.state === "running" ? wholeJobOf(job) : null;
    },
    /** Every download still running, as at a start of the API: one the API stopped under is taken up again. */
    runningJobs(): JobRow[] {
      return selectRunningJobs.all() as JobRow[];
    },
    /** A download handed to the engine now: how many times it has been, with this one. */
    startJob(id: string, now: number): number {
      startJob.run(now, id);
      return (selectJob.get(id) as JobRow | undefined)?.attempts ?? 0;
    },
    /** A download that came to nothing, and why, in the owner's words. What the video had stays as it was. */
    failJob(id: string, message: string, now: number): void {
      failJob.run(now, message, id);
    },
    /**
     * A download done: its words replace everything the video had (the owner, 2026-10-20: "the latest one overwrites"),
     * in one transaction. Every chunk, every quiet and any earlier download's pieces stand aside with their words, and
     * with them the hand fixes on those words; the download's words are kept under pieces of its own, about half a
     * minute each (`piecesOfVideo`), covering the whole video. What it cost is kept with it: the credits the engine
     * counted across it, and the sound they paid for (the video, and the chunks sent to the same engine meanwhile).
     */
    finishJob(id: string, heard: { language: HeardLanguage; words: readonly NewWord[] }, credits: number | null, now: number): JobRow | null {
      return transaction(() => {
        const job = selectJob.get(id) as JobRow | undefined;
        if (!job || job.state !== "running") return null;
        const replaced = (countChunks.get(job.videoId) as { n: number }).n;
        forgetPieces.run(now, job.videoId, Number.MAX_SAFE_INTEGER, 0);
        forgetPieceWords.run(now, job.videoId, job.videoId, now);
        forgetQuiet.run(now, job.videoId, Number.MAX_SAFE_INTEGER, 0);
        for (const piece of piecesOfVideo(heard.words, job.lengthMs)) {
          const pieceId = randomUUID();
          insertJobPiece.run(pieceId, job.videoId, piece.startMs, piece.endMs, job.engine, heard.language.code, heard.language.probability, job.userId, now, job.id);
          for (const w of piece.words) insertWord.run(job.videoId, pieceId, w.text, w.startMs, w.endMs, null);
        }
        if (heard.words.length > 0) tellTranscriptLanguage.run(job.language, now, job.videoId, job.language);
        else touchTranscript.run(now, job.videoId);
        const chunks = job.startedAt === null ? 0 : (sumChunkSound.get(job.engine, job.startedAt, now) as { ms: number }).ms;
        doneJob.run(now, heard.words.length, replaced, credits, job.lengthMs + chunks, id);
        return selectJob.get(id) as JobRow;
      });
    },
    /**
     * How long a whole-video download takes, and how soon a chunk run's first words come, from what was measured on
     * this engine over the last 30 days: the middle of each (`TranscribeEstimate`). Time alone: what it costs is the
     * engine's listed price (`ENGINES`); the credits kept with each download are its record, not an estimate.
     */
    estimate(engine: EngineId, now: number): TranscribeEstimate {
      const since = now - ESTIMATE_MS;
      const jobs = selectDoneJobs.all(engine, since) as { lengthMs: number; startedAt: number | null; endedAt: number | null }[];
      const perMinute = jobs.flatMap((j) => (j.startedAt === null || j.endedAt === null || j.lengthMs <= 0 ? [] : [(j.endedAt - j.startedAt) / 1000 / (j.lengthMs / 60_000)]));
      const firstWords = (selectFirstWords.all(engine, since) as { ms: number }[]).map((row) => row.ms);
      const length = median(jobs.map((j) => j.lengthMs));
      const first = median(firstWords);
      return {
        jobs: jobs.length,
        secondsPerMinute: median(perMinute),
        lengthMs: length === null ? null : Math.round(length),
        firstWordsMs: first === null ? null : Math.round(first),
      };
    },
    /** How much sound has been sent to engines so far, every video and everyone counted, in whole seconds. */
    secondsTranscribed(): number {
      const { ms } = sumPieces.get() as { ms: number };
      return Math.floor(ms / 1000);
    },

    close() {
      db.close();
    },
  };
}

/** A file moved across the disk; across two file systems (`EXDEV`) it's copied, and the copy stands before the original goes. */
function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (e) {
    const code = typeof e === "object" && e !== null && "code" in e ? e.code : undefined;
    if (code !== "EXDEV") throw e;
    copyFileSync(from, to);
    rmSync(from, { force: true });
  }
}

/**
 * What each kept dictionary not counted yet provides (one kept before Panki counted them, or moved from an account),
 * counted from its zip, one at a time, while the API serves: the list says "counting" for it until then. One whose zip
 * can't be read is said and left uncounted.
 */
export async function countDictionaries(shared: Shared, dir: string): Promise<void> {
  for (const dictionary of shared.listDictionaryFiles()) {
    if (dictionary.provides !== null) continue;
    try {
      const { entries, index } = await openDictionary(new Blob([readFileSync(path.join(dir, dictionary.id))]));
      shared.setDictionaryProvides(dictionary.id, await providesOf(entries, index));
      console.log(`Counted what ${dictionary.title} provides.`);
    } catch (e) {
      console.error(`Couldn't count what ${dictionary.title} provides.`, e);
    }
  }
}

/**
 * Until 2026-10-17 the Forvo key and the dictionaries kept on Panki were each account's own. They're everyone's now, and
 * what accounts held moves over here, once, at startup. Every row moved is marked, so running it again moves nothing;
 * one account's trouble is said and doesn't keep the API from starting.
 */
export function gatherShared(shared: Shared, dataDir: string, auth: AuthDb, dbFor: (userId: string) => Db, now: () => number): void {
  const toDir = sharedDictionaryDir(dataDir);
  for (const user of auth.listUsers()) {
    try {
      const db = dbFor(user.id);
      gatherForvoKey(shared, db, user, now);
      gatherDictionaries(shared, db, dictionaryDir(userDir(dataDir, user.id)), toDir, user, now);
      gatherForvoRecordings(shared, db, mediaDir(userDir(dataDir, user.id)), user);
    } catch (e) {
      console.error(`Couldn't move what ${user.name} held into the shared store; the API starts without it.`, e);
    }
  }
}

/** The first key found becomes everyone's; a second account's, when it's another key, is left where it is and said. */
function gatherForvoKey(shared: Shared, db: Db, user: User, now: () => number): void {
  const own = db.forvoKey();
  if (own === null) return;
  const kept = shared.key("forvo");
  if (kept !== null && kept !== own) {
    console.log(`${user.name}'s account has a Forvo key of its own; the shared one is used, and theirs is left where it is.`);
    return;
  }
  // Written to the shared store before it's taken from the account, so a stop between the two loses nothing: the next
  // start finds the same key in both and takes the account's.
  if (kept === null) shared.setKey("forvo", own, now(), user.id);
  db.takeForvoKey(now());
  console.log(`Moved ${user.name}'s Forvo key to the shared store.`);
}

/**
 * Each Forvo recording the account kept a file of before they were everyone's, copied into the shared store when it
 * isn't there yet: the account's file stays, since its cards name it. Read from the disk as it is; one whose file is
 * missing is passed over.
 */
function gatherForvoRecordings(shared: Shared, db: Db, fromDir: string, user: User): void {
  let gathered = 0;
  for (const recording of db.forvoRecordings()) {
    if (shared.hasForvoRecording(recording.forvoId)) continue;
    const file = path.join(fromDir, recording.mediaId);
    if (!existsSync(file)) continue;
    const { forvoId, mediaId: _file, fetchedAt, ...said } = recording;
    shared.keepForvoRecording(forvoId, { ...said, mime: "audio/mpeg", bytes: readFileSync(file) }, user.id, fetchedAt);
    gathered++;
  }
  if (gathered > 0) console.log(`Copied ${gathered} of ${user.name}'s Forvo recordings to the shared store.`);
}

/** Each unmoved dictionary: its zip into the shared folder and its row into the shared store, or let go when the owner has it already. */
function gatherDictionaries(shared: Shared, db: Db, fromDir: string, toDir: string, user: User, now: () => number): void {
  for (const file of db.dictionaryFilesToMove()) {
    const from = path.join(fromDir, file.id);
    const to = path.join(toDir, file.id);
    if (shared.dictionaryFileTitled(file.title)) {
      // The owner has it already: the account's is a copy of a file they have, let go for the room.
      db.markDictionaryMoved(file.id, now());
      removeFile(fromDir, file.id);
      console.log(`${file.title} from ${user.name} is on Panki already; their copy was let go.`);
      continue;
    }
    if (existsSync(from)) {
      mkdirSync(toDir, { recursive: true });
      moveFile(from, to);
    }
    // The zip may already be across (a stop between the move and the row): the row is made for it either way.
    if (!existsSync(to)) {
      db.markDictionaryMoved(file.id, now());
      console.log(`${file.title} from ${user.name} has no zip on the disk; its row was marked and nothing moved.`);
      continue;
    }
    const { sha256, uploadedAt, ...rest } = file;
    // What it provides is counted after, with every other dictionary not counted yet (`countDictionaries`).
    shared.insertDictionaryFile({ ...rest, provides: null, sha256 }, user.id, uploadedAt);
    db.markDictionaryMoved(file.id, now());
    console.log(`Moved ${file.title} from ${user.name} to the shared store.`);
  }
}
