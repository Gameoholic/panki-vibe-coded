import { createCutter, type ChunkShape, type CutPiece, type Cutter } from "./pieces";

/**
 * The silent player: the same video opened a second time in a frame of this page, unseen and unheard, played ahead of
 * the viewer faster than life, its sound taken as it plays and cut into pieces for the engine. The frame is the
 * site's own page for the video (its embed page, or the watch page when the video can't be embedded), so it's the
 * same origin as the page we're on: its player is reached straight from here, nothing is injected into it and
 * nothing of the site's scripts is called. Only its `<video>` is used: told where to go, how fast, and listened to.
 *
 * How it's silent: the player's sound is routed into a sound graph of its own and from there through a gain of zero,
 * so none of it reaches the speakers; the player itself is never muted, since a muted player gives the graph nothing.
 * How the engine hears the voice at its own pace: the player keeps the pitch out of it (`preservesPitch` off), so the
 * sound it makes is the video's own, only faster; taken at the card's rate, it's handed on as if taken at that rate
 * divided by the speed, which puts it back at the video's pace with the top of the card's range gone (3× keeps
 * exactly what the engine listens to).
 */

/** What the silent player says of itself, asked as often as wanted. */
export type SilentReport = {
  /** Its player is found and wired: it can be told where to go. */
  ready: boolean;
  /** Where it stands in the video, in seconds. */
  at: number;
  playing: boolean;
  ended: boolean;
  /** The site is showing it an ad: nothing is taken until the video is back. */
  ad: boolean;
  /** The browser refused to start it, or its sound, without a press; a press on Transcribe tries again. */
  blocked: boolean;
  /** It couldn't be made at all, in words; nothing more will come of it. */
  failed: string | null;
  /** How long the video is, once its player says. */
  duration: number | null;
  /** Which of the site's pages for the video is open in the frame, and how long ago it was asked for, in seconds. */
  page: SilentPage;
  pageAge: number;
  /** What it's doing this moment. */
  stage: SilentStage;
  /** What it has heard and not sent yet, in seconds of the video; null when nothing is. */
  recording: { from: number; to: number } | null;
  /** How long the chunk it's recording is to be, in seconds of the video, as the chunks ramp up; null before it hears anything. */
  chunk: number | null;
  /** What it's recording will be sent as a chunk when it closes (`Cutter.pending`). */
  pending: boolean;
  /** Asked to close what it's recording at the next pause (`closeAtPause`), it has. */
  closed: boolean;
};

/**
 * What the silent player is doing this moment, as the strip's menu tells it under Details: its page loading in the
 * frame, its player looked for in it, going to a moment, starting to play, waiting for the first sound from there,
 * playing, waiting for the video's data, held, in an ad, at the end, given up.
 */
export type SilentStage = "opening" | "finding" | "seeking" | "starting" | "listening" | "playing" | "buffering" | "held" | "ad" | "ended" | "failed";

export type SilentPlayer = {
  /** Goes there and plays on from it, at speed. `fresh`: the viewer is waiting for words there (a run's start, a jump), so the next chunk is as short as a first one; going on over something transcribed already isn't. */
  go(at: number, fresh?: boolean): void;
  hold(): void;
  resume(): void;
  report(): SilentReport;
  /** What it's recording closes at the next pause, however short (`Cutter.closeAtPause`); the report's `closed` says when. */
  closeAtPause(): void;
  /** Closes the open piece (sent when it's worth sending), and takes the frame down. */
  destroy(): void;
};

/** The site's two pages for a video: the embed page first, light and made to be framed; the watch page when the embed says the video can't be. */
const SOURCES = ["embed", "watch"] as const;
export type SilentPage = (typeof SOURCES)[number];
const PLAYER = "#movie_player";
const ERROR = ".ytp-error";
/** The classes the site's player carries while an ad plays in it; the video page's watcher leaves ads out of the time watched too. */
export const AD = ["ad-showing", "ad-interrupting"];
/** How often the frame is looked at for its player, and then for ads. */
const LOOK_MS = 250;
/** How long one page gets to show a working player before the next is tried, or the whole thing gives up. */
const PAGE_WAIT_MS = 25_000;
/** How long the sound graph gets to start before it's taken as refused by the browser. */
const SOUND_WAIT_MS = 1500;
/** How many samples the graph hands over at a time. */
const TAP = 4096;
/**
 * The count of samples from the last anchor may stand this far, in seconds of the video, from where the sound clock
 * says a block belongs before the anchor is set again from the clock. Smaller than a block, so a block that arrives
 * late is never let run on the count alone; larger than the clock's own jitter, so the count isn't nudged every block.
 */
