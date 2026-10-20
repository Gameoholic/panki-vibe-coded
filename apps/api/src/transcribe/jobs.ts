import { randomUUID } from "node:crypto";
import { youtubeUrl, type EngineId, type WholeJob } from "@panki/contracts";
import type { Shared } from "../shared";
import { EngineError, type Engines } from "./engines";

/**
 * Whole-video downloads (2026-10-20): a video handed to the engine by its address, the engine fetching it and
 * transcribing all of it in one call, its words then replacing everything the video had (`shared.finishJob`). Asked
 * for by the extension (Full, and Hybrid behind its chunks) and run here, in the background of the API, so nothing
 * waits on it: the extension reads the transcript again until it's done. One at a time per engine, each waiting for
 * the one before; never cancelled, since it's paid for as it starts. What it cost is read off the engine's account on
 * either side of it. Every step is said on the API's console, never with the key.
 */

/** How long the engine may take over a whole video: ten seconds a minute of it, never under two minutes nor over fifteen (a 16-minute video took 41 s, 2026-10-19). */
const DEADLINE = { msPerMinute: 10_000, minMs: 120_000, maxMs: 900_000 };
/** How many times a download is handed to the engine: once more after a trouble that may pass (the engine unreachable, down or too busy; the API stopped under it), never after the engine's no. */
const ATTEMPTS = 2;
const NO_KEY = "Add a key for the engine in Settings → Admin.";
const RESTARTED = "Panki restarted while it was transcribing this video.";

export type Jobs = ReturnType<typeof createJobs>;

/** A video's length as the console says it: "16:24". */
const lengthWords = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function createJobs(shared: Shared, engines: Engines, engineKeys: Record<EngineId, string | null>, now: () => number) {
  /** Each engine's downloads, one after another: the last one in line. */
  const lines: Partial<Record<EngineId, Promise<void>>> = {};
  const say = (videoId: string, words: string) => console.log(`Whole video ${videoId} · ${words}`);

  function enqueue(engine: EngineId, id: string) {
    const before = lines[engine] ?? Promise.resolve();
    lines[engine] = before
      .then(() => run(id))
      .catch((e: unknown) => {
        console.error("A whole-video download went wrong.", e);
        shared.failJob(id, "Something went wrong.", now());
      });
  }

  async function run(id: string) {
    const job = shared.job(id);
    if (!job || job.state !== "running") return;
    const key = shared.key(job.engine) ?? engineKeys[job.engine];
    if (key === null) {
      shared.failJob(id, NO_KEY, now());
      say(job.videoId, "no key");
      return;
    }
    const engine = engines[job.engine];
    // The credits the engine has counted so far: read again once it's done, the difference is what it cost.
    const before = await engine.account(key).then(
      (account) => account.used,
      () => null,
    );
    const attempt = shared.startJob(id, now());
    const deadline = Math.min(DEADLINE.maxMs, Math.max(DEADLINE.minMs, Math.round((job.lengthMs / 60_000) * DEADLINE.msPerMinute)));
    say(job.videoId, `${lengthWords(job.lengthMs)} · handed to the engine (try ${attempt} of ${ATTEMPTS})`);
    const startedAt = now();
    try {
      const heard = await engine.transcribeVideo(key, youtubeUrl({ videoId: job.videoId, seconds: null }), job.language, deadline);
      const after = await engine.account(key).then(
        (account) => account.used,
        () => null,
      );
      const credits = before !== null && after !== null && after >= before ? after - before : null;
      const done = shared.finishJob(id, heard, credits, now());
      if (done) {
        const took = ((now() - startedAt) / 1000).toFixed(1);
        say(job.videoId, `done in ${took} s · ${done.words ?? 0} words · replaced ${done.replaced ?? 0} chunks${credits === null ? "" : ` · ${credits} credits`}`);
      }
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      if (e.passing && attempt < ATTEMPTS) {
        say(job.videoId, `${e.message} Trying once more.`);
        enqueue(job.engine, id);
        return;
      }
      shared.failJob(id, e.message, now());
      say(job.videoId, `failed: ${e.message}`);
    }
  }

  return {
    /** A video downloaded whole: the one under way when there is one, or a new one, asked for now. */
    ask(videoId: string, lengthMs: number, userId: string): WholeJob {
      const running = shared.runningJob(videoId);
      if (running) return running;
      const { engine, language } = shared.getTranscription();
      const job = shared.insertJob({ id: randomUUID(), videoId, engine, language, lengthMs, userId }, now());
      say(videoId, `${lengthWords(lengthMs)} · asked for`);
      enqueue(engine, job.id);
      return job;
    },
    /** At the API's start: every download it stopped under is taken up again, once; one already tried as often as it may be is given up. */
    resume() {
      for (const job of shared.runningJobs()) {
        if (job.attempts >= ATTEMPTS) {
          shared.failJob(job.id, RESTARTED, now());
          say(job.videoId, "given up: Panki restarted under it");
          continue;
        }
        say(job.videoId, "taken up again after a restart");
        enqueue(job.engine, job.id);
      }
    },
  };
}
