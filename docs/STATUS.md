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
- 2026-11-12: a streak's Show more map dots each day a deck changed what it asks, said on pointing (`StreakState.changes`, `deckChangesOf`).
- 2026-11-12: Today's streaks a line each, pressed to open their conditions, a counted one not met yet with how far it's got ("Cards added ≥ 100 (37)"); on the home a tile's settings and Show more only while arranging.
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
- 2026-10-15: word audio from Forvo (`architecture/forvo.md`).

**Automations** (`architecture/rules.md`, `docs/RULES.md`)
- 2026-11-16: Settings → Automations as A Flow (triggers joined to their automations, the editor in place), the cap and today's spend at the head (each automation's last-run line, its Last runs switch and History, a window's runs and spend behind a button, all since taken off; the owner); limits and the wait added and taken off, never empty boxes; Downloading On / Off per browser on the extension's Downloads tab.
- 2026-11-15: Settings → Automations, every automatic run an automation (When → Do, optional limits on a video's length and a download's size in brackets inside When, an optional wait of seconds watched on a video playing, the account's one daily cap the only dollar limit), steps 1 to 8 on main, pushed 2026-11-16 (e6713d4): Proofread when a transcript is finished, after every chunk and when a part is transcribed again, on the server; Start transcribing as a video plays and Transcribe the entire video in the background once it's been watched a while, in place of Auto transcribe, Hybrid, the Mode setting and the length limit's Warn first, the strip's menu offering the two by the same names, the one name each on every screen, with no automation switches of its own; Download when a video is saved for later; Ask Panki AI as the Card drawer opens, one of its actions after a colon (Touch up to begin with), its answer in the drawer; Ask Panki AI as the Word pop-up opens ("When the Word pop-up opens, ask Panki AI: Explain"), its title in the flow and History the action's own name, Panki AI's spark before it ("✦ Explain"). Migrations 56 (`rule_runs`) and 57 (`card_proposals`, now read by nothing), new tables only; 58 adds Transcribe the entire video in the background to an account's saved automations once. A new account starts with three, all On (Start transcribing, the entire video in the background, Download; none on the drawer or the pop-up) (`DEFAULT_RULES`); a saved account's are never changed by them.

**Transcribing** (`architecture/transcribing.md`)
- 2026-10-17: Panki subtitles, transcribed by ElevenLabs.
- 2026-10-20: Start transcribing and Transcribe the entire video in the background.

**Watching** (`architecture/watching.md`)
- 2026-10-21: video tracking, where you stopped, Continue watching, YouTube's home made Panki's.
- 2026-10-25: Finished; the video end time; Words that are in your decks on the seek bar; Recently watched.
- 2026-11-10: a finished video leaving Saved for later; "Ends at".
- 2026-11-13: how saving what's watched stands, an icon in the Panki panel's head (saved, sending, waiting, lost), its words on hover or a press (`architecture/watching.md` → How saving stands).
- 2026-11-13: the Video recap as a video is finished; Videos → Video recap with Confetti on the options page (`architecture/watching.md` → The Video recap, `RECAP.md`).
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

## Under way

- Panki AI: `docs/AI.md`, on main, Touch up, steered done; Automations (`docs/RULES.md`) steps 1 to 8 on main, pushed 2026-11-16, for the owner to try; next, the outro as an automation; Panki's answer format later.
- The docs: `docs/DOCS.md`.
- Streaks, conditions, reminders and the tiles: `docs/STREAKS.md`, on main and on prod with Round 18 (time conditions in hours; Round 17: Week ends on; Round 16: Cards added, `EXTENSION_PROTOCOL` 11; Round 15: no streak at all, `EXTENSION_PROTOCOL` 10; Round 14: All new cards done asks each new card learned, its review finished; Round 8: All new cards done, `EXTENSION_PROTOCOL` 9; Round 7: reviews and new cards apart, studying; `architecture/data-model.md` → Reviews, new cards and studying; migration 54 made the old default streak today's).
- The Hold button is gone, on main and on prod.
- Blur: `docs/BLUR.md`, on main and on prod (migration 53, `EXTENSION_PROTOCOL` 8; the extension rebuilt and reloaded by hand).
- Line, the sentence's field kind: `docs/SENTENCE.md`, steps 1 to 3 on main and on prod (`EXTENSION_PROTOCOL` 12); the owner backs up and switches their field by hand.
- The Video recap: `docs/RECAP.md`, steps 1 to 3 done, J Sessions the one look, on main, unpushed until the owner says.
- Downloads: `docs/DOWNLOADS.md`, steps 2 to 4 on main and on prod (`EXTENSION_PROTOCOL` as it was; the extension rebuilt and reloaded by hand); next, the owner tries playing from the copy (B), and keeps it or asks for A.
- The extension's polish round: the owner sends what's off, a change at a time.
- Then the owner picks from `docs/BACKLOG.md`.
