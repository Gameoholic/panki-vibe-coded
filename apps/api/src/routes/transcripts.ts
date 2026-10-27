import express, { Router, type Request, type Response } from "express";
import {
  PIECE_MAX_BYTES,
  PieceId,
  PieceMeta,
  RedoAsk,
  RedoQuery,
  Stretch,
  TranscriptFix,
  TranscriptForget,
  TranscriptLineFix,
  VideoId,
  WholeAsk,
  modesOn,
  overDownloadLimit,
  type EngineId,
  type PieceResponse,
  type RedoResponse,
  type RedoStretchResponse,
} from "@panki/contracts";
import type { DbOf } from "../app";
import { isWav } from "../mediaFiles";
import { signedIn } from "../session";
import type { Shared } from "../shared";
import { EngineError, type Engines, type Heard } from "../transcribe/engines";
import type { Jobs } from "../transcribe/jobs";

const MB = 1024 * 1024;
const NOT_A_PIECE = "That isn't a chunk of the video.";
const NO_KEY = "Add a key for the engine in Settings → Admin.";
const NOT_A_VIDEO = "That isn't a video id.";
const REDO_GONE = "That part isn't being transcribed again any more.";

function isTooLarge(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && err.status === 413;
}

/** The video and the piece the address names, or null after answering that one of them isn't valid. */
function pathOf(req: Request, res: Response): { videoId: string; pieceId: string } | null {
  const videoId = VideoId.safeParse(req.params.videoId);
  if (!videoId.success) {
    res.status(400).json({ error: { message: "That isn't a video id." } });
    return null;
  }
  const pieceId = PieceId.safeParse(req.params.pieceId);
  if (!pieceId.success) {
    res.status(400).json({ error: { message: NOT_A_PIECE } });
    return null;
  }
  return { videoId: videoId.data, pieceId: pieceId.data };
}

/** What's said of the piece in the address: where it is and whether to ask the language. The refine's own sentence when that's what's wrong. */
function metaOf(req: Request, res: Response): PieceMeta | null {
  const parsed = PieceMeta.safeParse(req.query);
  if (parsed.success) return parsed.data;
  const refined = parsed.error.issues.find((issue) => issue.code === "custom");
  res.status(400).json({ error: { message: refined?.message ?? NOT_A_PIECE } });
  return null;
}

/** The video the address names, or null after answering that it isn't valid. */
function videoOf(req: Request, res: Response): string | null {
  const videoId = VideoId.safeParse(req.params.videoId);
  if (videoId.success) return videoId.data;
  res.status(400).json({ error: { message: NOT_A_VIDEO } });
  return null;
}

/**
 * A video's transcript, shared by everyone: read whole, grown a chunk at a time by the extension (each chunk's sound
 * handed to the engine the settings name, its words kept with their times) or downloaded whole by the engine in the
 * background (`transcribe/jobs.ts`), and fixed by hand a word or a line at a time.
 */
