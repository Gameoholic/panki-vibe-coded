# Status

The product's state. A line moves from "not yet seen" to "in use" once the owner has tried it. What each feature is: `docs/PRODUCT.md`.

## Built and in use

- On https://panki.pro; every push to `main` is typechecked, built and deployed (`docs/RUNNING.md`).
- Decks, cards, search, sort and duplicates; card types and their Main field.
- The SRS: SRS types as a chart, reviews scheduled by them, stage colours.
- Stats and the home board; themes; accounts, one database each.
- The extension adding cards from YouTube.
- Panki AI up to Proofread, with the player bar and the panel's views.
- Example sentences as a field kind: rows of Situation, sentence and translation, Touch up answering rows, the review card's list with its translations a spoiler (`EXTENSION_PROTOCOL` 14).
- The data kept for preservation; `pnpm backup` on the VPS.

## Built, not yet seen by the owner

**Cards and reviews** (`architecture/web.md`, `architecture/data-model.md`)
- 2026-10-11: changing and deleting a card; `pnpm space` and the low-disk warning.
- 2026-10-15: a card type's Layout tab.
- 2026-10-21: a card that's already there; Snooze and Suspend; New before the first stage.
- 2026-10-25: Add as an additional example.
- 2026-10-26: Undo; today's cards before a review; other examples on the review card.
- 2026-11-07: Flag.
- 2026-11-18: before a review (B Line under the bar): "Finish reviews first to unlock extra study · 19 new cards" a quiet line at the foot of today's cards, folded or not, only once every review was done earlier today (`GET /api/stats/cleared`, from `cleared.ts`, loaded with the deck's cards so it never pops in; the skeleton holds its room); no New panel with no new cards today, never "0 of 0".
- 2026-11-17: Search every deck (C Palette): Search at the bar's right, Ctrl+K (⌘K on a Mac) and / on any screen (Settings → Keybinds → Search → Open search), a palette hanging from the top with every deck's cards ranked together, what was found lit, ↑ ↓ and Enter to open a card in its deck, Add “…” as a new card when nothing's found (`GET /api/cards`; `architecture/web.md` → Searching every deck).
- 2026-11-11: the extension's Header bar a panel of its own before YouTube home add-ons, on every YouTube page whatever they say; Streak shown in the Streak's row; the Streak's flame unlit until it counts; the Streak reminder a panel of its own with its (?).
- 2026-11-11: Streaks, a place of its own in the bar beside Stats, where streaks are made (the dashed New streak tile), changed and deleted, the last one too (`EXTENSION_PROTOCOL` 10), Streaks On / Off at its head; Stats is Stats alone; Settings → General → Streaks gone.
- 2026-11-11: Today, its facts (extra study among them) and every streak green or red at any hour with each condition's own tick or cross, on the home and heading Streaks; the Reminder panel, the line at the top of the home, the Review door's note and the streak tile's tint gone; the Streak reminder and Starts at on the extension's YouTube tab (`STREAKS.md` → Rounds 10, 12 and 13).
- 2026-11-11: a review's time left by its counts, the finish time on hover or press, and the time on every Start; Time studying ticking beside it; Time left and Time studying each Shown / Hidden in Settings → General → Reviews.
- 2026-11-13: a review's Progress bar, thin across the top of the window, filling as its cards are done (a miss never moves it back), Shown to begin with; Right answers, "75% right" at the end of its counts, Hidden to begin with; each in Settings → General → Reviews (`architecture/web.md` → The review).
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
- 2026-11-12: This week, This month and This year on every tile with a window over the past, the dropdown grouped (Today ▸, Last 7 d ▸, All time, Custom…); a streak's Show more any stretch; on the home Show less only while arranging too (`STREAKS.md` → Round 19).
- 2026-11-12: Coming up's Today ▸ with This week, This month and This year, each what's left of it, today to its last day (`Stats.calendarAhead`).
- 2026-11-17: Coming up's running total, every column after the first, in every window: quieter after the heaviest column's count ("56 · 87 total"), and after what's pointed at and the foot's Heaviest ("Wed 18 Nov · 56 reviews · 87 total").
- 2026-11-18: a review's end (B Side by side): the old Today / Tomorrow / In 2 days / In 3 days / All this week rows gone, the home's Coming up tile in their place twice, Today and Next 7 d side by side (stacked on a phone), this deck alone, each window fixed and said quietly at the head, no dropdown, no Show more, the home's own pick untouched (`Tile`'s `fixed`). 2026-11-19: there, Next 7 d's count and running total stand over tomorrow, not the heaviest day (`Tile`'s `capAt`); everywhere else as before.
- 2026-11-12: a streak's Show more map dots each day a deck changed what it asks, said on pointing (`StreakState.changes`, `deckChangesOf`).
- 2026-11-12: Today's streaks a line each, pressed to open their conditions, a counted one not met yet with how far it's got ("Cards added ≥ 100 (37)"); on the home a tile's settings and Show more only while arranging.
- 2026-11-12: Card types and SRS types one door of two rows on the home (`components/Door.tsx`); a stored layout drops the old SRS types door.
- 2026-11-12: a time condition said in hours from an hour up ("≥ 1.5 h"), entered in min or h, up to the day's or the week's length (`STREAKS.md` → Round 18).
- 2026-11-17: one rounding for every time and share shown, in the app and the extension: done down (Today, Stats, a condition's "(59 min)", the header bar, the panel, the strip's menu, Right's and the review's "% right", a download's and a video's %), left up (a streak's hours left, a video's and a review's time left, transcribing's waits), so 59.6 min watched reads "59 min" beside "Time watching ≥ 1 h" not met; a Stats column's cap says "1.5 h" as a condition does (`conventions/in-app-text.md` → Times and shares).
- 2026-11-19: Time per card counts All, New (a card standing in New: its first answer, or a Snooze or Suspend before one) or Reviews, a second small choice before Front / Back / Total, kept on this device; the number, the change, the line and the foot follow it (`WindowStats.pace.all` / `started` / `reviews`, no migration).
- 2026-11-20: the home's board, while arranging: Duplicate on any registry tile, a copy right after it with its window, view and measure, then its own (its own picks, removed by its ×); Lock on any tile with a window, which then can't be changed but while arranging, views and measures still switching. Both kept in the device's layout; a layout from before reads as it did (`layout.ts` → `TileCopyId`, `locked`).

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
- 2026-11-12: the extension's Videos tab (Video tracking, the Panki panel, Spoken word underline, Seek bar marks), the YouTube tab the site's own page alone; Cards made from this video named Where you added a card; a subtitle word where its card was added from in a Where you added a card color of the subtitles' own, on the Panki panel's settings; a new card in its SRS type's New color, Panki blue where it has none, and Panki Default's New white (`architecture/extension.md`, `architecture/dictionary.md` → Colours).
- 2026-11-12: Highlight words that are in your decks on the extension's Decks tab, its colours the subtitles' and every site's, the seek bar's its own; the picked word in its own Picked word color on the Panki panel's settings, filled and edged (`architecture/dictionary.md` → Colours).
- 2026-11-12: Keep player bar visible keybind, X, the one way to keep the player bar on the video or let it fade, kept for every video; the two Keep the bar visible switches gone (`architecture/watching.md`).
- 2026-11-12: the Clip's ends stop at sentences, exactly where the clip as said would, the ticks there, Shift for exactly where it's put; Accept's move striped on the bar, green in and red out, the times struck and new; what Panki AI heard on the bar, hatched outside it with a notch at each end, and a note under each message that opens the lines it heard; Room around a clip on the options page.
- 2026-11-14: Downloads step 2, downloading seen working in Chrome: Download this video in the Panki panel's menu, run in the background by one YouTube page at a time, the pieces YouTube's player is handed copied in a hidden frame at 4×; Downloading / Waiting / Downloaded, Remove; the options page's Downloads tab with Download quality (`architecture/downloads.md`).
- 2026-11-14: Downloads step 3: the downloaded mark on a downloaded video's every thumbnail, Panki's home shelves, the recap's what's next and the player bar (Downloaded), live on every page; Downloaded mark Shown / Hidden on the Downloads tab (`architecture/downloads.md` → On screen); Download speed, 1× to 16×, 4× to begin with, beside Download quality.
- 2026-11-14: Downloads step 4, B on trial: a downloaded video's copy put into YouTube's own player where it runs short with no signal, what it did said under Downloaded in the panel's menu and in the console (`architecture/downloads.md` → Playing from the copy).
- 2026-11-16: Short skip Off, By time or By line, By line a subtitle line back or on (← to the start of the line playing, and from its start, or pressed again after a skip by a line, to the line before), by the seconds without subtitles; a kept On reads as By time (`architecture/watching.md`).
- 2026-10-22: kept up to date without a store (`architecture/updates.md`).
- 2026-11-05: what the extension keeps of Panki's, one registry; 2026-11-07: this browser's own settings (`architecture/kept.md`).