const TOLERANCE = 0.03;
/**
 * The first sound after a seek is the video at the moment sought, exactly (the graph gives silence until the player
 * is there, then the sound from there): the one place the sound is known for sure. A clock reading that stands
 * farther than this from it, in seconds of the video, isn't the clock's error but the video's own silence at that
 * moment (the first sound came later), and isn't learned from.
 */
const ONSET_TRUST = 1;
/** How many seeks the clock's error is remembered over; the middle one is used, so one quiet moment doesn't set it. */
const BIASES = 5;
const FAILED = "The video couldn't be opened to transcribe it.";
const REPLACED = "YouTube replaced the hidden player.";
/**
 * A seek the site makes by itself, landing farther than this from where the player was sent, is put back; its own
 * seek to the whole second its address named is nearer. Seconds of the video.
 */
const STRAY = 2;
/** Strays are put back until the player has played this far from where it was sent (the site's comes as it loads), and at most this many times, so a site that insists isn't fought for ever. */
const GUARD_SECONDS = 5;
const GUARD_TRIES = 3;
/**
 * Waiting this long for the video's data (loading, or a seek that doesn't land) with nothing coming, the page is opened
 * again where it stands, at most this many times for one silent player (2026-10-20: "Loading the video at 3:59" for
 * good, the frame's video server not found by the browser, `ERR_NAME_NOT_RESOLVED`). Seconds.
 */
const STUCK_SECONDS = 15;
const REOPENS = 3;
const STUCK = "The video wouldn't load in the background.";

