import {
  TRANSCRIBE_MODES,
  VideoId,
  modeOf,
  overDownloadLimit,
  wayOf,
  type Stretch,
  type TranscribeEstimate,
  type TranscribeMode,
  type TranscribeWay,
  type Transcript,
  type Transcription,
  type WholeJob,
} from "@panki/contracts";
import { aboutWords, clock } from "@web/words";
import { askPiece, askPoll, askTranscript, askWhole } from "../messages";
import { DEFAULT_SOURCE, engineWanted, sourceOf, type SubtitleSource } from "../subtitles";
import { DEFAULT_PREFS, type TranscribePrefs } from "./prefs";
import { uuid } from "../uuid";
import { coveredUntil, nextUncovered } from "./lines";
import type { CutPiece } from "./pieces";
import { createSilentPlayer, type SilentPlayer, type SilentReport } from "./silent";

/**
 * Transcribing a video, in the mode this viewer uses (Panki's default for everyone until they pick another in the
 * strip's menu; `contracts/transcription.ts` → `TranscribeMode`), decided once as the video's length is known:
 *
 * - Full: Panki's server has the engine download the whole video and transcribe it in one call; nothing plays here.
 * - Live: chunks, as it was done until 2026-10-20. The silent player runs ahead of the viewer, as far as the lead
 *   allows, and waits for them there; where they jump, it follows; what's been transcribed already (by anyone) it skips.
 * - Hybrid: both at once. The chunks give words within seconds, the whole video downloads behind them, and when it's
 *   in its words replace the chunks' and the silent player stops.
 * - Auto: Hybrid within the download limit, Live past it.
 *
 * A video over the download limit is downloaded whole only as Panki's settings say: by itself, after a question to the
 * viewer (Warn first), or not at all. Everything starts by itself the moment the video plays when Auto transcribe is on
 * and the engine is the source picked (this browser's pick, `subtitles.ts`; with the site's captions or None picked
 * nothing is transcribed at all), or at a press in the menu. Every video is taken to be in the language Panki's settings
 * name, told to the engine, never asked. Every chunk and every download goes through Panki (the worker asks it); the
 * transcript that comes back is what the line under the player reads. The settings that cost are everyone's (an admin
 * sets them in Panki); how it behaves for this viewer (`prefs.ts`) is this browser's own; both are read with the
 * transcript, so nothing here keeps a setting of its own.
 *
 * Every decision is written down with its reason (the owner, 2026-10-19: "a button that shows the thought process and
 * execution for this particular session… along with always logging it into the console"): in the strip menu's Log, and
 * on the page's console as "[Panki] 12:05:03 …".
 */

/** The transcriber's tuning, one home. Seconds. */
export const FOLLOW = {
  /** A run begins this much before where the viewer is, so the first word is heard whole. */
  back: 1.5,
  /** The silent player, held at the lead, goes on once the viewer has come this much closer. */
  slack: 10,
  /** The viewer this far outside what the run is on (before where it began, or ahead of the silent player) has jumped, not watched, and is followed. */
  jump: 3,
  /** The silent player has reached the end once it's this close to it. */
  endSlack: 0.5,
  /** Something transcribed already, lying this far ahead of the silent player, is skipped over. */
  skipAhead: 1.5,
  /**
   * A video's page is left to itself for this long after it changes before a run starts by itself. The silent player's
   * frame is the same origin as the page, so it runs on the page's own thread, and a player booting in it while the
   * page is still switching videos left the page unresponsive for seconds (2026-10-17, Chrome's "page isn't
   * responding"). A press on Transcribe doesn't wait, nor does asking for the whole video, which plays nothing here.
   */
  settle: 4,
  /** How often the transcript is read again while the whole video is downloading on Panki. */
  poll: 3,
} as const;
/** How many decisions the Log keeps: this page's, the oldest let go. */
const LOG_MAX = 400;

/**
 * How transcribing stands. `loading` is the first moments of a video, before it can be said for sure (the owner,
 * 2026-10-18: the status "changes a lot in the first couple of seconds… I can't rely on it"): the transcript, the
 * settings and the video's length not in yet, the few seconds the page is left to settle before a run starts by
 * itself, or a run begun whose silent player isn't up yet (`run`: a run is under way, so it's stopped rather than
 * started). It gives way to what's true as soon as that's known. `whole` is Full's download under way, with no chunks.
 */
