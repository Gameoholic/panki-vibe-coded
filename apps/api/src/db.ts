import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  BURNED_PLACE,
  Card,
  CardField,
  CardPlace,
  CardType,
  DEFAULT_DECK_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_STARTER,
  Deck,
  DeckSettings,
  Media,
  MediaCues,
  SRS_STARTER_IDS,
  NEW_PLACE,
  ReviewSession,
  ServerDictionary,
  Settings,
  SrsType,
  Stats,
  dueAt,
  holdsWords,
  isBurned,
  isNew,
  layoutOf,
  mainAnswers,
  makeStarter,
  resolve,
  sideOf,
  stageIndex,
  upgradeFlow,
  type CardAnswer,
  type CardTypeUpdate,
  type CardUpdate,
  type DeckUpdate,
  type NewCard,
  type NewCardType,
  type NewDeck,
  type NewEvent,
  type NewReviewSession,
  type NewSrsType,
  type ReviewSessionEnd,
  type SettingsUpdate,
  type SrsLadder,
  type SrsStarterId,
  type SrsTypeUpdate,
} from "@panki/contracts";
import { addDays, checkTimeZone, dayOf, dayStartAt, daysBetween, weekdayOf, type Day } from "./time";

export type Db = ReturnType<typeof openDb>;

/**
 * Each migration runs once, in order, inside a transaction; SQLite's `user_version` records how far we got.
 * Old rows are brought up to the new shape here, never rewritten elsewhere.
 */
