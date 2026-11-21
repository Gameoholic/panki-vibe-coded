/** @panki The strip's menu, everything about transcribing this video (`TranscribeMenu`, `statusWords`, `startWords`, `Seconds`). Never a second menu on the strip. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AiSpark } from "@web/components/AiWaiting";
import { ENGINES, FIND_VIDEO_END, RULE_ACTIONS, TRANSCRIBE_LANGUAGES, TRANSCRIBE_MODES, soundCostMicros, type WholeJob } from "@panki/contracts";
import { Ask } from "@web/components/Ask";
import { Button } from "@web/components/Button";
import { Fold } from "@web/components/Fold";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import { MODE_ICONS, ModeChip } from "@web/components/ModeChip";
import { ScrollEdges } from "@web/components/ScrollEdges";
import { TextField } from "@web/components/TextField";
import { useDismiss } from "@web/hooks/useDismiss";
import { aboutWords, clock, durationLeftWords, durationWords, estimateWords, hmsWords, percentOf, tenthsWords, tookWords } from "@web/words";
import { parseStamp } from "../capture/words";
import { engineWanted, SUBTITLE_SOURCES } from "../subtitles";
import type { SilentPage, SilentReport, SilentStage } from "../transcribe/silent";
import { logText, timeOfDay, wholeSeconds, type LogPart, type TranscribeDetail, type TranscribeState, type TranscribeStatus } from "../transcribe/transcriber";

/**
 * The strip's menu: everything about transcribing this video, in one place at the right of the head. How much of the
 * video is transcribed and how it stands, with Details (how it stands in full, to debug by) and Log (every decision
 * this page made, with its reason) folded under it; then what to do, the two ways as actions of their own: Start
 * transcribing (Live) or Stop transcribing while it runs, and Transcribe the entire video in the background (Full), greyed with why where it's on its way,
 * under way or done; a part transcribed again (its two times typed), or the whole transcript forgotten, which asks in
 * place. The automations aren't here: they're Panki's Settings → Automations alone. The panel stands
 * under its button, closes on a press outside or Escape, and is this file's alone; what each item does is the strip's
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
  /** Find where the video ends (`FindEndItem`), after Proofread's two. */
  end: ReactNode;
  part: { disabled: boolean; why: string | null; widen: (stretch: Seconds) => Seconds | null; costOf: (stretch: Seconds) => string | null; onRun: (stretch: Seconds) => void };
};

