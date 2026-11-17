/** @panki Video tracking on a video's page: the stretches watched, sent in batches (`createWatcher`). Never a second listener on the player for time watched. */
import { WATCH, type NewWatchStretch, type WatchBatch, type WatchVideo } from "@panki/contracts";
import { uuid } from "../uuid";

/**
 * Video tracking on a video's page, so time watched counts as immersion in the stats: each stretch of the video watched without a pause or a jump, from where to where in it, how long it took
 * on the clock and how fast it played, sent to Panki through the worker. A stretch closes when the video stops, jumps,
 * changes speed or changes, when an ad comes on, a video's first one `WATCH.firstMs` after it starts (so it counts at
 * once), and every `WATCH.flushMs` while it plays on (the next one starting where it ended), so a crash or a closed tab
 * loses little. Nothing is noted while this browser's Video tracking is off (`watch/tracking.ts`), and the worker sends nothing then either. Several tabs each watch their own video, each with a watcher of its own.
 */

/** A jump: the video stands this far from where it would be had it played on since the last look. */
const JUMP_MS = 1500;
/** A stretch shorter than this, on the video and on the clock, is a flicker, not watching. */
const SHORTEST_MS = 500;
/** The most stretches one batch carries, as Panki takes them (`WatchBatch`); more wait for the batches after. */
const BATCH_MAX = 100;
/** How long after a failed send what's waiting is tried again by itself, so it goes even while the video stands still. */
const RETRY_MS = 15_000;

type Open = { id: string; videoId: string; fromMs: number; lastMs: number; startedAt: number; rate: number };

export type Watcher = ReturnType<typeof createWatcher>;

/**
 * How saving what's watched here stands, for the panel's head (`ui/SavingMark.tsx`): `idle` before anything has gone
 * (or while nothing is noted), `saved` once a batch has landed and nothing watched since is unsent, `unsaved` while
 * something watched isn't with Panki yet (the stretch playing, or one closed and not yet sent: leaving now would lose
 * it), `sending` while a batch is on its way, `waiting` while a send failed and stretches wait to go with the next,
 * `error` once the watcher's own code failed, for the rest of this video, since a stretch may have gone with it. Times
 * are on the wall clock (`Date.now()`), so they can be said as "ago".
 */
export type Saving = {
  state: "idle" | "saved" | "unsaved" | "sending" | "waiting" | "error";
  /** What went wrong, in Panki's words: the error, or why the last send failed while something waits. */
  problem: string | null;
  /** Whether this page's video is being noted now: the head says how saving stands only then, or while something went wrong. */
  noting: boolean;
  /** When the latest batch landed. */
  savedAt: number | null;
  /** The time watched in what's waiting, on the clock. */
  waitingMs: number;
  /** When a send first failed with nothing landing since. */
  waitingSince: number | null;
};
export const SAVING_IDLE: Saving = { state: "idle", problem: null, noting: false, savedAt: null, waitingMs: 0, waitingSince: null };

/** A send's answer: it landed, or why not. */
export type Sent = { ok: true } | { ok: false; message: string };

const wordsOfError = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * `send` takes a batch to Panki and says whether it went, and why not; `about` reads the video as the page shows it (its
 * name, its channel), asked when a stretch opens; `isAd` says whether what's playing is an ad (the site plays them in
 * the same player); `clock` is a moment in ms on the browser's own clock, for how long a stretch took; `onSaving` hears
 * how saving stands each time it changes.
 */
