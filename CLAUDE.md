# Panki

A flashcard app for Japanese vocabulary, for the owner alone, on a Windows PC and an Android phone's browser, served from a small VPS. Built as if it were a large-team SaaS: clean, reused, careful, secure. Code quality and doing things properly are the point, not just "does it work".

This file is the index; the content lives in `docs/`. Read the docs before touching anything, and keep them current.

## The one rule above all others

**Never hardcode the owner's content.** Cards, decks and settings are data the owner edits through the UI; nothing of theirs is named in code: no `if (card.word === "…")`, no column named after one thing they happen to keep in it (`docs/conventions/mindset.md`).

## The docs

**Read at the start of every task, every prompt:** `docs/STATUS.md`, `docs/PREFERENCES.md` and every file in `docs/conventions/`. The rest on demand. What goes where: `docs/PREFERENCES.md` → "Where each thing is written".

| Doc | What it's for | Read |
| --- | --- | --- |
| [docs/STATUS.md](docs/STATUS.md) | Built and in use, built but not yet seen, under way | Every task |
| [docs/PREFERENCES.md](docs/PREFERENCES.md) | How Claude works with the owner | Every task |
| [docs/conventions/](docs/conventions/README.md) | How code is written, one file per topic | Every task |
| [docs/COMPONENTS.md](docs/COMPONENTS.md) | What exists to build the UI with, one line a piece | When building UI |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → [docs/architecture/](docs/architecture/) | How it's built, one file per area | The area touched |
| [docs/RUNNING.md](docs/RUNNING.md) | Run, build, deploy, load the extension; the commands; where the data lives | When running or deploying |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Why it exists, who it's for, how it must feel, the features | On a product call |
| [docs/BACKLOG.md](docs/BACKLOG.md) | What the owner wants next; nothing there is approved | When picking what's next |
| [docs/AI.md](docs/AI.md), [docs/DOCS.md](docs/DOCS.md), [docs/STREAKS.md](docs/STREAKS.md), [docs/BLUR.md](docs/BLUR.md), [docs/SENTENCE.md](docs/SENTENCE.md) | Epic plans: why, settled, the order, open | During the epic |
| [README.md](README.md) | The VPS pull-and-restart block, the owner's alone | Never written to |

## Never open a browser

- Claude never runs, drives, simulates or screenshots a browser, unless the owner asks for it in that very message.
- A bug is fixed from the owner's words and screenshot by reading the code; the only checks are `pnpm typecheck` and `pnpm build`; the owner is the one who looks.
- The one exception is skeleton work, checked against a scratch Panki, never the owner's data (`docs/PREFERENCES.md` → Tooling).

## Stack

pnpm monorepo on Node 22: `apps/web` (React 19 + Vite + TypeScript), `apps/api` (Express 5 + TypeScript, SQLite through `node:sqlite`, run with `tsx`), `apps/extension` (the browser extension, Manifest V3, built of the web's own components and styles; `pnpm build` writes `apps/extension/dist/chrome` and `dist/firefox`, loaded into the browser by hand, never deployed), `packages/contracts` (Zod schemas, the one source of truth for shapes, consumed as source so nothing has to be rebuilt). `pnpm dev` runs both; the web on http://127.0.0.1:5173 proxies `/api` to the API on 127.0.0.1:3001. Details in `docs/architecture/shape.md`.
