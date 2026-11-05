import { useEffect, useRef, useState, type ReactNode } from "react";
import { AiSpark } from "@web/components/AiWaiting";
import { ENGINES, TRANSCRIBE_LANGUAGES, TRANSCRIBE_MODES, TRANSCRIBE_MODE_IDS, modeOf, modesOn, soundCostMicros, type TranscribeMode, type WholeJob } from "@panki/contracts";
import { Ask } from "@web/components/Ask";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Fold } from "@web/components/Fold";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import { MODE_ICONS, ModeChip } from "@web/components/ModeChip";
import { TextField } from "@web/components/TextField";
import { Toggle } from "@web/components/Toggle";
import { useDismiss } from "@web/hooks/useDismiss";
import { aboutWords, clock, estimateWords, hmsWords, tookWords } from "@web/words";
import { parseStamp } from "../capture/words";
import { engineWanted, SUBTITLE_SOURCES } from "../subtitles";
import type { SilentPage, SilentReport, SilentStage } from "../transcribe/silent";
import { logText, timeOfDay, wholeSeconds, type LogPart, type TranscribeDetail, type TranscribeState, type TranscribeStatus } from "../transcribe/transcriber";

/**
 * The strip's menu: everything about transcribing this video, in one place at the right of the head. How much of the
 * video is transcribed and how it stands, with Details (how it stands in full, to debug by) and Log (every decision
 * this page made, with its reason) folded under it; the question before downloading a long video whole (Warn first),
 * or what was done about the download limit instead; then what to do: start, one item whatever the mode, saying what
 * it does there, or stop (the entire video and a part of it as items of their own would go against what Live and Full
 * are); the Mode this viewer transcribes in and Auto transcribe, whether it starts by itself (both this viewer's own);
 * and a part transcribed again (its two times typed), or the whole transcript forgotten, which asks in place. The panel stands under its
 * button, closes on a press outside or Escape, and is this file's alone; what each item does is the strip's
 * (`content/youtube.tsx`).
 */

/** A stretch of the video, in seconds. */
export type Seconds = { start: number; end: number };

/**
 * Panki AI's part of the menu: its head once it has run, and the
 * question before a run over the account's Ask before a run is over (`head`); Proofread the entire video (`whole`, its
 * own button, in its `TemplateMenu` once the account has two templates); and Proofread a part, typed as Re-transcribe's
 * From and To, widened to whole lines. The strip runs it all; the menu only lays it out.
 */
export type AiPart = {
  head: ReactNode;
  /** The head is there (a run has been made): it is the part's heading, its name at the left, and the label gives way, so Panki AI isn't named twice. */
  headed: boolean;
  whole: ReactNode;
  part: { disabled: boolean; why: string | null; widen: (stretch: Seconds) => Seconds | null; costOf: (stretch: Seconds) => string | null; onRun: (stretch: Seconds) => void };
};

type Props = {
  state: TranscribeState;
  /** The video's length and where the viewer is, in seconds; null when the player doesn't say. */
  duration: number | null;
  at: number | null;
  onStart: () => void;
  onStop: () => void;
  /** A part of the video transcribed again, the transcript left as it is until all of it is in. */
  onRetranscribe: (stretch: Seconds) => void;
  /** The stretch a part typed will really come to, said before it's asked for. */
  widen: (stretch: Seconds) => Promise<Seconds | null>;
  /** The whole transcript forgotten, for everyone. */
  onForget: () => void;
  /** Whether transcribing is to start by itself on every video played: this viewer's own. */
  onAuto: (on: boolean) => void;
  /** The mode this viewer transcribes in, picked here: this viewer's own. */
  onMode: (mode: TranscribeMode) => void;
  /** The question before transcribing a long video whole, answered: transcribe it, or don't. */
  onAnswer: (yes: boolean) => void;
  /** How it stands in full, this moment (`Transcriber.detail`), asked for while Details are open. */
  detail: () => TranscribeDetail;
  /** Panki AI's part (AI step 6, Proofread): drawn by the strip, which runs it; none where the transcript isn't Panki's. */
  ai: AiPart | null;
  /** Edit the transcript (AI step 6): the rows under the player open for editing until Done; none where they can't be. */
  editing: { on: boolean; disabled: boolean; why: string | null; onToggle: () => void } | null;
  // Whether a video is noted toward the watch time is Panki's own on / off switch, not a row here.
};

