import express, { Router, type Request, type Response } from "express";
import { PIECE_MAX_BYTES, PieceId, PieceMeta, Stretch, TOLD_JAPANESE, TranscriptFix, TranscriptForget, VideoId, keepHeard, verdictOf, type EngineId, type PieceResponse } from "@panki/contracts";
import { isWav } from "../mediaFiles";
import { signedIn } from "../session";
import type { Shared } from "../shared";
import { EngineError, type Engines, type Heard } from "../transcribe/engines";

const MB = 1024 * 1024;
const NOT_A_PIECE = "That isn't a piece.";
const NO_KEY = "Add a key for the engine in Settings → Admin.";

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

/**
 * A video's transcript, shared by everyone: read whole, grown a piece at a time by the extension (each piece's sound
 * handed to the engine the settings name, its words kept with their times), and fixed a word at a time by hand.
 */
export function transcriptsRouter(shared: Shared, engines: Engines, engineKeys: Record<EngineId, string | null>, now: () => number) {
  const router = Router();

  // A video never transcribed is an empty transcript, never an error.
  router.get("/:videoId", (req, res) => {
    const videoId = VideoId.safeParse(req.params.videoId);
    if (!videoId.success) {
      res.status(400).json({ error: { message: "That isn't a video id." } });
      return;
    }
    res.json({ transcript: shared.transcript(videoId.data) });
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
        if (isTooLarge(err)) res.status(413).json({ error: { message: `That piece is too big: over ${PIECE_MAX_BYTES / MB} MB.` } });
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
        res.status(400).json({ error: { message: nothing ? "A stretch of nothing comes with no sound." : "That isn't a piece of sound." } });
        return;
      }
      const stored = shared.piece(ids.videoId, ids.pieceId);
      if (stored) {
        const answer: PieceResponse = { transcript: shared.transcript(ids.videoId), language: stored.language, verdict: stored.verdict };
        res.json(answer);
        return;
      }
      const userId = signedIn(res).user.id;
      // Listened through and nothing said: heard, so covered, and no engine to ask.
      if (nothing) {
        shared.insertQuiet({ id: ids.pieceId, videoId: ids.videoId, startMs: meta.start, endMs: meta.end, userId }, now());
        const answer: PieceResponse = { transcript: shared.transcript(ids.videoId), language: null, verdict: null };
        res.status(201).json(answer);
        return;
      }
      const { engine } = shared.getTranscription();
      const key = shared.key(engine) ?? engineKeys[engine];
      if (key === null) {
        res.status(409).json({ error: { message: NO_KEY } });
        return;
      }
      // Asked what it hears (`check`), or told Japanese.
      const told = meta.check === "1" ? null : TOLD_JAPANESE;
      let heard: Heard;
      try {
        heard = await engines[engine].transcribe(key, bytes, told);
      } catch (e) {
        if (!(e instanceof EngineError)) throw e;
        res.status(e.status).json({ error: { message: e.message } });
        return;
      }
      // Asked, the engine's answer decides whether the words are kept (written in another language, they aren't) and
      // what the video's language is taken to be, when it heard enough to say. Told Japanese, it heard Japanese.
      const language = told === null ? heard.language : null;
      const verdict = language === null ? null : verdictOf(language, heard.words.length);
      const kept = language === null ? true : keepHeard(language, heard.words.length);
      const at = now();
      shared.insertPiece(
        { id: ids.pieceId, videoId: ids.videoId, heardFrom: meta.start, startMs: meta.sound, endMs: meta.end, engine, userId, told, language, verdict, kept },
        kept ? heard.words.map((w) => ({ text: w.text, startMs: meta.sound + w.startMs, endMs: meta.sound + w.endMs })) : [],
        at,
      );
      const answer: PieceResponse = { transcript: shared.transcript(ids.videoId), language, verdict };
      res.status(201).json(answer);
    },
  );

  // A word put right by hand: kept beside the engine's word, never over it.
  router.post("/:videoId/fixes", (req, res) => {
    const videoId = VideoId.safeParse(req.params.videoId);
    if (!videoId.success) {
      res.status(400).json({ error: { message: "That isn't a video id." } });
      return;
    }
    const parsed = TranscriptFix.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a fix.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    if (!shared.fixWord(videoId.data, parsed.data.wordId, parsed.data.text, signedIn(res).user.id, now())) {
      res.status(404).json({ error: { message: "That word isn't in the transcript." } });
      return;
    }
    res.json({ transcript: shared.transcript(videoId.data) });
  });

  // A transcript forgotten, a stretch of it (ms) or the whole ({}), to be transcribed afresh: everyone's, like a fix;
  // that it costs again is for whoever asks to weigh. Nothing is deleted (`shared.forget`).
  router.post("/:videoId/forget", (req, res) => {
    const videoId = VideoId.safeParse(req.params.videoId);
    if (!videoId.success) {
      res.status(400).json({ error: { message: "That isn't a video id." } });
      return;
    }
    const parsed = TranscriptForget.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a stretch of the video." } });
      return;
    }
    // A stretch, or the whole video (the empty body).
    const stretch = Stretch.safeParse(parsed.data);
    shared.forget(videoId.data, stretch.success ? stretch.data : null, now());
    res.json({ transcript: shared.transcript(videoId.data) });
  });

  return router;
}
