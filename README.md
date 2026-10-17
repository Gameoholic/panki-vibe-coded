# Panki

A flashcard app for Japanese vocabulary, built one step at a time. "Pirated Anki": the owner keeps WaniKani for kanji and replaces Anki with this. Used on a Windows PC and an Android phone's browser; will run from a small VPS.

## Where it is

**Step 1 (built):** add a card, flip through them. No scheduling.
**Step 2 (built):** decks. Create one, add cards into it, review it.
**Step 3 (built):** the icon (パ, white on indigo) and the opening moment that plays once when the app loads.
**Step 4 (built):** getting around: a home with three doors (Review, Decks, Add a card), Home and Settings tabs, Review asks which deck, Add a card picks the deck in the form.
**Step 5 (built):** a deck's settings: inside a deck, Cards and Settings tabs; rename, and delete that asks once and hides rather than destroys. A settings button on each deck row.
**Step 6 (built):** card types: what fields a card has (name, Front or Back, required), a fourth door on the home, every deck made with one; the cards before this live on as the starter type "Word". No login yet.
**Step 7 (built):** a field's kind: Text (one line) or Paragraph (several; Enter makes a new line, Ctrl+Enter adds the card), audio and video later. Required is a switch; fields are reordered by dragging their grip.
**Step 8 (built):** the SRS: SRS types (a ladder of stages with waits, two to four answers, the rules as a chart you edit, Burned or not; three starters, every deck from before on WaniKani-like), a review that shows what's due and new and moves the card by your answer, and the Settings tab (new cards a day, reviews at most, what comes first, the small print).
**Steps 9 to 13 (built):** the silo (every sitting, every card shown with its seconds, every answer, every screen visited, kept for good), signing in (accounts from the terminal, a ten-year cookie, every account a whole Panki of its own, signed-in devices at the bottom of Settings), the Review door blue only with something to do, the Stats tab (all decks or one; streak, heat map, reviews, right, ladder, coming up, days, added, time, toughest cards), and the home's own tiles, dragged into order per device.
**Step 14 (built):** themes: Match the device, Light, Dark, Nord, Tokyo Night, One Dark, Gruvbox, Solarized Light and Dark, Monokai, picked at the top of Settings, kept per device.
**Step 15 (built, not yet tried by the owner):** media on cards: a field's kind can be Audio, Video or Image; the add form takes a file for it, and the card, the list and the review show or play it with Panki's own player. The files live beside the account's database. The first of the extension's five steps.
**Steps 16 and 17 (built; first tried by the owner on 2026-10-11: a card added from YouTube, the clip's upload fixed after that try):** the browser extension, `apps/extension`. On a YouTube video the line being spoken stands under the player as words to press; on any page a selection is added from the right-click menu; Alt+P does either. One panel, Panki's own: the deck, the word, its reading and meaning, the sentence, Add. On a video the line's clip is recorded off the player and joins its card. Which field takes what is set once per deck on the extension's own page.

**Step 18 (built, not yet seen by the owner):** changing and deleting a card: an edit button on every row of a deck's Cards tab opens the card in place, with Save, Cancel and a Delete that asks first. A deleted card is hidden, never destroyed.

**The polish round, so far (2026-10-11):** the line under the player became two full-width rows, and the capture panel became a **side drawer** (built from the direction the owner picked, not yet seen by them): beside the video, the card shown as the app's own review card that turns over when pressed, the sentence typed in directly with the word lit in it (double-click a word to pick it), the clip as a bar with two ends to pull (exactly where they're put; stopping at words is a switch on the extension's own page) that keeps still and whose own edges are pulled for more room, its two times typed over by a double-click, played on the video itself to hear it. Then its order from the top: the clip, the deck, the word and the rest, the sentence, the card, Add. And a sixth kind of field, **YouTube link** (not yet seen): a chip on the card that opens the video at its moment; from the extension it takes the place of the Source, a link to where the clip begins. Later the same day (not yet seen): Audio and Video became one kind of field, **Media**; the extension's page became Settings (default deck, snap to words) and **Field mapping** (each field of the deck, and what fills it); no deck is chosen until you choose one; every field nothing fills is typed in the drawer; a new thing to fill a field with, **Word audio**, the picked word's own sound; and Alt+P, the ready-made card type and the "Adding" notes are gone.

**AI subtitles (built 2026-10-17, not yet seen by the owner):** on a YouTube video the extension plays the video a second time, unseen and unheard, a few times faster, a little ahead of you, and sends what's said to ElevenLabs Scribe v2 through Panki's server, a sentence or so at a time; the line under the player reads the transcript wherever Panki has caught up (a tag says Transcript or YouTube captions), the line being said stands over the video too, a word heard wrong is fixed by a double-click, and one transcript per video serves everyone. The settings are global, in Settings → Admin, and an admin alone changes them, the keys and the dictionaries kept on Panki (`pnpm user:admin <name>`); the Forvo key and the dictionaries moved from each account to the shared store that day.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies. |
| `pnpm dev` | Run the web (http://127.0.0.1:5173) and the API (127.0.0.1:3001). |
| `pnpm build` | Build the web and the extension (`apps/extension/dist`). |
| `pnpm typecheck` | Type-check everything. |
| `pnpm user:add <name> <password>` | Make an account. Stop `pnpm dev` first. The first account takes the data from before accounts. |
| `pnpm user:password <name> <new>` | Change a password. Signs every device out. |
| `pnpm user:list` | List accounts. |
| `pnpm user:admin <name>` | Make an account an admin: it alone changes the keys, the dictionaries on Panki and how transcribing runs. `pnpm user:admin <name> off` takes it back. |
| `pnpm space` | Disk used per account (video, audio, images, the rest) and what's left on the disk. |
| `pnpm icons` | Redraw the app icons from the mark. |
| `pnpm verify` | Headless-browser check of the UI. Not kept up since 2026-10-10. |

Under 2 GB left on the disk, every signed-in user sees a warning on their home screen. `PANKI_LOW_SPACE_MB` changes the 2 GB.

## Deploying

To pull and update changes:
```
cd /opt/panki-vibe-coded
git pull
pnpm install
pnpm build
pm2 restart panki-api
```

The API is `pm2 start pnpm --name panki-api -- --filter @panki/api start`, with `PORT` and `PANKI_TIME_ZONE` set for it; nginx serves `apps/web/dist` and proxies `/api/` to that port (`client_max_body_size 200m`, `proxy_read_timeout 180s`, `X-Forwarded-Proto`). Node 22.13 or newer.

## The extension

`pnpm build` builds it with everything else, into `apps/extension/dist/chrome` and `apps/extension/dist/firefox`. It is never deployed: it lives in your browser.

1. **Chrome:** open `chrome://extensions`, switch on Developer mode, press Load unpacked, choose `apps/extension/dist/chrome`. It stays until you remove it. After a rebuild, press the reload arrow on its card, then reload any YouTube tab that was already open.
2. **Firefox:** open `about:debugging#/runtime/this-firefox`, press Load Temporary Add-on, choose `apps/extension/dist/firefox/manifest.json`. Firefox forgets it when it closes; keeping it needs Mozilla's signature, which hasn't been asked for.
3. Its own page opens the first time (later: right-click its toolbar button, Options). Type where your Panki is (`127.0.0.1:5173` while `pnpm dev` runs), your name and password, and allow the address when the browser asks.
4. On that page, under Field mapping, choose a deck and what fills each of its fields: the selected word, its dictionary form, reading and meaning, the sentence, the sentence's video or audio, the word's video or audio, the link to the video. Switch Field mapping on for the deck first. Fields left on None are typed in the drawer.
5. Under Dictionaries, import a dictionary: a zip in Yomitan's format (JMdict, Jitendex, a frequency list, pitch accents). Under Looking up words, choose where it works; for sites other than YouTube, press Allow when the browser asks.
6. Open a YouTube video with captions on and press a word in the line under the player: the drawer opens beside the video. Or select something on any page, right-click, Add to Panki. The first time, the drawer asks which deck; it remembers.
7. Hold Shift and point at a Japanese word, on YouTube or any allowed page: the popup shows what it means. Let go of Shift on the word to keep it open; Add opens the drawer on it.

**The local dev account** (testing only, never on the VPS): name `daniel`, password `danieldaniel123`. Made with `pnpm user:add daniel danieldaniel123` on 2026-10-10; it holds the data from before accounts. Its "Test" deck is test data written by Claude at the owner's ask (148 cards as of 2026-10-11: a word, its meaning, an example sentence on the front and the sentence's translation on the back), not checked against a dictionary; nothing in it is for real study.

Data lives under `apps/api/data/`: `auth.sqlite` (accounts and signed-in devices), `shared.sqlite` (what everyone shares: the keys, the dictionaries kept on Panki, the transcription settings and every transcript) with `shared/dictionaries/` holding the dictionary zips, and `users/<account id>/`, one folder per account: its `panki.sqlite` and a `media` folder with the files its cards hold. A backup is the whole folder. `PANKI_DATA_DIR` puts it elsewhere, `PORT` moves the API, `PANKI_WEB_PORT` / `PANKI_API_PORT` move the web dev server and its proxy target, `PANKI_TIME_ZONE` sets whose clock a day turns over on (default: the machine's), `PANKI_FORVO_KEY` is a Forvo key for word audio and `PANKI_ELEVENLABS_KEY` an ElevenLabs key for transcribing, each used when none is typed in Settings. Deployed, nginx with HTTPS sits in front (the sign-in cookie is `Secure` whenever the request came over HTTPS).

## Backlog

What the owner wants next. Nothing here is scheduled; the owner picks the next step.

- **Polish the extension** (the owner, 2026-10-11, after trying it: "it's better to polish the current version first, then do the Yomitan thing"). Steps 15 to 19 are built (media on cards, the extension, the clip, changing and deleting a card, the dictionary); the owner sends what's off, a change at a time.
- **The capture drawer, to be tried** (the owner, 2026-10-11: "ok implement this"). Built from the side drawer they picked of seven directions (the mock it was built from: https://claude.ai/artifact/3ZJgVmsFM3iHXPtJiZTpGd). The owner tries it and says what's off. Left out of the mock's extras: the clip marked on the video's own seek bar.
- **The dictionary, to be tried** (step 19, built 2026-10-14 at the owner's "you can just execute"; plan page: https://claude.ai/artifact/AFFKBGU2YrgEgPpa8T31hR). Panki's own, in the extension, reading Yomitan-format files: the Shift popup anywhere, the line under a video split into whole words, the drawer filling the dictionary form, reading and meaning. The owner imports their files and says what's off.
- **Dictionary, later** (left out on the plan page, each the owner's to ask for): a kanji's own popup, a mark on words already in a deck, the dictionary in Panki itself for the phone. A recording of the word from the internet is out unless the owner says otherwise (someone else's server).
- **Cards, later.** Bringing a deleted card back. Deleting several at once.
- **Extension, later.** The line shown over a video that fills the screen. Chrome's tab recording as a second way to get the clip, if recording off the player fails somewhere. A subtitle file dropped on a video that has none. Netflix and other players. Showing a card's source in Panki (it's kept already). Mozilla's signature so Firefox keeps the extension.
- **FSRS.** A second kind of SRS type beside the ladder: no stages, each card's next wait worked out from its own history (stability, difficulty), with a "remember 90%" target. Use the open-source library (`ts-fsrs`, from the people who wrote FSRS) rather than writing the formulas here. The owner, 2026-10-10: "keep it on the todo for later, including using the open source library." The algorithm: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
- **Forvo.** Human recordings of single words for cards that have no audio clip. Forvo's API, non-commercial plan, about $2 a month.
- **AI subtitles, to be tried** (the owner, 2026-10-16: "YouTube's subtitles are kinda wack and I can't rely on them… AI is so good at transcribing"; built 2026-10-17 at "ok implement everything", not yet seen). Plan page: https://claude.ai/artifact/BBF5C1CspjnqDTrk2SV2GW. Playable mock: https://claude.ai/artifact/JSnD4yaMRzqBXZNQG4b8V6. The owner makes their account an admin (`pnpm user:admin daniel`), pastes the ElevenLabs key in Settings → Admin, reloads the extension and plays a Japanese video. The ElevenLabs account (plan, credits, pay-as-you-go) and the day's Forvo requests stand under their keys in Admin since the same day.

Everything else that was discussed (decks, scheduling, streak and stats, media on cards, share-to-Panki from the phone, login and deploy) is on the plan page above and comes in only when the owner asks for it.
