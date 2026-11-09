/** @panki Proofread on a video's page: its runs, their calls and Undo (`createProofreader`, `ProofreadScope`, `ProofreadState`). Never a second way of proofreading. */
import {
  AI_PROVIDERS,
  APP_LANGUAGES,
  PROOFREAD_AROUND,
  TRANSCRIBE_LANGUAGES,
  answeredCall,
  batchesOf,
  failedCall,
  modelWords,
  proofreadPieces,
  proofreadTokens,
  proofreadVerdicts,
  proofreadWordOf,
  startCall,
  type AiCall,
  type AiMessageWhy,
  type AiTemplate,
  type PankiAi,
  type PromptPieces,
  type TranscriptWord,
} from "@panki/contracts";
import { ceilingOf } from "@web/components/AiRun";
import { clock, estimateWords } from "@web/words";
import { askAiState, askProofread, askUndoFixes, type AiShown } from "../messages";
import type { TranscriptLine } from "./lines";
import type { Transcriber } from "./transcriber";

/**
 * Proofread on a video's page (AI step 6): a video's Panki subtitles put right by Panki AI, a run at a time, its edits
 * going in by themselves (a learner can't judge a mishearing; the engine's word kept, the spark
 * on every word edited and Undo are what protect the transcript). A run is the entire video, a part of it or one row,
 * sent as the lines the strip reads (`linesOf`) by their words' ids, at most `PROOFREAD_CALL_CHARS` of them a call
 * (`batchesOf`), one call after another, every call one id of the run's so Undo all takes the whole run back. Its calls
 * are what the menu's head (`AiStatus`) tells of; what it did goes in the transcriber's Log. The strip's menu and rows
 * both read it; nothing of it is kept but the edits themselves, which are the transcript's, for everyone.
 */

/** What a run covers: the entire video, a stretch of it in seconds (widened to whole lines), or one row under the player by its lines. */
export type ProofreadScope = { kind: "all" } | { kind: "part"; start: number; end: number } | { kind: "row"; key: string; lineIds: readonly number[] };

export type ProofreadState = {
  /** Panki AI as the worker keeps it: unknown until it answers, null signed out, or why it couldn't be told. */
  ai: { known: false } | { known: true; shown: AiShown | null; failure: string | null };
  /** Every call made on this video, oldest first, as the head tells of them. */
  calls: readonly AiCall[];
  /** A run on its way: the words it covers (their rows wait), and the row's key for a row's own run. */
  going: { words: ReadonlySet<number>; row: string | null } | null;
  /** The latest run, by its id: what Undo all takes back while any of its edits stand. */
  lastRun: string | null;
  /** The presses that made a run: the head's spark blinks once for each. */
  burst: number;
};

/** The pieces only the page has (the video's title, channel, link and description), cut to Panki AI's limits: the strip's `videoPieces`. */
type VideoPieces = (limits: PankiAi) => PromptPieces;

const SAID = {
  signedOut: "Sign in to Panki",
  off: "Panki AI is off",
  noKey: (provider: string) => `No key for ${provider}`,
  editingOff: "Editing Panki subtitles is off",
  empty: "Nothing transcribed yet",
  working: "Panki AI is working",
};

