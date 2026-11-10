# Product

> Why Panki exists, who it's for, how it must feel, and each feature as the owner meets it today. How a feature is built is `docs/architecture/`; what's not built is `docs/BACKLOG.md`; what's built but not yet tried is `docs/STATUS.md`.

## What this is

Panki is the owner's replacement for Anki, for Japanese vocabulary (kanji stays on WaniKani). It runs in the browser on their Windows PC and their Android phone, from a small VPS, with a browser extension on the PC that mines cards from YouTube and any page.

**The one goal: the seconds between seeing a word and having it in a deck.** Sentence mining never happened because adding a card took a minute. A feature that doesn't shorten capture or make reviews worth coming back to doesn't belong.

The pains it fights: adding a card is tedious (the biggest); Anki's UI; a messy document of words picked up from friends.

## The owner

- Burned by a previous AI-built project that came out messy, so one step at a time and no unprompted scope is non-negotiable.
- Cares that code quality and visual style are taken seriously. Their biggest gripe with AI-built software is that it looks cluttered and generated.
- Loves configurability as settings, and keeps mechanics lean. When unsure whether a mechanic helps, it's a setting; when they narrow scope on purpose, it stays narrow.
- Wants it to feel good to use: never a spreadsheet or a bare form. Friction kills; less friction beats one more feature.
- Wants the cost shown before acting, wherever an action can hurt something they value.
- Thinks in games: stats that stack, a good mobile game's reward screen, Notion's inline forms, After Effects' dragging a line onto what it links.
- Is the product manager: progress as a checklist, no jargon.
- Uses a PC first, an Android phone second. On Israel's clock; the week starts on Sunday.
- Self-hosts on a ~$5 VPS shared with other services, so containment matters.

## Principles

- **Capture friction is the metric.** Everything on the way from a word to a card is a press or less.
- **Nothing the owner does is lost.** Every answer, change, delete and pick is kept with when and who; a delete hides. A stat thought of next year is worked out from what was kept.
- **Generated content is marked and kept apart from the true data.** A video's transcript is always Panki's, never passed off as the video's own; whatever a model writes carries Panki AI's spark and ink, and lands on a card only when the owner accepts it.
- **Plain words.** Stages, waits, answers; never a scheduling algorithm's jargon.

## Design language

The look is "Paper": a light neutral ground, white bordered cards, Urbanist (self-hosted) for Latin text and the device's own Japanese font, a quiet indigo accent, 12 px radius, counts as small accent pills, section labels in small uppercase, the review word big on a card with a soft shadow.

- **Clean, modern SaaS.** Not themed, not skeuomorphic.
- **The mark is the one brand element**: パ, white on an indigo tile, in the browser tab and on an Android home screen. Its two colours never change with the theme. The app opens straight onto the home, no opening animation.
- **Themes are colour only, never a different design**: Match the device, Light, Dark, Nord, Tokyo Night, One Dark, Gruvbox, Solarized Light, Solarized Dark, Monokai. Nothing novelty or pink. Kept on the device.
- **Forms are inline panels anchored to what opened them**, Notion-style; the one centred pop-up is the unsaved-changes question.
- **Right-click a row for its menu** (press and hold on a phone).
- **Loading is the shape of what's coming**: each screen's own skeleton, built of its real pieces, there the instant the screen is, exact wherever the numbers are known and the device's remembered shape elsewhere. Never "Loading…", never a blank that pops in.
- **Motion is intentional and consistent**, one approach reused. Everyday things are quick and quiet. **Celebrations go all in** (build-up, landing with weight, payoff, then the words), only for moments that earn them.
- **Sent back**: motion that follows the cursor; a flash where an animation starts; a metaphor unrelated to the product.
- **The scratch card**: a reveal the owner loved and hasn't used yet. Offer it when they ask for a new animation or reveal.
- A chip is a rounded rectangle; only the stage dots are round and the unpressed badges pills. A switch's words are its state. An answer's key is drawn as a keycap.

## Features

### Getting around

