import { Router } from "express";
import { CardsCalled, type AccountCards, type CalledCards, type WordsInCards } from "@panki/contracts";
import type { DbOf } from "../app";

/** The account's cards across its decks; a deck's own cards are under the deck (`decks.ts`). */
export function cardsRouter(dbOf: DbOf, now: () => number) {
  const router = Router();

  // Every living card, deck by deck: the app's search of every deck reads them once as it opens, and searches them there.
  router.get("/", (_req, res) => {
    const answer: AccountCards = { decks: dbOf(res).everyCard(now()) };
    res.json(answer);
  });

  // The cards already called by the words a card is about to be added with (`?word=行く&word=…`): the app's form and
  // the extension's drawer say so before it's added.
  router.get("/called", (req, res) => {
    const raw = req.query.word;
    const parsed = CardsCalled.safeParse({ word: Array.isArray(raw) ? raw : raw === undefined ? [] : [raw] });
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Those words aren't valid." } });
      return;
    }
    const answer: CalledCards = { cards: dbOf(res).cardsCalled(parsed.data.word) };
    res.json(answer);
  });

  // The words every card is called by, each once, those only suspended cards are, and those with a card flagged: the extension marks them in subtitles and on pages.
  router.get("/words", (_req, res) => {
    const answer: WordsInCards = dbOf(res).wordsInCards();
    res.json(answer);
  });

  return router;
}
