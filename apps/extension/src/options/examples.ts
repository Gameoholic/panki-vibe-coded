import { EXAMPLE_ANSWERS, IN_DECKS } from "@web/explainers/examples";
import { tintOf } from "../capture/known";
import { paintCss, type MarkPaint } from "../seekLook";
import type { ExplainExamples } from "../ui/Explain";
import type { CardsSource } from "../ui/Lookup";

/** The example word's tint as this browser marks a word that's in the decks: its example stage's colour By stage, else the one colour chosen. */
export const exampleTint = (known: { byStage: boolean; colour: MarkPaint }): string => tintOf(known.byStage ? (IN_DECKS.stage?.colour ?? paintCss("accent")) : paintCss(known.colour));

/**
 * The options page's own ways of showing the Word pop-up at work, made of the examples' one home (the web's
 * `explainers/examples.ts`, which Settings → Panki AI's explainers draw from too).
 */

/** Where the pop-up learns which cards a word already is, on the options page: the example word, and nothing else. */
export const EXAMPLE_CARDS: CardsSource = {
  ask: async (words) => (words.includes(IN_DECKS.words) ? [IN_DECKS] : []),
  open: () => undefined,
};

/** What Panki AI's Explain answers on the options page: the made-up answers, never asked of anyone. A word with none shows Explain's button. */
export const EXAMPLE_EXPLAIN: ExplainExamples = { kind: "example", answers: EXAMPLE_ANSWERS };
