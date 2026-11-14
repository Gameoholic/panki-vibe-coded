# Downloads

The epic's plan: why, what's settled, the order, what's open.

## Why

The owner's words, not concrete: on the train to work the laptop runs on the phone's hotspot, and YouTube buffers for about half the ride in tunnels and dead zones. They want to "watch my videos, continue using Panki as normal, use the extension too". Switching to reviews in a dead zone "kills it", so the ride is wasted. No YouTube Premium.

## Settled

- **The cause** (looked up): YouTube's player holds only about 30 to 60 seconds ahead, so a stretch with no signal longer than that stops any stream, however good the signal was before. Only a copy on the laptop gets through.
- **Picked by hand** (the owner): a Download button on a video. Nothing is downloaded by itself until the automations (below).
- **The list** (the owner): downloaded videos sit in a list of their own and stay there until undownloaded, which takes them off. Downloads run in the background with their progress and a clear done, and can be started mid-ride ("I know I'm on the train, I hit download… when it's done I have peace of mind").
- **Where** (the owner): H Menu of the preview (https://claude.ai/artifact/GC9NdJWyDoCdUF9bmAHZWa), with its tab on the options page.
- **The downloaded mark** (the owner): a downloaded video wears an icon everywhere it shows (Saved for later, Continue watching, the player bar), with a setting of its own, on to begin with.
- **Watching stays as it is** (the owner): on YouTube's page, with Panki's subtitles, the panel, watch time and Saved for later all working and reporting to Panki whenever there's any signal. A video is opened while there's signal; starting one with none at all isn't the point.
- **No folder** (the owner): the videos live in the extension's own storage, their sizes in the list.
- **How the video is got** (the owner picked, Claude's recommendation): the hidden player plays the video through fast, and a small script in YouTube's page copies the pieces YouTube's player hands the browser (the browser's one standard way to play streamed video), passing each on untouched. Original quality, both browsers, nothing to install. It's the one script of Panki's that runs in YouTube's own page; nothing of YouTube's is changed.
- **Firefox and Chrome, Windows and Mac** (the owner). Copying off the network is Firefox's alone, so it's out; recording the picture is a copy of a copy, so it's out.
- **The fallback** (the owner): a helper program running yt-dlp, in `docs/BACKLOG.md`, if the extension alone is bad or doesn't work.
- **How a downloaded video plays: B** (the owner picked, Claude's recommendation): the kept pieces go back through the same doorway into YouTube's own player, which finds the video already loaded and plays on as if the signal never dropped; YouTube's controls, seek bar and full screen stay YouTube's, and the subtitles, the panel, watch time and the seek bar marks keep working untouched on the same video. Its risk: YouTube's player may throw away what's added or show an error when its own requests fail, which only trying shows. **A is the fallback**: Panki's own player laid over YouTube's, its own controls, everything of Panki's taught to follow a second player.
- **On main** (the owner): steps 2 to 4 were built on a branch of their own and tried on local dev, then put on main when the owner said.
- **Proposals of Claude's, as defaults**: the hidden player's download speed is a setting, Download speed (1× to 16×, the owner asked), 4× to begin with (what the transcriber already plays at); a download started mid-ride shares the hotspot with the video being watched, and that's accepted.

## The order

- [x] 1. The preview of where it lives; the owner picked H Menu.
- [x] 2. Downloading: the script in the page, the hidden player playing through, the pieces kept, the H Menu with the Download button, progress, done, the list and undownload (`architecture/downloads.md`). On local dev for the owner to try.
- [x] 3. The downloaded mark everywhere a video shows, and its setting (`architecture/downloads.md` → On screen). Not on Panki's own site (its home's Continue watching and Saved tiles): the site can't see what this browser downloaded.
- [x] 4. Playing from the saved copy: B first, as a small experiment the owner tries on local dev; A only if YouTube's player fights it (`architecture/downloads.md` → Playing from the copy). Built: the copy goes into YouTube's player only when it runs short with nothing coming in; what YouTube's player does with it is said under Downloaded in the panel's menu and in the console. Next, the owner tries it: B kept, or A.
- [ ] Later: downloading as an automation beside transcribing (`docs/AI.md` → Rules); the yt-dlp helper if step 2 falls short (`docs/BACKLOG.md`).

## Open

- **The quality kept** (found in step 2, put to the owner): a Download quality setting (720p to begin with) works as a ceiling without YouTube's code: the hidden frame is the quality's size, and YouTube's player picking for itself loads no taller (answering "can't play" for taller video was tried and stopped the player loading anything). It can't be a floor: at 4× on a slow connection YouTube's player drops lower for stretches, and those are kept as they came. Forcing it means calling YouTube's own player (`setPlaybackQualityRange`), or downloading slower; the owner's call.
- **Room on the disk**: settled; the extension already asks for unlimited room (`unlimitedStorage`), and the list shows each video's size and the total.