**The Word pop-up** (`architecture/dictionary.md`)
- 2026-10-14: the Word pop-up and dictionaries.
- 2026-10-16: the pop-up's layout editor; what each dictionary provides; dictionaries kept on Panki.
- 2026-10-25: On hover; Words that are in your decks, highlighted.
- 2026-11-08: Hover delay.
- 2026-11-10: In your decks drawn from the kept words, asking nothing; no hairline under Panki AI.
- 2026-11-12: under or over its word by its measured height, the side with more room when it fits on neither.
- 2026-11-20: a line moving on or gone under a still pointer leaves the pop-up open, only a real move picking another word, a key acting on what's under the pointer now; the word's box gone with its line; While the Word pop-up is open in Panki subtitles (Keep playing, Pause the video, Hold the line, Pause before the next line, the last to begin with).
- 2026-11-20: In the Panki panel, the list beside the video's own Open the Card drawer and Open the Word pop-up, apart from Panki subtitles, starting as theirs.
- 2026-11-19: Open the Card drawer and Open the Word pop-up in place of the two Key to hold rows, globally and in Panki subtitles, each one gesture (None, Click, Shift/Ctrl/Alt+click, Hold Shift/Ctrl/Alt, Hover with its Hover delay beside it), the one the other holds greyed "Used by …"; today's to begin with, a browser's old Key to hold carried over; globally a click taken from a page only on a Japanese word; a review clip's subtitles never open the drawer.
- 2026-10-15: word audio from Forvo (`architecture/forvo.md`).

