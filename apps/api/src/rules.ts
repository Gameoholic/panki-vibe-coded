import { randomUUID } from "node:crypto";
import {
  ENGINES,
  RULE_MINUTES_MAX,
  RULE_TRIGGERS,
  type RuleRunStop,
  type RuleActionId,
  type RuleCall,
  batchesOf,
  capStop,
  lengthStop,
  ruleKnobsOf,
  type RuleRunAnswer,
  type RuleRunAsk,
  cutLines,
  defaultIdsOf,
  lineTextOf,
  transcriptFinished,
  youtubeUrl,
  type Rule,
  type RuleOutcome,
  type RulesStandingResponse,
  type RuleTriggerId,
  type Stretch,
} from "@panki/contracts";
import type { AiCalls, Called, Refused } from "./ai/calls";
import type { Db } from "./db";
import type { Shared } from "./shared";

/**
 * The rules, on the server (`docs/architecture/rules.md`): every cap held here, every run kept as a `rule_runs` row,
 * and the triggers the server hears run here, with no page open. A run by a rule is the very call a run by hand makes
 * (`AiCalls`), its usage row the same; what differs is the caps, asked with each call's most before it's sent, and the
 * row it leaves.
 */

export function createRules(dbFor: (userId: string) => Db, shared: Shared, calls: AiCalls, now: () => number) {
  /** Each rule's runs on a video, one after another: the last in line, by rule and video. A state of this process, as the whole-video downloads' line is. */
  const queues = new Map<string, Promise<void>>();

  const sum = (runs: readonly { costMicros: number }[]) => runs.reduce((total, run) => total + run.costMicros, 0);

  /** What every rule spent today together: what the account's one daily cap counts. */
  const everyRuleToday = (db: Db): number => sum(db.ruleRunsToday(now()));

  /** The cap as a call's `before`: its most on top of what every rule spent today, held to the account's daily cap. */
  const capsOf =
    (db: Db, rule: Rule) =>
    (ceilingMicros: number): Refused | null => {
      const why = capStop(rule, everyRuleToday(db), db.getSettings().rulesDayMicros, ceilingMicros);
      return why === null ? null : { status: 409, problem: "capped", message: `${why}.` };
    };

  function keep(db: Db, rule: Rule, subject: string, outcome: RuleOutcome, costMicros: number, detail: string | null) {
    db.insertRuleRun({ ruleId: rule.id, action: rule.do, subject, outcome, costMicros, detail }, now());
  }

  /** The account's rules on, heard by a trigger. */
  const heardBy = (db: Db, when: RuleTriggerId): Rule[] => db.getSettings().rules.filter((rule) => rule.on && rule.when === when);

  /**
   * A rule's Proofread over some of a video's lines, on the server: in calls of at most `PROOFREAD_CALL_CHARS` (`batchesOf`),
   * one run id across them so Undo all takes it back, each call held to the caps before it's sent and kept as a row. The
   * first call refused ends the run, what came before standing. The transcript says it's being proofread meanwhile.
   */
  async function proofreadFor(userId: string, rule: Rule, videoId: string, lines: readonly (readonly number[])[]): Promise<void> {
    const db = dbFor(userId);
    const templateId = defaultIdsOf(db.getSettings().aiDefaults, db.listAiTemplates()).transcript;
    if (!templateId) {
      keep(db, rule, videoId, "failed", 0, "No Proofread template.");
      return;
    }
    const read = shared.proofreadLines(videoId, lines);
    if (!read || read.length === 0) return;
    const run = randomUUID();
    {
      for (const batch of batchesOf(read.map(lineTextOf))) {
        const done = await calls.proofread(db, userId, {
          templateId,
          videoId,
          lines: batch.flatMap((i) => (lines[i] ? [lines[i]] : [])),
          around: [],
          pieces: { source: youtubeUrl({ videoId, seconds: null }) },
          run,
          before: capsOf(db, rule),
        });
        if (!done.ok) {
          keep(db, rule, videoId, done.refused.problem === "capped" ? "capped" : "failed", done.costMicros, done.refused.message);
          return;
        }
        const { words, lines: changed, ran } = done.done;
        keep(db, rule, videoId, "ran", ran.costMicros, words === 0 ? "Nothing to change." : `Edited ${words} word${words === 1 ? "" : "s"} in ${changed.length} line${changed.length === 1 ? "" : "s"}.`);
      }
    }
  }

  /**
   * A rule's Proofread in the background, one after another for its rule and video, so two chunks heard close together
   * each get their lines and the caps see what the one before spent. The transcript says it's being proofread from the
   * moment it's heard, so the page reading the chunk's answer already reads it again until it's done. Whatever goes
   * wrong is logged, never thrown at the request that heard it.
   */
  function background(rule: Rule, videoId: string, work: () => Promise<void>) {
    const key = `${rule.id}\n${videoId}`;
    shared.proofreading(videoId, true);
    const next = (queues.get(key) ?? Promise.resolve())
      .then(work)
      .catch((e: unknown) => console.error(`Rule ${rule.id} on ${videoId} went wrong.`, e))
      .finally(() => shared.proofreading(videoId, false));
    queues.set(key, next);
    void next.then(() => {
      if (queues.get(key) === next) queues.delete(key);
    });
  }

  /** A video's lines as a person sees them (`cutLines`), each its words' ids; with a stretch, only the lines with a word starting in it. */
  function linesOf(videoId: string, stretch: Stretch | null = null): number[][] {
    return cutLines(shared.transcript(videoId).words)
      .filter((line) => stretch === null || line.marks.some((mark) => mark.time * 1000 >= stretch.startMs && mark.time * 1000 < stretch.endMs))
      .map((line) => line.words.map((w) => w.id));
  }

  /** The rules on that a trigger leads to Proofread, each run over the lines it names as its turn comes. */
  function proofreadHeard(userId: string, videoId: string, when: RuleTriggerId, lines: () => number[][], once: boolean) {
    const db = dbFor(userId);
    for (const rule of heardBy(db, when)) {
      if (rule.do !== "proofread" || (once && db.ruleRanOn(rule.id, videoId))) continue;
      background(rule, videoId, async () => {
        // Once a video: looked at as its turn comes, so a trigger heard twice at once runs once.
        if (once && db.ruleRanOn(rule.id, videoId)) return;
        const named = lines();
        if (named.length > 0) await proofreadFor(userId, rule, videoId, named);
      });
    }
  }

  /**
   * The rules on that find where a video ends once its transcript is finished: once a video for each, and never on a
   * video that has its Video end already, found by anyone, nor one being found this moment (a press, or another rule):
   * it's everyone's, so an automation pays for it once (a press may ask again), and nothing runs and nothing is kept. Run as the call a press makes, held to
   * the caps before it's sent, kept as the run's row; the transcript says it's being found meanwhile. The video's length
   * is its whole-video download's, else as the account's watching last read it.
   */
  function findEndHeard(userId: string, videoId: string) {
    const db = dbFor(userId);
    for (const rule of heardBy(db, "transcriptWhole")) {
      if (rule.do !== "findVideoEnd" || db.ruleRanOn(rule.id, videoId)) continue;
      if (shared.videoEnd(videoId) !== null || shared.findingEnd.has(videoId)) return;
      const transcript = shared.transcript(videoId);
      const lengthMs = (transcript.job?.state === "done" ? transcript.job.lengthMs : null) ?? db.watchedLength(videoId);
      if (lengthMs === null) continue;
      void calls
        .findVideoEnd(db, userId, { videoId, lengthMs, pieces: { source: youtubeUrl({ videoId, seconds: null }) }, before: capsOf(db, rule) })
        .then((done) => {
          if (done.ok) keep(db, rule, videoId, "ran", done.done.ran.costMicros, `Video end at line ${done.done.line}: ${done.done.reason}`);
          else keep(db, rule, videoId, done.refused.problem === "capped" ? "capped" : "failed", done.costMicros, done.refused.message);
        })
        .catch((e: unknown) => console.error(`Rule ${rule.id} on ${videoId} went wrong.`, e));
      // One rule's run finds it for every other: the rest are passed over.
      return;
    }
  }

  /** A video's transcript became whole, for an account: each rule on that it triggers runs, once a video. */
  function heardWhole(userId: string, videoId: string) {
    proofreadHeard(userId, videoId, "transcriptWhole", () => linesOf(videoId), true);
    findEndHeard(userId, videoId);
  }

  /** What a video's transcript costs at the engine's listed price, in micro-dollars: the most a Transcribe run can spend on it. */
  function transcribeMicros(lengthMs: number): number {
    const { engine } = shared.getTranscription();
    return Math.round((ENGINES[engine].centsPerHour * 10_000 * lengthMs) / 3_600_000);
  }

  return {
    /**
     * A call to Panki AI a page makes for a rule it heard (a card added, the Word pop-up opening): the rule must be on, a
     * page's, and do this action; then its caps go in as the call's `before`, and `kept` keeps how the call ended as the
     * run's row (what the provider billed, a cap's words, the failure's). Null when the rule can't run: nothing is sent.
     */
    pageCall(db: Db, call: RuleCall, does: RuleActionId): { before: (ceilingMicros: number) => Refused | null; kept: (called: Called<unknown>) => void } | null {
      const rule = db.getSettings().rules.find((each) => each.id === call.id);
      if (!rule || !rule.on || rule.do !== does || RULE_TRIGGERS[rule.when].heard !== "page") return null;
      return {
        before: capsOf(db, rule),
        kept: (called) => {
          if (called.ok) keep(db, rule, call.subject, "ran", called.ran.costMicros, null);
          else keep(db, rule, call.subject, called.refused.problem === "capped" ? "capped" : "failed", called.costMicros, called.refused.message);
        },
      };
    },
    /**
     * A page heard a trigger and asks to run its rule on a video (`POST /api/rules/:ruleId/runs`): the rule must be on and
     * one a page hears; a watched threshold met by the video's whole watch time as Video tracking keeps it, or this
     * visit's where that's more (not yet: how much more, nothing kept); the video no longer than its minutes and, for
     * transcribing, the admin's length limit; and for transcribing, the video's whole cost at the engine's listed price
     * inside the account's daily cap. A video the rule ran on and paid for before goes again with nothing new kept
     * (its cost was counted then). Every go and every stop is a row.
     */
    startRun(db: Db, ruleId: string, ask: RuleRunAsk): RuleRunAnswer {
      const rule = db.getSettings().rules.find((each) => each.id === ruleId);
      if (!rule || !rule.on || RULE_TRIGGERS[rule.when].heard !== "page") return { go: false, why: "That automation is off.", waitMs: 0 };
      if (db.ruleRanOn(rule.id, ask.subject) && db.ruleSpentOn(rule.id, ask.subject) > 0) return { go: true, why: null, waitMs: 0 };
      if (rule.watchedSeconds !== null && ruleKnobsOf(rule).includes("seconds")) {
        const watched = Math.max(ask.watchedMs, db.watchedMsOf(ask.subject));
        const wanted = rule.watchedSeconds * 1000;
        if (watched < wanted) return { go: false, why: null, waitMs: wanted - watched };
      }
      const transcribes = rule.do === "transcribe" || rule.do === "transcribeWhole";
      // The admin's length limit is transcribing's ceiling: a download costs Panki nothing, and is held to its own minutes alone.
      const long = lengthStop(rule, ask.lengthMs, transcribes ? shared.getTranscription().downloadLimit : RULE_MINUTES_MAX);
      if (long !== null) {
        keep(db, rule, ask.subject, "capped", 0, `${long}.`);
        return { go: false, why: long, waitMs: 0 };
      }
      const costMicros = transcribes ? transcribeMicros(ask.lengthMs) : 0;
      const stop = capStop(rule, everyRuleToday(db), db.getSettings().rulesDayMicros, costMicros);
      if (stop !== null) {
        keep(db, rule, ask.subject, "capped", 0, `${stop}.`);
        return { go: false, why: stop, waitMs: 0 };
      }
      keep(db, rule, ask.subject, "ran", costMicros, null);
      return { go: true, why: null, waitMs: 0 };
    },
    /** A run a page let go part-way at a cap only it can hold (a download grown past its MB): kept as stopped, with why. */
    stoppedRun(db: Db, ruleId: string, stop: RuleRunStop): boolean {
      const rule = db.getSettings().rules.find((each) => each.id === ruleId);
      if (!rule) return false;
      keep(db, rule, stop.subject, "capped", 0, stop.why.endsWith(".") ? stop.why : `${stop.why}.`);
      return true;
    },
    /** How the rules stand today: each one's runs (its line's tint in the flow) and every rule's spend together. */
    standing(db: Db): RulesStandingResponse {
      const today = db.ruleRunsToday(now());
      return {
        standing: db.getSettings().rules.map((rule) => ({ ruleId: rule.id, todayRuns: today.filter((run) => run.ruleId === rule.id).length })),
        todayMicros: sum(today),
      };
    },
    /** A whole-video download done: the transcript is whole, for whoever asked for it. */
    downloaded(done: { videoId: string; userId: string }) {
      heardWhole(done.userId, done.videoId);
    },
    /**
     * A chunk or a stretch of quiet kept for an account: a chunk with words is heard as one (`chunkIn`, its lines: those
     * with a word starting in its stretch of sound); and when the chunks now cover the video end to end (its length as
     * the account's watching read it), the transcript is whole.
     */
    pieceIn(userId: string, videoId: string, heard: Stretch | null) {
      if (heard !== null) proofreadHeard(userId, videoId, "chunkIn", () => linesOf(videoId, heard), false);
      const lengthMs = dbFor(userId).watchedLength(videoId);
      if (lengthMs === null || !transcriptFinished(shared.transcript(videoId).covered, lengthMs)) return;
      heardWhole(userId, videoId);
    },
    /** A part transcribed again, its words standing: its lines (`partIn`), and the transcript may be whole now. */
    partIn(userId: string, videoId: string, part: Stretch) {
      proofreadHeard(userId, videoId, "partIn", () => linesOf(videoId, part), false);
      const lengthMs = dbFor(userId).watchedLength(videoId);
      if (lengthMs !== null && transcriptFinished(shared.transcript(videoId).covered, lengthMs)) heardWhole(userId, videoId);
    },
  };
}
export type Rules = ReturnType<typeof createRules>;
