import { Router } from "express";
import { DeckId } from "@panki/contracts";
import type { DbOf } from "../app";

/** `GET /api/stats` for every deck, `?deck=<id>` for one; worked out on every read with the API's clock. */
export function statsRouter(dbOf: DbOf, now: () => number) {
  const router = Router();

  router.get("/", (req, res) => {
    const db = dbOf(res);
    const scope = req.query.deck;
    if (scope === undefined) {
      res.json({ stats: db.stats(null, now()) });
      return;
    }
    const deckId = DeckId.safeParse(scope);
    if (!deckId.success || !db.hasDeck(deckId.data)) {
      res.status(404).json({ error: { message: "That deck doesn't exist." } });
      return;
    }
    res.json({ stats: db.stats(deckId.data, now()) });
  });

  return router;
}
