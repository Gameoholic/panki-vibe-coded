# The Panki panel's head, and one full screen

> **Scope of this file.** The plan for streamlining the Panki panel on YouTube's watch page (started 2026-11-06): why, what's settled, the order of small steps, what's open. How a built step works goes in `ARCHITECTURE.md` ("The Panki panel's views", "YouTube's own pages made Panki's"); what it does once built in `PRODUCT.md`.

## Why

The owner's words, 2026-11-06, not concrete: "look how many buttons we have! most of them I don't even use! but I'd want them to be visible, not buried somewhere in a menu… help me think of ways we could achieve my goal of streamlining and having the entire thing less all over the place." Asked which they press in a normal week: "just switching theatre mode on and off, the Watching button when I finish it… that's it honestly." Their first idea, dropped by themselves: a setting that overrides YouTube's full screen with Theatre mode ("then if I want to watch YouTube normally I have to go into the settings").

The preview that settled it: https://claude.ai/artifact/6vGycGLcJmoXzMAX2HS2hM (today's head; one full screen; the head as A, B, C; then the one menu).

## Settled

- **One full screen** (Claude's proposal, the owner: "one full screen sounds good"). With Panki on, F and YouTube's own full-screen button fill the screen with the video and the panel beside it (Theatre mode as it stands, on the site's own full screen). Inside it a key of the panel's own (P to begin with, a setting; Esc can't be it: the browser keeps Esc for leaving full screen) and a handle at the panel's edge hide the panel, so the video alone is YouTube's full-screen look, and show it again. With Panki off (the pill's switch in the header bar) everything is YouTube's. The Theatre button, "F key opens Theatre mode" and "Full screen in Theatre mode" go. Claude: the risk looked at and not real; YouTube's full screen is the page's root, the element Theatre already asks for (`pankiFull`), and Theatre's CSS already lays the panel out in the site's full-screen layout.
- **The head is status only** (the owner's pick, A, with one menu): "● Transcribed ▾" (the Transcription menu, as it is) and at the head's end a ≡ opening one menu, "like programs like Premiere and After Effects do", holding every other setting as rows that change in place while the menu stays open (Claude's call: a sub-menu per setting is two presses for a one-press thing): Source (Panki subtitles / YouTube subtitles / None), View (Under the player / Beside the video), Subtitles… (the style menu as today), Open Panki, Options.
- **Save for later and Watching · 9% / Finished move to the player bar** (the owner, 2026-11-06: "maybe we can move the Watching 9% to the bottom bar as well like you did for the Save for later symbol; it's all in the settings of the bottom bar"): two more controls of the player bar's registry (`BAR_CONTROLS`), Panki's, shown to begin with, laid out in the YouTube tab's Player bar panel like the speed button and the end time. The Watching chip reads as it does now ("Watching · 9%", then "Finished", pressed to say the other) in the bar's own type, beside the end time to begin with.
- **Nothing else of the head changes**: the Beside view's column, the drawer, the transcript list are as they are.

## The order

- [ ] **1. One full screen.** Theatre follows the site's full screen (F, the button, a double-click on the player) whenever Panki is on and the panel is on; the panel hidden and shown inside it by its key and its edge; the Theatre button and the two settings gone (a kept `stageFull` / `stageKey` read as nothing). Its own session.
- [ ] **2. The head and its menu; the two bar controls.** The head as status and ≡; the menu; Save for later and Watching as player bar controls, the Player bar panel listing them. Its own session, after 1 (the head's Theatre button goes in 1).
- [ ] **Later: the outro found by the AI** (`AI.md`, parked), which would save the Watching press.

## Open

- Whether the panel's hide key should be P or something else: P to begin with, a setting in the YouTube tab's Panki panel panel, checked against YouTube's own keys as step 1 is built.
- Where in the bar the two new controls stand to begin with: after the end time, as the registry's order has it; the owner lays them out from there.
