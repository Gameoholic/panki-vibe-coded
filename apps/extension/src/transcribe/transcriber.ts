import { VideoId, mayTranscribe, type Stretch, type Transcript, type Transcription } from "@panki/contracts";
import { askPiece, askTranscript } from "../messages";
import { DEFAULT_SOURCE, engineWanted, sourceOf, type SubtitleSource } from "../subtitles";
import { DEFAULT_PREFS, type TranscribePrefs } from "./prefs";
import { uuid } from "../uuid";
import { coveredUntil, nextUncovered } from "./lines";
import type { CutPiece } from "./pieces";
import { createSilentPlayer, type SilentPlayer } from "./silent";

/**
 * Transcribing a video, following the viewer: the silent player runs ahead of them, as far as the lead allows, and
 * waits for them there; where they jump, it follows; what's been transcribed already (by anyone) it skips. It starts
 * by itself the moment the video plays when the settings say so and the engine is the source picked (this browser's
 * pick, `subtitles.ts`; with the site's captions or None picked nothing is transcribed at all), or at a press on
 * Transcribe, which also overrides the language check: a run's pieces are sent with no language named until the engine
 * has heard Japanese once for sure; surely another language stops the run, which says so; a piece it can't make out
 * (a jingle, a silence) leaves the next to ask again. Every piece goes to Panki through the worker; the
 * transcript that comes back is what the line under the player reads. The settings that cost are everyone's (an admin
 * sets them in Panki); how it behaves for this viewer (`prefs.ts`) is this browser's own, set on the options page; both
 * are read with the transcript, so nothing here keeps a setting of its own.
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
   * responding"). A press on Transcribe doesn't wait.
   */
  settle: 4,
} as const;

export type TranscribeStatus =
  | { kind: "off" }
  | { kind: "running"; to: number }
  | { kind: "held"; to: number }
  | { kind: "done" }
  | { kind: "notJapanese" }
  | { kind: "noKey" }
  | { kind: "blocked" }
  | { kind: "signedOut" }
  | { kind: "failed"; message: string };

export type TranscribeState = {
  videoId: string | null;
  transcript: Transcript | null;
  settings: Transcription | null;
  /** Whether the chosen engine has a key to run with. */
  key: boolean;
  /** Where the words come from: this browser's pick. */
  source: SubtitleSource;
  /** How it behaves for this viewer: this browser's own (`prefs.ts`), set on the options page. */
  prefs: TranscribePrefs;
  status: TranscribeStatus;
  /** What the run has heard that isn't back from the engine yet: from the covered edge behind the silent player to where it stands, in ms; null with no run. It pulses on the seek bar. */
  working: Stretch | null;
};

type Run = {
  silent: SilentPlayer;
  /** Started by a press: the engine is told the language and never asked it. */
  forced: boolean;
  /** The language is settled for this run (told at a press, or heard surely once): the pieces from here are told it. Until then each asks. */
  settled: boolean;
  /** Where this run began, in the video. */
  from: number;
  /**
   * What the run is for: following the viewer (held at the lead, following their jumps), or a stretch of the video in
   * the background, to `until` (a moment, or null for the video's end) whatever the viewer does: "Transcribe the whole
   * video" and "Transcribe a part" in the strip's menu (the owner, 2026-10-17). One run at a time: a background run
   * takes the place of one under way, and the follower waits for it to finish before it starts by itself again.
   */
  scope: { follow: true } | { follow: false; until: number | null };
  /** Pieces go one after another, each waiting for the last to come back. */
  queue: Promise<void>;
};

/** A piece's sound as the text a message can carry. */
function base64Of(bytes: Uint8Array): string {
  let text = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) text += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(text);
}

const sameStatus = (a: TranscribeStatus, b: TranscribeStatus) =>
  a.kind === b.kind && ("to" in a && "to" in b ? Math.floor(a.to) === Math.floor(b.to) : true) && ("message" in a && "message" in b ? a.message === b.message : true);

export type Transcriber = ReturnType<typeof createTranscriber>;

