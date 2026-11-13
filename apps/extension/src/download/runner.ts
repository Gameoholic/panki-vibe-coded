/** @panki Downloads on a YouTube page: asked for, run in the background by one page at a time, and how they stand (`createDownloads`, `stillOf`). */
import { askDownload, askDownloadClaim, askDownloadHold, askDownloadPiece, askDownloads, askUndownload } from "../messages";
import { createSilentPlayer, type SilentPlayer } from "../transcribe/silent";
import { uuid } from "../uuid";
import {
  DOWNLOAD,
  DoorwayPiece,
  coveredMsOf,
  coveredOf,
  coveredUntil,
  firstGap,
  gainedOf,
  startPiece,
  trackOf,
  type DownloadAbout,
  type DownloadJob,
  type DownloadRow,
  type HoldEnd,
  type PieceAsk,
  type Track,
  type TrackStretch,
} from "./download";

/**
 * A page of the site runs one download at a time, whichever page the worker hands it to (`download/store.ts` →
 * `claimDownload`): any YouTube page that's open takes one up while none is running, so a download asked for on one
 * video goes on as the viewer moves to the next, and one left when a tab closed is taken up by the next page. It plays
 * the video through in a hidden frame of its own (`transcribe/silent.ts`, kept), from the first moment not in yet; the
 * doorway script in that frame sends back every piece the site's player is handed (`content/doorway.ts`), and each is
 * sent on to the worker to be kept, one after another in the order it came. It's whole once both streams cover the
 * video; it goes back for what's missing when the player reaches the end, and past what an earlier run kept.
 */

/** How the downloads stand, as a page shows them: every one, the one this page runs as it goes; null until first read. */
export type DownloadsNow = { rows: readonly DownloadRow[] | null };

export type Downloads = {
  /** The worker asked for downloads to run from now on. */
  start(): void;
  /** A video asked to be downloaded; it starts here at once when nothing else is running. */
  download(about: DownloadAbout): Promise<void>;
  /** A download taken off, stopped first if it's running here. */
  remove(videoId: string): Promise<void>;
  /** Read again every moment while something's showing them (another page's progress); returns how to stop. */
  watch(): () => void;
  get(): DownloadsNow;
  subscribe(follower: () => void): () => void;
};

/** Why a run stopped, in words a row shows. */
const NOTHING = "YouTube's player gave nothing to copy.";
const BLOCKED = "The browser wouldn't play it in the background.";
const STUCK_AT = (at: number) => `A part at ${Math.floor(at / 60_000)}:${String(Math.floor((at % 60_000) / 1000)).padStart(2, "0")} wouldn't come in.`;
/** How often the same missing part is gone back for in one run before it's stopped. */
const GAP_TRIES = 2;
/** How often the list is read again while something's showing it. */
const WATCH_MS = 2000;

type Run = {
  job: DownloadJob;
  /** The run's own random mark, in its frame's address and on every piece sent back. */
  mark: string;
  player: SilentPlayer;
  /** What each stream held as the run began: gone past, never fetched again. */
  before: ReturnType<typeof coveredOf>;
  /** What each stream holds now, as pieces are kept. */
  stretches: TrackStretch[];
  /** Pieces sent on one after another, in the order they came, and how many are on their way. */
  queue: Promise<void>;
  sending: number;
  /** Pieces of a stream whose length isn't known yet, by the stream. */
  held: Map<number, DoorwayPiece[]>;
  /** The last start piece each stream had kept, as text: the player hands it again at every seek. */
  starts: Map<Track, string>;
  /** How many pieces were kept, and where the run started in the video, seconds. */
  kept: number;
  from: number;
  /** When it last told the worker it's still running, by `Date.now()`. */
  toldAt: number;
  /** How often each missing part was gone back for. */
  gaps: Map<number, number>;
};

/** The first bytes of a piece sent as text: enough to tell a start piece. */
const headOf = (base64: string): Uint8Array => Uint8Array.from(atob(base64.slice(0, 16)), (c) => c.charCodeAt(0));
const ms = (seconds: number) => Math.round(seconds * 1000);

