import {
  TRANSCRIBE_MODES,
  VideoId,
  modeOf,
  overDownloadLimit,
  type Stretch,
  type TranscribeEstimate,
  type TranscribeLanguage,
  type TranscribeMode,
  type Transcript,
  type Transcription,
  type WholeJob,
} from "@panki/contracts";
import { aboutWords, clock } from "@web/words";
import { askPiece, askPoll, askRedo, askRedoEnd, askTranscript, askWhole } from "../messages";
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
 * Whatever the mode, a download that fails leaves the chunks to carry on, or to start, from where the viewer is (`fallBack`).
 * - Live: chunks, as it was done until 2026-10-20. The silent player runs ahead of the viewer, as far as the lead
 *   allows, and waits for them there; where they jump, it follows; what's been transcribed already (by anyone) it skips.
 * - Hybrid: both at once. The chunks give words within seconds, the whole video downloads behind them, and when it's
 *   in its words replace the chunks' and the silent player stops.
 * (Auto, Hybrid within the length limit and Live past it, went 2026-10-20 at the owner's word.)
 *
 * A video over the length limit is transcribed whole only as Panki's settings say: by itself, after a question to the
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
  /**
   * A part transcribed again records on past its end until the next pause, where its last chunk closes, so it meets what
   * stands after it in a pause, as chunks meet (the owner, 2026-10-20: "wait until a pause… so it's smooth"; stopped at
   * its very end, the last chunk fell short by the sound still on its way to the cutter, and a gap showed on the bar).
   * Its start needs nothing: Panki widens a part to edges chunks were cut at, in pauses. This is the most it waits for
   * that pause past the end before stopping where it stands.
   */
  redoPast: 10,
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

/** The mode on this video, decided once its length is known: the mode, and whether the video is over the length limit. */
export type Decided = { mode: TranscribeMode; long: boolean; seconds: number };

/** A line of the Log: a mode named in it is said as the mode (drawn as its chip in the menu, by name on the console). */
export type LogPart = string | { mode: TranscribeMode };
export type LogEntry = { at: number; parts: readonly LogPart[] };

export type TranscribeState = {
  videoId: string | null;
  transcript: Transcript | null;
  settings: Transcription | null;
  /** The language the account's videos are told to the engine in: its own (`Settings.language`); null until Panki says. */
  language: TranscribeLanguage | null;
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
  /** The whole video couldn't be downloaded on this visit, and the chunks took over, whatever the mode. */
  fellBack: boolean;
  /** A part being transcribed again, in seconds: the transcript doesn't change until it's done, and nothing else starts meanwhile. */
  redoing: { from: number; to: number } | null;
  /**
   * The video is over the length limit and the mode picked is Full or Hybrid, with the
   * entire video waiting on the viewer: asked first, or not allowed, and neither answered nor asked for on this visit.
   * The strip's button carries a flag for it until the menu is opened (the owner, 2026-10-20).
   */
  limitPending: boolean;
  /** Every decision this page made, with its reason. */
  log: readonly LogEntry[];
};

type Run = {
  silent: SilentPlayer;
  /**
   * Where this run began, in the video. A run follows the viewer: held at the lead, following their jumps. (A run could
   * also be a stretch typed in the strip's menu, "Transcribe a part", from 2026-10-17 until the owner had it out on
   * 2026-10-20: "we will always just want to transcribe from here".)
   */
  from: number;
  /** Chunks go one after another, each waiting for the last to come back. */
  queue: Promise<void>;
  /** From when the time to its first words is counted, by `performance.now()`: the video's change for a run that started by itself, the press otherwise. */
  since: number;
  /** Its first chunk with sound has been sent (only that one says how long it took to get there). */
  sentSound: boolean;
  /** Whether the silent player was wanted playing at the last look, so a change of mind is written down once. */
  playing: boolean | null;
  /** The lead reached while a chunk was being recorded: it plays on until that chunk is cut (`cut`), then holds. Null under the lead. */
  wrap: { cut: boolean } | null;
  /** The part this run records again (`retranscribe`), end to end whatever the viewer does; null for a run that follows the viewer. */
  redo: RedoRun | null;
};
/** A part being transcribed again: its id, the video, the stretch it records, widened by Panki to whole pieces (seconds), and whether it's past its end, closing at the next pause. */
type RedoRun = { id: string; videoId: string; from: number; to: number; closing: boolean };

/** This video's chunks sent to the engine: how many came back, the one at the engine this moment (its stretch in ms), and the last one back (its stretch, and how long it took to record and then to transcribe, in ms). */
export type PieceTally = {
  back: number;
  atEngine: { startMs: number; endMs: number } | null;
  last: { startMs: number; endMs: number; recordMs: number; transcribeMs: number } | null;
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
  /** The run under way: its silent player as it says of itself, how far ahead of the viewer that is in seconds, and whether it's past the lead finishing its last chunk. */
  run: { silent: SilentReport; ahead: number; wrapping: boolean } | null;
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
  let language: TranscribeLanguage | null = null;
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
  let pieces: PieceTally = { back: 0, atEngine: null, last: null };
  /** Where the viewer was at the last look, in seconds. */
  let viewerAt = 0;
  /** Seconds this video has played on this visit, and when it was last looked at, by `performance.now()` (null before the first look): the entire video waits for `wholeAfter` of them. */
  let watched = 0;
  let lastLook: number | null = null;
  /** That the entire video is waiting for the viewer to watch a little has been written down, once a visit. */
  let saidWaiting = false;
  /** What the mode came to on this video, and whether it has been decided before on it (a later decision is a change of mode). */
  let decided: Decided | null = null;
  let decidedOnce = false;
  /** That there's nothing left to transcribe has been said since the mode was last decided: once each decision, so a mode changed on a video that's transcribed says why nothing happens (the owner, 2026-10-20). */
  let saidDone = false;
  /** The whole-video download, on this visit to the video: asked for here; the question waiting, answered yes, answered no; not allowed; what went wrong. */
  let wholeAsked = false;
  /** The ask for the download is on its way to Panki: it's as good as under way. */
  let wholeInFlight = false;
  let asking = false;
  let confirmed = false;
  let declined = false;
  let refused = false;
  let wholeFailed: string | null = null;
  /** The download failed and the chunks took over (`fallBack`); and whether the download was asked for by a press or by itself, which is how the chunks then start. */
  let fellBack = false;
  let wholeBy: "auto" | "press" = "auto";
  /** The download as it was last seen, so a change in it is acted on once. */
  let seenJob: { id: string; state: WholeJob["state"] } | null = null;
  /** When the transcript was last read again for the download, by `performance.now()`. */
  let lastPoll = 0;
  let log: readonly LogEntry[] = [];
  /** The part being transcribed again, if one is: from asking Panki for it until its words stand, or it's given up. */
  let redoing: RedoRun | null = null;

  const followers = new Set<() => void>();
  const snap = (): TranscribeState => ({
    videoId,
    transcript,
    settings,
    language,
    key,
    estimate,
    source,
    prefs,
    status,
    working,
    decided,
    asking,
    refused,
    fellBack,
    redoing: redoing ? { from: redoing.from, to: redoing.to } : null,
    limitPending: limitPending(),
    log,
  });
  function limitPending(): boolean {
    if (!decided || !settings || !decided.long || decided.mode === "live") return false;
    if (settings.overLimit === "allowed" || status.kind === "done") return false;
    return !wholeAsked && !confirmed && !declined && !fellBack;
  }
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
      if (!wholeAsked) note("entire video already transcribing · asked ",clock(Math.max(0, (Date.now() - now.askedAt) / 1000)), " ago");
      return;
    }
    if (before === null) return;
    if (now.state === "done") {
      const stopped = run !== null;
      if (run) end();
      // What it heard is the news; the "transcribed already" that the next look would say after it is not (`saidDone`).
      saidDone = true;
      note("entire video done · ",`${(now.words ?? 0).toLocaleString("en")} words · replaced ${now.replaced ?? 0} chunks`, stopped ? " · chunk player stopped" : "");
      return;
    }
    wholeFailed = now.message ?? "The entire video couldn't be transcribed.";
    note("entire video failed · ", wholeFailed);
    fallBack();
  }

  /** What the mode comes to on this video now: what was decided, or the chunks alone once the download failed. */
  const wayNow = (): TranscribeMode | null => (decided === null ? null : fellBack ? "live" : decided.mode);

  /**
   * The whole video couldn't be downloaded: transcribing goes on in chunks from where the viewer is, whatever the mode
   * (the owner, 2026-10-20, after YouTube began refusing ElevenLabs' downloads: "it should fall back to transcribing by
   * chunks when it fails"). Under Hybrid the chunks are running already and carry on; under Full they start,
   * at once when the download was asked for by a press, as anything starts by itself otherwise (`maybeStart`). The
   * download is asked for again on the next visit to the video.
   */
  function fallBack() {
    if (fellBack || decided === null) return;
    fellBack = true;
    if (run) {
      note("chunks carry on · the entire video is asked for again on the next visit");
      return;
    }
    note("falling back to ", { mode: "live" }, " · chunks from where you are");
    if (wholeBy === "press" && videoId !== null) {
      const at = startAt(viewerAt - FOLLOW.back, decided.seconds);
      if (at !== null) begin(videoId, at, "press");
      return;
    }
    tell();
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
    language = answer.language;
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
    const long = overDownloadLimit(settings, seconds);
    decided = { mode, long, seconds };
    saidDone = false;
    // The length limit is said where it decides something: as the entire video is asked for (`whole`).
    note(decidedOnce ? "mode now " : `opened · ${clock(seconds)} · `, { mode });
    decidedOnce = true;
    tell();
  }

  /**
   * Whether this visit should have the entire video transcribed by itself: the mode's way includes it, none is under
   * way, and some of the video isn't transcribed (`maybeWhole`). An earlier one's words standing don't stop it: they
   * cover the whole video, so nothing would be left; and coverage of chunks once kept it from ever being asked again
   * (2026-10-20: the entire video forgotten, chunks since, Hybrid never asked; "we expect Hybrid to do the full anyway").
   */
  function wantsWhole(): boolean {
    const way = wayNow();
    if (way === null || way === "live") return false;
    return job()?.state !== "running";
  }

  /**
   * The entire video, for a way that includes it: asked for once a visit by itself, as the length limit allows (Warn
   * first asks), whether or not chunks are running, so a mode changed to Hybrid mid-video asks too. Never while a part is
   * transcribed again, and never once all of the video is transcribed.
   */
  function maybeWhole(id: string, duration: number | null) {
    if (redoing || !settings || !transcript || !key || duration === null || !decided) return;
    if (!engineWanted(source)) return;
    const auto = prefs.trigger === "auto" && !autoBlocked;
    if (!auto || wholeAsked || declined || !wantsWhole()) return;
    if (nextUncovered(transcript, 0, duration) === null) return;
    // A video opened and left at once costs nothing: by itself, only once it has been watched a little (Panki's `wholeAfter`).
    if (watched < settings.wholeAfter) {
      if (!saidWaiting) {
        saidWaiting = true;
        note(`entire video waits · until ${settings.wholeAfter} s of it are watched`);
      }
      return;
    }
    whole(id, duration, "auto");
  }

  /** The whole video downloaded, as the download limit allows: at once, after the viewer's yes (Warn first), or not at all. `by`: asked for by a press, or by itself. */
  function whole(id: string, seconds: number, by: "auto" | "press") {
    if (!settings) return;
    wholeBy = by;
    const limit = `the ${settings.downloadLimit}-minute length limit`;
    if (overDownloadLimit(settings, seconds) && !confirmed) {
      if (settings.overLimit === "notAllowed") {
        if (!refused) {
          refused = true;
          note("entire video not transcribed · ", clock(seconds), ` is over ${limit}, and that's not allowed`);
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
    const measured = estimate && estimate.secondsPerMinute !== null ? ` (${estimate.secondsPerMinute.toFixed(1)} s/min, ${estimate.jobs} ${estimate.jobs === 1 ? "entire video" : "entire videos"} in 30 days)` : "";
    note("entire video asked · ", takes === null ? "no data yet on how long it takes" : `about ${aboutWords(takes).slice(1)}${measured}`);
    const mine = turn;
    wholeInFlight = true;
    const answer = await askWhole(id, seconds * 1000);
    if (mine !== turn) return;
    wholeInFlight = false;
    if (!answer.ok) {
      wholeFailed = answer.message;
      note("entire video not asked · ", answer.message);
      if (answer.signedOut) setStatus({ kind: "signedOut" });
      else if (answer.status === 409) {
        key = false;
        setStatus({ kind: "noKey" });
      } else if (answer.status === 403) tell();
      // Panki's settings said no (403) is a choice, not a failure; anything else, the chunks take over.
      else fallBack();
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

  /** `cutAt`: when the chunk was cut, by `performance.now()`: from then until it's back (a wait behind the one before it included) is its transcribing. */
  async function send(mine: Run, id: string, piece: CutPiece, tally: PieceTally, cutAt: number) {
    const sentAt = performance.now();
    // A run's first chunk with sound says how long after the run began it went, so Panki can tell how soon the first words come.
    const since = piece.wav && !mine.sentSound ? Math.max(0, Math.round(sentAt - mine.since)) : undefined;
    if (piece.wav) mine.sentSound = true;
    // A chunk with sound is what the engine is working on until it's back; one of quiet only marks the stretch covered.
    const stretch = piece.wav ? { startMs: piece.startMs, endMs: piece.endMs } : null;
    if (stretch) tally.atEngine = stretch;
    const asked = askPiece({
      videoId: id,
      pieceId: uuid(),
      startMs: piece.startMs,
      soundMs: piece.soundMs,
      endMs: piece.endMs,
      base64: piece.wav ? base64Of(piece.wav) : null,
      ...(since === undefined ? {} : { since }),
      ...(mine.redo ? { redo: mine.redo.id } : {}),
    });
    const answer = await asked.finally(() => {
      if (stretch && tally.atEngine === stretch) tally.atEngine = null;
    });
    // A chunk is one with sound, sent to the engine; a stretch of quiet only marks what's covered, and isn't counted.
    if (answer.ok && piece.wav) {
      tally.back++;
      tally.last = { startMs: piece.startMs, endMs: piece.endMs, recordMs: piece.recordMs, transcribeMs: performance.now() - cutAt };
    }
    // The video moved on under it: the answer is about the last one.
    if (id !== videoId) return;
    if (!answer.ok) {
      if (run === mine) end();
      if (mine.redo && redoing === mine.redo) giveUpRedo("a chunk failed");
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
      const heard = answer.engineMs === null ? " · the entire video has it already" : ` · ${words} words · ${(answer.engineMs / 1000).toFixed(1)} s at the engine`;
      note(`chunk ${tally.back} back · `, clock(piece.soundMs / 1000), "–", clock(piece.endMs / 1000), heard);
    }
    accept(answer.transcript);
  }

  /** A run from `at`: following the viewer, or recording a part again end to end (`redo`). */
  function begin(id: string, at: number, by: "auto" | "press", redo: RedoRun | null = null) {
    if (!settings) return;
    const shape = settings;
    // A new run starts from what's uncovered as it stands: a change to the transcript before it is no news to it.
    resync = false;
    // A run that starts by itself as the video opens counts its first words from the video's change, as the viewer waits
    // for them; one started later, or by a press, from now.
    const opening = by === "auto" && performance.now() - changedAt < (FOLLOW.settle + 2) * 1000;
    const mine: Run = {
      from: at,
      queue: Promise.resolve(),
      since: opening ? changedAt : performance.now(),
      sentSound: false,
      playing: null,
      wrap: null,
      redo,
      silent: createSilentPlayer(
        id,
        settings.speed,
        shape,
        (piece) => {
          if (mine.wrap && piece.wav) mine.wrap.cut = true;
          const tally = pieces;
          const cutAt = performance.now();
          mine.queue = mine.queue.then(() => send(mine, id, piece, tally, cutAt)).catch(() => undefined);
        },
        {
          stray: (to, back) => note("YouTube moved the chunk player to ", clock(to), " · put back at ", clock(back)),
          reopened: (at, seconds) => note("chunk player stuck loading at ", clock(at), ` for ${Math.round(seconds)} s · opened it again there`),
        },
      ),
    };
    run = mine;
    mine.silent.go(at);
    const what = redo ? `chunks of ${clock(redo.from)}–${clock(redo.to)} started` : `chunks started at ${clock(at)}`;
    note(`${what} · first chunk ${shape.firstChunk} s`, by === "press" && !redo ? " · Transcribe pressed" : "");
    // Loading until its silent player is up: then the run itself says how it stands (`steer`).
    setStatus({ kind: "loading", run: true });
  }

  /** Where a run from `from` would begin: the first moment from there that isn't transcribed yet; null when all of it is. */
  const startAt = (from: number, duration: number | null) => nextUncovered(transcript, Math.max(0, from), duration);

  function maybeStart(id: string, t: number, duration: number | null) {
    // A part being transcribed again: nothing else starts until its words stand, or it's given up.
    if (redoing || !settings || !transcript) return;
    // The engine isn't the pick (the site's captions, or nothing, is): nothing to say, nothing to do.
    if (!engineWanted(source)) {
      setStatus({ kind: "off" });
      return;
    }
    if (!key) {
      setStatus({ kind: "noKey" });
      return;
    }
    // The video's length decides whether it's over the length limit: loading until the player says it.
    if (duration === null || !decided) {
      setStatus({ kind: "loading", run: false });
      return;
    }
    const at = startAt(t - FOLLOW.back, duration);
    if (at === null) {
      if (!saidDone) {
        saidDone = true;
        const all = nextUncovered(transcript, 0, duration) === null;
        note(all ? "the entire video is transcribed already · nothing to do" : `everything from ${clock(t)} on is transcribed already · nothing to do`);
      }
      setStatus({ kind: "done" });
      return;
    }
    const auto = prefs.trigger === "auto" && !autoBlocked;
    // (The entire video, for a way that includes it, is asked for by `maybeWhole`, every look, run or no run.)
    if (wayNow() === "full") {
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
    begin(id, at, "auto");
  }

  /** A part being transcribed again, given up: its run stops, Panki is told, and the transcript stays as it was. */
  function giveUpRedo(why: string) {
    const redo = redoing;
    if (!redo) return;
    redoing = null;
    if (run?.redo === redo) end();
    note(`re-transcribing ${clock(redo.from)}–${clock(redo.to)} given up · ${why} · the transcript stays as it was`);
    void askRedoEnd(redo.videoId, redo.id, false);
    tell();
  }

  /** A part transcribed again, recorded to its end: once every chunk of it is back, Panki stands its words in place of what was there, at once. */
  async function finishRedo(mine: Run, redo: RedoRun) {
    if (run !== mine) return;
    // Taken down, the silent player cuts what it was recording, the last chunk on the queue.
    end();
    note("chunk player stopped · the part is recorded");
    await mine.queue;
    if (redoing !== redo) return;
    const answer = await askRedoEnd(redo.videoId, redo.id, true);
    if (redoing !== redo) return;
    redoing = null;
    if (!answer.ok) {
      note(`re-transcribing ${clock(redo.from)}–${clock(redo.to)} not kept · `, answer.message);
      setStatus({ kind: "failed", message: answer.message });
      return;
    }
    note(`re-transcribed ${clock(redo.from)}–${clock(redo.to)} · its words stand now`);
    if (redo.videoId === videoId) {
      transcript = answer.transcript;
      watchJob();
    }
    // What happens next is the next look's to say (`maybeStart`), as after any run.
    setStatus({ kind: "off" });
    tell();
  }

  /** A part being transcribed again: recorded end to end whatever the viewer does, always in chunks whatever the mode, with no lead and nothing skipped; then finished (`finishRedo`). */
  function steerRedo(mine: Run, redo: RedoRun, duration: number | null) {
    if (!settings) return;
    if (!engineWanted(source)) {
      giveUpRedo("subtitles no longer from the engine");
      setStatus({ kind: "off" });
      return;
    }
    const r = mine.silent.report();
    if (r.failed !== null) {
      giveUpRedo(r.failed);
      autoBlocked = true;
      setStatus({ kind: "failed", message: r.failed });
      return;
    }
    if (r.blocked) {
      setStatus({ kind: "blocked" });
      return;
    }
    const length = duration ?? r.duration;
    const to = length === null ? redo.to : Math.min(redo.to, length - FOLLOW.endSlack);
    // Done at the pause past its end, at the video's end, or, with nobody pausing, `redoPast` on.
    if (r.ended || (redo.closing && r.closed) || r.at >= to + FOLLOW.redoPast) {
      void finishRedo(mine, redo);
      return;
    }
    if (!r.ready) return;
    // Past its end by what the cutter has heard, not by the player, whose sound reaches the cutter a moment later: a
    // pause just before the end mustn't be the one it closes at.
    if (!redo.closing && (r.recording?.to ?? r.at) >= to) {
      redo.closing = true;
      mine.silent.closeAtPause();
      note(`past ${clock(redo.to)} · the last chunk closes at the next pause`);
    }
    setWorking(r.at - mine.from > 0.5 ? { startMs: Math.round(mine.from * 1000), endMs: Math.round(r.at * 1000) } : null);
    if (!r.playing) mine.silent.resume();
    setStatus({ kind: "running", to: r.at });
  }

  function steer(mine: Run, t: number, paused: boolean, duration: number | null) {
    if (!settings) return;
    if (mine.redo) {
      steerRedo(mine, mine.redo, duration);
      return;
    }
    // The pick left the engine (the line's picker): the run stops here, pressed or not.
    if (!engineWanted(source)) {
      end();
      note("chunk player stopped · subtitles no longer from the engine");
      setStatus({ kind: "off" });
      return;
    }
    // The mode changed to one with no chunks: the run stops.
    if (wayNow() === "full") {
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
    /** The run over: covered from the viewer to the video's end. */
    const over = (why: string) => {
      end();
      saidDone = true;
      note("chunk player stopped · ", why);
      setStatus({ kind: "done" });
    };
    if (r.ended || (length !== null && r.at >= length - FOLLOW.endSlack)) {
      over("reached the end of the video");
      return;
    }
    if (!r.ready) return;
    // The transcript changed under the run (a stretch forgotten, 2026-10-17: the owner forgot everything mid-video and
    // the run went on ahead while the part they were at stayed bare): what's uncovered behind the silent player, from
    // the viewer on, is gone back for.
    if (resync) {
      resync = false;
      const at = startAt(t - FOLLOW.back, length);
      if (at !== null && at < r.at - FOLLOW.jump) {
        mine.from = at;
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
    if (t > r.at + FOLLOW.jump || t < mine.from - FOLLOW.jump) {
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
    // Over something transcribed already, lying ahead: skipped to its end, or over when that reaches the video's.
    const covered = coveredUntil(transcript, r.at + FOLLOW.skipAhead);
    if (r.playing && covered !== null && covered > r.at + FOLLOW.skipAhead) {
      if (length !== null && covered >= length - FOLLOW.endSlack) over("the rest is transcribed already");
      else {
        note("skipped ", clock(r.at), "–", clock(covered), " · transcribed already");
        mine.silent.go(covered, false);
      }
      return;
    }
    setWorking(heardBy(mine, r.at));
    const lead = settings.lead * 60;
    const ahead = r.at - t;
    const stoppedWithViewer = paused && prefs.paused === "stop";
    // Under the lead it plays (once held, from when the viewer has come `slack` closer). At the lead no new chunk is
    // begun, but the one being recorded is finished and sent first, so everything up to where it holds is transcribed:
    // the lead is words ahead of the viewer, never sound held back unsent (the owner, 2026-10-20). A pause with "While
    // paused" on stop holds at once.
    const under = ahead < lead - (r.playing ? 0 : FOLLOW.slack);
    if (under || stoppedWithViewer || !r.playing) mine.wrap = null;
    else if (mine.wrap === null) {
      mine.wrap = { cut: false };
      if (r.pending) note("reached the lead at ", clock(r.at), " · finishing the chunk under way");
    }
    const wantPlaying = !stoppedWithViewer && (under || (mine.wrap !== null && !mine.wrap.cut && r.pending));
    if (wantPlaying && !r.playing) mine.silent.resume();
    else if (!wantPlaying && r.playing) mine.silent.hold();
    if (mine.playing !== null && mine.playing !== wantPlaying) {
      if (wantPlaying) note("going on from ", clock(r.at), ` · ${clock(Math.max(0, ahead))} ahead of you`);
      else {
        const why = stoppedWithViewer ? "you paused" : ahead > lead ? `${clock(ahead)} ahead of you, ${clock(ahead - lead)} past the lead` : `${clock(ahead)} ahead of you, the lead`;
        note("standing by at ", clock(r.at), " · ", why);
      }
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
      giveUpRedo("another video");
      turn++;
      end();
      videoId = next;
      transcript = null;
      autoBlocked = false;
      changedAt = performance.now();
      pieces = { back: 0, atEngine: null, last: null };
      decided = null;
      decidedOnce = false;
      saidDone = false;
      wholeAsked = false;
      wholeInFlight = false;
      watched = 0;
      lastLook = null;
      saidWaiting = false;
      asking = false;
      confirmed = false;
      declined = false;
      refused = false;
      wholeFailed = null;
      fellBack = false;
      wholeBy = "auto";
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
      // Time it plays counts as watched; a look long after the last (the tab asleep) counts a second at most.
      const lookAt = performance.now();
      if (lastLook !== null && !paused) watched += Math.min(1, (lookAt - lastLook) / 1000);
      lastLook = lookAt;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      if (!decided && settings && transcript && duration !== null) decide(duration);
      poll(id);
      maybeWhole(id, duration);
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
    /**
     * Transcribe pressed, the menu's one way to start (the owner, 2026-10-20: one button a mode): what the mode does,
     * the language never asked. Live, chunks from where the viewer is; Full, the entire video; Hybrid, both. Under Full
     * and Hybrid alike the entire video is asked for again even over words an earlier one left: a press is for it, and over the length limit it's the same question either way
     * (the owner, the same day: "we expect Hybrid to do the full anyway, the chunks thing is just for speed"). A run the
     * browser blocked is tried again.
     */
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
      const way = wayNow();
      if (duration !== null && !wholeInFlight && !downloading() && (way === "full" || way === "hybrid")) whole(id, duration, "press");
      if (wayNow() === "full") {
        tell();
        return;
      }
      const at = startAt(video.currentTime - FOLLOW.back, duration);
      if (at === null) {
        setStatus({ kind: "done" });
        return;
      }
      begin(id, at, "press");
    },
    /**
     * "Re-transcribe a part" (the owner, 2026-10-20, in place of forgetting one): the part recorded again in chunks
     * whatever the mode, widened by Panki to whole pieces, the transcript left as it is until all of it is in, and then
     * its words standing in place of what was there, at once. A run under way stops for it, and nothing else starts until
     * it's done or given up (Stop, another video, a failure).
     */
    async retranscribe(from: number, to: number) {
      const id = videoId;
      if (!id || !settings) return;
      giveUpRedo("another part asked for");
      if (run) {
        end();
        note("chunk player stopped · a part is to be transcribed again");
      }
      const redo: RedoRun = { id: uuid(), videoId: id, from, to, closing: false };
      redoing = redo;
      autoBlocked = false;
      setStatus({ kind: "loading", run: true });
      const answer = await askRedo(id, { id: redo.id, startMs: Math.round(from * 1000), endMs: Math.round(to * 1000) });
      if (redoing !== redo) return;
      if (!answer.ok) {
        redoing = null;
        note("re-transcribing not started · ", answer.message);
        setStatus(answer.signedOut ? { kind: "signedOut" } : { kind: "failed", message: answer.message });
        return;
      }
      redo.from = answer.redo.startMs / 1000;
      redo.to = answer.redo.endMs / 1000;
      const widened = redo.from < from - 0.5 || redo.to > to + 0.5 ? ` (asked ${clock(from)}–${clock(to)}, widened to whole chunks)` : "";
      note(`re-transcribing ${clock(redo.from)}–${clock(redo.to)}${widened} · the transcript stays as it is until it's done`);
      begin(id, redo.from, "press", redo);
    },
    /** The question before transcribing a long video whole answered: transcribe it, or don't (Hybrid's chunks go on either way). */
    answer(yes: boolean, duration: number | null) {
      const id = videoId;
      if (!id || !asking) return;
      asking = false;
      if (yes && duration !== null) {
        confirmed = true;
        wholeBy = "press";
        note("answered · transcribe the entire video");
        void askForWhole(id, duration);
        return;
      }
      declined = true;
      note("answered · cancel · the entire video isn't transcribed");
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
        fellBack = false;
      }
      if (triggerChanged) note(prefs.trigger === "auto" ? "auto transcribe on" : "auto transcribe off · nothing starts by itself");
      tell();
    },
    /** Stop pressed: the chunks stop, and nothing more of this video starts by itself until Transcribe is pressed, or another video plays. A whole-video download under way can't be stopped (it's paid for as it starts) and comes in all the same. */
    stop() {
      giveUpRedo("stopped by you");
      end();
      autoBlocked = true;
      asking = false;
      note("stopped by you · nothing more starts by itself on this video", downloading() ? " · the entire video still comes in" : "");
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
        run: run && silent ? { silent, ahead: silent.at - viewerAt, wrapping: run.wrap !== null && !run.wrap.cut } : null,
        pieces: { ...pieces },
      };
    },
  };
}
