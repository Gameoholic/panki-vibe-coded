# Code style

- `strict`, and no `any`, ever. Cross a trust boundary with a Zod schema, not a cast.
- TS and TSX: 2-space indentation, double-quoted strings, semicolons.
- Keep functions and components focused; one doing two jobs is split.

## Comments

- A comment explains why, never what, and only when the why is non-obvious: a trap, a decision.
- A comment never says who decided, when, or what it was before: no names, no dates, no "the owner's pick", no "until … it was X", no artifact links. Code that reads an older shape (a migration, a setting carried over) says what that shape is, plainly. Every code file, shipped or not.
- A file that ships to someone's computer (the update scripts, anything in a download) says only what it does and its safety rules, in a plain header like `update.ps1`'s.

## Screens

- **A phone is one of the app's screens.** Nothing reachable by hover alone, nothing wider than the screen, every text field 16px, one phone breakpoint in one place. Every visible change is written for a phone's size and touch as well as a desktop.
- **Colours come from theme tokens, never literals.** A colour no token covers gets a token in `theme.css`, with a value in each theme.
- **No coloured stripe down a side.** Something picked, current or flagged is never marked by an accent bar along one edge (a `border-left`, or an inset `box-shadow` that draws one). It's tinted whole (`--accent-soft`), its words saying so. A hairline dividing two parts of one control is not a stripe.
- **Whatever sits beside a field lines up with the field's input, in every state.** An icon, a number, a hint or a × beside a `TextField` is centred on the input, never on the row, and stays there when the field's error shows. The row and the field share one grid: the field is `display: contents`, its label, input and error each a grid row, everything else on the input's row (`.stage-row` and `.answer-name` in `app.css`). Never `align-items: end` plus a margin. Before reporting a row with a field in it, read its CSS with the error showing in mind.
- **Controls in one line share one height and one top edge.** Something on or off is a `Toggle`, never a lit-or-unlit chip.
- **Actions carry icons.** A button that does something has its `Icon` beside its words. A missing icon is drawn into `Icon.tsx`'s registry, with its line in `docs/COMPONENTS.md`.
- **Taking something away asks first.** A button that deletes or takes something off is the `trash` icon with its word ("Delete"), never a bare ×, and asks in a small panel hanging from that very button (`Ask` with its `anchor`): never at the foot of what owns it, never a second way of asking. A × closes or dismisses, never deletes.
- **Backing out and saving have no icon.** Cancel, Stay, and every Save (Save, Save key, Save and leave) are their word alone.
- **Backing out is "Cancel".** Every button that leaves something as it was says Cancel: a form's, a question's (`Ask`'s default), an editor's. The only other words: **Stay** in the unsaved-changes pop-up, and **Only what I watch** in the length-limit question under Hybrid (backing out there still transcribes, in chunks). A new one is put to the owner first.
- **Anything that takes a while to set up is saved on purpose.** Nothing reaches the API until **Save**, which sits in the screen's header beside the words saying whether there are unsaved changes. No Discard button: leaving the screen drops changes. Leaving with unsaved changes asks in the app's one pop-up (`Modal`, the one allowed centred modal): Stay, Discard changes, or Save and leave (the screen hands `App` an `UnsavedGuard`; `go` and the browser's back stop for it). A reload or closed tab gets the browser's own "leave site?". No drafts: unsaved work lives on the screen alone. A new thing made this way doesn't exist until its first Save. The SRS editor is the pattern. Short forms (a deck's name, a card) save as they do.
- **Loading is the Skeleton, and it moves with the UI.** Every loading state is `components/Skeleton.tsx`, never "Loading…", a spinner or a blank that pops in. A shape is built of the real screen's own classes and sizes, with exact counts wherever they're known and the device's remembered shapes otherwise (`skeletonMemory.ts`). A new screen, or a change to a screen's layout, updates its skeleton in the same change, unasked. Whether it fits is checked against a scratch Panki (`docs/PREFERENCES.md` → Tooling); a small change to one (a line of words, a block's width) is fitted from what was measured before, with no scratch Panki.
