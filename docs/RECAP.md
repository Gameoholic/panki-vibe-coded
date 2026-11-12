# Video recap

The epic's plan: why, what's settled, the order, what's open. Claude's copy; the owner's is the preview artifact.

## Why

The owner's words, not concrete: when a video is finished, a short popup of "all the things and cool stuff I've done in this video". "Just feel good, primarily just a motivation booster, like a nice! well done! screen", and "also it's just a good thing to know how many cards I've added from this".

## Settled

- **What it's for**: feeling good, and knowing what the video gave (the owner). Not a to-do: it never asks to review, never nags.
- **When**: as a video is finished, as Panki already decides finished (the watcher's Finished, `docs/architecture/watching.md`) (proposal).
- **Models**: every step session on Opus 5.5 at high effort (the owner: "no fable only opus").

## The order

- [ ] 1. A preview artifact: a YouTube watch page with Panki's panel as close to the real thing as can be, the video ending and the recap appearing, many variations switched by a dropdown or buttons in that one preview, from a quiet toast to a full "well done" screen. The owner picks.
- [ ] 2. Build the picked one: the facts it needs from what Panki already keeps, then the recap itself, toggleable (an options-page switch, on to begin with).
- [ ] Later: anything the preview turns up that's bigger than the recap (a history of recaps, sharing one).

## Open

- **What it counts** (proposal, the preview shows them): cards added from the video, the words they were for, time watched and at what speed, subtitle lines read, words looked up, Panki AI messages, how far it took today's streaks. Which of these exist in Panki's data today is the build step's first question; the preview may show ones that don't yet.
- **What breaks it** (proposal): never over YouTube's own end screen or its autoplay countdown in a way that steals the next video; once per video per viewing; nothing at all when nothing happened in it (no card, no look-up), or a lighter one.
