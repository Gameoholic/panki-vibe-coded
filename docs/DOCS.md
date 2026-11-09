# The docs themselves — the plan (started 2026-11-09)

> The brainstorm about Panki's docs, `CLAUDE.md` and Claude's memory. Nothing here is built until its box is ticked.

## Why (the owner, 2026-11-09)

Too much context goes to the docs (127K tokens before a word is typed, 25% of the window). They're unreadable, so the owner can't check that Claude keeps them right, can't tell code conventions from their own preferences, and can't see plans and progress. Fear: that fixing it loses the preferences and progress built up so far.

## What's wrong (Claude)

- `CLAUDE.md` imports the 291 KB `COMPONENTS.md` every session; that's most of the bill.
- Nearly every line carries its own history ("until the owner, 2026-10-29"), so the present has to be dug out of the past, and the files only grow.
- Code conventions, the owner's preferences and the product's state are mixed in one file each (the conventions file, `CLAUDE.md`'s "Active work", the memory folder, which repeated the conventions).

## Settled

- **Organise first, cut second** (the owner). The split comes before any rewriting; then each file is looked at for what to cut, refactor or rewrite.
- **Progressive disclosure** (the owner): what loads every session is tiny; a task reads the one file it needs; detail is a link away, never in the loaded file.
- **Models**: this conversation on Fable high, step sessions on Opus 5.5 high (defaults, not objected to).
- **No history file** (the owner, after reviewing the organising phase): git is the history. A doc states the present; a change replaces the old words; nothing is kept for history's sake. The docs hold two kinds of rules, **user preferences** (`docs/PREFERENCES.md`) and **conventions**, the conventions split into files by topic (`docs/conventions/`).
- **A rule is the rule alone** (the owner): no Why line, no date, no "the owner said", no "from memory" heading, no metadata. Plain statements, grouped, readable in two weeks from their words.

## The shape

| File | Holds | Read |
| --- | --- | --- |
| `CLAUDE.md` | The one rule, this table, the never-browser rule, the stack. ≤ 4 KB | Every session |
| `docs/STATUS.md` | Built / built but not yet seen / under way, the branch. The owner's "progress" | Every task |
| `docs/PREFERENCES.md` | How Claude works with the owner, as plain rules. The owner's "preferences" | Every task |
| `docs/conventions/*.md` | Code conventions alone, one file per topic | Every task |
| `docs/COMPONENTS.md` | One line per shared piece: name, file, what for | When building UI |
| `docs/architecture/*.md` | One file per area, present tense | The area touched |
| `docs/PRODUCT.md` | Each feature as it is today | On a product call |
| `docs/AI.md`, `PANEL.md`, `DOCS.md` | Epic plans: Why, Settled, Order, Open | During the epic |
| memory | Only what the repo can't hold: artifact URLs, the owner's profile, tooling notes; pointers otherwise | `MEMORY.md` every session, ≤ 3 KB |

A check, `pnpm docs:check`, fails when what loads every session passes 40 KB.

## The order

**Organise**

- [x] 1. `STATUS.md` out of `CLAUDE.md`'s "Active work"; `CLAUDE.md` down to its index; `COMPONENTS.md` no longer imported.
- [x] 2. The owner's preferences out of the conventions and the memory's feedback files; memory pruned to pointers.
- [x] 3. `ARCHITECTURE.md` cut into `docs/architecture/` by area, text unchanged.
- [x] 4. The check added, failing until the cutting is done.

Steps 1 to 4 done 2026-11-09, uncommitted for the owner to review: every session now loads 8.8 KB (`CLAUDE.md` 5.5 KB, the memory index 3.4 KB), from about 330 KB. `pnpm docs:check` fails on six docs over 60 KB (`COMPONENTS.md`, `PRODUCT.md`, `AI.md`, and `architecture/ai.md`, `data-model.md`, `web.md`), which the cutting steps bring under.

**Cut, refactor, rewrite** — one file per step, the owner reading the result of each

The owner's question (2026-11-09): is a 291 KB `COMPONENTS.md` really the efficient way to make Claude reuse components, and what else can go? Claude's answer, the compacting plan:

| File | Now | Target | How |
| --- | --- | --- | --- |
| `COMPONENTS.md` | 291 KB | ~15 KB, **generated** | The code is the registry. Each component, hook and one-home file gets a one-line comment at its top saying what it's for and what never to hand-roll instead; `pnpm docs:components` writes the table from those lines (59 components, 15 hooks, ~40 one-home files: ~120 lines). A doc that's a copy of the code rots; one written from it can't. Its "Never the browser's own" table is a convention and moves to `conventions/in-app-text.md`. Everything else in its rows (how a piece works inside, which owner pick it came from) is either in `architecture/` already or goes. |
| `architecture/*` | 486 KB | ~120 KB | Keep only what the code can't say: the shape, the invariants, the why, the traps. Cut: SQL schemas pasted whole (the migrations are the truth), route lists (the router is), narrated histories of a feature, "unproven" notes older than a week (the owner tried it or didn't), "the owner, date: quote" asides. `lore.md`'s "Verifying in an isolated instance" and "The owner's machine" go (the browser rule and `RUNNING.md` cover them). |
| `PRODUCT.md` | 190 KB | ~35 KB | By feature, not by step number: what it does from the user's view, one paragraph a feature; the principles and the design language kept; the scope decisions kept as a list. |
| `AI.md` | 164 KB | ~15 KB | Why / Settled / Order / Open. A built step's spec is dead weight: the code and `architecture/ai.md` hold it. |
| `STATUS.md` | 15 KB | ~5 KB | One line per not-yet-seen thing, grouped by area. |
| `PANEL.md` | 7 KB | 0 once its steps are done; fold into `STATUS.md` | |
| `RUNNING.md` | 12 KB | ~6 KB | Commands and where things live; prose cut. |

Expected total: ~1.2 MB → ~250 KB, with `COMPONENTS.md` never drifting from the code again.

- [x] 5. The rules files, made readable first: `docs/PREFERENCES.md` and `docs/conventions/*.md`, both as plain rules; `CLAUDE.md` ≤ 4 KB; `STATUS.md` plain; the history files removed.
- [ ] 6. `COMPONENTS.md` generated from a one-line header comment per piece (`pnpm docs:components`); its never/always table to `conventions/in-app-text.md`.
- [x] 7. The conventions (done in 5).
- [ ] 8. Each architecture file, present tense, the trail dropped.
- [ ] 9. `PRODUCT.md` by feature.
- [ ] 10. `AI.md`, `PANEL.md` trimmed to Why / Settled / Order / Open.
- [ ] 11. The agents and the brainstorm skill reread against the new files.

## Open

- Does `COMPONENTS.md` load every session once it's ≤ 30 KB? Default: no; a task that builds UI reads it, `conventions/reuse.md` saying so.
