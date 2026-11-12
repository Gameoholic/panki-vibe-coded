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
- 2026-11-07: Flag.
- 2026-11-11: the extension's Header bar a panel of its own before YouTube home add-ons, on every YouTube page whatever they say; Streak shown in the Streak's row; the Streak's flame unlit until it counts; the Streak reminder a panel of its own with its (?).
- 2026-11-11: Streaks, a place of its own in the bar beside Stats, where streaks are made (the dashed New streak tile), changed and deleted, the last one too (`EXTENSION_PROTOCOL` 10), Streaks On / Off at its head; Stats is Stats alone; Settings → General → Streaks gone.
- 2026-11-11: Today, its facts (extra study among them) and every streak green or red at any hour with each condition's own tick or cross, on the home and heading Streaks; the Reminder panel, the line at the top of the home, the Review door's note and the streak tile's tint gone; the Streak reminder and Starts at on the extension's YouTube tab (`STREAKS.md` → Rounds 10, 12 and 13).
- 2026-11-11: a review's time left by its counts, the finish time on hover or press, and the time on every Start; Time studying ticking beside it; Time left and Time studying each Shown / Hidden in Settings → General → Reviews.
- 2026-11-11: the time left with where each card's word falls in its clip, a card asked again at what one really takes; `pnpm pace:backtest` (`architecture/data-model.md` → Time left).
- 2026-11-11: Start cards blurred (its line and its (?) playing it), Unblur and Blur in the card's corner and on Shift, a field's Blurred front; a card's two sides in Stats (migration 53 merged the old phase's time into the front's).
- 2026-11-11: each sound or clip field's own volume and speed on this device, wherever it plays, starting from the old shared one.

