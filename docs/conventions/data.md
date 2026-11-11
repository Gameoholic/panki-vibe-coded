# Data

## Discipline

- **Anything that's added up is an integer,** in the smallest unit that will ever matter, never a float. Only the display divides.
- **Round once.** Effects that combine compose into one result, rounded once, half-up.
- **Derived, never tracked.** A value that can be computed from state is computed, every time.
- **What was done is counted as done; what's had is counted as it stands.** A count of things done (cards added, reviews, new cards started, time studying, a streak's conditions) is fixed when it happens, and a later act never takes it back: a card added and deleted next week still counts on the day it was added. A count of what exists now (cards on each stage, cards due, coming up, toughest cards, how many cards a deck has) reads the present, so a deleted card leaves it at once. Ask of every number whether it is about something done or something had: done never shrinks, had follows the data. Undo is the one exception: it says the act itself was a mistake, so the act's count goes, while the time spent on it stays, because it was spent.
- **Time is passed in,** never read from a global clock inside logic, so it can be tested and pinned. *(The API takes `now` as a function.)*
- **A write can be retried safely.** *(The browser mints a card's id, so a retried POST returns the same card instead of a second one.)*
- **What comes from outside is fetched once, ever.** A service's answer (a Forvo word and its recordings, a transcript, a video's pictures) is kept on Panki's disk in the shared store (`shared.sqlite`), for every account, for good; the service is never asked twice for the same thing. When its links expire, what's needed is fetched at once while they work. Never an in-memory cache with a lifetime, never one per account. "Cache" means this. Say the cost in requests in one line.

## Preservation

**Every feature keeps its data the way the app already does. This is the standard, not the ceiling.** A later feature, stat or analysis may rely on anything, so nothing is judged too small to keep.

- **Nothing is ever deleted or overwritten.** A delete sets `removed_at` and every read filters it out; a correction or an undo marks the old row (`undone_at`, a fix beside the heard word) and the row stays whole. Never `DELETE`, never an `UPDATE` that loses the old value.
- **Every change is a row of its own**, with the old and the new value: a rename (`deck_renames`), a field edited (`card_value_changes`), a type saved (the whole save logged), a setting changed. Not only the result.
- **Every action is a row, with who and when.** Every answer with its timings (`card_places`, `think_ms`, `decide_ms`), every session (`review_sessions`), every mark on a video and who made it, every forget even when nothing stood in the stretch, every paid call (`usage`), every pick, switch and layout change in the browser (the `events` ledger, for whatever no table is shaped for). The server's clock, never the client's.
- **Who did it is always on the row**: `user_id`, `removed_by`, `undone_by`, the viewer or Panki itself. Shared data says which admin changed it.
- **Keep what a backfill would need.** Whatever is known as something is made (a card captured, a file recorded) is kept with it: what it came from, how it was made, which build made it, even when nothing reads it yet (`CaptureFacts`, `MediaRecording`). A fact that can't be kept never stops what it's about.
- **What happened is frozen where it happened;** what a thing is is read live. Retuning a setting never rewrites the past.
- **A new kind of thing gets its rows in the same change**: its table or its ledger row, its `removed_at`, its who, its change log. A migration adds, never drops or rewrites, and runs once.

## Generated content

- **Generated content is marked, and kept apart from the true data.**
- Anything a model writes carries the AI's mark wherever it's shown: its words in the AI's ink (`--ai-ink`), whether it wrote a field of its own or corrected one; the spark out of the text, in a card's corner, on its row, inside a field's box, and before a field's name the layout shows only for a field that's its own (`aiOwns`); never pushed into the words.
- It's kept apart from what the owner, a dictionary or a video gave. The owner accepts it before it lands on a card.
- A video's transcript is named as Panki's wherever it's shown or filled from, never passed off as the video's own words; a word of it is fixed by hand where it's wrong.

## Shapes

- **Shapes have one source of truth:** `packages/contracts`, imported by both apps, which is also what validates at the boundary. Never restate a shape.
- **A change that breaks an older extension raises `EXTENSION_PROTOCOL` in the same commit** (`packages/contracts/src/extension.ts`). Breaking: the server stops accepting, or changes the meaning of, something an older extension sends or reads (a route renamed or removed, a field renamed or made required, a shape changed). Not breaking: anything an older extension can ignore (a new optional field, a new route), and any change to the extension alone. An older extension is then refused and says "Update needed".
