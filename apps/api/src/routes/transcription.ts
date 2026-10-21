import { Router, type Response } from "express";
import { EngineId, EngineKeyUpdate, TranscriptionUpdate, type TranscriptionStatus } from "@panki/contracts";
import type { DbOf } from "../app";
import { requireAdmin, signedIn } from "../session";
import type { Shared } from "../shared";
import { EngineError, type Engines } from "../transcribe/engines";

const NO_KEY = "Add a key for the engine in Settings → Admin.";

/**
 * How transcribing runs, for everyone: the settings, whose key the chosen engine has (the key itself to an admin), how
 * much sound has been sent so far, what a whole-video download takes and costs as measured so far, and the engine's
 * account behind the key. Read by anyone signed in but the account; changed by an admin alone.
 */
export function transcriptionRouter(dbOf: DbOf, shared: Shared, engines: Engines, engineKeys: Record<EngineId, string | null>, now: () => number) {
  const router = Router();

  // The key typed in Settings goes back to an admin, to see what's there; the server's own never does, nor anything to anyone else.
  // `own` is the language the one asking has their videos transcribed in.
  const statusOf = (res: Response): TranscriptionStatus => {
    const settings = shared.getTranscription();
    const saved = shared.key(settings.engine);
    const key = saved !== null ? "settings" : engineKeys[settings.engine] !== null ? "server" : null;
    return {
      settings,
      key,
      ...(saved !== null && signedIn(res).user.admin ? { saved } : {}),
      seconds: shared.secondsTranscribed(),
      estimate: shared.estimate(settings.engine, now()),
      own: dbOf(res).getSettings().language,
    };
  };

  router.get("/", (_req, res) => {
    res.json({ transcription: statusOf(res) });
  });

  // The engine's account as the engine tells of it, asked afresh each time: the plan, the credits of the period, the
  // pay-as-you-go so far. For an admin alone; the key an admin typed, or the server's own.
  router.get("/account", requireAdmin, async (_req, res) => {
    const { engine } = shared.getTranscription();
    const key = shared.key(engine) ?? engineKeys[engine];
    if (key === null) {
      res.status(409).json({ error: { message: NO_KEY } });
      return;
    }
    try {
      res.json({ account: await engines[engine].account(key) });
    } catch (e) {
      if (!(e instanceof EngineError)) throw e;
      res.status(e.status).json({ error: { message: e.message } });
    }
  });

  router.patch("/", requireAdmin, (req, res) => {
    const parsed = TranscriptionUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That setting isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    // The mode everyone starts on is never one that's switched off: made the default, it's switched on with it.
    const patch = parsed.data;
    const merged = { ...shared.getTranscription(), ...patch };
    if (merged.modesOff.includes(merged.mode)) patch.modesOff = merged.modesOff.filter((mode) => mode !== merged.mode);
    shared.updateTranscription(patch, now(), signedIn(res).user.id);
    res.json({ transcription: statusOf(res) });
  });

  // An engine's key, typed once and never shown again; null forgets it.
  router.put("/keys/:engineId", requireAdmin, (req, res) => {
    const engine = EngineId.safeParse(req.params.engineId);
    if (!engine.success) {
      res.status(400).json({ error: { message: "That engine doesn't exist." } });
      return;
    }
    const parsed = EngineKeyUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a key.", path: ["key"] } });
      return;
    }
    shared.setKey(engine.data, parsed.data.key, now(), signedIn(res).user.id);
    res.json({ transcription: statusOf(res) });
  });

  return router;
}