The home is a board: the doors **Review** (blue only when something is due or new within today's counts; with one deck it goes straight in), **Decks**, **Add a card**, **Card types** and **SRS types**, and the tiles the owner picks from Stats. **Home**, **Settings** and **Stats** are the fixed tabs, a bar across the top on the PC and along the bottom on the phone; every other screen has a back arrow and a title. Every screen has its own address, so back, forward, a mouse's side buttons and a reload all go where expected.

Under 2 GB left on the server's disk, everyone signed in sees "Panki is nearly out of room" at the top of their home, with what's left; it goes away by itself once there's room. Nothing is ever deleted to make room.

### Decks and cards

**Decks** lists each deck with its card type and count, and a settings button per row. **New deck** asks a name, a card type and an SRS type, both fixed once made. Inside a deck, two tabs. **Settings**: the name, the card type and SRS type as buttons to their own screens, the deck's review settings (New cards a day, Max reviews a day, the answer the Hold button gives), and Delete, which asks with what it costs ("Delete 'Mined' and its 31 cards?") and hides the deck and its cards, never destroying them.

**Cards**: Add card and Review side by side, then the cards. Add card opens the form above the list, a field per field of the card type, required ones enforced in Panki's own words. A row shows the card's stage pill in the stage's colour and when it comes back. The list has **Search** (fuzzy, over every field, a video's title or channel, other examples and the stage; katakana and hiragana alike) and **Sort by** Added, Due, Word or Stage with both directions in words, kept on the device. Each row has Edit (the same form, filled in; a file has Replace and Delete; Save and Cancel), Preview (the card turned as a review would, in any deck's shape), Flag / Unflag, and Snooze / Suspend's undo, Unsnooze / Unsuspend. A deleted card leaves the deck, its counts and its reviews at once; its answers stay in Stats.

**A card that's already there.** With a card type's Main field picked, adding a card called the same as one in any deck says so under that field, in amber, with every such card listed (its deck and the compared fields) and **Open** to go to it. A notice when only the word matches; a warning when every field in **Duplicate when these match** matches, which holds Add back until **Add anyway**, **Add as an additional example** or a changed field resolves it. The drawer also finds a card kept under the dictionary form of the word. In a deck's list a duplicate says **Duplicate** or **Also in Mining**, pressed to show that word's cards alone.

**Other examples.** A field can be **One per card** or **One per example**. Adding a word already there as an additional example puts the new sentence, clip and video on the existing card instead of a second card; the SRS is untouched. A deck's row says "3 examples"; an opened card lists its Other examples, each with where it came from, Edit and Delete…. A review shows one example, as **Example shown** says (Rotate, Newest, Random), kept until the card is passed; ‹ 1 / 3 › on the card and the Previous / Next example keys turn the others.

**What a field holds.** **Text** (one line), **Paragraph** (several lines; Ctrl+Enter adds the card), **Media** (a clip or a sound, chosen or dropped in), **Image**, **YouTube metadata** (a video's link at a moment, drawn as a small card with its thumbnail, title, channel picture and name, opening the video there in a tab of its own; Panki keeps both pictures) and **Pitch accent** ("たべる 2", drawn as the accent line). Files are Panki's own, given only to the account's signed-in devices. Japanese is recognised from the text itself.

### Card types and layouts

A **card type** is what a card is made of. Its **Fields** tab lists the fields in the order a form asks for them, dragged by their grip: each a name, a kind, Required as a switch, and One per card / One per example; at the top, **Main field** (None to begin with: nothing is a duplicate until one is picked) and **Duplicate when these match**. A change reaches every deck on the type; a field is hidden, never deleted; a type in use can't be deleted. Enter moves to the next field, so a type is typed out in one go.

Its **Layout** tab is the review screen itself, live, with one of the type's newest cards on it (**Previewed for**): press a part to pick it, drag it by its grip, set it in a floating panel (a sheet on a phone) with Undo, Redo and Save. Each field, on each side, is **Show**, **Spoiler** (a block of its own shape, opened by a press) or **Hide**. Words get a size, colour, weight and Field name; **Reading above** puts another field over them as furigana; **Highlight** lights another field's words in them. A sound or clip gets a **Player style** (Player, Panki's own with volume, speed and full screen; Plain, the browser's; Button, Voice note, Round button, Tile, Speaker), plays by itself or not, and a clip its **Subtitles** as heard when recorded. A field can stand beside the one above, and in a **Side** or **Main** column on a wide screen. The stage tag and the AI spark get Shown / Hidden and a corner. **Full screen shows** names the clip a review's full screen fills with. Sounds are green, clips purple.

**Listen first**, On per type: a review opens each card on a **Listen** phase before the front, each field Shown, Blurred or Hidden while listening, one sound or clip able to end it after its second to sixth play, or **Done listening** on its key. Nothing moves on the card as it turns; the seconds listened are kept and count in Stats.

### The SRS

An **SRS type** says how a deck's cards come back: a ladder of **stages**, each with a wait (or No wait) and a colour; two to six **answers**; **rules** for what each answer does (up or down the ladder, to a stage, Burned, ask again later or right away, Snooze, Suspend, New again, or the button hidden); and the end of the ladder (Burned, or keep coming back at a growing wait). Rules are the default's unless a stage has its own. Every type has **New** before its first stage, where an unlearned card waits for the day's new cards; once learned, a card goes no lower than the first stage except by a New again step. A card's due date is never stored: it's worked out from its answers and the rules as they are now, so editing a type changes what happens next and never the past.

The editor is a **chart**: the stage on the left, an arrow per answer to a box saying where the card goes, ask-agains branching further. A box opens a small card of choices: the moves along the ladder (↓ X, ↓ 1, Stay, ↑ 1, ↑ X), the rare steps as chips, the stages as coloured dots. Boxes are dragged, + on an arrow inserts an ask-again, Fit and Tidy up. A rail across the top picks the default rules or a stage's own. An ask-again is never later than the stage itself. Under the chart, the answers (each can be set apart, and ask for confirmation) and the stages, dragged into order. Beside it, a **preview**: one card's journey, and Reviews a day over three months at a pace picked there. Save is in the header; leaving unsaved asks Stay, Discard changes or Save and leave.

**Panki Default**, **Wanikani** and **Anki** come with Panki, read-only, every box openable, each a start for a type of one's own (or Empty). Panki Default: Learning 1–4, Familiar 1–2, Strong 1–2, Burned. Forgot keeps the card in the review until it's right, then drops a stage, but from Familiar 1 up it gets one more chance tomorrow first. Set apart, each asking first: **Easy** (three stages up, two from Familiar 1), **Snooze** (24 hours aside), **Suspend** (out until brought back from the deck), **Reset** (back to Learning 1). Snooze and Suspend never move the card or count as an answer. Wanikani drops by ceil(misses / 2) stages; Anki is its default deck laid on a ladder, the nearest fixed-stage equivalent.

### A review

The top counts what's left as "2 new 9 reviews 0 again", each in its colour, the current card's kind underlined, in the order they come. The card shows its stage tag; Space (or a tap) shows the back, then the answers say exactly where each sends the card ("Learning 3 · 1 d", "again tomorrow", "Burned ✓") with a direction mark, on keys 1 to 6, the set-apart ones a quieter row. Reaching a stage ends the card for this sitting; only Ask again right away keeps it in. **Chart** opens the card's chart under the answers, the current box lit and the answer pointed at traced. The end tallies the answers and what's coming up; when new cards remain, **Extra study** offers more, laid out as today's cards are.

- **Today's cards** come first (Shown or Skipped, in Settings): one bar with the counts and Start, unfolding into tiles of every due and new card, every one picked; a press leaves one for later, a stage's chip, All and None do many, Show every new card offers more. With several decks, a bar per deck.
- **Undo** takes back the last answer, then the one before, to the start of the sitting: the card comes back at its start, the counts as they were, the answer kept but marked undone. Leaving the review ends it.
- **Step back** takes the card a phase back (back to front, front to Listen).
- **The Hold button** (Keybinds, Off to begin with) carries a card through on one held key, Shift to begin with: Done listening, the back, then the deck's chosen answer, drawn as one clock face. Let go and the card stays where it got to.
- **Flag** marks a card to come back to, without answering it: a highlighter's yellow on its deck row, Show → Flagged in the list, and on YouTube wherever the word appears.
- **A clip's full screen fills the screen with the whole review**: the clip, and the rest of the card in a rail at the right fitting with no scroll, the answers' keys working throughout. It holds from card to card and the device remembers it; "That's the lot" leaves it without forgetting.

How every review runs is the account's, in **Settings → General → Reviews**: today's cards first, where new cards come (before, after, scattered), their order, the reviews' order (shuffled or longest overdue), where a card asked again comes back, how many cards are in play at once, and which example is shown.

### Stats and the home board

**Stats** is every tile, always, in one fixed order, for all decks or one: Due now, Streak, Past year (a heat map), Reviews, Right (not missed, 30 days against the 30 before), Ladder, Coming up, Days studied, Added, Time (each card capped at 2 minutes), Toughest cards, and the watching tiles: Watched, Watch time, Channels, Continue watching, Recently watched. A tile with nothing yet says so in one quiet line.

**The home** is the same board with the doors and the tiles the owner picked, three across on a PC, one on the phone, nothing labelled as widgets. **Hold any tile or door for half a second** to arrange: pulled, it comes away under the pointer and the others make room; let go on another, they swap; × puts a tile away, the dashed tile brings one back; Done or Escape ends it. Nothing shakes. The layout is the device's.

### Settings

- **General**: Display (Theme, Language: the one Panki speaks, English alone for now), General (when the day starts, 4:00 to begin with; the account's Time zone; the Learning language), Reviews (above), Subtitles on cards (how a clip's subtitles look on cards).
- **Keybinds**: Enabled (Off on a phone to begin with), every key of a review and the players, each a press, a hold or a double press, Ctrl or Alt combinations allowed, Shift, Ctrl and Alt alone too; the Hold button's panel; A, S, D, F… playing each sound and clip on a card. Kept on the device, and the tab says so once.
- **Panki AI**: below.
- **Extension**: Download (a zip, with the update scripts), and Data tracking: what Video tracking records and every extension signed in with its switch (read-only here) and when it last sent.
- **Account**: who's signed in, every signed-in device ("Firefox on Windows") with Sign out, Sign out everywhere, Watch history with Forget my watch history….

Whatever is kept on the device carries a quiet "This device" tag.

### The extension on YouTube

A browser extension for the PC, Chrome and Firefox from one build, handed out by Panki itself: Settings → Extension → Download, and when Panki has a newer build the extension says so and **Update Panki** in its folder fetches it. Signed in from its own page, it's one more device in Panki's list. Its page has four tabs: **Word pop-up**, **Decks** (Default deck, Field mapping), **YouTube** and **About** (the account, the profiles, the version). **Panki on / off**, in YouTube's header pill and on its page, switches all of it off in this browser.

**The Panki panel** sits on a video's watch page. Its head is the name, the Transcription status, and ≡ opening one menu whose rows change in place: Subtitles (Panki, YouTube or None; kept for the next video) and Subtitle style…, View, Open Panki, Extension settings. **Beside the video** (the default) puts the whole transcript in the page's right column above the recommendations, the line being said lit and followed, a time pressed to go there, a word pressed to pick it for a card. **Under the player** is two full-width rows of what's being said, filling from the left and rolling up, the words being said underlined, the last lines staying after a silence. **One full screen**: with Panki and the panel on, YouTube's own full screen (F, its button, a double-click) fills the screen with the video and the panel at the right; the **Toggle panel keybind** (P to begin with), Hide panel on the head, or a round button in the video's top-right corner hide and show it, remembered in the browser, hidden to begin with. Leaving full screen puts the page back as it was.

**Panki subtitles.** Panki transcribes a video with ElevenLabs Scribe v2 through its server, and its transcript replaces YouTube's captions under the player and over the video, never falling back to them. One transcript per video, for everyone: whoever plays it first pays once. The **Transcription** menu's button is the status itself (a dot and a word: Transcribing, Standing by, Transcribed, Not transcribing, or what's wrong) with Details and a Log; its menu has three parts, **Panki AI** (Proofread, below), **Transcript** (Transcribe the entire video in Full, Transcribe in Live and Hybrid, or Stop; Re-transcribe a part…; Forget the transcript…; Edit the transcript) and **Settings** (Mode, Starts by itself).

The **modes**, each viewer's pick of those an admin allows: **Full** (the entire video in one call on the server), **Live** (chunks as you watch, from a silent second player running ahead, cut where nobody speaks) and **Hybrid** (chunks at once, replaced by the entire video when it's in). A download that fails falls back to chunks. Over the **length limit** (30 min) an admin's choice is Allowed, Not allowed or Warn first, which asks with the estimated cost. The latest transcript wins.

**Editing the transcript**: Edit the transcript pauses the video and opens the panel as an editor, each line typed into directly, the keys moving, splitting, merging and playing lines, the line in use with its tools (nudge its ends, Proofread this line, Delete). Or double-click a word over the video to edit that line in place. A line is kept as it's left; a fix is everyone's, the engine's word kept beside it. How far the transcript reaches is a thin yellow line on the seek bar.

**The capture drawer.** Press a word in the panel (or a second beside it for both) and the drawer opens over the panel; on any page, select text and Add to Panki from the right-click menu or the toolbar button, and it opens at the window's side. From the top: **Add**; the card's Panki AI conversation; **the clip**, a bar with an end to pull at each side (Alt snaps to words) and its own edges pulled for more room, Play / Pause looping it on the video, the times typed over by a double-click, marked on the seek bar in blue; **the deck**, a dropdown with none chosen until the owner picks one, the default from then on; **the card's fields**, mapped ones filled and the rest typed; **the word's own stretch**, a bar inside the clip, when the deck takes the word's audio or video; **the sentence**, typed in directly, following the clip until Locked, the word lit in it; and **the card as a review will show it**, pressed to turn. Add records the clip off the player and folds into "Added to [deck]"; × closes it, asking nothing.

**Field mapping**, on the Decks tab, per deck, off until switched on (a deck that's off adds nothing): each of the deck's fields and what fills it, every source listed and the ones that can't go there greyed, None to begin with: Selected word, Sentence, Sentence video, Sentence audio, Word video, Word audio, Word audio (Forvo), Link to the video, the dictionary's Dictionary form, Reading, Meaning, Tags, Word type, Frequency and Pitch accent, and Panki AI's Explanation and Example sentences. **Word audio (Forvo)** gives the word said by a person: the best rated, a dropdown of who else said it, credited to Forvo; each recording becomes the account's file, and a word is asked of Forvo once ever, for everyone.

**The Word pop-up**: hold the **Key to hold** (Shift, Ctrl, Alt, or On hover after a **Hover delay**, 300 ms to begin with) and point at a Japanese word, on YouTube, its captions, Panki's subtitles or any page **Where** allows (every site, only these, all but these, nowhere). Let go on the word, or click it, and it stays until a click elsewhere or Escape. It shows every word found there as chips, longest first, then the word's reading, pitch, tags, frequency, conjugation, each dictionary's meanings, "already in Mining" with Open in Panki, its Panki AI conversation, and **Add**, opening the drawer on it. Panki subtitles are split into whole words by the dictionaries, a chip pressed to split differently. Each setting is paired, globally and in Panki subtitles.
- **Dictionaries** are the owner's term-bank zips (JMdict, Jitendex, frequency lists, pitch accents), imported into this browser, ordered, switched, renamed locally, or added from those an admin keeps on Panki. Each says what it **provides** in the kinds Panki reads (Dictionary form, Reading, Meaning, Tags, Word type, Frequency, Pitch accent), with counts read from its rows; **Panki reads** says which dictionaries provide each, so an empty part of the pop-up says why.
- **Word pop-up layout** is the pop-up itself laid out as a card's Layout is: each part shown, hidden, folded or placed, tried live by pointing at sample sentences.
- **Words that are in your decks**: tinted globally and in Panki subtitles (each On / Off), by stage colour or a custom one, flagged and suspended in their own colours.

**Seek bar marks**, each with its visibility, colour (stage's or custom) and thickness on the YouTube tab: **Cards made from this video**, each card's clip with its word on a glass pin (On hover, Always, Hidden; an animation; pressed to go to the sentence or the word); **Words that are in your decks**, a tick where each is said; flagged cards; the transcript's reach; **Where you stopped**, a white tag.

**Watching.** With **Video tracking** on (each browser's own, Off to begin with), Panki keeps time watched and where you stopped, for the account alone. Opening a video again offers **Continue from 12:34** in the player's corner (or jumps there). A video played into its last 20 seconds is **Finished**, a flag shown on the player bar as **Watching · 94%** turning **Finished**, pressed to say the other.

**The player bar.** **Custom player bar**, On to begin with, lays out YouTube's controls and Panki's, Left and Right, each Shown or Hidden, on a preview: Panki's **Watching** chip, **Save for later**, **Subtitles** (off, or back to the ones last shown, Panki's or YouTube's; its key C, **Toggle subtitles keybind** under Panki panel, takes YouTube's own), the **speed button** (the eight speeds in a row), the **video end time** ("Ends 21:47" on the computer's clock, at the speed played), with YouTube's Captions button hidden to begin with; and Keep the bar visible in or out of full screen, the bar still ticking. **YouTube utilities**: Shorts Shown / Hidden, Short skip on Shift, Ctrl or Alt with ← →.

**YouTube home add-ons**, Panki laid into YouTube in its own shapes and colours: the **header pill** (the mark, the numbers you pick, Panki's switch); **Continue watching** (the last video big with Resume, the others as YouTube's own cards, 4, 8 or 12); **Saved for later** (a save button on any thumbnail, kept on the Panki account); **Recently watched** (finished videos); and marks on thumbnails. Then YouTube's own feed.

### Panki AI

One AI, marked by one spark, in three **places**, each a **conversation**: the **Word pop-up** (about a word in its sentence), the **Card drawer** (about the card being made) and the **Transcript** (Proofread). Off until an admin switches it on.

**A conversation** has User instructions quiet at its top, then each message and Panki AI's reply, "Changed:" chips (pressed, they go to the part), and the composer at its foot: "Ask anything about this word / card", the **Actions** dropdown ticking several, the most it can cost ("Up to $0.0006 (est.)"), and **Send**. A message is typed words, ticked actions, or both; one message is one call, carrying the conversation so far; nothing is kept once the pop-up or drawer closes. The default actions are ticked as a conversation opens and every ticked action clears after a send. A message over the account's threshold asks first. The **Conversation settings** fold holds **Video context length** (how much of the video's subtitles Panki AI hears, 1 min to begin with, for this message and every one after) and **Clear conversation**. Details under the status say what was sent, why, the tokens and the cost, with a Log and Copy.

**In the Word pop-up**, **Explain** (the default) says what the word means in this sentence and its nuance, in English, guiding and never translating the sentence whole, and judges every dictionary meaning where it stands: **Fits** lit green, **Close** orange, **Doesn't fit** red and struck through, each with a why; when none fits, a meaning of its own, numbered after the dictionary's. Grammar, Conjugation and Nuance answer in words alone. On a video it's told the title, channel, description and the subtitles around the moment.

**In the Card drawer**, **Touch up** (the default) looks the card over and, under each field it judged, ties a proposal: **Nothing to change** in green; **Could be better** or **Incorrect**, the field's words struck and the proposal under them; **Panki AI proposes** for an empty field; or that it couldn't decide without more context. The Meaning is judged meaning by meaning (the dictionary's and any custom ones), the field read as a diff; the Sentence is cut to the part about the word or given the line it leans on, never reworded, and accepting it moves the clip to those words; the Reading, Dictionary form and Pitch accent are checked; **Explanation** and **Example sentences** are written into the fields mapped to them. Every proposal is **Accept** or **Dismiss**, with Accept all / Dismiss all; nothing is written by itself. Under Touch up in the Actions menu stand its per-field actions (Touch up the Meaning, the Sentence…); Explain, Grammar, Conjugation and Nuance work on a card too. A field it judged has its own **Ask a follow-up**.

**What it writes stays marked**: a value Panki AI wrote is in its ink, with the spark once in the card's corner, on its row and before a field's name where a field is its own; edited by hand it stays Panki AI's until **Unmark as Panki AI's**. A dictionary meaning accepted stays the dictionary's. Duplicates compare only true values.

**Settings → Panki AI** holds **User instructions** (the account's standing words, in every prompt where the admin's prompt places them), **Ask before a message is over**, **Show the cost when a message is over**, and a panel per place. The Word pop-up's and Card drawer's list their **actions** in the composer's order, dragged to reorder, Panki's own quieter with a lock: each a Name, its Words, Default, **Requires** (parts that must come back), **Leave out** (parts that must not) and **Video context length**. A message whose answer breaks a ticked action's Requires or Leave out fails whole, with Try again. Panki's can be changed or deleted, and brought back from **Restore Panki's actions…**. The Transcript's panel holds Proofread's templates. A (?) beside each panel plays it at work.

**Proofread**, in the Transcription menu's Panki AI part: **Proofread the entire video**, **Proofread a part…** or a line's own **Proofread this line**, each with its cost. It puts right what the engine misheard (the wrong kanji for the sound, an unknown name) and its edits go in by themselves, each changed word lit with a small spark, **Undo all** while they stand, and **Undo Panki AI's edit** on a word in the editor. Whichever comes later wins: a re-transcription, the entire video, a hand edit or a proofread; it changes a person's edit only when sure.

**The admin's side**, Admin → Panki AI: On / Off, the Provider (Anthropic, OpenAI or Google) and Model with their listed prices, the key; the **prompt** for the Word pop-up and the Card drawer, with Prompt context (every variable Panki fills, with its source) and Panki's answer format; **Limits** (request length, answer lengths, Max messages, Max message length, video description length); and **Usage**. Every dollar shown says "(est.)": it's worked out from listed prices.

### Accounts and admin

Panki asks for a name and password once per device and then remembers it for ten years; nothing shows before signing in. **Every account is a whole Panki**: its own decks, types, settings and history. What an account can't own alone is the shared store: the service keys, the dictionaries kept on Panki, the transcription settings, the transcripts, Forvo's recordings. Accounts are made, renamed and made admin from the terminal only.

**Admin** is a screen of its own, for an admin alone, in tabs: **Transcription** (the modes compared and the default, the length limit, chunks, speed, lead, the ElevenLabs key and its credits), **Word audio** (Forvo's key, the day's requests out of 500), **Panki AI** (above), **Dictionaries** (zips for everyone to add from the extension) and **Storage** (each account's files, what's shared, the disk). Each paid service has **Usage** per account and in all, over This month, Last 30 days or All time. A key is typed once and kept under a spoiler, or set in the server's environment.

## Deliberate scope decisions

Kept as chosen; never simplified, widened or "made consistent" later.

- No Anki import, no history carry-over, no Anki compatibility.
- Android only for the phone; no iPhone work. No extension on the phone.
- Review is one deck at a time; with several decks, Review lists a bar per deck.
- Delete hides, never destroys: decks, cards, types, fields, examples; a deleted card is out of everything but the answers it was given. Renames keep the old names. No restore in the app until asked.
- A deck's card type and SRS type are set when it's made. Changing the type itself is how a deck's cards change shape.
- Nothing to set per field about the language.
- A clip or a sound is one kind of field, Media; what it is, is the file's own to say. Video or audio is chosen in the field mapping, never in the drawer.
- Nothing on a card plays by itself unless its layout says so.
- A card stores only its answers; its due date is derived live.
- The SRS speaks plain words.
- New is every type's own place before its first stage; once out, only a New again step takes a card back.
- Reaching a stage ends the card for this sitting; only Ask again right away keeps it in.
- Burned is a row of the Stages list; a stage's wait is set on its box on the chart; scrolling zooms and the ground pans; removing a stage with cards on it asks where they go.
- A miss is the first main answer; set-apart answers count as neither.
- How reviews run is the account's; only New cards a day, Max reviews a day and the Hold button's answer are a deck's.
- Stats is fixed; the home is the one you arrange, by holding a tile and only that way: no Customize button, no tray, no sizes, no pins, a drop is a swap, nothing shakes. The layout is per device.
- Accounts are made from the terminal, password on the command line.
- The capture panel is a side drawer, and its card preview is the app's own review card, one card that turns, never a front and back side by side, never with answers.
- A clip's end goes where it's put; Alt held snaps to words. The clip's bar never rescales by itself. Nothing the drawer plays stops part-way through the clip.
- No deck is chosen for you in the extension; one picked on purpose is the default.
- Nothing about a deck's fields is guessed: every field starts on None, and a deck's field mapping is switched on before anything is added to it.
- In the extension a deck is chosen from a dropdown.
- Taken out of the extension and not to come back as a convenience: a capture shortcut key, a ready-made card type, the "Adding" notes, where-it-came-from as a line of text.
- The dictionary is Panki's own, in the extension, reading the term-bank format; nothing in it goes online but Panki. Where it works is a setting, never a guess. Not the tool it resembles, nor its name.
- Panki's own player stays; the browser's is the Plain style beside it.
- A card's layout is edited on the card itself; a field's side lives in the layout alone; a type's layout is the same for every deck using it.
- Word audio from people comes from Forvo alone, through Panki's server, every recording kept for everyone. The word cut from the video stays a choice beside it.
- One transcript per video, for everyone; a video's transcript is always named as Panki's.
- With Panki subtitles picked, YouTube's own captions never show, not even as a fallback.
- No goal and no streak for watching. Nothing about other people for now.
- Video tracking is each browser's own, changed in that browser's extension alone.
- The Saved for later shelf is Panki's, never YouTube's Watch later.
- Panki AI is one AI, marked by one spark, the same in every place: one conversation, one composer, one answer shape per place, one judgement. No video to the model, only text.
- The prompt is the admin's; an account steers with User instructions and actions, never the raw prompt.
- What Panki AI writes lands on a card only when accepted; Proofread's edits alone go in by themselves, each undoable.
- How much of the video Panki AI hears is the owner's to set, never Panki's to offer.
