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
 * server's own (`PANKI_FORVO_KEY`) is used when there's none. Since 2026-10-18 what's fetched is everyone's too: a
 * word's list is asked of Forvo once for all, and a recording is fetched once, kept in the shared store, and copied
 * from there as the file of each account that picks it after. Each card still names a file of its own account's.
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
      res.json({ voices: await forvo.voices(key, word) });
    } catch (e) {
      failed(res, e);
    }
  });

  // A recording kept: fetched once from Forvo for everyone, then each account's file like any other, played from Panki
  // ever after. The same recording asked for again is the file the account already has; one another account picked
  // is copied from the shared store, with no request to Forvo.
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
    let recording = shared.forvoRecording(id);
    if (recording === null) {
      const key = keyOf();
      if (key === null) {
        res.status(409).json({ error: { message: NO_KEY } });
        return;
      }
      try {
        const { bytes, voice } = await forvo.fetch(key, word, id);
        shared.keepForvoRecording(id, { word, by: voice.by, country: voice.country, mime: "audio/mpeg", bytes }, signedIn(res).user.id, now());
        // Two asks for the same recording at once both fetch it; the first one kept is everyone's.
        recording = shared.forvoRecording(id) ?? { word, by: voice.by, country: voice.country, mime: "audio/mpeg", bytes };
      } catch (e) {
        failed(res, e);
        return;
      }
    }
    const { bytes } = recording;
    const mediaId = randomUUID();
    const at = now();
    // The bytes first, then the rows: one that fails part-way leaves nothing that claims a file is there.
    writeMediaFile(mediaDirOf(res), mediaId, bytes);
    db.insertMedia({ id: mediaId, kind: "audio", mime: recording.mime, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, at);
    db.insertForvoRecording({ forvoId: id, word: recording.word, by: recording.by, country: recording.country, mediaId }, at);
    // Two asks for the same recording at once both make a file; the first one kept is the one every later ask gets.
    res.status(201).json({ mediaId: db.forvoRecording(id) ?? mediaId });
  });

  return router;
}
