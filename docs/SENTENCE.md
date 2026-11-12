# Sentence as a field kind — the plan (started 2026-11-12)

> Nothing here is built until its box is ticked. The owner's copy is the artifact page; this file is Claude's.

## Why (the owner, 2026-11-12)

- On a video the drawer's Sentence is the clip's words, read-only: it knows which field that is only from each browser's Field mapping.
- "Maybe we should make it so it's literally a special type of field that's read-only."
- Above all: how it works with the existing data on prod.

## How it stands (Claude)

- A field's kind is one of `text`, `long`, `media`, `image`, `youtube`, `pitch` (`type.ts` → `FieldKind`), kept in `card_fields.kind`. A card's value is text in `card_values` whatever the kind; changing a field's kind in the card type's editor already exists, and leaves every value as it was (words in a field changed to another kind stay words).
- Which field is the Sentence is the Field mapping's alone, kept in each browser (`storage.ts` → `maps`), never on the account. That's also what blocks Touch up in Panki itself (`AI.md`).
- A card made from a video keeps where it came from: its `card_sources` row (the video, the clip's start and end), and each value's source (`card_values.source`: the Sentence's is the subtitles' words).

## The answer on prod's data (Claude)

**No migration and no backfill. Nothing of a card changes.**

- **A new kind is one more name** a field can have (`line`). The column is already there and takes any kind's name; no table, no column, nothing rewritten.
- **Your fields switch only when you switch them**, by hand, in the card type's editor, the way a field is made Pitch accent today. Until then every deck works exactly as now. The switch is a type save like any other, logged whole with what the field was before.
- **Every card's Sentence stays byte for byte what it is.** The kind changes how the field is shown and edited, never its value.
- **Switching back to Text undoes it** exactly, with nothing lost.
- **Before switching on prod:** `pnpm backup` on the VPS, as for any change near cards.
- **The extension:** an older one doesn't know the new kind and would refuse the card types it reads, so `EXTENSION_PROTOCOL` rises: the extension says Update needed once, the moment it's pushed; rebuilt and reloaded, it's back.

## How it would work (Claude's proposal)

- **Line** in the kinds list beside Text and Paragraph. At most one per card type, so there's never a question which one is the sentence.
- **In the drawer**, the type's Sentence field is the Field mapping's Sentence by itself (the mapping's own pick stays for a type with none).
- **On a card from a video** (one with a clip, `card_sources`), the Sentence is read-only everywhere, in the drawer and in the deck: the clip's words. In the deck, changing it would mean cutting the clip again, which is a later step of its own if ever.
- **On a card from a page or typed**, it's an ordinary field, edited as now.
- **Shown as a sentence**: the word lit in it, as the drawer shows it, in the card editor and on the review card's layout as it is today otherwise.
- **Read-only looks read-only**: its box quieter than an editable field, no typing cursor (the drawer's too).

## The order

- [x] 1. The kind: `line` in `FieldKind`, at most one per type (`NewCardType.fields`, the type editor greying Line on the others), `EXTENSION_PROTOCOL` 12; Line in the web's `FIELD_KINDS`, words to light in like Text and Paragraph (`holdsProse`).
- [x] 2. The drawer: the type's Line is the mapping's Sentence by itself (`roles.ts` → `cleanMap`; no other piece goes there); the read-only look (`.field-input.is-readonly`).
- [x] 3. The deck: a card or an example taken from a video (`Card.fromVideo`, `CardExample.fromVideo`, its source holding the video's stretch) has its Line read-only in the card editor (`lineLocked`), the card's word lit in it.
- [ ] 4. The owner backs up and switches the field on prod, by hand.

## Settled (the owner, 2026-11-12)

- The kind is called **Line** on screen (`line` in code). A field's own name is the owner's and stays as it is: a field called Sentence, switched to the Line kind, is still called Sentence until the owner renames it.
- Read-only in the deck too, for a card from a video.
- One Line per card type (Claude's default, the owner's "go execute").
