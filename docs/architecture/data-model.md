# Data model

> **Scope of this file.** The data model: every database, table and kept shape, and how it changes.

**Every account is a whole Panki of its own.** `PANKI_DATA_DIR` holds `auth.sqlite` (who the accounts are and which devices are signed in) and `users/<userId>/`, one folder per account and the whole of it: `panki.sqlite` and, beside it, `media/<mediaId>` (the files its cards hold, one per id, no extension; `dbs.ts` → `mediaDirFor`) and `dictionaries/<id>` (the dictionary zips it keeps on Panki for the extension; `dictionaryDirFor`). Each database is opened by the same `openDb` (migrations, the built-in SRS types) the first time that account makes a request (`dbs.ts` → `createDbs`: `dbFor(userId)` opens lazily and keeps the handle, `closeAll()` at shutdown). All WAL mode, foreign keys on, and a write that finds its file locked waits up to five seconds rather than failing (`busy_timeout`: a command run beside the API, `pnpm backup` or `pnpm space`, may hold a file for a moment). Accounts are made only from the terminal: `pnpm user:add <name> <password>` (the password on the command line, the owner's choice; at least `PASSWORD_MIN` characters), `pnpm user:password <name> <newPassword>` (signs every device of that account out, the standard safeguard, and records the time in `password_changes`), `pnpm user:list`, and `pnpm user:admin <name>` / `pnpm user:admin <name> off` (makes an account an admin, one that changes what everyone shares, or takes it back; `User.admin`, carried by `/api/me` and the sign-in's answer, and refused with `403` by `session.ts` → `requireAdmin` on the routes marked admin-only below) (`apps/api/src/cli/users.ts`). **The first account adopts the data from before accounts existed:** when `add` makes the first user and `PANKI_DATA_DIR/panki.sqlite` is there, it is moved (with its `-wal` / `-shm`, `renameSync`, never copied) into that account's folder and the command says so; Windows refuses to move a file the running API holds, so the command prints "Stop `pnpm dev` first, then try again." and makes no account.

`auth.sqlite` (its own short migration list in `authDb.ts`, same `user_version` pattern):

```
users
  id             TEXT PRIMARY KEY   -- UUID minted by the CLI; names the account's folder
  name           TEXT NOT NULL UNIQUE COLLATE NOCASE
  password_hash  TEXT NOT NULL      -- scrypt$N$r$p$salt$key (password.ts); never anything else about the password
  created_at     INTEGER NOT NULL
  removed_at     INTEGER
  admin          INTEGER NOT NULL DEFAULT 0   -- 0 | 1: may change what everyone shares (migration 3, 2026-10-17); set only by `pnpm user:admin`

sessions                 -- one signed-in device
  id             TEXT PRIMARY KEY   -- the public id the app shows and revokes by; never the secret
  token_hash     TEXT NOT NULL UNIQUE   -- sha256 hex of the cookie's secret
  user_id        TEXT NOT NULL REFERENCES users(id)   -- indexed
  user_agent     TEXT NOT NULL      -- the browser's whole description of itself
  device         TEXT NOT NULL      -- the same in the app's words ("Firefox on Windows"), device.ts
  created_at, last_seen_at INTEGER NOT NULL   -- last_seen_at is touched at most once a minute
  revoked_at     INTEGER            -- signing out hides, never deletes

login_attempts           -- every try, right or wrong
  id, at, name, ok (0|1), address

password_changes         -- when an account's password changed; only the time, never a hash (migration 2)
  id, user_id REFERENCES users(id), at

admin_changes            -- every time an account was made an admin or stopped being one (migration 3); the same value again records nothing
  id, user_id REFERENCES users(id), admin (0|1), at
```

**A sign-in that isn't the app's (step 16).** Something that can't keep the app's cookie, the browser extension, signs in with the same name and password and `bearer: true`: the answer carries the session's secret itself and no cookie is set, and from then on it sends `Authorization: Bearer <secret>`. `requireSession` takes either (`session.ts` → `secretOf`); the row is a session like any other, so it's listed with the devices in Settings (its `device` reads "Panki extension · Chrome on Windows", from the `client` it named) and signed out the same ways. Nothing else about the API changes for it: no CORS is opened, because the extension's own pages and worker are let through by the browser once the owner has allowed Panki's address, and a page's script never calls the API at all.

Why: **the cookie carries a secret the database never holds** (32 random bytes, base64url; `panki_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, ten years, `Secure` when the request came in over https: `trust proxy` is `loopback`, so nginx's `X-Forwarded-Proto` counts and `req.ip` is the browser's), the row keeps its hash, so the file alone signs nobody in. Passwords are scrypt (N 2^15, r 8, p 1, a 16-byte salt, a 64-byte key; Node's own, no dependency) and the stored string carries its parameters, so raising the cost changes only new hashes. **A wrong sign-in and an unknown name are the same answer** and take the same time (the unknown name is checked against a dummy hash). **Five wrong tries from one address inside fifteen minutes** and that address waits a minute (`throttle.ts`, in memory). Nothing about a password or a token is ever logged.

**What every account shares** lives in `shared.sqlite` (`shared.ts` → `openShared`, its own migration list, the same `user_version` pattern; opened once at startup, closed at shutdown): the keys for the services Panki calls, the dictionaries kept on Panki, how transcribing runs and every transcript, every word ever asked of Forvo and its recordings (`forvo_words`, `forvo_recordings`, kept for good; each account's card holding a copy of the one picked as its own file), and each video's pictures (`video_pictures`: its thumbnail and its channel's picture, kept once, the bytes in the row; "Zero outbound network calls" below says where they come from). Anyone signed in reads it; an admin alone changes it (but a transcript, grown by whoever watches, and a video's pictures, kept by whoever's card asks first). Its dictionary zips live in `shared/dictionaries/<id>` under the data folder (`mediaFiles.ts` → `sharedDictionaryDir`). Until 2026-10-17 the Forvo key and the dictionaries were each account's own; at startup `shared.ts` → `gatherShared` moves what accounts still hold over (the first Forvo key found becomes everyone's, a second account's that differs is left where it is and said in the log; each dictionary's zip is moved with `renameSync`, copied then deleted across file systems, and its row made under the same id, `uploaded_at` and `uploaded_by` the account's; one whose title is kept already is let go, its zip deleted, as a copy of a file the owner has; one whose zip is missing is marked and nothing moved), marks every row it has dealt with (`dictionary_files.moved_at`, a `'moved'` row in `forvo_key_changes`) so the next start moves nothing, and logs one account's trouble without stopping the API.

```
service_keys             -- one key per service: 'forvo', an engine's id (the contracts' EngineId), or a Panki AI provider's (AiProviderId); typed in Settings by an admin, read only to call that service, never sent back
  service     TEXT PRIMARY KEY
  key         TEXT NOT NULL
  set_at      INTEGER NOT NULL

service_key_changes      -- that a service's key was set or forgotten, when and by whom; never what it was (a forgotten key's row is deleted: old keys are secrets, not a record)
  id, service, what ('set' | 'forgotten'), at
  user_id     TEXT               -- the admin who did it (migration 6, 2026-10-17; NULL before; the account a key was gathered from)

dictionary_files         -- a dictionary kept on Panki to add to the extension from; the zip is shared/dictionaries/<id>
  id          TEXT PRIMARY KEY   -- UUID minted by whoever uploads it, so a retried upload is harmless
  title, revision, description   -- what the zip's own index.json says (contracts → `openDictionary`); one living row per title
  bytes, sha256                  -- the zip's size and hash: the same id with other bytes is refused
  uploaded_at INTEGER NOT NULL
  uploaded_by TEXT NOT NULL DEFAULT ''   -- the account that uploaded it (or held it before the move)
  removed_at  INTEGER            -- off the list; the row stays, the zip is deleted
  removed_by  TEXT               -- the admin who took it off (migration 6; NULL before)

