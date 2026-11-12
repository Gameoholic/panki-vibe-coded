# Panki AI

> **Scope of this file.** Panki AI as built: its places, prompts, actions, conversations, and how a call is made and read. The epic's plan is `docs/AI.md`.

## The words

The code and the screens use these, and nothing else:

- A **place** is where a conversation lives (`AI_PLACES`: `word`, the Word pop-up; `card`, the capture drawer; `transcript`, the Panki panel's Proofread).
- A place's **prompt** is the admin's, one per place (the transcript's is a template, below).
- A **message** is anything sent: typed words, ticked actions, or both; one message, one call.
- An **action** is a saved message with knobs, Panki's own or the account's.
- An **answer** is the place's one shape: the **reply** and its **parts** (a card's keys, a word's meanings). A part that changes the card is a **proposal**.
- A **judgement** is the one scale: good, meh, bad (`judgement.ts`; a meaning's Fits, Close, Doesn't fit).

Older ids (`explain`, `touchUp`, `proofread`) are still read wherever they were written: the ledger's `what`, `ai_templates.action`, `Settings.aiDefaults`' keys, the shared `aiPrompts`' keys, a value's source (`placeOfKept`, `byPlaceKept`, `carriedSource`). Nothing kept was rewritten; what's written now is the place. Some names keep older words on purpose and stay so: the `{Follow-up question}` and `{Follow-up field}` tags (an admin's edited prompt names them), the keys `aiMaxFollowUps` and `aiMaxQuestionChars`, the ledger's `presets` column, `starter:proofread`.

## Providers, settings, keys, the ledger

- **The providers are one registry** (`packages/contracts/src/ai.ts` → `AI_PROVIDERS`): each its models with their listed price per million tokens in and out. A new model or price is one entry; a cost already metered keeps the price it had.
- **The settings are everyone's** (the shared store's Panki AI group: on, provider, model, the limits, the place prompts), changed by an admin, each change logged with who. A key never stored reads its default, so new settings need no migration.
- **The key** is the provider's row of `service_keys`, or the server's (`env.ts` → `aiKeys`); sent nowhere but the provider.
- **The ledger** (`usage`, contracts `usage.ts`) is every paid call's one row, Panki AI's, the engine's and Forvo's alike. The cost is worked out once, at the listed price, as the row is written: no provider says what a call cost (each answer carries its token counts; their dashboards lag), so every dollar Panki shows says "(est.)". An answer that came back and couldn't be used was still paid for, and is metered.

## The server's call

`apps/api/src/ai/`: `call.ts` (one deadline over the call and its body), `anthropic.ts`, `openai.ts`, `google.ts`, `index.ts` → `createAiClient().answer`.

