# Reuse

Duplication means something was modelled wrong. One concept, one component, one place.

## Build once

- **`docs/COMPONENTS.md` is the list of what exists.** Look there before building anything; extend what's there, never build a second thing that does the same job. It's generated: a shared piece's line is the `/** @panki … */` comment at the top of its file, written in the change that adds the piece, then `pnpm docs:components`.
- **One of each primitive.** One tooltip, one form, one field, one panel, one confirm, one menu, one row. Two things that must look alike are one component used twice, identical by construction.
- **One base per layer, shared by every kind.** When two screens, cards or lists do the same job, what they share lives in a base; each kind only declares its options and renders its cells.
- **What a thing offers is declared in one file,** a catalog; each place picks what makes sense for it.
- **Every button is `<Button>`,** carrying one of the app's button classes; never a classless `<button>`.
- **A rule or magic number has one home.** Retuning means editing one object, not hunting through components.
- **Anything the extension keeps of Panki's is one entry in `apps/extension/src/kept.ts`,** read with `readKept` and invalidated by Panki's state header (`X-Panki-State`); never a cache of its own with its own lifetime and clearing. A new kind of kept data is one entry in the contracts' `KEPT_KINDS`, the API hashing it from the data itself (`apps/api/src/kept.ts` → `hashOf`, `whileUnchanged`), never a counter bumped by hand on each write. A page's own memory of what it's drawing stays the page's.

## Registries

- A family of things (kinds of card, options a screen offers, effects on a value) is one registry, each thing one entry declaring what it is, what it does and how it shows. Never a one-off branch, colour or badge.
- Nothing else knows an entry by name.
- Entries compose by one fixed rule, never by special case; every entry shows itself the same way.
- A new kind of entry is a design change, raised with the owner first.
- Tests cover the combinations.

## Panki AI

- Every place Panki AI lives is built one way: one registry of places (Word pop-up, Card drawer, Transcript); a prompt under each (the admin's for the word and the card, a template for the transcript's Proofread); actions as saved messages with knobs; one fixed Zod answer shape per place through the one reader; Panki's rules as refines worded "Expected … Got …"; the meanings in one format and one judgement; the AI's mark on what it writes; one head with its Details; one conversation drawing every message (`AiConversation`, a place handing in only what's its own); one failure wording; the cost before and after; the spark as one component.
- Each rule and where it lives: `docs/AI.md` → "How every place is built". A new place or action follows them; one that can't is talked through first.
