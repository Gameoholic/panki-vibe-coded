import { Router } from "express";
import { DeckId, FrameUnit, StatFrame, type FrameWay, type Stats } from "@panki/contracts";
import type { DbOf } from "../app";

/**
 * `GET /api/stats` for every deck, `?deck=<id>` for one; `&last=3&unit=week` adds that custom frame over the past
 * (`Stats.custom`), `&next=3&unit=week` the frame ahead (`Stats.customAhead`), the days named by the API's clock.
 * Worked out on every read from the account's own database alone; nothing kept of a frame.
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
    let frame: { way: FrameWay; frame: StatFrame } | null = null;
    const way: FrameWay | null = req.query.last !== undefined ? "last" : req.query.next !== undefined ? "next" : null;
    if (way !== null) {
      const unit = FrameUnit.safeParse(req.query.unit);
      const parsed = StatFrame.safeParse({ n: Number(req.query[way]), unit: unit.success ? unit.data : undefined });
      if (!parsed.success || (req.query.last !== undefined && req.query.next !== undefined)) {
        res.status(400).json({ error: { message: "That time frame isn't valid.", path: parsed.success ? [] : (parsed.error.issues[0]?.path ?? []) } });
        return;
      }
      frame = { way, frame: parsed.data };
    }
    const stats: Stats = db.stats(deckId, now(), frame);
    res.json({ stats });
  });

  return router;
}
