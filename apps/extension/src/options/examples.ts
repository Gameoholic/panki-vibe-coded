import type { CalledCard, MeaningAccuracy } from "@panki/contracts";
import type { ExplainExamples } from "../ui/Explain";
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

/**
 * How a made-up answer judges the meanings: the first fits, for its own reason; the two after it, whatever this
 * browser's dictionaries say they are, near and not at all (an index past the word's meanings is left out where it's
 * drawn); one fits, so none of its own.
 */
const judged = (fits: string): { meanings: MeaningAccuracy[]; proposedMeaning: null } => ({
  meanings: [
    { meaning: 1, accuracy: "fits", reason: fits },
    { meaning: 2, accuracy: "close", reason: "Near, but not quite what this sentence says." },
    { meaning: 3, accuracy: "wrong", reason: "Another sense of the word; not this one." },
  ],
  proposedMeaning: null,
});

/**
 * What Panki AI's Explain answers on the options page, never asked of anyone (AI step 2): made-up answers about words of
 * the sentence the pop-up is tried on there, 昨日、駅の近くで新しい喫茶店を見つけました, written as Explain answers
 * (what the word means here, its feel, the grammar around it; never the whole sentence put into English), each with how
 * it judges the meanings. A word with none shows Explain's button.
 */
export const EXAMPLE_EXPLAIN: ExplainExamples = {
  kind: "example",
  answers: [
    {
      term: "見つける",
      text: `Here 見つけました is 見つける, "to find" in the sense of coming across something: the first meaning your dictionary gives. It's a discovery, not the end of a search. They weren't out looking for a café; they happened on a new one near the station.

The ～ました makes it the polite past, the way you'd tell someone about your day when you aren't close, or write it in a diary meant to be read. Among friends it would be 見つけた.

Watch the を just before it: 喫茶店を見つけました, the café is what was found. Its partner 見つかる turns that around (喫茶店が見つかった, "a café turned up"), putting the café first and leaving the finder out.`,
      ...judged("Coming across a new café, not the end of a search."),
    },
    {
      term: "喫茶店",
      text: `喫茶店 (きっさてん) is a café, and the dictionary has it right, but it carries a feel that カフェ doesn't: the older, sit-down kind, with a counter, coffee made slowly, a toast set in the morning, often run by the same owner for decades.

So 新しい喫茶店 is a little interesting: a new place in that old style, or someone who simply calls every café by the older word. In speech and on signs it's often cut to 喫茶.

Here it's what was found: the を after it marks it as the thing 見つけました acts on.`,
      ...judged("The place that was found: a café."),
    },
    {
      term: "昨日",
      text: `昨日 is "yesterday", and here it's read きのう, the everyday reading. さくじつ is the same word in a formal register, heard in the news, business letters and speeches; with the friendly tone of this sentence, きのう is the natural one.

Notice it stands at the very start with only a comma after it, no は or に: time words like 昨日, 今日 and 明日 usually take no particle when they say when something happened.`,
      ...judged("When it happened: the day before today."),
    },
  ],
};
