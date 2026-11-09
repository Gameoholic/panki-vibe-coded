# Architecture

> **Scope of this file.** How the system is built — backend, frontend, data model, and the hard-won implementation lore.
> **Write here:** system structure, data model, API surface, component maps, state flow, security architecture, dev-environment facts, and any non-obvious trap that cost real time.
> **Don't write here:** code-style rules (→ `conventions/`), why the product exists or how it should feel (→ `PRODUCT.md`), unbuilt features (→ `BACKLOG.md`); how to run and deploy it (→ `RUNNING.md`).
> **Modify this file whenever the design genuinely changes.** Keep it honest about what exists vs. what's intended.

---

This page is the index; the text lives in `docs/architecture/`, one file per area. Read the one the task touches.

| File | What it covers |
| --- | --- |
| [shape.md](architecture/shape.md) | Where the build stands as a whole; the workspace's packages, scripts and environment |
| [data-model.md](architecture/data-model.md) | Every database, table and kept shape; migrations; the SRS's data (New before the first stage, a card put aside, other examples, Undo, today's cards) |
| [api.md](architecture/api.md) | The API's routes, what each takes and answers |
| [web.md](architecture/web.md) | The web app: screens, state, a card's layout, Listen first, a review filling the screen, room on the disk |
| [extension.md](architecture/extension.md) | The extension as a whole: the strip, the capture drawer, the Panki panel's views, one full screen, a field that holds a link |
| [dictionary.md](architecture/dictionary.md) | The dictionary: its files, what each provides, dictionaries kept on Panki, pointing, words in the decks marked, the pop-up's layout |
| [forvo.md](architecture/forvo.md) | Word audio from Forvo |
| [transcribing.md](architecture/transcribing.md) | Transcribing a video: engine, modes, chunks, the strip, editing, Proofread |
| [ai.md](architecture/ai.md) | Panki AI: places, prompts, actions, sources, conversations, Explain, Touch up, the explainers |
| [watching.md](architecture/watching.md) | Video tracking, the modules, where you stopped, finished, YouTube's own pages, the player bar |
| [updates.md](architecture/updates.md) | The extension kept up to date without a store |
| [kept.md](architecture/kept.md) | What the extension keeps of Panki's and how it hears of a change; this browser's own settings |
| [lore.md](architecture/lore.md) | Implementation lore, security architecture, the owner's machine, verifying in an isolated instance, deploy, traps, migrations under a running dev server |
