import { Router, type Response } from "express";
import { WORD_AUDIO_SOURCES, WordAudioKeyUpdate, WordAudioSourceId, WordAudioUpdate, type WordAudioStatus } from "@panki/contracts";
import { requireAdmin, signedIn } from "../session";
import type { Shared } from "../shared";

/**
 * Where word audio comes from, for everyone: the source (Forvo, and whatever joins it), whose key it has, and, for an
 * admin, the key itself and the day's requests against the source's allowance. Read by anyone signed in; changed by
 * an admin alone. The sources' own routes (a word's recordings, keeping one) are theirs: `routes/forvo.ts`.
 */
export function wordAudioRouter(shared: Shared, serverKeys: Record<WordAudioSourceId, string | null>, now: () => number) {
  const router = Router();

  // The key typed in Settings goes back to an admin, to see what's there, with the day's count of requests (since
  // midnight UTC: Forvo doesn't say when its day turns); the server's own key never does, nor anything to anyone else.
  const statusOf = (res: Response): WordAudioStatus => {
    const settings = shared.getWordAudio();
    const saved = shared.key(settings.source);
    const admin = signedIn(res).user.admin;
    const midnight = new Date(now()).setUTCHours(0, 0, 0, 0);
    return {
      settings,
      key: saved !== null ? "settings" : serverKeys[settings.source] !== null ? "server" : null,
      ...(saved !== null && admin ? { saved } : {}),
      ...(admin && WORD_AUDIO_SOURCES[settings.source].dailyLimit !== null ? { calls: shared.callsSince(settings.source, midnight) } : {}),
    };
  };

  router.get("/", (_req, res) => {
    res.json({ wordAudio: statusOf(res) });
  });

  router.patch("/", requireAdmin, (req, res) => {
    const parsed = WordAudioUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That setting isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    shared.updateWordAudio(parsed.data, now());
    res.json({ wordAudio: statusOf(res) });
  });

  // A source's key, typed once; null forgets it.
  router.put("/keys/:sourceId", requireAdmin, (req, res) => {
    const source = WordAudioSourceId.safeParse(req.params.sourceId);
    if (!source.success) {
      res.status(400).json({ error: { message: "That source doesn't exist." } });
      return;
    }
    const parsed = WordAudioKeyUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a key.", path: ["key"] } });
      return;
    }
    shared.setKey(source.data, parsed.data.key, now());
    res.json({ wordAudio: statusOf(res) });
  });

  return router;
}