const urlOf = (source: SilentPage, videoId: string, at: number) =>
  source === "embed"
    ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&controls=0&playsinline=1&rel=0&start=${Math.max(0, Math.floor(at))}`
    : `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${Math.max(0, Math.floor(at))}s`;

/** The frame stands off the screen, a player's size so the site lays it out, and takes no press. */
const FRAME_STYLE = "position: fixed; left: -10000px; top: 0; width: 320px; height: 180px; opacity: 0; pointer-events: none; border: 0;";

/** Firefox's name for `preservesPitch` before it had the standard one. */
type Pitched = HTMLVideoElement & { mozPreservesPitch?: boolean };

/**
 * A frame's window is a whole window of its own, with its own `AudioContext` and `HTMLVideoElement` (an element of the
 * frame's isn't an instance of this page's), though the DOM's types call it a bare `Window`. Checked for one of its
 * globals before it's read as one.
 */
type FrameWindow = Window & typeof globalThis;
function windowOf(frame: HTMLIFrameElement): FrameWindow | null {
  const win = frame.contentWindow;
  return win !== null && "AudioContext" in win && "HTMLVideoElement" in win ? (win as FrameWindow) : null;
}

/** What the silent player tells of itself as it happens, for the Log. */
export type SilentNotes = {
  /** The site moved the player by itself, from where it was sent (`at`) to `to`, and it was put back. */
  stray(to: number, at: number): void;
  /** The video's data stopped coming at `at` for `seconds`, and its page was opened again there. */
  reopened(at: number, seconds: number): void;
};

export function createSilentPlayer(videoId: string, speed: number, shape: ChunkShape, onPiece: (piece: CutPiece) => void, notes: SilentNotes): SilentPlayer {
  const frame = document.createElement("iframe");
  frame.setAttribute("allow", "autoplay");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "Panki";
  frame.style.cssText = FRAME_STYLE;

  let video: HTMLVideoElement | null = null;
  let player: Element | null = null;
  let ctx: AudioContext | null = null;
  let cutter: Cutter | null = null;
  /**
   * The player's time and the sound clock's, read in the same instant: how a block of sound is placed in the video.
   * Null while the player is paused, seeking, stalled or in an ad, which is when nothing is taken.
   *
   * Why the clock and not an event: until 2026-10-17 the count of samples began at the player's time as the `playing`
   * event reported it, and every block after was counted from there. But the block that arrives right after that
   * event holds sound rendered *before* it (the graph hands a block over once it's full, and the event itself is
   * queued), so that sound was placed a block or two late, and every block after it with it; at speed the error is
   * multiplied (a 4096-sample block is 85 ms of sound at 48 kHz, 256 ms of the video at 3×, two of them half a
   * second: the owner's "always delayed a little bit, like half a second"). Each block now says when it was rendered
   * (`playbackTime`), and is placed from that against the pair below, so when the event fired no longer matters.
   *
   * And the clock is checked against the one thing known for sure. After a seek the graph gives silence until the
   * player is there, then the sound from exactly where it landed: the first sample that isn't zero is the video at
   * `onset`. Where the clock put that sample, against where it truly was, is the clock's error (`biases`: what the
   * browser's latencies and the node's own buffering really come to on this device, which no reading says plainly),
   * taken off every reading after; the sample itself anchors the count. Each measurement is printed to the page's
   * console as "Panki timing", for the owner to read off (2026-10-17, the delay still felt after the clock came in).
   *
   * Two things the first try of this got wrong, the same evening, and the words went far later than before: the
   * blocks were looked at for the first sound only once the pair was there, after the `playing` event, so the sound
   * had often begun in a block already thrown away and the "first sound" was a block or more late; and the moment was
   * taken as asked, where the player lands where it will (the site's own player seeks again to a whole second, the
   * one its address named). So the blocks are looked at from the seek on, pair or no pair, and `onset` is where the
   * player says it landed (`seeked`), not where it was sent.
   */
  let sync: { video: number; clock: number } | null = null;
  /** Where the player landed at the last seek, until its first sound has been heard; null otherwise. */
  let onset: number | null = null;
  /** The clock's error at the last few onsets, in seconds of the video: what it read, less what was true. */
  let biases: number[] = [];
  const bias = () => {
    if (biases.length === 0) return 0;
    const sorted = [...biases].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  let tried = 0;
  let pageTimer: ReturnType<typeof setTimeout> | null = null;
  let looker: ReturnType<typeof setInterval> | null = null;
  /**
   * Where the player was last sent, while the site may still move it by itself: as its page loads, the site seeks to
   * where it thinks the viewer left off (the account's progress on the video), which isn't where the run is (2026-10-20:
   * the owner forgot a video's transcript, refreshed, pressed Transcribe at 0:00, and the chunks were heard from about
   * 4:00, where they'd been watching). Such a seek is put back. Null once it has played `GUARD_SECONDS` on from there:
   * `played` counts only the small steps of playing, never a seek's leap, and `last` is where it stood at the last step.
   * (The leap itself counted at first: the site's seek to 8:55 read as having played on, and the guard was off before
   * the seek it was there for could be put back, 2026-10-20.)
   */
  let sent: { at: number; tries: number; played: number; last: number } | null = null;
  /** The site's own seek has landed where it wasn't sent and is about to be put back: nothing heard there is the run's. */
  let straying = false;
  /** Since when it has waited for the video's data with nothing coming, by `performance.now()`; and how often its page was opened again for it. */
  let stuckSince: number | null = null;
  let reopens = 0;
  /** Where it's wanted once its player is ready, and whether it's wanted playing. */
  let wanted: number | null = null;
  let wantPlaying = false;
  let ad = false;
  let blocked = false;
  let ended = false;
  let failed: string | null = null;
  let gone = false;
  /** The page last asked for has loaded: until then the frame still shows the one before, whose error mustn't be read as the new one's. */
  let loaded = false;
  frame.addEventListener("load", () => {
    loaded = true;
  });
  /** The page last asked for, and when, by `performance.now()`. */
  let page: SilentPage = SOURCES[0];
  let pageAt = performance.now();
  const show = (source: SilentPage, at: number) => {
    loaded = false;
    page = source;
    pageAt = performance.now();
    frame.src = urlOf(source, videoId, at);
  };
  const stageOf = (): SilentStage => {
    if (failed !== null) return "failed";
    if (!video) return loaded ? "finding" : "opening";
    if (ended) return "ended";
    if (ad) return "ad";
    if (video.seeking) return "seeking";
    if (!wantPlaying) return "held";
    if (video.paused) return "starting";
    if (onset !== null) return "listening";
    if (video.readyState < video.HAVE_FUTURE_DATA) return "buffering";
    return "playing";
  };

  const suspend = () => {
    sync = null;
    cutter?.suspend();
  };
  /** The player's time and the sound clock's, paired now; read again on every `timeupdate`, so a stall the player never said is caught within a moment. */
  const anchor = () => {
    if (!video || !ctx || ad) return;
    sync = { video: video.currentTime, clock: ctx.currentTime };
  };
  const taking = () => sync !== null && video !== null && !video.paused && !video.seeking && !video.ended && !ad;
  /**
   * Where in the video a block of sound rendered at `clock` (the sound clock's time) belongs. The player's time is
   * what's being heard, and what's heard was rendered the output's latency earlier; a block rendered at `clock` is
   * therefore that much later in the video than the player said at the pair, all of it at speed.
   */
  const videoTimeAt = (clock: number): number | null => {
    if (!sync || !ctx) return null;
    const latency = (Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0) + (Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0);
    return sync.video + (clock - sync.clock + latency) * speed - bias();
  };
  /** The first sample of a block that isn't silence, or -1 when the whole block is. */
  const firstSound = (samples: Float32Array): number => {
    for (let i = 0; i < samples.length; i++) if (samples[i] !== 0) return i;
    return -1;
  };

  function play() {
    const v = video;
    const c = ctx;
    if (!v || !c) return;
    v.play().then(
      () => {
        blocked = false;
        void c.resume();
        // A graph the browser won't start without a press stays suspended and says nothing; it's asked after a moment.
        setTimeout(() => {
          if (!gone && c.state !== "running") blocked = true;
        }, SOUND_WAIT_MS);
      },
      () => {
        blocked = true;
      },
    );
  }

  /** `tries`: how many of the site's own seeks have been put back since the run sent it here (`sent`). */
  function seekAndPlay(at: number, fresh: boolean, tries = 0) {
    if (!video) return;
    cutter?.flush();
    if (fresh) cutter?.restart();
    suspend();
    ended = false;
    onset = Math.max(0, at);
    sent = { at: onset, tries, played: 0, last: onset };
    video.currentTime = onset;
    play();
  }

  /** The player is there: wired once, then taken where it's wanted. */
  function wire(found: HTMLVideoElement, win: Window & typeof globalThis) {
    video = found;
    const pitched: Pitched = found;
    pitched.preservesPitch = false;
    pitched.mozPreservesPitch = false;
    found.playbackRate = speed;
    found.muted = false;
    found.volume = 1;
    // The graph is the frame's own, as its player is. Its tap is a ScriptProcessorNode rather than an AudioWorklet
    // because a worklet is a module fetched from an address, and on someone else's page an extension's script has
    // none the page's own rules would allow; the deprecated node needs nothing but the graph.
    ctx = new win.AudioContext();
    const source = ctx.createMediaElementSource(found);
    const tap = ctx.createScriptProcessor(TAP, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(tap);
    tap.connect(mute);
    mute.connect(ctx.destination);
    cutter = createCutter(ctx.sampleRate / speed, shape, onPiece, () => performance.now());
    tap.onaudioprocess = (e) => {
      if (!cutter || !ctx || !video || ad || video.seeking || straying) return;
      // Waiting for the first sound after a seek: every block is looked at, whether or not the pair is there yet (the
      // `playing` event comes when it comes; the sound doesn't wait for it). Otherwise nothing is taken without the pair.
      if (onset === null && !taking()) return;
      // The block's own place in the video, from when it was rendered: `playbackTime` is when it plays, one block
      // after it was taken in (the node's latency, by the spec). The count from the last anchor carries on while it
      // agrees; where it doesn't (the first block, a stall), the anchor is set from the clock.
      const played = Number.isFinite(e.playbackTime) ? e.playbackTime : ctx.currentTime;
      const samples = e.inputBuffer.getChannelData(0);
      let at = videoTimeAt(played - TAP / ctx.sampleRate);
      if (onset !== null) {
        // Silence still, after the seek: not the video's, and not counted.
        const first = firstSound(samples);
        if (first === -1) return;
        // The block begins `first` samples before where the player landed; that's where it truly stands.
        const rate = ctx.sampleRate / speed;
        const truth = onset - first / rate;
        const read = at;
        const error = read === null ? null : read - truth;
        const trusted = error !== null && Math.abs(error) <= ONSET_TRUST;
        if (trusted) {
          // `read` had the bias so far taken off already; what's kept is the clock's raw error.
          biases = [...biases.slice(-(BIASES - 1)), error + bias()];
        }
        // (Each onset was printed to the page's console as "Panki timing" while the delay was being run down, 2026-10-17; the owner had the print taken out once it was.)
        // The sound itself is the anchor; only where it was silent at the landing (the first sound came much later
        // than the clock says) is a clock that has been calibrated once trusted over it. And the pair is made now,
        // so the next block isn't thrown away.
        if (trusted || biases.length === 0 || read === null) at = truth;
        onset = null;
        if (sync === null) anchor();
      }
      const expected = cutter.expected();
      if (at !== null && (expected === null || Math.abs(expected - at) > TOLERANCE)) cutter.anchor(at);
      // The graph reuses its buffer: a copy is kept.
      cutter.push(new Float32Array(samples));
    };
    found.addEventListener("playing", anchor);
    for (const type of ["pause", "waiting", "seeking", "emptied", "stalled"] as const) found.addEventListener(type, suspend);
    // A seek lands where the player says, not where it was sent (the site's player seeks again on its own after a
    // load): the first sound after it is the video from there.
    found.addEventListener("seeking", () => {
      onset = null;
    });
    found.addEventListener("seeked", () => {
      onset = found.currentTime;
      // Every seek but the site's is `seekAndPlay`'s, which sets `sent` first: one landing far from it is the site's
      // (an ad plays its own times on the same element, and is left alone). It's put back once it has landed, by a seek
      // of our own as a run's jumps are made: put back from inside the site's own seek (2026-10-20, the first try), the
      // site's player was left playing out loud, the wired one dead.
      const back = sent;
      if (back === null || ad || Math.abs(found.currentTime - back.at) <= STRAY) return;
      if (back.tries >= GUARD_TRIES) {
        sent = null;
        return;
      }
      const to = found.currentTime;
      straying = true;
      setTimeout(() => {
        straying = false;
        if (gone || video !== found || sent !== back) return;
        notes.stray(to, back.at);
        seekAndPlay(back.at, false, back.tries + 1);
      }, 0);
    });
    found.addEventListener("ended", () => {
      suspend();
      cutter?.flush();
      ended = true;
    });
    // The pair is read afresh as the player reports its time, so a stall it never said moves the sound no further than a moment.
    found.addEventListener("timeupdate", () => {
      if (sync !== null) anchor();
      if (sent !== null && !ad && !found.seeking) {
        const step = found.currentTime - sent.last;
        sent.last = found.currentTime;
        if (step > 0 && step < STRAY) sent.played += step;
        if (sent.played > GUARD_SECONDS) sent = null;
      }
    });
    if (pageTimer !== null) clearTimeout(pageTimer);
    pageTimer = null;
    if (wanted !== null) {
      const at = wanted;
      if (found.readyState >= 1) seekAndPlay(at, true);
      else found.addEventListener("loadedmetadata", () => seekAndPlay(at, true), { once: true });
    }
  }

  /** Looks at the frame: for its player until it's found, then for ads. */
  function look() {
    if (gone || !loaded) return;
    const doc = frame.contentDocument;
    const win = windowOf(frame);
    if (!doc || !win) return;
    const found = doc.querySelector(PLAYER);
    if (!video) {
      if (doc.querySelector(ERROR)) {
        next();
        return;
      }
      const v = found?.querySelector("video");
      if (found && v instanceof win.HTMLVideoElement) {
        player = found;
        wire(v, win);
      }
      return;
    }
    // The site put another player in the frame (its page reloaded, or its player rebuilt): the one wired is gone, and
    // the new one, outside the sound graph, would be heard. Silenced at once and given up; Try again opens a fresh one.
    const current = found?.querySelector("video");
    if (current instanceof win.HTMLVideoElement && current !== video) {
      current.muted = true;
      current.pause();
      if (failed === null) failed = REPLACED;
      return;
    }
    const inAd = player !== null && AD.some((name) => player?.classList.contains(name));
    if (inAd !== ad) {
      ad = inAd;
      if (ad) suspend();
      else if (!video.paused) anchor();
    }
    const waiting = wantPlaying && !ad && !ended && (video.seeking || video.readyState < video.HAVE_FUTURE_DATA);
    if (!waiting) stuckSince = null;
    else if (stuckSince === null) stuckSince = performance.now();
    else if (performance.now() - stuckSince > STUCK_SECONDS * 1000) reopen();
  }

  /** The page opened again where the player stands, its player wired afresh once it's there (`look`); given up after `REOPENS`. */
  function reopen() {
    const stuck = video;
    if (!stuck) return;
    const at = stuck.currentTime;
    const seconds = stuckSince === null ? 0 : (performance.now() - stuckSince) / 1000;
    stuckSince = null;
    if (reopens >= REOPENS) {
      failed = STUCK;
      return;
    }
    reopens++;
    cutter?.flush();
    suspend();
    stuck.pause();
    void ctx?.close().catch(() => undefined);
    video = null;
    player = null;
    ctx = null;
    cutter = null;
    onset = null;
    sent = null;
    ad = false;
    wanted = at;
    notes.reopened(at, seconds);
    show(page, at);
    if (pageTimer !== null) clearTimeout(pageTimer);
    pageTimer = setTimeout(next, PAGE_WAIT_MS);
  }

  /** The next of the site's pages for the video, or the end of the road. */
  function next() {
    if (pageTimer !== null) clearTimeout(pageTimer);
    pageTimer = null;
    tried++;
    const source = SOURCES[tried];
    if (!source) {
      failed = FAILED;
      return;
    }
    show(source, wanted ?? 0);
    pageTimer = setTimeout(next, PAGE_WAIT_MS);
  }

  function open(at: number) {
    show(SOURCES[0], at);
    document.documentElement.append(frame);
    pageTimer = setTimeout(next, PAGE_WAIT_MS);
    looker = setInterval(look, LOOK_MS);
  }

  return {
    go(at, fresh = true) {
      wanted = at;
      wantPlaying = true;
      if (gone || failed) return;
      if (!frame.isConnected) open(at);
      else if (video) seekAndPlay(at, fresh);
    },
    hold() {
      wantPlaying = false;
      video?.pause();
    },
    resume() {
      wantPlaying = true;
      if (video) play();
    },
    report: () => ({
      ready: video !== null,
      at: video?.currentTime ?? wanted ?? 0,
      playing: video !== null && !video.paused && !video.ended && wantPlaying,
      ended,
      ad,
      blocked,
      failed,
      duration: video !== null && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
      page,
      pageAge: (performance.now() - pageAt) / 1000,
      stage: stageOf(),
      recording: cutter?.recording() ?? null,
      chunk: cutter?.length() ?? null,
      pending: cutter?.pending() ?? false,
      closed: cutter?.closed() ?? false,
    }),
    closeAtPause() {
      cutter?.closeAtPause();
    },
    destroy() {
      if (gone) return;
      gone = true;
      cutter?.flush();
      suspend();
      if (pageTimer !== null) clearTimeout(pageTimer);
      if (looker !== null) clearInterval(looker);
      video?.pause();
      void ctx?.close().catch(() => undefined);
      // Unloaded before it's taken out, so the site's page in it is torn down now rather than when the browser gets
      // round to it: a trace of the owner's (2026-10-17) showed the tab's heap stepping up by 60 to 80 MB at each change
      // of video, the site's own page and this frame's both loading then, and not coming down within the trace.
      frame.src = "about:blank";
      frame.remove();
    },
  };
}
