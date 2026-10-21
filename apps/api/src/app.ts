import express, { type Response } from "express";
import type { EngineId, Space, StorageReport, WordAudioSourceId } from "@panki/contracts";
import type { AuthDb } from "./authDb";
import type { Db } from "./db";
import { accountRouter, loginRouter } from "./routes/auth";
import type { Forvo } from "./forvo";
import { cardsRouter } from "./routes/cards";
import { decksRouter } from "./routes/decks";
import { dictionariesRouter } from "./routes/dictionaries";
import { forvoRouter } from "./routes/forvo";
import { mediaRouter } from "./routes/media";
import { settingsRouter } from "./routes/settings";
import { spaceRouter } from "./routes/space";
import { srsRouter } from "./routes/srs";
import { statsRouter } from "./routes/stats";
import { transcriptionRouter } from "./routes/transcription";
import { transcriptsRouter } from "./routes/transcripts";
import { typesRouter } from "./routes/types";
import { videosRouter } from "./routes/videos";
import { watchingRouter } from "./routes/watching";
import { wordAudioRouter } from "./routes/wordAudio";
import { requireSession, signedIn } from "./session";
import type { Shared } from "./shared";
import { createThrottle } from "./throttle";
import type { Engines } from "./transcribe/engines";
import type { Jobs } from "./transcribe/jobs";

export type AppDeps = {
  auth: AuthDb;
  dbFor: (userId: string) => Db;
  mediaDirFor: (userId: string) => string;
  /** What every account shares: the keys, the dictionaries kept on Panki, how transcribing runs, the transcripts. */
  shared: Shared;
  /** Where the shared dictionaries' zips live. */
  dictionaryDir: string;
  /** What's left on the disk under the data. Passed in, like the clock, so it can be pinned in tests. */
  space: () => Space;
  /** Everything Panki's data takes on that disk, for an admin's Settings. */
  storage: () => StorageReport;
  /** Word audio from Forvo, and the server's own key for each source of word audio (the environment's), used when none was typed in Settings. */
  forvo: Forvo;
  wordAudioKeys: Record<WordAudioSourceId, string | null>;
  /** The transcription engines, and the server's own key for each (the environment's), used when none was typed in Settings. */
  engines: Engines;
  engineKeys: Record<EngineId, string | null>;
  /** Whole-video downloads, run in the background with the same engines and keys. */
  jobs: Jobs;
  now?: () => number;
};

/** Every account's data lives behind its sign-in: the router reads the database of whoever the request belongs to. */
export type DbOf = (res: Response) => Db;

/** `now` is passed in so time can be pinned in tests; the API, never the browser, stamps it. */
export function createApp({ auth, dbFor, mediaDirFor, shared, dictionaryDir, space, storage, forvo, wordAudioKeys, engines, engineKeys, jobs, now = Date.now }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  // nginx sits in front on the VPS: its X-Forwarded-* headers are believed from loopback only, so `req.secure` and `req.ip` are the browser's.
  app.set("trust proxy", "loopback");
  app.use(express.json({ limit: "64kb" }));
  // Every answer is for the one signed in, as things stand now: a browser keeps none of it, and reads it as the type it
  // says. A file served (`/api/media`, a dictionary's zip) sets its own caching over this: it never changes under its id.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  const deps = { auth, throttle: createThrottle(), now };
  const dbOf: DbOf = (res) => dbFor(signedIn(res).user.id);

  app.use("/api/login", loginRouter(deps));
  app.use("/api", requireSession(auth, now));
  app.use("/api", accountRouter(deps, dbFor));
  app.use("/api/types", typesRouter(dbOf, now));
  app.use("/api/srs", srsRouter(dbOf, now));
  app.use("/api/settings", settingsRouter(dbOf, now));
  app.use("/api/decks", decksRouter(dbOf, now));
  app.use("/api/cards", cardsRouter(dbOf));
  app.use("/api/media", mediaRouter(dbOf, (res) => mediaDirFor(signedIn(res).user.id), now));
  app.use("/api/word-audio", wordAudioRouter(shared, wordAudioKeys, now));
  app.use("/api/forvo", forvoRouter(dbOf, (res) => mediaDirFor(signedIn(res).user.id), forvo, shared, wordAudioKeys.forvo, now));
  app.use("/api/dictionaries", dictionariesRouter(shared, dictionaryDir, now));
  app.use("/api/transcription", transcriptionRouter(dbOf, shared, engines, engineKeys, now));
  app.use("/api/transcripts", transcriptsRouter(dbOf, shared, engines, engineKeys, jobs, now));
  app.use("/api/videos", videosRouter(dbOf, shared, now));
  app.use("/api/watching", watchingRouter(dbOf, shared, now));
  app.use("/api/stats", statsRouter(dbOf, now));
  app.use("/api/space", spaceRouter(space, storage));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { message: "Not found" } });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: { message: status >= 500 ? "Something went wrong." : "That request isn't valid." } });
  });

  return app;
}
