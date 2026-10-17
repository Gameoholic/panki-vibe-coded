import { Router } from "express";
import { CardTypeId, CardTypeUpdate, NewCardType } from "@panki/contracts";
import type { DbOf } from "../app";

export function typesRouter(dbOf: DbOf, now: () => number) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ types: dbOf(res).listTypes() });
  });

  router.post("/", (req, res) => {
    const parsed = NewCardType.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? "That card type isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    res.status(201).json({ type: dbOf(res).insertType(parsed.data, now()) });
  });

  router.patch("/:typeId", (req, res) => {
    const db = dbOf(res);
    const id = CardTypeId.safeParse(req.params.typeId);
    if (!id.success) {
      res.status(400).json({ error: { message: "That card type id isn't valid." } });
      return;
    }
    if (!db.getType(id.data)) {
      res.status(404).json({ error: { message: "That card type doesn't exist." } });
      return;
    }
    const parsed = CardTypeUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? "That card type isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    res.json({ type: db.updateType(id.data, parsed.data, now()) });
  });

  // Delete hides the type; nothing is destroyed. A type a deck still uses stays.
  router.delete("/:typeId", (req, res) => {
    const id = CardTypeId.safeParse(req.params.typeId);
    if (!id.success) {
      res.status(400).json({ error: { message: "That card type id isn't valid." } });
      return;
    }
    const outcome = dbOf(res).removeType(id.data, now());
    if (outcome === "missing") {
      res.status(404).json({ error: { message: "That card type doesn't exist." } });
      return;
    }
    if (outcome === "used") {
      res.status(409).json({ error: { message: "A deck still uses this card type." } });
      return;
    }
    res.status(204).end();
  });

  return router;
}
