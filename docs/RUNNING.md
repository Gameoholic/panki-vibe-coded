# Running Panki

Run, build, deploy, load the extension; where the data lives.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies. |
| `pnpm dev` | The web on http://127.0.0.1:5173 and the API on 127.0.0.1:3001. |
| `pnpm build` | Build the web and the extension (`apps/extension/dist/chrome`, `dist/firefox`). |
| `pnpm typecheck` | Type-check everything. |
| `pnpm --dir packages/contracts test` | The contracts' unit tests. |
| `pnpm --dir apps/api test` | The API's unit tests (the replays of All reviews done and All new cards done, the migrations). |
| `pnpm user:add <name> <password>` | Make an account, with the API stopped. The first takes the data from before accounts. |
| `pnpm user:password <name> <new>` | Change a password; signs every device out. |
| `pnpm user:list` | List accounts. |
| `pnpm user:admin <name> [off]` | Make an account an admin, or take it back. |
| `pnpm space` | Disk used per account (video, audio, images, the rest) and what's left. |
| `pnpm backup [dir]` | Snapshot all the data, safe while the API runs (Backing up). |
| `pnpm pace:backtest <panki.sqlite>` | How far off a review's time left would have been over the past 30 days' sessions, each way of working it out side by side; read-only, run on a copy. |
| `pnpm icons` | Redraw the app icons from the mark. |
| `pnpm docs:check` | Fails when what loads every session (the memory index at `PANKI_MEMORY_INDEX` included) passes 40 KB, or a doc under `docs/` 60 KB. |
| `pnpm docs:components` | Write `docs/COMPONENTS.md` from each piece's header comment. |
| `pnpm verify` | A headless-browser check of the UI. Not kept up. |

## Data and environment

Under `apps/api/data/`: `auth.sqlite` (accounts, signed-in devices), `shared.sqlite` (what everyone shares: keys, dictionaries kept on Panki, transcription settings, transcripts, Forvo's recordings) with `shared/dictionaries/`, and `users/<account id>/` holding the account's `panki.sqlite` and its `media`.

| Variable | What it sets |
| --- | --- |
| `PANKI_DATA_DIR` | Where the data lives. |
| `PANKI_BACKUP_DIR`, `PANKI_BACKUP_SLOTS` | Where backups go (`apps/api/backups/`), how many snapshots are kept (3). |
| `PORT` | The API's port. |
| `PANKI_WEB_PORT`, `PANKI_API_PORT` | The web dev server's port and its proxy target. |
| `PANKI_TIME_ZONE` | The clock for an account never opened yet (each account sets its own). |
| `PANKI_LOW_SPACE_MB` | Below this left on the disk, everyone's home warns (2048). |
| `PANKI_FORVO_KEY`, `PANKI_ELEVENLABS_KEY` | Word audio and transcribing keys, when none is typed in Admin. |
| `PANKI_ANTHROPIC_KEY`, `PANKI_OPENAI_KEY`, `PANKI_GOOGLE_KEY` | Panki AI's provider keys, likewise. |

The local dev account, for testing only: `daniel` / `danieldaniel123`. Its "Test" deck is made-up data.

## A scratch Panki

A second Panki for checking skeletons in a browser, never the owner's data or dev server:

1. `PANKI_DATA_DIR=<scratch dir> pnpm user:add scratch <password>`
2. API: `PANKI_DATA_DIR=<scratch dir> PORT=3101 pnpm --dir apps/api exec tsx src/index.ts`
3. A small proxy on 3102 forwarding to 3101 a couple of seconds late, so skeletons stand still.
4. Web: `PANKI_WEB_PORT=5274 PANKI_API_PORT=3102 pnpm --dir apps/web exec vite`
5. Seed a type, a deck and cards over HTTP (`POST /api/login`, reuse the cookie); compare each skeleton with the loaded screen by `getBoundingClientRect`.

## Backing up

`pnpm backup` writes `<moment>/` (every database as it stood, the newest 3 kept) and `files/` (every card file and dictionary zip, each copied once, never deleted). Each deploy runs one, and on the VPS the `panki` user's crontab runs it nightly:

```
0 4 * * * bash -c '. $HOME/.nvm/nvm.sh && cd /opt/panki-vibe-coded && pnpm backup'
```

(nvm needs bash and a default: `nvm alias default 24.13.0`.) Copying the backup folder off the machine is what makes it a backup.

To restore: `pm2 stop panki-api`; copy the chosen `<moment>`'s databases over the data folder's, deleting any `-wal` / `-shm` first; copy `files/shared/dictionaries` and each `files/users/<id>/media` back; start the API.

## Deploying

The VPS runs Panki as its own user, `panki`, no sudo, owning the code, the data and pm2 (Node 22.13+ by nvm, pnpm by corepack). The first time, as `panki`:

```
git clone https://github.com/Gameoholic/panki-vibe-coded.git /opt/panki-vibe-coded
cd /opt/panki-vibe-coded
pnpm install && pnpm build
pnpm user:add <name> <password> && pnpm user:admin <name>
PORT=4001 PANKI_TIME_ZONE=Asia/Jerusalem pm2 start pnpm --name panki-api -- --filter @panki/api start
chmod 700 apps/api/data
pm2 save && pm2 startup   # prints a sudo line to run as a user with sudo, so the API survives a reboot
```

nginx serves `apps/web/dist` (`try_files $uri /index.html`) and proxies `/api/` with `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` set, `client_max_body_size 200m`, `proxy_read_timeout 180s`; HTTPS by certbot.

**Automatically**: `.github/workflows/ci-cd.yml` installs, typechecks and builds every push and PR to `main`; a passing push is deployed over SSH as `panki`, whose key may run one command, bound in `~/.ssh/authorized_keys`:

```
restrict,command="cd /opt/panki-vibe-coded && git pull --ff-only origin main && exec bash scripts/deploy.sh" ssh-ed25519 AAAA… github-deploy
```

`scripts/deploy.sh` installs, builds, backs up and restarts `panki-api`; a failing step stops before the restart, a hand change on the VPS stops the pull. Secrets: `VPS_HOST`, `VPS_USER`, `SSH_PRIVATE_KEY`, `VPS_FINGERPRINT` (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | cut -d ' ' -f2`). Actions → Deploy to VPS runs it by hand.

## The extension

Each deploy builds it, so panki.pro hands out the extension of its own commit; no store.

- **From Panki**: Settings → Extension → Download, extract to a folder you keep, Load unpacked in `chrome://extensions` (Developer mode). On a newer build, run **Update Panki** in that folder, then Reload Panki.
- **From this repo**: Load unpacked `apps/extension/dist/chrome`; after a rebuild, its reload arrow and reload open YouTube tabs.
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `manifest.json`; forgotten on closing.
- **Set up**: its page opens the first time: where Panki is (`127.0.0.1:5173` in dev), sign in, allow the address; switch Field mapping on for a deck; import a dictionary.
