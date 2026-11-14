/** @panki Downloads on a YouTube page: asked for, run in the background by one page at a time, and how they stand (`createDownloads`, `stillOf`). */
import { askDownload, askDownloadClaim, askDownloadHold, askDownloadPiece, askDownloads, askUndownload } from "../messages";
import { clock } from "@web/words";
import { createSilentPlayer, type SilentPlayer, type SilentReport } from "../transcribe/silent";
import { uuid } from "../uuid";
import {
  DOWNLOAD,
  DoorwayNote,
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

/**
 * How the downloads stand, as a page shows them: every one, the one this page runs as it goes, null until first read;
 * and while the one running here has kept nothing, where it got to (`whereOf`).
 */
export type DownloadsNow = { rows: readonly DownloadRow[] | null; where: { videoId: string; words: string } | null };

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
  /** What's been heard from the frame: the doorway script awake, streams made, pieces copied, and those left out as another stream's (an ad's). */
  heard: { awake: boolean; streams: number; copied: number; other: number };
  /** Where a run that has kept nothing stands, in words (`whereOf`); null once pieces are kept. */
  where: string | null;
  /** How the site's player stood the last time the hidden player got stuck loading (`silent.ts` → `stuckWords`). */
  stuck: string | null;
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

/**
 * Whether the page has been pressed since it loaded. Until then the browser won't let a frame of it start a video with
 * sound, and the site's player in the hidden frame never asks for the video at all ("no source"): a download is only
 * taken up once it has (the press on Download is one). A transcribing run waits for the viewer's video to play, which
 * comes to the same. A browser that can't say counts as pressed.
 */
const pressedHere = (): boolean => (navigator as Navigator & { userActivation?: UserActivation }).userActivation?.hasBeenActive ?? true;

/** A step of a download said in the page's console, as the transcriber's Log prints its own. */
const say = (words: string) => console.info(`[Panki] download: ${words}`);

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
  let now: DownloadsNow = { rows: null, where: null };
  const followers = new Set<() => void>();
  let run: Run | null = null;
  let claiming = false;
  let claimAt = 0;
  let started = false;

  const publish = () => {
    for (const follower of followers) follower();
  };
  /** The rows, the one running here as it stands this moment, and where it got to while it has kept nothing. */
  const shown = (rows: readonly DownloadRow[] | null): DownloadsNow => {
    const mine = run;
    if (!rows || !mine) return { rows, where: null };
    return {
      rows: rows.map((row) => (row.videoId === mine.job.videoId ? { ...row, state: "going", coveredMs: coveredMsOf(coveredOf(mine.stretches), mine.job.durationMs) } : row)),
      where: mine.where === null ? null : { videoId: mine.job.videoId, words: mine.where },
    };
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
      stray: (to, back) => say(`YouTube moved the hidden player to ${clock(to)}, put back at ${clock(back)}`),
      stuck: (at, seconds, state, again) => {
        mine.stuck = state;
        say(`hidden player stuck loading at ${clock(at)} for ${Math.round(seconds)} s (${state}), ${again ? "opened it again there" : "given up"}`);
      },
    });
    const mine: Run = { job, mark, player, before, stretches: [...job.covered], queue: Promise.resolve(), sending: 0, heard: { awake: false, streams: 0, copied: 0, other: 0 }, where: null, stuck: null, starts: new Map(), kept: 0, from: (gap ?? 0) / 1000, toldAt: Date.now(), gaps: new Map() };
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
   * A piece the doorway script sent back. An ad plays in a stream of its own: a piece is left out when its stream's
   * length is known and isn't the video's, or, the length not known (the site may never set it, and then the browser
   * says none, or an endless one), when the hidden player is showing an ad.
   */
  function take(mine: Run, piece: DoorwayPiece) {
    mine.heard.copied++;
    const other = piece.duration !== null ? Math.abs(ms(piece.duration) - mine.job.durationMs) > DOWNLOAD.durationSlackMs : mine.player.report().ad;
    if (other) {
      mine.heard.other++;
      return;
    }
    send(mine, piece);
  }

  /** What the doorway script says of itself. */
  function hear(mine: Run, note: DoorwayNote) {
    if (note.note === "awake") mine.heard.awake = true;
    else {
      mine.heard.streams++;
      say(`YouTube's player made a stream: ${note.type ?? "of no kind"}`);
    }
  }

  /**
   * Where a run that has kept nothing stands, step by step along the way a piece comes: the hidden player opening, the
   * doorway script awake in it, an ad, a stream made, a piece handed over, a piece kept. Null once pieces are kept.
   */
  function whereOf(mine: Run, report: SilentReport): string | null {
    if (mine.kept > 0) return null;
    if (!report.ready) return report.stage === "opening" ? "Opening the video in the background." : "Looking for YouTube's player in the background.";
    if (!mine.heard.awake) return "The copy script didn't start in the hidden player.";
    if (report.ad) return "An ad is playing in the background.";
    if (!report.playing) return "Waiting for YouTube's player to start.";
    if (mine.heard.streams === 0) return "YouTube's player made no stream to copy.";
    if (mine.heard.copied === 0) return "YouTube's player handed nothing over yet.";
    if (mine.heard.copied === mine.heard.other) return `Every piece so far was another stream's (${mine.heard.other}).`;
    return "Pieces copied, being kept.";
  }

  /** The run looked at: whole, stopped, going back for what's missing, past what's kept, or still saying it runs. */
  function look() {
    const mine = run;
    if (!mine) {
      if (Date.now() >= claimAt && pressedHere()) void claim();
      return;
    }
    const report = mine.player.report();
    if (report.failed !== null || report.blocked) {
      // Given up loading, the reason says how the site's player stood, so the row tells which step stopped it.
      const how = [mine.stuck, `the ${report.page} page`, mine.heard.awake ? "the copy script awake" : "the copy script not started"].filter((part) => part !== null).join(", ");
      const trouble = report.failed === null ? BLOCKED : `${report.failed} ${how}.`;
      void end(mine, { kind: "stopped", trouble });
      return;
    }
    const where = whereOf(mine, report);
    if (where !== mine.where) {
      mine.where = where;
      if (where !== null) say(where);
      redraw();
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
      // Stopped with where it got to, which the row then shows as why it waits.
      void end(mine, { kind: "stopped", trouble: mine.where ?? NOTHING });
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
        const piece = DoorwayPiece.safeParse(e.data);
        if (piece.success) {
          if (piece.data.mark === mine.mark) take(mine, piece.data);
          return;
        }
        const note = DoorwayNote.safeParse(e.data);
        if (note.success && note.data.mark === mine.mark) hear(mine, note.data);
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