/** A part to transcribe again starts as this much of the video from where the viewer is. Seconds. */
const PART_SECONDS = 300;

/** What the menu says when something's wrong. One home. */
const MESSAGES = {
  notATime: "Type a time like 12:34.",
  endsFirst: "The end comes before the start.",
  pastEnd: "That's past the end of the video.",
  forgetAll: "Forget the entire transcription of this video? This cannot be undone.",
};

/** How long the whole video has left to download, in seconds, as measured so far: below 0 once it's taking longer than that; null when nothing's measured. */
function wholeLeft(state: TranscribeState, job: WholeJob, now: number): number | null {
  const takes = wholeSeconds(state.estimate, job.lengthMs);
  return takes === null ? null : takes - (now - job.askedAt) / 1000;
}
/** The download under way, if one is. */
const downloadOf = (state: TranscribeState): WholeJob | null => (state.transcript?.job?.state === "running" ? state.transcript.job : null);

/** What the strip says of transcribing, beside the name and in the menu; nothing while there's nothing to say. */
export function statusWords(status: TranscribeStatus): { words: string; live: boolean } | null {
  switch (status.kind) {
    case "loading":
      // A run begun, its silent player not up yet: "Preparing".
      return { words: status.run ? "Preparing…" : "Loading…", live: true };
    case "running":
      return { words: `Transcribing · until ${clock(status.to)}`, live: true };
    case "held":
      return { words: `Transcribed until ${clock(status.to)}`, live: false };
    case "whole":
      return { words: "Transcribing the entire video in the background", live: true };
    case "done":
      return { words: "Transcribed", live: false };
    case "noKey":
      return { words: "No key to transcribe with", live: false };
    case "blocked":
      return { words: "The browser stopped the hidden player", live: false };
    case "failed":
      return { words: status.message, live: false };
    default:
      return null;
  }
}
/** What the one item that starts it says: Transcribe, chunks following the viewer wherever they go (never "from here"); the entire video under Full; or to start over what stopped it. */
export function startWords(status: TranscribeStatus, way: TranscribeMode | null): string {
  if (status.kind === "blocked" || status.kind === "failed") return "Try again";
  return way === "full" ? "Transcribe the entire video" : "Transcribe";
}

/**
 * The button is the status (transcribing, standing by at the lead, off…): a word, and a look that lightly tints it and
 * colours its small dot. Going, in the accent with the dot breathing; ready (standing by at the lead, or the
 * whole video done) in the good colour; trouble in the danger colour; nothing going, plain.
 */
type Look = "loading" | "going" | "ready" | "quiet" | "trouble";
const LOOKS: Record<TranscribeStatus["kind"], { words: string; look: Look }> = {
  // The first moments of a video, before it can be said how it stands: plain, the dot breathing.
  loading: { words: "Loading", look: "loading" },
  running: { words: "Transcribing", look: "going" },
  held: { words: "Standing by", look: "ready" },
  whole: { words: "Transcribing", look: "going" },
  done: { words: "Transcribed", look: "ready" },
  off: { words: "Not transcribing", look: "quiet" },
  noKey: { words: "No key", look: "trouble" },
  blocked: { words: "Blocked", look: "trouble" },
  failed: { words: "Failed", look: "trouble" },
  signedOut: { words: "Signed out", look: "trouble" },
};
/**
 * The button's word and look: a run begun whose silent player isn't up yet says so; a video not downloaded for being
 * over the download limit says that. How it's being transcribed (the entire video downloading, chunks, or both) is
 * never on the button, only that it is; the menu and its Details say how, and how long a download has left.
 */
function chipOf(state: TranscribeState): { words: string; look: Look } {
  const { status } = state;
  if (status.kind === "loading" && status.run) return { words: "Preparing", look: "loading" };
  if (status.kind === "off" && state.refused) return { words: "Not transcribing · over the limit", look: "quiet" };
  return LOOKS[status.kind];
}

