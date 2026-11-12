# Panki AI — the plan

> The AI epic: why, what's settled, the order (ticked as steps land), what's open. How a built step works is `docs/architecture/ai.md` and the code; what it does for the owner is `docs/PRODUCT.md` → "Panki AI".

## Why

- Transcripts aren't 100% accurate; a model reading them can fix misheard words.
- A dictionary's meaning is sometimes off, or none fits the sentence.
- Context, grammar, usage, as a Japanese friend would say it: what it means here and when it's used. It guides, never just translates.
- The sentence, trimmed to what's needed to read it without the clip; made-up extra examples, each with its scene.
- Everything customizable: prompts never hardcoded, the model the admin's pick, actions the account's own.
- Surgical: one clear AI, integrated, switchable, its usage and cost shown as Forvo's and ElevenLabs' are.
- Steering a card without typing the same follow-up every time: a note sent with Touch up, more of the video when it's needed, short or no explanation as a saved choice, the card as a conversation as a word is.

## Settled

- **Generated content is allowed, marked and kept apart.** What Panki AI writes carries the spark and the AI's ink wherever it's shown, and is never mixed into what the owner, a dictionary or a video gave.
- **A value remembers its source**, and the mark follows the value. Edited by hand it stays the AI's until Unmark as Panki AI's. Duplicates compare only true values.
- **The owner accepts before anything lands on a card.** Every proposal is Accept or Dismiss. Proofread's edits alone go in by themselves (a learner can't judge a mishearing), each undoable.
- **One conversation for every place**: a composer (typed words, ticked actions, or both), each message one call carrying the conversation so far, a reply and its parts, "Changed:" chips, Try again. Never saved; what's accepted onto a card is.
- **Actions are saved messages with knobs**: a name, its words, Default, Requires, Leave out, Video context length. Panki's own come with Panki and can be changed, deleted and restored; the account adds its own and picks the defaults and the order.
- **The prompt is the admin's, one per place.** An account steers with User instructions (a variable the prompt places) and its actions, never the raw prompt, which could break the answer.
- **The user's words and Panki's requirements are apart**: the actions' words and what's typed in a block marked as the user's, Panki's line of what must come back in its own, never editable.
- **A broken knob fails the whole message**: a required part that didn't come back, or a left-out part that did, and nothing of it lands.
- **A reply only when there's something to say**, said in the words of Panki's actions that want no reply (`QUIET_REPLY`), never in the prompt or the reader: only when something the message asked couldn't be done, or was done differently from what was asked or expected.
- **The Meaning**: a dictionary's words are kept when they fit, because they're the same across cards (search, duplicates and highlighting lean on it). A meaning is named by its number, judged Fits / Close / Doesn't fit with a reason, and when none fits Panki AI proposes one of its own. On screen it's a "meaning", never a "sense".
- **The Sentence** is what the clip plays: on a video it's the clip's words, read-only, shaped by pulling the clip's ends. Every subtitle line has one number in every message, its place among the video's lines, and the card's Sentence says which lines it is ("(lines 18–19)", or "(part of lines 18–19)", a part being the owner's choice). It's good when it holds what the word needs; a proposal is whole subtitle lines by their numbers, copied by Panki so it can never be reworded, and only when the word needs words it doesn't hold, never to make it whole lines. Accepting it moves the clip to those lines' own times, which its note shows as a diff of where the clip is (each end and the length, what goes struck, what comes green; `ClipMove`). Off a video it isn't asked.
- **The prompts are neutral**: each holds only what its place needs to work (the pieces, the shape, what each field holds). How Panki AI writes (its length, tone, what it leaves out) is User instructions' alone, Panki's own few lines to begin with (`DEFAULT_AI_INSTRUCTIONS`), aims rather than a list of don'ts.
- **The Explanation is optional**: Touch up leaves it empty, with a why, when the Meaning and the sentence already say it; so there are no per-field Touch up actions, and actions are one flat list.
- **Explanation and Example sentences** are two fields the AI fills through the field mapping, always its own text, always in addition to Meaning.
- **Cost before it runs**: "Up to $… (est.)" beside Send, a threshold under which nothing asks, and what it came to after. Every dollar is an estimate from listed prices.
- **Metering now, billing later**: every paid call (AI, transcription, Forvo) is one usage row; credits and payments build on those rows.
- **The model is the admin's pick** until billing brings a per-user choice.
- **Two languages, the account's**: Language (what Panki speaks, English alone for now) and Learning language.
- **Text only.** No video to the model; what a model writes is text everywhere it goes.
- **Prompt context is one registry**: the field mapping's pieces by the same names and sources, the subtitles around the moment and the video's description, shown as one list.
- **Prompt injection**: the prompt says its tagged material is quoted, never instructions. The mark and accept-per-card are the real defence.
- **How much of the video Panki AI hears is the owner's to set**, in the conversation's settings fold, holding for that message and every one after; never Panki's to offer.
- **Automation is rules**, configured per card, video or pop-up with a cost cap, never assumed.
- **Every call holds in both places**: a decision made on the word's conversation is applied to the card's, and the other way round.
- **The spark** is a solid four-point spark, the one drawing of the AI, on Send, heads and marks, never on an action. A wait on a model is the spark's eased half turn and words being reworked dimmed under the sweep, never a skeleton.
- **One head over every answer**: the spark, Panki AI, the status as a button (Thinking, Answered, Failed), the cost, and Details (why it ran, model, what was sent, tokens, cost, Prompt context as filled, the Log, Copy). Admin's Usage stays totals.

