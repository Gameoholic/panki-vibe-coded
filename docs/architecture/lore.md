# Lore, security, deploy and traps

> **Scope of this file.** The traps that cost real time, the security architecture, and what deploying means for the code. How to deploy is `docs/RUNNING.md`.

## Traps

Each is load-bearing: re-solve it before removing what guards against it.

- **Zod probes `new Function` as its first shape is made,** which an extension's pages refuse and report as an error. `z.config({ jitless: true })` helps only before any shape exists, and the contracts make theirs as they're imported: `apps/extension/src/setup.ts` is the first import of every entry.
- **A script built as one file gets no `process.env.NODE_ENV`** (Vite's library mode), and React dies asking for `process`. `apps/extension/scripts/build.mjs` defines it.
- **From outside a shadow root, an event's target is the root's host.** Whatever decides whether a press was inside a menu reads the press's path (`composedPath()`, `useDismiss`), never its target.
- **`crypto.randomUUID` exists only on a secure page.** A page's script runs on http pages too; the extension's ids come from `uuid.ts`, made of `getRandomValues`.
- **A message between an extension's parts carries JSON, not bytes** (in Chrome): a clip goes to the worker as base64.
- **A data address is cut at its last comma:** a recording's type, `video/webm;codecs=vp9,opus`, has one.
- **A button that paints no background of its own is the browser's grey `buttonface`.** `.btn` sets `background: transparent`; each variant paints its own.
- **A box of several lines grows with `field-sizing: content`,** which only Chrome has: `rows=3` is the floor and the fallback, `resize: none` keeps the browser's grip off it. The phone's bottom bar hides while an `input` or a `textarea` has focus, or the keyboard squeezes it.
- **Reordering is pointer events, not HTML5 drag and drop** (Android Chrome starts no native drag from a touch). `useDragOrder` serves mouse and finger: `touch-action: none` on the grip, pointer capture, the grip refocused after a move by key.
- **React's `onWheel` is passive,** so it can't stop the page scrolling. `FlowCanvas` adds its own with `{ passive: false }`.
- **What a carried tile is over is read from where the tiles lay when the drag began:** the board redraws under the pointer, and `elementFromPoint` finds the tile's own landing place, so two tiles trade places forever. `useGridDrag` measures every slot once, on the lift.
- **What a body reader's callback throws is nobody's:** a throw inside `express.raw`'s callback (a full disk) takes the process down. An upload is two handlers (`routes/media.ts`): the first picks the reader, the second does the work.
- **`res.sendFile` needs `root`,** or a data folder under a dot-folder (`.local`) answers `404` for every file. Its callback stays quiet once the headers are out: a browser skipping through a clip drops the request part-way.
- **A hoisted `function` doesn't keep a narrowing** made before it; an arrow assigned after the guard does.
- **Windows can't tell `Mark.tsx` from `mark.ts`:** two files in one folder never share a name up to case.
- **`localhost` costs about a second a request on Windows** (Node tries IPv6 first): bind and target `127.0.0.1` everywhere.
- **Windows can't delete or move a file still open** (`EBUSY`): close a database before removing its file, in tests too.
- **Chrome on a phone paints a blue tap highlight** over whatever was tapped, the whole review card included. `app.css` sets `-webkit-tap-highlight-color: transparent` on everything.
- **A full disk fails the write with a 500;** nothing refuses an upload ahead of it.
- **The SRS starters are synced as every account opens:** an edit to `srsStarters.ts` that breaks `NewSrsType`'s rules is left unapplied, logged as `[srs] … couldn't be brought up to what the app defines`. Parse each starter with `NewSrsType` before pushing, and look for that line after a deploy that changes one.

## Migrations under a running dev server

The owner's `pnpm dev` runs the API with `tsx watch`, which runs a new migration step on their real dev data the moment it's saved. A step saved in two edits runs half-written and is counted done; the rules that follow are `PREFERENCES.md` → Tooling.

## Security architecture

Panki self-hosts on a VPS shared with other services, so **containment is the priority** and the realistic risk is the supply chain.

- **No outbound calls but the owner's chosen hosts, called by the API alone:** Forvo (`apifree.forvo.com`), ElevenLabs (`api.elevenlabs.io`), Panki AI's providers (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`), and YouTube's image servers, no key (`i.ytimg.com`; a channel's picture from `yt<n>.ggpht.com` / `yt<n>.googleusercontent.com`, an address read off the page, checked against those hosts, no redirect followed: `pictures.ts`). The web and the extension call nothing but Panki.
- **Every outbound call carries a deadline** (`AbortSignal.timeout`; `outbound.ts` tells a timeout apart, so it's said as slow, not unreachable): Forvo 20 s, a picture 15 s, a Panki AI call 60 s, a piece at the engine 2 min, the engine's account 20 s, a whole video 10 s per minute of it, between 2 and 15 min.
- **The API binds `127.0.0.1` only** (`env.ts`); nothing reaches it but through nginx. The sign-in (`api.md` → "Sessions") is defence in depth on top.
- **Every input is validated at the boundary;** a JSON body is 64 KB at most, but Panki AI's, read by their own routes once signed in. A file is held to an allow-list of types that can't carry a script and believed only as far as its first bytes (`data-model.md` → "A file on a card").
- **The extension is held to the same:** it calls one address, the owner's Panki; asks the browser for the least it can; a page's script holds no secret and calls no network; what it draws on a page is sealed from that page.
- Run non-root (the `panki` user), the data folder its own alone.

## Deploy

How is `docs/RUNNING.md`. Every push to `main` that typechecks and builds reaches the owner's real data within minutes; CI runs no tests, so those two are the only gate. What the code keeps true for it:

- nginx's `client_max_body_size` allows the largest upload (`DICTIONARY_MAX_BYTES`, 200 MB).
- A backup is the whole `PANKI_DATA_DIR`: a row without its file is a card that can't play. `pnpm backup` is safe beside the running API because each database is snapshotted with `VACUUM INTO` through a read-only connection; pruning (`backups.ts` → `pruneSnapshots`) touches only folders named like a snapshot; a backup folder inside the data is refused (`env.ts`).
- **Stopping** (SIGINT): requests under way finish, the databases close, or the process exits as it is after 1.5 s (`index.ts`); the journal keeps every committed write, and every browser write can be retried.

## Web traps

- **State.** The server is the authority; the client may be optimistic. Anything another device must agree on goes to the server; how a screen looks right now can stay on the device. No global store. When a stored shape changes, old data is normalised on read, never rewritten.
- **Phones and touch.** `(hover: none)`: a control hidden with `opacity: 0` still takes a tap. `(pointer: coarse)`: small targets get room from an invisible `::before`. A text field under 16px makes iOS zoom. `100dvh` with `100vh` before it; the viewport meta's `interactive-widget=resizes-content`.
- **Themes.** Text on a filled, text-coloured button uses the surface token, never `#fff`. The inline script in `index.html` sets `data-theme` before first paint and repeats `themes.ts`'s ids: a new theme is added to both. Native fields take their colours from the tokens.
- **Menus** open `position: fixed` beside what opened them, placed every frame by `useAnchored`, so no scrolling box cuts one off. A field's `autoFocus` is lost if its panel is still `display: none` as it mounts.
- **Animation.** Move an element by animating `transform` from a static anchor, never `left` / `top`.
- **TypeScript.** `tsc --noEmit` on a "references shell" `tsconfig.json` (`"files": []`) checks nothing; every package typechecks its real config.