/**
 * The entire video being transcribed by the engine (downloaded and transcribed at once, on its side), with about how
 * long it has left as measured so far, in brackets: "transcribing the entire video in the background (~40 s left)", and
 * once it's taking longer than that, the seconds over, counting: "(-3 s)".
 */
function entireWords(state: TranscribeState): string {
  const words = "transcribing the entire video in the background";
  const job = downloadOf(state);
  const left = job ? wholeLeft(state, job, Date.now()) : null;
  if (left === null) return words;
  const over = Math.floor(-left);
  return `${words} (${left > 0 ? `${aboutWords(left)} left` : over === 0 ? "0 s" : `-${over} s`})`;
}

/** How often the Details are read afresh while they're open, in ms. */
const DETAIL_MS = 500;

const PAGE_WORDS: Record<SilentPage, string> = { embed: "Embed page", watch: "Watch page" };

/** What the silent player is doing, as the Details say it. */
const STAGE_WORDS: Record<SilentStage, (r: SilentReport) => string> = {
  opening: (r) => `Opening the video in the background (${PAGE_WORDS[r.page].toLowerCase()}) · ${Math.floor(r.pageAge)} s`,
  finding: (r) => `Waiting for the background player to appear · ${Math.floor(r.pageAge)} s`,
  seeking: (r) => `Going to ${clock(r.at)}`,
  starting: () => "Starting the background player",
  listening: (r) => `Waiting for the first sound at ${clock(r.at)}`,
  buffering: (r) => `Loading the video at ${clock(r.at)}`,
  // What it's recording, from where the chunk began (`nowWords`); this only before there's anything of it.
  playing: (r) => `Recording at ${clock(r.at)}`,
  held: (r) => `Stopped at ${clock(r.at)}`,
  ad: () => "Waiting for an ad to finish",
  ended: () => "Reached the end of the video",
  failed: (r) => r.failed ?? "The background player failed",
};

/**
 * What's happening this moment, in one line: with chunks, what the hidden player is doing (recording, or held, loading
 * and the rest) and what's at the engine, "Recording from 3:12 to 3:40, transcribing from 3:00 to 3:12", each half
 * left out when it isn't happening. The line outside Details keeps "Transcribing · until 3:40".
 */
function nowWords(state: TranscribeState, detail: TranscribeDetail): string {
  const { status, settings } = state;
  const atEngine = detail.pieces.atEngine;
  const engineStretch = atEngine ? `from ${clock(atEngine.startMs / 1000)} to ${clock(atEngine.endMs / 1000)}` : null;
  if (detail.run) {
    const r = detail.run.silent;
    const doing = r.stage === "playing" && r.recording ? `Recording from ${clock(r.recording.from)} to ${clock(r.recording.to)}` : STAGE_WORDS[r.stage](r);
    const also = [engineStretch ? `transcribing ${engineStretch}` : null, downloadOf(state) ? entireWords(state) : null].filter((w) => w !== null);
    return [doing, ...also].join(", ");
  }
  // The run is over, its last chunk still at the engine.
  if (engineStretch) return `Transcribing ${engineStretch}`;
  // A part transcribed again, every chunk back: Panki is standing its words in place of what was there.
  if (state.redoing) return "Putting the new words in place";
  switch (status.kind) {
    case "loading":
      if (!detail.loaded) return "Asking Panki for this video's transcript";
      if (state.decided === null) return "Waiting for the video's length";
      return detail.settling > 0 ? `Starting in ${Math.ceil(detail.settling)} s, once the page has settled` : "Starting";
    case "whole": {
      const words = entireWords(state);
      return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
    }
    case "done": {
      // Done by the whole video: how long that took, in place of the row it had.
      const job = state.transcript?.job;
      return job?.state === "done" && job.endedAt !== null ? `Video transcribed in ${tookWords((job.endedAt - job.askedAt) / 1000)}` : "Everything is transcribed";
    }
    case "noKey":
      return settings ? `No key for ${ENGINES[settings.engine].name}` : "No key";
    case "signedOut":
      return "Signed out of Panki";
    case "failed":
      return status.message;
    default:
      if (settings && !engineWanted(state.source)) return `Subtitles are set to ${SUBTITLE_SOURCES[state.source].name}`;
      if (state.asking) return "Waiting for your answer";
      if (detail.stopped) return "Stopped on this video";
      if (state.prefs.trigger !== "auto") return "Auto transcribe is off";
      return "Not started";
  }
}

