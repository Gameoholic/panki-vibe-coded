import { Router, type Response } from "express";
import { SettingsUpdate } from "@panki/contracts";
import type { DbOf } from "../app";

/** The account's own settings, every one of them its own: its time zone and its transcription language too, nothing Panki-wide (2026-10-21). */
export function settingsRouter(dbOf: DbOf, now: () => number) {
  const router = Router();

  const answer = (res: Response) => ({ settings: dbOf(res).getSettings() });

  router.get("/", (_req, res) => {
    res.json(answer(res));
  });

  router.patch("/", (req, res) => {
    const parsed = SettingsUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That setting isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    dbOf(res).updateSettings(parsed.data, now());
    res.json(answer(res));
  });

  return router;
}
