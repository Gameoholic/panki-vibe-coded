# Where we are, and the shape

> **Scope of this file.** Where the build stands as a whole, and the workspace's shape: its packages, scripts and environment.

## Where we actually are

**Steps 1 to 13 are built:** decks, cards in a deck, flipping through a deck, the mark with its opening moment, the navigation (a hub behind a Home tab, a Settings tab), a deck's settings (rename, delete, its SRS type), card types (what fields a card has and what each holds; every deck is made with one), the SRS (step 8): SRS types with their stages, answers and rules, a review that shows what's due and answers that move the card, and the settings that run every review; then, together on 2026-10-10, the silo (step 9: sittings, every answer's seconds, a ledger of everything else), signing in (step 10: one database per account, a ten-year cookie, accounts from the terminal), the Review door lit only with something to do (11), the Stats tab (12) and the home's tiles (13); themes (14); and media on cards (step 15, 2026-10-11: a field can hold a sound, a clip or a picture, the file kept beside the account's database), the first of the five steps that lead to the extension (the plan and its build brief: https://claude.ai/artifact/D3jDa6x2TLya8Z68geVBZc); and the extension itself (steps 16 and 17, 2026-10-11, built together at the owner's ask and **never run by Claude**: a browser extension that adds a word from a YouTube caption or from any page's selection, with the line's own clip); and changing and deleting a card from its deck's list (step 18, 2026-10-11). On 2026-10-17, at the owner's "ok implement everything": AI subtitles (a video transcribed by ElevenLabs Scribe v2 through the API, following the viewer in the extension; "Transcribing a video"), with an admin flag on accounts and a shared store for what every account shares (`shared.sqlite`), built in one go and never run. Everything below describes that, and nothing more exists.

## Shape

A pnpm workspace on Node 22 (`>=22.13`, where `node:sqlite` needs no flag):

| Package | What | Run |
| --- | --- | --- |
| `packages/contracts` | Zod schemas, the one source of truth for shapes, and the pure rules both apps run (`cardProblems`, the SRS's `resolve`, `dueAt`). Consumed **as source** (`exports` points at `src/index.ts`), so nothing is rebuilt after an edit. | `pnpm typecheck` |
| `apps/api` | Express 5 + TypeScript, SQLite through `node:sqlite`. Run with `tsx` (dev and prod), no emit. | `pnpm dev` → 127.0.0.1:3001 |
| `apps/web` | React 19 + Vite + TypeScript. The dev server proxies `/api` to the API. | `pnpm dev` → http://127.0.0.1:5173 |
| `apps/extension` | The browser extension (Manifest V3; React + TypeScript, built by Vite through `scripts/build.mjs`). It imports the contracts and the web's own components and styles as source (`@web/*` → `apps/web/src`), so a card, a button and a colour are the same thing in both. No dev server: it's built, then loaded into the browser by hand. | `pnpm build` → `apps/extension/dist/chrome`, `dist/firefox` |
| `scripts/verify.mjs` (with `scripts/lib/scratch.mjs`, the scratch instance and the Chrome driver) | Drives the real UI in headless Chrome on a scratch instance. The owner's to run; Claude never does. | `pnpm verify` |
| `scripts/icons.mjs` | Renders the mark into the tab and home-screen icon files, from its one home. | `pnpm icons` |

Root: `pnpm dev` runs both apps, `pnpm typecheck`, `pnpm build`, `pnpm verify`.

Environment (everything that differs between the owner's instance and a scratch one): `PORT` (API, default 3001), `PANKI_DATA_DIR` (default `apps/api/data`), `PANKI_WEB_PORT` (default 5173), `PANKI_API_PORT` (what the web dev server proxies to, default 3001), `PANKI_TIME_ZONE` (only what stands in for an account never opened yet: every account's day turns over in its own zone, the device's to begin with, since 2026-10-21; default the machine's own zone, and a wrong name fails at startup), `PANKI_FORVO_KEY` (a Forvo key for word audio, used by any account that hasn't typed its own in Settings; none by default).
