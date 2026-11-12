# The API

> **Scope of this file.** The API's conventions and its route groups. The routers in `apps/api/src/routes/` are the truth for each route; the shapes are `packages/contracts/src/`.

## Conventions

- **JSON in and out,** but a file's own bytes (an upload, `/api/media/:id`, a dictionary's zip, a transcript piece's sound). Every body and query is parsed with the contracts' schema; a failed parse is `400 { error: { message, path } }`. Unknown `/api/*` is `404`. An unexpected error is `500 "Something went wrong."`, logged, never leaking internals (`app.ts`).
- **Every answer is `Cache-Control: no-store` and `nosniff`:** it's the signed-in account's, as things stand now. A file served sets its own `private, max-age=31536000, immutable` over that, since nothing changes under its id; byte ranges are honoured, which is how a clip is skipped through.
- **Time is the API's.** Every route takes `now` from `createApp`, and every read that derives a count or a due time uses it; the browser only sends spans it measured.
- **A write can be retried.** Whatever the browser or the extension makes carries an id it minted; the same id again returns what's there (`201` the first time, the row as it stands after), and the same id with other content is `409`, never an overwrite. A file is told apart by its SHA-256.
- **A route that names a deck checks it with the cheap reads** (`hasDeck`, `deckTypeId`), never by deriving the deck's counts. A removed deck, card, type or example answers as one that isn't there; a delete again is `204`, `404` only for an id that never existed.
- **Who did it is the session's.** A change to what everyone shares writes the admin's `user_id` on its change row; the client never names who it is.

## Sessions

