import assert from "node:assert/strict";
import { test } from "node:test";
import { Card } from "../src/card";
import { defaultLayout } from "../src/cardLayout";
import { cardLighting, keepTight, lighterOf, matchTexts, plainText, rankCards, searchWords } from "../src/textSearch";
import { CardType, type CardField } from "../src/type";

/*
 * How a word typed into a search is found in a card's texts (`textSearch.ts`). Run with `pnpm --dir packages/contracts test`.
 */

/** The match of what's typed on some texts, as a search compares them. */
const match = (query: string, ...texts: string[]) => matchTexts(searchWords(query), texts.map(plainText));
/** The letters lit in a text, joined. */
const litIn = (query: string, text: string, ...more: string[]) =>
  lighterOf(searchWords(query), [text, ...more].map(plainText))(text)
    .filter((run) => run.lit)
    .map((run) => run.text)
    .join("|");

test("romaji is looked for as kana: kaeru finds カエル whole, and never its letters strewn through an English sentence", () => {
  assert.equal(match("kaeru", "Talking about a group of people eating rice"), null);
  assert.equal(match("kaeru", "kxaxexrxu"), null);
  assert.deepEqual(match("kaeru", "カエル"), { score: 3, loose: false });
  assert.deepEqual(match("yobun", "よぶん"), { score: 3, loose: false });
});

test("letters in order: an abbreviation from a word's first letter, inside that word, close together", () => {
  assert.deepEqual(match("lrnng", "Learning"), { score: 1, loose: true });
  // Not from the word's first letter, across a space or punctuation, or strewn too far.
  assert.equal(match("rnng", "learning"), null);
  assert.equal(match("lrnng", "l r n n g"), null);
  assert.equal(match("lrnng", "lr-nng"), null);
  assert.equal(match("lrnng", "lxxxxxxxrnng"), null);
  // Two letters are never looked for in order: they're in nearly every word.
  assert.equal(match("lg", "learning"), null);
});

test("Japanese letters in order stay within a short stretch", () => {
  assert.deepEqual(match("たべる", "たべられる"), { score: 1, loose: true });
  assert.equal(match("たべる", "たべものをかってくる"), null);
  assert.equal(match("たべる", "たべ、る"), null);
});

test("a verb or an adjective typed in its dictionary form finds its other forms, and never another word with its kanji", () => {
  assert.deepEqual(match("行く", "行きます"), { score: 2, loose: false });
  assert.deepEqual(match("食べる", "朝ごはんを食べた"), { score: 2, loose: false });
  assert.equal(match("行く", "銀行"), null);
  assert.equal(match("行く", "行列"), null);
});

test("every word must be found; the card's score is each word's best, added up", () => {
  assert.deepEqual(match("行く 駅", "行く", "駅まで"), { score: 5, loose: false });
  assert.equal(match("行く 猫", "行く", "駅まで"), null);
});

test("loose matches are let go while anything matches whole or in part, and kept when nothing does", () => {
  const tight = { id: "tight", loose: false };
  const loose = { id: "loose", loose: true };
  assert.deepEqual(keepTight([loose, tight]), [tight]);
  assert.deepEqual(keepTight([loose]), [loose]);
});

test("lighting: a word found in part every place it stands; letters in order only in the word they were found in", () => {
  assert.equal(litIn("eat", "eat what you eat"), "eat|eat");
  // L, r and n side by side, n and g: "Talking" and "about" stay unlit.
  assert.equal(litIn("lrnng", "Talking about Learning"), "L|rn|ng");
  assert.equal(litIn("行く", "駅まで行きます"), "行");
  // Found in part elsewhere on the card, a word isn't also lit as scattered letters here.
  assert.equal(litIn("lrnng", "Learning", "lrnng notes"), "");
});

// ---------- Cards: the one search every place uses ----------

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [WORD, MEANING, DECK_A, DECK_B] = [1, 2, 3, 4].map(id) as [string, string, string, string];
const field = (fieldId: string, side: CardField["side"]): CardField => ({ id: fieldId, name: fieldId, kind: "text", side, required: false, tellsApart: false, perExample: false, fills: null });
const FIELDS = [field(WORD, "front"), field(MEANING, "back")];
const TYPE = CardType.parse({ id: id(9), name: "Words", fields: FIELDS, layout: defaultLayout(FIELDS), createdAt: 0, deckCount: 2 });
let made = 100;
const cardOf = (deckId: string, word: string, meaning: string) =>
  Card.parse({ id: id(++made), deckId, values: { [WORD]: word, [MEANING]: meaning }, files: {}, cues: {}, createdAt: made, place: { stageId: null, past: 0, node: [], burned: false }, seen: 0, lastAt: null, dueAt: null, due: false });
const CARDS = [
  cardOf(DECK_A, "行く", "to go"),
  cardOf(DECK_A, "行列", "queue, line"),
  cardOf(DECK_A, "行います", "to carry out"),
  cardOf(DECK_A, "行きます", "go (polite)"),
  cardOf(DECK_A, "learning", "学習"),
  cardOf(DECK_A, "いく", "to go"),
  cardOf(DECK_B, "カエル", "frog"),
];
/** Ranked as a deck's Search ranks its cards, and as every deck's ranks each card with its deck: the same function. */
const ranked = (query: string, cards: readonly Card[]) => rankCards(cards.map((card) => ({ card, type: TYPE, standing: [] })), query).map((found) => found.card.values[WORD]);

test("cards: every word on the card, the best first, ties in the order they came, nothing for nothing typed", () => {
  // 行く whole (3); 行きます and 行います in part by its stem (2), in the order they came.
  assert.deepEqual(ranked("行く", CARDS), ["行く", "行います", "行きます"]);
  assert.deepEqual(ranked("to go", CARDS), ["行く", "いく"]);
  assert.deepEqual(ranked("  ", CARDS), []);
  // The stage's name and how it stands are searched as the app hands them in.
  assert.equal(rankCards([{ card: CARDS[1] as Card, type: TYPE, standing: ["Learning"] }], "learning").length, 1);
});

test("cards: loose matches are shown only when nothing matches whole or in part", () => {
  assert.deepEqual(ranked("lrnng", CARDS), ["learning"]);
  assert.deepEqual(ranked("kaeru", CARDS), ["カエル"]);
  // Learning on a card as its stage's name matches "learning" in part, so the loose one by its letters goes.
  assert.deepEqual(ranked("lrnng learning", CARDS), ["learning"]);
});

test("a deck's search and every deck's give the same cards in the same order for the same cards", () => {
  const deckCards = CARDS.filter((card) => card.deckId === DECK_A);
  for (const query of ["行く", "to go", "go", "lrnng", "kaeru", "い"]) {
    const asDeck = rankCards(
      deckCards.map((card) => ({ card, type: TYPE, standing: [] })),
      query,
    ).map((found) => found.card.id);
    const asEvery = rankCards(
      deckCards.map((card) => ({ card, type: TYPE, standing: [], deck: card.deckId === DECK_A ? "A" : "B" })),
      query,
    ).map((found) => found.card.id);
    assert.deepEqual(asEvery, asDeck, query);
  }
});

test("cards: what was found is lit, and where, when it's on a value the row doesn't draw", () => {
  const lighting = cardLighting({ card: CARDS[3] as Card, type: TYPE, standing: [] }, searchWords("行く"));
  assert.deepEqual(lighting.runs("行きます").filter((run) => run.lit).map((run) => run.text), ["行"]);
  assert.equal(lighting.foundIn, "行きます");
});
