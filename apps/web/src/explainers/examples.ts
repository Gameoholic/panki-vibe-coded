/** @panki The made-up examples Panki's features are shown at work with (`IN_DECKS`, `EXAMPLE_SENTENCE`, `EXAMPLE_TRANSCRIPT`, `EXAMPLE_ANSWERS`). Never the account's own cards. */
import { STAGE_RAMP, type CalledCard, type JudgedMeaning, type ProposedMeaning } from "@panki/contracts";

/**
 * The made-up examples Panki shows its features at work with, one home: the extension's options page (the Pop-up
 * dictionary layout's sentences, its panels' explainers) and Settings → Panki AI's explainers alike. Never one of the
 * account's own cards, and never asked of anyone.
 */

/**
 * A word that stands for one already in the decks wherever the Word pop-up is shown at work: on the pop-up it's a
 * card of an example deck, whose Open in Panki opens nothing, so the word's highlight and the
 * "already in your decks" message are seen at work, on Panki Default's Familiar 1 in its colour. The drawer at work adds
 * its card to the same deck.
 */
export const IN_DECKS: CalledCard = {
  cardId: "00000000-0000-4000-8000-000000000001",
  deckId: "00000000-0000-4000-8000-000000000002",
  deck: "Example deck",
  words: "喫茶店",
  apart: [],
  flagged: false,
  stage: { name: "Familiar 1", colour: STAGE_RAMP[1], again: false },
};

/** The sentence the examples' words stand in: on a page, in a video's subtitles. */
export const EXAMPLE_SENTENCE = "昨日、駅の近くで新しい喫茶店を見つけました";

/**
 * A made-up video's Panki subtitles as the engine heard them, for Proofread at work (AI step 6): a line its parts in
 * order, words as heard, and where a word was misheard for its sound, what Proofread puts in its place and why.
 */
export type HeardPart = string | { heard: string; proofread: string; reason: string };
export const EXAMPLE_TRANSCRIPT: readonly (readonly HeardPart[])[] = [
  ["京都で有名な", { heard: "末茶", proofread: "抹茶", reason: "A Kyoto shop known for 抹茶, powdered green tea; 末茶 isn't a word." }, "のお店に行ってきました"],
  ["お茶を点てる", { heard: "体系", proofread: "体験", reason: "体験, a hands-on experience, fits making tea; 体系 is a system." }, "もできて"],
  ["思ったより", { heard: "以外", proofread: "意外", reason: "意外と, surprisingly, after 思ったより; 以外 means other than." }, "と簡単でした"],
];

/** A made-up Explain answer, by the dictionary form of the word it's about, with how it judges each meaning. */
export type ExampleAnswer = { term: string; text: string; meanings: readonly JudgedMeaning[]; proposedMeaning: ProposedMeaning | null };

/**
 * How a made-up answer judges the meanings: the first fits, for its own reason; the two after it, whatever the
 * dictionaries say they are, near and not at all (an index past the word's meanings is left out where it's drawn); one
 * fits, so none of its own.
 */
const judged = (fits: string): Pick<ExampleAnswer, "meanings" | "proposedMeaning"> => ({
  meanings: [
    { meaning: 1, judgement: "good", reason: fits },
    { meaning: 2, judgement: "meh", reason: "Near, but not quite what this sentence says." },
    { meaning: 3, judgement: "bad", reason: "Another sense of the word; not this one." },
  ],
  proposedMeaning: null,
});

/**
 * What Panki AI's Explain answers in the examples (AI step 2): about words of `EXAMPLE_SENTENCE`, written as Explain
 * answers (what the word means here, its feel, the grammar around it; never the whole sentence put into English), each
 * with how it judges the meanings.
 */
export const EXAMPLE_ANSWERS: readonly ExampleAnswer[] = [
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
];
