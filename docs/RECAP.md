# Video recap

The epic's plan: why, what's settled, the order, what's open. Claude's copy; the owner's is the preview artifact.

## Why

The owner's words, not concrete: when a video is finished, a short popup of "all the things and cool stuff I've done in this video". "Just feel good, primarily just a motivation booster, like a nice! well done! screen", and "also it's just a good thing to know how many cards I've added from this".

## Settled

- **What it's for**: feeling good, and knowing what the video gave (the owner). Not a to-do: it never asks to review, never nags.
- **With 0 cards too** (the owner): it still shows, saying the other facts.
- **Round one's picks** (the owner): the Corner card and the Haul as the two bases, with the Well done screen's confetti alone (not its dimmed full screen). Round two is takes on those two, Confetti On / Off. Taken out by the owner: Burst, Stems, Unfold. Left: A Corner, B Sessions, C Flashcards, D Next up, F Haul, H Flashcards, J Sessions, K Next up.
- **Five built, on trial** (the owner, 2026-11-13): A Corner, B Sessions, H Flashcards (the Haul's), J Sessions, K Next up, all built for real, with a temporary developer button to switch between them, until one is picked from living with them; then the rest and the button go.
- **Not in it** (the owner): time watched, its speed, Panki AI messages. In instead (round two, all kept or worked out already): watch sessions (which part was watched when, from `watch_stretches`), words in your decks heard, which video from the channel, and Continue watching / Saved for later as what's next.
- **When**: as a video is finished, as Panki already decides finished: played into its end (`source: "end"`), the turn from not finished to finished, so once per viewing; never on Watching pressed by hand. It stays until ×, the next video, or the video taken back before its end (`docs/architecture/watching.md` → The Video recap).
- **This viewing** (Claude's reading): everything after the video's finish before this one, all of it the first time. The cards added from it then count deleted ones too (a card added counts as added); the channel's count is how many of its videos were ever finished.
- **Examples apart from cards** (the owner): an example given from the video to a card already there is counted on its own, never as a card, in every look's head ("Nice! 6 cards · 2 examples added"; either left out at none). Stats and streaks stay cards alone.
- **Always inside the player** (the owner): no look is taller than the picture; the head (its words, the developer button, ×) and the facts always show. A and B: the words and the sessions scroll between them. H and K: the words scroll under the head, above K's row, coming in where they stand rather than flying up when they run over. J is one fixed height.
- **Reading and meaning on a card** come from the fields this browser's field mapping fills with the dictionary's Reading and Meaning for the card's deck; a deck mapping neither shows the words alone. The words wear Where you added a card's color (violet to begin with), not the preview's orange.
- **Words in your decks heard** are counted off Panki subtitles in the parts watched, each word once; with only YouTube's captions the fact is left out.
- **Switches**: Videos → Video recap on the options page, Video recap On / Off and Confetti On / Off, both on to begin with. The developer button in the recap's head (dashed, "B Sessions") turns A → B → H → J → K, kept in this browser; B to begin with.
- **Models**: every step session on Opus 5.5 at high effort (the owner: "no fable only opus").

## The order

- [x] 1. A preview artifact (https://claude.ai/artifact/4onGhMa9h3fc4pnrcNtYxG): many variations switched in one playable watch page. The owner narrowed it to five.
- [x] 2. Build the five for real (A Corner, B Sessions, H Flashcards, J Sessions, K Next up): the facts they need from what Panki already keeps, the recap toggleable (an options-page switch, on to begin with), and a temporary developer button to switch between the five.
- [ ] 3. The owner picks one from living with them; the other four and the button go: `watch/recapLooks.ts`, `Modules.recapLook` (its stored key and its ask), `HeadButtons`' developer button and the four looks' parts in `ui/Recap.tsx`, and their rules in `extension.css`.
- [ ] Later: anything the preview turns up that's bigger than the recap (a history of recaps, sharing one).

## Open

- **Which of the five**: the owner picks from living with them (step 3).
- **What it covers**: it comes in the video's last seconds (Video counts as finished in its last), so H, J and K sit over the end of the picture, and A, B and K over where a channel puts its end screen's video cards; the autoplay countdown in the middle stays clear and nothing of the recap holds the next video back.