## The words

| Word | What it is |
| --- | --- |
| **Panki AI** | The feature; the heading of every block |
| **Place** | Where a conversation lives: Word pop-up, Card drawer, Transcript; each one prompt and one answer shape |
| **Conversation** | The chat in a place: the word's, the card's, the transcript's |
| **Prompt** | The admin's, one per place, in Admin → Panki AI |
| **User instructions** | The account's standing text, a variable in every prompt |
| **Message** | Anything sent: typed words, actions, or both; one message, one call |
| **Action** | A saved message with knobs (Requires, Leave out, Video context length); Explain and Touch up are each place's default |
| **Answer** | What comes back in the place's one shape: its **reply** (the text) and its **parts** (the meanings, a field) |
| **Proposal** | A part offering a change to a field, Accept or Dismiss |
| **Judgement** | The one three-step scale: Fits / Close / Doesn't fit on a meaning; Nothing to change / Could be better / Incorrect on a field |
| **Try again**, **Details**, **Log** | As they are |

Never "preset", "run", "frame", "template" (but Proofread's own) or "accuracy" on screen. "Ask a follow-up" is the one place "follow-up" stands: a message sent from a field.

## How every place is built

A new place or action follows these; one that can't is talked through first.

1. **One registry of places** (`AI_PLACES`), a prompt under each: the word's and the card's the admin's; the transcript's Proofread still a template (`AiTemplate`).
2. **One Prompt context**: every prompt draws from the pieces registry (`pieces.ts`), filled by `fillTemplate`, tags named as the pieces.
3. **One answer shape per place** (`ExplainShape`, `touchUpShape`, `ProofreadShape`): a reply and parts; why the model answered is always `reason`.
4. **One reader** (`apps/api/src/ai/index.ts` → `answer`): a cut, a refusal, broken JSON or the wrong shape is one failure, metered all the same.
5. **A message is words, actions, or both; one message is one call.** What differs between messages is which parts are required (the union of the ticked actions' Requires) and which left out.
6. **Panki's rules on top, as refines**, worded "Expected … Got …" (`unread.ts`).
7. **The meanings in one format, one judgement** (`judgement.ts`), drawn by one `JudgedRow`.
8. **What the AI writes is marked and accepted** (`ValueSource`, `--ai-ink`, the spark once, out of the words).
9. **One head** (`AiStatus`) and its Details.
10. **One failure wording**: "Panki AI's answer couldn't be used. Try again."; the technical reason in the Log.
11. **Cost before and after**; every call one usage row, its `what` the place.
12. **The spark is one component** (`AiSpark`).
13. **No skeleton for an AI wait** (`AiWaiting`).
14. **Send again at will.**
15. **Text only** (`docs/conventions/security.md`).
16. **One conversation component** (`AiConversation`) over one model (`conversation.ts`: main, and a branch per field where a place has them); a place hands in only what's its own. Proofread keeps its head and Undo all until it takes messages.

## The order

- [x] **Admin → Panki AI**: provider, model, key, On / Off; one usage ledger with transcription and Forvo.
- [x] **Explain in the Word pop-up**: on YouTube and any page, cost shown before, nothing saved.
- [x] **Touch up in the drawer**: sources on values; Meaning, Reading, Dictionary form, Pitch accent, Sentence judged; Explanation and Example sentences written; proposals accepted one by one or all.
- [x] **Touch up on the meanings format**: one judgement for the word and the card.
- [x] **The templates editor** in Settings → Panki AI (now actions, and Proofread's templates).
- [x] **Proofread** the transcript, its edits by themselves, undoable; editing Panki subtitles made plain.
- [x] **The clip follows the Sentence** on Accept.
- [x] **An AI value edited by hand stays the AI's**, Unmark as Panki AI's.
- [x] **The transcript beside the video**: the Panki panel's views (`docs/STATUS.md`).
- **Touch up, steered**
  - [x] 1. The card's conversation over the admin's prompt; User instructions.
  - [x] 1b. One answer shape for every message; Requires per message.
  - [x] 1c. The words, everywhere; the composer's actions as one dropdown.
  - [x] 2. Actions: the list and editor per place, Panki's and the account's, Restore, defaults and order; Requires, Leave out, Video context length; the conversation's settings fold (Video context length, Clear conversation); a chip goes to its part.
  - [ ] 3. **Example sentences, the field kind**: rows of scene, sentence and source, dragged, deleted, added; a list on the review card; a Paragraph field converted when its kind is changed; Touch up answering a list. Raises `EXTENSION_PROTOCOL`.
  - [x] 4. Explain in the same format: the admin's prompt, Grammar, Conjugation and Nuance as actions, the pop-up's conversation.
- [ ] **Rules**: automatic runs per card, video or pop-up, each with its cap. Proofread's automation lives here (when a transcription finishes, a part comes in, or after every chunk), and transcribing's own (starting by itself, the length limit) moves from the admin to each account.
- [ ] **Touch up in Panki itself**: the Add screen and a card opened in a deck. Blocked while the field mapping lives in each browser; the way out is the mapping moving to the account.
- [ ] **A model per action**: a provider and model per place or action, "Same as Panki AI's" to begin with, so Touch up can run on a stronger model than Explain.
- [ ] **Credits**: everything metered paid from a balance per account, granted by an admin until billing; at zero, every paid button says so.
- [ ] **Accounts**: sign-up, password reset, who may join, in place of `pnpm user:add`. Not AI work; next in the owner's order.
- [ ] Later: **billing** (payment for credits, per-user model choice).
- [ ] Later: **the outro, found by the AI**: where a video's own content ends, so it counts as finished from there, marked on the seek bar; a rule run once the transcript is whole.
- [ ] Later: **the three marks as a setting**: Fits / Close / Doesn't fit each a colour and a style, set on the Word pop-up tab with a preview.

## Open

- **Panki's answer format** under a prompt is confusing in every form tried. Someone writing a prompt must know the fixed shape Panki requires and what it does with each part. Its title is settled ("Panki's answer format – the AI must send the data back in this shape"); what's under it is postponed, to come up before Rules at the latest.
- **Example sentences on the review card**: All as a list to begin with, proposed; one a review, rotating, the other choice.
- **Example sentences already in Paragraph fields**: converted when the field's kind is changed, proposed.
- **A model per action, how it shows**: each choice's listed price beside it, and "Up to" worked out on that action's model, proposed.
- **How many of each action a dollar buys**, shown beside the model.
- **Rules or Credits**: where transcribing's move to each account lands.
- **Credits**: what a credit is worth, and who pays for a transcript everyone shares.
