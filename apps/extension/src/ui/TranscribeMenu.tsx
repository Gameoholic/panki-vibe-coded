import { useEffect, useRef, useState, type ReactNode } from "react";
import { ENGINES, TRANSCRIBE_LANGUAGES, TRANSCRIBE_MODES, TRANSCRIBE_MODE_IDS, modeOf, modesOn, type TranscribeMode, type WholeJob } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import { MODE_ICONS, ModeChip } from "@web/components/ModeChip";
import { TextField } from "@web/components/TextField";
import { Toggle } from "@web/components/Toggle";
import { useDismiss } from "@web/hooks/useDismiss";
import { aboutWords, clock, dollarWords } from "@web/words";
import { parseStamp } from "../capture/words";
import { engineWanted, SUBTITLE_SOURCES } from "../subtitles";
import type { SilentPage, SilentReport, SilentStage } from "../transcribe/silent";
import { logText, timeOfDay, wholeSeconds, type LogPart, type RunScope, type TranscribeDetail, type TranscribeState, type TranscribeStatus } from "../transcribe/transcriber";
import { Fold } from "./Fold";

/**
 * The strip's menu: everything about transcribing this video, in one place at the right of the head (the owner,
 * 2026-10-17, of the two bare buttons that stood there: "a little better and more polished"). How much of the video
 * is transcribed and how it stands, with Details (how it stands in full, the owner, 2026-10-19: "so we can also debug
 * better") and Log (every decision this page made, with its reason: "the thought process and execution for this
 * particular session") folded under it; the question before downloading a long video whole (Warn first), or what was
 * done about the download limit instead; then what to do: start or stop, the whole video, a part of it typed as two
 * times; the Mode this viewer transcribes in and Auto transcribe, whether it starts by itself (both this viewer's own);
 * and forgetting a part or the whole transcript, to start from scratch, which asks in place. The panel stands under its
 * button, closes on a press outside or Escape, and is this file's alone; what each item does is the strip's
 * (`content/youtube.tsx`).
 */

/** A stretch of the video, in seconds. */
export type Seconds = { start: number; end: number };

type Props = {
  state: TranscribeState;
  /** The video's length and where the viewer is, in seconds; null when the player doesn't say. */
  duration: number | null;
  at: number | null;
  onStart: () => void;
  onStop: () => void;
  onWhole: () => void;
  onStretch: (stretch: Seconds) => void;
  onForget: (stretch: Seconds | null) => void;
  /** Whether transcribing is to start by itself on every video played: this viewer's own. */
  onAuto: (on: boolean) => void;
  /** The mode this viewer transcribes in, picked here: this viewer's own. */
  onMode: (mode: TranscribeMode) => void;
  /** The question before downloading a long video whole, answered: download it, or don't. (Switching to Auto is `onMode`.) */
  onAnswer: (yes: boolean) => void;
  /** How it stands in full, this moment (`Transcriber.detail`), asked for while Details are open. */
  detail: () => TranscribeDetail;
};

/** A part to transcribe or forget starts as this much of the video from where the viewer is. Seconds. */
const PART_SECONDS = 300;

/** What the menu says when something's wrong. One home. */
const MESSAGES = {
  notATime: "Type a time like 12:34.",
  endsFirst: "The end comes before the start.",
  pastEnd: "That's past the end of the video.",
  forgetAll: "Forget everything transcribed of this video? Everyone loses it, and transcribing it again costs.",
};

/** How long the whole video has left to download, in seconds, as measured so far; null when it's not known or overdue. */
function wholeLeft(state: TranscribeState, job: WholeJob, now: number): number | null {
  const takes = wholeSeconds(state.estimate, job.lengthMs);
  if (takes === null) return null;
  const left = takes - (now - job.askedAt) / 1000;
  return left > 0 ? left : null;
}
/** The download under way, if one is. */
const downloadOf = (state: TranscribeState): WholeJob | null => (state.transcript?.job?.state === "running" ? state.transcript.job : null);