export type TranscribeStatus =
  | { kind: "loading"; run: boolean }
  | { kind: "off" }
  | { kind: "running"; to: number }
  | { kind: "held"; to: number }
  | { kind: "whole" }
  | { kind: "done" }
  | { kind: "noKey" }
  | { kind: "blocked" }
  | { kind: "signedOut" }
  | { kind: "failed"; message: string };

/** What the mode came to on this video, decided once its length is known: the mode, what it is here (Auto picks), and whether the video is over the download limit. */
export type Decided = { mode: TranscribeMode; way: TranscribeWay; long: boolean; seconds: number };

/** A line of the Log: a mode named in it is said as the mode (drawn as its chip in the menu, by name on the console). */
export type LogPart = string | { mode: TranscribeMode };
export type LogEntry = { at: number; parts: readonly LogPart[] };

export type TranscribeState = {
  videoId: string | null;
  transcript: Transcript | null;
  settings: Transcription | null;
  /** Whether the chosen engine has a key to run with. */
  key: boolean;
  /** What a whole-video download takes, as measured on Panki so far. */
  estimate: TranscribeEstimate | null;
  /** Where the words come from: this browser's pick. */
  source: SubtitleSource;
  /** How it behaves for this viewer: this browser's own (`prefs.ts`). */
  prefs: TranscribePrefs;
  status: TranscribeStatus;
  /** What the run has heard that isn't back from the engine yet: from the covered edge behind the silent player to where it stands, in ms (the whole video while it downloads with no chunks); null otherwise. It pulses on the seek bar. */
  working: Stretch | null;
  /** What the mode came to on this video; null until its length is known. */
  decided: Decided | null;
  /** The question before downloading a video over the download limit (Warn first) is waiting for an answer. */
  asking: boolean;
  /** The whole video isn't downloaded here: it's over the download limit, and that's not allowed. */
  refused: boolean;
  /** Every decision this page made, with its reason. */
  log: readonly LogEntry[];
};

type Run = {
  silent: SilentPlayer;
  /** Where this run began, in the video. */
  from: number;
  /**
   * What the run is for: following the viewer (held at the lead, following their jumps), or a stretch of the video in
   * the background, to `until` (a moment, or null for the video's end) whatever the viewer does: "Transcribe a part" in
   * the strip's menu (the owner, 2026-10-17). One run at a time: a background run takes the place of one under way, and
   * the following run waits for it to finish before it starts by itself again.
   */
  scope: RunScope;
  /** Chunks go one after another, each waiting for the last to come back. */
  queue: Promise<void>;
  /** From when the time to its first words is counted, by `performance.now()`: the video's change for a run that started by itself, the press otherwise. */
  since: number;
  /** Its first chunk with sound has been sent (only that one says how long it took to get there). */
  sentSound: boolean;
  /** Whether the silent player was wanted playing at the last look, so a change of mind is written down once. */
  playing: boolean | null;
};
export type RunScope = { follow: true } | { follow: false; until: number | null };

/** This video's chunks sent to Panki: how many came back, how many are on their way, and the last one back (its stretch in ms, how long it took and when it came, by `performance.now()`). */
export type PieceTally = {
  back: number;
  waiting: number;
  last: { startMs: number; endMs: number; tookMs: number; at: number } | null;
};

/**
 * How transcribing stands, in full: what the strip's menu shows under Details (the owner, 2026-10-19: "the actual
 * status in detail… so we can debug better"). Asked for while they're open, never told: it changes many times a second.
 */
export type TranscribeDetail = {
  /** Whether this video's transcript and the settings are in from Panki. */
  loaded: boolean;
  /** Seconds before a run may start by itself (the page settling after a change of video); 0 once it may. */
  settling: number;
  /** Nothing starts by itself on this video any more: Stop was pressed, or something failed. */
  stopped: boolean;
  /** The run under way: what it's for, where it began, its silent player as it says of itself, and how far ahead of the viewer that is, in seconds. */
  run: { scope: RunScope; from: number; silent: SilentReport; ahead: number } | null;
  pieces: PieceTally;
};

/** How long the whole video takes to download and transcribe, in seconds, as measured so far; null with nothing measured. */
export function wholeSeconds(estimate: TranscribeEstimate | null, lengthMs: number): number | null {
  if (!estimate || estimate.secondsPerMinute === null) return null;
  return estimate.secondsPerMinute * (lengthMs / 60_000);
}
/** A Log line as plain text: a mode by its name. */
export const logText = (parts: readonly LogPart[]) => parts.map((part) => (typeof part === "string" ? part : TRANSCRIBE_MODES[part.mode].name)).join("");
/** The time of day a decision was made, as the Log says it: "12:05:03". */
export const timeOfDay = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour12: false });

