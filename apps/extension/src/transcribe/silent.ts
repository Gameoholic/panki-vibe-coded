import { createCutter, type CutPiece, type Cutter } from "./pieces";

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
};

export type SilentPlayer = {
  /** Goes there and plays on from it, at speed. */
  go(at: number): void;
  hold(): void;
  resume(): void;
  report(): SilentReport;
  /** Closes the open piece (sent when it's worth sending), and takes the frame down. */
  destroy(): void;
};

/** The site's two pages for a video: the embed page first, light and made to be framed; the watch page when the embed says the video can't be. */
const SOURCES = ["embed", "watch"] as const;
const PLAYER = "#movie_player";
const ERROR = ".ytp-error";
const AD = ["ad-showing", "ad-interrupting"];
/** How often the frame is looked at for its player, and then for ads. */
const LOOK_MS = 250;
/** How long one page gets to show a working player before the next is tried, or the whole thing gives up. */
const PAGE_WAIT_MS = 25_000;
/** How long the sound graph gets to start before it's taken as refused by the browser. */
const SOUND_WAIT_MS = 1500;
/** How many samples the graph hands over at a time. */
const TAP = 4096;
/** The count from the last anchor may drift from the player's own time by this much before it's set again. Seconds. */
const DRIFT = 0.35;
const FAILED = "The video couldn't be opened to transcribe it.";

const urlOf = (source: (typeof SOURCES)[number], videoId: string, at: number) =>
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

export function createSilentPlayer(videoId: string, speed: number, onPiece: (piece: CutPiece) => void): SilentPlayer {
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
  /** The count from the last anchor is good: the player is playing on from where the anchor was set. */
  let anchored = false;
  let tried = 0;
  let pageTimer: ReturnType<typeof setTimeout> | null = null;
  let looker: ReturnType<typeof setInterval> | null = null;
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
  const show = (source: (typeof SOURCES)[number], at: number) => {
    loaded = false;
    frame.src = urlOf(source, videoId, at);
  };

  const suspend = () => {
    anchored = false;
    cutter?.suspend();
  };
  const anchor = () => {
    if (!video || !cutter || ad) return;
    cutter.anchor(video.currentTime);
    anchored = true;
  };
  const taking = () => anchored && video !== null && !video.paused && !video.seeking && !video.ended && !ad;

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

  function seekAndPlay(at: number) {
    if (!video) return;
    cutter?.flush();
    suspend();
    ended = false;
    video.currentTime = Math.max(0, at);
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
    cutter = createCutter(ctx.sampleRate / speed, onPiece);
    tap.onaudioprocess = (e) => {
      if (!taking()) return;
      // The graph reuses its buffer: a copy is kept.
      cutter?.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    found.addEventListener("playing", anchor);
    for (const type of ["pause", "waiting", "seeking", "emptied", "stalled"] as const) found.addEventListener(type, suspend);
    found.addEventListener("ended", () => {
      suspend();
      cutter?.flush();
      ended = true;
    });
    found.addEventListener("timeupdate", () => {
      // Set again when the count has drifted from the player's own time: a stall the player never said.
      const expected = cutter?.expected() ?? null;
      if (anchored && expected !== null && Math.abs(expected - found.currentTime) > DRIFT) anchor();
    });
    if (pageTimer !== null) clearTimeout(pageTimer);
    pageTimer = null;
    if (wanted !== null) {
      const at = wanted;
      if (found.readyState >= 1) seekAndPlay(at);
      else found.addEventListener("loadedmetadata", () => seekAndPlay(at), { once: true });
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
    const inAd = player !== null && AD.some((name) => player?.classList.contains(name));
    if (inAd !== ad) {
      ad = inAd;
      if (ad) suspend();
      else if (!video.paused) anchor();
    }
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
    go(at) {
      wanted = at;
      wantPlaying = true;
      if (gone || failed) return;
      if (!frame.isConnected) open(at);
      else if (video) seekAndPlay(at);
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
    }),
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