**Automations** (`architecture/rules.md`, `docs/RULES.md`)
- 2026-11-19: the admin's Length limit gone from Admin → Transcription (and the unread Allowed / Not allowed / Warn first): an automation's own length limit is the only cap on a video's length, transcribing's included, so a 50 min video plays under "up to 90 min" (`EXTENSION_PROTOCOL` 17).
- 2026-11-16: Settings → Automations as A Flow (triggers joined to their automations, the editor in place), the cap and today's spend at the head (each automation's last-run line, its Last runs switch and History, a window's runs and spend behind a button, all since taken off; the owner); limits and the wait added and taken off, never empty boxes; Downloading On / Off per browser on the extension's Downloads tab.
- 2026-11-15: Settings → Automations, every automatic run an automation (When → Do, optional limits on a video's length and a download's size in brackets inside When, an optional wait of seconds watched on a video playing, the account's one daily cap the only dollar limit), steps 1 to 8 on main, pushed 2026-11-16 (e6713d4): Proofread when a transcript is finished, after every chunk and when a part is transcribed again, on the server; Start transcribing as a video plays and Transcribe the entire video in the background once it's been watched a while, in place of Auto transcribe, Hybrid, the Mode setting and the length limit's Warn first, the strip's menu offering the two by the same names, the one name each on every screen, with no automation switches of its own; Download when a video is saved for later; Ask Panki AI as the Card drawer opens, one of its actions after a colon (Touch up to begin with), its answer in the drawer; Ask Panki AI as the Word pop-up opens ("When the Word pop-up opens, ask Panki AI: Explain"), its title in the flow and History the action's own name, Panki AI's spark before it ("✦ Explain"). Migrations 56 (`rule_runs`) and 57 (`card_proposals`, now read by nothing), new tables only; 58 adds Transcribe the entire video in the background to an account's saved automations once. A new account starts with three, all On (Start transcribing, the entire video in the background, Download; none on the drawer or the pop-up) (`DEFAULT_RULES`); a saved account's are never changed by them.

**Field mapping on the card type, Touch up in Panki** (`docs/MAPPING.md`, `architecture/extension.md` → What fills which field, `architecture/ai.md` → A card opened in a deck)
- 2026-11-17: the Field mapping is the card type's, set in Panki's card type editor beside each field's kind, the same in every browser; the extension reads it from there (the drawer, Touch up, the recap's reading and meaning), its Decks tab saying so with Card types to open; the per-deck On / Off gone, a card type with none simply typed; every card type starting at None, set by hand, a browser's old mapping read by nothing (migration 59, `EXTENSION_PROTOCOL` 15).
- 2026-11-17: Touch up on a card opened in a deck: its Panki AI conversation above its fields, the drawer's actions, follow-ups and Accept / Dismiss; Accept writes into the card's form, marked as Panki AI's, kept by Save; the dictionaries' and a video's pieces absent, so no Line proposal.

