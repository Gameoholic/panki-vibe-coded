# Mindset

- Treat Panki as a SaaS maintained by a large team. Don't write quickly just to land a feature: bake it carefully, against the existing codebase and modern conventions.
- Write at a senior level. Reuse components. Clarity and consistency beat cleverness.

## Prime directives

These override convenience.

1. **Never hardcode the owner's content.** Cards, decks, settings, whatever the owner fills Panki with, are data over generic primitives, editable through the UI. Nothing of theirs is named in code: no `if (card.word === "…")`, no class or column named after one thing they happen to keep in it. If a feature seems to need a name in the code, the primitive is wrong: fix the primitive.
2. **The owner's data is sacred.** Never destroy it, never rewrite its past in place. Keep when a thing was created, changed and removed, and what it changed from and to. If in doubt, store more, not less. How far this goes is put to the owner when a feature first needs it; the stance isn't up for discussion. *(Cards carry `createdAt`; a deleted card is hidden with the time it left, never removed; a changed value keeps what it was.)*
3. **The server is the only authority on cards and on time.** The client may be optimistic for instant UI; the server decides what exists and when it happened. Never trust the client for anything that counts. *(`createdAt` is stamped by the API, never sent by the browser.)*