/** A still of a video as it's showing, small, as a JPEG's text; null when the browser won't give one (no picture yet). */
export function stillOf(video: HTMLVideoElement): string | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = DOWNLOAD.stillWidth;
    canvas.height = Math.round((DOWNLOAD.stillWidth * video.videoHeight) / video.videoWidth);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", DOWNLOAD.stillQuality);
  } catch {
    return null;
  }
}

export function createDownloads(): Downloads {
  let now: DownloadsNow = { rows: null };
  const followers = new Set<() => void>();
  let run: Run | null = null;
  let claiming = false;
  let claimAt = 0;
  let started = false;

  const publish = () => {
    for (const follower of followers) follower();
  };
  /** The rows, the one running here as it stands this moment. */
  const shown = (rows: readonly DownloadRow[] | null): DownloadsNow => {
    const mine = run;
    if (!rows || !mine) return { rows };
    return { rows: rows.map((row) => (row.videoId === mine.job.videoId ? { ...row, state: "going", coveredMs: coveredMsOf(coveredOf(mine.stretches), mine.job.durationMs) } : row)) };
  };
  let listed: readonly DownloadRow[] | null = null;
  const redraw = () => {
    now = shown(listed);
    publish();
  };
  async function refresh() {
    const answer = await askDownloads();
    if (!answer.ok) return;
    listed = answer.rows;
    redraw();
  }

  async function claim() {
    if (claiming || run) return;
    claiming = true;
    claimAt = Date.now() + DOWNLOAD.claimEveryMs;
    try {
      const answer = await askDownloadClaim();
      if (answer.ok && answer.job && !run) begin(answer.job);
    } finally {
      claiming = false;
    }
  }

  function begin(job: DownloadJob) {
    const before = coveredOf(job.covered);
    const gap = firstGap(before, job.durationMs);
    const mark = uuid();
    const player = createSilentPlayer(job.videoId, DOWNLOAD.speed, { kind: "keep", mark, height: job.quality }, {
      // Where the site moved it and where it got stuck matter only to the run, which reads the player's report.
      stray: () => undefined,
      stuck: () => undefined,
    });
    const mine: Run = { job, mark, player, before, stretches: [...job.covered], queue: Promise.resolve(), sending: 0, held: new Map(), starts: new Map(), kept: 0, from: (gap ?? 0) / 1000, toldAt: Date.now(), gaps: new Map() };
    run = mine;
    if (gap === null) {
      void finish(mine);
      return;
    }
    player.go(gap / 1000);
    void refresh();
  }

  /** The run let go here: its frame taken down, the next looked for a moment later. */
  function letGo(mine: Run) {
    if (run !== mine) return;
    run = null;
    mine.player.destroy();
    claimAt = Date.now() + DOWNLOAD.claimEveryMs;
    void refresh();
  }
  async function end(mine: Run, how: HoldEnd) {
    if (run !== mine) return;
    letGo(mine);
    await askDownloadHold(mine.job.videoId, how);
    void refresh();
  }
  async function finish(mine: Run) {
    // Every piece on its way is kept before it's said to be whole.
    await mine.queue;
    await end(mine, { kind: "done" });
  }

  /** A piece sent on to be kept, after the ones before it: a stream's start piece only when it isn't the one it had already. */
  function send(mine: Run, piece: DoorwayPiece) {
    const track = trackOf(piece.type);
    if (!track) return;
    const init = startPiece(headOf(piece.base64));
    if (init) {
      if (mine.starts.get(track) === piece.base64) return;
      mine.starts.set(track, piece.base64);
    }
    const gained = init ? null : gainedOf(piece.before, piece.after);
    const ask: PieceAsk = {
      track,
      type: piece.type,
      init,
      fromMs: gained?.fromMs ?? null,
      toMs: gained?.toMs ?? null,
      offsetMs: ms(piece.offset),
      windowMs: [ms(piece.window[0]), piece.window[1] === null ? null : ms(piece.window[1])],
    };
    mine.sending++;
    mine.queue = mine.queue.then(() => keep(mine, track, ask, gained, piece.base64)).finally(() => {
      mine.sending--;
    });
  }

  /** One piece kept by the worker; the run stops when the worker says it's no longer this page's. */
  async function keep(mine: Run, track: Track, ask: PieceAsk, gained: ReturnType<typeof gainedOf>, base64: string) {
    if (run !== mine) return;
    const answer = await askDownloadPiece(mine.job.videoId, ask, base64);
    if (run !== mine) return;
    if (!answer.ok) {
      await end(mine, { kind: "stopped", trouble: answer.message });
      return;
    }
    if (!answer.going) {
      letGo(mine);
      return;
    }
    mine.kept++;
    mine.toldAt = Date.now();
    if (gained) mine.stretches.push({ track, ...gained });
    redraw();
  }

  /**
   * A piece the doorway script sent back. Only a stream as long as the video is the video's (an ad plays in a stream of
   * its own): a stream whose length isn't known yet has its pieces held until it is.
   */
  function take(mine: Run, piece: DoorwayPiece) {
    if (piece.duration === null) {
      const held = [...(mine.held.get(piece.stream) ?? []), piece].slice(-DOWNLOAD.heldMax);
      mine.held.set(piece.stream, held);
      return;
    }
    const waiting = mine.held.get(piece.stream) ?? [];
    mine.held.delete(piece.stream);
    if (Math.abs(ms(piece.duration) - mine.job.durationMs) > DOWNLOAD.durationSlackMs) return;
    for (const each of [...waiting, piece]) send(mine, each);
  }

  /** The run looked at: whole, stopped, going back for what's missing, past what's kept, or still saying it runs. */
  function look() {
    const mine = run;
    if (!mine) {
      if (Date.now() >= claimAt) void claim();
      return;
    }
    const report = mine.player.report();
    if (report.failed !== null || report.blocked) {
      void end(mine, { kind: "stopped", trouble: report.failed ?? BLOCKED });
      return;
    }
    if (Date.now() - mine.toldAt >= DOWNLOAD.holdEveryMs) {
      mine.toldAt = Date.now();
      void askDownloadHold(mine.job.videoId, { kind: "going" }).then((answer) => {
        if (answer.ok && !answer.going) letGo(mine);
      });
      void refresh();
    }
    const gap = firstGap(coveredOf(mine.stretches), mine.job.durationMs);
    if (gap === null) {
      void finish(mine);
      return;
    }
    if (!report.ready || report.ad || !report.playing) {
      // At the end with a part missing, once every piece on its way is kept: it may be one of them.
      if (report.ended && mine.sending === 0) goBack(mine, gap);
      return;
    }
    if (mine.kept === 0 && report.at - mine.from > DOWNLOAD.nothingSeconds) {
      void end(mine, { kind: "stopped", trouble: NOTHING });
      return;
    }
    const past = coveredUntil(mine.before, ms(report.at));
    if (past !== null && past - ms(report.at) > DOWNLOAD.skipMs) go(mine, past);
  }

  /** The hidden player sent on, ms: what's copied is counted from there. */
  function go(mine: Run, atMs: number) {
    mine.from = atMs / 1000;
    mine.player.go(atMs / 1000, false);
  }

  /** At the end with a part still missing: back to it, a few times at most. */
  function goBack(mine: Run, gap: number) {
    const tries = (mine.gaps.get(gap) ?? 0) + 1;
    mine.gaps.set(gap, tries);
    if (tries > GAP_TRIES) {
      void end(mine, { kind: "stopped", trouble: STUCK_AT(gap) });
      return;
    }
    go(mine, gap);
  }

  return {
    start() {
      if (started) return;
      started = true;
      // What the doorway script sends back, from a frame of the site's: only a piece carrying the running run's mark is taken.
      window.addEventListener("message", (e: MessageEvent<unknown>) => {
        const mine = run;
        if (!mine || e.origin !== location.origin) return;
        const read = DoorwayPiece.safeParse(e.data);
        if (read.success && read.data.mark === mine.mark) take(mine, read.data);
      });
      setInterval(look, DOWNLOAD.lookMs);
      void refresh();
    },
    async download(about) {
      const answer = await askDownload(about);
      if (!answer.ok) return;
      await refresh();
      claimAt = 0;
      await claim();
    },
    async remove(videoId) {
      if (run?.job.videoId === videoId) letGo(run);
      await askUndownload(videoId);
      await refresh();
    },
    watch() {
      void refresh();
      const timer = setInterval(() => void refresh(), WATCH_MS);
      return () => clearInterval(timer);
    },
    get: () => now,
    subscribe(follower) {
      followers.add(follower);
      return () => {
        followers.delete(follower);
      };
    },
  };
}
