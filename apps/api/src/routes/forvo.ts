import { createHash, randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import { FORVO_WORD_MAX, ForvoTake, type ForvoVoice } from "@panki/contracts";
import type { DbOf } from "../app";
import type { Forvo } from "../forvo";
import { ForvoError, KEPT_PER_WORD, voiceOf } from "../forvo";
import { writeMediaFile } from "../mediaFiles";
import { signedIn } from "../session";
import type { Shared } from "../shared";
import type { MediaDirOf } from "./media";

const NO_KEY = "Add a Forvo key in Panki's Settings.";

/**
 * Word audio from Forvo: a word's recordings, and one of them kept as the account's file. The key is everyone's since
 * 2026-10-17 (the shared store, typed by an admin under Settings → Admin → Word audio: `routes/wordAudio.ts`); the
 * server's own (`PANKI_FORVO_KEY`) is used when there's none.
 *
 * **What's asked of Forvo is kept on disk for everyone, for good** (the owner, 2026-10-18: "saved on disk globally,
 * cached forever so we never go to the API for a word we already asked for in the past"). The first time a word is
 * asked for, its list is fetched and so are its best liked recordings (`KEPT_PER_WORD`) at once, while the list's
 * links still work, and all of it is kept in the shared store; every ask for that word after, by anyone, is answered
 * from there with no request to Forvo, whichever recording is picked. A recording picked becomes a copy in the
 * account's own files, which its card names.
 */
export function forvoRouter(dbOf: DbOf, mediaDirOf: MediaDirOf, forvo: Forvo, shared: Shared, serverKey: string | null, now: () => number) {
  const router = Router();

  const keyOf = () => shared.key("forvo") ?? serverKey;
  /** Forvo's trouble, in the owner's words; anything else is the error handler's. */
  function failed(res: Response, e: unknown) {
    if (!(e instanceof ForvoError)) throw e;
    res.status(e.status).json({ error: { message: e.message } });
  }

  /**
   * A word's list asked of Forvo, its recordings fetched and every one kept for everyone, then the list as kept: only
   * the recordings that came, best liked first. A recording someone kept already isn't fetched again. When none of a
   * word's recordings came, nothing is kept, so the word is asked for afresh next time; a word Forvo has none of is
   * kept as having none.
   */
  async function ask(key: string, word: string, userId: string): Promise<ForvoVoice[]> {
    const items = (await forvo.list(key, word)).slice(0, KEPT_PER_WORD);
    const came = await Promise.all(
      items.map(async (item) => {
        if (shared.hasForvoRecording(item.id)) return item;
        try {
          const bytes = await forvo.download(item);
          shared.keepForvoRecording(item.id, { word, by: item.username, country: item.country, mime: "audio/mpeg", bytes }, userId, now());
          return item;
        } catch (e) {
          if (!(e instanceof ForvoError)) throw e;
          return null;
        }
      }),
    );
    const voices = came.flatMap((item) => (item ? [voiceOf(item)] : []));
    if (items.length > 0 && voices.length === 0) throw new ForvoError("Forvo didn't send its recordings.", 502);
    shared.keepForvoWord(word, voices, userId, now());
    // Two asks for the same word at once both fetch it; the first one kept is everyone's.
    return shared.forvoWord(word) ?? voices;
  }

  router.get("/voices", async (req, res) => {
    const word = typeof req.query.word === "string" ? req.query.word.trim() : "";
    if (word === "" || word.length > FORVO_WORD_MAX) {
      res.status(400).json({ error: { message: "That isn't a word to look for." } });
      return;
    }
    const kept = shared.forvoWord(word);
    if (kept !== null) {
      res.json({ voices: kept });
      return;
    }
    const key = keyOf();
    if (key === null) {
      res.status(409).json({ error: { message: NO_KEY } });
      return;
    }
    try {
      res.json({ voices: await ask(key, word, signedIn(res).user.id) });
    } catch (e) {
      failed(res, e);
    }
  });

  // A recording picked: the account's file, a copy of everyone's kept one. The same recording picked again is the file
  // the account already has.
  router.post("/recordings", (req, res) => {
    const parsed = ForvoTake.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a recording to keep." } });
      return;
    }
    const { id } = parsed.data;
    const db = dbOf(res);
    const own = db.forvoRecording(id);
    if (own !== null) {
      res.json({ mediaId: own });
      return;
    }
    // Every recording the drawer offers was kept with its word's list.
    const recording = shared.forvoRecording(id);
    if (recording === null) {
      res.status(404).json({ error: { message: "That recording isn't kept." } });
      return;
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
