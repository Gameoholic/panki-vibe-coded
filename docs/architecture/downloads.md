# Downloads: a video kept in this browser to watch without signal

> **Scope of this file.** Downloading a video: the doorway script, the hidden player kept, what's kept and how it's ordered, one page at a time, the store, the menu and the options tab. The plan and what's next: `docs/DOWNLOADS.md`.

A video is downloaded by copying what YouTube's own player hands the browser to play, while the video plays through fast in a hidden frame. Nothing is fetched by Panki and nothing of YouTube's is called or changed: the copy is the pieces themselves, untouched, in the quality YouTube sent.

| Part | What it is |
| --- | --- |
| `content/doorway.ts` → `doorway.js` | The doorway script: in the site's own page (`world: "MAIN"`), every frame, `document_start`; inert without the download mark |
| `download/mark.ts` | The two words in the frame's address and the word a piece carries; imports nothing, so the doorway script carries nothing else |
| `download/download.ts` | Every tunable number (`DOWNLOAD`), the qualities, the shapes, and the stretch arithmetic (`coveredOf`, `firstGap`, `gainedOf`) |
| `download/runner.ts` | On a YouTube page: asks for a download to run, runs it in the hidden player, sends each piece on (`createDownloads`) |
| `download/store.ts` | The extension's own IndexedDB `panki-downloads`, the worker's and the options page's alone |
| `download/words.ts` | A download in words, the same in the menu and on the options page |
| `ui/PanelMenu.tsx` → `DownloadRows`, `options/Downloads.tsx` | The H Menu's Download group; the options page's Downloads tab |

## The doorway script

- **The browser's one standard way for a page to play streamed video** is Media Source Extensions: the player makes a `MediaSource`, a `SourceBuffer` per stream (`addSourceBuffer` with a MIME type), and appends the bytes it fetched (`appendBuffer`). The script wraps those three (and `changeType`) on the prototypes, in the frame only: each piece goes to the browser untouched, and a copy, taken at once (the player may reuse its bytes), is posted to the parent page once `update` says the browser took it in, with the stream's number (its `MediaSource`, counted), its length, its MIME type, its `timestampOffset` and append window, and its buffered stretches before and after. Bytes travel as base64: a string crosses from the site's world to the content script in both browsers without Firefox's wrappers, and the worker needs text anyway.
- **The quality** (`HEIGHT_PARAM`): asked whether a video type taller than it can play (`MediaSource.isTypeSupported` with `width=`/`height=` in the type, `MediaCapabilities.decodingInfo`), it answers no, so the player picks among the rest. A **ceiling only**: the player still picks lower when the connection can't keep up at speed, and that is what's kept. Forcing the pick would mean calling the site's own player.
- **Wakes only on the mark**: `pankiKeep` (the run's random id) in the frame's address, which only `silent.ts` writes, and only for a download; everywhere else it reads the address and stops. It posts only to the site's own origin.

## The hidden player, kept

`transcribe/silent.ts` → `SilentUse` `{ kind: "keep", mark, height }`: the same frame, page fallbacks, stray guard, stuck reopen and ad detection as transcribing, with the mark and height in the frame's address, the frame the quality's size in screen pixels (16:9, `height / devicePixelRatio` tall, since the site never loads a picture much taller than it's drawn), and its sound straight into the gain of zero with no tap and no cutter. Played at `DOWNLOAD.speed` (4×).

## What's kept, and in what order

- **One page at a time** (`claimDownload`): every YouTube page asks the worker every `claimEveryMs` while it runs nothing; the worker hands out the oldest unfinished download not waiting to be retried, only while no page holds one, and marks it held by that tab (`heldBy`, `heldAt`). Each piece kept, and a word every `holdEveryMs`, renews the hold; one not renewed for `holdMs` is free for any page, and a page whose hold went elsewhere is told to stop at its next word. A page opened again in the same tab takes its own back at once. So a download goes on as the viewer moves between videos (the frame lives in the page across the site's own navigations), and the next YouTube page takes one up after a tab closes.
- **A run** starts at the first moment not covered (`firstGap`), skips a stretch kept by an earlier run when it reaches one (`skipMs`), and at the video's end, once every piece on its way is kept, goes back for what's missing, twice at most per part. It's whole when both streams cover the video but its last `endSlackMs`.
- **Only the video's streams**: a piece of a stream whose length is more than `durationSlackMs` off the video's is dropped (an ad plays in a `MediaSource` of its own); pieces of a stream whose length isn't known yet wait for it (`heldMax`).
- **Each piece** (`KeptPiece`) is kept under `[videoId, seq]`, `seq` the video's own count in the order pieces arrived, with its stream (`video` / `audio`, from its MIME type), its MIME type, whether it's a **start piece** (by its first bytes: a WebM's EBML header or an MP4's `ftyp`; what a player must be given before a stream's frames), the stretch it added to its stream's buffer (`gainedOf`, null for a start piece), the offset and window, its size and when. Its bytes are a `Blob` in a store of their own under the same key, so listing never reads them. A start piece the player hands again at a seek is skipped when it's the same as the stream's last.
- **What playback will read** (step 4): every piece in `seq` order; a stream's frames each after the latest start piece of their stream before them, so a quality switched mid-video (a new start piece) is followed.
- **Stopping** (`holdDownload` `stopped`): the hidden player failing, blocked, nothing copied in `nothingSeconds` of video, or a part that won't come in; the download waits `retryAfterMs(tries)` (30 s, then 1, 2, 5 and 10 min) before any page tries again, its reason shown as Waiting. A piece kept clears it. Nothing stops for good by itself: offline looks like any other failure.

## The store

`panki-downloads` (`videos`, `pieces`, `bytes`), in the extension's own origin, room unlimited (`unlimitedStorage`). The worker writes (`downloadPiece` arrives as base64, decoded there, `DOWNLOAD.pieceMaxBytes` the most one may be); the options page reads and removes directly, as it does the dictionaries. How a download stands (`stateOf`: done, going while held, waiting), how much is in and its size are worked out from the pieces on every read, never kept. Remove deletes the video's three stores' rows by key range: these are a copy of YouTube's, not the owner's data. Nothing goes to Panki.

## On screen

- **The menu** (H Menu): Download, between Panel and Panki. Download this video (greyed in an ad or before the length is known); Downloading / Waiting with the share and a thin bar (`--p`), the reason under Waiting; Downloaded with its size. Pressed while there, `Ask` hangs from it: Remove. Downloads… opens the options page's Downloads tab, with how many and their room. The menu reads the list again every `WATCH_MS` while open (another page's progress); the page running a download overlays its own progress live.
- **The options tab**, all this device's (`PerDevice` at its head): Downloads (a bar of each one's share of the room, the total, a row each with its still, name, channel and state, Remove asking first) and Quality (Download quality, a `Segmented` of `DOWNLOAD_QUALITIES`, kept as `downloadQuality`, copied onto each download as it's asked for). The still is a frame of the page's own video as Download is pressed, a small JPEG kept with the download: no thumbnail is fetched.

**Unproven:** that the site's player appends on the page's thread (MSE in a worker would leave nothing to copy: "YouTube's player gave nothing to copy"); that it states `width`/`height` in `isTypeSupported` and keeps to the answer; that its streams' lengths are set before their frames come; what the pieces look like in each browser (expected: separate video and audio streams, VP9 or AV1 in WebM or MP4 for the picture, Opus in WebM or AAC in MP4 for the sound, a start piece first and again at seeks and quality switches); `world: "MAIN"` content scripts and the base64 posts in Firefox; a frame playing at 4× in a tab in the background; the hidden frame's quality off screen.
