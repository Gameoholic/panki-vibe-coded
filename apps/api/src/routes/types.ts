import { Router } from "express";
import { CardTypeId, CardTypeUpdate, NewCardType, holdsWords, type CardField } from "@panki/contracts";
import type { DbOf } from "../app";

/** A main field must be one of the fields sent, and one that holds words: it's what cards are called by. */
function mainFieldWrong(fields: readonly CardField[], mainField: string | null | undefined): boolean {
  if (!mainField) return false;
  const field = fields.find((f) => f.id === mainField);
  return !field || !holdsWords(field.kind);
}
const MAIN_FIELD_WRONG = "The main field must be one of the type's fields that holds words.";

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
    if (mainFieldWrong(parsed.data.fields, parsed.data.mainField)) {
      res.status(400).json({ error: { message: MAIN_FIELD_WRONG, path: ["mainField"] } });
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
    if (mainFieldWrong(parsed.data.fields, parsed.data.mainField)) {
      res.status(400).json({ error: { message: MAIN_FIELD_WRONG, path: ["mainField"] } });
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