/** A chunk's sound as the text a message can carry. */
function base64Of(bytes: Uint8Array): string {
  let text = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) text += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(text);
}

const sameStatus = (a: TranscribeStatus, b: TranscribeStatus) =>
  a.kind === b.kind &&
  ("to" in a && "to" in b ? Math.floor(a.to) === Math.floor(b.to) : true) &&
  ("message" in a && "message" in b ? a.message === b.message : true) &&
  ("run" in a && "run" in b ? a.run === b.run : true);

/** Whether two transcripts read the same: the words, what's covered and the download, so a read with nothing new in it changes nothing. */
const sameTranscript = (a: Transcript | null, b: Transcript) =>
  a !== null &&
  a.videoId === b.videoId &&
  a.words.length === b.words.length &&
  a.words.at(-1)?.id === b.words.at(-1)?.id &&
  a.covered.length === b.covered.length &&
  a.covered.at(-1)?.endMs === b.covered.at(-1)?.endMs &&
  a.job?.id === b.job?.id &&
  a.job?.state === b.job?.state;

export type Transcriber = ReturnType<typeof createTranscriber>;

export function createTranscriber() {
  let videoId: string | null = null;
  let transcript: Transcript | null = null;
  let settings: Transcription | null = null;
  let key = false;
  let estimate: TranscribeEstimate | null = null;
  let source: SubtitleSource = DEFAULT_SOURCE;
  let prefs: TranscribePrefs = DEFAULT_PREFS;
  let status: TranscribeStatus = { kind: "off" };
  let working: Stretch | null = null;
  let run: Run | null = null;
  /** Nothing starts by itself on this video any more: Stop was pressed, or something failed. */
  let autoBlocked = false;
  /** The transcript changed under the run (a stretch forgotten): at the next look the run goes back for what's uncovered behind it. */
  let resync = false;
  /** When the page last changed video, by `performance.now()`: a run waits `FOLLOW.settle` from then before starting by itself. */
  let changedAt = 0;
  /** Counts the videos, so an answer about the last one is known for what it is. */
  let turn = 0;
  /** This video's chunks; a new tally for each video, so a chunk of the last one still on its way counts in its own. */
  let pieces: PieceTally = { back: 0, waiting: 0, last: null };
  /** Where the viewer was at the last look, in seconds. */
  let viewerAt = 0;
  /** What the mode came to on this video, and whether it has been decided before on it (a later decision is a change of mode). */
  let decided: Decided | null = null;
  let decidedOnce = false;
  /** The whole-video download, on this visit to the video: asked for here; the question waiting, answered yes, answered no; not allowed; what went wrong. */
  let wholeAsked = false;
  /** The ask for the download is on its way to Panki: it's as good as under way. */
  let wholeInFlight = false;
  let asking = false;
  let confirmed = false;
  let declined = false;
  let refused = false;
  let wholeFailed: string | null = null;
  /** The download as it was last seen, so a change in it is acted on once. */
  let seenJob: { id: string; state: WholeJob["state"] } | null = null;
  /** When the transcript was last read again for the download, by `performance.now()`. */
  let lastPoll = 0;
  let log: readonly LogEntry[] = [];

  const followers = new Set<() => void>();
  const snap = (): TranscribeState => ({ videoId, transcript, settings, key, estimate, source, prefs, status, working, decided, asking, refused, log });
  let snapshot: TranscribeState = snap();
  const tell = () => {
    snapshot = snap();
    for (const follower of followers) follower();
  };
  /** A decision written down with its reason, in the Log and on the console. */
  const note = (...parts: LogPart[]) => {
    const entry: LogEntry = { at: Date.now(), parts };
    log = [...log.slice(-(LOG_MAX - 1)), entry];
    console.log(`[Panki] ${timeOfDay(entry.at)} ${logText(parts)}`);
    tell();
  };
  const setStatus = (next: TranscribeStatus) => {
    if (sameStatus(status, next)) return;
    const was = status;
    status = next;
    if (next.kind === "blocked" && was.kind !== "blocked") note("blocked · the browser stopped the hidden player; Transcribe tries again");
    if (next.kind === "noKey" && was.kind !== "noKey") note("not transcribing · no key for the engine in Settings → Admin");
    tell();
  };
  /** Told only when it moved by a couple of seconds: every telling redraws the strip, and the seek bar is a pixel or two a second anyway. */
  const setWorking = (next: Stretch | null) => {
    const same = working === next || (working !== null && next !== null && Math.abs(working.startMs - next.startMs) < 2000 && Math.abs(working.endMs - next.endMs) < 2000);
    if (same) return;
    working = next;
    tell();
  };
  /** What a run has heard that isn't back yet: from the covered edge behind the silent player (never before the run began) to where it stands. */
  function heardBy(mine: Run, at: number): Stretch | null {
    let from = mine.from;
    if (transcript) {
      for (const stretch of transcript.covered) {
        const end = stretch.endMs / 1000;
        if (stretch.startMs / 1000 <= at && end > from) from = Math.min(end, at);
      }
    }
    return at - from > 0.5 ? { startMs: Math.round(from * 1000), endMs: Math.round(at * 1000) } : null;
  }

  const job = () => transcript?.job ?? null;
  const downloading = () => job()?.state === "running";

  function end() {
    run?.silent.destroy();
    run = null;
    setWorking(null);
  }

  /**
   * The video's download as it stands now: when it's come in, its words have replaced everything and the silent
   * player stops; when it's failed, that's said. Looked at whenever a transcript comes in. A download already ended
   * when the video was opened is the past, and says nothing.
   */
  function watchJob() {
    const now = job();
    if (!now) {
      seenJob = null;
      return;
    }
    const before = seenJob?.id === now.id ? seenJob.state : null;
    if (before === now.state) return;
    seenJob = { id: now.id, state: now.state };
    if (now.state === "running") {
      if (!wholeAsked) note("whole video already downloading · asked ", clock(Math.max(0, (Date.now() - now.askedAt) / 1000)), " ago");
      return;
    }
    if (before === null) return;
    if (now.state === "done") {
      const stopped = run !== null;
      if (run) end();
      note("whole video done · ", `${(now.words ?? 0).toLocaleString("en")} words · replaced ${now.replaced ?? 0} chunks`, stopped ? " · chunk player stopped" : "");
      return;
    }
    wholeFailed = now.message ?? "The whole video couldn't be transcribed.";
    note("whole video failed · ", wholeFailed);
  }

  /** A transcript come in (a chunk heard, the download read again): taken, unless it says nothing new. */
  function accept(next: Transcript) {
    if (next.videoId !== videoId) return;
    if (sameTranscript(transcript, next)) return;
    transcript = next;
    watchJob();
    tell();
  }

  async function load(id: string) {
    const mine = turn;
    const answer = await askTranscript(id);
    if (mine !== turn) return;
    if (!answer.ok) {
      if (answer.signedOut) setStatus({ kind: "signedOut" });
      else setStatus({ kind: "failed", message: answer.message });
      return;
    }
    transcript = answer.transcript;
    settings = answer.settings;
    key = answer.key;
    estimate = answer.estimate;
    source = sourceOf(answer.source);
    // The mode picked elsewhere (another tab) since: decided afresh.
    if (answer.prefs.mode !== prefs.mode) decided = null;
    prefs = answer.prefs;
    watchJob();
    if (status.kind === "signedOut" || status.kind === "failed") status = { kind: "off" };
    tell();
  }

  /** What the mode comes to on this video, once its length is known; written down as it's decided, and again when the mode changes under it. */
  function decide(seconds: number) {
    if (!settings) return;
    const mode = modeOf(settings, prefs.mode);
    const way = wayOf(mode, settings, seconds);
    const long = overDownloadLimit(settings, seconds);
    decided = { mode, way, long, seconds };
    const picks: LogPart[] = mode === "auto" ? [" picks ", { mode: way }] : [];
    const limit = ` the ${settings.downloadLimit}-minute download limit`;
    note(decidedOnce ? "mode now " : `opened · ${clock(seconds)} · `, { mode }, ...picks, " · ", long ? "over" : "under", limit);
    decidedOnce = true;
    tell();
  }

  /** Whether this visit should download the whole video by itself: the mode's way downloads, none is under way, and none came in before whose words still stand (a part forgotten since is heard again in chunks, not the whole video bought again). */
  function wantsWhole(): boolean {
    if (!decided || decided.way === "live") return false;
    const now = job();
    if (now?.state === "running") return false;
    return !(now?.state === "done" && (transcript?.covered.length ?? 0) > 0);
  }

  /** The whole video downloaded, as the download limit allows: at once, after the viewer's yes (Warn first), or not at all. */
  function whole(id: string, seconds: number) {
    if (!settings) return;
    const limit = `the ${settings.downloadLimit}-minute download limit`;
    if (overDownloadLimit(settings, seconds) && !confirmed) {
      if (settings.overLimit === "notAllowed") {
        if (!refused) {
          refused = true;
          note("whole video not downloaded · ", clock(seconds), ` is over ${limit}, and that's not allowed`);
        }
        return;
      }
      if (settings.overLimit === "warn") {
        if (!asking) {
          asking = true;
          note("asking first · ", clock(seconds), ` is over ${limit}`);
        }
        return;
      }
    }
    void askForWhole(id, seconds);
  }

  async function askForWhole(id: string, seconds: number) {
    wholeAsked = true;
    asking = false;
    wholeFailed = null;
    const takes = wholeSeconds(estimate, seconds * 1000);
    const measured = estimate && estimate.secondsPerMinute !== null ? ` (${estimate.secondsPerMinute.toFixed(1)} s/min, ${estimate.jobs} ${estimate.jobs === 1 ? "download" : "downloads"} in 30 days)` : "";
    note("whole video asked · ", takes === null ? "no data yet on how long it takes" : `about ${aboutWords(takes).slice(1)}${measured}`);
    const mine = turn;
    wholeInFlight = true;
    const answer = await askWhole(id, seconds * 1000);
    if (mine !== turn) return;
    wholeInFlight = false;
    if (!answer.ok) {
      wholeFailed = answer.message;
      note("whole video not asked · ", answer.message);
      if (answer.signedOut) setStatus({ kind: "signedOut" });
      else if (answer.status === 409) {
        key = false;
        setStatus({ kind: "noKey" });
      } else tell();
      return;
    }
    accept(answer.transcript);
  }

  /** The transcript read again while the download is under way, every `FOLLOW.poll` seconds. */
  function poll(id: string) {
    if (!downloading() || performance.now() - lastPoll < FOLLOW.poll * 1000) return;
    lastPoll = performance.now();
    const mine = turn;
    void askPoll(id).then((answer) => {
      if (mine === turn && answer.ok) accept(answer.transcript);
    });
  }

  async function send(mine: Run, id: string, piece: CutPiece, tally: PieceTally) {
    const sentAt = performance.now();
    // A run's first chunk with sound says how long after the run began it went, so Panki can tell how soon the first words come.
    const since = piece.wav && !mine.sentSound ? Math.max(0, Math.round(sentAt - mine.since)) : undefined;
    if (piece.wav) mine.sentSound = true;
    const asked = askPiece({ videoId: id, pieceId: uuid(), startMs: piece.startMs, soundMs: piece.soundMs, endMs: piece.endMs, base64: piece.wav ? base64Of(piece.wav) : null, ...(since === undefined ? {} : { since }) });
    const answer = await asked.finally(() => {
      tally.waiting--;
    });
    if (answer.ok) {
      tally.back++;
      tally.last = { startMs: piece.startMs, endMs: piece.endMs, tookMs: performance.now() - sentAt, at: performance.now() };
    }
    // The video moved on under it: the answer is about the last one.
    if (id !== videoId) return;
    if (!answer.ok) {
      if (run === mine) end();
      autoBlocked = true;
      note("chunk failed · ", answer.message, " · nothing more starts by itself on this video");
      if (answer.signedOut) setStatus({ kind: "signedOut" });
      else if (answer.status === 409) {
        key = false;
        setStatus({ kind: "noKey" });
      } else setStatus({ kind: "failed", message: answer.message });
      return;
    }
    if (piece.wav) {
      const words = answer.transcript.words.filter((w) => w.startMs >= piece.soundMs && w.startMs < piece.endMs).length;
      const heard = answer.engineMs === null ? " · the whole video has it already" : ` · ${words} words · ${(answer.engineMs / 1000).toFixed(1)} s at the engine`;
      note(`chunk ${tally.back} back · `, clock(piece.soundMs / 1000), "–", clock(piece.endMs / 1000), heard);
    }
    accept(answer.transcript);
  }

  function begin(id: string, at: number, scope: Run["scope"], by: "auto" | "press") {
    if (!settings) return;
    const shape = settings;
    // A run that starts by itself as the video opens counts its first words from the video's change, as the viewer waits
    // for them; one started later, or by a press, from now.
    const opening = by === "auto" && performance.now() - changedAt < (FOLLOW.settle + 2) * 1000;
    const mine: Run = {
      from: at,
      scope,
      queue: Promise.resolve(),
      since: opening ? changedAt : performance.now(),
      sentSound: false,
      playing: null,
      silent: createSilentPlayer(id, settings.speed, shape, (piece) => {
        const tally = pieces;
        tally.waiting++;
        mine.queue = mine.queue.then(() => send(mine, id, piece, tally)).catch(() => undefined);
      }),
    };
    run = mine;
    mine.silent.go(at);
    const what = scope.follow ? `chunks started at ${clock(at)}` : scope.until === null ? `chunks of the rest of the video started at ${clock(at)}` : `chunks of ${clock(at)}–${clock(scope.until)} started`;
    note(what, ` · first chunk ${shape.firstChunk} s`, by === "press" ? " · Transcribe pressed" : "");
    // Loading until its silent player is up: then the run itself says how it stands (`steer`).
    setStatus({ kind: "loading", run: true });
  }

  /** Where a run from `from` would begin: the first moment from there that isn't transcribed yet; null when all of it is. */
  const startAt = (from: number, duration: number | null) => nextUncovered(transcript, Math.max(0, from), duration);

  function maybeStart(id: string, t: number, duration: number | null) {
    if (!settings || !transcript) return;
    // The engine isn't the pick (the site's captions, or nothing, is): nothing to say, nothing to do.
    if (!engineWanted(source, settings.engine)) {
      setStatus({ kind: "off" });
      return;
    }
    if (!key) {
      setStatus({ kind: "noKey" });
      return;
    }
    // The video's length decides the mode's way (Auto, the download limit): loading until the player says it.
    if (duration === null || !decided) {
      setStatus({ kind: "loading", run: false });
      return;
    }
    const at = startAt(t - FOLLOW.back, duration);
    if (at === null) {
      setStatus({ kind: "done" });
      return;
    }
    const auto = prefs.trigger === "auto" && !autoBlocked;
    // The whole video, for a way that downloads it: once a visit, by itself, as the download limit allows. It plays
    // nothing here, so it doesn't wait for the page to settle.
    if (auto && !wholeAsked && !declined && wantsWhole()) whole(id, duration);
    if (decided.way === "full") {
      if (downloading() || wholeInFlight) setStatus({ kind: "whole" });
      else if (wholeFailed !== null) setStatus({ kind: "failed", message: wholeFailed });
      else setStatus({ kind: "off" });
      return;
    }
    if (!auto) {
      // Nothing starts by itself here; something is left to transcribe, so Transcribe is the way.
      if (status.kind === "done" || status.kind === "loading" || status.kind === "whole") setStatus({ kind: "off" });
      return;
    }
    // The page has just changed video: left to settle before a second player is opened on its thread. A run is about
    // to start by itself, so it's loading, not "not transcribing".
    if (performance.now() - changedAt < FOLLOW.settle * 1000) {
      setStatus({ kind: "loading", run: false });
      return;
    }
    begin(id, at, { follow: true }, "auto");
  }

  function steer(mine: Run, t: number, paused: boolean, duration: number | null) {
    if (!settings) return;
    // The pick left the engine (the line's picker): the run stops here, pressed or not.
    if (!engineWanted(source, settings.engine)) {
      end();
      note("chunk player stopped · subtitles no longer from the engine");
      setStatus({ kind: "off" });
      return;
    }
    // The mode changed to one with no chunks: the following run stops (a part asked for in the background goes on).
    if (mine.scope.follow && decided?.way === "full") {
      end();
      note("chunk player stopped · ", { mode: "full" }, " has no chunks");
      return;
    }
    const r = mine.silent.report();
    if (r.failed !== null) {
      end();
      autoBlocked = true;
      note("chunk player failed · ", r.failed, " · nothing more starts by itself on this video");
      setStatus({ kind: "failed", message: r.failed });
      return;
    }
    if (r.blocked) {
      setStatus({ kind: "blocked" });
      return;
    }
    const length = duration ?? r.duration;
    /** Where this run is over: a part's end, or the video's. */
    const until = mine.scope.follow || mine.scope.until === null ? length : mine.scope.until;
    /** A run over: covered to the video's end is done; a part done leaves the next look to say what's left (`maybeStart`). */
    const over = (why: string) => {
      end();
      note("chunk player stopped · ", why);
      setStatus(mine.scope.follow || mine.scope.until === null ? { kind: "done" } : { kind: "off" });
    };
    if (r.ended || (until !== null && r.at >= until - FOLLOW.endSlack)) {
      over(mine.scope.follow || mine.scope.until === null ? "reached the end of the video" : "the part is done");
      return;
    }
    if (!r.ready) return;
    // The transcript changed under the run (a stretch forgotten, 2026-10-17: the owner forgot everything mid-video and
    // the run went on ahead while the part they were at stayed bare): what's uncovered behind the silent player, from
    // the viewer on (or from the run's own start, in the background), is gone back for.
    if (resync) {
      resync = false;
      const at = mine.scope.follow ? startAt(t - FOLLOW.back, length) : nextUncovered(transcript, mine.from, until);
      if (at !== null && at < r.at - FOLLOW.jump) {
        if (mine.scope.follow) mine.from = at;
        mine.silent.go(at);
        setWorking(null);
        note("went back to ", clock(at), " · forgotten behind the chunk player");
        setStatus({ kind: "running", to: at });
        return;
      }
    }
    // The viewer is somewhere else: ahead of the silent player, or back before where this run began. It follows, when
    // the first moment to transcribe from there isn't where the player already is (behind the run, over what's covered,
    // there's nothing to follow to). Judged by where they are, not by how they got there: a jump made while the player
    // was still loading was lost when only a change between two looks counted (2026-10-17: a refresh at 10:39 and
    // straight to 0:00 left the run standing by at 10:39).
    if (mine.scope.follow && (t > r.at + FOLLOW.jump || t < mine.from - FOLLOW.jump)) {
      const at = startAt(t - FOLLOW.back, length);
      if (at === null) {
        over("everything from where you are is transcribed");
        return;
      }
      if (Math.abs(at - r.at) > FOLLOW.jump) {
        mine.from = at;
        mine.silent.go(at);
        setWorking(null);
        note("followed you to ", clock(t), " · chunks from ", clock(at), ` · first chunk ${settings.firstChunk} s`);
        setStatus({ kind: "running", to: at });
        return;
      }
    }
    // Over something transcribed already, lying ahead: skipped to its end, or over when that's past where this run is over.
    const covered = coveredUntil(transcript, r.at + FOLLOW.skipAhead);
    if (r.playing && covered !== null && covered > r.at + FOLLOW.skipAhead) {
      if (until !== null && covered >= until - FOLLOW.endSlack) over("the rest is transcribed already");
      else {
        note("skipped ", clock(r.at), "–", clock(covered), " · transcribed already");
        mine.silent.go(covered, false);
      }
      return;
    }
    setWorking(heardBy(mine, r.at));
    if (!mine.scope.follow) {
      // In the background, whatever the viewer does: no lead to hold at, no pause to wait through.
      if (!r.playing) mine.silent.resume();
      setStatus({ kind: "running", to: r.at });
      return;
    }
    const lead = settings.lead * 60;
    const ahead = r.at - t;
    const stoppedWithViewer = paused && prefs.paused === "stop";
    const wantPlaying = !stoppedWithViewer && ahead < lead - (r.playing ? 0 : FOLLOW.slack);
    if (wantPlaying && !r.playing) mine.silent.resume();
    else if (!wantPlaying && r.playing) mine.silent.hold();
    if (mine.playing !== null && mine.playing !== wantPlaying) {
      if (wantPlaying) note("going on from ", clock(r.at), ` · ${clock(Math.max(0, ahead))} ahead of you`);
      else note("standing by at ", clock(r.at), " · ", stoppedWithViewer ? "you paused" : `${clock(ahead)} ahead of you, the lead`);
    }
    mine.playing = wantPlaying;
    setStatus(wantPlaying ? { kind: "running", to: r.at } : { kind: "held", to: r.at });
  }

  return {
    state: () => snapshot,
    subscribe(follower: () => void) {
      followers.add(follower);
      return () => {
        followers.delete(follower);
      };
    },
    /** Another video, or none: everything of the last one stops, and the new one's transcript is asked for. */
    video(id: string | null) {
      const next = id !== null && VideoId.safeParse(id).success ? id : null;
      if (next === videoId) return;
      turn++;
      end();
      videoId = next;
      transcript = null;
      autoBlocked = false;
      changedAt = performance.now();
      pieces = { back: 0, waiting: 0, last: null };
      decided = null;
      decidedOnce = false;
      wholeAsked = false;
      wholeInFlight = false;
      asking = false;
      confirmed = false;
      declined = false;
      refused = false;
      wholeFailed = null;
      seenJob = null;
      lastPoll = 0;
      // Loading until the transcript and the settings are in, and it can be said how it stands.
      status = next ? { kind: "loading", run: false } : { kind: "off" };
      tell();
      if (next) void load(next);
    },
    /** Asks Panki again: the settings may have changed, or the sign-in. */
    refresh() {
      if (videoId) void load(videoId);
    },
    /** Looked at a few times a second, with the viewer's own player. */
    tick(video: HTMLVideoElement | null) {
      const id = videoId;
      if (!video || !id) return;
      const t = video.currentTime;
      viewerAt = t;
      const paused = video.paused;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      if (!decided && settings && transcript && duration !== null) decide(duration);
      poll(id);
      if (run) steer(run, t, paused, duration);
      else {
        // The whole video downloading with no chunks running: the whole bar is what's being worked on.
        const now = job();
        setWorking(now?.state === "running" ? { startMs: 0, endMs: now.lengthMs } : null);
        maybeStart(id, t, duration);
      }
    },
    /** The pick changed here on the page (the line's picker): taken at once; the worker keeps it. */
    setSource(next: SubtitleSource) {
      source = next;
      tell();
    },
    /** Transcribe pressed: what the mode does, from where the viewer is (the whole video, chunks, or both), the language never asked. A run the browser blocked is tried again. */
    start(video: HTMLVideoElement) {
      const id = videoId;
      if (!id || !settings) return;
      autoBlocked = false;
      declined = false;
      wholeFailed = null;
      if (run) {
        run.silent.resume();
        return;
      }
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      // Pressed, the whole video is asked for again even after it failed: a press is what Try again is.
      if (duration !== null && !wholeInFlight && wantsWhole()) whole(id, duration);
      if (decided?.way === "full") {
        tell();
        return;
      }
      const at = startAt(video.currentTime - FOLLOW.back, duration);
      if (at === null) {
        setStatus({ kind: "done" });
        return;
      }
      begin(id, at, { follow: true }, "press");
    },
    /** "Transcribe the whole video": the whole video downloaded on Panki, as the download limit allows (Warn first asks). */
    startWhole(duration: number | null) {
      const id = videoId;
      if (!id || !settings || duration === null || downloading()) return;
      declined = false;
      wholeFailed = null;
      whole(id, duration);
      tell();
    },
    /** The question before downloading a long video answered: download it, or don't. (Switching to Auto is a change of mode, `setPrefs`.) */
    answer(yes: boolean, duration: number | null) {
      const id = videoId;
      if (!id || !asking) return;
      asking = false;
      if (yes && duration !== null) {
        confirmed = true;
        note("answered · download the whole video");
        void askForWhole(id, duration);
        return;
      }
      declined = true;
      note("answered · cancel · the whole video isn't downloaded");
    },
    /** A stretch of the video in the background, whatever the viewer does; what's covered in it is skipped over. A run under way gives way. Nothing when it's covered already. */
    startStretch(from: number, to: number) {
      const id = videoId;
      if (!id || !settings) return;
      const at = nextUncovered(transcript, Math.max(0, from), to);
      if (at === null) return;
      end();
      begin(id, at, { follow: false, until: to }, "press");
    },
    /** A preference of this viewer's changed here on the page (the strip's menu): taken at once; the worker keeps it. A change of mode is decided afresh on this video. */
    setPrefs(next: Partial<TranscribePrefs>) {
      const modeChanged = next.mode !== undefined && next.mode !== prefs.mode;
      const triggerChanged = next.trigger !== undefined && next.trigger !== prefs.trigger;
      prefs = { ...prefs, ...next };
      if (modeChanged) {
        decided = null;
        asking = false;
        confirmed = false;
        declined = false;
        refused = false;
      }
      if (triggerChanged) note(prefs.trigger === "auto" ? "auto transcribe on" : "auto transcribe off · nothing starts by itself");
      tell();
    },
    /** Stop pressed: the chunks stop, and nothing more of this video starts by itself until Transcribe is pressed, or another video plays. A whole-video download under way can't be stopped (it's paid for as it starts) and comes in all the same. */
    stop() {
      end();
      autoBlocked = true;
      asking = false;
      note("stopped by you · nothing more starts by itself on this video", downloading() ? " · the whole video still comes in" : "");
      setStatus({ kind: "off" });
    },
    /** The transcript changed another way (a word or a line fixed, a stretch forgotten): taken as it is, and a run under way looks again at what's behind it. */
    take(next: Transcript) {
      if (next.videoId !== videoId) return;
      transcript = next;
      watchJob();
      resync = run !== null;
      tell();
    },
    running: () => run !== null,
    /** How it stands in full, this moment: the menu's Details. */
    detail(): TranscribeDetail {
      const silent = run?.silent.report() ?? null;
      return {
        loaded: transcript !== null && settings !== null,
        settling: Math.max(0, FOLLOW.settle - (performance.now() - changedAt) / 1000),
        stopped: autoBlocked,
        run: run && silent ? { scope: run.scope, from: run.from, silent, ahead: silent.at - viewerAt } : null,
        pieces: { ...pieces },
      };
    },
  };
}