- **The tokens are the provider's own count**; a provider that leaves them out is counted with `tokensAbout` and logged once.
- **The least thinking each model takes** (`least`), since thinking is billed as output and counted against the answer's limit: a model that thinks by default can spend the whole limit and send no text.
- **A 401/403 is "refused the key" before the provider's words are read**, so they can't echo the key.
- **Every call names its account to the provider as an opaque hash** (`safetyIdOf`, SHA-256 of the account's id): Anthropic's `metadata.user_id`, OpenAI's `safety_identifier`, so abuse is told apart by account rather than held against the owner's whole key. Google has no such field.
- **One reader, a fixed shape every call** (`schemaFor`): the place hands it a Zod shape, made JSON Schema with every bound, format and description stripped (`UNSENT`, from the strictest provider's limits; the bounds stay Zod's, checked on what comes back). Anthropic `output_config.format` (never tool use: a forced `tool_choice` is refused by the 5.5 models that think), OpenAI `response_format` strict, Google `responseJsonSchema`. **Shapes on the wire are plain**: every key required, no union, nothing nullable, "" for none (a provider refuses a schema past 16 unions); each place's reader turns the wire into the real shape before any rule (`answerOfWire`, `explainOfWire`).
- **A failure is one `AiError` in the owner's words** (declined, cut short, not JSON, not the shape, a rule broken), carrying the tokens billed, the raw answer and a technical detail always as expected against got (contracts `unread.ts`: `expectedGot`, `issueWords`, `KNOB_BREACHES`). A cut answer names the limit to raise. The route meters it and sends `error.unread` for the Log.
- **Nothing of a conversation is kept**, in a table or a log. The server rebuilds the first prompt on every call from the conversation's first message (`opening`).

## Pieces and prompts

- **Prompt context is one registry** (contracts `pieces.ts`, `prompt.ts`): every piece the field mapping fills a card with that is words, by the same id, plus pieces offered to prompts alone (surrounding subtitles, description, the account's two languages, the user's message, Panki's requirements…). The names are the contracts' because the API fills templates; the extension's `roles.ts` and `dataKinds.ts` take their names from there, so a piece has one name everywhere.
- **Each piece goes in a tag of its own name** (`tagOf`: spaces and hyphens become underscores, so "Follow-up field" is `<follow_up_field>`; a template copied before that spelling keeps its own). A template names a piece `{Name}`; `fillTemplate` fills the known ones, leaves an unknown name as typed, and drops a line whose variables all came out empty, so one prompt serves a video and a page.
- **The account's two languages and User instructions are the server's to fill** (`piecesFor`), from the account's settings, whatever the page sent; so are a Proofread's transcript pieces.
- **The admin's prompt per place** (`aiPrompts`, `adminPromptOf`): "" reads as Panki's own (`DEFAULT_TOUCH_UP_PROMPT`, `DEFAULT_EXPLAIN_PROMPT`), so Reset keeps following Panki's as it improves. It holds the pieces, what each part holds, the one shape, and last `{User instructions}` on a line of its own; nothing on how an answer reads, which is User instructions' alone (`srs.ts` → `DEFAULT_AI_INSTRUCTIONS`, every account's to begin with: a setting never stored reads it). User instructions go to both places, so they hold only what's true of both; what one place's fields want is its action's words (Touch up's Explanation and Example sentences lines).
- **Panki puts the message part into the admin's prompt** with the first message (`SEND_MESSAGE`, `WORD_MESSAGE`, shown read-only under each prompt in Admin, in plain view): where the prompt has `{First message}` (a piece of Panki's that's never a value, `withFirstMessage`), at its end without one; every later message is the message part alone. So an admin's saved prompt needs no change when Panki's protocol does. Panki's own prompts end with it, after User instructions. **The user's words and Panki's requirements are apart**: `{Message}` (`<user_message>`) holds the ticked actions' words then what was typed, never Panki's; `{Answer requirements}` (`<answer_requirements>`, `requirementsOf`) is Panki's line naming what must come back and what must be left alone.
- **A conversation shows what was typed, never what Panki adds:** a message's bubble names its actions alone, and User instructions aren't drawn in it; both stand in the head's Details (`AiStatus`).
- **What a call sends** (`prompt.ts` → `aiSent`, the server's and the page's alike): the prompt filled from the first message's pieces, then the conversation as sent (`said`), then the new message's own part. The page's "Up to" (`ceilingOf`) is worked out with the same function from the worker's kept Panki AI state: no request per pop-up.

## Actions

- **Panki's are a registry** (`aiActions.ts` → `AI_ACTIONS`); **an account's are a table** (`ai_actions`, every change a row of `ai_action_changes`): its own, and its copy of one of Panki's under Panki's id. Deleted is `removed_at`, never destroyed; Restore clears it; one of Panki's saved as Panki has it is Panki's again. A place's order and defaults are settings. **Read through the account, never the registry alone** (`accountActions.ts`, `actionOf`, `actionsOf`, `openingActionsOf`, `litOf`). Retired ids (`RETIRED_ACTION_IDS`) stay in an account's rows, read by nothing.
- **The knobs**:
  - `requires`: the parts that must come back (a card's keys, `"reply"`; a word's parts).
  - `leaves`: the parts the model must leave alone. Never one the same action requires; across a message's ticked actions **Requires wins** (`leftOutFor`).
  - `seconds`: how much of the video the action needs.
- **Actions are one flat list** in the account's order; an `under` kept in a row from when one could stand under another is read by nothing. Each field's own Touch up is retired (`RETIRED_ACTION_IDS`).
- **A message's knobs broken fail it whole**: a required part untouched, a required reply empty, a left-out part answered. The one checker decides it before any other rule (`touchUpProblem`, `explainProblem`), with plain words for the owner and expected-against-got for the Log; the call fails like any unusable answer (metered, Try again resending it unchanged). Nothing of it lands. Whether a reply should be empty is the actions' own words, not a rule in code.
- **How much of the video** (`reachOf`, `widerOf`): at least what the conversation's Video context length says, an action's `seconds` when further; the first message's reach cuts `{Surrounding video subtitles}`, a later message reaching further gets its own `{Wider video subtitles}` in its own part, so the first prompt stays as it was. Kept and sent in seconds each way; shown and typed as the whole length. The server drops `wider` a message's actions don't ask for.

## The conversation

`packages/contracts/src/conversation.ts` is the model's one home, its comment the full account, tested in `test/conversation.test.ts`. In short: **main**, and for the card a **branch per field**; every reply is a **commit** where its question was asked; a branch commit that changes a field merges the branch into main; whenever main's tip moves every other branch resets to it. A message is sent with `historyOf` where it's asked. Accept and Dismiss aren't commits: every message already sends the card as it stands. A question on its way is never a commit.

- **Conversation knobs** (`ConversationKnobs`, the composer's settings fold): Video context length (applies from the next message, starting again with each card or word; each change a note in main) and Clear conversation (each place back to how it opened; the card's values and their sources left as they are).
- **Limits**: Max messages counts every message after the first; Max message length holds what was typed; a card's answer length is shared by the keys required (`sendTokens`), all of it for a message requiring none. Ask before and Show the cost are the account's amounts (`asksFirst`, `showsCost`).

## The word's place: Explain

`ui/Explain.tsx` in the pop-up (`LookupBody`'s `explain` part). One shape (`prompt.ts` → `ExplainShape`): the reply, the meanings judged ([] for untouched) and a proposed meaning. **The wire keeps the prompt's words** (`"accuracy": fits | close | wrong`), read into the judgement before any rule, so nothing past the reader sees them. The server makes `{Meaning}` itself (`meaningsPiece`, each meaning's words and index alone) and refuses an answer whose indexes aren't exactly those sent, each once (`meaningsWhole`), or whose proposed meaning isn't there exactly when nothing fits. **The verdicts are drawn on the pop-up's own meaning rows** (`marksOf`, `JudgedRow`, the one drawing of a judged meaning, the drawer's Meaning dropdown included); while a message judging them is out, the rows wait under `AiWaiting`.

## The card's place: Touch up

**The AI judges; Panki types, rejects and draws.**

- **One shape for every message** (`touchUp.ts` → `touchUpShape(keys, now, meaningCount)`, built per card): `reply`, and a key per field the message may answer, each answered or left untouched. The server checks and sorts; **the drawer makes every verdict itself** from the answer against what it sent (`fieldVerdictOf`, `meaningVerdictOf`), so the rule for each verdict has one home in the contracts.
- **Panki's rules** (`touchUpProblem`), each broken one failing the message: a why everywhere; a field sent empty not judged, only filled; a proposal exactly when a field isn't judged good; Example sentences in pairs, a scene line before each; the Meaning's rows one per index sent; a proposed meaning exactly when no row is good, never one whose words are a row's (spaces and punctuation aside); and an answer that says nothing at all.
- **The Meaning field is the one truth of the Meaning** (`glossesOf`, `readMeaning`): split on `;`, `；` and line breaks; a dictionary meaning is ticked only while all its glosses stand in it in order and side by side; every run of glosses left over is a custom meaning. Ticking appends a meaning's glosses, unticking takes exactly its run out. `tidyMeaning` rejoins with "; " when sent, added or accepted, never while typed. Custom meanings are sent as rows after the dictionary's, judged like any row, never corrected. `{Meaning}` never marks what's ticked, so the model can't anchor on the pick.
- **The Sentence is picked as subtitle lines by number, never written** (`SentenceWire`: `first`, `last`): the card's prompt numbers the subtitles a line each (`numberedSubtitles`, through `cardPiecesOf` for the first prompt and `sendPieces` for a message's wider ones; the server and the page's Details alike, what goes to the server unnumbered), and the reader copies the lines named from the subtitles that message held (`sentenceLinesOf`: its wider ones, else the surrounding), the numbers put in order and held to the lines there are (`answerOfWire` → `sentenceOfWire`). No lines to pick from, none picked beside a judgement, or lines without the word as met (`runsOf`), and that part alone becomes `{error: "rewrote"}`, Panki's alone (the model's error codes are `MODEL_ERROR_IDS`). With no subtitles the Sentence isn't asked (`keysWithLines`; the drawer leaves it out off a video). A part set aside is kept on its commit (`Commit.aside`) and said under the reply.
- **A field sent empty may stay empty**: answered with a why and nothing proposed, it reads as nothing to change (`fieldOfWire`); the Explanation leans on it, so no per-field action is needed to skip it.
- **The clip follows an accepted Sentence** (`youtube.tsx` → `endsOfWords`, `saidEnds`, the same as the as-said clip's): the run nearest the clip's start, ends to the hundredth, at least `CLIP_MIN`; none (the clip stays) when the words aren't there, their end isn't known yet, or the clip would pass `CLIP_MAX_SECONDS`. The note says the times Accept will use before it's pressed. Kept as `CaptureFacts.clipBySentence`.
- **The drawer** (`ui/Panel.tsx`, drawn with the web's `components/TouchUp.tsx` and `AiRun.tsx`): what comes back replaces only the keys it answered. A message dims the fields it requires. Fields with a waiting proposal are drawn first (`useHoist`, FLIP over every child so the preview slides too; a row holding the focus keeps its place). A chip goes to its field: the drawer's own scroller brought to it, the page around it never scrolled. A word or dictionary entry changed lets every proposal go.

## Where a value came from

`card.ts` → `ValueSource`: each value's source is worked out at Add (`sourcesOf`): the AI's while the field is, else the role that filled it, the owner's where nothing fills it; sent with every card and example write, kept per value. **An AI value edited by hand stays the AI's** (`aiSourceNow`: `edited: true` once its words differ); it's the owner's only when they press Unmark as Panki AI's. A value sent without `edited` reads as not edited, so older clients need no protocol bump. **Duplicates compare true values only** (`apartOf` leaves AI values out). An AI value is drawn in `--ai-ink` wherever shown, the spark standing once, out of the text.

## The transcript's place: Proofread

A run, not a conversation: Proofread's edits are the transcript's, with Undo. It runs a template (`TEMPLATED_PLACE_IDS`, the transcript alone; `starter:proofread`, each account's own in `ai_templates`).

- **The page** (`transcribe/proofreader.ts`): a run is the whole video, a part or one row; its lines go by their words' ids, at most `PROOFREAD_CALL_CHARS` a call (`batchesOf`), one run id the page mints across a long video's calls, so Undo all takes the whole run back. What comes back is taken into the transcript at once.
- **The server** (`POST /api/ai/transcript`, held to Editing Panki subtitles): reads the lines as they stand now (`409` when a word isn't living any more), fills `{Transcript}`, `{Edited by hand}`, `{Unsure words}` and a row's surrounding lines from the store (`proofreadPieces`, overriding anything the page sent under those names), holds the answer to `proofreadProblem` (a line not sent or named twice, empty, without a reason, or rewritten past a correction's length), passes over a line given back as it reads, and lays every other onto its words with `realignLine`: every word whose text changed is an AI fix with the run, model, template and reason.
- **Whichever came later wins**: a word a person edited is changed like any other (the prompt asks for it only when sure), and a person's edit after is the latest. Undone, a fix stands aside (`undone_at`), one step back, by word or by run. The engine's confidence per word is kept (`logprob`), `unsure` under `UNSURE_BELOW`.
- On the rows a word Panki AI edited is lit with a spark (`editedAt`); the editors show what was heard and why, with Undo (`transcribing.md` → "Editing by hand").

## The extension's side

- **The worker keeps Panki AI's state** as `kept.ts`'s `ai` entry (tagged with the sign-in, never the key), replaced by the `ai` of every answer or refusal (`putKept`). See `kept.md`.
- **The page's video pieces** (`youtube.tsx` → `videoPieces`, a `VideoMore`): the title, channel and link at the moment, the description off the page, and `around(seconds)`, the lines shown cut about the moment.
- **The web never imports the extension.** What both draw lives in the web (`components/AiRun.tsx`, `AiConversation.tsx`, `TouchUp.tsx`, `JudgedRow.tsx`, `Fold.tsx`, the explainers in `explainers/`), and `Panel.tsx` and `Explain.tsx` still decide everything. The explainers on Settings → Panki AI play the real components on made-up answers; nothing is ever sent.

**Unproven:** the providers taking these schemas (Google's `responseJsonSchema` beside `thinkingConfig` above all); models leaving untouched what a message doesn't ask about; a call that times out after the provider began is billed by it and not metered.
