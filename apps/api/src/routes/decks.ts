import { Router, type Request, type Response } from "express";
import { CardAnswer, CardId, CardUpdate, DeckId, DeckUpdate, NewCard, NewDeck, NewReviewSession, ReviewSessionEnd, ReviewSessionId, VALUE_MAX, cardProblems, mediaKindsOf, type CardProblem, type CardType, type DeckTwins } from "@panki/contracts";
import type { DbOf } from "../app";
import { signedIn } from "../session";

export function decksRouter(dbOf: DbOf, now: () => number) {
  const router = Router();

  /** The deck in the URL, checked before a route runs; answers the request itself when it's bad. A removed deck doesn't exist here. */
  function deckIdFrom(req: Request, res: Response): string | null {
    const parsed = DeckId.safeParse(req.params.deckId);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That deck id isn't valid." } });
      return null;
    }
    if (!dbOf(res).hasDeck(parsed.data)) {
      res.status(404).json({ error: { message: "That deck doesn't exist." } });
      return null;
    }
    return parsed.data;
  }

  function problemMessage(type: CardType, problem: CardProblem): string {
    const name = type.fields.find((f) => f.id === problem.fieldId)?.name ?? "A field";
    if (problem.problem === "missing") return `${name} can't be empty.`;
    if (problem.problem === "long") return `Keep ${name} under ${VALUE_MAX} characters.`;
    if (problem.problem === "media") return `Panki doesn't have the file for ${name}. Pick it again.`;
    if (problem.problem === "link") return `${name} takes a YouTube link.`;
    return "That field isn't part of this deck's card type.";
  }

  /**
   * What's wrong with the values a card is being given: the type's own rules (`cardProblems`) over the card as it
   * would stand, then the one thing only the API can know, whether each file named in what was sent is really this
   * account's and of its field's kind.
   */
  function firstProblem(res: Response, type: CardType, standing: Record<string, string>, sent: Record<string, string>): CardProblem | null {
    // A field of files or of links may still hold words from before it was one. That's no fault of a change that leaves it alone.
    const problem = cardProblems(type, standing).find((p) => (p.problem !== "media" && p.problem !== "link") || p.fieldId in sent);
    if (problem) return problem;
    const db = dbOf(res);
    for (const field of type.fields) {
      const kinds = mediaKindsOf(field.kind);
      const value = sent[field.id];
      if (kinds.length === 0 || !value) continue;
      const held = db.getMedia(value);
      if (!held || !kinds.includes(held.kind)) return { fieldId: field.id, problem: "media" };
    }
    return null;
  }

  /** The card type of the deck in the URL; answers the request itself when it's missing. */
  function typeOfDeck(res: Response, deckId: string): CardType | null {
    const db = dbOf(res);
    const typeId = db.deckTypeId(deckId);
    const type = typeId === null ? null : db.getType(typeId);
    if (!type) res.status(500).json({ error: { message: "This deck's card type is missing." } });
    return type;
  }

  router.get("/", (_req, res) => {
    res.json({ decks: dbOf(res).listDecks(now()) });
  });

  router.post("/", (req, res) => {
    const db = dbOf(res);
    const parsed = NewDeck.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That deck isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    if (!db.getType(parsed.data.typeId)) {
      res.status(400).json({ error: { message: "That card type doesn't exist.", path: ["typeId"] } });
      return;
    }
    if (!db.getSrsType(parsed.data.srsTypeId)) {
      res.status(400).json({ error: { message: "That SRS type doesn't exist.", path: ["srsTypeId"] } });
      return;
    }
    res.status(201).json({ deck: db.insertDeck(parsed.data, now()) });
  });

  router.patch("/:deckId", (req, res) => {
    const db = dbOf(res);
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const parsed = DeckUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That change isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    if (parsed.data.srsTypeId !== undefined && !db.getSrsType(parsed.data.srsTypeId)) {
      res.status(400).json({ error: { message: "That SRS type doesn't exist.", path: ["srsTypeId"] } });
      return;
    }
    res.json({ deck: db.updateDeck(deckId, parsed.data, now()) });
  });

  // Delete hides the deck and its cards; nothing is destroyed. Doing it twice is fine: the first removal time stays.
  router.delete("/:deckId", (req, res) => {
    const parsed = DeckId.safeParse(req.params.deckId);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That deck id isn't valid." } });
      return;
    }
    if (!dbOf(res).removeDeck(parsed.data, now())) {
      res.status(404).json({ error: { message: "That deck doesn't exist." } });
      return;
    }
    res.status(204).end();
  });

  router.get("/:deckId/cards", (req, res) => {
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    res.json({ cards: dbOf(res).listCards(deckId, now()) });
  });

  // The deck's duplicates: each of its cards called the same as another card in any deck, with those others. The
  // deck's list marks them.
  router.get("/:deckId/twins", (req, res) => {
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const answer: DeckTwins = { twins: dbOf(res).deckTwins(deckId) };
    res.json(answer);
  });

  router.post("/:deckId/cards", (req, res) => {
    const db = dbOf(res);
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const parsed = NewCard.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That card isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const type = typeOfDeck(res, deckId);
    if (!type) return;
    const problem = firstProblem(res, type, parsed.data.values, parsed.data.values);
    if (problem) {
      res.status(400).json({ error: { message: problemMessage(type, problem), path: ["values", problem.fieldId] } });
      return;
    }
    res.status(201).json({ card: db.insertCard(deckId, parsed.data, now()) });
  });

  // A card's text changed after it was made. The card as it would then stand is held to its type's rules, as a new one
  // is; every value that really changes keeps what it was.
  router.patch("/:deckId/cards/:cardId", (req, res) => {
    const db = dbOf(res);
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const cardId = CardId.safeParse(req.params.cardId);
    if (!cardId.success) {
      res.status(400).json({ error: { message: "That card id isn't valid." } });
      return;
    }
    const parsed = CardUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That change isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const card = db.getCard(deckId, cardId.data, now());
    if (!card) {
      res.status(404).json({ error: { message: "That card isn't in this deck." } });
      return;
    }
    const type = typeOfDeck(res, deckId);
    if (!type) return;
    // Only the type's own fields are weighed: what a card holds in a field since hidden stays as it is, out of reach.
    const standing = Object.fromEntries(type.fields.map((f) => [f.id, card.values[f.id] ?? ""]));
    const problem = firstProblem(res, type, { ...standing, ...parsed.data.values }, parsed.data.values);
    if (problem) {
      res.status(400).json({ error: { message: problemMessage(type, problem), path: ["values", problem.fieldId] } });
      return;
    }
    const saved = db.updateCard(deckId, cardId.data, parsed.data, now());
    if (!saved) {
      res.status(404).json({ error: { message: "That card isn't in this deck." } });
      return;
    }
    res.json({ card: saved });
  });

  // Delete hides the card; nothing is destroyed: its values, its answers and its place stay, with the time it left.
  // Doing it twice is fine: the first removal time stays.
  router.delete("/:deckId/cards/:cardId", (req, res) => {
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const cardId = CardId.safeParse(req.params.cardId);
    if (!cardId.success) {
      res.status(400).json({ error: { message: "That card id isn't valid." } });
      return;
    }
    if (!dbOf(res).removeCard(deckId, cardId.data, now())) {
      res.status(404).json({ error: { message: "That card isn't in this deck." } });
      return;
    }
    res.status(204).end();
  });

  // An answer is recorded where it happened; the API's clock stamps it and the deck's type, as it is now, decides the outcome.
  router.post("/:deckId/cards/:cardId/answers", (req, res) => {
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const cardId = CardId.safeParse(req.params.cardId);
    if (!cardId.success) {
      res.status(400).json({ error: { message: "That card id isn't valid." } });
      return;
    }
    const parsed = CardAnswer.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That answer isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const outcome = dbOf(res).answerCard(deckId, cardId.data, parsed.data, now());
    if (outcome === "no-card") {
      res.status(404).json({ error: { message: "That card isn't in this deck." } });
      return;
    }
    if (outcome === "no-answer") {
      res.status(400).json({ error: { message: "That answer isn't one of this deck's.", path: ["answerId"] } });
      return;
    }
    if (outcome === "no-session") {
      res.status(400).json({ error: { message: "That review isn't one of this deck's.", path: ["sessionId"] } });
      return;
    }
    res.json({ card: outcome });
  });

  // A card put aside (buried or suspended) brought back into reviews. The hold's row stays, with the time it was lifted;
  // doing it again, or to a card that isn't put aside, changes nothing.
  router.delete("/:deckId/cards/:cardId/hold", (req, res) => {
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const cardId = CardId.safeParse(req.params.cardId);
    if (!cardId.success) {
      res.status(400).json({ error: { message: "That card id isn't valid." } });
      return;
    }
    const card = dbOf(res).liftHold(deckId, cardId.data, now());
    if (!card) {
      res.status(404).json({ error: { message: "That card isn't in this deck." } });
      return;
    }
    res.json({ card });
  });

  // A sitting with the deck. The browser mints the id, so a retried start returns the one already running.
  router.post("/:deckId/sessions", (req, res) => {
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const parsed = NewReviewSession.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That review isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const { device, userAgent } = signedIn(res);
    const session = dbOf(res).insertReviewSession(deckId, parsed.data, { device, userAgent }, now());
    if (!session) {
      res.status(409).json({ error: { message: "That review belongs to another deck." } });
      return;
    }
    res.status(201).json({ session });
  });

  router.patch("/:deckId/sessions/:sessionId", (req, res) => {
    const db = dbOf(res);
    const deckId = deckIdFrom(req, res);
    if (!deckId) return;
    const sessionId = ReviewSessionId.safeParse(req.params.sessionId);
    if (!sessionId.success) {
      res.status(400).json({ error: { message: "That review id isn't valid." } });
      return;
    }
    const parsed = ReviewSessionEnd.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That ending isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    if (parsed.data.cardId !== undefined && !db.getCard(deckId, parsed.data.cardId, now())) {
      res.status(400).json({ error: { message: "That card isn't in this deck.", path: ["cardId"] } });
      return;
    }
    const session = db.endReviewSession(deckId, sessionId.data, parsed.data, now());
    if (!session) {
      res.status(404).json({ error: { message: "That review isn't one of this deck's." } });
      return;
    }
    res.json({ session });
  });

  return router;
}
