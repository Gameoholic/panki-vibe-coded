# Status

The product's state. A line moves from "not yet seen" to "in use" once the owner has tried it. What each feature is: `docs/PRODUCT.md`.

## Built and in use

- On https://panki.pro; every push to `main` is typechecked, built and deployed (`docs/RUNNING.md`).
- Decks, cards, search, sort and duplicates; card types and their Main field.
- The SRS: SRS types as a chart, reviews scheduled by them, stage colours.
- Stats and the home board; themes; accounts, one database each.
- The extension adding cards from YouTube.
- Panki AI up to Proofread, with the player bar and the panel's views.
- The data kept for preservation; `pnpm backup` on the VPS.

## Built, not yet seen by the owner

**Cards and reviews** (`architecture/web.md`, `architecture/data-model.md`)
- 2026-10-11: changing and deleting a card; `pnpm space` and the low-disk warning.
- 2026-10-15: a card type's Layout tab.
- 2026-10-21: a card that's already there; Snooze and Suspend; New before the first stage.
- 2026-10-25: Add as an additional example.
- 2026-10-26: Undo; today's cards before a review; other examples on the review card.
- 2026-11-01: Listen first.
- 2026-11-02: the Hold button.
- 2026-11-07: Flag.

**The extension** (`architecture/extension.md`)
- 2026-10-11: the capture drawer; the line under the player; the YouTube metadata field; Field mapping and Media.
- 2026-10-16: the options page in tabs; the Pitch accent field kind; Reading above.
- 2026-10-25: "Added to [deck]" alone.
- 2026-10-26: Short skip; the drawer letting go of the clip once added; Seconds before where you stopped.
- 2026-10-28: a clip's words matched to the transcript's word times, on trial on prod as the one commit 46bf8b1, reverted in one go if it's worse.
- 2026-11-04: the panel's views, Beside the video.
- 2026-11-06: one full screen; the panel's head and menu; Watching and Save for later on the player bar.
- 2026-11-07: the panel's button in the video's corner.
- 2026-11-10: Subtitles on the player bar and its key, C; Keep the bar visible waking the site instead of holding the bar (`architecture/watching.md`); the panel's left edge dragged for its width; Cancel while Adding…; the Add button bursting as the card lands.
- 2026-10-22: kept up to date without a store (`architecture/updates.md`).
- 2026-11-05: what the extension keeps of Panki's, one registry; 2026-11-07: this browser's own settings (`architecture/kept.md`).

**The Word pop-up** (`architecture/dictionary.md`)
- 2026-10-14: the Word pop-up and dictionaries.
- 2026-10-16: the pop-up's layout editor; what each dictionary provides; dictionaries kept on Panki.
- 2026-10-25: On hover; Words that are in your decks, highlighted.
- 2026-11-08: Hover delay.
- 2026-10-15: word audio from Forvo (`architecture/forvo.md`).

**Transcribing** (`architecture/transcribing.md`)
- 2026-10-17: Panki subtitles, transcribed by ElevenLabs.
- 2026-10-20: Full, Live and Hybrid.

**Watching** (`architecture/watching.md`)
- 2026-10-21: video tracking, where you stopped, Continue watching, YouTube's home made Panki's.
- 2026-10-25: Finished; the video end time; Words that are in your decks on the seek bar; Recently watched.

**Panki AI** (`architecture/ai.md`)
- 2026-11-05: the clip follows the Sentence; an AI value edited by hand stays the AI's.
- 2026-11-08: the card's conversation over the admin's prompt; User instructions.
- 2026-11-09: one answer shape; the words; actions of one's own, Requires, Leave out, Video context length, Clear conversation; Explain as the word's conversation.
- 2026-11-10: the conversation's messages scrolling in their box; the whole block folded under its name; Actions….

## Under way

- Panki AI: `docs/AI.md`, on main. Next: Example sentences as a field kind.
- The docs: `docs/DOCS.md`.
- The extension's polish round: the owner sends what's off, a change at a time.
- Then the owner picks from `docs/BACKLOG.md`.
