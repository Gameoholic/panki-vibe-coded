import { WATCH, type NewWatchStretch, type WatchBatch, type WatchVideo } from "@panki/contracts";
import { uuid } from "../uuid";

/**
 * Video tracking on a video's page (the owner, 2026-10-21: "video tracking for stats is enabled by default… count
 * immersion"): each stretch of the video watched without a pause or a jump, from where to where in it, how long it took
 * on the clock and how fast it played, sent to Panki through the worker. A stretch closes when the video stops, jumps,
 * changes speed or changes, when an ad comes on, a video's first one `WATCH.firstMs` after it starts (so it counts at
 * once), and every `WATCH.flushMs` while it plays on (the next one starting where it ended), so a crash or a closed tab
 * loses little. Nothing is noted while the account's Video tracking is off, and
 * Panki keeps nothing then either. Several tabs each watch their own video, each with a watcher of its own.
 */

/** A jump: the video stands this far from where it would be had it played on since the last look. */
const JUMP_MS = 1500;
/** A stretch shorter than this, on the video and on the clock, is a flicker, not watching. */
const SHORTEST_MS = 500;
/** The most stretches waiting to go while Panki can't be reached; the oldest give way. */
const WAITING_MAX = 100;

type Open = { id: string; videoId: string; fromMs: number; lastMs: number; startedAt: number; rate: number };

export type Watcher = ReturnType<typeof createWatcher>;

/**
 * `send` takes a batch to Panki and says whether it went; `about` reads the video as the page shows it (its name, its
 * channel), asked when a stretch opens; `isAd` says whether what's playing is an ad (the site plays them in the same
 * player); `clock` is a moment in ms on the browser's own clock, for how long a stretch took.
 */
export function createWatcher(deps: {
  send: (batch: WatchBatch) => Promise<boolean>;
  about: (videoId: string) => Omit<WatchVideo, "videoId" | "lengthMs">;
  isAd: () => boolean;
  clock?: () => number;
}) {
  const clock = deps.clock ?? (() => performance.now());
  let videoId: string | null = null;
  let on = false;
  let open: Open | null = null;
  /** The videos whose first stretch has gone: a video's first is closed after `WATCH.firstMs`, so it counts at once (the owner, 2026-10-21: "as soon as I clicked the video"); the rest every `WATCH.flushMs`. */
  const started = new Set<string>();
  /** When the open stretch was last seen playing, on the clock. */
  let seenAt = 0;
  const waiting: NewWatchStretch[] = [];
  const videos = new Map<string, WatchVideo>();
  let sending = false;

  function close() {
    const was = open;
    open = null;
    if (!was) return;
    const spentMs = Math.round(seenAt - was.startedAt);
    if (was.lastMs - was.fromMs < SHORTEST_MS && spentMs < SHORTEST_MS) return;
    started.add(was.videoId);
    waiting.push({ id: was.id, videoId: was.videoId, fromMs: was.fromMs, toMs: Math.max(was.fromMs, was.lastMs), spentMs: Math.max(0, spentMs), rate: was.rate });
    if (waiting.length > WAITING_MAX) waiting.splice(0, waiting.length - WAITING_MAX);
    void flush();
  }

  /** Sends what's waiting, one batch at a time; what didn't go waits for the next. */
  async function flush() {
    if (sending || waiting.length === 0) return;
    sending = true;
    const stretches = waiting.slice(0, WAITING_MAX);
    const ids = new Set(stretches.map((s) => s.videoId));
    const batch: WatchBatch = { videos: [...ids].flatMap((id) => videos.get(id) ?? []).slice(0, 20), stretches };
    try {
      if (await deps.send(batch)) waiting.splice(0, stretches.length);
    } finally {
      sending = false;
    }
  }

  return {
    /** The video on the page now, and whether the account keeps its watching. Whatever was open belonged to the last. */
    video(next: string | null, keep: boolean) {
      if (next !== videoId || !keep) close();
      videoId = next;
      on = keep;
    },
    /** Looks at the player, a few times a second. */
    tick(player: HTMLVideoElement | null) {
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
    },
    /** The page is being left or hidden: what's open is closed and sent. */
    leave() {
      close();
      void flush();
    },
  };
}
