import { Router } from "express";
import { DeckId, type Stats } from "@panki/contracts";
import type { DbOf } from "../app";

/**
 * `GET /api/stats` for every deck, `?deck=<id>` for one; worked out on every read with the API's clock, from the
 * account's own database alone.
 */
export function statsRouter(dbOf: DbOf, now: () => number) {
  const router = Router();

  router.get("/", (req, res) => {
    const db = dbOf(res);
    const scope = req.query.deck;
    let deckId: string | null = null;
    if (scope !== undefined) {
      const parsed = DeckId.safeParse(scope);
      if (!parsed.success || !db.hasDeck(parsed.data)) {
        res.status(404).json({ error: { message: "That deck doesn't exist." } });
        return;
      }
      deckId = parsed.data;
    }
    const stats: Stats = db.stats(deckId, now());
    res.json({ stats });
  });

  return router;
}