settings                 -- what an admin sets for everyone, in groups whose keys never meet (`shared.ts` → `Group`): how transcribing runs (the contracts' Transcription), where word audio comes from (WordAudio), Panki AI (PankiAi: `aiOn`, `aiProvider`, `aiModel`, 2026-10-30); only the keys an admin changed; reading merges them over the group's defaults key by key, a value that no longer fits its rule reading as the default
  key         TEXT PRIMARY KEY
  value       TEXT NOT NULL      -- JSON

settings_changes
  id, key, from_value, to_value, at
  user_id     TEXT               -- the admin who changed it (migration 6; NULL before)

usage                    -- the usage ledger (migration 13, 2026-10-30): one row for every paid call Panki makes, written by whoever makes it; never changed or deleted
  id          INTEGER PRIMARY KEY
  kind        TEXT NOT NULL      -- 'ai' | 'transcription' | 'wordAudio' (the contracts' UsageKind): the Admin panel it's shown under; indexed with `at`
  service     TEXT NOT NULL      -- a Panki AI provider's id, an engine's, or a source of word audio's; indexed with `at` (Forvo's day's count reads it)
  model       TEXT               -- the AI model, for an AI call
  what        TEXT NOT NULL      -- 'chunk' | 'whole' (an engine), 'list' | 'recording' (Forvo), 'request' (Forvo's, copied from `service_calls`); an AI action's id from step 2
  ref         TEXT               -- what it was done to: the piece's id, the whole video's job, the word, the Forvo recording
  user_id     TEXT               -- whose call it was; NULL for Forvo's requests from before (`service_calls` had no account)
  input_tokens, output_tokens INTEGER   -- an AI call's
  sound_ms    INTEGER            -- the sound an engine heard: a chunk's from its sound to its end, a whole video's length
  requests    INTEGER            -- a request to a source (1)
  cost_micros INTEGER            -- whole micro-dollars at the listed price as the row was written (`tokenCostMicros`, `soundCostMicros`); NULL for a flat plan (Forvo)
  at          INTEGER NOT NULL
  -- The migration copied in what came before: every chunk ever sent with sound and every whole video done, at 22 cents an hour; every row of
  -- `service_calls` (Forvo's requests, kept from migration 2 and written by `createForvo` until 2026-10-30, no longer written).

transcripts              -- one per video, shared by everyone; `language` is what the engine last heard it as for sure, when asked (ISO 639-3), or the language it was told when it heard words in it (Transcribe pressed; `language_probability` NULL then)
  video_id    TEXT PRIMARY KEY   -- the YouTube id (the contracts' VideoId)
  language, language_probability
  created_at, updated_at INTEGER NOT NULL

transcript_pieces        -- every piece of a video's sound sent to an engine, paid for whether or not its words were kept
  id          TEXT PRIMARY KEY   -- UUID minted by the extension, so a piece sent again is the same piece and never a second call
  video_id    TEXT NOT NULL REFERENCES transcripts(video_id)   -- indexed
  start_ms, end_ms INTEGER NOT NULL   -- where its sound lies in the video (the quiet listened through before it is a transcript_quiet row)
  engine      TEXT NOT NULL      -- which engine heard it
  language, language_probability      -- what it heard, when asked
  checked     INTEGER NOT NULL   -- 0 | 1: the engine was asked what language it heard (a run's pieces until it hears Japanese for sure)
  kept        INTEGER NOT NULL   -- 0 | 1: its words were taken into the transcript (not when it wrote them in another language, while the language was checked; always 1 since 2026-10-18)
  user_id     TEXT NOT NULL      -- whose extension sent it (a whole video's own pieces: who asked for the download)
  created_at  INTEGER NOT NULL
  removed_at  INTEGER            -- set when the transcript was forgotten over it (migration 5), or a whole video came in over it: it stands aside with its words, uncovered, still counted as paid for
  job_id      TEXT               -- a whole video's own piece (migration 10, 2026-10-20): its download's id; the download's words are kept in pieces of about 30 s each, ending between two words (`piecesOfVideo`), so a part can be forgotten as a chunk's can
  engine_ms   INTEGER            -- how long the engine took over it, in ms (migration 10; NULL before, and on a whole video's pieces)
  run_ms      INTEGER            -- a run's first chunk with sound: ms from the run's start (the video's change, for a run that started by itself as it opened) until it was sent; run_ms + engine_ms is how soon a run's first words came (`estimate`)

transcript_jobs          -- every whole-video download asked for (migration 10, 2026-10-20): the engine fetching the video itself and transcribing it in one call (`transcribe/jobs.ts`)
  id          TEXT PRIMARY KEY   -- minted by the API
  video_id    TEXT NOT NULL REFERENCES transcripts(video_id)   -- indexed with asked_at
  engine, language TEXT NOT NULL  -- as the settings were when it was asked for
  length_ms   INTEGER NOT NULL   -- the video's length as the extension read it off the player (the job's pieces cover 0 to this)
  state       TEXT NOT NULL      -- 'running' | 'done' | 'failed'; never cancelled (paid for as it starts)
  attempts    INTEGER NOT NULL   -- how many times it was handed to the engine: once more after a trouble that may pass, never a third
  asked_at, started_at, ended_at INTEGER
  words, replaced INTEGER        -- done: how many words it heard, how many chunks stood aside for it
  credits     INTEGER            -- the engine's credits counted across it (its account read before and after; NULL when either read failed)
  sound_ms    INTEGER            -- the sound those credits paid for: the video, and the chunks sent to the same engine meanwhile
  message     TEXT               -- failed: why, in the owner's words
  user_id     TEXT NOT NULL      -- who asked for it

transcript_quiet         -- a stretch the silent player listened through with nothing to send (the quiet between two pieces, a jingle, music under nobody's voice): heard, nothing said; covered, no engine asked (migration 4, 2026-10-17)
  id          TEXT PRIMARY KEY   -- the extension's, as a piece's is, so the same stretch again changes nothing; the quiet before a piece's sound carries that piece's id
  video_id    TEXT NOT NULL REFERENCES transcripts(video_id)   -- indexed
  start_ms, end_ms INTEGER NOT NULL
  user_id     TEXT NOT NULL
  created_at  INTEGER NOT NULL
  removed_at  INTEGER            -- set when the transcript was forgotten over it

transcript_words         -- every word an engine heard, with its times in the video's own ms; never deleted
  id          INTEGER PRIMARY KEY
  video_id    TEXT NOT NULL      -- indexed with start_ms
  piece_id    TEXT NOT NULL REFERENCES transcript_pieces(id)
  text        TEXT NOT NULL      -- the engine's word, as heard; a fix stands beside it
  start_ms, end_ms INTEGER NOT NULL
  removed_at  INTEGER            -- set when a neighbouring piece heard the same moment farther from its own edge (the stitch, below); the word stands aside, unseen
  logprob     REAL               -- how sure the engine was of it, the log of its probability (ElevenLabs' own, migration 14, AI step 6); NULL on every word heard before. Under `UNSURE_BELOW` (0.5) the word is `unsure` and Proofread is told of it

transcript_fixes         -- a word changed, by hand or by Panki AI's Proofread: from what it read as (the latest fix's text, or the engine's) to what it says now; indexed by word (migration 11). A word reads as its latest fix that isn't undone; whichever came later wins
  id, word_id REFERENCES transcript_words(id), from_text, to_text, user_id, at
  start_ms, end_ms           -- where the word stands after the fix (migration 10, 2026-10-20: a line fixed with the pencil moves its words with its ends); NULL on fixes from before, where it stood as heard. A fix to '' takes the word out of the line
  source                     -- 'ai' for Panki AI's (migration 14, AI step 6); NULL a person's, as every fix before
  run_id, model, template_id, reason  -- an AI fix's run (`ProofreadAsk.run`, indexed: what Undo all takes back), what made it, and why
  undone_at, undone_by       -- an AI fix taken back, one step: it stands aside, never deleted, and the word reads as its fix before it, or the engine's

transcript_line_marks    -- a line split or joined by hand at a word (migration 15, AI step 6's editors): the latest for a word stands; never deleted
  id, word_id REFERENCES transcript_words(id), mark ('break': a line starts here; 'join': none does), user_id, at

transcript_forgets       -- every ask to forget, as it came, whether or not anything stood in the stretch (migration 6): the pieces' removed_at alone can't tell one ask from the next
  id, video_id REFERENCES transcripts(video_id), start_ms, end_ms (both NULL for the whole video), user_id, at
```

**The stitch** (`shared.ts` → `insertPiece`, one transaction with the piece and its words). The extension cuts pieces where nobody is speaking, but a forced cut or a jump makes two pieces that overlap by a second or two, both hearing the word at the edge. By geometry alone: a word's depth in a piece is its distance from the nearer edge; for every living word of another piece that begins inside the new piece, the new piece wins when it heard that moment deeper, and the old word gets `removed_at`; for every new word that begins inside another kept piece, the old piece wins when it was at least as deep, and the new word is written with `removed_at` set as it lands. Exactly one survives at each moment, and nothing is deleted. The transcript read back (`transcript`) is the living words in order, each as its latest fix (`heard` carrying the engine's word only when a fix changed it), with `covered`, the kept pieces' stretches and the quiet listened through (`transcript_quiet`) merged where they overlap or come within 100 ms. A piece the engine wrote in another language (`keepHeard`: not `jpn` or `ja`, with words) is stored with `kept = 0` and no words, so it costs once and is never sent again (one asked the language that heard no words is kept: a stretch where nothing was said); `secondsTranscribed` sums every piece, kept or not, for the Settings' count.

Each account's `panki.sqlite`:

```
card_types
  id          TEXT PRIMARY KEY   -- UUID minted by the browser
  name        TEXT NOT NULL
  created_at  INTEGER NOT NULL   -- ms since epoch, stamped by the API
  removed_at  INTEGER            -- set by delete, only when no deck uses it
  layout      TEXT NOT NULL DEFAULT '[]'   -- how its cards look in a review: each field's part as JSON, in the card's order (migration 18); empty is "as the fields' sides make it"
  stage_tag   TEXT                         -- where its cards' stage tag sits and how (`StageTag`: shown, size, corner) as JSON (2026-10-18); none is the tag where it always was, top left (contracts → `stageTagOf`); beside it `spark`, `flag` and `examples` (the example arrows' `ExamplesPlace`, null or missing where the example is: `examplesPlaceOf`, 2026-11-07)
  listen      TEXT                         -- Listen first (`ListenFirst`: on, heard) as JSON (migration 39, 2026-11-01); none is off, twice heard (contracts → `listenFirstOf`)

card_fields
  id          TEXT PRIMARY KEY   -- UUID minted by the browser
  type_id     TEXT NOT NULL REFERENCES card_types(id)   -- indexed
  name        TEXT NOT NULL
  kind        TEXT NOT NULL DEFAULT 'text'   -- 'text' | 'long' | 'media' | 'image' | 'youtube' ('audio' and 'video' until migration 16); the ids are the contracts' FieldKind; no CHECK, so a new kind is no migration
  side        TEXT NOT NULL      -- 'front' | 'back'; since layouts, written from the layout when one is saved, and read from it, never the other way
  required    INTEGER NOT NULL   -- 0 | 1
  position    INTEGER NOT NULL   -- the order in a form; the card's own order is the layout's
  removed_at  INTEGER            -- a hidden field; its values stay

card_type_renames        -- like deck_renames, for a type's name
  id, type_id, from_name, to_name, at

card_type_layout_changes -- every change to a type's layout: the whole of it before and after (migration 18)
  id, type_id, from_layout, to_layout, at

card_type_changes        -- every save that changed a type at all: the whole type (name, fields, layout) before and after, as srs_type_changes keeps an SRS type (migration 21, 2026-10-17; a field renamed, given another kind or made optional had no trace before this)
  id, type_id, before, after, at

srs_types                -- how a deck's cards come back
  id          TEXT PRIMARY KEY   -- UUID minted by the browser
  name        TEXT NOT NULL
  after       TEXT NOT NULL      -- 'burn' | 'repeat' | 'grow': what the last stage leads to; no CHECK (the contracts' SrsAfter)
  grow_by     REAL NOT NULL      -- with 'grow', what the wait is multiplied by past the top
  burned_name TEXT NOT NULL      -- what the end is called
  flow        TEXT NOT NULL      -- the default rules, JSON: answer id → step (move / start / burn / to / again { wait, then })
  overrides   TEXT NOT NULL      -- a stage's own rules, JSON: stage id → flow
  created_at  INTEGER NOT NULL
  removed_at  INTEGER            -- set by delete, only when no deck uses it

srs_stages               -- the rungs of a type's ladder
  id          TEXT PRIMARY KEY
  type_id     TEXT NOT NULL REFERENCES srs_types(id)   -- indexed
  name        TEXT NOT NULL      -- may be empty: shown as "Stage N"
  wait_n      INTEGER NOT NULL
  wait_unit   TEXT NOT NULL      -- 'min' | 'h' | 'd' | 'w' | 'mo'; no CHECK (the contracts' WaitUnit)
  position    INTEGER NOT NULL
  removed_at  INTEGER            -- a hidden stage; the cards that were on it were moved (card_places) and its name stays readable

srs_answers              -- the buttons under the review card
  id, type_id, name, position, removed_at   -- like srs_stages

srs_type_changes         -- every save of a type: the whole type before and after, as JSON
  id, type_id, before, after, at

decks
  id          TEXT PRIMARY KEY   -- UUID minted by the browser
  name        TEXT NOT NULL
  type_id     TEXT REFERENCES card_types(id)   -- set once, by the API, when the deck is made
  srs_type_id TEXT REFERENCES srs_types(id)    -- set when the deck is made, changeable in its settings
  created_at  INTEGER NOT NULL
  removed_at  INTEGER            -- set by delete; the deck and its cards stay, hidden
  settings    TEXT NOT NULL DEFAULT '{}'   -- JSON, only the DeckSettings keys changed; the review keys it kept
                                           -- before migration 49 stay, read by nothing

deck_renames
  id, deck_id, from_name, to_name, at

deck_srs_changes         -- a deck moved to another SRS type
  id, deck_id, from_type_id, to_type_id, at

cards
  id          TEXT PRIMARY KEY   -- UUID minted by the browser
  deck_id     TEXT REFERENCES decks(id)   -- indexed; always set by the API
  created_at  INTEGER NOT NULL
  removed_at  INTEGER            -- set by delete (migration 15); the card, its values, its answers and its place all stay, hidden

card_values              -- a card's text, one row per field it was given
  card_id     TEXT NOT NULL REFERENCES cards(id)
  field_id    TEXT NOT NULL REFERENCES card_fields(id)
  value       TEXT NOT NULL      -- in a field of files (audio, video, image): the id of a `media` row
  source      TEXT               -- where the value came from, JSON (the contracts' ValueSource: owner, text, dictionary, video, forvo, ai), migration 40, AI step 3; always written since; null before, read as the owner's or as its card's capture says (`legacySourceOf`). `card_example_values.source` is the same for an example's values
  PRIMARY KEY (card_id, field_id)

dictionary_files         -- a dictionary the account kept on Panki before they were everyone's (migration 19; the zip was users/<userId>/dictionaries/<id>). No longer written: the shared store's table has them now
  id          TEXT PRIMARY KEY   -- UUID minted by whoever uploads it, so a retried upload is harmless
  title, revision, description   -- what the zip's own index.json says (contracts → `openDictionary`, the extension's reader too); one living row per title
  bytes, sha256                  -- the zip's size and hash: the same id with other bytes is refused
  uploaded_at INTEGER NOT NULL
  removed_at  INTEGER            -- off the list; the row stays, the zip is deleted (a copy of a file the owner has)
  moved_at    INTEGER            -- when `gatherShared` moved it to the shared store, or dealt with it (migration 20, 2026-10-17); NULL is still to move

media                    -- a file a card holds; the bytes are users/<userId>/media/<id> (migration 13)
  id          TEXT PRIMARY KEY   -- UUID minted by whoever sends it, so a retried upload is harmless
  kind        TEXT NOT NULL      -- 'audio' | 'video' | 'image'; no CHECK (the contracts' MediaKind)
  mime        TEXT NOT NULL      -- what it's served as; checked against the file's first bytes when it came in
  bytes       INTEGER NOT NULL
  sha256      TEXT NOT NULL      -- of the bytes: tells a retry from another file under the same id
  created_at  INTEGER NOT NULL
  removed_at  INTEGER            -- nothing sets it yet; a removal will hide, never destroy

media_cues               -- what's said in a clip, as it was heard on the video when it was recorded (migration 20, 2026-10-18), and in a sound recorded off a video since 2026-10-28 (nothing shows a sound's); one row a file at most, written once with it, never changed
  media_id    TEXT PRIMARY KEY REFERENCES media(id)
  cues        TEXT NOT NULL      -- JSON, the contracts' MediaCues: each line, when it's said from the clip's start in ms, and when each piece of it is; read onto each card as `Card.cues`
  created_at  INTEGER NOT NULL

media_recordings         -- how a file was recorded off a video, so it can be recorded again, longer or better, from this alone (migration 38, 2026-10-28; the owner: "save all the data we can… so in the future I can re-record batch on client side"); one row a file at most, written once with it (`PUT /api/media/:id/recording`, right after its bytes), never changed; read by nothing yet. A file from before has none
  media_id    TEXT PRIMARY KEY REFERENCES media(id)
  url         TEXT NOT NULL      -- the video's address at the recording's start, as a card's source keeps it (the video id is read from it)
  cut         TEXT NOT NULL      -- 'clip' (the sentence's) | 'word' (the picked word's own stretch of it); with `media.kind`, which of the extension's recorded roles it was (Sentence video, Sentence audio, Word video, Word audio (YouTube))
  start_ms, end_ms INTEGER NOT NULL  -- the stretch asked for, in the video's own time: the cut's ends as they stood
  stopped_ms  INTEGER NOT NULL   -- where the video really stood when the recording stopped (a few ms past end_ms; sooner at the video's own end or CLIP_MAX_SECONDS)
  width, height INTEGER          -- the picture's size as the player played it when it stopped (YouTube's own quality then: 854×480 is its 480p), for a sound recorded alone too
  frame_rate  REAL               -- the picture's rate, where the browser says it
  video_bits, audio_bits INTEGER -- the bit rates the recorder was given (record.ts → VIDEO_BITS, SOUND_BITS); no video_bits for a sound alone
  client      TEXT NOT NULL      -- "extension/0.1.0"
  build       TEXT               -- the extension's build that recorded it, its fingerprint (`build.json`), finer than client
  created_at  INTEGER NOT NULL

forvo_key                -- the account's Forvo key, typed in Settings before the key was everyone's (migration 17); one row at most. No longer written: `gatherShared` moves it to the shared store's `service_keys` at startup, and a second account's that differs is left here, unused
  id          INTEGER PRIMARY KEY CHECK (id = 1)
  key         TEXT NOT NULL      -- sent back only to an admin, to see what's there (under a spoiler); never logged
  set_at      INTEGER NOT NULL

forvo_key_changes        -- that the key was set, forgotten or moved to the shared store, and when; never what it was
  id          INTEGER PRIMARY KEY
  what        TEXT NOT NULL      -- 'set' | 'forgotten' | 'moved'
  at          INTEGER NOT NULL

forvo_recordings         -- every Forvo recording the account picked, kept as one of its files: the same one asked for again is that file; its bytes came from the shared store's copy (fetched from Forvo once for everyone)
  forvo_id    INTEGER PRIMARY KEY  -- Forvo's own id for the recording
  word        TEXT NOT NULL
  by          TEXT NOT NULL        -- who said it, on Forvo
  country     TEXT NOT NULL
  media_id    TEXT NOT NULL REFERENCES media(id)
  fetched_at  INTEGER NOT NULL

card_value_changes       -- every time a card's text was changed: what the value was and what it became
  id          INTEGER PRIMARY KEY
  card_id     TEXT NOT NULL REFERENCES cards(id)   -- indexed
  field_id    TEXT NOT NULL REFERENCES card_fields(id)
  from_value  TEXT NOT NULL      -- '' for a field the card never had a value in
  to_value    TEXT NOT NULL
  at          INTEGER NOT NULL
  to_source   TEXT               -- the source the value took (migration 40); a change of source alone is a row too. `card_example_value_changes.to_source` the same

card_sources             -- where a card came from, when it was captured rather than typed (migration 14); one row a card at most, written with the card, never changed; its stretch is read for the marks on a video's bar (`videoCards`, the living cards whose url names the video: narrowed by `instr` in SQL, settled by the contracts' `youtubeLinkOf`; no video id is kept, so every card from before is there with no backfill)
  card_id     TEXT PRIMARY KEY REFERENCES cards(id)
  url         TEXT NOT NULL      -- http(s) only (the contracts' CardSource), so it can never be a link that runs a script
  title       TEXT NOT NULL DEFAULT ''
  text        TEXT NOT NULL DEFAULT ''   -- the line or the sentence as it was shown
  start_ms, end_ms INTEGER       -- the stretch of the video the line ran over, in the video's own time
  channel_name, channel_url TEXT -- whose the video was, as the page showed it (migration 19, 2026-10-17); null before, and off a page that isn't a video's
  client      TEXT NOT NULL      -- what sent it: "extension/0.1.0"
  created_at  INTEGER NOT NULL
  capture     TEXT               -- JSON, the contracts' CaptureFacts (migration 38, 2026-10-28): everything else the extension knew as it made the card, for a backfill later. How it was taken ('caption' | 'stretch' | 'selection'), which subtitles ('panki' | 'youtube'), whether the clip's ends were put by hand, the picked word's own stretch (startMs, endMs, byHand), the dictionary's word and the dictionaries its ticked meanings came from, what filled each field (field id → the extension's role id, by the deck's field mapping then), the extension's build; each part only where it was known. Null before; read by nothing yet

card_places              -- every time a card's place on the ladder changed; a card's place is its last row, none = new
  id          INTEGER PRIMARY KEY
  card_id     TEXT NOT NULL REFERENCES cards(id)   -- indexed
  at          INTEGER NOT NULL
  reason      TEXT NOT NULL      -- 'answer' | 'switch' (the deck changed SRS type) | 'stage-removed' (its stage was hidden)
  answer_id   TEXT REFERENCES srs_answers(id)      -- with reason 'answer'
  stage_from, past_from, node_from, burned_from    -- the place it left: stage id (null = new), rungs past the top, the answers taken inside an ask-again (JSON), burned 0|1
  stage_to,   past_to,   node_to,   burned_to      -- the place it went to
  session_id  TEXT REFERENCES review_sessions(id)  -- the sitting the answer was given in, when the browser said
  think_ms, decide_ms INTEGER   -- how long the card was on screen before the flip and after it, spans the browser measured
  listen_ms   INTEGER           -- how long it was listened to before its front showed, a span before think_ms, which then starts at the front (migration 39, 2026-11-01); NULL wherever there was no Listen phase: its type's Listen first off, nothing to hear on it, a row from before
  miss        INTEGER           -- frozen at answer time: 1 the first main answer (when the type has more than one), 0 any other main answer, NULL one set apart or a row that isn't an answer
  given_id    TEXT              -- the answer's own id, minted by the browser (`CardAnswer.givenId`), unique where set: what Undo names, and what keeps the same answer sent again from being kept twice (migration 37); NULL before, and on a row that isn't an answer
  undone_at   INTEGER           -- when the answer was taken back with Undo (migration 37); the row is otherwise untouched, and every read but the stats' time passes over it

card_holds               -- a card put aside by an answer whose rule is Bury or Suspend (migration 25, 2026-10-21); kept apart from card_places so its place and its schedule stay as they were; indexed by card
  id          INTEGER PRIMARY KEY
  card_id     TEXT NOT NULL REFERENCES cards(id)
  kind        TEXT NOT NULL      -- 'bury' | 'suspend' (the contracts' HoldKind); no CHECK
  at          INTEGER NOT NULL
  answer_id   TEXT REFERENCES srs_answers(id)       -- the answer that did it
  session_id  TEXT REFERENCES review_sessions(id)   -- and its sitting and spans, as an answer's row keeps them
  think_ms, decide_ms INTEGER
  listen_ms   INTEGER            -- as an answer's row has it (migration 39)
  lifted_at   INTEGER            -- brought back from the deck's list (Unsnooze, Unsuspend); a bury (Snooze on screen) otherwise ends by itself at `until`
  until       INTEGER            -- when a bury ends: made + its step's wait, frozen as it's made (migration 26, the same day; the buries before it lasted until the day turned and read as made + 24 h); NULL for a suspend
  given_id, undone_at            -- as an answer's row has them (migration 37): an undone hold never stood

review_sessions          -- a sitting with one deck
  id          TEXT PRIMARY KEY   -- UUID minted by the browser, so a retried start returns the one already running
  deck_id     TEXT NOT NULL REFERENCES decks(id)   -- indexed
  kind        TEXT NOT NULL      -- 'review' | 'extra'; no CHECK, the words are the contracts'
  started_at  INTEGER NOT NULL
  ended_at, ended_how            -- 'done' | 'left'; set once, a second ending changes nothing
  left_card_id, left_shown_ms, left_revealed   -- the card on screen when it was left, for how long, flipped or not
  left_phase  TEXT               -- 'listen' | 'front' | 'back': where that card stood, when it had opened on a Listen phase (migration 39); NULL otherwise and before
  device, user_agent TEXT NOT NULL DEFAULT ''  -- the signed-in device it ran on

events                   -- the ledger: what happens in the browser that no table is shaped for, stored as it comes
  id          INTEGER PRIMARY KEY
  at          INTEGER NOT NULL   -- the API's clock, the time that counts
  client_at   INTEGER NOT NULL   -- the browser's clock, for ordering inside a batch
  kind        TEXT NOT NULL      -- the contracts' EventKind; indexed with at
  path        TEXT               -- the screen's address, for 'screen'
  data        TEXT NOT NULL DEFAULT '{}'   -- JSON
  session_id  TEXT               -- the signed-in device's public id (auth.sqlite's sessions.id)
  device      TEXT NOT NULL DEFAULT ''

settings                 -- only the keys the owner changed; reading merges them over the contracts' DEFAULT_SETTINGS,
                         -- how every review runs (ReviewSettings) among them since migration 49
  key         TEXT PRIMARY KEY
  value       TEXT NOT NULL      -- JSON

settings_changes
  id, key, from_value, to_value, at
```

**The silo** (the owner's words: "total surveillance"): everything that happens is kept with its timing, needed now or not. The API stamps every time; the browser only ever sends spans it measured on its own clock (`listenMs`, `thinkMs`, `decideMs`, `shownMs`), never a time. What's frozen on an answer's row (`miss`, the spans, the sitting) is read back as it was; what a card *is* (its place, its due time) is still derived live. **The stats are worked out on every read** (`db.ts` → `stats(deckId | null, now)`, JS over the rows) for the living decks in scope: the windows are the owner's days (`time.ts` → `dayOf`, the calendar date in `PANKI_TIME_ZONE` once the clock is wound back by the Settings' `dayStartHour`; `addDays`, `daysBetween`, `weekdayOf` on the day keys), so a clock change moves nothing; a card overdue counts as due today; the week runs Sunday to Saturday; the twelve weeks of `added` end with the one that began on the most recent Sunday. The definitions of each number are the `Stats` schema's comments in `packages/contracts/src/history.ts`. **Time spent reviewing** is every showing of a card (its listening, thinking and deciding added up), whatever its answer did (an undone one, Snooze, Suspend) and a card left on screen, each at most `CARD_TIME_MAX_MS`, 2 minutes (the owner, 2026-10-26): capped as it's worked out, never as it's kept, so the cap can change and the past reads again under it.

Why: the **browser mints the id** so a retried POST (a flaky phone connection) returns the row that already exists instead of creating a second one (`INSERT OR IGNORE`, then read back). **`created_at` comes from the API's clock**, never the client's — the server is the authority on time. A deck's **card count** and a type's **deck count are derived** in the query on every read, never stored. **A card is its values:** the deck's card type says which fields exist, which are the front, which must be filled; the card holds one value per field (`cardProblems` in the contracts is the rule, run in the browser before sending and in the API at the boundary). **Delete hides, never destroys:** it sets `removed_at`, every query the app reads through filters removed decks, cards, types, fields, stages and answers out (so a removed deck's cards are unreachable too), and nothing is ever `DELETE`d. **A deleted card (step 18) is out of everything from the moment it leaves:** the deck's list and counts, what a review shows, the ladder, "coming up" and "added" in the stats, and whatever is later done to its deck's cards (a switch of SRS type and a stage taken away move only the cards still there, so a restore, when one is built, has to seat such a card afresh). What it was answered stays in the history: its answers still count among the reviews, the streak, the heat map and the time, because they happened; it just isn't named among the toughest cards any more (`selectScopeAnswers` carries `living` for that). Only an insert's read-back still sees a deleted card, so the same id sent again is the same card and never a second one. Its files stay where they are. Removing again keeps the first time; a type a deck uses can't be removed at all. **Renaming records what it changed from and to** (`deck_renames`, `card_type_renames`), inside one transaction with the update; the same name again changes and records nothing. Updating a type takes the whole field list: ids it knows are updated (and un-hidden), new ids added, ids left out hidden; an SRS type's stages and answers work the same way.

**A card stores nothing about its schedule but its answers.** Each answer (and each move made for it) is one `card_places` row: when, which answer, where it was, where it went. Its place is the last row; its **due time is derived on every read**: the last answer's time plus the wait its place has *now* (the stage's wait, or the ask-again's), exactly (`dueAt` in the contracts; a setting spread it ±10 % by a hash of the row id until the owner had it out, 2026-10-28, and a `fuzz` row kept of it is read by nothing). Nothing stored goes stale: editing a type changes only what happens next, and the past stays as it was. The place is by **stage id**, not by number, so reordering stages moves no card; `past` counts rungs beyond the top for a ladder whose wait repeats or grows there. **The first stage waits like any other** (the owner's change, 2026-10-10; before that it never waited), and a card kept on it comes back after its wait. **New (Lesson in the code) is before it, in every type** (2026-10-21, the owner's option B; born as Lesson and named New on screen the same day, so the code's `lesson`, `LESSON_SCOPE`, `LESSON_IDX` and the column stay, and `srsKinds.ts` → `NEW_WORDS` is what's shown): the place with no stage, not burned (`NEW_PLACE`, `isNew`), rung `LESSON_IDX` (-1) in `stageIndex`, where a new card stands and where a `lesson` step ("New again" on the chart; Wanikani+'s Reset, its Relearn until that evening, goes to the first stage instead) sends one. It has rules of its own, `SrsType.lesson` (a `Flow`, a JSON column on `srs_types`; NULL for a type kept before, which reads with `defaultLesson`'s, worked out from its answers and default rules, until it's saved), which `flowOf` gives a card there. `resolve` clamps a move at the first stage once a card has left Lesson (in Lesson a move of 0 or less stays there), so nothing but a `lesson` step goes back; a card that lands in Lesson has no wait (`waitAt(-1)` is null), so no due time: it's a new card, counted and lined up as one (`deckFrom`'s `fresh`, `countStartedSince`, `ReviewView` → `isUnseen`), a relearned one too, as the owner asked ("it will literally be treated as a new card"). The silo tells them apart by their own rows: the answer that sent it back has a `card_places` row with `stage_to` NULL and the stage it left, and every answer after it is there. On the chart Lesson is a scope of its own (`srsFlow.ts` → `LESSON_SCOPE`: `scopeFlow`, `ownFlow`, never "own rules" to sync), a chip on the rail after Default rules and a plain box. **Migration 27** added the column and, in the types that come with the app, hid the stage that did Lesson's job (the first, with no wait: Wanikani's and Wanikani+'s Lesson, Anki's Learning 1), each card on it sent to Lesson with a `'stage-removed'` row; `openDb` then brought the three up to `srsStarters.ts`, every stage keeping its id. **The startup sync never shifts a ladder**: a built-in type with more living stages than its starter (`starterStageCount`) is left as it is with a warning, since lining them up position by position would move every card a stage; a stage the app takes away is a migration's to clear first. **The SRS types that come with the app are rows**, marked by `srs_types.builtin` (which starter they are; `builtin: true` on the type as read). `openDb` makes any that a database lacks, after the migrations. The first time there were none (2026-10-10, at the owner's ask to clear his test types) it also moved every deck onto the default one, Wanikani+, through `updateDeck` so cards kept their rung, and hid every type from before. `removeSrsType` answers `"builtin"` for one of them and the route says 409; a `PATCH` to one is 409 too, they are view-only (`SrsTypeView` draws a read-only screen for `builtin`, its answers as the editor's own blocks with their switches locked, `answerBlock`; `FlowCanvas` takes `readOnly`, in which every box still opens its card, each control disabled, and nothing that removes is drawn; a `glance`, the review's chart, opens none), and every time the database opens each one is brought up to what `srsStarters.ts` defines today (`makeStarter(starter, mint, as)` builds it under the existing row's ids: its stages position for position, its answers by name, then by place for a renamed one (`answerIdsAs`; by place alone until 2026-10-22, when Wanikani+'s Easy moved to third and Reset to last and every past answer had to stay the one it was), and `updateSrsType` writes it; nothing is recorded when nothing differs). Changing a built-in type is therefore an edit to `srsStarters.ts`, never a migration, unless a stage with cards on it goes away. **Such an edit must pass the type's own rules** (`NewSrsType`: `MOVE_MAX`, `DESCRIPTION_MAX` and the rest): the sync runs as every account opens. On 2026-10-26 Wanikani+'s Easy made a move of three past a `MOVE_MAX` of two, with a description one character too long, and panki.pro answered "Something went wrong." to everything until the fix was deployed; since then a starter that can't be brought up to date is left as the database has it, its write undone, and said in the log once per account (`[srs] … couldn't be brought up to what the app defines`), and the account opens as usual (the types from before are hidden on a first open only when every starter made it). So a broken edit no longer takes Panki down, but it doesn't take effect either: build each starter with `makeStarter` and parse it with `NewSrsType` before pushing, and look for that line in the API's log after a deploy that changes one. **Panki Default is the starter keyed `wanikaniPlus`** (renamed from Wanikani+ on 2026-11-07, its stages Learning 1–4, Familiar 1–2, Strong 1–2): the key is what `srs_types.builtin` holds and what the sync finds the row by, so it never changes; renaming it would read as a missing starter and make a second type. The new names and colours reached every account by this same sync, its eight stages keeping their ids. A new type is `copySrsType` of any type in the list, under fresh ids. **A stage's colour** (2026-11-07): `SrsStage.colour`, `#rrggbb` (`HexColour`), optional, kept in `srs_stages.colour` (**migration 47**, NULL for every stage from before), written with the type by `insertSrsType` / `updateSrsType` like its name. None is the default ramp's for its place (the contracts' `stageColour.ts`: `STAGE_RAMP`, light green through a middle green to dark green, `rampColour`, `stageColourAt`; `placeColour` is a card's place as a colour, `BURNED_COLOUR` grey once burned, New's own colour while new, `newColourOf`, null when it has none, which the app draws plain). It's one home for the app, the API and the extension alike. The web draws it as a tint (`srsKinds.ts` → `tintOf`: `--tint`, and `--tint-bg` / `--tint-fg` mixed into the surface and the text by the theme's `--tint-soft` / `--tint-ink`, so one colour reads on every theme); the Stats ladder gets each stage's colour from the API (`Stats.ladders[].stages[].colour`). `srsFlow.ts` → `patchStage`'s `colour` (null back to the ramp), and `addStage` gives a new stage the colour of the one before it when that has one of its own. The editor's picker is `SrsTypeView` → `StageColour`, the app's `Swatches` over the stage's default and `palette.ts`. **New's colour** (the owner, 2026-11-07: "edit a new card's colour from the stages screen the same way"): `SrsType.newColour`, `#rrggbb`, optional, kept in `srs_types.new_colour` (**migration 48**, NULL for every type from before; the types that come with the app are brought up to date with none, so theirs stays none), set on the Stages panel's New row by the same picker (`SrsTypeView` → `RungColour`, which `StageColour` is too; its default the accent, `srsFlow.ts` → `setNewColour`, null back to none). None, New is drawn as it always was: a plain grey pill, the accent on the chart and the Stages panel's ring (`srsKinds.ts` → `newTint`, the colour or the accent). With one, `placeColour` answers it for a new card, so the place pill (card rows, today's cards, the review's and the Layout tab's tag) is tinted like a stage's; the chart's New box and rail chip take it (`is-tinted`); the Stats ladder's New row (`Stats.ladders[].newColour`); a card already there (`CalledCard.newColour` beside `stage: null`, `StagePill`'s `newColour`, the app's and the pop-up's alike); and the extension's words in the decks By stage, an all-new word in its type's New colour (`WordsInCards.colours`; of new cards of two types the first with a New colour), else the accent as before. The review's counts ("5 new") keep the accent: they name a kind of card, not a place. **The SRS editor saves on purpose** (no autosave, no drafts; the owner tried a draft kept in `localStorage` on 2026-10-10 and had it removed the same day): `SrsTypeView` holds the edited type in state, sends nothing until Save (`PATCH`, or `POST` for a type never saved, which until then exists only in the `srsEdit` screen's own `type`, so a reload of its address lands on the list), and there is no Discard: leaving without saving drops the changes. Save is drawn by `App` in the header (`headFor`) and calls the guard's `save`; the editor reports `canSave` in its `SaveStatus`. The question on leaving is `Modal`, the app's one pop-up. **Leaving unsaved work asks first**: while it's dirty the editor hands `App` an `UnsavedGuard` (`onGuard`: its name and a `save` that says whether it went through); `go` sets `leaving` instead of going, a `popstate` puts the editor's address back and sets `leaving` too, and the question's three answers are Stay, Discard changes (`go(next, true)`) and Save and leave. A reload or a closed tab is covered by `beforeunload`, the browser's own question. A type's `description` is a column on `srs_types` (default empty, so older rows and requests read as none). **A stage's own rules that equal the default are dropped**: every change in `srsFlow.ts` goes through `edit`, which ends with `settle` (an override that does the same as the default for every answer is deleted), so "has its own rules" always means they differ. **`retry` is a step** that resolves to the same place with a wait of 0 (`again: true`): inside a right-away ask-again it loops a card in the review until another answer leaves the box. **"Back to the start" is no longer a step**: `upgradeFlow` in the contracts reads a stored one as "go to the first stage", run in `srsTypeFrom` before parsing (old data normalised on read). **An answer has `aside` and `confirm`** (optional in the contracts, two `INTEGER` columns on `srs_answers` from the latest migration): `mainAnswers` is the answers not set apart, which is what the preview, the forecast and the answers' colours (`answerClass`) go by; `ReviewView` draws the main ones in the row, the rest under it, and holds an answer that asks first in `asking` until the yes. **A stage can have no wait**: its `wait.n` is 0 (`StageWait` in the contracts allows it; an ask-again's wait stays 1 or more), stored in the same `wait_n` column, so no migration. **Only a wait of 0 comes back in the same review** (a right-away ask-again, or a stage with no wait): an ask-again with `now` resolves to a wait of 0, and `ReviewView` puts a card back in its queue only for that; anything with a wait is for a later review. **Hiding a stage with cards on it asks where they go**: the save carries `moves`, the API refuses it without them (`409`), and each card gets a `'stage-removed'` row. **Switching a deck's SRS type** maps each card by position (rung 3 stays rung 3; past the new top counts as the top) with a `'switch'` row each; a burned card stays burned. What a review shows (`dueCount`, `newCount`) is derived per deck with the API's clock and the settings: due = not burned and due by now plus the hours-ahead window; new = the deck's cards in New (never answered, or sent back by a `lesson` step), as many as the day's count allows (new cards started in that deck since the day began come off the deck's own `newPerDay`; the deck's own `reviewsPerDay` caps the due ones; there is no limit across decks and no hours-ahead window any more, so a card is due exactly when its wait is up). Of the account's `Settings`, the counts read only `dayStartHour` (and the zone). **A deck's own settings** (`DeckSettings`: `newPerDay`, `reviewsPerDay`, `holdAnswer`; a deck's `dueCount` is under its own `reviewsPerDay`, counted from its answers that didn't start a new card) are a JSON column on `decks` holding only what the owner changed, read over `DEFAULT_DECK_SETTINGS` key by key (a stored value that no longer fits reads as the default), changed through `PATCH /decks/:id` with a `deck_settings_changes` row per key. **How every review runs is the account's** (since 2026-11-07, the owner: "move these settings to the settings global of the user, not per deck"): the contracts' `ReviewSettings` (`todayFirst`, `newPlace`, `newOrder`, `reviewOrder`, `againPlace`, `pool`, `exampleShown`; `DEFAULT_REVIEW_SETTINGS`, `REVIEW_SETTING_KEYS`, `POOL_MAX`; `againPlaceOf` is the place that really applies, always `random` with a pool, which is then anywhere among the cards in play), spread flat into `Settings`, each key a `settings` row of its own and changed through `PATCH /api/settings` like the rest. They were each deck's from 2026-10-10 (a deck that kept `soon`, "a few cards later", taken out 2026-10-23, read as the default). **Migration 49** carried them over once: the account took every one of those keys its living deck with the most living cards (the oldest of those tied) had stored and that still fits its rule, as a `settings` row with a `settings_changes` row from the default; what that deck never changed reads as the same default it did. **Migration 50** puts right a `newOrder` row kept from before decks had settings (the account's then, read by nothing since, which 49 left standing): the same deck's value, or the default, with its change row. Every deck keeps what it had stored in its JSON, read by nothing (`deckSettingsFrom` reads only `DEFAULT_DECK_SETTINGS`' keys), and a `PATCH` naming them on a deck is stripped by the schema. The deck shape losing them raised `EXTENSION_PROTOCOL` to 6 (an older extension's `Deck` required them). The order of a review is the web's: `ReviewView` builds the day's line (`buildQueue(cards, deck, review)`, the deck's counts and the account's order; a due card still inside an ask-again, left there by an earlier review, stands where `againPlace` puts cards asked again, as the count at the top orders them: after the rest, or scattered among them), keeps `pool` cards in play and the rest waiting (`startLine`), and after each answer `advance` puts a card with no wait back where `againPlace` says or lets the next waiting card in. `App` hands the account's `Settings` to `ReviewView` and `LayoutView` as `review`, and its `exampleShown` to `CardsView` for `CardPreview`. Extra study on the end screen is the web's too: it starts a fresh line from the deck's unstarted cards, past `newCount` (looked over first as today's cards are, since 2026-10-28: below); the API never refuses an answer for being over the day's count, it only stops offering new cards (`newCount` 0) until the day turns. The day begins at the account's own hour (`dayStartHour`) in the account's own zone (`zoneOf`).

**A card's other examples** (2026-10-25, the owner: a word met again in another sentence goes onto the card that's there). A field says whether it goes with an example (`card_fields.per_example`, the contracts' `CardField.perExample`, `exampleFieldsOf`; never the field cards are called by, which the type editor doesn't offer it on, since that's how the card is found). A card's own values stay in `card_values` and are its first example; each one added is a `card_examples` row (who minted it, its source's columns as `card_sources` has them, all null for one typed, `removed_at` when deleted) with its values in `card_example_values`, every change kept in `card_example_value_changes` (migration 34, which touched no row). Read with the card (`db.ts` → `cardsFrom`, `CardReads`: a deck's in three reads, one card's through `readsOfCard`), as `Card.examples`, oldest first; what each file named in them is and what's said in each clip join `Card.files` and `Card.cues`, so any example's files draw. **Which one a review shows is pinned by the API, once per review of the card** (2026-11-06, the owner: "the example is tied to the card in this specific review": failed and back at the end, left and come back hours later, browsed with the arrows, it's the same example until the card passes): `example_pins` (per account, migration 45: card, example or null for its own, when; rows never changed or deleted). The deck's card list (`listCards`, what a review reads its cards from) pins each card a review would take now (due, or new and in play) that has examples, of a type with a field that's One per example, and no live pin, by the account's `exampleShown` (`pickExample`; the deck's until 2026-11-07: Rotate the one after the one last pinned, the card's own when it never was or that one's gone; Newest the newest at that moment; Random any), and every card read carries its live pin as `Card.shownExample` (`selectLivePin`). A pin is live while no answer has scheduled the card since it was made (a `card_places` answer landing outside an ask-again, `node_to = '[]'`, not undone, later than the pin) and its example is still there: an ask-again (Forgot, New's) keeps it; Snooze and Suspend, being holds (`card_holds`), keep it; an Undo of the scheduling answer marks that row undone, so the pin is live again. An answer to a pinned card must name the pin (`CardAnswer.exampleId`, absent for its own) or it's refused (409, "This card is shown with another example now."), whichever example was looked at; the arrows (`browsed`) never change it. `exampleShownOf` stays for a card looked at outside a review (`CardPreview`). Until then Rotate was the card's count of answers modulo its examples and the web picked it each time the card came up; a type with no such field always shows the card's own. `valuesWithExample` lays the example's values over the card's own in those fields, and `ReviewCard` draws that; the answer carries `exampleId`, frozen on its `card_places` row. Nothing about an example touches `card_places` or a hold. `videoCards` reads examples' sources too (a `UNION ALL`, the video's id bound once for each half: `?1` used twice doesn't bind in `node:sqlite`), so a card has a mark on each video it has an example from (`SeekMark` keys a mark by card and start for it). `CalledCard.typeId` lets the app's form and the drawer offer **Add as an additional example** only for a card of the same type (`AlreadyIn.tsx` → `exampleTargetOf`, the newest). **The others on the review card** (2026-10-26, A of https://claude.ai/artifact/NvKf27gK3s88efz7WeRjV2): `ReviewView` draws ‹ 1 / 3 › (`ExampleArrows`) as `ReviewCard`'s `examplePager`, which stands where the card type lays the **example arrows** out (since 2026-11-07, the owner, finding them far under a clip in the side column: "a part of the card's layout"; `CardType.examples`, below in "A card's layout"), right after the last One per example part the front shows (else its last such part) for a type nobody laid them out on, where they always stood; the arrows and the Previous / Next example keys turn through the card's own and each added, in Rotate's order, wrapping round (`browsed`, back to none on each showing). The answer's `exampleId` stays the one the review picked; switching is an `example` row in the ledger (the deck, the card, the sitting, the one switched to and the one picked); a switch carries each One per example sound's and clip's playing (2026-11-04, the owner: "If it's currently playing, OR it's at the end of the video, we will start the example"). `ReviewCard` stays mounted across a switch (keyed by the review's pick, not the one on screen) while a per-example part's `MediaView` is keyed by its value, so the leaving player is replaced: the card hears every `play` in the capture phase and keeps the element each field last played in (`playedIn`), and a layout effect, run on every commit, sees which One per example file fields changed value and reads each one's element as the switch lands (playing, or `ended`), before the one taken off the page is paused by the browser; elements already off the page at an earlier commit (a front part the turned card dropped) are let go so they never speak for a fresh one. Each that was going, and stands ready on the side shown (not held for the back, not covered, not hidden by the Listen phase), is `carried`: cued from its start alongside whatever else is cued, done as its cue ends. Every switched field counts as played on that side, so none is queued by its "plays by itself" afterwards; a One per card part keeps its player and is untouched.

**Putting a card aside: Bury and Suspend** (2026-10-21, at the owner's ask, in Wanikani+). They are two more steps a rule can be (`Step`'s `bury`, with a `wait` of its own, and `suspend`; the contracts' `HoldKind`), so any answer of any type can do either, at any point of its chart, and `hidden` takes either away where it makes no sense. A bury's wait is set on its box like an ask-again's (`srsFlow.ts` → `setStepWait`), 24 hours to begin with (`BURY_WAIT`, the owner's default: "time based… default is 24 hours"; for its first hours it lasted until the day turned, and a rule saved then reads as `BURY_WAIT` through `upgradeFlow`). `resolve` answers them with the card's place untouched and `hold` set, `wait` the bury's minutes or null for a suspend; the API then writes a `card_holds` row with its `until`, never a `card_places` one, so the last answer's time and place, and with them the due time, stay exactly as they were, and the stats never count one as an answer; its seconds count in the time spent reviewing (`selectScopeHolds`, since 2026-10-26). A card's hold is derived on every read (`db.ts` → `holdOf`, from the two subqueries in `cardColumns`): an un-lifted suspend stands until it's lifted; an un-lifted bury until its `until`, so it ends by itself, with no job and no write. `Card.hold` carries it (null in play), and `due` is false while it stands, so a review, `dueCount`, the Review door and the picker leave the card out with no code of their own; `newCount` leaves out a new card put aside, and as nothing was started, the next new card takes its place (`ReviewView` → `nextFresh`, `joinLine` hand it to the review under way too). "Coming up" leaves a suspended card out and counts a buried one from when its bury ends (`CardHold.until`) at the soonest, in the stats and on the review's end. A card is brought back from its deck's list (`CardList`'s Unsnooze / Unsuspend, `DELETE …/hold`; a bury is Snooze on screen since 2026-10-21, `bury` in the code and the rows): due at once if it fell due meanwhile. The preview's journey and forecast pass over an answer that only puts a card aside (`srsPreview.ts` → `offeredOrNear`). The words and marks are `srsKinds.ts` → `HOLD_KINDS`, `holdBack`, `holdAsks`. Panki Default (Wanikani+ then) has them as its fifth and sixth answers, set apart and applied without asking; Bury is hidden inside its ask-agains, Suspend isn't. `ANSWERS_MAX` went from 4 to 6 for it.

**Flagging a card** (2026-11-07, the owner, for cards that want more example sentences: "a button for mark next to suspend and bury… then it shows up as yellow… in the seek bar"; A of https://claude.ai/artifact/GyfKMSqu3ezcTLGqhRopSS, "A is good, go"). A flag is **not a step and not a hold**: it schedules nothing and puts nothing aside (B, a seventh Wanikani+ answer, would have spent a press and a second showing, and been Wanikani+'s alone), so it's a fact of its own beside them, on every SRS type with no chart touched. **Kept as marks, never a boolean**: `card_flags` (per account, migration 46) a row each time it really changes, `flag` or `unflag`, with when, the sign-in it came from (`device`), where it was pressed (`place`: `review` or `cards`, the contracts' `FlagFrom`) and, in a review, its sitting; never changed or deleted. The card's flag is its latest row (`db.ts` → `flaggedAtOf`, the one reading, in `cardColumns`, `selectVideoSources`, `selectCalled`, `deckTwins`, `wordsInCards`), told as `Card.flaggedAt` (null while it isn't), `VideoCard.flagged`, `CalledCard.flagged` and `WordsInCards.flagged` (a word with **any** card flagged, where `suspended` wants every card suspended), each optional with a default so an older extension ignores it (`EXTENSION_PROTOCOL` stays 4). `PUT /api/decks/:deckId/cards/:cardId/flag` with `CardFlagUpdate` (`flagged`, `from`, `sessionId`; a sitting not this deck's isn't named) sets it, the same again writing nothing; `words`' state hash is worked out from `wordsInCards` whole, so the extension hears a flag at once. A flag stays through answers, snoozes, suspends and Undo (Undo takes back answers, never a flag); Unflag is its undo. The words are one home, `srsKinds.ts` → `FLAG_WORDS` (Flag, Flagged, Unflag, the `flag` icon), its looks `theme.css` → `--flagged` (the marks' yellow, a highlighter's), `--flagged-soft`, `--flagged-edge`, `--flagged-ink`, and `FlagTag` says it. **In a review** (`ReviewScreen.tsx` → `ReviewScreen`'s `flag`, `ReviewFlag`): Flag stands in the top row after Step back, Undo and Chart (`.review-flag`; an icon button after Chart in the full-screen rail, `.review-stage-flag`; under the answers with the others on a phone), on the front and the back alike, pressed at once, Flagged while it is; its key is Settings → Keybinds → Review's Flag, none to begin with (`keys.ts` → `flag`), heard on both sides; the card says it in its corner, a third corner mark (`CORNER_MARK_IDS`' `flag`, `FlagMark`, kept beside the tag in the type's `stage_tag` JSON as `flag`, `flagMarkOf`: shown, where the spark is, to begin with), laid out on the Layout tab as the others are, where the Flag stands greyed beside the greyed answers. **In a deck**: Flag / Unflag among a card's tools before Suspend, Flagged under where it stands, the row tinted in the highlighter's yellow (a suspended one keeps its red, `.card-row.is-flagged`); Show → Flagged (`cardFilter.ts`); Search finds "flagged" (and "snoozed", "suspended", `cardSearch.ts`); today's cards' tiles carry the flag in their corner; `CardPreview` and `AlreadyIn` (the pop-up's In your decks, the drawer's card already there) say it.

**Undo in a review** (the owner, 2026-10-26). Every answer of the sitting under way can be taken back, newest first, back to the sitting's start; leaving the review or starting extra study ends what can be. **Nothing is deleted:** the answer's row keeps everything it had and is marked with when it was undone (`undone_at`, migration 37, on `card_places` and `card_holds` alike), and every read of where a card stands and of what was answered passes over an undone row (`db.ts` → `lastPlaceOf`, the `seen` and `lastAt` and hold subqueries of `cardColumns`, `countStartedSince`, `countReviewedSince`, `liftHolds`, the stats): the card stands where it stood, due when it was due, a new card is a new card again and back in the day's count, and the stats count the answer nowhere but in the time spent reviewing (`stats` → `kept`: the seconds were spent). Each showing of a card mints the id its answer is given (`CardAnswer.givenId`, kept as `given_id`), which Undo names (`DELETE …/answers/:givenId`), and which makes the same answer sent again harmless. The API takes back only the last thing that happened to the card, anything since (another answer, a switch, a stage taken away, a hold made or lifted) being `409`; the review then lets go of everything it could have taken back, since what's before it no longer follows. In the browser, `ReviewView` keeps a `Given` per answer (its id, its card, and the line, the tally and the count as they stood just before it); Undo puts those back, the card at its start (its Listen phase where it has one, its front otherwise; on its front until 2026-11-02), a showing of its own (`turn`), timed afresh. The button is Undo beside Chart (in the full-screen review's top row, and on the end screen while there's something to take back); its key is Settings → Keybinds' Undo, none to begin with (`keys.ts` → `undo`). It has nothing to do with the editors' Ctrl+Z (`useUndoable`). The sitting now ends as the screen or the page goes (`pagehide`), or extra study starts, not as the line runs out, so an answer undone at the end screen stays in it; the end time isn't read by any stat.

**Today's cards before a review** (the owner's pick, B of https://claude.ai/artifact/1sSZsVseDpRJpDQE1F2u62, 2026-10-26). The account's `todayFirst` (on to begin with; Settings → General → Reviews, Today's cards before a review; each deck's own, under its During a review, until 2026-11-07) opens a review on the day's line before its first card (`ReviewView` → `TodayCards`, its `today` state): the line `buildQueue` made, split into reviews and new cards, every one picked; a tile pressed leaves a card out, a stage's chip, All and None do many, and Show every new card offers the deck's other new cards (oldest first) to add, but only with no reviews in the day's line: with reviews, it says "Finish these reviews to unlock extra study." instead (`locked`; the owner, 2026-10-28: no extra study before the reviews are done). Every way into a review gets it, since it's the review's own first state. It opens folded to its counts (`components/TodayBar.tsx`: the counts, Show cards, Start; the owner's pick, A of https://claude.ai/artifact/XVHRcYb8TKjrgrBdsUFtoG, 2026-10-27), the tiles under Show cards. With more than one deck the picker is a `TodayBar` per deck (`ReviewPickView`): its Start opens the review under way (`Screen`'s `begin: "start"`, the today state skipped), its Show cards opens it on the tiles shown (`begin: "cards"`, today's cards even where they're skipped); `begin` isn't in the address, so a reload opens as `todayFirst` says. Start, or Start's own key held as long (`keys.ts` → `start`; Enter too): with every card of the day picked, the line as it was; else `buildQueue(picked, deck, review, false)`, uncapped, so the picked cards keep the account's order settings and new cards past today's count come in as Extra study's do (the API never refuses them; `newCount` only offers). A line picked by hand hands a new card's place to no other when one is put aside (`pickedByHand`, no `nextFresh`). **Extra study at the end is the same piece** (the owner, 2026-10-28: "it should look similar… just have the selector for how many"): `TodayCards` with `id="extra"`, named Extra study in its bar, which says how many new cards it has in place of the counts and what's left for later (`available`, "19 new cards available", always), the deck's cards never started as its new ones (`extraOrder`: oldest first, or shuffled once where Which new cards first shuffles them, held by a memo of their ids so the tiles stand still), the first as many as its number says picked (a `NumberField` right after Show cards, `TodayBar`'s `tools`; typed, it picks the first that many again, and it always says how many are picked, so a tile, All or None changes it, None to 0: the owner, 2026-10-28; `extraPicked`), Show every new card offering the rest, Start's key and Enter starting it from the end screen. It starts on what's picked, in that order, as a sitting of its own (`startExtra`, a `pick` row in the ledger with `extra: true`). With nothing to review, the screen's loading is its shape (`Skeleton` → `done`), extra study's bar there as many as it offered last time on this device (`extra:` in `skeletonMemory.ts`). The sitting starts at Start, not as the screen opens, so leaving the Today screen is no review; the pick is a `pick` row in the ledger (`data`: `deckId`, `sessionId`, `today` the day's line, `left` the cards left out, `added` the ones added), no table of its own. A card left out is untouched: due, or new, for the next review. Full screen, kept, is asked for at Start (`useScreenStage`'s `present`), the press being the browser's leave.

**A file on a card is a row and a file** (step 15). Three of a field's kinds hold a file instead of text (`audio`, `video`, `image`; the contracts' `mediaKindsOf(fieldKind)` says which, and the words are the same as `MediaKind`'s on purpose). The card's value in such a field is the file's id, kept in `card_values` like any value, so a card's history, its edits and its shape need nothing new. The file is sent first, on its own (`PUT /api/media/:id`, the raw bytes as the body), under an id its sender minted; the card that names it is made after. The API believes the file, not the request: the type in the header must be one Panki takes (`MEDIA_MIMES`: webm, mp4, ogg, mp3, m4a; jpeg, png, webp; nothing that can carry a script) **and** the file's own first bytes must agree (`mediaFiles.ts` → `sniffMimes`). A container says nothing of what's inside, so webm and mp4 pass for sound and picture alike, and the sender names one for the field it's going into (`mediaMimeFor`). Each kind has its own ceiling (`MEDIA_MAX_BYTES`: 10 MB a sound, 40 MB a clip, 5 MB a picture). The bytes are written under another name and moved onto their own, then the row is made, so a failed upload leaves nothing that claims a file is there; the same id with the same bytes again answers with the row, the same id with other bytes is refused (`409`), never overwritten. **A card can only name a file its own account holds, of its field's kind**: `cardProblems` checks the shape (an id), and the cards routes then look the file up, because only the API can know. Served only to a signed-in device of the account that holds it, by id, with the type from the row, `nosniff`, a year of `private, immutable` caching (a file never changes under its id) and byte ranges, which is how a clip is skipped through (`res.sendFile` with `root`, so only the id is ever a path). Nothing removes a file yet.

**Migrations** live in `db.ts` as an ordered list (`auth.sqlite` has its own, in `authDb.ts`); SQLite's `user_version` records how many have run, each runs once inside a transaction. Migration 13 (media) added the `media` table, empty: nothing from before is touched. Migration 14 (sources) added `card_sources`, empty too. Migration 15 (deleting a card) added `cards.removed_at`, NULL for every card from before. Migration 11 (the silo) added `review_sessions`, `events`, and the `session_id`, `think_ms`, `decide_ms` and `miss` columns on `card_places`; answers from before read as NULL in all four, so the stats count them as neither right nor a miss. Migration 12 (card edits) added `card_value_changes`, empty: nothing from before is touched. Migration 2 (decks) moved any cards that existed before decks into one deck named "Default" — a placeholder, not a name the code knows. Migration 4 (card types) made the starter type "Word" (Word front required, Reading back, Meaning back required), gave it to every deck, copied each card's three columns into `card_values`, and then dropped the columns: the text moved, nothing was lost. Migration 5 (field kinds) added `kind` to `card_fields` with `'text'` as its default: every field from before holds one line, nothing else changed. Migration 6 (the SRS) made the three starter SRS types from the contracts' `makeStarter` (WaniKani-like, Classic, Gentle, a millisecond apart so they list in that order) and put every deck on the first; every card from before is new to it. The starters gained their start stage (Lesson / New, no wait) after that migration ran on the owner's data, so their three types have the old first stage (Apprentice 1, 4 h) first, and since 2026-10-10 it waits its 4 h like any stage; the starters' ten-minute first stage is only in types made after that. `deck_id`, `type_id` and `srs_type_id` are nullable at the SQL level only because SQLite can't add a `NOT NULL` column without a default; the API always sets them.
