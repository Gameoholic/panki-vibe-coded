import { createHash, randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { FORVO_WORD_MAX, ForvoTake } from "@panki/contracts";
import type { DbOf } from "../app";
import type { Forvo } from "../forvo";
import { ForvoError } from "../forvo";
import { writeMediaFile } from "../mediaFiles";
import { signedIn } from "../session";
import type { Shared } from "../shared";
import type { MediaDirOf } from "./media";

const NO_KEY = "Add a Forvo key in Panki's Settings.";

/**
 * Word audio from Forvo: a word's recordings, and one of them kept as the account's file. The key is everyone's since
 * 2026-10-17 (the shared store, typed by an admin under Settings → Admin → Word audio: `routes/wordAudio.ts`); the
 * server's own (`PANKI_FORVO_KEY`) is used when there's none. The recordings stay each account's own files.
 */
export function forvoRouter(dbOf: DbOf, mediaDirOf: MediaDirOf, forvo: Forvo, shared: Shared, serverKey: string | null, now: () => number) {
  const router = Router();

  const keyOf = () => shared.key("forvo") ?? serverKey;
  /** Forvo's trouble, in the owner's words; anything else is the error handler's. */
  function failed(res: Response, e: unknown) {
    if (!(e instanceof ForvoError)) throw e;
    res.status(e.status).json({ error: { message: e.message } });
  }

  router.get("/voices", async (req, res) => {
    const word = typeof req.query.word === "string" ? req.query.word.trim() : "";
    if (word === "" || word.length > FORVO_WORD_MAX) {
      res.status(400).json({ error: { message: "That isn't a word to look for." } });
      return;
    }
    const key = keyOf();
    if (key === null) {
      res.status(409).json({ error: { message: NO_KEY } });
      return;
    }
    try {
      res.json({ voices: await forvo.voices(key, signedIn(res).user.id, word) });
    } catch (e) {
      failed(res, e);
    }
  });

  // A recording kept: fetched once from Forvo, then the account's file like any other, played from Panki ever after.
  // The same recording asked for again is the file it already is.
  router.post("/recordings", async (req, res) => {
    const parsed = ForvoTake.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a recording to keep." } });
      return;
    }
    const { word, id } = parsed.data;
    const db = dbOf(res);
    const kept = db.forvoRecording(id);
    if (kept !== null) {
      res.json({ mediaId: kept });
      return;
    }
    const key = keyOf();
    if (key === null) {
      res.status(409).json({ error: { message: NO_KEY } });
      return;
    }
    try {
      const { bytes, voice } = await forvo.fetch(key, signedIn(res).user.id, word, id);
      const mediaId = randomUUID();
      const at = now();
      // The bytes first, then the rows: one that fails part-way leaves nothing that claims a file is there.
      writeMediaFile(mediaDirOf(res), mediaId, bytes);
      db.insertMedia({ id: mediaId, kind: "audio", mime: "audio/mpeg", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, at);
      db.insertForvoRecording({ forvoId: id, word, by: voice.by, country: voice.country, mediaId }, at);
      // Two asks for the same recording at once both fetch it; the first one kept is the one every later ask gets.
      res.status(201).json({ mediaId: db.forvoRecording(id) ?? mediaId });
    } catch (e) {
      failed(res, e);
    }
  });

  return router;
}