export function createProofreader(transcriber: Transcriber, linesNow: () => readonly TranscriptLine[], videoPieces: VideoPieces) {
  let state: ProofreadState = { ai: { known: false }, calls: [], going: null, lastRun: null, burst: 0 };
  let videoId: string | null = null;
  /** How many runs each template has had on this video: its calls named "Proofread", then "Proofread 2". */
  const ran = new Map<string, number>();
  const followers = new Set<() => void>();
  const set = (next: Partial<ProofreadState>) => {
    state = { ...state, ...next };
    for (const follower of followers) follower();
  };

  async function readAi(fresh = false): Promise<AiShown | null> {
    const answer = await askAiState(fresh);
    set({ ai: answer.ok ? { known: true, shown: answer.ai, failure: null } : { known: true, shown: null, failure: answer.message } });
    return answer.ok ? answer.ai : null;
  }

  /** The words of the transcript by id, as it stands now. */
  const wordsById = (): Map<number, TranscriptWord> => new Map((transcriber.state().transcript?.words ?? []).map((w) => [w.id, w]));
  /** The lines a run covers, in order, and for a row's own run the lines either side of it, sent to read. */
  function linesOf(scope: ProofreadScope): { lines: TranscriptLine[]; around: TranscriptLine[] } {
    const all = linesNow();
    if (scope.kind === "all") return { lines: [...all], around: [] };
    if (scope.kind === "part") return { lines: all.filter((line) => line.start < scope.end && (line.end ?? line.start) > scope.start), around: [] };
    const ids = new Set(scope.lineIds);
    const first = all.findIndex((line) => ids.has(line.id));
    let last = first;
    all.forEach((line, i) => {
      if (ids.has(line.id)) last = i;
    });
    if (first < 0) return { lines: [], around: [] };
    return { lines: all.slice(first, last + 1), around: [...all.slice(Math.max(0, first - PROOFREAD_AROUND), first), ...all.slice(last + 1, last + 1 + PROOFREAD_AROUND)] };
  }
  /** A line's words as Proofread reads them. */
  const wordsOf = (line: TranscriptLine, by: Map<number, TranscriptWord>) => line.words.flatMap((placed) => {
    const word = by.get(placed.id);
    return word ? [proofreadWordOf(word)] : [];
  });
  /** What a call sends, as the server will fill it: the video's own pieces, the lines and their lists, the account's two languages. */
  function piecesFor(shown: AiShown, batch: readonly TranscriptLine[], around: readonly TranscriptLine[], by: Map<number, TranscriptWord>): PromptPieces {
    const { source, description } = videoPieces(shown.settings);
    return {
      ...(source ? { source } : {}),
      ...(description ? { description } : {}),
      ...proofreadPieces(batch.map((line) => wordsOf(line, by)), around.map((line) => wordsOf(line, by))),
      learningLanguage: TRANSCRIBE_LANGUAGES[shown.learningLanguage],
      language: APP_LANGUAGES[shown.language],
    };
  }
  /** A run split into its calls: each call's lines. */
  const callsOf = (lines: readonly TranscriptLine[]): TranscriptLine[][] => batchesOf(lines.map((line) => line.text)).map((batch) => batch.flatMap((i) => (lines[i] ? [lines[i]] : [])));

  /** Why a run can't go now, in the menu's words, or null when it can. */
  function why(): string | null {
    if (!state.ai.known) return null;
    if (state.ai.failure) return state.ai.failure;
    const shown = state.ai.shown;
    if (!shown) return SAID.signedOut;
    if (!shown.settings.aiOn) return SAID.off;
    if (shown.key === null) return SAID.noKey(AI_PROVIDERS[shown.settings.aiProvider].name);
    if (!(transcriber.state().settings?.fixes ?? false)) return SAID.editingOff;
    if (linesNow().length === 0) return SAID.empty;
    if (state.going) return SAID.working;
    return null;
  }

  /** The most a run can cost at the model's listed prices: every call's prompt as it'll be filled and its answer at its limit. Null while it can't be said. */
  function ceiling(scope: ProofreadScope, template: AiTemplate): number | null {
    const shown = state.ai.known ? state.ai.shown : null;
    if (!shown) return null;
    const { lines, around } = linesOf(scope);
    if (lines.length === 0) return null;
    const by = wordsById();
    return callsOf(lines).reduce(
      (sum, batch) => sum + ceilingOf(shown.settings, template, piecesFor(shown, batch, around, by), [], {}, proofreadTokens(batch.length, shown.settings.aiMaxProofreadTokens)),
      0,
    );
  }

  /** What a run covers, as the Log and Details say it. */
  const whereOf = (scope: ProofreadScope, lines: readonly TranscriptLine[]): string => {
    if (scope.kind === "all") return "the entire video";
    const start = lines[0]?.start ?? 0;
    const end = lines.at(-1)?.end ?? start;
    return scope.kind === "row" ? `the ${clock(start)} line` : `${clock(start)}–${clock(end)}`;
  };

  /**
   * A run: its calls one after another, each a call of the head's, its edits taken into the transcript as it comes
   * back. A call that fails ends the run there; what the calls before it edited stands.
   */
  async function run(scope: ProofreadScope, template: AiTemplate, why: AiMessageWhy): Promise<void> {
    const shown = state.ai.known ? state.ai.shown : null;
    const id = transcriber.state().transcript?.videoId ?? null;
    if (!shown || !id || state.going) return;
    const { lines, around } = linesOf(scope);
    if (lines.length === 0) return;
    const by = wordsById();
    const runId = crypto.randomUUID();
    const batches = callsOf(lines);
    const times = (ran.get(template.id) ?? 0) + 1;
    ran.set(template.id, times);
    const name = times === 1 ? template.name : `${template.name} ${times}`;
    const where = whereOf(scope, lines);
    const ceil = ceiling(scope, template) ?? 0;
    videoId = id;
    set({ going: { words: new Set(lines.flatMap((line) => line.words.map((w) => w.id))), row: scope.kind === "row" ? scope.key : null }, burst: state.burst + 1 });
    transcriber.note(`Panki AI proofreading ${where} · “${template.name}” · ${modelWords({ provider: shown.settings.aiProvider, model: shown.settings.aiModel })} · up to ${estimateWords(ceil)}`);
    let words = 0;
    let changed = 0;
    let spent = 0;
    let failure: string | null = null;
    for (const [n, batch] of batches.entries()) {
      const label = batches.length === 1 ? name : `${name} · ${n + 1} of ${batches.length}`;
      const pieces = piecesFor(shown, batch, around, by);
      const call = startCall({ label, why, settings: shown.settings, template, pieces, said: [], now: Date.now(), maxAnswerTokens: proofreadTokens(batch.length, shown.settings.aiMaxProofreadTokens) });
      set({ calls: [...state.calls, call] });
      const answer = await askProofread({
        templateId: template.id,
        videoId: id,
        lines: batch.map((line) => line.words.map((w) => w.id)),
        around: around.map((line) => line.words.map((w) => w.id)).filter((ids) => ids.length > 0),
        pieces: { ...(pieces.source ? { source: pieces.source } : {}), ...(pieces.description ? { description: pieces.description } : {}) },
        run: runId,
      });
      // Another video meanwhile: what came back is that video's, and this page has moved on.
      if (videoId !== id) return;
      const finished = answer.ok
        ? answeredCall(call, { ...answer.proofread, cut: false }, Date.now(), proofreadVerdicts(answer.proofread.lines))
        : failedCall(call, answer.message, Date.now(), answer.unread);
      set({ calls: state.calls.map((each) => (each === call ? finished : each)) });
      if (!answer.ok) {
        failure = answer.message;
        break;
      }
      transcriber.take(answer.transcript);
      words += answer.proofread.words;
      changed += answer.proofread.lines.length;
      spent += answer.proofread.costMicros;
    }
    set({ going: null, ...(words > 0 ? { lastRun: runId } : {}) });
    if (failure !== null) transcriber.note(`Panki AI's proofread stopped · ${failure}`);
    else transcriber.note(words === 0 ? `Panki AI found nothing to change · ${estimateWords(spent)}` : `Panki AI edited ${words} word${words === 1 ? "" : "s"} in ${changed} line${changed === 1 ? "" : "s"} · ${estimateWords(spent)}`);
    // The worker keeps Panki AI as the answer said it stands: the next "Up to" follows any change.
    void readAi();
  }

  /** Panki AI's edits taken back, one step each: a word's, or the latest run's still standing. Answers why not, or null. */
  async function undo(what: { wordId: number; at: number } | "run"): Promise<string | null> {
    const id = transcriber.state().transcript?.videoId ?? null;
    if (!id) return null;
    if (what === "run" && state.lastRun === null) return null;
    const answer = await askUndoFixes(id, what === "run" ? { run: state.lastRun ?? "" } : { wordId: what.wordId });
    if (!answer.ok) return answer.message;
    transcriber.take(answer.transcript);
    transcriber.note(what === "run" ? "you undid Panki AI's edits from its last run · each word back to what it read before" : `you undid Panki AI's edit at ${clock(what.at)} · the word back to what it read before`);
    return null;
  }

  return {
    get: () => state,
    subscribe(follower: () => void) {
      followers.add(follower);
      return () => {
        followers.delete(follower);
      };
    },
    readAi,
    why,
    ceiling,
    run,
    undo,
    /** Another video: its calls and its last run are that video's, gone with it. */
    video(id: string | null) {
      if (id === videoId) return;
      videoId = id;
      ran.clear();
      set({ calls: [], going: null, lastRun: null });
    },
    /** Whether any of the latest run's edits still stand in the transcript: Undo all is there while they do. */
    lastStanding(): boolean {
      const runId = state.lastRun;
      return runId !== null && (transcriber.state().transcript?.words ?? []).some((w) => w.fix?.by === "ai" && w.fix.run === runId);
    },
  };
}
export type Proofreader = ReturnType<typeof createProofreader>;
