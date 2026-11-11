# Blur, in place of Listen first — the plan (started 2026-11-11)

> The brainstorm about taking the Listen phase out and blurring the front instead. Nothing here is built until its box is ticked. Playbacks and proposals live here; the owner's copy is the artifact page.

## Why (the owner, 2026-11-11, not concrete)

- "I always kinda was unhappy with the listen feature." Remove the listening side of the card as it is today.
- Instead, one setting in the user's settings that blurs the front of the card, on by default. The back unblurs, as today. Going back to the front, it stays unblurred; Undo too puts you on the front.
- Two sides only, front and back. No third side.
- While the setting is on, a Blur / Unblur button, above Show back for now, distinct from today's buttons; where it goes and how it looks is for a preview page with several ways.
- Blur and unblur any time while on the front.
- Don't call it listening any more.
- The worry: the time listened is data; removing the column or leaving it would both wrong the time counts, since three sides were counted and now there are two.
- The way of working: Claude answers the owner's questions and asks every one of its own now; the owner answers; a preview page of the looks and how it works; the owner approves; then it's built with extra care for prod and the data.

## How it stands (Claude)

- A showing of a card has three spans on its row (`card_places`, and `card_holds` for Snooze and Suspend): `listen_ms` (card on screen to its front), `think_ms` (front to flip), `decide_ms` (flip to answer). `listen_ms` came by a migration as a nullable column: NULL on every row from before Listen first and on every showing that had no Listen phase; nothing was made up then and nothing is now.
- A session left part-way keeps the phase its card stood in (`review_sessions.left_phase`: listen, front or back).
- Listen first is the card type's (`card_types.listen`): On per type, each part of the front Shown, Blurred or Hidden while listening (the layout's `listen` per part), a sound or clip able to end it after its second to sixth play, Done listening on its key. A card has a Listen phase only when its type says so and something on its front can be heard.
- Stats sum all three spans into time reviewing, each card capped; the Time reviewing tile's Phase view (just built, uncommitted on main) names them Listening, Thinking, Deciding; Answer time's foot says the same three.

## The answer on the database (Claude)

**No migration, no backfill, no column dropped, nothing to transfer.** The conventions forbid rewriting history (`docs/conventions/data.md`: nothing is deleted or overwritten, a migration adds and never drops), and here nothing needs it:

- **The totals don't change.** Time reviewing already adds the three spans; a showing that had a Listen phase is counted whole today and stays counted whole. Only the names and the grouping change: time on the front = the time blurred + the time unblurred.
- **The old span is the new span.** Listening was the time before the words showed; blurred is the time before the words show. So `listen_ms` stays the column, read in the code as `blurMs` (a comment at the column saying what it was called and that it means the same), and every new showing writes the time the front was blurred into it, `think_ms` the time on the front unblurred (0 when flipped while still blurred), `decide_ms` as now. A row from 2026-10 and a row from 2026-12 read the same way, through one definition, with no backfill.
- **A session's phase**: old `listen` rows read as the front; new rows write front or back.
- **The type's Listen settings** (`card_types.listen`) stay in their rows unread or are read as the type's blur rule, as question 1 decides. Nothing is deleted either way.
- **Prod**: a code-only change, so no data step runs on panki.pro at deploy; one commit, one revert takes it back whole. The one care is the reading: every consumer of `listen_ms` (the stats, the Phase view, Answer time's foot, the review's spans, the extension's drawer preview if it shows a Listen phase) is found by Grep and changed in the same commit, or named as left.

## Claude's objections and proposals

1. **The name is Blur.** The setting **Blur the front** (On / Off), the button **Unblur** while blurred and **Blur** while clear (an action saying what it does), the key the one Done listening had, the time **Blurred** in Stats. Never "listen" or "veil" on screen.
2. **Blur only a card with something to hear.** Blurring the front of a card with no sound or clip on it leaves nothing to do but press Unblur. The account's switch is on for every deck; a card blurs only when its front has a sound or clip, as Listen first already decides (`listensFirst`). A card with nothing to hear opens clear.
3. **Keep what's blurred per field, in the type.** "Blur everything" would blur the player too. Today's per-field Shown / Blurred / Hidden (the Layout tab) is already the right data, kept per type; it becomes that type's **Blurred front** and the account switch turns the whole thing on and off. A new type's default: text fields blurred, sounds and clips shown.
4. **Keep the sound ending the blur.** "Unblur after the sound's Nth play" is what makes listen-then-read hands-free; it stays as the type's option, renamed. Off for a new type unless the owner says otherwise.
5. **Nothing moves at Unblur**: blurred parts stay `inert` and unselectable, hidden ones hold their room, exactly as the Listen veils do, so unblurring changes no layout.
6. **Undo shows the previous card's front unblurred**, read from "same if we do undo" as "same as going back to the front". A fresh card shows blurred.
7. **Order matters**: the streaks build is uncommitted on main and the Hold removal is on its own branch, and both touch the review screen and the Time reviewing tile. Blur is built once streaks are committed and `claude/remove-hold-e7b9da` merged; otherwise three sets of hands in `ReviewScreen.tsx`.

## Questions, all at once (the owner's ask), each with its default

1. What blurs: per field as the type's Layout tab says today (default), or everything but sounds and clips with no per-type say.
2. Blur only cards with a sound or clip on the front (default), or every card.
3. Keep "unblur after the sound's Nth play" as the type's option (default), or drop it.
4. Undo puts the previous card's front back unblurred (default), or blurred afresh.
5. Where the switch lives: Settings → General → Reviews, "Blur the front", On to begin with (default).
6. Step back from the back goes to the front as it stands, unblurred (default); there's no further step.
7. The button on a phone is the same button; on a PC the Done listening key becomes Blur's (default).

## Settled

- **Models**: this conversation on Fable high, step sessions on Opus 5.5 high (defaults, not objected to).
- **Two sides only**; the Listen phase goes; a Blur / Unblur button while the setting is on; nothing on screen is called listening (the owner).
- **The name is Blur** (proposal 1, the owner: fine).
- **What blurs is the type's, per field**, the Layout tab's Shown / Blurred / Hidden (proposal 3, the owner: fine). **A card blurs when its type has a field to blur**, and for no other reason (the owner, answering proposal 2): not whether something on it can be heard. A type with nothing marked opens clear.
- **"Unblur after the sound's Nth play" is removed** (the owner: "I never used it"). The rows that hold it stay unread.
- **Blur has a key, assignable, Shift to begin with** (the owner). Shift is free now the Hold button is gone.
- **Blurring is a front-end helper, not a side of the card, and the database doesn't know it** (the owner): no blurred span, no "time listening" stat. What's kept and shown is **time on the front** and **time on the back**.
- **Listening is removed from the data, by one migration, the owner lifting the no-rewrite rule for this one case knowingly** (the owner, 2026-11-11: "it's my call… I want 0 references to the old listen beside the migration… port over the old listen data to the current front of card so we don't lose that data"). Claude's objection, argued once and overruled: `docs/conventions/mindset.md` and `data.md` forbid an UPDATE that loses a value and a migration that drops; the merge could have happened on read for the same numbers. The rule itself stands for everything else; this migration is the one exception and says so in its comment. What the migration does, in one step, inside one transaction: `card_places.think_ms` and `card_holds.think_ms` become `think_ms + listen_ms` wherever `listen_ms` is set (the front's time is the two merged; nothing lost), then both `listen_ms` columns are dropped; `review_sessions.left_phase` rows saying `listen` become `front`; each card type's layout JSON renames its per-part key `listen` to `blur` with the same three values; `card_types.listen` (Listen first's On and the Nth-play rule, both features gone) is dropped. After it, no column, key, contract field, code name, event kind or doc line says listen; the one place the word survives is the migration's own comment, which says what it rewrote and why. The owner runs `pnpm backup` on the VPS before the push that deploys it.
- Claude's flag on the blurred span itself, said once: the time before unblurring could have been kept for nothing; the owner's call stands: not written.
- **The button is a chip in the card's corner** (the owner, from the preview): glass over the card (`--blur-glass`), Unblur while blurred and Blur while clear, its icon in the accent; gone with its room held on the back and on a card whose type marks nothing, gone without room while Blur the front is Off.
- **Undo** puts the previous card's front back unblurred; **Step back** from the back goes to the front as it stands; the switch is **Settings → General → Reviews → Blur the front**, On to begin with (defaults, not objected to).