type Props = {
  state: TranscribeState;
  /** The video's length and where the viewer is, in seconds; null when the player doesn't say. */
  duration: number | null;
  at: number | null;
  /** Start transcribing: Live, chunks from where the viewer is. */
  onStart: () => void;
  onStop: () => void;
  /** Transcribe the entire video: Full, in the background on Panki. */
  onOrder: () => void;
  /** A part of the video transcribed again, the transcript left as it is until all of it is in. */
  onRetranscribe: (stretch: Seconds) => void;
  /** The stretch a part typed will really come to, said before it's asked for. */
  widen: (stretch: Seconds) => Promise<Seconds | null>;
  /** The whole transcript forgotten, for everyone. */
  onForget: () => void;
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
/** What the item that starts Live says: Start transcribing, chunks following the viewer wherever they go (never "from here"); or to start over what stopped it. */
export function startWords(status: TranscribeStatus): string {
  return status.kind === "blocked" || status.kind === "failed" ? "Try again" : TRANSCRIBE_MODES.live.name;
}

/**
 * Why a row of the menu is greyed, said at its right, every row's, the Panki AI part's too (`transcribe/proofreader.ts`
 * reads them from here): one form, lower case but for a name (Panki, Panki AI, a provider), what's true now, and
 * something under way "… is being …". One cause greying two rows reads the same on both.
 */
export const WHY = {
  /** The entire video asked for, or being transcribed in the background: Transcribe the entire video in the background, Edit the transcript. */
  wholeGoing: "the entire video is being transcribed in the background",
  /** The player doesn't say how long the video is yet. */
  noLength: "the video's length isn't known yet",
  /** Panki AI's rows. */
  signedOut: "not signed in to Panki",
  aiUnread: "Panki AI's settings couldn't be read",
  aiOff: "Panki AI is off",
  noKey: (provider: string) => `no key for ${provider}`,
  editingOff: "editing Panki subtitles is off",
  nothingYet: "nothing is transcribed yet",
  unfinished: "the transcript isn't finished yet",
  proofreading: "the transcript is being proofread",
  findingEnd: "the Video end is being found",
} as const;

/** Why Transcribe the entire video can't be pressed, said beside it: under way, or done; null when it can. */
function orderWhy(state: TranscribeState, duration: number | null): string | null {
  if (state.ordering || state.transcript?.job?.state === "running") return WHY.wholeGoing;
  // Done: greyed with nothing beside it, the transcript itself says so.
  if (state.transcript?.job?.state === "done") return "";
  if (duration === null) return WHY.noLength;
  return null;
}
/** What the whole video costs at the engine's listed price (never measured), said beside Transcribe the entire video. */
function orderCost(state: TranscribeState, duration: number | null): string | null {
  if (!state.settings || duration === null) return null;
  return estimateWords(soundCostMicros(ENGINES[state.settings.engine].centsPerHour, duration * 1000));
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
 * The button's word and look: a run begun whose silent player isn't up yet says so. How it's being transcribed (the
 * entire video downloading, chunks, or both) is never on the button, only that it is; the menu and its Details say
 * how, and how long a download has left.
 */
function chipOf(state: TranscribeState): { words: string; look: Look } {
  const { status } = state;
  if (status.kind === "loading" && status.run) return { words: "Preparing", look: "loading" };
  return LOOKS[status.kind];
}

/**
 * The entire video being transcribed by the engine (downloaded and transcribed at once, on its side), with about how
 * long it has left as measured so far, in brackets: "transcribing the entire video in the background (~40 s left)", and
 * once it's taking longer than that, the seconds over, counting: "(-3 s)".
 */
function entireWords(state: TranscribeState, words = "transcribing the entire video in the background"): string {
  const job = downloadOf(state);
  const left = job ? wholeLeft(state, job, Date.now()) : null;
  if (left === null) return words;
  const over = Math.max(0, -left);
  return `${words} (${left > 0 ? `${aboutWords(left)} left` : `${over >= 1 ? "-" : ""}${durationWords(over, "seconds")}`})`;
}
/**
 * The status line beside the dot, with the entire video's background transcription added where chunks are running
 * too: "Transcribing · until 0:39 · entire video in the background (~8 s left)". Where the entire video is all
 * that's going, the line is that alone, with its time left. Null while there's nothing to say.
 */
function statusLine(state: TranscribeState): { words: string; live: boolean } | null {
  const status = statusWords(state.status);
  if (!downloadOf(state)) return status;
  if (state.status.kind === "whole" || !status) return { words: entireWords(state, "Transcribing the entire video in the background"), live: true };
  return { words: `${status.words} · ${entireWords(state, "entire video in the background")}`, live: status.live };
}
/** How often the status line's time left is said afresh while the menu is open, in ms. */
const LEFT_MS = 1000;

/** How often the Details are read afresh while they're open, in ms. */
const DETAIL_MS = 500;

const PAGE_WORDS: Record<SilentPage, string> = { embed: "Embed page", watch: "Watch page" };

/** What the silent player is doing, as the Details say it. */
const STAGE_WORDS: Record<SilentStage, (r: SilentReport) => string> = {
  opening: (r) => `Opening the video in the background (${PAGE_WORDS[r.page].toLowerCase()}) · ${durationWords(r.pageAge, "seconds")}`,
  finding: (r) => `Waiting for the background player to appear · ${durationWords(r.pageAge, "seconds")}`,
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
      if (state.length === null) return "Waiting for the video's length";
      if (state.ways.live.ruling) return "Checking the Start transcribing automation's limits";
      return detail.settling > 0 ? `Starting in ${durationLeftWords(detail.settling, "seconds")}, once the page has settled` : "Starting";
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
      if (detail.stopped) return "Stopped on this video";
      if (!state.ways.live.rule?.on) return `The ${RULE_ACTIONS.transcribe.name} automation is off`;
      // Panki stopped the automation on this video: its words ("Longer than 30 min").
      if (state.ways.live.ruled && !state.ways.live.ruled.go) return state.ways.live.ruled.why ?? `The ${RULE_ACTIONS.transcribe.name} automation is off`;
      return "Not started";
  }
}

/** A stretch of the video, as the Details say it: "3:12–3:40". */
const stretchWords = (from: number, to: number) => `${clock(from)}–${clock(to)}`;
/** Milliseconds as the Details say a time taken: "4.1 s". */
const secondsWords = tenthsWords;

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

  const { settings } = state;
  const run = now.run;
  const silent = run?.silent ?? null;
  const rows: [string, ReactNode][] = [["Status", nowWords(state, now)]];
  if (settings) rows.push(["Engine", `${ENGINES[settings.engine].name}${state.language ? ` · ${TRANSCRIBE_LANGUAGES[state.language]}` : ""}`]);
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
        <>
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
          <ScrollEdges of={listRef} />
        </>
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
  const share = all ? 100 : Math.min(99, percentOf(seconds, duration));
  return (
    <>
      {hmsWords(seconds)} transcribed <span className={`strip-menu-share ${all ? "is-all" : ""}`.trim()}>({share}%)</span>
    </>
  );
}

/** Which question is open under the items, if any. */
type Asking = "redo" | "proofread" | "forgetAll" | null;
/** Which of the two folds under the status is open, if either. */
type Unfolded = "details" | "log" | null;