export function createTranscriber() {
  let videoId: string | null = null;
  let transcript: Transcript | null = null;
  let settings: Transcription | null = null;
  let key = false;
  let source: SubtitleSource = DEFAULT_SOURCE;
  let prefs: TranscribePrefs = DEFAULT_PREFS;
  let status: TranscribeStatus = { kind: "off" };
  let working: Stretch | null = null;
  let run: Run | null = null;
  /** Nothing starts by itself on this video any more: Stop was pressed, or the video isn't Japanese, or something failed. */
  let autoBlocked = false;
  /** The transcript changed under the run (a stretch forgotten): at the next look the run goes back for what's uncovered behind it. */
  let resync = false;
  /** When the page last changed video, by `performance.now()`: a run waits `FOLLOW.settle` from then before starting by itself. */
  let changedAt = 0;
  /** Counts the videos, so an answer about the last one is known for what it is. */
  let turn = 0;

  const followers = new Set<() => void>();
  let snapshot: TranscribeState = { videoId, transcript, settings, key, source, prefs, status, working };
  const tell = () => {
    snapshot = { videoId, transcript, settings, key, source, prefs, status, working };
    for (const follower of followers) follower();
  };
  const setStatus = (next: TranscribeStatus) => {
    if (sameStatus(status, next)) return;
    status = next;
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

  function end() {
    run?.silent.destroy();
    run = null;
    setWorking(null);
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
    source = sourceOf(answer.source);
    prefs = answer.prefs;
    if (status.kind === "signedOut" || status.kind === "failed") status = { kind: "off" };
    tell();
  }

  async function send(mine: Run, id: string, piece: CutPiece) {
    // Decided as the piece goes, after the last one's answer (they go one at a time): what that one left open, this one asks.
    const check = !mine.settled;
    const answer = await askPiece({ videoId: id, pieceId: uuid(), startMs: piece.startMs, soundMs: piece.soundMs, endMs: piece.endMs, check, base64: piece.wav ? base64Of(piece.wav) : null });
    // The video moved on under it: the answer is about the last one.
    if (id !== videoId) return;
    if (!answer.ok) {
      if (run === mine) end();
      autoBlocked = true;
      if (answer.signedOut) setStatus({ kind: "signedOut" });
      else if (answer.status === 409) {
        key = false;
        setStatus({ kind: "noKey" });
      } else setStatus({ kind: "failed", message: answer.message });
      return;
    }
    transcript = answer.transcript;
    if (answer.verdict === "japanese") mine.settled = true;
    else if (answer.verdict === "other") {
      if (run === mine) end();
      autoBlocked = true;
      status = { kind: "notJapanese" };
    }
    tell();
  }

  function begin(id: string, at: number, forced: boolean, scope: Run["scope"] = { follow: true }) {
    if (!settings) return;
    const mine: Run = {
      forced,
      settled: forced,
      from: at,
      scope,
      queue: Promise.resolve(),
      silent: createSilentPlayer(id, settings.speed, (piece) => {
        mine.queue = mine.queue.then(() => send(mine, id, piece)).catch(() => undefined);
      }),
    };
    run = mine;
    mine.silent.go(at);
    setStatus({ kind: "running", to: at });
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
    if (!mayTranscribe(transcript.language)) {
      setStatus({ kind: "notJapanese" });
      return;
    }
    const at = startAt(t - FOLLOW.back, duration);
    if (at === null) {
      setStatus({ kind: "done" });
      return;
    }
    if (autoBlocked || prefs.trigger !== "auto") {
      // Nothing starts by itself here; something is left to transcribe, so Transcribe is the way.
      if (status.kind === "done") setStatus({ kind: "off" });
      return;
    }
    // The page has just changed video: left to settle before a second player is opened on its thread.
    if (performance.now() - changedAt < FOLLOW.settle * 1000) return;
    begin(id, at, false);
  }

  function steer(mine: Run, t: number, paused: boolean, duration: number | null) {
    if (!settings) return;
    // The pick left the engine (the line's picker): the run stops here, pressed or not.
    if (!engineWanted(source, settings.engine)) {
      end();
      setStatus({ kind: "off" });
      return;
    }
    const r = mine.silent.report();
    if (r.failed !== null) {
      end();
      autoBlocked = true;
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
    const over = () => {
      end();
      setStatus(mine.scope.follow || mine.scope.until === null ? { kind: "done" } : { kind: "off" });
    };
    if (r.ended || (until !== null && r.at >= until - FOLLOW.endSlack)) {
      over();
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
        over();
        return;
      }
      if (Math.abs(at - r.at) > FOLLOW.jump) {
        mine.from = at;
        mine.silent.go(at);
        setWorking(null);
        setStatus({ kind: "running", to: at });
        return;
      }
    }
    // Over something transcribed already, lying ahead: skipped to its end, or over when that's past where this run is over.
    const covered = coveredUntil(transcript, r.at + FOLLOW.skipAhead);
    if (r.playing && covered !== null && covered > r.at + FOLLOW.skipAhead) {
      if (until !== null && covered >= until - FOLLOW.endSlack) over();
      else mine.silent.go(covered);
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
      status = { kind: "off" };
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
      const paused = video.paused;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      if (run) steer(run, t, paused, duration);
      else maybeStart(id, t, duration);
    },
    /** The pick changed here on the page (the line's picker): taken at once; the worker keeps it. */
    setSource(next: SubtitleSource) {
      source = next;
      tell();
    },
    /** Transcribe pressed: from where the viewer is, following them, the language never asked. A run the browser blocked is tried again. */
    start(video: HTMLVideoElement) {
      const id = videoId;
      if (!id || !settings) return;
      if (run) {
        run.silent.resume();
        return;
      }
      autoBlocked = false;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      const at = startAt(video.currentTime - FOLLOW.back, duration);
      if (at === null) {
        setStatus({ kind: "done" });
        return;
      }
      begin(id, at, true);
    },
    /** The whole video in the background, start to end, whatever the viewer does; what's covered is skipped over. A run under way gives way. */
    startWhole(duration: number | null) {
      const id = videoId;
      if (!id || !settings) return;
      const at = startAt(0, duration);
      if (at === null) {
        setStatus({ kind: "done" });
        return;
      }
      end();
      begin(id, at, true, { follow: false, until: null });
    },
    /** A stretch of the video in the background, whatever the viewer does; what's covered in it is skipped over. A run under way gives way. Nothing when it's covered already. */
    startStretch(from: number, to: number) {
      const id = videoId;
      if (!id || !settings) return;
      const at = nextUncovered(transcript, Math.max(0, from), to);
      if (at === null) return;
      end();
      begin(id, at, true, { follow: false, until: to });
    },
    /** A preference of this viewer's changed here on the page (the strip's menu): taken at once; the worker keeps it. */
    setPrefs(next: Partial<TranscribePrefs>) {
      prefs = { ...prefs, ...next };
      tell();
    },
    /** Stop pressed: nothing more of this video until Transcribe is pressed, or another video plays. */
    stop() {
      end();
      autoBlocked = true;
      setStatus({ kind: "off" });
    },
    /** The transcript changed another way (a word fixed, a stretch forgotten): taken as it is, and a run under way looks again at what's behind it. */
    take(next: Transcript) {
      if (next.videoId !== videoId) return;
      transcript = next;
      resync = run !== null;
      tell();
    },
    running: () => run !== null,
  };
}
