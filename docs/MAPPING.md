# Field mapping on the card type — the plan

> The way to Touch up in Panki itself (`docs/AI.md` → The order): the field mapping moves out of each browser and onto the card type, so Panki itself knows which field is the Reading, the Meaning, the Line. Why, what's settled, the order (ticked as steps land), what's open. **Proposal** marks Claude's default, the owner's to overturn.

## Why

The owner's words, not concrete:
- Touch up should work in Panki itself, on cards that are already there: "what I meant by touch up is for existing cards" (the owner, 2026-11-17).
- The mapping lives in each browser "literally only because only ever the browser needed that information"; two browsers, or two decks of one card type, never fill a field differently (the owner, 2026-11-17).
- Panki should offer, never force.

## Settled

- **What fills each field is the card type's** (the owner, 2026-11-17): set once on the account, read by every browser, the phone and Panki alike; never per browser or per deck. Line and Example sentences are already kinds of field on the card type; the rest of the mapping joins them.
- **Proposal: it keeps its name, Field mapping**, set in Panki's card type editor, beside each field's kind; the extension's Decks tab loses its own and points there.
- ~~**Proposal: a browser's mapping is carried over once**~~ (the owner, 2026-11-17: not needed, set by hand): every card type's Field mapping starts at None and the owner sets it in the card type editor; a browser's old per-deck mapping is read by nothing.
- **Every mapping None to begin with, none locked** (the owner, 2026-11-17): a Line and an Example sentences field are mapped by hand like any other, and can be set back to None; a field's kind only greys what it can't take.
- **Word audio (YouTube) goes** (the owner, 2026-11-17: never used): the picked word's own stretch is no longer a piece, nor a bar or a recording in the drawer; a field kept mapped to it reads as None, nothing rewritten, and a card holding such a file keeps it. Forvo's is called **Word audio** alone, its Source column already saying Forvo.
- **A deck's Field mapping on / off switch goes** (the owner, 2026-11-17): a card type with no mapping is simply typed into.
- **The capture drawer keeps filling by itself** (the owner): mining must be fast, and the whole card is seen before Add.
- **Touch up in Panki is for cards already there** (the owner, 2026-11-17): a card opened in a deck, its Panki AI conversation as in the drawer, every change a proposal to Accept or Dismiss.

## The order

- [x] 1. **The mapping onto the card type**: kept on the account per card type field (`CardField.fills`, migration 59), set in Panki's card type editor beside each field's kind (Field mapping, the same choices, what a field can't take greyed, every field None to begin with and none locked); the role registry is the contracts' `roles.ts`, shared by both apps. The extension reads it from the card type (drawer, Touch up, the recap's reading and meaning; word highlighting never read it) and drops its own: the Decks tab's Field mapping says it's set on each card type in Panki and opens Card types; the per-deck On / Off switch is gone. ~~A browser's mapping carried over once per account~~ (the owner, 2026-11-17: not needed, set by hand): every card type starts at None. `EXTENSION_PROTOCOL` 15.
- [x] 2. **Touch up on a card opened in a deck**: the card's Panki AI conversation above its fields in its deck's list (`components/CardConversation.tsx`), the same conversation, actions, follow-ups and Accept / Dismiss; Accept writes into the form, marked as Panki AI's, and Save keeps it. **Proposal, taken**: what only a video or a page gives is simply absent (the dictionaries' data, the surrounding subtitles, the clip), so the Line isn't proposed for; using a card's link and Panki's transcript for its subtitles needs the extension's line numbering brought into the web, not easy enough for this step.

## Open

- **The drawer on the shared conversation.** The card opened in a deck runs the drawer's conversation logic written again over the card's form (`useCardConversation`); the drawer's own stays in `Panel.tsx`, untouched so it works exactly as before. Folding the drawer onto the shared hook (its video parts, the clip's note, Heard, Video context length, the automation, the hoist, as the host's own) is a step of its own, checked in a browser.
- **The subtitles for a card from a video**: a card holding its video's link, with Panki's transcript of it, could send the lines around its clip and have its Line proposed for, as the drawer does.