export function TranscribeMenu({ state, duration, at, onStart, onStop, onOrder, onRetranscribe, widen, onForget, detail, ai, editing }: Props) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  /** Forget the transcript…, which its question hangs from. */
  const forgetAt = useRef<HTMLButtonElement>(null);
  /** Whether Details or Log is unfolded: kept while the menu is closed, so it's there at the next look. */
  const [unfolded, setUnfolded] = useState<Unfolded>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, open, () => setOpen(false));
  // Closed, it forgets what it was asking.
  useEffect(() => {
    if (!open) setAsking(null);
  }, [open]);
  // While the entire video is being transcribed in the background, its time left counts down on the status line.
  const [, tick] = useState(0);
  const inBackground = downloadOf(state) !== null;
  useEffect(() => {
    if (!open || !inBackground) return;
    const timer = setInterval(() => tick((n) => n + 1), LEFT_MS);
    return () => clearInterval(timer);
  }, [open, inBackground]);
  const status = statusLine(state);
  const chip = chipOf(state);
  const transcribing = state.status.kind === "running" || state.status.kind === "held" || (state.status.kind === "loading" && state.status.run);
  const canStart = state.key && state.status.kind !== "noKey" && state.status.kind !== "signedOut";
  const hasAny = (state.transcript?.covered.length ?? 0) > 0;
  const whyNotOrder = orderWhy(state, duration);
  const ask = (which: Asking) => setAsking(asking === which ? null : which);
  const unfold = (which: Unfolded) => setUnfolded(unfolded === which ? null : which);
  const done = (what: () => void) => {
    what();
    setOpen(false);
  };
  // Chunks can start while the whole video is under way too: both at once, its words replacing theirs when it's in.
  const showStart = canStart && !transcribing && state.status.kind !== "done";

  return (
    <div ref={rootRef} className="strip-menu-wrap">
      <Button
        className={`capture-tool strip-menu-button is-${chip.look}`}
        aria-expanded={open}
        aria-controls="panki-transcribe-menu"
        aria-label={`Transcription: ${chip.words}`}
        onClick={() => setOpen((was) => !was)}
      >
        <i className="strip-menu-dot" aria-hidden="true" />
        {chip.words}
        <Icon name="down" />
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
          {/* The whole video failed on this visit: chunks running carry on; none start for it. */}
          {state.fellBack ? (
            <p className="strip-menu-notice">
              <ModeChip mode="full" /> failed{transcribing ? " · the chunks carry on" : null}
            </p>
          ) : null}
          {/* Two parts, each named: the transcript, then Panki AI. The automations are Panki's Settings → Automations alone. */}
          {transcribing || showStart || hasAny ? (
            <div className="strip-menu-items">
              <p className="strip-menu-label">Transcript</p>
              {transcribing ? (
                <Button variant="item" onClick={() => done(onStop)}>
                  <Icon name="stop" />
                  Stop transcribing
                </Button>
              ) : showStart ? (
                <Button variant="item" onClick={() => done(onStart)}>
                  <Icon name={MODE_ICONS.live} />
                  {startWords(state.status)}
                </Button>
              ) : null}
              {/* The whole video, chunks running or not: what it costs at the engine's listed price, or why it can't be ordered. */}
              {canStart && state.status.kind !== "done" ? (
                <Button variant="item" disabled={whyNotOrder !== null} onClick={() => done(onOrder)}>
                  <Icon name={MODE_ICONS.full} />
                  {TRANSCRIBE_MODES.full.name}
                  {(whyNotOrder ?? orderCost(state, duration)) ? <span className="strip-menu-why">{whyNotOrder ?? orderCost(state, duration)}</span> : null}
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
                <Button ref={forgetAt} variant="item" className="is-danger" aria-pressed={asking === "forgetAll"} aria-expanded={asking === "forgetAll"} onClick={() => ask("forgetAll")}>
                  <Icon name="trash" />
                  Forget the transcript…
                </Button>
              ) : null}
              {asking === "forgetAll" ? (
                <Ask
                  idPrefix="panki-transcript-forget"
                  anchor={forgetAt}
                  question={MESSAGES.forgetAll}
                  go={{ words: "Forget", busy: "Forgetting…" }}
                  busy={false}
                  failure={null}
                  onKeep={() => setAsking(null)}
                  onGo={() => done(onForget)}
                />
              ) : null}
            </div>
          ) : null}
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
              {ai.end}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Find where the video ends as the menu lists it (`content/youtube.tsx` runs it): the spark, its name, and beside it
 * where the Video end is, its cost, or why it can't go. The menu stays open as it runs: its call comes up in the head.
 */
export function FindEndItem({ disabled, why, onPress }: { disabled: boolean; why: string | null; onPress: () => void }) {
  return (
    <Button variant="item" disabled={disabled} onClick={onPress}>
      <AiSpark />
      {FIND_VIDEO_END}
      {why ? <span className="strip-menu-why">{why}</span> : null}
    </Button>
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