**Streaks and the tiles** (`docs/STREAKS.md`, `architecture/web.md`, `architecture/data-model.md` → The silo)
- 2026-11-11: streaks with conditions (All reviews done and All new cards done worked out from the history, nothing stored; a new card done once learned, its review finished), counting per day or per week; the reminder on YouTube; every Stats tile in one anatomy with windows (Today, 7 d, 30 d, 1 y, All time, and a Custom… frame, "Last 3 weeks", Coming up's "Next"), views and Show more, nothing by deck; Activity, New cards, Time per card; Time watching's Runtime watched.
- 2026-11-12: the Cards added condition, the cards made in the day or week, a deleted one still counting (`EXTENSION_PROTOCOL` 11; `STREAKS.md` → Round 16).
- 2026-11-12: Week ends on, every week in Panki following it, Sunday for every account until it's changed (`STREAKS.md` → Round 17; `architecture/data-model.md` → The week).
- 2026-11-12: all decks' time on the Review door, in its line after the counts, each deck's from its counts as the deck list's Start; hidden with Time left.
- 2026-11-12: every tile, hover and door with none of what it counts says the number ("0 reviews today.", "Fri 25 Sept · 0 reviews", "0 due · 0 new"), never "nothing".
- 2026-11-12: a card's look before Undo and after it one look, in its time and the pace; a card's time and the review's time studying stopped while Panki is out of view (`architecture/data-model.md` → Undo, the spans).
- 2026-11-12: Today's streaks a line each, pressed to open their conditions; on the home a tile's settings and Show more only while arranging.
- 2026-11-12: Card types and SRS types one door of two rows on the home (`components/Door.tsx`); a stored layout drops the old SRS types door.
- 2026-11-12: a time condition said in hours from an hour up ("≥ 1.5 h"), entered in min or h, up to the day's or the week's length (`STREAKS.md` → Round 18).

**The extension** (`architecture/extension.md`)
- 2026-10-11: the capture drawer; the line under the player; the YouTube metadata field; Field mapping and Media.
- 2026-10-16: the options page in tabs; the Pitch accent field kind; Reading above.
- 2026-10-25: "Added to [deck]" alone.
- 2026-10-26: Short skip; the drawer letting go of the clip once added; Seconds before where you stopped.
- 2026-10-28: a clip's words matched to the transcript's word times, on trial on prod as the one commit 46bf8b1, reverted in one go if it's worse.
- 2026-11-04: the panel's views, Beside the video.
- 2026-11-06: one full screen; the panel's head and menu; Watching and Save for later on the player bar.
- 2026-11-07: the panel's button in the video's corner.
- 2026-11-10: Subtitles on the player bar and its key, C; Keep the bar visible waking the site instead of holding the bar (`architecture/watching.md`); the panel's left edge dragged for its width; Cancel while Adding…; the Add button bursting as the card lands; the list beside the video scrolling only once the line is second to last in view.
- 2026-11-12: one set of mark colours: in-deck, suspended and flagged set on the Highlight panel alone, the seek bar wearing them; in Panki subtitles a card made from the video in the seek bar's Cards colour and the picked word in its Clip colour (`architecture/dictionary.md` → Colours).
- 2026-11-12: Keep player bar visible keybind, X, the one way to keep the player bar on the video or let it fade, kept for every video; the two Keep the bar visible switches gone (`architecture/watching.md`).
- 2026-10-22: kept up to date without a store (`architecture/updates.md`).
- 2026-11-05: what the extension keeps of Panki's, one registry; 2026-11-07: this browser's own settings (`architecture/kept.md`).

**The Word pop-up** (`architecture/dictionary.md`)
- 2026-10-14: the Word pop-up and dictionaries.
- 2026-10-16: the pop-up's layout editor; what each dictionary provides; dictionaries kept on Panki.
- 2026-10-25: On hover; Words that are in your decks, highlighted.
- 2026-11-08: Hover delay.
- 2026-11-10: In your decks drawn from the kept words, asking nothing; no hairline under Panki AI.
- 2026-10-15: word audio from Forvo (`architecture/forvo.md`).

**Transcribing** (`architecture/transcribing.md`)
- 2026-10-17: Panki subtitles, transcribed by ElevenLabs.
- 2026-10-20: Full, Live and Hybrid.

**Watching** (`architecture/watching.md`)
- 2026-10-21: video tracking, where you stopped, Continue watching, YouTube's home made Panki's.
- 2026-10-25: Finished; the video end time; Words that are in your decks on the seek bar; Recently watched.
- 2026-11-10: a finished video leaving Saved for later; "Ends at".

**Panki AI** (`architecture/ai.md`)
- 2026-11-05: the clip follows the Sentence; an AI value edited by hand stays the AI's.
- 2026-11-08: the card's conversation over the admin's prompt; User instructions.
- 2026-11-09: one answer shape; the words; actions of one's own, Requires, Leave out, Video context length, Clear conversation; Explain as the word's conversation.
- 2026-11-10: the conversation's messages scrolling in their box; the whole block folded under its name; Actions….

## Under way

- Panki AI: `docs/AI.md`, on main. Next: Example sentences as a field kind.
- The docs: `docs/DOCS.md`.
- Streaks, conditions, reminders and the tiles: `docs/STREAKS.md`, on main and on prod with Round 18 (time conditions in hours; Round 17: Week ends on; Round 16: Cards added, `EXTENSION_PROTOCOL` 11; Round 15: no streak at all, `EXTENSION_PROTOCOL` 10; Round 14: All new cards done asks each new card learned, its review finished; Round 8: All new cards done, `EXTENSION_PROTOCOL` 9; Round 7: reviews and new cards apart, studying; `architecture/data-model.md` → Reviews, new cards and studying; migration 54 made the old default streak today's).
- The Hold button is gone, on main and on prod.
- Blur: `docs/BLUR.md`, on main and on prod (migration 53, `EXTENSION_PROTOCOL` 8; the extension rebuilt and reloaded by hand).
- The extension's polish round: the owner sends what's off, a change at a time.
- Then the owner picks from `docs/BACKLOG.md`.
