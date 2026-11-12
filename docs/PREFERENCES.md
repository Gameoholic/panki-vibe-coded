# Preferences

How the owner wants Claude to work with them. How code is written is `docs/conventions/`; the product's state is `docs/STATUS.md`.

## One step at a time

- The owner picks each step and reviews it before the next. Build exactly what was asked, typecheck and build it, report, stop; the owner tries it.
- Propose the smallest thing that solves the stated pain. An extra is an optional one-liner at most, never part of the recommendation.
- No unprompted scope, no speculative specs or docs, nothing built ahead.
- Never regenerate a subsystem wholesale. Change what was asked, inside what's there.
- When a request is close to a backlog idea, offer it as a concrete suggestion; never build it unasked.
- A deliberate choice stays chosen: never simplify, widen or "make it consistent" later. They're listed in `docs/PRODUCT.md` → "Deliberate scope decisions".

## A new message adds work

- A message that arrives mid-work is more work, never a stop, even when it cuts a tool call short or the harness says to stop and wait.
- Finish everything asked before it and do the new thing too, in the same turn, without asking whether to carry on. Re-issue interrupted edits.
- Keep a running list of what's owed across interruptions, artifacts especially.
- Only the owner's own words ("stop", "don't do X") cancel anything. A report never lists asked-for work as "not done, shall I?".
- A permission denial of a risky action is not retried verbatim.

## Product calls are the owner's, implementation Claude's

- What a thing is, where it lives, how it feels, what it's called: the owner's call.
- How it's hashed, what a table looks like, what a limit is: Claude's call, decided and stated as a default, never asked.
- "Execute" means build it fully with sensible defaults and name them.
- A batch that spans the API and the web may be split across `panki-api` and `panki-web`: the contracts written first, both briefs carrying the exact route surface; the lead integrates, runs the one typecheck/build gate and writes the docs. Never two agents in one file.

## Asking

- Read for intent. Ask only when two readings lead to different work, in one short line.
- Never re-ask what a rule, a doc or an earlier answer decides.
- Just fix obvious things in what you're touching, and say so.
- Before changing the owner's own content or doing anything destructive, describe exactly what will change and wait for a yes.
- If the code can't explain a bug, ask one short question (which browser, what zoom, what was clicked) instead of hunting. The owner's desktop browser is Firefox.

## Reporting

- Every message to the owner is one sentence at most, reports and brainstorming included. Playbacks and proposals go in the plan file (`docs/<EPIC>.md`), never in chat.
- When the owner has asked several things since the last answer, the answer is a bullet per thing, each its one sentence, none left out.
- Artifacts are for the owner's end, docs for Claude's. Anything the owner is to read in a brainstorm or a plan (the playback, the proposals, the order, a preview) is published as an artifact page as well, kept current with the plan file; the plan file in `docs/` is what Claude reads back.
- The owner doesn't read reports: a question that's needed comes first, alone, in one short line.
- Say only what the owner couldn't guess: a reading of their words that could have gone another way, something left out, something that will surprise, a default chosen.
- No summary of what was done, no checklist, no list of calls, no artifact link.
- Never "built", "not seen running" or "reload the extension". Never "works" or "verified" about something visual.
- Plain words: what a thing does for the owner before how it's made; no jargon the owner hasn't used.
- Say when a change raised `EXTENSION_PROTOCOL`: the owner's extension says Update needed the moment it's pushed.

## Designing with the owner

