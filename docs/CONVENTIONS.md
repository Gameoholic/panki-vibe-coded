# Conventions

> **Scope of this file.** How we write code here and how we work together. The rules that keep a hundred-developer codebase clean — applied to a one-developer one.
> **Write here:** code style, the prime directives, reuse rules, dependency policy, security coding rules, data discipline, and the working process.
> **Don't write here:** system structure or implementation lore (→ `ARCHITECTURE.md`), product rationale (→ `PRODUCT.md`), or future features (→ `BACKLOG.md`).

**Where these came from.** They were carried over from the owner's last project, the Board, where each was earned — most of them by Claude getting it wrong first. An example marked *(Board)* shows what a rule looked like there; swap in Panki's own example once it has one.

---

## The mindset

Treat this as a SaaS maintained by a large team. **Don't write quickly just to land a feature — bake it carefully**, considering the existing codebase and modern conventions. Reuse components. Write at a senior level. The owner is learning this codebase and cannot audit every line, so clarity and consistency beat cleverness every time.

## Prime directives (these override convenience)

1. **Never hardcode the owner's content.** Cards, decks, settings — whatever the owner fills Panki with — are **data over generic primitives**, editable through the UI. Nothing of theirs is named in code: no `if (card.word === "…")`, no class or column named after one thing they happen to keep in it. If a feature seems to need a name in the code, the primitive is wrong — fix the primitive.
2. **The owner's data is sacred.** Never destroy it, never rewrite its past in place. Keep when a thing was created, changed and removed, and what it changed from and to. If in doubt, store more, not less. How far this goes is put to the owner when a feature first needs it; the stance isn't up for discussion. *(Cards carry `createdAt`; a deleted card is hidden with the time it left, never removed, and a changed value keeps what it was.)*
3. **The server is the only authority on cards and on time.** The client may be optimistic for instant UI; the server decides what exists and when it happened. Never trust the client for anything that counts. *(Step 1: `createdAt` is stamped by the API, never sent by the browser.)*

## Code style

- **Strict typing, no escape hatches.** `strict`, and no `any`. Ever. Cross a trust boundary with a Zod schema, not a cast.
- **Match the existing style:** 2-space indentation, double-quoted strings, semicolons, in TS/TSX. Set with the first file, never drifts.
- **Comments explain *why*, never *what*** — and only when the *why* is non-obvious: a trap, a decision.
- Keep functions and components focused. If one is doing two jobs, split it.

## Build once — reuse relentlessly

Duplication means something was modelled wrong. One concept, one component, one place:

- **One of each primitive.** One tooltip, one form, one field, one panel, one confirm, one menu, one row. Two things that must look alike are one component used twice — identical *by construction*.
- **One base per layer, shared by every kind.** When two screens, cards or lists do the same job, what they share lives in a base, and each kind only declares its options and renders its cells.
- **What a thing offers is declared in one file,** in a catalog; each place picks what makes sense for it.
- **`COMPONENTS.md` is the list of what exists.** Look there before building anything, and add a line there in the same change that adds a shared piece.
- **Nothing the browser draws by itself.** A hint is the app's tooltip, never a `title` attribute; a form is `<Form>` (`noValidate`), never a bare `<form>` whose field rules raise Chrome's "Please fill out this field."; a yes/no is the app's confirm, never `confirm()`. The full table heads `COMPONENTS.md`. The one exception the owner asked for: the Plain player style is the browser's own audio and video controls, a choice beside Panki's own Player (2026-10-15).
- **A switch says what's true right now.** Its words are its current state ("On" / "Off", "Required" / "Optional", "Shown" / "Hidden"), never one label that stays the same when it flips. `Toggle` takes both (`says: { on, off }`), so neither can be left out. The owner, 2026-10-15, having had to say it more than once: "checkboxes reflect current state."
- **No unstyled controls.** Every button is `<Button>`, which carries one of the app's button classes — never a classless `<button>`.
- **Colours come from theme tokens, never literals.** A literal `#fff` breaks every dark theme. Need a colour no token covers? Add a token in `theme.css`, with a value in each theme.
- **A phone is one of the app's screens, not an afterthought.** Nothing reachable by hover alone, nothing wider than the screen, every text field 16px, one phone breakpoint in one place.
- When a rule or magic number needs to exist, give it **one home**. Retuning means editing one object, not hunting through components.