const MIGRATIONS: ReadonlyArray<(db: DatabaseSync, now: number) => void> = [
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        word TEXT NOT NULL,
        reading TEXT NOT NULL DEFAULT '',
        meaning TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  },
  (db, now) => {
    db.exec(`
      CREATE TABLE decks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    db.exec("ALTER TABLE cards ADD COLUMN deck_id TEXT REFERENCES decks(id)");
    // Cards from before decks existed go into one deck; the name is a placeholder the owner renames.
    const orphaned = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE deck_id IS NULL").get() as { n: number };
    if (orphaned.n > 0) {
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO decks (id, name, created_at) VALUES (?, ?, ?)").run(id, "Default", now);
      db.prepare("UPDATE cards SET deck_id = ? WHERE deck_id IS NULL").run(id);
    }
    db.exec("CREATE INDEX cards_deck_id ON cards (deck_id)");
  },
  (db) => {
    // Deleting hides, never destroys: a removed deck and its cards stay, with when they were removed.
    db.exec("ALTER TABLE decks ADD COLUMN removed_at INTEGER");
    // Renaming keeps what it changed from and to.
    db.exec(`
      CREATE TABLE deck_renames (
        id INTEGER PRIMARY KEY,
        deck_id TEXT NOT NULL REFERENCES decks(id),
        from_name TEXT NOT NULL,
        to_name TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX deck_renames_deck_id ON deck_renames (deck_id)");
  },
  (db, now) => {
    // Card types: what a card is made of. Every deck has one; a card's text lives per field.
    db.exec(`
      CREATE TABLE card_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
    db.exec(`
      CREATE TABLE card_fields (
        id TEXT PRIMARY KEY,
        type_id TEXT NOT NULL REFERENCES card_types(id),
        name TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('front', 'back')),
        required INTEGER NOT NULL,
        position INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
    db.exec("CREATE INDEX card_fields_type_id ON card_fields (type_id)");
    db.exec(`
      CREATE TABLE card_type_renames (
        id INTEGER PRIMARY KEY,
        type_id TEXT NOT NULL REFERENCES card_types(id),
        from_name TEXT NOT NULL,
        to_name TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("ALTER TABLE decks ADD COLUMN type_id TEXT REFERENCES card_types(id)");
    db.exec(`
      CREATE TABLE card_values (
        card_id TEXT NOT NULL REFERENCES cards(id),
        field_id TEXT NOT NULL REFERENCES card_fields(id),
        value TEXT NOT NULL,
        PRIMARY KEY (card_id, field_id)
      )
    `);
    // The starter type is what every card was until now. A placeholder the owner renames and reshapes like any other;
    // every deck so far gets it, and each card's three columns become its three values. Then the columns go: the
    // text now lives in card_values, nothing is lost.
    const typeId = crypto.randomUUID();
    db.prepare("INSERT INTO card_types (id, name, created_at) VALUES (?, ?, ?)").run(typeId, "Word", now);
    const insertField = db.prepare("INSERT INTO card_fields (id, type_id, name, side, required, position) VALUES (?, ?, ?, ?, ?, ?)");
    const starter: ReadonlyArray<{ name: string; side: string; required: number; column: "word" | "reading" | "meaning" }> = [
      { name: "Word", side: "front", required: 1, column: "word" },
      { name: "Reading", side: "back", required: 0, column: "reading" },
      { name: "Meaning", side: "back", required: 1, column: "meaning" },
    ];
    starter.forEach((field, position) => {
      const fieldId = crypto.randomUUID();
      insertField.run(fieldId, typeId, field.name, field.side, field.required, position);
      db.prepare(`INSERT INTO card_values (card_id, field_id, value) SELECT id, ?, ${field.column} FROM cards`).run(fieldId);
    });
    db.prepare("UPDATE decks SET type_id = ?").run(typeId);
    for (const column of ["word", "reading", "meaning"]) db.exec(`ALTER TABLE cards DROP COLUMN ${column}`);
  },
  (db) => {
    // What a field holds: one line of text, or several. The ids are the contracts' FieldKind; there's no CHECK here on
    // purpose, so a new kind is one registry entry and not a migration. Every field so far holds one line.
    db.exec("ALTER TABLE card_fields ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'");
  },
  (db, now) => {
    // The SRS: a ladder of stages a card climbs, and what each answer does. A type's rules (flow, overrides) are JSON
    // trees keyed by answer and stage ids. No CHECK on `after` or `wait_unit`: the ids are the contracts' enums, so a
    // new one is no migration. `after` and `before` are SQLite keywords, hence the quotes.
    db.exec(`
      CREATE TABLE srs_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        "after" TEXT NOT NULL,
        grow_by REAL NOT NULL,
        burned_name TEXT NOT NULL,
        flow TEXT NOT NULL,
        overrides TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
    db.exec(`
      CREATE TABLE srs_stages (
        id TEXT PRIMARY KEY,
        type_id TEXT NOT NULL REFERENCES srs_types(id),
        name TEXT NOT NULL,
        wait_n INTEGER NOT NULL,
        wait_unit TEXT NOT NULL,
        position INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
    db.exec("CREATE INDEX srs_stages_type_id ON srs_stages (type_id)");
    db.exec(`
      CREATE TABLE srs_answers (
        id TEXT PRIMARY KEY,
        type_id TEXT NOT NULL REFERENCES srs_types(id),
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
    db.exec("CREATE INDEX srs_answers_type_id ON srs_answers (type_id)");
    // Every save that changed a type keeps the whole type from before and after, as JSON.
    db.exec(`
      CREATE TABLE srs_type_changes (
        id INTEGER PRIMARY KEY,
        type_id TEXT NOT NULL REFERENCES srs_types(id),
        "before" TEXT NOT NULL,
        "after" TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("ALTER TABLE decks ADD COLUMN srs_type_id TEXT REFERENCES srs_types(id)");
    db.exec(`
      CREATE TABLE deck_srs_changes (
        id INTEGER PRIMARY KEY,
        deck_id TEXT NOT NULL REFERENCES decks(id),
        from_type_id TEXT NOT NULL,
        to_type_id TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    // Where a card stands is never written on the card: one row every time its place changes (an answer, the deck
    // switching type, its stage being hidden), and its place is its last row's `_to` columns; no rows means new.
    db.exec(`
      CREATE TABLE card_places (
        id INTEGER PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id),
        at INTEGER NOT NULL,
        reason TEXT NOT NULL,
        answer_id TEXT REFERENCES srs_answers(id),
        stage_from TEXT REFERENCES srs_stages(id),
        past_from INTEGER NOT NULL,
        node_from TEXT NOT NULL,
        burned_from INTEGER NOT NULL,
        stage_to TEXT REFERENCES srs_stages(id),
        past_to INTEGER NOT NULL,
        node_to TEXT NOT NULL,
        burned_to INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX card_places_card_id ON card_places (card_id)");
    // Only the settings the owner changed are stored, as JSON; the rest read as the contracts' defaults, so a new
    // setting is no migration.
    db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.exec(`
      CREATE TABLE settings_changes (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL,
        from_value TEXT NOT NULL,
        to_value TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    // The starter types are placeholders the owner renames and reshapes like any other; every deck so far goes on the
    // default one. The SQL is inlined, not shared with openDb, so this migration stays true to the schema it ran on.
    const insertType = db.prepare(`INSERT INTO srs_types (id, name, "after", grow_by, burned_name, flow, overrides, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertStage = db.prepare("INSERT INTO srs_stages (id, type_id, name, wait_n, wait_unit, position) VALUES (?, ?, ?, ?, ?, ?)");
    const insertAnswer = db.prepare("INSERT INTO srs_answers (id, type_id, name, position) VALUES (?, ?, ?, ?)");
    const made = new Map<SrsStarterId, string>();
    // A millisecond apart, so the list keeps this order (the default first) rather than sorting them by id.
    // (Three starters were made here once; the types that come with the app are openDb's to make now, and this one
    // only gives the decks of that time something to stand on until then.)
    [DEFAULT_STARTER].forEach((starter, i) => {
      const type = makeStarter(starter, () => crypto.randomUUID());
      insertType.run(type.id, type.name, type.after, type.growBy, type.burnedName, JSON.stringify(type.flow), JSON.stringify(type.overrides), now + i);
      type.stages.forEach((s, i) => insertStage.run(s.id, type.id, s.name, s.wait.n, s.wait.unit, i));
      type.answers.forEach((a, i) => insertAnswer.run(a.id, type.id, a.name, i));
      made.set(starter, type.id);
    });
    const defaultId = made.get(DEFAULT_STARTER);
    if (!defaultId) throw new Error("The default starter wasn't among the ones made.");
    db.prepare("UPDATE decks SET srs_type_id = ?").run(defaultId);
  },
  (db) => {
    // An answer can sit apart from the main ones on the review screen, and can ask before it's applied.
    db.exec("ALTER TABLE srs_answers ADD COLUMN aside INTEGER NOT NULL DEFAULT 0");
    db.exec("ALTER TABLE srs_answers ADD COLUMN confirm INTEGER NOT NULL DEFAULT 0");
  },
  (db) => {
    // The types that come with the app are marked with which one they are; openDb makes the ones a database lacks.
    db.exec("ALTER TABLE srs_types ADD COLUMN builtin TEXT");
  },
  (db) => {
    // What a type is, in the owner's words, beside the line worked out from its stages.
    db.exec("ALTER TABLE srs_types ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  },
  (db) => {
    // How a review runs is each deck's own: only what the owner changed is stored, as JSON, with a row per change.
    db.exec("ALTER TABLE decks ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'");
    db.exec(`
      CREATE TABLE deck_settings_changes (
        id INTEGER PRIMARY KEY,
        deck_id TEXT NOT NULL REFERENCES decks(id),
        key TEXT NOT NULL,
        from_value TEXT NOT NULL,
        to_value TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX deck_settings_changes_deck_id ON deck_settings_changes (deck_id)");
    // Three settings were for every deck until now. What the owner had set there carries over to each deck, in the
    // deck's words ("what comes first" was about reviews; it's now where the new cards go).
    const old = new Map((db.prepare("SELECT key, value FROM settings WHERE key IN ('newPerDay', 'first', 'newOrder')").all() as { key: string; value: string }[]).map((row) => [row.key, JSON.parse(row.value) as unknown]));
    const carried: Record<string, unknown> = {};
    if (old.has("newPerDay")) carried.newPerDay = old.get("newPerDay");
    if (old.has("newOrder")) carried.newOrder = old.get("newOrder");
    if (old.has("first")) carried.newPlace = old.get("first") === "new" ? "first" : old.get("first") === "mixed" ? "scattered" : "last";
    if (Object.keys(carried).length > 0) db.prepare("UPDATE decks SET settings = ?").run(JSON.stringify(carried));
  },
  (db) => {
    // The silo: a review is a sitting with one deck (the browser mints its id, so a retried start is harmless), each
    // answer keeps the sitting it happened in and how long the card was on screen, and the ledger takes whatever else
    // the browser reports. No CHECK on `kind` or `ended_how`: the words are the contracts' enums.
    db.exec(`
      CREATE TABLE review_sessions (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL REFERENCES decks(id),
        kind TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        ended_how TEXT,
        left_card_id TEXT REFERENCES cards(id),
        left_shown_ms INTEGER,
        left_revealed INTEGER,
        device TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT ''
      )
    `);
    db.exec("CREATE INDEX review_sessions_deck_id ON review_sessions (deck_id)");
    db.exec("ALTER TABLE card_places ADD COLUMN session_id TEXT REFERENCES review_sessions(id)");
    db.exec("ALTER TABLE card_places ADD COLUMN think_ms INTEGER");
    db.exec("ALTER TABLE card_places ADD COLUMN decide_ms INTEGER");
    // Frozen at answer time, as the type's answers stood then: 1 the first main answer (when there is more than one),
    // 0 any other main answer, NULL an answer set apart or a row that isn't an answer. Answers from before are NULL.
    db.exec("ALTER TABLE card_places ADD COLUMN miss INTEGER");
    db.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        at INTEGER NOT NULL,
        client_at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        path TEXT,
        data TEXT NOT NULL DEFAULT '{}',
        session_id TEXT,
        device TEXT NOT NULL DEFAULT ''
      )
    `);
    db.exec("CREATE INDEX events_kind_at ON events (kind, at)");
  },
  (db) => {
    // A card's text can be changed after it's made; every value that changes keeps what it was and what it became.
    db.exec(`
      CREATE TABLE card_value_changes (
        id INTEGER PRIMARY KEY,
        card_id TEXT NOT NULL REFERENCES cards(id),
        field_id TEXT NOT NULL REFERENCES card_fields(id),
        from_value TEXT NOT NULL,
        to_value TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX card_value_changes_card_id ON card_value_changes (card_id)");
  },
  (db) => {
    // A file a card holds: a clip, a recording, a picture. The row says what it is and carries the hash of its bytes
    // (so a retried upload is told from another file under the same id); the bytes themselves sit beside the
    // database, in the account's `media` folder. A card's value in a field of files is this id, in `card_values` like
    // any value. No CHECK on `kind`: the words are the contracts' MediaKind. Nothing removes one yet.
    db.exec(`
      CREATE TABLE media (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        mime TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
  },
  (db) => {
    // Where a card came from, when it was captured (the extension) rather than typed: the page or the video, the line
    // as it was shown, the stretch of the video it ran over. One row a card at most, written with the card and never
    // changed: it is what was true at that moment. Nothing names a site; a source is an address and what was read there.
    db.exec(`
      CREATE TABLE card_sources (
        card_id TEXT PRIMARY KEY REFERENCES cards(id),
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        start_ms INTEGER,
        end_ms INTEGER,
        client TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  },
  (db) => {
    // A card can be deleted from its deck. Like a deck, it's hidden, never destroyed: its values, its answers and its
    // place all stay, with the time it left. Every card from before is still there (NULL).
    db.exec("ALTER TABLE cards ADD COLUMN removed_at INTEGER");
  },
  (db) => {
    // Sound and clips were two kinds of field; they're one now, `media`, which takes either. Every field that was
    // one of the two becomes it. No card and no file is touched: a card's value there is still its file's id, and
    // what that file is (a clip or a sound) was always the file's own row to say (`media.kind`).
    db.exec("UPDATE card_fields SET kind = 'media' WHERE kind IN ('audio', 'video')");
  },
  (db) => {
    // Word audio from Forvo (2026-10-15). The account's own key, typed in Settings: one row at most, kept apart from
    // the settings because those keep every value they had, and a key's old values are secrets. When it was set or
    // forgotten is kept; what it was is not. And every recording fetched, kept as one of the account's files, so the
    // same recording asked for again is that file, not another request to Forvo.
    db.exec(`
      CREATE TABLE forvo_key (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        key TEXT NOT NULL,
        set_at INTEGER NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE forvo_key_changes (
        id INTEGER PRIMARY KEY,
        what TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE forvo_recordings (
        forvo_id INTEGER PRIMARY KEY,
        word TEXT NOT NULL,
        by TEXT NOT NULL,
        country TEXT NOT NULL,
        media_id TEXT NOT NULL REFERENCES media(id),
        fetched_at INTEGER NOT NULL
      )
    `);
  },
  (db) => {
    // How a type's cards look in a review (2026-10-15): each field's part (front and back, size, colour, place), as
    // JSON in the card's order. Empty for every type from before, which then reads as its fields' sides always made
    // it look (contracts → `layoutOf`). Every change keeps what it was and what it became.
    db.exec("ALTER TABLE card_types ADD COLUMN layout TEXT NOT NULL DEFAULT '[]'");
    db.exec(`
      CREATE TABLE card_type_layout_changes (
        id INTEGER PRIMARY KEY,
        type_id TEXT NOT NULL REFERENCES card_types(id),
        from_layout TEXT NOT NULL,
        to_layout TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX card_type_layout_changes_type_id ON card_type_layout_changes (type_id)");
  },
  (db) => {
    // Dictionaries kept on Panki (2026-10-16), uploaded from Settings, to be added to the extension from its options
    // page. The row is what the zip's own index.json says it is and the hash of its bytes (so a retried upload is told
    // from another file under the same id); the zip sits beside the database, in the account's `dictionaries` folder.
    // Removing one keeps its row with the time it went; its zip, a copy of a file the owner has, is deleted for the room.
    db.exec(`
      CREATE TABLE dictionary_files (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        revision TEXT NOT NULL,
        description TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        uploaded_at INTEGER NOT NULL,
        removed_at INTEGER
      )
    `);
  },
  (db) => {
    // The dictionaries kept on Panki and the Forvo key are everyone's from 2026-10-17 on (the shared store, `shared.ts`),
    // and the API moves each account's over at startup (`gatherShared`). A row that has been moved says so, so the
    // move runs once; the row itself stays, as every row does. Nothing writes `dictionary_files` or `forvo_key` any more.
    db.exec("ALTER TABLE dictionary_files ADD COLUMN moved_at INTEGER");
  },
  (db) => {
    // Every save of a card type that changed it (its name, its fields, its layout) keeps the whole type before and
    // after, as `srs_type_changes` does for an SRS type (2026-10-17). Until now a field renamed, given another kind or
    // made optional left no trace: only the type's name and its layout had change tables of their own, which stay.
    db.exec(`
      CREATE TABLE card_type_changes (
        id INTEGER PRIMARY KEY,
        type_id TEXT NOT NULL REFERENCES card_types(id),
        "before" TEXT NOT NULL,
        "after" TEXT NOT NULL,
        at INTEGER NOT NULL
      )
    `);
    db.exec("CREATE INDEX card_type_changes_type_id ON card_type_changes (type_id)");
  },
  (db) => {
    // Whose the video was, beside what it was called (2026-10-17, the owner: the source is the video's link and name
    // and the channel's). Null for every card from before, and for a page that isn't a video's.
    db.exec("ALTER TABLE card_sources ADD COLUMN channel_name TEXT");
    db.exec("ALTER TABLE card_sources ADD COLUMN channel_url TEXT");
  },
  (db) => {
    // What's said in a clip, as it was heard on the video when it was recorded (2026-10-18): its lines and when each
    // piece of them is said, from the clip's start, as JSON (the contracts' `MediaCues`). One row a file at most,
    // written once with it and never changed, as the file itself isn't.
    db.exec(`
      CREATE TABLE media_cues (
        media_id TEXT PRIMARY KEY REFERENCES media(id),
        cues TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  },
];

function migrate(db: DatabaseSync, now: number) {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  MIGRATIONS.forEach((step, i) => {
    if (i < user_version) return;
    db.exec("BEGIN");
    try {
      step(db, now);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
}

type FieldRow = { id: string; name: string; kind: string; side: string; required: number };
/** `mediaKind` is what the file a value names is; null for a value that names none. `cues` is what's said in it, as kept (JSON), when it was recorded with its words. */
type ValueRow = { cardId: string; fieldId: string; value: string; mediaKind: string | null; cues: string | null };
type StageRow = { id: string; name: string; n: number; unit: string };
type IdRow = { id: string; removedAt: number | null };
type SettingRow = { key: string; value: string };
/** A card's last card_places row, joined on; every column null when it has none (a new card). */
type PlaceRow = { placeId: number | null; stageId: string | null; past: number | null; node: string | null; burned: number | null };
type CardRow = PlaceRow & { id: string; deckId: string; createdAt: number; seen: number; lastAt: number | null };
/** What a read at one moment needs of the clock: the settings as they are, and how much of today's allowance is used. */
type Today = { now: number; settings: Settings; dayStart: number };
type PlaceReason = "answer" | "switch" | "stage-removed";
/** What an answer carries beyond the move: the sitting, the spans the browser measured, and whether it was a miss. */
type AnswerExtras = { sessionId: string | null; thinkMs: number | null; decideMs: number | null; miss: number | null };
const NO_EXTRAS: AnswerExtras = { sessionId: null, thinkMs: null, decideMs: null, miss: null };
type ReviewSessionRow = { id: string; deckId: string; kind: string; startedAt: number; endedAt: number | null; endedHow: string | null };
/** An answer as the stats read it. `living` is 0 when its card has since been deleted: the answer still happened, the card is no longer one to name. */
type AnswerRow = { cardId: string; at: number; miss: number | null; thinkMs: number | null; decideMs: number | null; living: number };
type SessionStatRow = { startedAt: number; endedAt: number | null; endedHow: string | null; leftShownMs: number | null };
type DeckScopeRow = { id: string; typeId: string; srsTypeId: string };
/** A kept dictionary as the move to the shared store reads it: the row as the app tells of it, and the hash of its zip. */
type DictionaryMoveRow = { id: string; title: string; revision: string; description: string; bytes: number; uploadedAt: number; sha256: string };

/** JSON with every object's keys sorted, so two readings of the same thing compare equal as text. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonical(record[key])]));
  }
  return value;
}

/** A card type as its change log keeps it: everything the owner can edit, the fields in order with their layout. */
function typeSnapshot(type: CardType): string {
  const { name, fields, layout } = type;
  return JSON.stringify(canonical({ name, fields, layout }));
}

/** The type as its change log keeps it: everything the owner can edit, stages and answers in order. */
function srsSnapshot(type: SrsType): string {
  const { name, description, stages, answers, flow, overrides, after, growBy, burnedName } = type;
  return JSON.stringify(canonical({ name, description, stages, answers, flow, overrides, after, growBy, burnedName }));
}

/** The place a rung number is on a ladder, with one above its top counting as the top. */
function rungOn(type: SrsLadder, idx: number): CardPlace {
  const stage = type.stages[Math.max(0, Math.min(idx, type.stages.length - 1))];
  if (!stage) throw new Error("A ladder with no stages.");
  return { stageId: stage.id, past: 0, node: [], burned: false };
}

/** The whole list again, as a type's fields work: known ids are updated (and un-hidden), new ids added, ids left out hidden. */
function syncList<T extends { id: string }>(
  existing: IdRow[],
  items: T[],
  write: { update: (item: T, position: number) => void; insert: (item: T, position: number) => void; hide: (id: string) => void },
) {
  const known = new Map(existing.map((row) => [row.id, row.removedAt]));
  const kept = new Set<string>();
  items.forEach((item, i) => {
    kept.add(item.id);
    if (known.has(item.id)) write.update(item, i);
    else write.insert(item, i);
  });
  for (const [id, removedAt] of known) if (!kept.has(id) && removedAt === null) write.hide(id);
}

export function openDb(dataDir: string, now: () => number = Date.now, timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  checkTimeZone(timeZone);
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "panki.sqlite"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  // A command run beside the API (`pnpm backup`, `pnpm space`) may hold the file for a moment: a write that finds it
  // locked waits this long instead of failing at once.
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db, now());

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

  // Removed types, fields, stages, answers and decks are invisible everywhere the app reads; only an insert's read-back,
  // a deck's own type and remove itself see them.
  const typeColumns = `
    t.id, t.name, t.created_at AS createdAt, t.layout,
    (SELECT COUNT(*) FROM decks d WHERE d.type_id = t.id AND d.removed_at IS NULL) AS deckCount`;
  const selectTypes = db.prepare(`SELECT ${typeColumns} FROM card_types t WHERE t.removed_at IS NULL ORDER BY t.created_at ASC, t.id ASC`);
  const selectType = db.prepare(`SELECT ${typeColumns} FROM card_types t WHERE t.id = ? AND t.removed_at IS NULL`);
  const selectAnyType = db.prepare(`SELECT ${typeColumns} FROM card_types t WHERE t.id = ?`);
  const selectFields = db.prepare("SELECT id, name, kind, side, required FROM card_fields WHERE type_id = ? AND removed_at IS NULL ORDER BY position ASC, id ASC");
  const selectFieldIds = db.prepare("SELECT id, removed_at AS removedAt FROM card_fields WHERE type_id = ?");
  const insertType = db.prepare("INSERT OR IGNORE INTO card_types (id, name, created_at) VALUES (?, ?, ?)");
  const insertField = db.prepare("INSERT INTO card_fields (id, type_id, name, kind, side, required, position) VALUES (?, ?, ?, ?, ?, ?, ?)");
  const updateField = db.prepare("UPDATE card_fields SET name = ?, kind = ?, side = ?, required = ?, position = ?, removed_at = NULL WHERE id = ?");
  const hideField = db.prepare("UPDATE card_fields SET removed_at = ? WHERE id = ?");
  const updateTypeName = db.prepare("UPDATE card_types SET name = ? WHERE id = ?");
  const insertTypeRename = db.prepare("INSERT INTO card_type_renames (type_id, from_name, to_name, at) VALUES (?, ?, ?, ?)");
  const updateTypeLayout = db.prepare("UPDATE card_types SET layout = ? WHERE id = ?");
  const insertLayoutChange = db.prepare("INSERT INTO card_type_layout_changes (type_id, from_layout, to_layout, at) VALUES (?, ?, ?, ?)");
  const insertTypeChange = db.prepare(`INSERT INTO card_type_changes (type_id, "before", "after", at) VALUES (?, ?, ?, ?)`);
  const removeType = db.prepare("UPDATE card_types SET removed_at = COALESCE(removed_at, ?) WHERE id = ?");
  const decksUsing = db.prepare("SELECT COUNT(*) AS n FROM decks WHERE type_id = ? AND removed_at IS NULL");

  // A card's place is its last card_places row (the highest id); the reads below join it on or look it up.
  const lastPlaceOf = (card: string) => `(SELECT MAX(q.id) FROM card_places q WHERE q.card_id = ${card})`;
  const srsTypeColumns = `
    t.id, t.name, t.description, t."after", t.grow_by AS growBy, t.burned_name AS burnedName, t.flow, t.overrides, t.created_at AS createdAt, t.builtin IS NOT NULL AS builtin,
    (SELECT COUNT(*) FROM decks d WHERE d.srs_type_id = t.id AND d.removed_at IS NULL) AS deckCount`;
  const selectSrsTypes = db.prepare(`SELECT ${srsTypeColumns} FROM srs_types t WHERE t.removed_at IS NULL ORDER BY t.created_at ASC, t.id ASC`);
  const selectSrsType = db.prepare(`SELECT ${srsTypeColumns} FROM srs_types t WHERE t.id = ? AND t.removed_at IS NULL`);
  const selectAnySrsType = db.prepare(`SELECT ${srsTypeColumns} FROM srs_types t WHERE t.id = ?`);
  const selectStages = db.prepare("SELECT id, name, wait_n AS n, wait_unit AS unit FROM srs_stages WHERE type_id = ? AND removed_at IS NULL ORDER BY position ASC, id ASC");
  const selectStageIds = db.prepare("SELECT id, removed_at AS removedAt FROM srs_stages WHERE type_id = ?");
  const selectAnswers = db.prepare("SELECT id, name, aside, confirm FROM srs_answers WHERE type_id = ? AND removed_at IS NULL ORDER BY position ASC, id ASC");
  const selectAnswerIds = db.prepare("SELECT id, removed_at AS removedAt FROM srs_answers WHERE type_id = ?");
  // How many cards of living decks stand on each of a type's stages: a card counts where its last row put it.
  const selectStageCounts = db.prepare(`
    SELECT p.stage_to AS stageId, COUNT(*) AS n FROM card_places p
    JOIN cards c ON c.id = p.card_id JOIN decks d ON d.id = c.deck_id
    WHERE d.removed_at IS NULL AND c.removed_at IS NULL AND p.id = ${lastPlaceOf("p.card_id")} AND p.stage_to IN (SELECT id FROM srs_stages WHERE type_id = ?)
    GROUP BY p.stage_to`);
  const selectCardsOnStage = db.prepare(`
    SELECT p.card_id AS cardId, p.id AS placeId, p.stage_to AS stageId, p.past_to AS past, p.node_to AS node, p.burned_to AS burned FROM card_places p
    JOIN cards c ON c.id = p.card_id JOIN decks d ON d.id = c.deck_id
    WHERE d.removed_at IS NULL AND c.removed_at IS NULL AND p.id = ${lastPlaceOf("p.card_id")} AND p.stage_to = ?`);
  const insertSrsType = db.prepare(`INSERT OR IGNORE INTO srs_types (id, name, description, "after", grow_by, burned_name, flow, overrides, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const updateSrsTypeRow = db.prepare(`UPDATE srs_types SET name = ?, description = ?, "after" = ?, grow_by = ?, burned_name = ?, flow = ?, overrides = ? WHERE id = ?`);  const insertSrsTypeChange = db.prepare(`INSERT INTO srs_type_changes (type_id, "before", "after", at) VALUES (?, ?, ?, ?)`);
  const removeSrsType = db.prepare("UPDATE srs_types SET removed_at = COALESCE(removed_at, ?) WHERE id = ?");
  const selectBuiltins = db.prepare("SELECT id, builtin FROM srs_types WHERE builtin IS NOT NULL");
  const markBuiltin = db.prepare("UPDATE srs_types SET builtin = ? WHERE id = ?");
  const decksOnSrsType = db.prepare("SELECT COUNT(*) AS n FROM decks WHERE srs_type_id = ? AND removed_at IS NULL");
  const insertStage = db.prepare("INSERT INTO srs_stages (id, type_id, name, wait_n, wait_unit, position) VALUES (?, ?, ?, ?, ?, ?)");
  const updateStage = db.prepare("UPDATE srs_stages SET name = ?, wait_n = ?, wait_unit = ?, position = ?, removed_at = NULL WHERE id = ?");
  const hideStage = db.prepare("UPDATE srs_stages SET removed_at = ? WHERE id = ?");
  const insertAnswer = db.prepare("INSERT INTO srs_answers (id, type_id, name, position, aside, confirm) VALUES (?, ?, ?, ?, ?, ?)");
  const updateAnswer = db.prepare("UPDATE srs_answers SET name = ?, position = ?, aside = ?, confirm = ?, removed_at = NULL WHERE id = ?");
  const hideAnswer = db.prepare("UPDATE srs_answers SET removed_at = ? WHERE id = ?");

  const selectSettings = db.prepare("SELECT key, value FROM settings");
  const upsertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
  const insertSettingChange = db.prepare("INSERT INTO settings_changes (key, from_value, to_value, at) VALUES (?, ?, ?, ?)");
  // Today's allowances, each deck's own: its new cards are used up by the cards started in it (an answer given from new).
  const countStartedSince = db.prepare(
    "SELECT COUNT(*) AS n FROM card_places WHERE reason = 'answer' AND stage_from IS NULL AND burned_from = 0 AND node_from = '[]' AND at >= ? AND card_id IN (SELECT id FROM cards WHERE deck_id = ?)",
  );
  // A deck's own reviews: its answers but for the ones that started a new card, which come off the new cards instead.
  const countReviewedSince = db.prepare(
    "SELECT COUNT(*) AS n FROM card_places WHERE reason = 'answer' AND NOT (stage_from IS NULL AND burned_from = 0 AND node_from = '[]') AND at >= ? AND card_id IN (SELECT id FROM cards WHERE deck_id = ?)",
  );
  const deckColumns = `
    d.id, d.name, d.type_id AS typeId, d.srs_type_id AS srsTypeId, d.settings, d.created_at AS createdAt,
    (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.removed_at IS NULL) AS cardCount`;
  const selectDecks = db.prepare(`SELECT ${deckColumns} FROM decks d WHERE d.removed_at IS NULL ORDER BY d.created_at ASC, d.id ASC`);
  const selectDeck = db.prepare(`SELECT ${deckColumns} FROM decks d WHERE d.id = ? AND d.removed_at IS NULL`);
  const selectAnyDeck = db.prepare(`SELECT ${deckColumns} FROM decks d WHERE d.id = ?`);
  // The cheap reads a route makes before it does anything: a deck's counts walk every card of it, and aren't wanted there.
  const selectDeckExists = db.prepare("SELECT 1 FROM decks WHERE id = ? AND removed_at IS NULL");
  const selectDeckTypeId = db.prepare("SELECT type_id AS typeId FROM decks WHERE id = ? AND removed_at IS NULL");
  const insertDeck = db.prepare("INSERT OR IGNORE INTO decks (id, name, type_id, srs_type_id, created_at) VALUES (?, ?, ?, ?, ?)");
  const updateDeckName = db.prepare("UPDATE decks SET name = ? WHERE id = ?");
  const insertRename = db.prepare("INSERT INTO deck_renames (deck_id, from_name, to_name, at) VALUES (?, ?, ?, ?)");
  const updateDeckSrsType = db.prepare("UPDATE decks SET srs_type_id = ? WHERE id = ?");
  const selectDeckSettings = db.prepare("SELECT settings FROM decks WHERE id = ?");
  const updateDeckSettings = db.prepare("UPDATE decks SET settings = ? WHERE id = ?");
  const insertDeckSettingChange = db.prepare("INSERT INTO deck_settings_changes (deck_id, key, from_value, to_value, at) VALUES (?, ?, ?, ?, ?)");
  const insertDeckSrsChange = db.prepare("INSERT INTO deck_srs_changes (deck_id, from_type_id, to_type_id, at) VALUES (?, ?, ?, ?)");
  const removeDeck = db.prepare("UPDATE decks SET removed_at = COALESCE(removed_at, ?) WHERE id = ?");

  // Each card with its last place (none means new), how often it was answered and when last; the values come separately.
  const cardColumns = `
    c.id, c.deck_id AS deckId, c.created_at AS createdAt,
    p.id AS placeId, p.stage_to AS stageId, p.past_to AS past, p.node_to AS node, p.burned_to AS burned,
    (SELECT COUNT(*) FROM card_places a WHERE a.card_id = c.id AND a.reason = 'answer') AS seen,
    (SELECT MAX(a.at) FROM card_places a WHERE a.card_id = c.id AND a.reason = 'answer') AS lastAt`;
  const cardsWithPlace = `FROM cards c LEFT JOIN card_places p ON p.card_id = c.id AND p.id = ${lastPlaceOf("c.id")}`;
  // A deleted card is out of everything from the moment it leaves: the lists, the counts, a review, the ladder, and
  // whatever is later done to its deck's cards (a switch of SRS type, a stage taken away). Only an insert's read-back
  // (`selectCard`) still sees it, so the same id sent again is the same card and never a second one.
  const selectCards = db.prepare(`SELECT ${cardColumns} ${cardsWithPlace} WHERE c.deck_id = ? AND c.removed_at IS NULL ORDER BY c.created_at DESC, c.id DESC`);
  const selectCard = db.prepare(`SELECT ${cardColumns} ${cardsWithPlace} WHERE c.id = ?`);
  const selectDeckCard = db.prepare(`SELECT ${cardColumns} ${cardsWithPlace} WHERE c.deck_id = ? AND c.id = ? AND c.removed_at IS NULL`);
  // A value that names a file comes with what that file is, so a card can say which of its values are clips, sounds or pictures.
  const valueColumns = "v.card_id AS cardId, v.field_id AS fieldId, v.value, m.kind AS mediaKind, c.cues AS cues";
  const valuesWithMedia = "FROM card_values v LEFT JOIN media m ON m.id = v.value AND m.removed_at IS NULL LEFT JOIN media_cues c ON c.media_id = m.id";
  const selectDeckValues = db.prepare(`SELECT ${valueColumns} ${valuesWithMedia} WHERE v.card_id IN (SELECT id FROM cards WHERE deck_id = ? AND removed_at IS NULL)`);
  const removeCard = db.prepare("UPDATE cards SET removed_at = COALESCE(removed_at, ?) WHERE id = ? AND deck_id = ?");
  const selectCardValues = db.prepare(`SELECT ${valueColumns} ${valuesWithMedia} WHERE v.card_id = ?`);
  const insertCard = db.prepare("INSERT OR IGNORE INTO cards (id, deck_id, created_at) VALUES (?, ?, ?)");
  const insertValue = db.prepare("INSERT INTO card_values (card_id, field_id, value) VALUES (?, ?, ?)");
  const upsertValue = db.prepare("INSERT INTO card_values (card_id, field_id, value) VALUES (?, ?, ?) ON CONFLICT (card_id, field_id) DO UPDATE SET value = excluded.value");
  const insertValueChange = db.prepare("INSERT INTO card_value_changes (card_id, field_id, from_value, to_value, at) VALUES (?, ?, ?, ?, ?)");
  const insertSource = db.prepare("INSERT OR IGNORE INTO card_sources (card_id, url, title, text, start_ms, end_ms, channel_name, channel_url, client, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertPlace = db.prepare(`
    INSERT INTO card_places (card_id, at, reason, answer_id, stage_from, past_from, node_from, burned_from, stage_to, past_to, node_to, burned_to, session_id, think_ms, decide_ms, miss)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const reviewSessionColumns = "s.id, s.deck_id AS deckId, s.kind, s.started_at AS startedAt, s.ended_at AS endedAt, s.ended_how AS endedHow";
  const insertReviewSession = db.prepare("INSERT OR IGNORE INTO review_sessions (id, deck_id, kind, started_at, device, user_agent) VALUES (?, ?, ?, ?, ?, ?)");
  const selectReviewSession = db.prepare(`SELECT ${reviewSessionColumns} FROM review_sessions s WHERE s.id = ? AND s.deck_id = ?`);
  const endReviewSession = db.prepare("UPDATE review_sessions SET ended_at = ?, ended_how = ?, left_card_id = ?, left_shown_ms = ?, left_revealed = ? WHERE id = ? AND ended_at IS NULL");
  const insertEvent = db.prepare("INSERT INTO events (at, client_at, kind, path, data, session_id, device) VALUES (?, ?, ?, ?, ?, ?, ?)");

  const mediaColumns = "m.id, m.kind, m.mime, m.bytes, m.created_at AS createdAt";
  const selectMedia = db.prepare(`SELECT ${mediaColumns} FROM media m WHERE m.id = ? AND m.removed_at IS NULL`);
  const selectAnyMedia = db.prepare(`SELECT ${mediaColumns} FROM media m WHERE m.id = ?`);
  const selectMediaHash = db.prepare("SELECT sha256 FROM media WHERE id = ?");
  const insertMedia = db.prepare("INSERT OR IGNORE INTO media (id, kind, mime, bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const insertMediaCues = db.prepare("INSERT OR IGNORE INTO media_cues (media_id, cues, created_at) VALUES (?, ?, ?)");
  const selectMediaCues = db.prepare("SELECT cues FROM media_cues WHERE media_id = ?");
  /** What's said in a clip, read from what's kept; null when it no longer reads as cues. */
  const cuesFrom = (raw: string): MediaCues | null => {
    try {
      const read = MediaCues.safeParse(JSON.parse(raw));
      return read.success ? read.data : null;
    } catch {
      return null;
    }
  };

  const dictionaryColumns = "id, title, revision, description, bytes, uploaded_at AS uploadedAt";
  const selectDictionaryFiles = db.prepare(`SELECT ${dictionaryColumns} FROM dictionary_files WHERE removed_at IS NULL ORDER BY uploaded_at ASC, id ASC`);
  const selectDictionaryFile = db.prepare(`SELECT ${dictionaryColumns} FROM dictionary_files WHERE id = ? AND removed_at IS NULL`);
  const selectAnyDictionaryFile = db.prepare(`SELECT ${dictionaryColumns} FROM dictionary_files WHERE id = ?`);
  const selectDictionaryFileHash = db.prepare("SELECT sha256 FROM dictionary_files WHERE id = ?");
  const selectDictionaryFileByTitle = db.prepare(`SELECT ${dictionaryColumns} FROM dictionary_files WHERE title = ? AND removed_at IS NULL`);
  const insertDictionaryFile = db.prepare(
    "INSERT OR IGNORE INTO dictionary_files (id, title, revision, description, bytes, sha256, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const removeDictionaryFile = db.prepare("UPDATE dictionary_files SET removed_at = ? WHERE id = ? AND removed_at IS NULL");
  const selectDictionaryFilesToMove = db.prepare(`SELECT ${dictionaryColumns}, sha256 FROM dictionary_files WHERE removed_at IS NULL AND moved_at IS NULL ORDER BY uploaded_at ASC, id ASC`);
  const markDictionaryMoved = db.prepare("UPDATE dictionary_files SET moved_at = ? WHERE id = ? AND moved_at IS NULL");

  const selectForvoKey = db.prepare("SELECT key FROM forvo_key WHERE id = 1");
  const deleteForvoKey = db.prepare("DELETE FROM forvo_key WHERE id = 1");
  const insertForvoKeyChange = db.prepare("INSERT INTO forvo_key_changes (what, at) VALUES (?, ?)");
  const selectForvoRecording = db.prepare(
    "SELECT r.media_id AS mediaId FROM forvo_recordings r JOIN media m ON m.id = r.media_id WHERE r.forvo_id = ? AND m.removed_at IS NULL",
  );
  const insertForvoRecording = db.prepare("INSERT OR IGNORE INTO forvo_recordings (forvo_id, word, by, country, media_id, fetched_at) VALUES (?, ?, ?, ?, ?, ?)");
  const selectForvoRecordings = db.prepare(
    "SELECT r.forvo_id AS forvoId, r.word, r.by, r.country, r.media_id AS mediaId, r.fetched_at AS fetchedAt FROM forvo_recordings r JOIN media m ON m.id = r.media_id WHERE m.removed_at IS NULL",
  );

  // The stats read over living decks, all of them or one: the answers given, the sittings, the cards.
  const scopeWhere = "d.removed_at IS NULL AND (? IS NULL OR d.id = ?)";
  const selectScopeDecks = db.prepare(`SELECT d.id, d.type_id AS typeId, d.srs_type_id AS srsTypeId FROM decks d WHERE ${scopeWhere} ORDER BY d.created_at ASC, d.id ASC`);
  const selectScopeAnswers = db.prepare(`
    SELECT p.card_id AS cardId, p.at, p.miss, p.think_ms AS thinkMs, p.decide_ms AS decideMs, c.removed_at IS NULL AS living FROM card_places p
    JOIN cards c ON c.id = p.card_id JOIN decks d ON d.id = c.deck_id
    WHERE p.reason = 'answer' AND ${scopeWhere} ORDER BY p.at ASC, p.id ASC`);
  const selectScopeSessions = db.prepare(`
    SELECT s.started_at AS startedAt, s.ended_at AS endedAt, s.ended_how AS endedHow, s.left_shown_ms AS leftShownMs FROM review_sessions s
    JOIN decks d ON d.id = s.deck_id WHERE ${scopeWhere}`);
  const selectValue = db.prepare("SELECT value FROM card_values WHERE card_id = ? AND field_id = ?");

  /** A kept layout's JSON, as parts; anything that doesn't read is no layout, and the fields' sides make one. */
  function keptLayout(json: string): unknown[] {
    try {
      const parsed: unknown = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function typeFrom(row: unknown): CardType {
    const { layout: kept, ...base } = row as { id: string; layout: string };
    const stored = CardField.array().parse((selectFields.all(base.id) as FieldRow[]).map((f) => ({ id: f.id, name: f.name, kind: f.kind, side: f.side, required: f.required === 1 })));
    // The layout as it stands, filled out from the fields; a field's side is then the layout's to say.
    const layout = layoutOf(stored, keptLayout(kept));
    const sides = new Map(layout.map((part) => [part.fieldId, sideOf(part)]));
    const fields = stored.map((f) => ({ ...f, side: sides.get(f.id) ?? f.side }));
    return CardType.parse({ ...base, fields, layout });
  }

  function srsTypeFrom(row: unknown): SrsType {
    const base = row as { id: string; flow: string; overrides: string };
    const stages = (selectStages.all(base.id) as StageRow[]).map((s) => ({ id: s.id, name: s.name, wait: { n: s.n, unit: s.unit } }));
    const answers = (selectAnswers.all(base.id) as { id: string; name: string; aside: number; confirm: number }[]).map((a) => ({ id: a.id, name: a.name, aside: a.aside === 1, confirm: a.confirm === 1 }));
    const cardCounts = Object.fromEntries((selectStageCounts.all(base.id) as { stageId: string; n: number }[]).map((r) => [r.stageId, r.n]));
    const first = stages[0]?.id;
    const flow = upgradeFlow(JSON.parse(base.flow), first);
    const overrides = Object.fromEntries(Object.entries(JSON.parse(base.overrides) as Record<string, unknown>).map(([stageId, own]) => [stageId, upgradeFlow(own, first)]));
    return SrsType.parse({ ...(row as object), builtin: (row as { builtin: number }).builtin === 1, stages, answers, flow, overrides, cardCounts });
  }
  /** The type a deck's cards follow, removed or not: a removed deck's type may be gone from the list while its cards still have a place. */
  function srsTypeOf(srsTypeId: string): SrsType {
    const row = selectAnySrsType.get(srsTypeId);
    if (!row) throw new Error("A deck's SRS type is missing.");
    return srsTypeFrom(row);
  }
  function srsTypeOfDeck(deckId: string): SrsType {
    const deck = selectAnyDeck.get(deckId) as { srsTypeId: string } | undefined;
    if (!deck) throw new Error("The deck is missing.");
    return srsTypeOf(deck.srsTypeId);
  }

  function settingsFrom(rows: SettingRow[]): Settings {
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const raw = stored.get(key);
      if (raw === undefined) continue;
      // A stored value that no longer fits its setting's rule reads as the default: normalised on read, never rewritten.
      const parsed = Settings.shape[key].safeParse(JSON.parse(raw));
      if (parsed.success) merged[key] = parsed.data;
    }
    return Settings.parse(merged);
  }
  function todayAt(now: number): Today {
    const settings = settingsFrom(selectSettings.all() as SettingRow[]);
    const dayStart = dayStartAt(now, settings.dayStartHour, timeZone);
    return { now, settings, dayStart };
  }
  /** A deck's own settings: what's stored over the defaults. A stored value that no longer fits its rule reads as the default. */
  function deckSettingsFrom(raw: string): DeckSettings {
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...DEFAULT_DECK_SETTINGS };
    for (const key of Object.keys(DEFAULT_DECK_SETTINGS) as (keyof DeckSettings)[]) {
      if (!(key in stored)) continue;
      const parsed = DeckSettings.shape[key].safeParse(stored[key]);
      if (parsed.success) merged[key] = parsed.data;
    }
    return DeckSettings.parse(merged);
  }

  function placeFrom(row: PlaceRow): CardPlace {
    if (row.placeId === null) return NEW_PLACE;
    return CardPlace.parse({ stageId: row.stageId, past: row.past, node: JSON.parse(row.node ?? "[]"), burned: row.burned === 1 });
  }
  function recordPlace(cardId: string, now: number, reason: PlaceReason, answerId: string | null, from: CardPlace, to: CardPlace, extras: AnswerExtras = NO_EXTRAS) {
    insertPlace.run(
      cardId, now, reason, answerId,
      from.stageId, from.past, JSON.stringify(from.node), from.burned ? 1 : 0,
      to.stageId, to.past, JSON.stringify(to.node), to.burned ? 1 : 0,
      extras.sessionId, extras.thinkMs, extras.decideMs, extras.miss,
    );
  }
  /** Whether an answer counts as a miss, frozen as the type's answers stand now: the first of the main ones, when there is more than one; nothing for one set apart. */
  function missOf(type: SrsType, answerId: string): number | null {
    const main = mainAnswers(type.answers);
    if (!main.some((a) => a.id === answerId)) return null;
    return main.length > 1 && main[0]?.id === answerId ? 1 : 0;
  }
  function reviewSessionFrom(row: ReviewSessionRow): ReviewSession {
    return ReviewSession.parse(row);
  }
  /** When a card comes back and whether a review now would show it, from its place under the ladder as it is now. The seed is its last row, so the fuzz holds still between reads. */
  function scheduleOf(type: SrsLadder, row: CardRow, place: CardPlace, today: Today): { dueAt: number | null; due: boolean } {
    const at = row.lastAt === null || row.placeId === null ? null : dueAt(type, place, row.lastAt, row.placeId, today.settings.fuzz);
    const due = at !== null && !isBurned(type, place) && at <= today.now;
    return { dueAt: at, due };
  }
  function cardsFrom(rows: CardRow[], valueRows: ValueRow[], type: SrsType, today: Today): Card[] {
    const byCard = new Map<string, { values: Record<string, string>; files: Record<string, string>; cues: Record<string, MediaCues> }>();
    for (const v of valueRows) {
      const held = byCard.get(v.cardId) ?? { values: {}, files: {}, cues: {} };
      held.values[v.fieldId] = v.value;
      if (v.mediaKind !== null) held.files[v.value] = v.mediaKind;
      // What's said in a clip, as kept; what no longer reads as cues is left out rather than failing the card.
      const cues = v.cues === null ? null : cuesFrom(v.cues);
      if (cues) held.cues[v.value] = cues;
      byCard.set(v.cardId, held);
    }
    return rows.map((row) => {
      const place = placeFrom(row);
      const held = byCard.get(row.id);
      return Card.parse({ ...row, values: held?.values ?? {}, files: held?.files ?? {}, cues: held?.cues ?? {}, place, ...scheduleOf(type, row, place, today) });
    });
  }

  /** `typeOf` is how the deck's SRS type is read: a list of decks reads each type once and hands that in. */
  function deckFrom(row: unknown, today: Today, typeOf: (srsTypeId: string) => SrsType = srsTypeOf): Deck {
    const base = row as { id: string; srsTypeId: string; settings: string };
    const type = typeOf(base.srsTypeId);
    const own = deckSettingsFrom(base.settings);
    let fresh = 0;
    let due = 0;
    for (const card of selectCards.all(base.id) as CardRow[]) {
      const place = placeFrom(card);
      // A new card inside an ask-again has been started: it's due when its wait is up, not a new card to start.
      if (isNew(place) && place.node.length === 0) fresh += 1;
      if (scheduleOf(type, card, place, today).due) due += 1;
    }
    const started = (countStartedSince.get(today.dayStart, base.id) as { n: number }).n;
    const newCount = Math.min(fresh, Math.max(0, own.newPerDay - started));
    const ownLeft = own.reviewsPerDay === null ? Infinity : Math.max(0, own.reviewsPerDay - (countReviewedSince.get(today.dayStart, base.id) as { n: number }).n);
    const dueCount = Math.min(due, ownLeft);
    return Deck.parse({ ...(row as object), settings: own, newCount, dueCount });
  }

  const api = {
    listTypes(): CardType[] {
      return selectTypes.all().map(typeFrom);
    },
    getType(id: string): CardType | null {
      const row = selectType.get(id);
      return row ? typeFrom(row) : null;
    },
    /** Idempotent: the same id again returns the type that already exists, fields untouched. */
    insertType(type: NewCardType, now: number): CardType {
      return transaction(() => {
        const inserted = insertType.run(type.id, type.name, now).changes > 0;
        if (inserted) {
          const layout = type.layout ? layoutOf(type.fields, type.layout) : null;
          const sides = new Map(layout?.map((part) => [part.fieldId, sideOf(part)]));
          type.fields.forEach((f, i) => insertField.run(f.id, type.id, f.name, f.kind, sides.get(f.id) ?? f.side, f.required ? 1 : 0, i));
          if (layout) updateTypeLayout.run(JSON.stringify(layout), type.id);
        }
        return typeFrom(selectAnyType.get(type.id));
      });
    },
    /**
     * The name, the whole field list in order (present ids are updated and un-hidden, new ids added, missing ones
     * hidden), and the layout when it's sent: kept filled out against the fields as they now are, each field's side
     * written from it, and what it was before and after recorded. Sent without one, the layout stays.
     */
    updateType(id: string, update: CardTypeUpdate, now: number): CardType {
      return transaction(() => {
        const before = typeFrom(selectType.get(id));
        if (before.name !== update.name) {
          updateTypeName.run(update.name, id);
          insertTypeRename.run(id, before.name, update.name, now);
        }
        const layout = update.layout ? layoutOf(update.fields, update.layout) : null;
        const sides = new Map(layout?.map((part) => [part.fieldId, sideOf(part)]));
        syncList(selectFieldIds.all(id) as IdRow[], update.fields, {
          update: (f, i) => updateField.run(f.name, f.kind, sides.get(f.id) ?? f.side, f.required ? 1 : 0, i, f.id),
          insert: (f, i) => insertField.run(f.id, id, f.name, f.kind, sides.get(f.id) ?? f.side, f.required ? 1 : 0, i),
          hide: (fieldId) => hideField.run(now, fieldId),
        });
        if (layout) {
          const [was, is] = [JSON.stringify(before.layout), JSON.stringify(layout)];
          if (was !== is) {
            updateTypeLayout.run(is, id);
            insertLayoutChange.run(id, was, is, now);
          }
        }
        const after = typeFrom(selectType.get(id));
        // The whole type before and after, once per save that changed anything; the name's and the layout's own logs stand beside it.
        const [was, is] = [typeSnapshot(before), typeSnapshot(after)];
        if (was !== is) insertTypeChange.run(id, was, is, now);
        return after;
      });
    },
    /** Hides the type. "used" when a deck still has it; "missing" when the id never existed; hiding twice keeps the first time. */
    removeType(id: string, now: number): "ok" | "used" | "missing" {
      if (!selectAnyType.get(id)) return "missing";
      const { n } = decksUsing.get(id) as { n: number };
      if (n > 0) return "used";
      removeType.run(now, id);
      return "ok";
    },
    listSrsTypes(): SrsType[] {
      return selectSrsTypes.all().map(srsTypeFrom);
    },
    getSrsType(id: string): SrsType | null {
      const row = selectSrsType.get(id);
      return row ? srsTypeFrom(row) : null;
    },
    /** Idempotent: the same id again returns the type that already exists, stages and answers untouched. */
    insertSrsType(type: NewSrsType, now: number): SrsType {
      return transaction(() => {
        const inserted = insertSrsType.run(type.id, type.name, type.description, type.after, type.growBy, type.burnedName, JSON.stringify(type.flow), JSON.stringify(type.overrides), now).changes > 0;
        if (inserted) {
          type.stages.forEach((s, i) => insertStage.run(s.id, type.id, s.name, s.wait.n, s.wait.unit, i));
          type.answers.forEach((a, i) => insertAnswer.run(a.id, type.id, a.name, i, a.aside ? 1 : 0, a.confirm ? 1 : 0));
        }
        return srsTypeFrom(selectAnySrsType.get(type.id));
      });
    },
    /**
     * The whole type again. Stages and answers work like a type's fields: present ids updated (and un-hidden), new ids
     * added, ids left out hidden. A stage about to be hidden with cards on it needs `moves[stageId]`, a stage that stays,
     * for them to go to; without one for every such stage nothing changes and `needsMoves` says which and how many.
     * The cards moved get a 'stage-removed' row each, and the type's change log a row when anything differs.
     */
    updateSrsType(id: string, update: SrsTypeUpdate, now: number): SrsType | { needsMoves: Record<string, number> } {
      return transaction(() => {
        const before = srsTypeFrom(selectSrsType.get(id));
        const staying = new Set(update.stages.map((s) => s.id));
        const needsMoves: Record<string, number> = {};
        const moves: [from: string, to: string][] = [];
        for (const stage of before.stages) {
          const count = before.cardCounts[stage.id] ?? 0;
          if (staying.has(stage.id) || count === 0) continue;
          const to = update.moves?.[stage.id];
          if (to !== undefined && staying.has(to)) moves.push([stage.id, to]);
          else needsMoves[stage.id] = count;
        }
        if (Object.keys(needsMoves).length > 0) return { needsMoves };
        updateSrsTypeRow.run(update.name, update.description, update.after, update.growBy, update.burnedName, JSON.stringify(update.flow), JSON.stringify(update.overrides), id);
        syncList(selectStageIds.all(id) as IdRow[], update.stages, {
          update: (s, i) => updateStage.run(s.name, s.wait.n, s.wait.unit, i, s.id),
          insert: (s, i) => insertStage.run(s.id, id, s.name, s.wait.n, s.wait.unit, i),
          hide: (stageId) => hideStage.run(now, stageId),
        });
        syncList(selectAnswerIds.all(id) as IdRow[], update.answers, {
          update: (a, i) => updateAnswer.run(a.name, i, a.aside ? 1 : 0, a.confirm ? 1 : 0, a.id),
          insert: (a, i) => insertAnswer.run(a.id, id, a.name, i, a.aside ? 1 : 0, a.confirm ? 1 : 0),
          hide: (answerId) => hideAnswer.run(now, answerId),
        });
        for (const [from, to] of moves) {
          for (const card of selectCardsOnStage.all(from) as (PlaceRow & { cardId: string })[]) {
            recordPlace(card.cardId, now, "stage-removed", null, placeFrom(card), { stageId: to, past: 0, node: [], burned: false });
          }
        }
        const after = srsTypeFrom(selectSrsType.get(id));
        const [was, is] = [srsSnapshot(before), srsSnapshot(after)];
        if (was !== is) insertSrsTypeChange.run(id, was, is, now);
        return after;
      });
    },
    /** Hides the SRS type. "builtin" when it's one that comes with the app; "used" when a deck still has it; "missing" when the id never existed; hiding twice keeps the first time. */
    removeSrsType(id: string, now: number): "ok" | "used" | "builtin" | "missing" {
      if (!selectAnySrsType.get(id)) return "missing";
      if ((selectAnySrsType.get(id) as { builtin: number }).builtin === 1) return "builtin";
      const { n } = decksOnSrsType.get(id) as { n: number };
      if (n > 0) return "used";
      removeSrsType.run(now, id);
      return "ok";
    },
    getSettings(): Settings {
      return settingsFrom(selectSettings.all() as SettingRow[]);
    },
    /** Each setting given is stored when it differs from what it reads as now, with a row of what it changed from and to. */
    updateSettings(patch: SettingsUpdate, now: number): Settings {
      return transaction(() => {
        const before = settingsFrom(selectSettings.all() as SettingRow[]);
        for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
          const value = patch[key];
          if (value === undefined) continue;
          const [from, to] = [JSON.stringify(before[key]), JSON.stringify(value)];
          if (from === to) continue;
          upsertSetting.run(key, to);
          insertSettingChange.run(key, from, to, now);
        }
        return settingsFrom(selectSettings.all() as SettingRow[]);
      });
    },
    listDecks(now: number): Deck[] {
      const today = todayAt(now);
      // The decks on one SRS type share one reading of it: a type's own counts are the heavier part of each deck's read.
      const types = new Map<string, SrsType>();
      const typeOf = (srsTypeId: string): SrsType => {
        let type = types.get(srsTypeId);
        if (!type) {
          type = srsTypeOf(srsTypeId);
          types.set(srsTypeId, type);
        }
        return type;
      };
      return selectDecks.all().map((row) => deckFrom(row, today, typeOf));
    },
    getDeck(id: string, now: number): Deck | null {
      const row = selectDeck.get(id);
      return row ? deckFrom(row, todayAt(now)) : null;
    },
    /** Whether a living deck has that id: what a route checks before it does anything, where the deck's counts aren't wanted. */
    hasDeck(id: string): boolean {
      return selectDeckExists.get(id) !== undefined;
    },
    /** The card type a living deck's cards are made of; null for no such deck. */
    deckTypeId(id: string): string | null {
      const row = selectDeckTypeId.get(id) as { typeId: string } | undefined;
      return row?.typeId ?? null;
    },
    /** Idempotent: the same id again returns the deck that already exists. */
    insertDeck(deck: NewDeck, now: number): Deck {
      insertDeck.run(deck.id, deck.name, deck.typeId, deck.srsTypeId, now);
      return deckFrom(selectAnyDeck.get(deck.id), todayAt(now));
    },
    /**
     * The name, and the SRS type. The same name again changes and records nothing. A new SRS type is recorded, and every
     * card that isn't new keeps its rung by position (the nth stage of the old ladder is the nth of the new, one above the
     * new top counts as the top, burned stays burned) with a 'switch' row each; the clock isn't restarted. The deck must
     * exist and not be removed; the type must exist.
     */
    updateDeck(id: string, update: DeckUpdate, now: number): Deck {
      return transaction(() => {
        const today = todayAt(now);
        const before = deckFrom(selectDeck.get(id), today);
        if (update.name !== undefined && update.name !== before.name) {
          updateDeckName.run(update.name, id);
          insertRename.run(id, before.name, update.name, now);
        }
        if (update.settings) {
          // Each setting given is stored when it differs from what it reads as now, with a row of what it changed from and to.
          const stored = JSON.parse((selectDeckSettings.get(id) as { settings: string }).settings) as Record<string, unknown>;
          let changed = false;
          for (const key of Object.keys(DEFAULT_DECK_SETTINGS) as (keyof DeckSettings)[]) {
            const value = update.settings[key];
            if (value === undefined) continue;
            const [from, to] = [JSON.stringify(before.settings[key]), JSON.stringify(value)];
            if (from === to) continue;
            stored[key] = value;
            insertDeckSettingChange.run(id, key, from, to, now);
            changed = true;
          }
          if (changed) updateDeckSettings.run(JSON.stringify(stored), id);
        }
        if (update.srsTypeId !== undefined && update.srsTypeId !== before.srsTypeId) {
          const from = srsTypeOf(before.srsTypeId);
          const to = srsTypeFrom(selectSrsType.get(update.srsTypeId));
          updateDeckSrsType.run(to.id, id);
          insertDeckSrsChange.run(id, from.id, to.id, now);
          for (const card of selectCards.all(id) as CardRow[]) {
            const place = placeFrom(card);
            if (isNew(place)) {
              // A new card inside an ask-again of the old type's answers starts the new type fresh; the row keeps that it did.
              if (place.node.length > 0) recordPlace(card.id, now, "switch", null, place, NEW_PLACE);
              continue;
            }
            const landed = isBurned(from, place) ? BURNED_PLACE : rungOn(to, stageIndex(from, place));
            recordPlace(card.id, now, "switch", null, place, landed);
          }
        }
        return deckFrom(selectDeck.get(id), today);
      });
    },
    /** Hides the deck and, with it, its cards. Idempotent: removing again keeps the first removal time. Returns whether the deck exists at all. */
    removeDeck(id: string, now: number): boolean {
      return removeDeck.run(now, id).changes > 0;
    },
    listCards(deckId: string, now: number): Card[] {
      return cardsFrom(selectCards.all(deckId) as CardRow[], selectDeckValues.all(deckId) as ValueRow[], srsTypeOfDeck(deckId), todayAt(now));
    },
    /** The card, when it is in that deck. */
    getCard(deckId: string, cardId: string, now: number): Card | null {
      const row = selectDeckCard.get(deckId, cardId) as CardRow | undefined;
      if (!row) return null;
      return cardsFrom([row], selectCardValues.all(cardId) as ValueRow[], srsTypeOfDeck(deckId), todayAt(now))[0] ?? null;
    },
    /** Idempotent: the same id again returns the card that already exists, in whatever deck it was first put, values and source untouched. */
    insertCard(deckId: string, card: NewCard, now: number): Card {
      return transaction(() => {
        const inserted = insertCard.run(card.id, deckId, now).changes > 0;
        if (inserted) {
          for (const [fieldId, value] of Object.entries(card.values)) insertValue.run(card.id, fieldId, value);
          const from = card.source;
          if (from) insertSource.run(card.id, from.url, from.title, from.text, from.startMs ?? null, from.endMs ?? null, from.channel?.name ?? null, from.channel?.url ?? null, from.client, now);
        }
        const row = selectCard.get(card.id) as CardRow | undefined;
        const [saved] = row ? cardsFrom([row], selectCardValues.all(card.id) as ValueRow[], srsTypeOfDeck(row.deckId), todayAt(now)) : [];
        if (!saved) throw new Error("The card vanished between insert and read-back.");
        return saved;
      });
    },
    /**
     * Changes some of a card's values. Each one given is stored when it differs from what the card has (a field never
     * filled reads as empty), with a row of what it changed from and to; the rest keep what they have. Null when the
     * card isn't in that deck.
     */
    updateCard(deckId: string, cardId: string, update: CardUpdate, now: number): Card | null {
      return transaction(() => {
        if (!selectDeckCard.get(deckId, cardId)) return null;
        const had = new Map((selectCardValues.all(cardId) as ValueRow[]).map((v) => [v.fieldId, v.value]));
        for (const [fieldId, value] of Object.entries(update.values)) {
          const from = had.get(fieldId) ?? "";
          if (from === value) continue;
          upsertValue.run(cardId, fieldId, value);
          insertValueChange.run(cardId, fieldId, from, value, now);
        }
        const row = selectDeckCard.get(deckId, cardId) as CardRow;
        return cardsFrom([row], selectCardValues.all(cardId) as ValueRow[], srsTypeOfDeck(deckId), todayAt(now))[0] ?? null;
      });
    },
    /** Hides the card from its deck. Idempotent: removing again keeps the first removal time. False when no such card was ever in that deck. */
    removeCard(deckId: string, cardId: string, now: number): boolean {
      return removeCard.run(now, cardId, deckId).changes > 0;
    },
    /**
     * Records what the answer does to the card's place (the contracts' `resolve`, with the deck's type as it is now) and
     * returns the card fresh. The sitting it happened in, the spans the browser measured and whether it was a miss are
     * frozen on the row; a sitting that isn't this deck's is refused.
     */
    answerCard(deckId: string, cardId: string, answer: CardAnswer, now: number): Card | "no-card" | "no-answer" | "no-session" {
      return transaction(() => {
        const row = selectDeckCard.get(deckId, cardId) as CardRow | undefined;
        if (!row) return "no-card";
        const type = srsTypeOfDeck(deckId);
        if (!type.answers.some((a) => a.id === answer.answerId)) return "no-answer";
        if (answer.sessionId !== undefined && !selectReviewSession.get(answer.sessionId, deckId)) return "no-session";
        const place = placeFrom(row);
        const extras: AnswerExtras = { sessionId: answer.sessionId ?? null, thinkMs: answer.thinkMs ?? null, decideMs: answer.decideMs ?? null, miss: missOf(type, answer.answerId) };
        recordPlace(cardId, now, "answer", answer.answerId, place, resolve(type, place, answer.answerId).place, extras);
        const after = selectDeckCard.get(deckId, cardId) as CardRow;
        const [card] = cardsFrom([after], selectCardValues.all(cardId) as ValueRow[], type, todayAt(now));
        if (!card) throw new Error("The card vanished after its answer.");
        return card;
      });
    },
    /** Idempotent: the same id again returns the sitting that already exists, as it is. Null when that id is a sitting of another deck. */
    insertReviewSession(deckId: string, session: NewReviewSession, who: { device: string; userAgent: string }, now: number): ReviewSession | null {
      insertReviewSession.run(session.id, deckId, session.kind, now, who.device, who.userAgent);
      const row = selectReviewSession.get(session.id, deckId) as ReviewSessionRow | undefined;
      return row ? reviewSessionFrom(row) : null;
    },
    /** Ends the sitting once; ending it again changes nothing and returns it as it is. Null when it isn't this deck's. */
    endReviewSession(deckId: string, sessionId: string, end: ReviewSessionEnd, now: number): ReviewSession | null {
      return transaction(() => {
        if (!selectReviewSession.get(sessionId, deckId)) return null;
        endReviewSession.run(now, end.how, end.cardId ?? null, end.shownMs ?? null, end.revealed === undefined ? null : end.revealed ? 1 : 0, sessionId);
        return reviewSessionFrom(selectReviewSession.get(sessionId, deckId) as ReviewSessionRow);
      });
    },
    /** A file this account holds; null when it has none by that id. */
    getMedia(id: string): Media | null {
      const row = selectMedia.get(id);
      return row ? Media.parse(row) : null;
    },
    /** The hash of the bytes an id already names, hidden or not; null when the id is free. */
    mediaHash(id: string): string | null {
      const row = selectMediaHash.get(id) as { sha256: string } | undefined;
      return row?.sha256 ?? null;
    },
    /** Idempotent: the same id again returns the row that's already there, untouched. Whether it's the same file is the hash's to say (`mediaHash`). */
    insertMedia(media: Pick<Media, "id" | "kind" | "mime" | "bytes"> & { sha256: string }, now: number): Media {
      insertMedia.run(media.id, media.kind, media.mime, media.bytes, media.sha256, now);
      return Media.parse(selectAnyMedia.get(media.id));
    },
    /**
     * What's said in a clip, kept with it once: the same file's words again are the ones already kept, untouched (a
     * retry is harmless; they're what was heard when it was recorded, never changed). Gives back what's kept.
     */
    insertMediaCues(mediaId: string, cues: MediaCues, now: number): MediaCues {
      insertMediaCues.run(mediaId, JSON.stringify(cues), now);
      const row = selectMediaCues.get(mediaId) as { cues: string } | undefined;
      return (row && cuesFrom(row.cues)) ?? [];
    },
    /** The dictionaries kept on Panki, oldest first. */
    listDictionaryFiles(): ServerDictionary[] {
      return selectDictionaryFiles.all().map((row) => ServerDictionary.parse(row));
    },
    /** One kept dictionary; null when there's none by that id (or it was removed). */
    getDictionaryFile(id: string): ServerDictionary | null {
      const row = selectDictionaryFile.get(id);
      return row ? ServerDictionary.parse(row) : null;
    },
    /** The kept dictionary called this, if there is one: two of the same name would be one dictionary twice. */
    dictionaryFileTitled(title: string): ServerDictionary | null {
      const row = selectDictionaryFileByTitle.get(title);
      return row ? ServerDictionary.parse(row) : null;
    },
    /** The hash of the bytes an id already names, removed or not; null when the id is free. */
    dictionaryFileHash(id: string): string | null {
      const row = selectDictionaryFileHash.get(id) as { sha256: string } | undefined;
      return row?.sha256 ?? null;
    },
    /** Idempotent: the same id again returns the row that's already there, untouched. */
    insertDictionaryFile(file: Omit<ServerDictionary, "uploadedAt"> & { sha256: string }, now: number): ServerDictionary {
      insertDictionaryFile.run(file.id, file.title, file.revision, file.description, file.bytes, file.sha256, now);
      return ServerDictionary.parse(selectAnyDictionaryFile.get(file.id));
    },
    /** Takes one off the list, keeping its row with the time it went; whether there was one to take off. */
    removeDictionaryFile(id: string, now: number): boolean {
      return removeDictionaryFile.run(now, id).changes > 0;
    },
    /** The kept dictionaries not yet moved to the shared store, oldest first, with what the move needs of each. */
    dictionaryFilesToMove(): (ServerDictionary & { sha256: string })[] {
      return (selectDictionaryFilesToMove.all() as DictionaryMoveRow[]).map(({ sha256, ...rest }) => ({ ...ServerDictionary.parse(rest), sha256 }));
    },
    /** That the dictionary is the shared store's now; the row stays. Marking again keeps the first time. */
    markDictionaryMoved(id: string, now: number): void {
      markDictionaryMoved.run(now, id);
    },
    /**
     * The account's Forvo key, typed in Settings before the key was everyone's; null when there's none. Read only to
     * move it to the shared store (or to see that there's one to leave be), never sent back.
     */
    forvoKey(): string | null {
      const row = selectForvoKey.get() as { key: string } | undefined;
      return row?.key ?? null;
    },
    /** Takes the key out of the account for the shared store: the row goes and a `'moved'` change is kept, in one transaction. */
    takeForvoKey(now: number): string | null {
      return transaction(() => {
        const key = (selectForvoKey.get() as { key: string } | undefined)?.key ?? null;
        if (key === null) return null;
        deleteForvoKey.run();
        insertForvoKeyChange.run("moved", now);
        return key;
      });
    },
    /** The file a Forvo recording was kept as, when it has been; null when it hasn't, or its file was taken off. */
    forvoRecording(forvoId: number): string | null {
      const row = selectForvoRecording.get(forvoId) as { mediaId: string } | undefined;
      return row?.mediaId ?? null;
    },
    /** A Forvo recording, kept as the account's file (already a `media` row). */
    insertForvoRecording(recording: { forvoId: number; word: string; by: string; country: string; mediaId: string }, now: number): void {
      insertForvoRecording.run(recording.forvoId, recording.word, recording.by, recording.country, recording.mediaId, now);
    },
    /** Every Forvo recording the account keeps a file of: what's gathered into the shared store at startup. */
    forvoRecordings(): { forvoId: number; word: string; by: string; country: string; mediaId: string; fetchedAt: number }[] {
      return selectForvoRecordings.all() as { forvoId: number; word: string; by: string; country: string; mediaId: string; fetchedAt: number }[];
    },
    /** The ledger takes each event as it comes, stamped by the API's clock; the browser's own clock sits beside it. */
    insertEvents(events: readonly NewEvent[], who: { sessionId: string; device: string }, now: number): void {
      transaction(() => {
        for (const event of events) insertEvent.run(now, event.at, event.kind, event.path ?? null, JSON.stringify(event.data ?? {}), who.sessionId, who.device);
      });
    },
    /** Everything the Stats screen shows, worked out over the rows at `now`, for every living deck or one. Windows are the owner's days. */
    stats(deckId: string | null, now: number): Stats {
      const today = todayAt(now);
      const day = (instant: number): Day => dayOf(instant, today.settings.dayStartHour, timeZone);
      const todayKey = day(now);
      const from30 = addDays(todayKey, -29);
      const decks = selectScopeDecks.all(deckId, deckId) as DeckScopeRow[];
      const answers = selectScopeAnswers.all(deckId, deckId) as AnswerRow[];
      const sessions = selectScopeSessions.all(deckId, deckId) as SessionStatRow[];

      // Every answer by the day it fell in; the windows are read off the day keys, so a clock change moves nothing.
      const dayed = answers.map((a) => ({ ...a, day: day(a.at) }));
      const inWindow = (from: Day, to: Day = todayKey) => dayed.filter((a) => a.day >= from && a.day <= to);
      const rightOf = (rows: typeof dayed) => {
        const judged = rows.filter((a) => a.miss !== null);
        return { right: judged.filter((a) => a.miss === 0).length, of: judged.length };
      };
      const byDayCount = new Map<Day, number>();
      for (const a of dayed) byDayCount.set(a.day, (byDayCount.get(a.day) ?? 0) + 1);
      const studiedDays = [...byDayCount.keys()].sort();

      let current = 0;
      for (let d = byDayCount.has(todayKey) ? todayKey : addDays(todayKey, -1); byDayCount.has(d); d = addDays(d, -1)) current += 1;
      let best = 0;
      let run = 0;
      studiedDays.forEach((d, i) => {
        const previous = studiedDays[i - 1];
        run = previous !== undefined && daysBetween(previous, d) === 1 ? run + 1 : 1;
        best = Math.max(best, run);
      });
      const todayIndex = weekdayOf(todayKey);
      const weekStart = addDays(todayKey, -todayIndex);
      const week = Array.from({ length: 7 }, (_, i) => byDayCount.has(addDays(weekStart, i)));

      const ladders = new Map<string, { type: SrsType; stages: Map<string, number>; burned: number; fresh: number }>();
      const coming = Array.from({ length: 7 }, () => 0);
      const added = Array.from({ length: 12 }, () => 0);
      for (const deck of decks) {
        let ladder = ladders.get(deck.srsTypeId);
        if (!ladder) {
          const type = srsTypeOf(deck.srsTypeId);
          ladder = { type, stages: new Map(type.stages.map((s) => [s.id, 0])), burned: 0, fresh: 0 };
          ladders.set(deck.srsTypeId, ladder);
        }
        for (const card of selectCards.all(deck.id) as CardRow[]) {
          const place = placeFrom(card);
          if (isNew(place)) ladder.fresh += 1;
          else if (isBurned(ladder.type, place)) ladder.burned += 1;
          else if (place.stageId !== null && ladder.stages.has(place.stageId)) ladder.stages.set(place.stageId, (ladder.stages.get(place.stageId) ?? 0) + 1);
          const { dueAt: due } = scheduleOf(ladder.type, card, place, today);
          if (due !== null && !isNew(place)) {
            // Overdue counts as today: it's what a review now would show.
            const k = Math.max(0, daysBetween(todayKey, day(due)));
            if (k < coming.length) coming[k] = (coming[k] ?? 0) + 1;
          }
          const weeksBack = Math.max(0, Math.ceil(-daysBetween(weekStart, day(card.createdAt)) / 7));
          const slot = added.length - 1 - weeksBack;
          if (slot >= 0) added[slot] = (added[slot] ?? 0) + 1;
        }
      }

      const timeByDay = Array.from({ length: 14 }, (_, i) => ({ day: addDays(todayKey, i - 13), ms: 0 }));
      const timeSlot = new Map(timeByDay.map((entry, i) => [entry.day, i]));
      const addTime = (key: Day, ms: number) => {
        const i = timeSlot.get(key);
        const entry = i === undefined ? undefined : timeByDay[i];
        if (entry) entry.ms += ms;
      };
      for (const a of dayed) addTime(a.day, (a.thinkMs ?? 0) + (a.decideMs ?? 0));
      for (const s of sessions) if (s.endedHow === "left" && s.endedAt !== null && s.leftShownMs !== null) addTime(day(s.endedAt), s.leftShownMs);
      const spans = inWindow(from30).flatMap((a) => (a.thinkMs !== null && a.decideMs !== null ? [a.thinkMs + a.decideMs] : [])).sort((x, y) => x - y);
      const mid = spans[Math.floor(spans.length / 2)];
      const perCardMs = spans.length === 0 || mid === undefined ? null : spans.length % 2 === 1 ? mid : Math.round((mid + (spans[spans.length / 2 - 1] ?? mid)) / 2);

      const missesByCard = new Map<string, { misses: number; lastAt: number }>();
      for (const a of inWindow(from30)) {
        // A miss on a card since deleted still counts among the answers above; it just isn't a card to work on any more.
        if (a.miss !== 1 || a.living === 0) continue;
        const entry = missesByCard.get(a.cardId) ?? { misses: 0, lastAt: 0 };
        missesByCard.set(a.cardId, { misses: entry.misses + 1, lastAt: Math.max(entry.lastAt, a.at) });
      }
      const typeOfDeck = new Map(decks.map((d) => [d.id, d.typeId]));
      const tough = [...missesByCard.entries()]
        .sort(([, a], [, b]) => b.misses - a.misses || b.lastAt - a.lastAt)
        .slice(0, 5)
        .map(([cardId, { misses }]) => {
          const card = selectCard.get(cardId) as CardRow;
          const typeRow = selectAnyType.get(typeOfDeck.get(card.deckId) ?? "");
          // The card in words: its first Front field that holds text. A field of files holds an id, which says nothing.
          const front = typeRow ? typeFrom(typeRow).fields.find((f) => f.side === "front" && holdsWords(f.kind)) : undefined;
          const value = front ? (selectValue.get(cardId, front.id) as { value: string } | undefined) : undefined;
          return { cardId, deckId: card.deckId, front: value?.value ?? "", misses };
        });

      return Stats.parse({
        deckId,
        today: todayKey,
        reviews: { total: answers.length, today: byDayCount.get(todayKey) ?? 0, days7: inWindow(addDays(todayKey, -6)).length, days30: inWindow(from30).length },
        right: { days30: rightOf(inWindow(from30)), before: rightOf(inWindow(addDays(todayKey, -59), addDays(todayKey, -30))) },
        streak: { current, best, week, todayIndex },
        days: { studied: studiedDays.length, since: answers[0]?.at ?? null },
        byDay: studiedDays.filter((d) => d >= addDays(todayKey, -364)).map((d) => ({ day: d, n: byDayCount.get(d) ?? 0 })),
        ladders: [...ladders.values()]
          .sort((a, b) => a.type.createdAt - b.type.createdAt || a.type.id.localeCompare(b.type.id))
          .map(({ type, stages, burned, fresh }) => ({
            srsTypeId: type.id,
            name: type.name,
            stages: type.stages.map((s) => ({ id: s.id, name: s.name, n: stages.get(s.id) ?? 0 })),
            burnedName: type.burnedName,
            burned,
            fresh,
          })),
        coming,
        added,
        time: { byDay: timeByDay, perCardMs, sessions30: sessions.filter((s) => day(s.startedAt) >= from30).length },
        tough,
      });
    },
    close() {
      db.close();
    },
  };

  // The types that come with the app are rows like any other, marked `builtin`. A database that has none yet gets
  // them, and that first time everything is cleared for them: every deck goes onto the default one (its cards keep
  // their rung, as any switch of type does) and the types from before are hidden. After that a missing one is added,
  // and one that's there is brought up to what the app defines today: nobody can edit it, so it is always the app's
  // latest (its stages and answers keep their ids, position for position, so cards stay where they are).
  const mint = () => crypto.randomUUID();
  const builtinIds = new Map((selectBuiltins.all() as { id: string; builtin: string }[]).map((row) => [row.builtin, row.id]));
  const first = builtinIds.size === 0;
  const before = first ? api.listSrsTypes() : [];
  for (const [i, starter] of SRS_STARTER_IDS.entries()) {
    const existing = api.getSrsType(builtinIds.get(starter) ?? "");
    if (existing) {
      const { id, ...today } = makeStarter(starter, mint, { id: existing.id, stageIds: existing.stages.map((s) => s.id), answerIds: existing.answers.map((a) => a.id) });
      // Nothing changes, and nothing is recorded, when it's already the same. A stage the app dropped while cards sit
      // on it is left for a migration to move: this never guesses where cards go.
      api.updateSrsType(id, today, now());
      continue;
    }
    // A millisecond apart, so the list keeps this order rather than sorting them by id.
    const made = api.insertSrsType(makeStarter(starter, mint), now() + i);
    markBuiltin.run(starter, made.id);
    if (first && starter === DEFAULT_STARTER) for (const deck of api.listDecks(now())) api.updateDeck(deck.id, { srsTypeId: made.id }, now());
  }
  for (const type of before) removeSrsType.run(now(), type.id);

  return api;
}