**Transcribing** (`architecture/transcribing.md`)
- 2026-10-17: Panki subtitles, transcribed by ElevenLabs.
- 2026-10-20: Start transcribing and Transcribe the entire video in the background.

**Watching** (`architecture/watching.md`)
- 2026-10-21: video tracking, where you stopped, Continue watching, YouTube's home made Panki's.
- 2026-10-25: Finished; the video end time; Words that are in your decks on the seek bar; Recently watched.
- 2026-11-10: a finished video leaving Saved for later; "Ends at".
- 2026-11-13: how saving what's watched stands, an icon in the Panki panel's head (saved, sending, waiting, lost), its words on hover or a press (`architecture/watching.md` → How saving stands).
- 2026-11-13: the Video recap as a video is finished; Videos → Video recap with Confetti on the options page (`architecture/watching.md` → The Video recap, `RECAP.md`).
- 2026-11-17: what's watched noted from the moment a video opens by this browser's Video tracking and Panki on alone, never by Panki answering: a failed ask about the video (which had stopped noting silently till the next video) touches nothing, is said in the Log and asked again 15 s later; the saving icon red with what went wrong for every failure of saving (a send, stretches given way, the watcher's own code), the watcher ticked first and guarded; the icon in the Update needed head too; what waits to be sent kept in the tab however much (no 100 cap), tried again every 15 s until it lands; `pnpm watch:report` and its `--scan` (`architecture/watching.md` → Watching).
- 2026-11-17: Video end (`docs/OUTRO.md`): a video finished at its Video end, where its own content ends, else only at its real end (within a second), the 20 s window and its setting gone; Find where the video ends in the Transcription menu's Panki AI part, once the transcript is finished, for everyone, pressed again to ask again (the Video end's time beside it), the admin's prompt in Admin → Panki AI; the Video end a pink tick on the seek bar, dragged to move it (held to Editing Panki subtitles), its hover "Video end" and its time, not marked as Panki AI's, Video end in Seek bar marks; the automation When a transcript is finished, find where the video ends, On for every account (shared migration 18, account migration 60, `EXTENSION_PROTOCOL` 16).
- 2026-11-16: the Video recap in J Sessions alone, the other four looks and the developer button gone, its head the headline, the facts and ×; K's Continue watching and Saved for later inside it under the strip, high above the seek bar; a session break, a clear tick where one session starts after another (`RECAP.md` step 3).

