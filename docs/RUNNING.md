# Running Panki

> **Scope of this file.** How to run it, build it, deploy it and load the extension; where the data lives; the commands. This was the README's until 2026-10-17, when the owner made the README the pull-and-restart block alone.
> **Write here:** run and deploy commands, a few words each; where things are on disk.
> **Don't write here:** rules (→ `CONVENTIONS.md`), how it's built (→ `ARCHITECTURE.md`), what the owner wants next (→ `BACKLOG.md`).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies. |
| `pnpm dev` | Run the web (http://127.0.0.1:5173) and the API (127.0.0.1:3001). |
| `pnpm build` | Build the web and the extension (`apps/extension/dist`). |
| `pnpm typecheck` | Type-check everything. |
| `pnpm user:add <name> <password>` | Make an account. Stop the API first. The first account takes the data from before accounts. |
| `pnpm user:password <name> <new>` | Change a password. Signs every device out. |
| `pnpm user:list` | List accounts. |
| `pnpm user:admin <name>` | Make an account an admin: it alone changes the keys, the dictionaries on Panki and how transcribing runs. `pnpm user:admin <name> off` takes it back. |
| `pnpm space` | Disk used per account (video, audio, images, the rest) and what's left on the disk. |
| `pnpm backup [dir]` | A copy of all the data, safe while the API runs: the databases as a dated snapshot, the files copied once. Into `apps/api/backups/` unless a folder is given (`PANKI_BACKUP_DIR` changes the default). See Backing up. |
| `pnpm icons` | Redraw the app icons from the mark. |
| `pnpm verify` | Headless-browser check of the UI. Not kept up since 2026-10-10. |

Under 2 GB left on the disk, every signed-in user sees a warning on their home screen. `PANKI_LOW_SPACE_MB` changes the 2 GB.

## Data and environment

Data lives under `apps/api/data/`: `auth.sqlite` (accounts and signed-in devices), `shared.sqlite` (what everyone shares: the keys, the dictionaries kept on Panki, the transcription settings and every transcript) with `shared/dictionaries/` holding the dictionary zips, and `users/<account id>/`, one folder per account: its `panki.sqlite` and a `media` folder with the files its cards hold. A backup is the whole folder.

`PANKI_DATA_DIR` puts the data elsewhere, `PANKI_BACKUP_DIR` the backups (default: a `backups` folder beside the data), `PORT` moves the API, `PANKI_WEB_PORT` / `PANKI_API_PORT` move the web dev server and its proxy target, `PANKI_TIME_ZONE` sets whose clock a day turns over on (default: the machine's), `PANKI_FORVO_KEY` is a Forvo key for word audio and `PANKI_ELEVENLABS_KEY` an ElevenLabs key for transcribing, each used when none is typed in Settings → Admin.

## Backing up

`pnpm backup` can run while the API is up. It writes, under the backup folder:

- `<moment>/auth.sqlite`, `<moment>/shared.sqlite`, `<moment>/users/<account id>/panki.sqlite`: every database as it stood at that moment, one folder per run.
- `files/`: every file on a card and every dictionary zip, in the folders they came from. A file never changes, so each is copied once; a run after the first copies only what's new.

Nothing in the backup folder is ever deleted by it: old `<moment>` folders are yours to remove. On the VPS, a cron line runs it (`crontab -e`): `0 4 * * * cd /opt/panki-vibe-coded && PANKI_TIME_ZONE=Asia/Jerusalem pnpm backup /var/backups/panki`. Copying that folder off the machine now and then is what makes it a backup.

To restore: stop the API (`pm2 stop panki-api`), copy the chosen `<moment>` folder's databases over the data folder's (`auth.sqlite`, `shared.sqlite`, each `users/<account id>/panki.sqlite`; delete any `-wal` / `-shm` beside them first), copy `files/shared/dictionaries` to `shared/dictionaries` and each `files/users/<account id>/media` to `users/<account id>/media`, start the API.

## Deploying

The pull-and-restart block is the README. The first time, on the VPS (Node 22.13 or newer, for the built-in SQLite):

```
git clone git@github.com:Gameoholic/panki-vibe-coded.git /opt/panki-vibe-coded
cd /opt/panki-vibe-coded
pnpm install
pnpm build
pnpm user:add <name> <password>
pnpm user:admin <name>
PORT=4001 PANKI_TIME_ZONE=Asia/Jerusalem pm2 start pnpm --name panki-api -- --filter @panki/api start
pm2 save
```

nginx serves `apps/web/dist` (`try_files $uri /index.html`) and proxies `/api/` to the API's port with `proxy_set_header Host $host`, `X-Forwarded-For $remote_addr` and `X-Forwarded-Proto $scheme` (the API trusts loopback's forwarded headers; the sign-in cookie is `Secure` when the request came over HTTPS), `client_max_body_size 200m` (a dictionary zip; a clip is 40 MB at most) and `proxy_read_timeout 180s` (a minute-long piece at the engine). HTTPS by certbot. A pull that changes `pnpm-lock.yaml` needs `pnpm install` before the build.

## The extension

`pnpm build` builds it with everything else, into `apps/extension/dist/chrome` and `apps/extension/dist/firefox`. It is never deployed: it lives in your browser.

1. **Chrome:** open `chrome://extensions`, switch on Developer mode, press Load unpacked, choose `apps/extension/dist/chrome`. It stays until you remove it. After a rebuild, press the reload arrow on its card, then reload any YouTube tab that was already open.
2. **Firefox:** open `about:debugging#/runtime/this-firefox`, press Load Temporary Add-on, choose `apps/extension/dist/firefox/manifest.json`. Firefox forgets it when it closes; keeping it needs Mozilla's signature, which hasn't been asked for.
3. Its own page opens the first time (later: right-click its toolbar button, Options). Type where your Panki is (`127.0.0.1:5173` while `pnpm dev` runs, the domain once deployed), your name and password, and allow the address when the browser asks.
4. On that page, under Field mapping, choose a deck and what fills each of its fields: the selected word, its dictionary form, reading and meaning, the sentence, the sentence's video or audio, the word's video or audio, the link to the video. Switch Field mapping on for the deck first. Fields left on None are typed in the drawer.
5. Under Dictionaries, import a dictionary: a zip in Yomitan's format (JMdict, Jitendex, a frequency list, pitch accents). Under Looking up words, choose where it works; for sites other than YouTube, press Allow when the browser asks.
6. Open a YouTube video and press a word in the line under the player: the drawer opens beside the video. Or select something on any page, right-click, Add to Panki. The first time, the drawer asks which deck; it remembers.
7. Hold Shift and point at a Japanese word, on YouTube or any allowed page: the popup shows what it means. Let go of Shift on the word to keep it open; Add opens the drawer on it.

**The local dev account** (testing only, never on the VPS): name `daniel`, password `danieldaniel123`. Made with `pnpm user:add daniel danieldaniel123` on 2026-10-10; it holds the data from before accounts. Its "Test" deck is test data written by Claude at the owner's ask (148 cards as of 2026-10-11: a word, its meaning, an example sentence on the front and the sentence's translation on the back), not checked against a dictionary; nothing in it is for real study.