- Build it, don't pitch it. For a change to what exists, decide, build it fully, and say in a line that it's there to try. No options page, no waiting for a pick.
- An artifact only when the owner asks for a page, or for a genuinely new large mechanic where building the wrong thing would be costly, and then ask first in one line. Such a mechanic is simulated as a page they can play with: the UI alone, with made-up data, no notes, no questions and no text about it on the page. Questions and problems come after the owner has seen it and before anything is built, one at a time in chat.
- An open product choice with no clear winner becomes a setting with a default picked by feel, not a question.
- A control that picks a value (speed, size, amount) offers a proper range in `Dropdown` or `Segmented`, the neutral one the default; never a single preset button that flips to one value.
- Product questions go one at a time: one question, wait for the answer, then the next, each with its recommendation.
- Expect tuning by feel; keep tunable numbers in one home so each round is one edit.
- A family of data has one registry and one name on every screen. Show where data comes from both ways (what a source provides, where a part's data comes from). State counts and facts read from the data, never inferred labels; when a part can be empty, say why.
- When the owner asks to "go beyond my words", do the reverse view and the legend too, not just the literal ask.

### The look and feel the owner wants

Every piece of UI built in Panki, the app and the extension, leans this way, and so does every page of ways: a modern SaaS product's, never a plain list of links. The page that set it: `types-tile/index.html`, the eight ways of folding Card types and SRS types into one home tile (`memory/artifacts.md`).
- **Calm before clever.** Few things on a screen, with room around them, and one accent; never panel on panel or every fact at once. A side fact (a time, a count) is a quiet line, not a hero; a choice with nothing in it (an answer given 0 times) is left out; what's for later folds to a line.
- **Spatial, not linear.** A thing moves, grows or opens where it is: a split whose half grows under the pointer, a 3D flip behind a small `Segmented`, a stack whose back card rises out from behind, a tile that blooms over its neighbours, satellites that swing out of a tile on an arc, a panel anchored to its tile with a filter and arrow keys.
- **Data in the shape.** A tile shows what's in it, not only its name: the SRS ladder as small bars, counts, names as chips, the links between things drawn as lines with what joins them (which deck), what isn't used dashed.
- **Motion with spring.** Short eased moves, a slight overshoot, a short delay before a hover opens anything; calm at rest, alive on touch; `prefers-reduced-motion` honoured.
- **Panki's own materials.** Its tokens, Urbanist, its icons, its tile sizes and radii, both themes; nothing that looks pasted in from another product.
- **Touch too.** What opens on hover opens on a tap on a phone; a tap outside or Esc closes it.
- **Several ways, boldest to plainest.** A page of ways offers about eight, each a different idea rather than a restyle, each playable, named by a letter and a word ("A Split"), and nothing else written on the page.

## Building

- The owner's data and running servers are live: never test against them, and give a one-line heads-up before any command that could touch them. A watch-mode server hot-reloads edits into their live data.
- Stay inside the project directory.
- A new card state or mark is traced to every place cards or words are drawn (grep every consumer of the same data); each is updated, or named in the report as left as it is.
- A failing test is run on the untouched code before it's blamed.
- Nothing is called ready until the whole build passes.
- Work on main. No branch or worktree of Claude's own unless the owner asks; a change the owner may want undone is one commit, so one revert takes it back.

## Tooling

- Files are changed with Edit and Write, never through the shell: no `sed -i`, heredocs, `head`/`tail` splices, `cat >>`, `node` edit scripts, shell variables like `$TEMP`, or chained commands. Every file: the repo, the scratchpad, artifacts, memory. Each of those makes the harness ask the owner for permission.
- A shell command is one plain step: `pnpm typecheck`, `pnpm build`, `git status`, `git add -A`, `git commit -m "…"`.
- A rename across many files is Grep, then Edit per file. A brief for another session spells this out as a rule and never allows a scripted rename.
- Never start a shell command with `cd` or `Set-Location`. Run from the repo root with paths from there; `pnpm --dir <pkg> exec …` where a package folder matters; scratch scripts by absolute path. A hook refuses any Bash command starting with `cd`.
- Never pipe a command's output into `grep`, `Select-String` or another filter. Run `pnpm typecheck` and `pnpm build` bare and read their whole output.
- Read, search and list files with Read, Grep and Glob, not `cat`, `head` or `grep` in a shell.
- The only checks are `pnpm typecheck` and `pnpm build`.
- The owner runs `pnpm dev`. Never start, restart or stop a dev server, nor kill its ports. When a step needs the servers down, say so in one line. Reading or writing their data through the running API is fine when they ask for a data change.
- Never open a browser: never run, drive, simulate or screenshot one (headless or not, `pnpm verify`, a scratch server to look at a page, the `panki-verify` agent) unless the owner asks for it in that very message. A visual bug is fixed from the owner's words and screenshot by reading the code, never reproduced first. Keep turns short.
- The one exception is skeleton work, checked against a scratch Panki: its own `PANKI_DATA_DIR` in the scratchpad, its own ports, a scratch account seeded over HTTP, the API behind a delaying proxy (`docs/RUNNING.md` → "A scratch Panki"). Never the owner's data, their dev server or panki.pro. The two states are compared by `getBoundingClientRect`, not by eye.
- A migration step is written whole in one Edit and never edited after its first save, even uncommitted: the owner's `tsx watch` runs each save on their dev data. While iterating, add steps. Order a data change so each in-between state only crashes, never writes: contracts, then `db.ts` reads and writes, the migration last. Check the result on a copy of `apps/api/data/users/*/panki.sqlite*` in the scratchpad, never the live file. A dev store left off is fixed by hand once, with a heads-up, never by a repair step in the code.
- Files are LF.

## Shipping

- Commit and push only when the owner says. When committing, `git add -A` (README.md included) and `git commit -m "…"` as two plain calls; never mention the README.
- A small change is tried on prod after a push; every push to main deploys. A rework the owner says so about stays on local dev, unpushed, until they're satisfied. A step's brief says which.
- A change that could hurt the owner's real data (a migration, anything touching cards or the ledger) is named in one line before it lands on main.

## Docs

- Keep the docs current; they're the memory that survives a cleared chat.
- A standing rule goes in the docs, not only in memory, in the same turn the owner says "always", "never" or "from now on".
- A doc states the present, in present tense, with no dates. A change replaces the old words; nothing is kept for history's sake.
- What loads every session (`CLAUDE.md`, its imports, the memory index) stays under the budget `pnpm docs:check` enforces.
- README.md is the owner's VPS pull-and-restart block alone, verbatim; never write to it. Its block lacks `pnpm install` on purpose.
- A new pnpm script gets one terse row in `docs/RUNNING.md`. A backlog item goes in `docs/BACKLOG.md` as the owner said it.

### Where each thing is written

| Doc | Holds | Not here |
| --- | --- | --- |
| `docs/STATUS.md` | Built and in use, built but not yet seen, under way; a line each with its doc | How a thing works |
| `docs/PREFERENCES.md` | How Claude works with the owner | How code is written |
| `docs/conventions/` | How code is written, one file per topic | How we work, system structure |
| `docs/COMPONENTS.md` | One line per shared component, hook and one-home file | How a piece works inside |
| `docs/ARCHITECTURE.md`, `docs/architecture/` | How it's built and why it's shaped so; data model, API, state flow, security architecture, dev traps | Code style, unbuilt features |
| `docs/PRODUCT.md` | Why it exists, who it's for, how it must feel; the features from the user's view; design language; deliberate scope decisions | Implementation, unbuilt ideas |
| `docs/RUNNING.md` | Run, build, deploy, load the extension; the commands; where the data lives | Rules, architecture, the backlog |
| `docs/BACKLOG.md` | What the owner wants next, as they said it; nothing there is approved | Anything approved or built |
| `docs/AI.md`, `DOCS.md` | An epic's plan: why, settled, the order ticked as steps land, open | How a built step works |
| `README.md` | The VPS block, the owner's | Anything at all |