- **Everything under `/api` needs a live session** but `POST /api/login` and `/api/extension` (anyone's: the build and its zip). The app sends its cookie; the extension, which can't keep it, signs in with `bearer: true`, gets the session's secret in the answer and no cookie, and sends `Authorization: Bearer …`. Either is the same kind of row, listed with the devices in Settings and signed out the same ways. No CORS is opened: the extension's own pages and worker are let through by the browser once the owner allows Panki's address, and a page's script never calls the API.
- **The cookie carries a secret the database never holds** (32 random bytes; `panki_session`, `HttpOnly`, `SameSite=Lax`, ten years, `Secure` when the request came over HTTPS: `trust proxy` is `loopback`, so nginx's `X-Forwarded-Proto` counts and `req.ip` is the browser's). The row keeps its SHA-256, so the file alone signs nobody in. `requireSession` (`session.ts`) looks it up, touches `last_seen_at` at most once a minute, and puts the account on `res.locals` (`signedIn(res)`); a cookie naming no live session is cleared as it's refused (`401 "Sign in to continue."`).
- **One account never sees another's rows:** every router reads `dbOf(res)`, the signed-in account's own database.
- **The sign-in:** a wrong password and an unknown name are the same answer and take the same time (the unknown name is checked against a dummy hash). Five wrong tries from one address inside fifteen minutes and that address waits a minute (`429`; `throttle.ts`, in memory, remembering only an address with a wrong try still inside its window, so a scan from many addresses can't grow it). Every try is a `login_attempts` row.
- **What everyone shares is read by anyone and changed by an admin alone:** those routes go through `requireAdmin` too, `403 "Only an admin can change this."`. A key typed in Settings is never sent back but to an admin, and the server's own key from the environment never at all.

## Headers every answer carries

- **The state header** (`X-Panki-State`, `kept.ts`): a short hash of each kind of data the extension keeps, everyone's, the build's and (signed in) the account's, worked out as the headers go out, so it says how things stand after the request. A hash is worked out again only once its database changed (`whileUnchanged`: SQLite's own `total_changes()` and `data_version`), never from a counter bumped by hand. How the extension reads it: `kept.md`.
- **The extension protocol:** an extension says its protocol in `x-panki-extension`; one older than `EXTENSION_PROTOCOL` is refused with `426` before anything else, but on `/api/extension`, so it can still learn how to update (`routes/extension.ts` → `requireProtocol`). A call with no header (the app) or a newer protocol passes. What raises it: `conventions/data.md` → Shapes; the update path: `updates.md`.

## Route groups

Mounted in `app.ts`, in that order (the protocol check and the login before `requireSession`).

| Mount | Router | What |
| --- | --- | --- |
| `/api/extension` | `extension.ts` | The build beside the server and its zip, no sign-in |
| `/api/login`, `/api/me`, `/api/logout`, `/api/sessions`, `/api/events` | `auth.ts` | Signing in and out, the account's devices, the ledger's batches (1 to 100 events, each stamped with the API's time and the session's device) |
| `/api/types` | `types.ts` | Card types. A `PATCH` takes the whole field list (ids left out are hidden, known ones un-hidden); a layout sent is kept filled out against the fields and writes each field's side; any change writes `card_type_changes` whole |
| `/api/srs` | `srs.ts` | SRS types. Hiding a stage with cards needs `moves` (`409 { needsMoves }` without); a built-in type is `409` to `PATCH` and `DELETE` |
| `/api/settings` | `settings.ts` | The account's settings over the defaults |
| `/api/decks` | `decks.ts` | Decks, and under them cards, answers, Undo, examples, holds, flags and sessions (below) |
| `/api/cards` | `cards.ts` | Reads across decks: the cards called by some words (what a card about to be added says is there already) and every word the cards are called by |
| `/api/media` | `media.ts` | A card's files: upload, serve, and a clip's cues and recording facts, each written once |
| `/api/word-audio`, `/api/forvo` | `wordAudio.ts`, `forvo.ts` | Where word audio comes from (admin), Forvo's recordings of a word, one kept as the account's file (`forvo.md`) |
| `/api/dictionaries` | `dictionaries.ts` | Dictionaries kept on Panki for everyone; upload and remove are admin's (`dictionary.md`) |
| `/api/transcription`, `/api/transcripts` | `transcription.ts`, `transcripts.ts` | How transcribing runs (admin), and each video's transcript: pieces, the whole video, fixes, forgets, redos (`transcribing.md`) |
| `/api/videos` | `videos.ts` | The account's cards from a video (the marks on its bar), and its thumbnail and channel picture, fetched once for everyone |
| `/api/watching` | `watching.ts` | Time watched, where a video stopped, finished, saved videos, the glance on YouTube's thumbnails, each browser's Video tracking (`watching.md`) |
| `/api/ai` | `ai.ts` | Panki AI's settings and keys (admin), templates, actions, and a message to each place (`ai.md`) |
| `/api/usage` | `usage.ts` | The usage ledger added up per account (admin) |
| `/api/stats` | `stats.ts` | Every number of the Stats tab, for all decks or one; `?last=3&unit=week` adds a custom frame over the past (`Stats.custom`), `?next=` one ahead (`Stats.customAhead`); what's left of this week, month and year always (`Stats.calendarAhead`), the days named by the API |
| `/api/space` | `space.ts` | What's left on the disk (anyone: they share it), and the storage report (admin) |

### Under a deck, what isn't obvious

- **A card names only files its own account holds, of its field's kind.** `cardProblems` checks the shape, the route looks each file up. A value left in a field from before its kind changed is no fault of a change that leaves it alone (`firstProblem`).
- **`PATCH` a card sends only what differs;** each value that really differs is a `card_value_changes` row, the same again records nothing.
- **An answer** carries `givenId`, the id the browser minted for that showing: the same `givenId` again keeps nothing more and returns the card; one that's another card's is `409`. It carries `exampleId` when the card was shown with an example: `400` when it isn't the card's, `409` when the card has a live pin and this isn't it. An answer whose rule is Bury or Suspend writes a hold, not a place.
- **Undo** is `DELETE …/answers/:givenId`: the card as it stood before; `409` unless that answer is the last thing that happened to the card.
- **`PUT …/hold`** suspends a card by hand from its row; **`DELETE …/hold`** lifts every hold that still stands.
- **`PUT …/flag`** sets the flag; the same again writes nothing.
- **A session** is `POST …/sessions` with the browser's id, stamped with the API's time and the signed-in device; its end, `PATCH`, is set once.
- **`GET …/cards`** pins an example on each card a review would take now that has examples and no live pin (`data-model.md` → "A card's other examples"): a read that writes, on purpose.
- **The API never refuses an answer for being over the day's count;** it only stops offering new cards (`newCount` 0) until the day turns.
