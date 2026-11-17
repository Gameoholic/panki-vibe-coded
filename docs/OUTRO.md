# Video end, found by Panki AI — the plan

> Where a video's own content ends, found by Panki AI from its transcript, so it counts as finished from there (`docs/AI.md` → The order). Why, what's settled, the order (ticked as steps land), what's open. **Proposal** marks Claude's default, the owner's to overturn.
## Why

The owner's words, not concrete:
- The 20 s window is wrong: a video should count as finished only when it really ends, or where Panki AI finds it ends: the credits, the YouTuber saying thanks for watching, the video's own ending.
- "The only thing that changes is how we define where the ending is." What happens once a video is finished stays exactly as today (the owner, 2026-11-17).
- It can run as an automation too.

## Settled

- **No 20 s window** (the owner, 2026-11-17): with no ending found, a video is finished only once it plays to its real end (within a second, the player's rounding). The setting goes.
- **Finished means the same as today** (the owner): only where the ending is changes. Watch time counts through the outro and after, as today.
- **The names** (the owner, 2026-11-17): the point is **Video end**, on the seek bar, in Seek bar marks' settings and everywhere it's said; the action is **Find where the video ends**, with no line under it and no hover (the owner, 2026-11-17, after trying it); the automation reads "When a transcript is finished, find where the video ends". The mark's hover is "Video end" and its time, as the other marks' are: whether Panki AI found it or a hand moved it isn't told. Video end isn't marked as Panki AI's (the owner, 2026-11-18), the one exception to marking what Panki AI writes (`AI.md` → Settled); whose placing it was stays on its row, read by nothing.
- **Proposal: Find where the video ends**, a Panki AI action in the Transcription menu's Panki AI part beside Proofread: it reads the finished transcript and answers where the video's content ends (a closing line, the talking stopping before credits), asked for the end of the content, not the first goodbye, so a blooper after "thanks for watching" isn't cut off. Its prompt is the admin's, a place like Proofread's.
- **Proposal: one ending per video, everyone's**, kept beside its transcript; a video with no transcript has none.
- **Re-running is allowed** (the owner, 2026-11-17, after trying it): Find where the video ends stays pressable once a Video end is found or moved by hand; pressed, Panki AI is asked again, paid as a run, and its answer is the Video end, the latest standing. Greyed only while one is being found.
- **On the seek bar** (the owner): marked like the other marks, its colour and On / Off in Seek bar marks' settings. **Proposal:** dragged by hand to fix it, the fix everyone's as a transcript fix is.
- **An automation** (the owner): When a transcript is finished, find where the video ends; **Proposal:** On by default, under Max spend for automations like the others.

- **Built so (Claude's readings, each the owner's to overturn):**
  - Video end is a place of its own (`AI_PLACES` `videoEnd`), its prompt the admin's in Admin → Panki AI beside the word's and the card's; a run, no messages, no User instructions; held to Max answer length.
  - It reads the transcript's last 15 minutes (at least its last 30 lines), each line numbered with when it starts, and the video's length; it names the last line of the content and Panki puts the Video end where that line's words end, so no time the model writes is used. When unsure it's told to pick the later line.
  - Only once the transcript is finished. A press asks again of a video that has one, the time it stands at beside the action; never twice at once for a video. The automation passes over a video that has one, so it pays once.
  - Moving it by hand is held to Editing Panki subtitles, as editing a word is; every placing is a row of its own, the latest standing.
  - "On / Off" in Seek bar marks is the Visibility (Shown / Hidden) every mark has; pink and medium to begin with.

## The order

Built on local dev, uncommitted: shared migration 18 (`video_ends`), account migration 60, `EXTENSION_PROTOCOL` 16.

- [x] 1. **No 20 s window**: finished only at the real end; the setting gone.
- [x] 2. **Find where the video ends**: the action, its prompt, the Video end kept per video, finished from there, its mark on the seek bar with its settings, dragged to fix.
- [x] 3. **The automation**: When a transcript is finished, find where the video ends, On by default.

## Open

- **Blind spot**: credits over music are silence in the transcript, so Panki AI sees only where the talking stopped and the closing line. Proposal: accept it; the drag fixes the rest.
- **The recap at the real end**: a video with no Video end now finishes at its last second, where YouTube's autoplay moves on within seconds, and the recap goes with the video. Before, it had the last 20 s. Proposal: see how it feels; a video with a transcript finishes at its Video end and keeps its time.
- **No Video end without the Panki panel**: the page reads the Video end from the transcript, which the panel loads; with the panel off a video finishes at its real end.