export function createWatcher(deps: {
  send: (batch: WatchBatch) => Promise<Sent>;
  about: (videoId: string) => Omit<WatchVideo, "videoId" | "lengthMs">;
  isAd: () => boolean;
  clock?: () => number;
  onSaving?: (saving: Saving) => void;
}) {
  const clock = deps.clock ?? (() => performance.now());
  let videoId: string | null = null;
  let on = false;
  let open: Open | null = null;
  /** The videos whose first stretch has gone: a video's first is closed after `WATCH.firstMs`, so it counts from the moment it's opened; the rest every `WATCH.flushMs`. */
  const started = new Set<string>();
  /** How many stretches of each video this page has closed, so the page can tell whether any went before an answer of Panki's about it. */
  const closedOf = new Map<string, number>();
  /** When the open stretch was last seen playing, on the clock. */
  let seenAt = 0;
  /** Everything closed and not yet with Panki, however much: kept while the tab is open, never dropped. */
  const waiting: NewWatchStretch[] = [];
  const videos = new Map<string, WatchVideo>();
  /** The batch on its way, so a second send waits on it rather than going beside it. */
  let sending: Promise<void> | null = null;
  let savedAt: number | null = null;
  let waitingSince: number | null = null;
  /** Why the last send failed, while something waits. */
  let sendProblem: string | null = null;
  /** The watcher's own code failing, for the rest of this video: what it said. */
  let fault: string | null = null;

  /** How saving stands, told to whoever listens. A send that fails while some already wait stays `waiting`, never `sending`, so a retry doesn't flicker. */
  function tell() {
    const waitingMs = waiting.reduce((sum, stretch) => sum + stretch.spentMs, 0);
    const failing = waitingSince !== null && waiting.length > 0;
    const state: Saving["state"] =
      fault !== null ? "error" : failing ? "waiting" : sending ? "sending" : open !== null || waiting.length > 0 ? "unsaved" : savedAt !== null ? "saved" : "idle";
    deps.onSaving?.({ state, problem: fault ?? (failing ? sendProblem : null), noting: on && videoId !== null, savedAt, waitingMs, waitingSince });
  }

  /** The watcher's own code failed: said on the console and in the head, red, never swallowed. */
  function failed(e: unknown) {
    fault = wordsOfError(e);
    console.warn("[Panki] watching: video tracking failed:", fault);
    try {
      tell();
    } catch {
      // Whoever listens failing too has nothing more to be told.
    }
  }

  /** Runs one of the watcher's own steps, so a failure in it is said, never left to stop tracking silently. */
  function guarded(step: () => void) {
    try {
      step();
    } catch (e) {
      failed(e);
    }
  }

  function close() {
    const was = open;
    open = null;
    if (!was) return;
    const spentMs = Math.round(seenAt - was.startedAt);
    if (was.lastMs - was.fromMs < SHORTEST_MS && spentMs < SHORTEST_MS) {
      // A flicker, not watching: nothing to send, and nothing unsent any more.
      tell();
      return;
    }
    started.add(was.videoId);
    closedOf.set(was.videoId, (closedOf.get(was.videoId) ?? 0) + 1);
    waiting.push({ id: was.id, videoId: was.videoId, fromMs: was.fromMs, toMs: Math.max(was.fromMs, was.lastMs), spentMs: Math.max(0, spentMs), rate: was.rate });
    void flush();
  }

  /** The try again after a failed send, while one is set. */
  let retry: ReturnType<typeof setTimeout> | null = null;

  /**
   * Sends what's waiting, one batch at a time, `BATCH_MAX` at most each. A batch that lands takes the next straight
   * after it; one that fails, or whose send throws, leaves everything waiting with why, tried again `RETRY_MS` later,
   * or sooner with the next stretch that closes, until it lands. Done once the batch on its way has landed or failed.
   */
  function flush(): Promise<void> {
    if (sending) return sending;
    if (retry !== null) {
      clearTimeout(retry);
      retry = null;
    }
    if (waiting.length === 0) return Promise.resolve();
    const stretches = waiting.slice(0, BATCH_MAX);
    const ids = new Set(stretches.map((s) => s.videoId));
    const batch: WatchBatch = { videos: [...ids].flatMap((id) => videos.get(id) ?? []).slice(0, 20), stretches };
    let landed = false;
    sending = (async () => {
      try {
        let sent: Sent;
        try {
          sent = await deps.send(batch);
        } catch (e) {
          sent = { ok: false, message: wordsOfError(e) };
        }
        landed = sent.ok;
        if (sent.ok) {
          waiting.splice(0, stretches.length);
          savedAt = Date.now();
          if (waiting.length === 0) {
            waitingSince = null;
            sendProblem = null;
          }
        } else {
          waitingSince ??= Date.now();
          sendProblem = sent.message;
          console.warn(`[Panki] watching: ${waiting.length} stretches not sent yet, tried again in ${RETRY_MS / 1000} s:`, sent.message);
        }
      } catch (e) {
        failed(e);
      } finally {
        sending = null;
        guarded(tell);
        if (waiting.length > 0) {
          if (landed) void flush();
          else retry = setTimeout(() => void flush(), RETRY_MS);
        }
      }
    })();
    guarded(tell);
    return sending;
  }

  /** Looks at the player once: a stretch kept going, closed or opened. */
  function look(player: HTMLVideoElement | null) {
    const now = clock();
    if (!on || !videoId || !player || player.paused || player.ended || player.seeking || player.readyState < 3 || deps.isAd()) {
      close();
      return;
    }
    const at = Math.round(player.currentTime * 1000);
    const rate = player.playbackRate;
    if (Number.isFinite(player.duration) && player.duration > 0) {
      videos.set(videoId, { videoId, lengthMs: Math.round(player.duration * 1000), ...(videos.get(videoId) ?? deps.about(videoId)) });
    }
    if (open) {
      const expected = open.lastMs + (now - seenAt) * open.rate;
      const jumped = Math.abs(at - expected) > JUMP_MS;
      const due = now - open.startedAt >= (started.has(open.videoId) ? WATCH.flushMs : WATCH.firstMs);
      if (jumped || rate !== open.rate || due || open.videoId !== videoId) {
        // Played on without a jump: the next stretch picks up where this one ended.
        if (!jumped) {
          open.lastMs = at;
          seenAt = now;
        }
        close();
      } else {
        open.lastMs = at;
        seenAt = now;
        return;
      }
    }
    // The page's name and channel are read afresh as each stretch opens: the site writes them a moment after the video changes.
    const known = videos.get(videoId);
    if (known) videos.set(videoId, { ...known, ...deps.about(videoId) });
    open = { id: uuid(), videoId, fromMs: at, lastMs: at, startedAt: now, rate };
    seenAt = now;
    // Something watched isn't with Panki from this moment: the head says so.
    tell();
  }

  return {
    /**
     * The video on the page now, and whether its watching is noted: this browser's own choices alone (its Video
     * tracking, Panki on), never whether Panki answered. Whatever was open belonged to the last.
     */
    video(next: string | null, keep: boolean) {
      guarded(() => {
        if (next !== videoId || !keep) close();
        // An error is said for the video it happened on, not the next.
        if (next !== videoId) fault = null;
        videoId = next;
        on = keep;
        tell();
      });
    },
    /** Looks at the player, a few times a second; a failure in it is said, and the next look tries again. */
    tick(player: HTMLVideoElement | null) {
      guarded(() => look(player));
    },
    /** How many stretches of a video this page has closed, to be sent or sent. */
    closed(id: string): number {
      return closedOf.get(id) ?? 0;
    },
    /** The page is being left or hidden: what's open is closed and sent. */
    leave() {
      guarded(() => {
        close();
        void flush();
      });
    },
    /**
     * What's been watched sent now, so what Panki says of the video right after holds all of it (the Video recap): the
     * stretch open closed, the video playing on into the next at the next look, and whatever waits sent. Done once
     * it's landed or failed; a batch already on its way is waited for first.
     */
    async sendNow() {
      guarded(close);
      await flush();
      await flush();
    },
  };
}
