# Architecture

> **Scope of this file.** How the system is built — backend, frontend, data model, and the hard-won implementation lore.
> **Write here:** system structure, data model, API surface, component maps, state flow, security architecture, dev-environment facts, and any non-obvious trap that cost real time.
> **Don't write here:** code-style rules (→ `conventions/`), why the product exists or how it should feel (→ `PRODUCT.md`), unbuilt features (→ `BACKLOG.md`); how to run and deploy it (→ `RUNNING.md`).
> **Modify this file whenever the design genuinely changes.** Keep it honest about what exists vs. what's intended.

---

This page is the index; the text lives in `docs/architecture/`, one file per area. Read the one the task touches.

| File | What it covers |
| --- | --- |
| [shape.md](architecture/shape.md) | The workspace's packages, scripts and environment |
| [data-model.md](architecture/data-model.md) | The data folder, the invariants every table keeps, migrations and the rules for one, each database's tables, the schedule, holds, flags, Undo, other examples and pins, files, the silo and the stats |
| [api.md](architecture/api.md) | The API's conventions, sessions and the sign-in, the state header and the extension protocol, the route groups and what's surprising under a deck |
| [web.md](architecture/web.md) | The web app: routing and state, unsaved work, signing in, the ledger, keys, the one card, Listen first, the review and how it fits the window or fills the screen, the Layout tab, files, the SRS editor, the frame, the board, skeletons |
| [extension.md](architecture/extension.md) | The extension as a whole: permissions, the worker as the one way to Panki, closed shadow roots and their traps, the Panki panel and its views, one full screen, the capture drawer, reading the line, the clip, the seek bar |
| [dictionary.md](architecture/dictionary.md) | The dictionary: IndexedDB and the file reader, dictionaries kept on Panki, what each provides, endings, looking up and splitting, pointing and hover, words in the decks marked, the pop-up's layout |
| [forvo.md](architecture/forvo.md) | Word audio from Forvo: server-side, kept for everyone, copied into the account on a pick |
| [transcribing.md](architecture/transcribing.md) | Transcribing a video: the modes and the whole-video download, the silent player and its clock, the chunks, the follower, the source, the lines, editing by hand, the stitch |
| [ai.md](architecture/ai.md) | Panki AI: the words, providers and the ledger, the server's call and the one reader, pieces and prompts, actions and knobs, the conversation, Explain, Touch up, value sources, Proofread |
| [watching.md](architecture/watching.md) | Video tracking per browser, the modules, finished, where you stopped and `panki=at`, YouTube's own pages, the utilities and the player bar |
| [updates.md](architecture/updates.md) | The extension kept up to date without a store: fingerprint and protocol, the zip, the scripts' rules |
| [kept.md](architecture/kept.md) | What the extension keeps of Panki's and the state header; this browser's own settings and how every page hears of a change |
| [lore.md](architecture/lore.md) | The traps that cost real time, migrations under a running dev server, the security architecture, what deploying asks of the code, web traps |