/** A stretch of the video, as the Details say it: "3:12–3:40". */
const stretchWords = (from: number, to: number) => `${clock(from)}–${clock(to)}`;
/** Milliseconds as the Details say a time taken: "4.1 s". */
const secondsWords = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** A Log line with each mode drawn as its chip. */
function LogLine({ parts }: { parts: readonly LogPart[] }) {
  return (
    <>
      {parts.map((part, i) => (typeof part === "string" ? <span key={i}>{part}</span> : <ModeChip key={i} mode={part.mode} />))}
    </>
  );
}

/** How transcribing stands in full, as rows of a name and what it is; read afresh while `live`. */
function Details({ state, detail, live }: { state: TranscribeState; detail: () => TranscribeDetail; live: boolean }) {
  const [now, setNow] = useState(detail);
  useEffect(() => {
    if (!live) return;
    setNow(detail());
    const timer = setInterval(() => setNow(detail()), DETAIL_MS);
    return () => clearInterval(timer);
  }, [live, detail]);

  const { settings, decided } = state;
  const run = now.run;
  const silent = run?.silent ?? null;
  const rows: [string, ReactNode][] = [["Status", nowWords(state, now)]];
  if (decided && settings) {
    rows.push([
      "Mode",
      <>
        <ModeChip mode={decided.mode} />
        {state.fellBack ? (
          <>
            {" · entire video failed, falling back to "}
            <ModeChip mode="live" />
          </>
        ) : null}
        {` · ${ENGINES[settings.engine].name}${state.language ? ` · ${TRANSCRIBE_LANGUAGES[state.language]}` : ""}`}
      </>,
    ]);
  }
  // A part transcribed again: what stands there doesn't change until all of it is in.
  if (state.redoing) rows.push(["Re-transcribing", `${stretchWords(state.redoing.from, state.redoing.to)} · the transcript changes once it's done`]);
  if (run && settings && !state.redoing) {
    const lead = settings.lead * 60;
    const over = run.ahead - lead;
    // Past the lead only to finish the chunk being recorded, which is the last before it holds.
    const past = run.wrapping ? ` · reached, finishing the final chunk (${clock(over)} over)` : over >= 1 ? ` · reached (${clock(over)} over)` : "";
    rows.push(["Lead", run.ahead >= 0 ? `${clock(run.ahead)} ahead of you, max ${clock(lead)}${past}` : `${clock(-run.ahead)} behind you`]);
  }
  // Where the ramp stands: the length a pause may close the chunk being recorded at (Target chunk length), and the
  // longest it can be, cut where it stands once nobody has paused for the wait past it.
  if (silent?.chunk != null && settings) {
    const target = Math.round(silent.chunk);
    rows.push(["Target chunk length", `${target} s (${target + settings.pauseWait} s max)`]);
  }
  if (run || now.pieces.back > 0) rows.push(["Chunks completed", now.pieces.back.toLocaleString("en")]);
  const last = now.pieces.last;
  if (last) {
    const took = `${secondsWords(last.recordMs + last.transcribeMs)} (${secondsWords(last.recordMs)} recording, ${secondsWords(last.transcribeMs)} transcribing)`;
    rows.push(["Last chunk", `${stretchWords(last.startMs / 1000, last.endMs / 1000)} · took ${took}`]);
  }
  return (
    <dl id="panki-transcribe-details" className="strip-menu-details">
      {rows.map(([name, words]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{words}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Every decision this page made, oldest first, the latest kept in view; Copy puts them all on the clipboard as text. */
function Log({ state }: { state: TranscribeState }) {
  const listRef = useRef<HTMLOListElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const entries = state.log;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries.length]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(entries.map((entry) => `${timeOfDay(entry.at)} ${logText(entry.parts)}`).join("\n"));
      setCopied("Copied");
    } catch {
      setCopied("Couldn't copy");
    }
    setTimeout(() => setCopied(null), 1500);
  }
  return (
    <div id="panki-transcribe-log" className="strip-menu-log">
      {entries.length === 0 ? (
        <p className="strip-menu-log-empty">Nothing yet.</p>
      ) : (
        <ol ref={listRef}>
          {entries.map((entry, i) => (
            <li key={`${entry.at}-${i}`}>
              <time>{timeOfDay(entry.at)}</time>
              <span>
                <LogLine parts={entry.parts} />
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="strip-menu-log-foot">
        {copied ? <span role="status">{copied}</span> : null}
        <Button className="strip-menu-more" disabled={entries.length === 0} onClick={() => void copy()}>
          <Icon name="copy" />
          Copy
        </Button>
      </div>
    </div>
  );
}

/**
 * How much of the video is transcribed, and what share of it, green once it's all: "6m15s transcribed (35%)"; or that
 * nothing is yet. The share is rounded down, so 100% is only ever all of it.
 */
function Covered({ state, duration }: { state: TranscribeState; duration: number | null }) {
  const ms = state.transcript?.covered.reduce((sum, stretch) => sum + (stretch.endMs - stretch.startMs), 0) ?? 0;
  if (ms <= 0) return <>Nothing transcribed yet</>;
  const seconds = duration === null ? ms / 1000 : Math.min(ms / 1000, duration);
  if (duration === null || duration <= 0) return <>{hmsWords(seconds)} transcribed</>;
  const all = state.status.kind === "done" || seconds >= duration;
  const share = all ? 100 : Math.min(99, Math.floor((seconds / duration) * 100));
  return (
    <>
      {hmsWords(seconds)} transcribed <span className={`strip-menu-share ${all ? "is-all" : ""}`.trim()}>({share}%)</span>
    </>
  );
}

/** What transcribing the entire video would come to, at the engine's listed prices (never measured): its credits, and dollars. */
function costWords(state: TranscribeState, seconds: number): string {
  if (!state.settings) return "";
  const engine = ENGINES[state.settings.engine];
  const minutes = seconds / 60;
  return `${Math.round(engine.creditsPerMinute * minutes).toLocaleString("en")} credits · ${estimateWords(soundCostMicros(engine.centsPerHour, seconds * 1000))}`;
}

/** Which question is open under the items, if any. */
type Asking = "redo" | "proofread" | "forgetAll" | null;
/** Which of the two folds under the status is open, if either. */
type Unfolded = "details" | "log" | null;

export function TranscribeMenu({ state, duration, at, onStart, onStop, onRetranscribe, widen, onForget, onAuto, onMode, onAnswer, detail, ai, editing }: Props) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  /** Whether Details or Log is unfolded: kept while the menu is closed, so it's there at the next look. */
  const [unfolded, setUnfolded] = useState<Unfolded>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));
  // Closed, it forgets what it was asking.
  useEffect(() => {
    if (!open) setAsking(null);
  }, [open]);
  // A video over the length limit flags the button until the menu is opened on it while it's so (the question waiting
  // in it, or the limit said): the menu never opens by itself for it, the flag says it instead.
  const [seenOn, setSeenOn] = useState<string | null>(null);
  useEffect(() => {
    if (open && state.limitPending && state.videoId) setSeenOn(state.videoId);
  }, [open, state.limitPending, state.videoId]);
  const flagged = state.limitPending && seenOn !== state.videoId;

  const { settings, decided } = state;
  const status = statusWords(state.status);
  const chip = chipOf(state);
  const transcribing = state.status.kind === "running" || state.status.kind === "held" || (state.status.kind === "loading" && state.status.run);
  const canStart = state.key && state.status.kind !== "noKey" && state.status.kind !== "signedOut";
  const hasAny = (state.transcript?.covered.length ?? 0) > 0;
  const on = settings ? modesOn(settings) : [];
  const mode = settings ? modeOf(settings, state.prefs.mode) : null;
  const long = decided?.long ?? (settings !== null && duration !== null && duration > settings.downloadLimit * 60);
  const notAllowed = settings !== null && long && settings.overLimit === "notAllowed";
  const limitWords = settings ? `Over the ${settings.downloadLimit}-minute length limit` : "";
  const ask = (which: Asking) => setAsking(asking === which ? null : which);
  const unfold = (which: Unfolded) => setUnfolded(unfolded === which ? null : which);
  const done = (what: () => void) => {
    what();
    setOpen(false);
  };
  // What the start item does is what the mode comes to here (once a download failed, the chunks are what's left); under
  // Full, over the download limit where that's not allowed, it can't be done.
  const way = state.fellBack ? "live" : (decided?.mode ?? null);
  const refusedHere = way === "full" && notAllowed;
  const showStart = canStart && !transcribing && state.status.kind !== "done" && state.status.kind !== "whole";

  return (
    <div ref={rootRef} className="strip-menu-wrap">
      <Button
        className={`capture-tool strip-menu-button is-${chip.look}${flagged ? " is-flagged" : ""}`}
        aria-expanded={open}
        aria-controls="panki-transcribe-menu"
        aria-label={`Transcription: ${chip.words}${flagged ? `, ${limitWords.toLowerCase()}` : ""}`}
        onClick={() => setOpen((was) => !was)}
      >
        <i className="strip-menu-dot" aria-hidden="true" />
        {chip.words}
        <Icon name="down" />
        {flagged ? (
          <span className="strip-menu-badge" aria-hidden="true">
            !
          </span>
        ) : null}
      </Button>
      {open ? (
        <div id="panki-transcribe-menu" className="strip-menu" role="dialog" aria-label="Transcription">
          <p className="strip-menu-covered">
            <Covered state={state} duration={duration} />
          </p>
          <div className="strip-menu-state">
            <div className="strip-menu-state-row">
              <p className="strip-menu-status" role="status">
                {status?.live ? <i className="live-dot" aria-hidden="true" /> : null}
                {status ? status.words : chip.words}
              </p>
              <span className="strip-menu-folds">
                <Button className={`strip-menu-more${unfolded === "details" ? " is-open" : ""}`} aria-expanded={unfolded === "details"} aria-controls="panki-transcribe-details" onClick={() => unfold("details")}>
                  Details
                  <Icon name="down" />
                </Button>
                <Button className={`strip-menu-more${unfolded === "log" ? " is-open" : ""}`} aria-expanded={unfolded === "log"} aria-controls="panki-transcribe-log" onClick={() => unfold("log")}>
                  Log
                  <Icon name="down" />
                </Button>
              </span>
            </div>
            <Fold open={unfolded === "details"} arrives={false}>
              <Details state={state} detail={detail} live={open && unfolded === "details"} />
            </Fold>
            <Fold open={unfolded === "log"} arrives={false}>
              <Log state={state} />
            </Fold>
          </div>
          {state.asking && settings && duration !== null ? (
            <div className="strip-menu-question">
              <p>
                This video is {Math.round(duration / 60)} minutes. Transcribing all of it would cost about <b>{costWords(state, duration)}</b>.
              </p>
              <div className="strip-menu-question-actions">
                <Button variant="primary" onClick={() => done(() => onAnswer(true))}>
                  <Icon name="subtitles" />
                  Transcribe
                </Button>
                {/* No to the entire video: under Hybrid the chunks go on, which is what saying no comes to there, said so anyone
                    gets it ("Chunks only" wouldn't), with Live's own icon, since that's what's left. */}
                <Button variant="ghost" onClick={() => onAnswer(false)}>
                  {decided?.mode === "hybrid" ? <Icon name="lead" /> : null}
                  {decided?.mode === "hybrid" ? "Only what I watch" : "Cancel"}
                </Button>
              </div>
            </div>
          ) : null}
          {/* The download failed: the chunks carry on, or took over. */}
          {state.fellBack ? (
            <p className="strip-menu-notice">
              Entire video failed, falling back to <ModeChip mode="live" />
            </p>
          ) : null}
          {/* Over the length limit: it's not allowed, or (the button flagged it) Transcribe asks first. */}
          {decided && settings && decided.long && !state.asking && !state.fellBack && ((state.refused && decided.mode !== "live") || state.limitPending) ? (
            <p className="strip-menu-notice">
              {limitWords}
              {state.refused && decided.mode === "hybrid" ? (
                <>
                  {" · "}
                  <ModeChip mode="live" />
                </>
              ) : null}
            </p>
          ) : null}
          {/* Three parts, each named: Panki AI, the transcript, the settings. Step 7's rules (proofreading by itself, transcribing's own) land as rows under Settings, the parts above them unmoved. */}
          {ai && hasAny ? (
            <div className="strip-menu-items">
              {ai.headed ? null : (
                <p className="strip-menu-label">
                  <AiSpark />
                  Panki AI
                </p>
              )}
              {ai.head}
              {ai.whole}
              <Button variant="item" aria-pressed={asking === "proofread"} disabled={ai.part.disabled} onClick={() => ask("proofread")}>
                <AiSpark />
                Proofread a part…
                {ai.part.why ? <span className="strip-menu-why">{ai.part.why}</span> : null}
              </Button>
              {asking === "proofread" && !ai.part.disabled ? (
                <StretchForm
                  key="proofread"
                  id="panki-proofread"
                  at={at}
                  duration={duration}
                  action="Proofread"
                  lead={<AiSpark />}
                  widen={(stretch) => Promise.resolve(ai.part.widen(stretch))}
                  beside={(stretch) => (stretch ? ai.part.costOf(stretch) : null)}
                  onDone={(stretch) => {
                    // The menu stays open: the run's head comes up in it.
                    setAsking(null);
                    ai.part.onRun(ai.part.widen(stretch) ?? stretch);
                  }}
                />
              ) : null}
            </div>
          ) : null}
          {transcribing || showStart || hasAny ? (
            <div className="strip-menu-items">
              <p className="strip-menu-label">Transcript</p>
              {transcribing ? (
                <Button variant="item" onClick={() => done(onStop)}>
                  <Icon name="stop" />
                  Stop
                </Button>
              ) : showStart ? (
                // Over the limit, the menu stays open: the question the press asks comes up in it.
                <Button variant="item" disabled={refusedHere} onClick={() => (state.limitPending ? onStart() : done(onStart))}>
                  <Icon name="subtitles" />
                  {startWords(state.status, way)}
                  {refusedHere ? <span className="strip-menu-why">not allowed over the limit</span> : null}
                </Button>
              ) : null}
              {/* Editing by hand made plain, so it can be found: the rows open for editing until Done. */}
              {editing && hasAny ? (
                <Button variant="item" aria-pressed={editing.on} disabled={editing.disabled} onClick={() => done(editing.onToggle)}>
                  <Icon name={editing.on ? "check" : "edit"} />
                  {editing.on ? "Done editing" : "Edit the transcript"}
                  {editing.why ? <span className="strip-menu-why">{editing.why}</span> : null}
                </Button>
              ) : null}
              {/* A part is transcribed again, never forgotten on its own. */}
              {hasAny && canStart ? (
                <Button variant="item" aria-pressed={asking === "redo"} onClick={() => ask("redo")}>
                  <Icon name="again" />
                  Re-transcribe a part…
                </Button>
              ) : null}
              {asking === "redo" ? (
                <StretchForm key="redo" id="panki-redo" at={at} duration={duration} action="Re-transcribe" lead={<Icon name="again" />} widen={widen} onDone={(stretch) => done(() => onRetranscribe(stretch))} />
              ) : null}
              {hasAny ? (
                <Button variant="item" className="is-danger" aria-pressed={asking === "forgetAll"} onClick={() => ask("forgetAll")}>
                  <Icon name="trash" />
                  Forget the transcript…
                </Button>
              ) : null}
              {asking === "forgetAll" ? (
                <div className="strip-menu-ask">
                  <Ask
                    idPrefix="panki-transcript-forget"
                    question={MESSAGES.forgetAll}
                    go={{ words: "Forget", busy: "Forgetting…" }}
                    busy={false}
                    failure={null}
                    onKeep={() => setAsking(null)}
                    onGo={() => done(onForget)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="strip-menu-items">
            <p className="strip-menu-label">Settings</p>
            {settings && mode ? (
              <div className="strip-menu-row">
                <span>Mode</span>
                <Dropdown
                  id="panki-transcribe-mode"
                  label="Mode"
                  value={mode}
                  disabled={on.length < 2}
                  options={TRANSCRIBE_MODE_IDS.map((id) => ({
                    id,
                    label: TRANSCRIBE_MODES[id].name,
                    icon: MODE_ICONS[id],
                    disabled: !on.includes(id),
                    // Which one is everyone's default isn't said here.
                    ...(on.includes(id) ? {} : { note: "off" }),
                  }))}
                  onChange={onMode}
                />
              </div>
            ) : null}
            <div className="strip-menu-row">
              <span>Auto transcribe</span>
              <Toggle id="panki-transcribe-auto" says={{ on: "On", off: "Off" }} on={state.prefs.trigger === "auto"} onChange={onAuto} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type StretchProps = {
  id: string;
  at: number | null;
  duration: number | null;
  /** What the button says, before the stretch it will do. */
  action: string;
  /** The stretch the times typed will really come to (Panki widens a part to whole chunks, Proofread to whole lines), or null when it can't be said. */
  widen: (stretch: Seconds) => Promise<Seconds | null>;
  /** The button's icon, before its words. */
  lead: ReactNode;
  /** What's said under the button for the stretch it comes to (Proofread's "Up to"), or nothing. */
  beside?: (exact: Seconds | null) => string | null;
  onDone: (stretch: Seconds) => void;
};

/** How long the times typed are left still before what they come to is asked, in ms. */
const WIDEN_MS = 250;

/**
 * From and to, typed as times of the video ("12:34", as `parseStamp` reads them), starting from where the viewer is and
 * a few minutes on; the button says the stretch they really come to, asked a moment after they stop changing, so the
 * stretch done is said ahead of time.
 */
function StretchForm({ id, at, duration, action, widen, lead, beside, onDone }: StretchProps) {
  const here = Math.max(0, Math.floor(at ?? 0));
  const [from, setFrom] = useState(clock(here));
  const [to, setTo] = useState(clock(Math.floor(duration === null ? here + PART_SECONDS : Math.min(duration, here + PART_SECONDS))));
  const [errors, setErrors] = useState<{ from?: string; to?: string }>({});
  const [exact, setExact] = useState<Seconds | null>(null);
  // Read through a ref: the strip draws a new function each time it's drawn, many times a second.
  const widenRef = useRef(widen);
  widenRef.current = widen;
  useEffect(() => {
    const start = parseStamp(from);
    const typedEnd = parseStamp(to);
    if (start === null || typedEnd === null || typedEnd <= start) {
      setExact(null);
      return;
    }
    const end = duration === null ? typedEnd : Math.min(typedEnd, duration);
    let live = true;
    const timer = setTimeout(() => {
      void widenRef.current({ start, end }).then((stretch) => {
        if (live) setExact(stretch);
      });
    }, WIDEN_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [from, to, duration]);
  function submit() {
    const start = parseStamp(from);
    const end = parseStamp(to);
    const next: { from?: string; to?: string } = {};
    if (start === null) next.from = MESSAGES.notATime;
    if (end === null) next.to = MESSAGES.notATime;
    else if (start !== null && end <= start) next.to = MESSAGES.endsFirst;
    else if (duration !== null && end > duration + 1) next.to = MESSAGES.pastEnd;
    setErrors(next);
    if (start === null || end === null || next.from || next.to) return;
    onDone({ start, end: duration === null ? end : Math.min(end, duration) });
  }
  return (
    <Form onSubmit={submit} className="strip-menu-form">
      <TextField id={`${id}-from`} label="From" value={from} onChange={setFrom} error={errors.from ?? undefined} />
      <TextField id={`${id}-to`} label="To" value={to} onChange={setTo} error={errors.to ?? undefined} />
      <Button type="submit" variant="primary">
        {lead}
        {exact ? `${action} ${clock(exact.start)}–${clock(exact.end)}` : action}
      </Button>
      {beside?.(exact) ? <p className="strip-menu-form-note">{beside(exact)}</p> : null}
    </Form>
  );
}