/** What the strip says of transcribing, beside the name and in the menu; nothing while there's nothing to say. */
export function statusWords(status: TranscribeStatus): { words: string; live: boolean } | null {
  switch (status.kind) {
    case "loading":
      // A run begun, its silent player not up yet: "Preparing" (the owner's word, 2026-10-18).
      return { words: status.run ? "Preparing…" : "Loading…", live: true };
    case "running":
      return { words: `Transcribing · until ${clock(status.to)}`, live: true };
    case "held":
      return { words: `Transcribed until ${clock(status.to)}`, live: false };
    case "whole":
      return { words: "Downloading the whole video", live: true };
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
/** What the item that starts it says: the way to start (from here, for chunks alone), or to start over what stopped it. */
export function startWords(status: TranscribeStatus, chunksOnly: boolean): string {
  if (status.kind === "blocked" || status.kind === "failed") return "Try again";
  return chunksOnly ? "Transcribe from here" : "Transcribe";
}

/**
 * The button is the status (the owner, 2026-10-17: "whether it's transcribing, standing by on lead, turned off… the
 * button should lightly light in different colours based on status, maybe a small dot"): a word, and a look that
 * tints it and colours its dot. Going, in the accent with the dot breathing; ready (standing by at the lead, or the
 * whole video done) in the good colour; trouble in the danger colour; nothing going, plain.
 */
type Look = "loading" | "going" | "ready" | "quiet" | "trouble";
const LOOKS: Record<TranscribeStatus["kind"], { words: string; look: Look }> = {
  // The first moments of a video, before it can be said how it stands: plain, the dot breathing (the owner, 2026-10-18).
  loading: { words: "Loading", look: "loading" },
  running: { words: "Transcribing", look: "going" },
  held: { words: "Standing by", look: "ready" },
  whole: { words: "Whole video", look: "going" },
  done: { words: "Transcribed", look: "ready" },
  off: { words: "Not transcribing", look: "quiet" },
  noKey: { words: "No key", look: "trouble" },
  blocked: { words: "Blocked", look: "trouble" },
  failed: { words: "Failed", look: "trouble" },
  signedOut: { words: "Signed out", look: "trouble" },
};
/**
 * The button's word and look: a run begun whose silent player isn't up yet says so (the owner, 2026-10-19); the whole
 * video downloading says so, with about how long it has left ("Whole video · ~40 s" with no chunks, "Transcribing ·
 * whole video ~40 s" behind them); a video not downloaded for being over the download limit says that.
 */
function chipOf(state: TranscribeState, now: number): { words: string; look: Look } {
  const { status } = state;
  if (status.kind === "loading" && status.run) return { words: "Preparing", look: "loading" };
  const download = downloadOf(state);
  const left = download ? wholeLeft(state, download, now) : null;
  if (status.kind === "whole") return { words: left === null ? "Whole video" : `Whole video · ${aboutWords(left)}`, look: "going" };
  if (download && (status.kind === "running" || status.kind === "held")) {
    return { words: `${LOOKS[status.kind].words} · whole video${left === null ? "" : ` ${aboutWords(left)}`}`, look: LOOKS[status.kind].look };
  }
  if (status.kind === "off" && state.refused) return { words: "Not transcribing · over the limit", look: "quiet" };
  return LOOKS[status.kind];
}

/** A clock that ticks each second while `on`: the time left on a download counts down. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
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
  playing: (r) => `Listening at ${clock(r.at)}`,
  held: (r) => `Held at ${clock(r.at)}`,
  ad: () => "Waiting for an ad to finish",
  ended: () => "Reached the end of the video",
  failed: (r) => r.failed ?? "The background player failed",
};

/** What's happening this moment, in one line. */
function nowWords(state: TranscribeState, detail: TranscribeDetail): string {
  const { status, settings } = state;
  if (detail.run) return STAGE_WORDS[detail.run.silent.stage](detail.run.silent);
  switch (status.kind) {
    case "loading":
      if (!detail.loaded) return "Asking Panki for this video's transcript";
      if (state.decided === null) return "Waiting for the video's length";
      return detail.settling > 0 ? `Starting in ${Math.ceil(detail.settling)} s, once the page has settled` : "Starting";
    case "whole":
      return "Panki is downloading and transcribing the whole video";
    case "done":
      return "Everything is transcribed";
    case "noKey":
      return settings ? `No key for ${ENGINES[settings.engine].name}` : "No key";
    case "signedOut":
      return "Signed out of Panki";
    case "failed":
      return status.message;
    default:
      if (settings && !engineWanted(state.source, settings.engine)) return `Subtitles are set to ${SUBTITLE_SOURCES[state.source].name}`;
      if (state.asking) return "Waiting for your answer";
      if (detail.stopped) return "Stopped on this video";
      if (state.prefs.trigger !== "auto") return "Auto transcribe is off";
      return "Not started";
  }
}

/** What a run is for. */
function scopeWords(scope: RunScope, from: number): string {
  if (scope.follow) return `Following you, from ${clock(from)}`;
  return scope.until === null ? `The rest of the video, from ${clock(from)}` : `${clock(from)} to ${clock(scope.until)}`;
}

/** A short while, as the Details say it: "4 s", "3 min". */
const agoWords = (seconds: number) => (seconds < 60 ? `${Math.round(seconds)} s` : `${Math.floor(seconds / 60)} min`);

/** A Log line with each mode drawn as its chip. */
function LogLine({ parts }: { parts: readonly LogPart[] }) {
  return (
    <>
      {parts.map((part, i) => (typeof part === "string" ? <span key={i}>{part}</span> : <ModeChip key={i} mode={part.mode} />))}
    </>
  );
}

/** The video's whole-video download, as Details say it. */
function wholeWords(state: TranscribeState, job: WholeJob | null, now: number): string {
  if (!job) return "Not downloaded";
  const asked = `asked ${timeOfDay(job.askedAt)}`;
  if (job.state === "running") {
    const left = wholeLeft(state, job, now);
    return `${asked} · ${left === null ? (wholeSeconds(state.estimate, job.lengthMs) === null ? "no data yet on how long it takes" : "any moment now") : `about ${aboutWords(left).slice(1)} left`}`;
  }
  if (job.state === "failed") return `${asked} · failed: ${job.message ?? "no reason given"}`;
  return `${asked} · done ${timeOfDay(job.endedAt ?? job.askedAt)} · ${(job.words ?? 0).toLocaleString("en")} words · replaced ${job.replaced ?? 0} chunks`;
}

/** How transcribing stands in full, as rows of a name and what it is; read afresh while `live`. */
function Details({ state, detail, live }: { state: TranscribeState; detail: () => TranscribeDetail; live: boolean }) {
  const [now, setNow] = useState(detail);
  const clockNow = useNow(live);
  useEffect(() => {
    if (!live) return;
    setNow(detail());
    const timer = setInterval(() => setNow(detail()), DETAIL_MS);
    return () => clearInterval(timer);
  }, [live, detail]);

  const { settings, decided } = state;
  const run = now.run;
  const silent = run?.silent ?? null;
  const rows: [string, ReactNode][] = [["Now", nowWords(state, now)]];
  if (decided && settings) {
    rows.push([
      "Mode",
      <>
        <ModeChip mode={decided.mode} />
        {decided.mode === settings.mode ? ", the default" : ""}
        {decided.mode === "auto" ? (
          <>
            {" "}
            picks <ModeChip mode={decided.way} />
          </>
        ) : null}
        {` · ${decided.long ? "over" : "under"} the ${settings.downloadLimit}-minute download limit`}
      </>,
    ]);
    if (decided.way !== "live" || state.transcript?.job) rows.push(["Whole video", wholeWords(state, state.transcript?.job ?? null, clockNow)]);
  }
  if (run && silent) {
    rows.push(["Run", scopeWords(run.scope, run.from)]);
    const player = [PAGE_WORDS[silent.page]];
    if (silent.rate !== null) player.push(`${silent.rate}×`);
    player.push(silent.sound === null ? "No sound yet" : `Sound ${silent.sound}`);
    rows.push(["Background", player.join(" · ")]);
    if (run.scope.follow && settings) {
      const lead = clock(settings.lead * 60);
      rows.push(["Lead", run.ahead >= 0 ? `${clock(run.ahead)} ahead of you, of ${lead}` : `${clock(-run.ahead)} behind you`]);
    }
  }
  if (run || now.pieces.back > 0 || now.pieces.waiting > 0) {
    rows.push(["Chunks", `${now.pieces.back} back · ${now.pieces.waiting} on the way`]);
  }
  const last = now.pieces.last;
  if (last) {
    const ago = (performance.now() - last.at) / 1000;
    rows.push(["Last chunk", `${clock(last.startMs / 1000)}–${clock(last.endMs / 1000)} · took ${(last.tookMs / 1000).toFixed(1)} s · ${agoWords(ago)} ago`]);
  }
  if (settings) rows.push(["Engine", `${ENGINES[settings.engine].name} · ${TRANSCRIBE_LANGUAGES[settings.language]} · ${settings.speed}×`]);

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
          Copy
        </Button>
      </div>
    </div>
  );
}

/** How much of the video is transcribed: "6:15 of 17:25 transcribed", or that nothing is yet. */
function coveredWords(state: TranscribeState, duration: number | null): string {
  const ms = state.transcript?.covered.reduce((sum, stretch) => sum + (stretch.endMs - stretch.startMs), 0) ?? 0;
  if (ms <= 0) return "Nothing transcribed yet";
  const seconds = duration === null ? ms / 1000 : Math.min(ms / 1000, duration);
  return duration === null ? `${clock(seconds)} transcribed` : `${clock(seconds)} of ${clock(duration)} transcribed`;
}

/** What downloading the whole video would come to: the credits as measured so far, and dollars at the engine's listed rate. */
function costWords(state: TranscribeState, seconds: number): string {
  if (!state.settings) return "";
  const minutes = seconds / 60;
  const cents = Math.round((minutes / 60) * ENGINES[state.settings.engine].centsPerHour);
  const credits = state.estimate?.creditsPerMinute ?? null;
  return credits === null ? dollarWords(cents) : `${Math.round(credits * minutes).toLocaleString("en")} credits · ${dollarWords(cents)}`;
}

/** Which question is open under the items, if any. */
type Asking = "part" | "forgetPart" | "forgetAll" | null;
/** Which of the two folds under the status is open, if either. */
type Unfolded = "details" | "log" | null;

export function TranscribeMenu({ state, duration, at, onStart, onStop, onWhole, onStretch, onForget, onAuto, onMode, onAnswer, detail }: Props) {
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
  // The question before downloading a long video whole opens the menu by itself, once each time it's asked: it waits on an answer.
  useEffect(() => {
    if (state.asking) setOpen(true);
  }, [state.asking]);

  const { settings, decided } = state;
  const download = downloadOf(state);
  const now = useNow(download !== null);
  const status = statusWords(state.status);
  const chip = chipOf(state, now);
  const transcribing = state.status.kind === "running" || state.status.kind === "held" || (state.status.kind === "loading" && state.status.run);
  const canStart = state.key && state.status.kind !== "noKey" && state.status.kind !== "signedOut";
  const hasAny = (state.transcript?.covered.length ?? 0) > 0;
  const on = settings ? modesOn(settings) : [];
  const mode = settings ? modeOf(settings, state.prefs.mode) : null;
  const downloads = on.some((m) => m !== "live");
  const long = decided?.long ?? (settings !== null && duration !== null && duration > settings.downloadLimit * 60);
  const notAllowed = settings !== null && long && settings.overLimit === "notAllowed";
  const limitWords = settings ? `Over the ${settings.downloadLimit}-minute download limit` : "";
  const ask = (which: Asking) => setAsking(asking === which ? null : which);
  const unfold = (which: Unfolded) => setUnfolded(unfolded === which ? null : which);
  const done = (what: () => void) => {
    what();
    setOpen(false);
  };
  // What the start item does: under Full nothing of the chunks, so it's the whole video's to start.
  const chunksOnly = decided?.way === "live";

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
          <p className="strip-menu-covered">{coveredWords(state, duration)}</p>
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
                This video is {Math.round(duration / 60)} minutes. The whole of it would be about <b>{costWords(state, duration)}</b>.
              </p>
              <div className="strip-menu-question-actions">
                <Button variant="primary" onClick={() => done(() => onAnswer(true))}>
                  Transcribe
                </Button>
                {on.includes("auto") && mode !== "auto" ? (
                  <Button onClick={() => done(() => onMode("auto"))}>
                    Switch to <ModeChip mode="auto" />
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => onAnswer(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {/* Over the download limit, the whole video isn't downloaded: Auto went with Live, or it's not allowed. */}
          {decided && settings && decided.long && !state.asking && (decided.mode === "auto" || (state.refused && decided.way !== "live")) ? (
            <p className="strip-menu-notice">
              {limitWords}
              {decided.way === "full" ? null : (
                <>
                  {" · "}
                  <ModeChip mode="live" />
                </>
              )}
            </p>
          ) : null}
          {canStart || transcribing ? (
            <div className="strip-menu-items">
              {transcribing ? (
                <Button variant="item" onClick={() => done(onStop)}>
                  Stop
                </Button>
              ) : state.status.kind !== "done" && state.status.kind !== "whole" ? (
                <Button variant="item" onClick={() => done(onStart)}>
                  {startWords(state.status, chunksOnly)}
                </Button>
              ) : null}
              {canStart && downloads ? (
                <Button
                  variant="item"
                  disabled={state.status.kind === "done" || download !== null || notAllowed}
                  onClick={() => {
                    // Over the limit with Warn first, the question comes up here; otherwise it's under way.
                    if (long && settings?.overLimit === "warn") onWhole();
                    else done(onWhole);
                  }}
                >
                  Transcribe the whole video
                  {notAllowed ? <span className="strip-menu-why">not allowed over the limit</span> : null}
                </Button>
              ) : null}
              {canStart ? (
                <Button variant="item" aria-pressed={asking === "part"} onClick={() => ask("part")}>
                  Transcribe a part…
                </Button>
              ) : null}
            </div>
          ) : null}
          {asking === "part" ? <StretchForm key="part" id="panki-part" at={at} duration={duration} action="Transcribe" onDone={(stretch) => done(() => onStretch(stretch))} /> : null}
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
                  ...(id === settings.mode ? { note: "default" } : !on.includes(id) ? { note: "off" } : {}),
                }))}
                onChange={onMode}
              />
            </div>
          ) : null}
          <div className="strip-menu-row">
            <span>Auto transcribe</span>
            <Toggle id="panki-transcribe-auto" says={{ on: "On", off: "Off" }} on={state.prefs.trigger === "auto"} onChange={onAuto} />
          </div>
          {hasAny ? (
            <div className="strip-menu-items">
              <Button variant="item" aria-pressed={asking === "forgetPart"} onClick={() => ask("forgetPart")}>
                Forget a part…
              </Button>
              <Button variant="item" className="is-danger" aria-pressed={asking === "forgetAll"} onClick={() => ask("forgetAll")}>
                Forget the whole transcript…
              </Button>
            </div>
          ) : null}
          {asking === "forgetPart" ? <StretchForm key="forget" id="panki-forget" at={at} duration={duration} action="Forget" danger onDone={(stretch) => done(() => onForget(stretch))} /> : null}
          {asking === "forgetAll" ? (
            <div className="strip-menu-ask">
              <p>{MESSAGES.forgetAll}</p>
              <div className="strip-menu-actions">
                <Button onClick={() => setAsking(null)}>Keep</Button>
                <Button variant="danger" onClick={() => done(() => onForget(null))}>
                  Forget
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type StretchProps = {
  id: string;
  at: number | null;
  duration: number | null;
  /** What the button says: Transcribe, or Forget. */
  action: string;
  danger?: boolean;
  onDone: (stretch: Seconds) => void;
};

/** From and to, typed as times of the video ("12:34", as `parseStamp` reads them), starting from where the viewer is and a few minutes on. */
function StretchForm({ id, at, duration, action, danger = false, onDone }: StretchProps) {
  const here = Math.max(0, Math.floor(at ?? 0));
  const [from, setFrom] = useState(clock(here));
  const [to, setTo] = useState(clock(Math.floor(duration === null ? here + PART_SECONDS : Math.min(duration, here + PART_SECONDS))));
  const [errors, setErrors] = useState<{ from?: string; to?: string }>({});
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
      <Button type="submit" variant={danger ? "danger" : "primary"}>
        {action}
      </Button>
    </Form>
  );
}