## Registries — a family of things is one list of entries

When the product has several things of one family — kinds of card, options a screen offers, effects on a value — each is **one entry in one registry** declaring what it is, what it does and how it shows. Nothing else knows an entry by name. Entries compose by one fixed rule, never by special case; every entry shows itself the same way; a new *kind* of entry is a design change to raise with the owner first; tests cover the combinations.

## In-app text

Every string the owner sees is product copy: it says what the thing *is* or *does for them*, in the product's own words.

- **Never echo the request.** The prompt describes a change; the UI describes the product.
- **Don't narrate the mechanism**, and never say "the user" or "the app".
- **A hint has to earn its place.** One that only repeats the label is dropped.
- **No explaining line under a setting or a choice by default.** A setting is its label and its control; a line under it (`Setting`'s `why`), a note beside a choice or a sentence saying how something behaves is added only when the owner asks for one, or when without it the setting would do something no one could guess (a cost, a loss). The owner, 2026-10-16, of "In Preview and in reviews it's written small over the words of the part below it": "we don't need this description, it's super self-explanatory already. Why did you add it? Prevent this in the future." (They'd cut such lines before, 2026-10-10 and 2026-10-15.)
- **The owner's names win.** When they name a label, use it exactly.
- **It reads like a professional product.** A setting has a plain noun for a label ("Field name", "Position") and a switch says its state ("Shown" / "Hidden"), never a quirky phrase ("Its name: Over it"). The owner, 2026-10-15: "'its name' sounds wrong and unprofessional if this were a SaaS."

## Dependencies

Few and justified. Supply chain is the realistic security risk, so every dependency is a liability. **One library per job.** Prefer the platform (CSS, `Intl`, `crypto.randomUUID`, `node:sqlite`, native drag and drop) and what's installed. A new dependency is a choice to put to the owner.

**No code lifted from a userscript, a gist or an unvetted repo**, however close it looks to the job (the owner, 2026-10-11, when the extension was planned: "don't use a userscript blindly, especially if it's old; I'd rather you do the code yourself because I can trust you over it for security"). Other tools (asbplayer, a recorder script) are read for *how* they do a thing; the code is written here, against the platform's documented APIs, and understood line by line.

## Security (coding rules)

- **Validate every input at the trust boundary** with the shared Zod schema. Don't trust request bodies.
- **No hard-coded secrets.** Never log credentials, tokens or key material — log presence/type only.
- **No outbound network calls** — no CDN links, remote fonts, telemetry, error reporting. Nothing that phones home. A feature that genuinely needs a remote service (a dictionary audio source, say) is a decision the owner makes, scoped to that one host. *(2026-10-15: Forvo, for word audio, `*.forvo.com` only, called by the API alone, with the owner's key.)*
- **Nothing generated goes on a card unmarked.** No text-to-speech, no LLM-written content. The owner said it can be wrong. The one generated thing Panki makes is a video's transcript, by a speech engine (the owner's decision, 2026-10-17, because the site's own captions were worse: "AI is so good at transcribing"); it's named as Panki's transcript wherever it's shown or filled from, beside the site's captions, never passed off as the video's own words, and a word of it is fixed by hand where it's wrong. Readings and meanings still come from a dictionary or from the owner. The engine is one more host the owner chose, called by the API alone with the owner's key, like Forvo.
- **User-defined filters or queries are structured data compiled to parameterised SQL.** Never string interpolation, never `eval`.
- Use HTTPS for anything over the wire once a deploy exists.

## Data discipline (coding rules)

- **Anything that's added up is an integer**, in the smallest unit that will ever matter — never a float. Only the display divides.
- **Round once.** Effects that combine compose into one result, rounded once, half-up.
- **Derived, never tracked.** A value that can be computed from state is computed, every time.
- **What happened is frozen where it happened;** what a thing *is* is read live. Retuning a setting never rewrites the past.
- **Time is passed in,** never read from a global clock inside logic — so it can be tested and pinned. *(Step 1: the API takes `now` as a function.)*
- **A write can be retried safely.** *(Step 1: the browser mints the card's id, so a retried POST returns the same card instead of a second one.)*
- **Shapes have one source of truth:** `packages/contracts`, imported by both apps, which is also what validates at the boundary. Never restate a shape.

## How we work together

### The pace

- **The owner dictates steps one at a time and reviews each before the next.** Don't build ahead. Don't add scope unprompted. Don't generate speculative specs or docs.
- **Never regenerate a subsystem wholesale.** Change what was asked, inside what's there.
- **Propose the smallest thing that solves the stated pain.** An extra is an optional one-liner at most, never part of the recommendation.
- **Suggest from the backlog, never build ahead of it.** When a request is close to a parked idea, offer it concretely as a suggestion they approve.
- **A deliberate choice stays chosen.** Don't simplify, widen or "make it consistent" later. They're recorded in `PRODUCT.md` → "Deliberate scope decisions".

### Before acting

- **Show approaches before acting.** For a task with more than one valid path, present 2–3 options with trade-offs and wait. State assumptions.
- **Before changing owner-created content or doing anything destructive**, describe exactly what will change and wait for confirmation.
- **The owner's data and running dev servers are live.** Never test against them; give a one-line heads-up before any command that could touch them. A watch-mode server hot-reloads *your* edits into *their* live data.
- **The owner runs `pnpm dev`; Claude never does.** Since 2026-10-11 ("stop the shell server, I will do pnpm dev from now on") Claude doesn't start, restart or leave a dev server running, and doesn't stop the owner's. A round ends with `pnpm typecheck` and `pnpm build`; their servers hot-reload the edits. When a step needs the servers down, say so in one line and let them do it.
- **Stay inside the project directory.**
- **Never start a shell command with `cd`** (the owner, 2026-10-16, after being asked for permission over and over in auto mode). The permission check can't follow a `cd`, so every `cd … && grep …` asks the owner, even inside the project. Commands run from the repo root with paths from there (`pnpm --dir apps/api exec tsx …` where a package's own folder matters); reading and searching files is the Read, Grep and Glob tools, not `cat`, `head` or `grep` in a shell. The project's `.claude/settings.json` has a hook that refuses any Bash command starting with `cd` and says why. The same goes for a command's output piped into `Select-String`, `grep` or the like (the check takes the pattern for a file it can't see and asks): `pnpm typecheck` and `pnpm build` are run bare and their whole output read.

### Asking

- **Read for intent.** Ask only when two readings lead to different work.
- **Just fix obvious things** in what you're touching, and say so in the report.
- **Don't re-ask an answered question.** A rule here, a doc, or an earlier answer decides it.
- **No list of calls at the end of a report.** The owner, 2026-10-11: "don't need a summary or 'calls?' anymore". It used to be a numbered list every turn; it isn't any more. A question is asked only when two readings lead to different work, in one line; everything else is decided, built, and said in a few words if it's worth saying at all.
- **The owner's calls are product calls; implementation calls are Claude's.** What a thing is, where it lives, how it feels, what it's called: theirs. How it's hashed, what the table is shaped like, what a limit is: decided and stated as a default in the report, never asked. The owner, 2026-10-10: "I don't wanna approve the code or implementation, that's yours to do."
- **"Execute, don't ask"** means build it fully with sensible defaults and list those defaults.
- **An open product choice with no clear winner becomes a setting,** with the default picked by feel, rather than a question. The owner, 2026-10-14: "go with your gut feeling or make it into an actual setting… I love customizability."

### Building

- **One step, typechecked, then stop.** Build exactly what the owner asked, report, stop. The owner tries it in the running app.
- **Never open a browser.** The owner's rule since 2026-10-10: Claude does not run, drive, simulate or screenshot a browser in any form (headless Chrome or Firefox, `pnpm verify`, a scratch server started to look at a page, the `panki-verify` agent) unless the owner asks for it in that very message. A visual bug is fixed from the owner's words and screenshot by reading the code; a feature is built from the request. The checks Claude runs are `pnpm typecheck` and `pnpm build`, nothing else. It took too long, cost too much and kept asking for permissions, and the owner would rather look themselves.
- **Say it hasn't been seen.** A report never says "works" or "verified" about something visual; it says what changed and what the owner should look at.
- **Can't explain it from the code? Ask, don't hunt.** One short question (which browser, what zoom, what was clicked) beats any amount of reproducing. The owner's desktop browser is Firefox.
- **More from the owner mid-work is more work, never a stop.** A message that arrives while something is being built (it may cut a tool call short, and the harness may say to stop and wait) adds to the list. Finish everything asked before it, do the new thing too, and don't ask whether to continue. Nothing is dropped or parked as a question unless the owner's own words say stop. A report never lists asked-for work as "not done, shall I?".
- **Anything that takes a while to set up is saved on purpose, and leaving it unsaved asks first.** The owner's standard since 2026-10-10 (the SRS editor is the first and the pattern; the next long editor follows it, never its own scheme). Nothing reaches the API until **Save**, which sits in the screen's header beside the words that say whether there are unsaved changes (not at the bottom of the page; the owner moved it). There is no Discard button: leaving the screen is how changes are dropped. Leaving with unsaved changes asks, in the app's one pop-up (`Modal`, the single allowed exception to "no centred modal", at the owner's ask): Stay, Discard changes, or Save and leave (the screen hands `App` an `UnsavedGuard`; `go` and the browser's back both stop for it). A reload or a closed tab gets the browser's own "leave site?" question, the one place the browser's wording is allowed because a page can't draw its own there. **No drafts:** unsaved work lives on the screen and nowhere else; the owner tried a draft kept in the browser and rejected it the same day ("I'm ok with losing progress if I lose connection. I just don't like the draft system"). A new thing made this way does not exist until its first Save. Short forms (a deck's name, a card) keep saving the way they do.
- **Whatever sits beside a field lines up with the field's input, in every state.** An icon, a number, a hint or a × next to a `TextField` is centred on the input itself, never on the row. A row aligned by `align-items: end` (or centred as a whole) with a `margin-bottom` to fake it breaks the moment the field's error appears under it and makes the row taller. The row and the field share one grid: the field is `display: contents`, its label, input and error each get a grid row, and everything else sits on the input's row (`.stage-row` and `.answer-name` in `app.css` are the pattern). Before reporting a row with a field in it, read its CSS once with the error showing in mind. The owner, 2026-10-10: "icon and text are misaligned… please stop doing that!"
- **A batch that spans the API and the web may be split across agents** (`panki-api`, `panki-web`), at the owner's ask on 2026-10-10 ("feel free to delegate to multiple agents as long as it gets the work done faster and better"). The contracts are written first and both briefs carry the exact route surface, so the two sides meet; the lead integrates, runs the one typecheck/build gate and writes the docs. Never two agents in one file.
- **A failing test is checked before it's blamed.** Run it on the untouched code first.
- **The whole build passes before anything is called ready.**
- **Commit only when asked.** The owner commits and pushes themselves.

### Reporting

- **A report is a few lines at most.** The owner, 2026-10-11: "keep your summarization response to me extremely minimal if at all". They asked for the change and will look at it themselves, so it isn't described back to them. What's said: only the things they couldn't guess (never "built", "not seen running" or "reload the extension": the owner, 2026-10-18, "stop saying" that, since every change is unseen and they know to reload): a reading of their words that could have gone another way, something left out, something that will surprise. No summary of what was done, no checklist, no list of calls. (Before this it was two sentences, how to try it, the numbered questions and a ticked checklist.) **The owner doesn't read the report at all** (2026-10-16: "fyi i never read your summaries"; a question at the end of one went unseen for two turns). So it's a line or two, and a question that's really needed comes first, alone, in one short line, never after a description of the work.
- **Plain words.** Say what a thing does for the owner before how it's made. No jargon the owner hasn't used themselves.

### Designing with the owner

- **Build it, don't pitch it** (the owner, 2026-10-16: "i aint gonna read ur artifact just implement however u think ... ill see how it works and tell u if its how i meant or not"). For a change to what exists, Claude decides, builds it fully and says in a line that it's there to try; the owner judges it in the running app. No options page and no waiting for a pick. Before this, a look or a mechanic was shown first as a page of options (A, B, C…) to pick from.
- **A bigger mechanic is simulated first,** as a page they can play with, carrying "Calls to confirm" and "Decided".
- **Expect tuning by feel.** Keep those numbers in one home so each round is one edit.

### Docs

- **Keep these docs current.** They are the memory that survives a cleared chat.
- **A standing rule goes in the docs, not only in memory,** in the same turn the owner says "always", "never" or "from now on".
