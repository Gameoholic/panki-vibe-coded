import type { CalledCard } from "@panki/contracts";
import type { CardsSource } from "../ui/Lookup";

/**
 * A word that stands for one already in the decks wherever the options page shows the pop-up dictionary at work (the
 * Pop-up dictionary layout's sentences, the panels' explainers): on the pop-up it's a card of an example deck, whose
 * Open in Panki opens nothing. Never one of the owner's own cards (the owner, 2026-10-28: "so that I can see it in
 * green… and the 'already in your deck' message").
 */
export const IN_DECKS: CalledCard = {
  cardId: "00000000-0000-4000-8000-000000000001",
  deckId: "00000000-0000-4000-8000-000000000002",
  deck: "Example deck",
  words: "喫茶店",
  apart: [],
};

/** Where the pop-up learns which cards a word already is, on the options page: that one example, and nothing else. */
export const EXAMPLE_CARDS: CardsSource = {
  ask: async (words) => (words.includes(IN_DECKS.words) ? [IN_DECKS] : []),
  open: () => undefined,
};
