import { Router } from "express";
import { SettingsUpdate } from "@panki/contracts";
import type { DbOf } from "../app";

export function settingsRouter(dbOf: DbOf, now: () => number) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ settings: dbOf(res).getSettings() });
  });

  router.patch("/", (req, res) => {
    const parsed = SettingsUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That setting isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    res.json({ settings: dbOf(res).updateSettings(parsed.data, now()) });
  });

  return router;
}
