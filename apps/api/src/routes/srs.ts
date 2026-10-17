import { Router } from "express";
import { NewSrsType, SrsTypeId, SrsTypeUpdate, type SrsType } from "@panki/contracts";
import type { DbOf } from "../app";

/** Which stage still needs a move, by the name the owner sees: its own, or "Stage N" by its place on the ladder. */
function movesMessage(type: SrsType, needsMoves: Record<string, number>): string {
  const first = Object.entries(needsMoves)[0];
  if (!first) return "Say where the cards go.";
  const [stageId, count] = first;
  const i = type.stages.findIndex((s) => s.id === stageId);
  const name = type.stages[i]?.name || `Stage ${i + 1}`;
  return count === 1 ? `1 card sits on ${name}. Say where it goes.` : `${count} cards sit on ${name}. Say where they go.`;
}

export function srsRouter(dbOf: DbOf, now: () => number) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ types: dbOf(res).listSrsTypes() });
  });

  router.post("/", (req, res) => {
    const parsed = NewSrsType.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? "That SRS type isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    res.status(201).json({ type: dbOf(res).insertSrsType(parsed.data, now()) });
  });

  router.patch("/:typeId", (req, res) => {
    const db = dbOf(res);
    const id = SrsTypeId.safeParse(req.params.typeId);
    if (!id.success) {
      res.status(400).json({ error: { message: "That SRS type id isn't valid." } });
      return;
    }
    const current = db.getSrsType(id.data);
    if (!current) {
      res.status(404).json({ error: { message: "That SRS type doesn't exist." } });
      return;
    }
    // The types that come with the app are for looking at and copying; a change to one is refused here, whatever the screen allows.
    if (current.builtin) {
      res.status(409).json({ error: { message: "This SRS type comes with Panki and can't be changed. Start a new type from it." } });
      return;
    }
    const parsed = SrsTypeUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? "That SRS type isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    // A move has to land on a stage that stays; only the whole update in hand says which those are.
    const staying = new Set(parsed.data.stages.map((s) => s.id));
    if (Object.values(parsed.data.moves ?? {}).some((to) => !staying.has(to))) {
      res.status(400).json({ error: { message: "Cards can only move to a stage that stays.", path: ["moves"] } });
      return;
    }
    const outcome = db.updateSrsType(id.data, parsed.data, now());
    if ("needsMoves" in outcome) {
      res.status(409).json({ error: { message: movesMessage(current, outcome.needsMoves), needsMoves: outcome.needsMoves } });
      return;
    }
    res.json({ type: outcome });
  });

  // Delete hides the type; nothing is destroyed. A type a deck still uses stays.
  router.delete("/:typeId", (req, res) => {
    const id = SrsTypeId.safeParse(req.params.typeId);
    if (!id.success) {
      res.status(400).json({ error: { message: "That SRS type id isn't valid." } });
      return;
    }
    const outcome = dbOf(res).removeSrsType(id.data, now());
    if (outcome === "missing") {
      res.status(404).json({ error: { message: "That SRS type doesn't exist." } });
      return;
    }
    if (outcome === "builtin") {
      res.status(409).json({ error: { message: "This SRS type comes with Panki and stays." } });
      return;
    }
    if (outcome === "used") {
      res.status(409).json({ error: { message: "A deck still uses this SRS type." } });
      return;
    }
    res.status(204).end();
  });

  return router;
}
