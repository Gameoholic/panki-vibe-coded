# In-app text

Every string the owner sees is product copy: it says what the thing is or does for them, in the product's own words.

## Copy

- **Never echo the request.** The prompt describes a change; the UI describes the product.
- **Don't narrate the mechanism,** and never say "the user" or "the app".
- **A hint earns its place.** One that only repeats the label is dropped.
- **An empty state says what's empty, and nothing more.** "No card types yet.", "No word picked.": never which button to press, where it is or what happens once there's something. Where a list's heading already says it, no line under it at all.
- **No explaining line under a setting or a choice.** A setting is its label and its control. A line under it (`Setting`'s `why`), a note beside a choice or a sentence on how something behaves is added only when the owner asks, or when without it the setting would do something no one could guess (a cost, a loss).
- **It reads like a professional product.** Read each label as on a paid product's settings page. A setting has a plain noun for a label ("Field name", "Position"), never a quirky phrase ("Its name: Over it"). Standard terms over the house's own poetic phrasing.
- **A switch says what's true right now.** Its words are its current state ("On" / "Off", "Required" / "Optional", "Shown" / "Hidden"), never one label that stays the same when it flips. `Toggle` takes both (`says: { on, off }`). A mode (Edit / Preview) is a `Segmented` pair, not a switch.

## The owner's names

When the owner names a label, use it exactly, everywhere. A code name that differs stays in the code; existing code is renamed only when touched, and the report says so.

- Transcribing a video in parts is **chunks**, its player the chunk player; never "follower" or "piece".
- **The entire video**, never "the whole video". It's transcribed, never "downloaded"; "download" isn't said on screen. The cap on a video's length is the **length limit** (`downloadLimit` in code).
- The modes are **Full**, **Live** and **Hybrid**. A mode named in a sentence is its `ModeChip`.
- Putting a card aside for a while is **Snooze** (snoozed, Unsnooze), never "Bury" (`bury` in code).
- The place before an SRS type's first stage is **New**, everywhere, never "Lesson" (`lesson` in code).
- The dictionary pointed at a word is the **Word pop-up**, what it opens **the pop-up** ("Let go on the word to keep the pop-up open", "Word pop-up layout"); never "popup", "word lookup" or "looking up words" (`popup`, `look` in code). The panel marking the words in the cards is "Highlight words that are in your decks"; the words on the seek bar, "Words that are in your decks".
- Panki AI's words are one set, on screen, in the code and in the docs (`docs/AI.md` → "The words"): a **place** is where a conversation lives (Word pop-up, Card drawer, Transcript); an **action** a saved message with knobs (Explain and Touch up each place's default one); the **prompt** the admin's, one per place; a **message** anything sent; the **answer** what comes back, its **reply** the text and its **parts** its pieces; the **judgement** the one scale (Fits / Close / Doesn't fit on a meaning). Never "preset", "run", "follow-up", "frame" or "accuracy" on screen; Proofread's own Run and a template's Follow-up prompt stay.

## Settings

Every new or changed setting, in the app and the extension, is checked against these before it's reported.

- **One thing, one name, everywhere.** Before naming a setting, a panel or a choice, search every tab (the app's Settings, the extension's options page, the strip's menus, `docs/PRODUCT.md`) for what it's already called and use that. A rename is made everywhere at once, docs included.
- **Understood by anyone in two weeks, from the words alone.** Read each label as someone who's forgotten the conversation it came from. If it wouldn't be understood, make the label clearer; if it still needs saying, add the line under it (`Setting`'s `why`); if it still isn't clear, make the setting simpler. This is the one standing case for a line under a setting.
- **Alike things look alike.** A panel's own switch is On / Off, heads the panel, carries its name, and greys every row under it while off (`disabled`, never hidden). A part that shows or doesn't is Shown / Hidden. Paired settings for two places are named the same way in every panel ("globally" / "in Panki subtitles"). The same kind of row has the same label in every panel ("Key to hold", "Visibility", "Colour").
- **What belongs together sits together.** Rows that only make sense with each other (a Where and its key) are one group (`.seek-group` with its title); a setting not reached by the one beside it is set apart and says so. A row stands where what it affects is.
- **Too many rows is a reason to split.** A panel past what can be taken in at a glance is split into titled groups, panels of their own, or a tab of its own, before another row is added.
- **What's kept on this device says so.** A setting kept in the browser's storage carries the quiet "This device" tag beside its label (`Setting`'s `perDevice`), or once at the head of a tab that's all this device's (`PerDevice` in `.settings-tab-head`). Never a line under it; nothing on an account's setting.

## Nothing the browser draws by itself

| Never | Always |
| --- | --- |
| `title="…"`, an SVG `<title>`, a hover bubble drawn by hand | `Tip`; on a touch screen its words go in the menu |
| a bare `<form>` | `Form`, `noValidate`; a field says what's wrong in `TextField`'s own bubble |
| `alert()`, `confirm()`, `prompt()` | `Ask`, a small panel hanging from the button that asked |
| a classless `<button>` | `Button` with its `variant` |
| a `<select>` | `Segmented` for a few choices, `Dropdown` for a long list |
| a native checkbox | `Toggle`, its words its state |
| `<input type="number">`, `type="time"` | `NumberField` |
| `<input type="color">` | `Swatches`, `ColourWheel` |
| `<audio controls>`, `<video controls>`, a bare `<input type="file">` | `MediaView`; `MediaField`, the input itself never seen |
| a centred modal over a backdrop | a panel anchored to what opened it; `Modal` alone for leaving unsaved work |
| a colour literal | a token from `theme.css` |
| a control shown only on hover | the row's menu as well, or always shown under `@media (hover: none)` |
| "Loading…", a spinner, a part blank until it pops in | `Skeleton` |
| the browser's scroll bar on a box that scrolls inside itself, or `::-webkit-scrollbar` | `ScrollEdges` right after the box |

The one exception: the Plain player style is the browser's own audio and video controls, a choice beside Panki's own Player.