**Panki AI** (`architecture/ai.md`)
- 2026-11-05: the clip follows the Sentence; an AI value edited by hand stays the AI's.
- 2026-11-08: the card's conversation over the admin's prompt; User instructions.
- 2026-11-09: one answer shape; the words; actions of one's own, Requires, Leave out, Video context length, Clear conversation; Explain as the word's conversation.
- 2026-11-10: the conversation's messages scrolling in their box; the whole block folded under its name; Actions….
- 2026-11-12: the prompts neutral, how Panki AI writes moved to User instructions (Panki's own few lines to begin with); the Explanation left empty when it isn't needed, each field's own Touch up and the actions' grouping gone; the Sentence picked as whole subtitle lines by number, never reworded, and not asked off a video; a part that couldn't be used said under its reply; `{First message}`, where the admin's prompt puts the first message, at the end of Panki's own; User instructions out of the pop-up's and the drawer's conversations, a message's bubble naming its actions alone; the Sentence's clip move as a diff of each end and the length; on a video the Sentence read-only, the clip's words (no Lock), every subtitle line one number in every message, the card's Sentence sent with its lines ("part of" a choice that's good when it holds what the word needs).
- 2026-11-16: the conversation's look, B Quiet, in the Card drawer, the Word pop-up and Settings → Panki AI's explainers: each message a soft bubble at the right, each reply plain text beside a small spark, one rounded composer, Send round in Panki's blue with an arrow.
- 2026-11-16: the composer typed in while Panki AI answers, the actions ticked too, Send waiting for the answer, what's typed meanwhile kept as it lands.
- 2026-11-16: Stop in Send's place while a message is on its way, in the drawer and the pop-up: the message cut, and the provider's call with it, its turn "Stopped" with Try again, the head's status Stopped; never an automation's.
- 2026-11-16: a follow-up that takes a proposal back is a change: its branch merges into the head's conversation, "Withdrew: Meaning" under it, and the earlier chip it greyed says "Withdrawn by your follow-up" and goes to it.
- 2026-11-16: the conversation's fades kept on its messages' box while the drawer's column or the pop-up scrolls, never over the head or Accept all (`.scroll-hold`).
- 2026-11-18: the composer's Actions…: a click switches to that action alone, or unticks it when it's lit, and closes the list, Shift+click adds it beside the others (the Word pop-up, the Card drawer, a card opened in a deck; `Dropdown`'s `onOnly`).
- 2026-11-20: Context, a Panki action in the Word pop-up and on a card: the sentence translated naturally, then what it means where it stands, the word itself left alone; at the end of an account's own order, ticked by no one's defaults (no migration).

## Under way

- Panki AI: `docs/AI.md`, on main, Touch up, steered done; Automations (`docs/RULES.md`) steps 1 to 8 on main, pushed 2026-11-16, for the owner to try; Video end (`docs/OUTRO.md`) steps 1 to 3 built, uncommitted (shared migration 18, account migration 60, `EXTENSION_PROTOCOL` 16); Panki's answer format later.
- A blind trial of the Word pop-up's Explain and Context wordings (2026-11-20): the owner tries them and picks; the key, and what to do once picked, in the comment above `TRIAL_ACTIONS` in `packages/contracts/src/aiActions.ts`.
- The docs: `docs/DOCS.md`.
- Field mapping on the card type and Touch up in Panki: `docs/MAPPING.md`, steps 1 and 2 built, uncommitted (migration 59, `EXTENSION_PROTOCOL` 15); next, the owner sets each card type's Field mapping by hand and tries them.
- Streaks, conditions, reminders and the tiles: `docs/STREAKS.md`, on main and on prod with Round 18 (time conditions in hours; Round 17: Week ends on; Round 16: Cards added, `EXTENSION_PROTOCOL` 11; Round 15: no streak at all, `EXTENSION_PROTOCOL` 10; Round 14: All new cards done asks each new card learned, its review finished; Round 8: All new cards done, `EXTENSION_PROTOCOL` 9; Round 7: reviews and new cards apart, studying; `architecture/data-model.md` → Reviews, new cards and studying; migration 54 made the old default streak today's).
- The Hold button is gone, on main and on prod.
- Blur: `docs/BLUR.md`, on main and on prod (migration 53, `EXTENSION_PROTOCOL` 8; the extension rebuilt and reloaded by hand).
- Line, the sentence's field kind: `docs/SENTENCE.md`, steps 1 to 3 on main and on prod (`EXTENSION_PROTOCOL` 12); the owner backs up and switches their field by hand.
- The Video recap: `docs/RECAP.md`, steps 1 to 3 done, J Sessions the one look, on main, unpushed until the owner says.
- Downloads: `docs/DOWNLOADS.md`, steps 2 to 4 on main and on prod (`EXTENSION_PROTOCOL` as it was; the extension rebuilt and reloaded by hand); next, the owner tries playing from the copy (B), and keeps it or asks for A.
- The extension's polish round: the owner sends what's off, a change at a time.
- Then the owner picks from `docs/BACKLOG.md`.
