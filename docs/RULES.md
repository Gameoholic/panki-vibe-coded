# Automations — the plan

> Automations (rules in the code: `Rule`, `Settings.rules`, `rule_runs`), the Panki AI epic's next step (`docs/AI.md` → The order), planned on its own since it reaches transcribing and downloads too: why, what's settled, the order (ticked as steps land), what's open. Everything marked **Proposal** is Claude's default, written without asking (the owner, 2026-11-15: "start the plan without asking me questions"), each the owner's to overturn.

## Why

The owner's words, not concrete:
- **Automation is rules**, configured per card, video or pop-up with a cost cap, never assumed (`AI.md` → Settled).
- Proofread's automation lives here: when a transcription finishes, a part comes in, or after every chunk.
- Transcribing's own (starting by itself, the length limit) moves from the admin to each account.
- Downloading a video for offline viewing joins them, beside transcribing.

## Settled

- **The name is Automations** (the owner, 2026-11-15): Settings → Automations, an automation, New automation, on every screen and in every doc; the code keeps its word, rule.
- **Every automatic thing is an automation** (the owner): Panki does nothing by itself that isn't one on the list. What runs by itself today (transcribing's Starts by itself) becomes an automation like any other, On by default, turned off or changed in the list like the rest.
- **Proposal: "automatic" means a paid or heavy run** (transcribing, Panki AI, a download). Small things the app already does by itself (a finished video leaving Saved for later, the drawer filling the Sentence) stay as they are unless the owner wants them as automations too.
- **Every automation has a cap** (the owner): the account's daily one (below), and a video's length or a download's size where it has them.
- **Two ways to transcribe, Hybrid gone** (the owner, 2026-11-15): **Start transcribing** (follows you as you watch, today's chunks; Live in the code) and **Transcribe the entire video in the background** (today's download; Full in the code). Hybrid was both at once, so nothing is lost. The strip's Transcription menu offers the two as actions by those names (never "order", the owner), with no Mode setting; the admin's mode default and switches go.
- **One name per way, the menu's, on every screen** (the owner, 2026-11-15): as an automation's Do the same words, and after its comma in the sentence ("When a video (up to 30 min) plays, start transcribing"); "Live", "Full", "Transcribe live" never on screen (`docs/conventions/in-app-text.md`).
- **Two transcribe automations in place of one** (the owner): Start transcribing on every video opened, and Transcribe the entire video in the background once the video has been watched past a threshold (20 s to begin with). No Mode knob on either. **One trigger, an optional wait** (the owner, 2026-11-15): "a video plays" may wait "only after N s watched" (the owner's words: "Only after") ("When a video (up to 30 min) plays, only after 20 s watched, transcribe the entire video in the background"); Start transcribing has none to begin with. A saved "a video has been watched" reads as "a video plays" with its seconds, nothing rewritten. **Proposal: the threshold counts the video's total watch time** (what Video tracking keeps for it), this visit's alone where tracking is off: the point is "I'm really watching this", and a video come back to has shown it already. The entire video is $0.22 an hour (ElevenLabs Scribe v2's listed price), so the threshold is about videos clicked and left, not the cost of one.
- **Optional means optional** (the owner, 2026-11-16): an automation without a length limit, a size limit or a wait simply doesn't have one; the editor adds each with a small control and takes it off again, never a number box reading "No limit", "At once" or "0 s". Without limits the sentence leaves the brackets out ("When a video plays, start transcribing"); the admin's length limit still holds transcribing whatever an automation says.
- **An automation is When → Do**, with what it has. When: one trigger from a registry (`RULE_TRIGGERS`). Do: one action from a registry (`RULE_ACTIONS`): Start transcribing, Transcribe the entire video in the background, Proofread, Download, Ask Panki AI (one of a Panki AI place's actions, named after a colon). One registry each, one name on every screen, as every family of data in Panki has.
- **The pop-up and the drawer have actions, not Explain and Touch up** (the owner, 2026-11-16): an automation on the Word pop-up or the Card drawer asks Panki AI for one of that place's actions, picked from the account's actions for it, the place's default to begin with; no "words" condition. **Its Do is "Ask Panki AI"** (the owner, 2026-11-16, never "Send"), the action asked after a colon so a verb or a noun reads ("When the Word pop-up opens, ask Panki AI: Explain", "When the Card drawer opens, ask Panki AI: Touch up"); "Ask Panki AI" stays the editor's Do choice and the sentence's words alone: **an automation's title** (its node in the flow) **is the action's own name, Panki AI's spark before it** ("✦ Explain", "✦ Touch up", "✦ Grammar"; the owner), never "Ask Panki AI: Explain". The drawer's runs **as the drawer opens** ("the Card drawer opens", its name in the app), not once a card is added: its answer shows in the drawer as a press of Send's does, its proposals there to Accept or Dismiss, nothing waiting on a saved card.
- **"A transcript is finished"** (the owner), never "whole".
- **Proposal: the account's, on the server.** Automations belong to the account, not the browser, so Firefox, Chrome and the phone all follow the same ones; the extension keeps a copy as it keeps the rest of Panki's (`architecture/kept.md`).
- **Settings → Automations is "A Flow"** (the owner, 2026-11-16, from the page of ways): triggers as nodes at the left, each automation a node at the right joined to its trigger by a line, its editor opening in place, New automation from a trigger. The flow itself is the tab, unnamed (the owner). **No History and no last-run line** (the owner, 2026-11-16): the "Last ran … · $… today" line under each automation and its Last runs switch went first, then History, a window's runs and spend behind a button ("we don't need history at all"); the head holds the cap and today's spend alone.
- **One daily cap for the account, no per-automation dollar caps for now** (the owner, 2026-11-15): **Max spend for automations** (its name, the owner, 2026-11-16), $5.00 a day, over every automation that costs dollars, is the only dollar limit; past it an automation stops for that day and says so; it never asks, since it runs when nobody's looking. Dollars are estimates from listed prices, "(est.)" as everywhere. The limits on what an automation runs on stay, in brackets inside When ("When a video (up to 60 min, 1,000 MB) is saved for later, download it"). An automation saved with dollar caps of its own keeps them, read by nothing.
- **The editor's When and Do always open** (the owner): When lists every trigger; Do only the actions the When leads to, in the registry's order (the rest left out, not greyed), and still opens with one; never the whole dropdown greyed.
- **Downloading On / Off, per device** (the owner, 2026-11-16): on the extension's Downloads tab, On to begin with; Off, nothing downloads in that browser, by hand or by automation.
- **Proposal: a run by an automation is like a run by hand.** The same call, the same failure wording, the same usage row (its `what` the place), the same Details. What Panki AI writes still waits to be accepted; an automation never accepts for the owner. Proofread's edits land by themselves as they already do, undoable.
- **Proposal: each automation says what it did** in the Log where it ran, a run that failed or hit a cap included; today's spend over them all stands under the cap.
- **Proposal: run where the trigger happens.** A trigger the server sees (a transcription finished, a chunk's words in, a part transcribed again) runs on the server, so it works with no page open; one the page sees (a video playing, a video saved, the Card drawer or the Word pop-up opening) runs in the extension, asking the server first, which holds every cap.
- **Built so (Claude's readings, each the owner's to overturn):**
  - A transcript is finished when it's transcribed whole in the background, or its chunks cover the video end to end by the length the account's watching knows; that automation runs once a video, whatever its run came to (a cap reached included).
  - "After every chunk" proofreads the lines with a word in that chunk; a line running on into the next chunk is proofread again with it. "A part comes in" is a part transcribed again (Re-transcribe a part).
  - An automation's runs are rows of their own (`rule_runs`), each with its cost; the usage ledger's row stays the place's, as by hand.
  - Transcribing's automations hold the video's length to their own minutes and the admin's length limit, and their day to the video's whole cost at the engine's listed price, counted as each starts (Start transcribing's at the whole video's too, its most). A press is never held to the length limit, the whole video included: Warn first's question is gone.
  - An account that saved its automations before Transcribe the entire video in the background existed gets it added once, On (migration 58); a kept "hybrid" anywhere (the admin's default, a browser's pick, an automation's mode) is read as nothing, nothing rewritten.
  - A saved Touch up or Explain automation reads as the drawer's or the pop-up's Ask Panki AI with the place's default action, its trigger the drawer opening; its "words" are read by nothing. `card_proposals` (migration 57) stays as it is, read by nothing.
  - Download's automation runs only in the browser that saved the video (downloads are each browser's own), so Firefox and Chrome don't both download it. A download costs no dollars, so it's held to its minutes and MB alone, not the daily cap.

## The order

Steps 1 to 8 are built and on main, pushed 2026-11-16 (e6713d4); the owner tries them on prod at their own pace. The open questions below are built as their proposed defaults. How they're built: `architecture/rules.md`.

- [x] 1. **Automations themselves and Proofread when a transcript is finished**: the registries, the automations on the server and in the extension's copy, Settings → Automations with the list and the editor, the caps, the row's last run and spend.
- [x] 2. **Proofread as the transcript grows**: the triggers "a part comes in" and "after every chunk", Proofreading only the new lines.
- [x] 3. **Transcribing's start as an automation**, On by default, in place of this browser's Starts by itself and the admin's download limit (Allowed / Not allowed / Warn first); the admin keeps the engine, the key, the prices and a ceiling no automation passes.
- [x] 4. **Download as an automation**: "When a video is saved for later, download it", up to a length and a size.
- [x] 5. **The Card drawer's action** as an automation (first built as Touch up once a card was added; now as the drawer opens, step 8).
- [x] 6. **The Word pop-up's action** as an automation (first built as Explain for chosen words; now any of its actions, step 8).
- [x] 7. **Two ways to transcribe**: Hybrid and the Mode setting gone; the menu's two actions; Start transcribing (every video) and Transcribe the entire video in the background (past N s watched), each named as the menu names it; the name Automations on every screen.
- [x] 8. **A Flow and the owner's round of 2026-11-16**: Settings → Automations as a flow with its history; the standing line Hidden to begin with (since taken off); a transcript is finished; Ask Panki AI for one of the place's actions on the drawer and the pop-up, the drawer's as it opens; optional means optional; Downloading On / Off per device.
- [ ] Later: the outro found by the AI, as an automation run once the transcript is finished (`AI.md` → The order).

## Open

Each built as its proposal, for the owner to keep or overturn once they've tried it:
- **Download's trigger**: Saved for later, in the browser that saved it.
- **An automation that failed**: said in the Log where it ran.
- **Automations or Credits**: transcribing's move to each account is Automations (step 3); Credits pay for it later.