## The order

- [x] 1. The owner answers the questions above (2026-11-11).
- [x] 2. A preview page: the blurred front, the button in several places and looks, Unblur, the back, Step back, Undo, the setting's row, the Keybinds row, the Layout tab's per-field Blurred, the Stats words (Front / Back); the owner approves one. https://claude.ai/artifact/ARe9imMxkX3qqiCFrEnqSP — **the owner picked Card corner, Chip** (2026-11-11); questions 2 to 17 below keep their defaults.
- [x] 3. Built whole on main (streaks and the Hold removal are pushed); the migration written whole in one Edit and checked on a copy of the dev database in the scratchpad first; the owner tries it on local dev (where the migration runs on their dev data as it's saved); one commit; `pnpm backup` on the VPS before the push (the owner has backed up once already on 2026-11-11).

## Open

- Whether the Layout tab's per-field control keeps three states (Shown, Blurred, Hidden) or two. Default: three, as kept today.

## Questions for after the preview

The page offers seven places (Above Show back, Beside Show back, Card corner, Card edge, Card foot, Counts row, With the tools) and three looks (Button, Chip, Bar; a look that doesn't fit a place is greyed), at a computer's and a phone's width. Ordered by how much the answer changes what gets built; each with Claude's default.

1. Which place and look. Default: Above Show back, Button (the owner's first words; it never covers the card and sits where the thumb already is).
2. The button's own look, distinct from the answers (white, line), Show back (filled accent) and the tools (bare grey words): a ground of its own, a breath of the spoiler's grey (`--blur-soft`, a new token in each theme), its icon in the accent. Default: that; the Chip look is the same button as glass over the card (`--blur-glass`).
3. Its icons: Show back of card already has the eye, so Unblur and Blur take two new ones for `Icon.tsx`, `focus` (corners round a sharp ring) and `blur` (the same corners round a broken ring). Default: those; `eyeOff` stays unused here.
4. On the back, and on a card whose type marks nothing, the button is gone but holds its room, so turning the card moves nothing; With the tools it stands greyed instead, as Step back does. Default: that.
5. With Blur the front Off, the button is gone with no room held (it's the account's setting, not the card's). Default: that.
6. The Layout tab's per-field row: named **Blurred front**, its choices Show / Blur / Hide (verbs, as On the front's Show / Spoiler / Hide beside it), under On the front and On the back. Default: that; "On the blurred front" the longer alternative.
7. A clip's subtitles keep their own row under the clip's Subtitles (Show / Blur highlight / Blur / Hide today, labelled While listening), else a clip's subtitles show the very sentence the front blurs. Default: kept, renamed **Blurred front** too. Not on the page.
8. The Layout tab loses Listen first's switch and Ends listening; its Side becomes Front / Back, and the card there is the review's own, so its Blur / Unblur button works there as in a review to see the blurred front. Default: that.
9. The Layout tab's Blurred front row stays live while the account's Blur the front is Off (it's the type's, kept for when it's on). Default: not greyed.
10. Turning Blur the front Off unblurs the card on screen at once; turning it On blurs from the next card. Default: that.
11. The Time reviewing tile's view named **Side** (Front / Back), since nothing is a phase any more and the Layout tab already says Side. Default: Side; "Phase" if the owner prefers the word kept.
12. Answer time's foot: "Front 5.6 s · back 1.8 s", the front first as a card goes. Default: that.
13. Blur's row in Settings → Keybinds stands where Done listening's did, first after Start, in the order a card goes (Blur, Show back of card, Step back); Shift pressed, not held. Default: that.
14. Blur and Show back of card are heard together on the front, so they can't share a key and shape (`clash`); Done listening's place in `apart` goes. Default: that.
15. Blur the front sits last in Settings → General → Reviews, beside Example shown (both are about what the card shows). Default: there.
16. Unblur fades the blur out in 0.18 s rather than snapping. Default: that quick fade; a snap if it feels slow.
17. A hidden part on the blurred front fades in with the same 0.18 s. Default: that.