export function transcriptsRouter(dbOf: DbOf, shared: Shared, engines: Engines, engineKeys: Record<EngineId, string | null>, jobs: Jobs, now: () => number) {
  const router = Router();

  /** The language the engine is told: the asking account's own (2026-10-21: each account's, nothing Panki-wide). */
  const toldFor = (res: Response) => dbOf(res).getSettings().language;

  // A video never transcribed is an empty transcript, never an error. Read again and again while a download is under way.
  router.get("/:videoId", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId) return;
    res.json({ transcript: shared.transcript(videoId) });
  });

  // The whole video downloaded and transcribed by the engine, in the background: the answer is the transcript with the
  // download under way in it (the one already under way, when there is one). As the settings say: never when every mode
  // that downloads is switched off, nor over the download limit where that's not allowed. Warn first is the extension's
  // to ask; asked here, it goes ahead.
  router.post("/:videoId/whole", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId) return;
    const parsed = WholeAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't the video's length." } });
      return;
    }
    const settings = shared.getTranscription();
    if ((shared.key(settings.engine) ?? engineKeys[settings.engine]) === null) {
      res.status(409).json({ error: { message: NO_KEY } });
      return;
    }
    if (!modesOn(settings).some((mode) => mode !== "live")) {
      res.status(403).json({ error: { message: "Transcribing the entire video is switched off." } });
      return;
    }
    if (settings.overLimit === "notAllowed" && overDownloadLimit(settings, parsed.data.lengthMs / 1000)) {
      res.status(403).json({ error: { message: "Not allowed over the length limit." } });
      return;
    }
    jobs.ask(videoId, parsed.data.lengthMs, signedIn(res).user.id, toldFor(res));
    res.status(202).json({ transcript: shared.transcript(videoId) });
  });

  // A piece's sound is the request's whole body, under its own ceiling; every other route keeps the 64 KB of the JSON reader.
  const reader = express.raw({ type: () => true, limit: PIECE_MAX_BYTES });

  // The extension mints the piece's id, so a piece sent again is the piece that's there and never a second call to the
  // engine (which is paid for). Two handlers, as an upload is: the reader's callback can't be let throw outside Express.
  router.put(
    "/:videoId/pieces/:pieceId",
    (req, res, next) => {
      if (!pathOf(req, res)) return;
      reader(req, res, (err?: unknown) => {
        if (isTooLarge(err)) res.status(413).json({ error: { message: `That chunk is too big: over ${PIECE_MAX_BYTES / MB} MB.` } });
        else next(err);
      });
    },
    async (req, res) => {
      const ids = pathOf(req, res);
      if (!ids) return;
      const meta = metaOf(req, res);
      if (!meta) return;
      const body: unknown = req.body;
      const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
      // A stretch of nothing comes with no sound. Sound is believed only as far as its own first bytes, like any file Panki takes.
      const nothing = meta.sound === meta.end;
      if (nothing ? bytes.length > 0 : bytes.length === 0 || !isWav(bytes)) {
        res.status(400).json({ error: { message: nothing ? "A stretch of nothing comes with no sound." : "That isn't a chunk of sound." } });
        return;
      }
      if (shared.hasPiece(ids.videoId, ids.pieceId)) {
        const answer: PieceResponse = { transcript: shared.transcript(ids.videoId), engineMs: null };
        res.json(answer);
        return;
      }
      // A piece of a part being transcribed again is taken only while that's under way: one sent after it was given up
      // isn't paid for.
      const redoId = meta.redo ?? null;
      if (redoId !== null && !shared.redoRunning(ids.videoId, redoId)) {
        res.status(409).json({ error: { message: REDO_GONE } });
        return;
      }
      // The whole video came in while the chunk was on its way: what it heard of the chunk's stretch stands, and the
      // engine isn't paid to hear it again. A part being transcribed again is heard again whatever stands over it.
      if (redoId === null && shared.coveredByJob(ids.videoId, meta.sound, meta.end)) {
        const answer: PieceResponse = { transcript: shared.transcript(ids.videoId), engineMs: null };
        res.json(answer);
        return;
      }
      const userId = signedIn(res).user.id;
      // Listened through and nothing said: heard, so covered, and no engine to ask.
      if (nothing) {
        shared.insertQuiet({ id: ids.pieceId, videoId: ids.videoId, startMs: meta.start, endMs: meta.end, userId, redoId }, now());
        const answer: PieceResponse = { transcript: shared.transcript(ids.videoId), engineMs: null };
        res.status(201).json(answer);
        return;
      }
      const { engine } = shared.getTranscription();
      const key = shared.key(engine) ?? engineKeys[engine];
      if (key === null) {
        res.status(409).json({ error: { message: NO_KEY } });
        return;
      }
      // Told the language the one watching transcribes in (their Settings, else Settings → Admin → Transcribing), never
      // asked: the check that asked went on 2026-10-18.
      const told = toldFor(res);
      let heard: Heard;
      const askedAt = performance.now();
      try {
        heard = await engines[engine].transcribe(key, bytes, told);
      } catch (e) {
        if (!(e instanceof EngineError)) throw e;
        res.status(e.status).json({ error: { message: e.message } });
        return;
      }
      const engineMs = Math.round(performance.now() - askedAt);
      shared.insertPiece(
        { id: ids.pieceId, videoId: ids.videoId, heardFrom: meta.start, startMs: meta.sound, endMs: meta.end, engine, userId, told, language: heard.language, engineMs, runMs: meta.since ?? null, redoId },
        heard.words.map((w) => ({ text: w.text, startMs: meta.sound + w.startMs, endMs: meta.sound + w.endMs })),
        now(),
      );
      const answer: PieceResponse = { transcript: shared.transcript(ids.videoId), engineMs };
      res.status(201).json(answer);
    },
  );

  /** Fixing a transcript by hand is everyone's to do only while an admin leaves it on (`Transcription.fixes`). */
  function fixesOff(res: Response): boolean {
    if (shared.getTranscription().fixes) return false;
    res.status(403).json({ error: { message: "Editing Panki subtitles is switched off." } });
    return true;
  }

  // A word put right by hand: kept beside the engine's word, never over it.
  router.post("/:videoId/fixes", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId || fixesOff(res)) return;
    const parsed = TranscriptFix.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't an edit.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    if (!shared.fixWord(videoId, parsed.data.wordId, parsed.data.text, signedIn(res).user.id, now())) {
      res.status(404).json({ error: { message: "That word isn't in the transcript." } });
      return;
    }
    res.json({ transcript: shared.transcript(videoId) });
  });

  // A line put right by hand (the pencil): its words and where it starts and ends, each word changed kept beside the engine's.
  router.post("/:videoId/lines", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId || fixesOff(res)) return;
    const parsed = TranscriptLineFix.safeParse(req.body);
    if (!parsed.success) {
      const refined = parsed.error.issues.find((issue) => issue.code === "custom");
      res.status(400).json({ error: { message: refined?.message ?? "That isn't a line of the transcript.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    if (!shared.fixLine(videoId, parsed.data, signedIn(res).user.id, now())) {
      res.status(404).json({ error: { message: "That line isn't in the transcript any more." } });
      return;
    }
    res.json({ transcript: shared.transcript(videoId) });
  });

  // A transcript forgotten, a stretch of it (ms) or the whole ({}), to be transcribed afresh: everyone's, like a fix;
  // that it costs again is for whoever asks to weigh. Nothing is deleted, and the ask is kept with who made it (`shared.forget`).
  router.post("/:videoId/forget", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId) return;
    const parsed = TranscriptForget.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a stretch of the video." } });
      return;
    }
    // A stretch, or the whole video (the empty body).
    const stretch = Stretch.safeParse(parsed.data);
    shared.forget(videoId, stretch.success ? stretch.data : null, now(), signedIn(res).user.id);
    res.json({ transcript: shared.transcript(videoId) });
  });

  // A part transcribed again in chunks, everyone's like a forget (the owner, 2026-10-20: "Re-transcribe a part"): asked
  // for, with the stretch it widened to in the answer; its pieces come under its id and stay out of the transcript;
  // done, they stand in place of what stood there, at once; or given up, and the transcript is as it was.
  router.post("/:videoId/redos", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId) return;
    const parsed = RedoAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a stretch of the video." } });
      return;
    }
    const { engine } = shared.getTranscription();
    if ((shared.key(engine) ?? engineKeys[engine]) === null) {
      res.status(409).json({ error: { message: NO_KEY } });
      return;
    }
    const asked = { startMs: parsed.data.startMs, endMs: parsed.data.endMs };
    const redo = shared.startRedo({ id: parsed.data.id, videoId, asked, userId: signedIn(res).user.id }, now());
    if (!redo) {
      res.status(409).json({ error: { message: REDO_GONE } });
      return;
    }
    const answer: RedoResponse = { transcript: shared.transcript(videoId), redo };
    res.status(201).json(answer);
  });

  // What a part typed would widen to, said before it's asked for (the owner, 2026-10-20: "it says ahead of time").
  router.get("/:videoId/redos/stretch", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId) return;
    const parsed = RedoQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a stretch of the video." } });
      return;
    }
    const answer: RedoStretchResponse = { stretch: shared.redoStretch(videoId, { startMs: parsed.data.start, endMs: parsed.data.end }) };
    res.json(answer);
  });

  router.post("/:videoId/redos/:redoId/done", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId) return;
    const redoId = PieceId.safeParse(req.params.redoId);
    if (!redoId.success || !shared.finishRedo(videoId, redoId.data, toldFor(res), now())) {
      res.status(409).json({ error: { message: REDO_GONE } });
      return;
    }
    res.json({ transcript: shared.transcript(videoId) });
  });

  router.post("/:videoId/redos/:redoId/cancel", (req, res) => {
    const videoId = videoOf(req, res);
    if (!videoId) return;
    const redoId = PieceId.safeParse(req.params.redoId);
    if (redoId.success) shared.cancelRedo(videoId, redoId.data, now());
    res.json({ transcript: shared.transcript(videoId) });
  });

  return router;
}
