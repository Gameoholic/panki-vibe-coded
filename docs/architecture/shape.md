# The shape

> **Scope of this file.** The workspace's shape: its packages, scripts and environment. What's built and in use is `docs/STATUS.md`.

A pnpm workspace on Node 22 (`>=22.13`, where `node:sqlite` needs no flag):

| Package | What | Run |
| --- | --- | --- |
| `packages/contracts` | Zod schemas, the one source of truth for shapes, and the pure rules both apps run (`cardProblems`, the SRS's `resolve`, `dueAt`). Consumed **as source** (`exports` points at `src/index.ts`), so nothing is rebuilt after an edit. Its tests run with `tsx --test`. | `pnpm typecheck`, `pnpm --filter @panki/contracts test` |
| `apps/api` | Express 5 + TypeScript, SQLite through `node:sqlite`. Run with `tsx` in dev and prod, no emit. | `pnpm dev` → 127.0.0.1:3001 |
| `apps/web` | React 19 + Vite + TypeScript. The dev server proxies `/api` to the API. | `pnpm dev` → http://127.0.0.1:5173 |
| `apps/extension` | The browser extension (Manifest V3; React + TypeScript, built by Vite through `scripts/build.mjs`). It imports the contracts and the web's own components and styles as source (`@web/*` → `apps/web/src`), so a card, a button and a colour are the same thing in both. No dev server: it's built, then loaded into the browser by hand. | `pnpm build` → `apps/extension/dist/chrome`, `dist/firefox` |
| `scripts/verify.mjs` (with `scripts/lib/scratch.mjs`) | Drives the real UI in headless Chrome on a scratch instance. The owner's to run; Claude never does. | `pnpm verify` |
| `scripts/icons.mjs` | Renders the mark into the tab and home-screen icon files, from its one home. | `pnpm icons` |
| `scripts/docs-check.mjs` | Fails when what loads every session passes its budget. | `pnpm docs:check` |

Root: `pnpm dev` runs both apps; `pnpm typecheck`, `pnpm build`; the account, space and backup commands are `docs/RUNNING.md`'s.

**Environment.** The API's is read in one place, `apps/api/src/env.ts`; the web dev server's in `apps/web/vite.config.ts`. What differs between the owner's instance and a scratch one: `PORT` (the API, 3001), `PANKI_DATA_DIR` (`apps/api/data`), `PANKI_WEB_PORT` (5173), `PANKI_API_PORT` (what the web dev server proxies to, 3001). `PANKI_TIME_ZONE` stands in only for an account never opened yet (every account's day turns over in its own zone, the device's to begin with); it defaults to the machine's zone, and a wrong name fails at startup. The services' keys (`PANKI_FORVO_KEY`, `PANKI_ELEVENLABS_KEY`, `PANKI_ANTHROPIC_KEY`, `PANKI_OPENAI_KEY`, `PANKI_GOOGLE_KEY`) are used only where no admin typed one in Settings. `PANKI_EXTENSION_DIR` is where the API finds the built extension it hands out (`apps/extension/dist`); `PANKI_BACKUP_DIR`, `PANKI_BACKUP_SLOTS` and `PANKI_LOW_SPACE_MB` are `docs/RUNNING.md`'s.
