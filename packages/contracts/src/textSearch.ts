/** @panki Searching cards, the one function every place uses (`rankCards`, `cardLighting`), and how a word is found in text (`searchWords`, `matchTexts`, `lighterOf`). */
import type { Card } from "./card";
import { examplesText } from "./examples";
import { kanaOf, looksLikeRomaji } from "./romaji";
import { holdsExamples, holdsFile, metaOf, type CardType } from "./type";

/**
 * Searching cards is this one function, `rankCards`, wherever cards are searched (a deck's Search, every deck's from
 * the palette), with `cardLighting` for what it found: what's searched on a card, how each word is found, how cards
 * rank and how ties fall are decided here alone, so a change here changes every search at once. Never a second loop.
 *
 * What's searched on a card (`cardTextsOf`): every field's words (a video's title and channel for a field that holds
 * one; Example sentences by their lines, never the JSON they're kept as), its other examples' too, and the words of
 * where it stands, which the app says and hands in (`SearchedCard.standing`: its stage's name, snoozed, flagged).
 *
 * How a word typed into a search is found in a text. Each word of what's typed must be found in one of a card's texts:
 *
 * - **Whole** (3): the text is the word.
 * - **In part** (2): the text holds the word. A word typed with a kanji and ending in hiragana (a verb or an adjective
 *   in its dictionary form, 行く, 食べる, 美しい) is also found in part as its stem followed by any hiragana, so 行く finds
 *   行きます and 行った, never 銀行 or 行列.
 * - **Letters in order** (1): the word's letters, others between them, all inside one word of the text: never across a
 *   space or punctuation, starting at a Latin word's first letter (an abbreviation, "lrnng" for Learning), and spanning
 *   at most `SCATTER_SPAN` times the letters typed (Japanese has no spaces, so that span is what keeps it to a word or
 *   so). Only words of `SCATTER_MIN` letters or more are looked for so.
 *
 * Katakana and hiragana count as one, as do full- and half-width letters and capitals (`plainText`). A word typed in
 * romaji is also looked for as the hiragana it reads as ("yobun" finds よぶん; one typed part-way, "yob", as far as it
 * goes), and then only that hiragana is looked for as letters in order, never the Latin letters: romaji is typed to
 * find Japanese, and its letters scattered through an English sentence ("kaeru" in "Talking about a group…") are never
 * what was meant. A card matched only by letters in order for some word is loose (`keepTight`): shown only when no card
 * matches every word whole or in part, since letters in order are for an abbreviation or a slip, and beside the word
 * really there they're noise.
 */

const WHOLE = 3;
const PART = 2;
const SCATTERED = 1;
/** The fewest letters a word is looked for in order with: one or two letters in order are in nearly every word. */
const SCATTER_MIN = 3;
/**
 * How far letters in order may stretch, as a multiple of the letters typed: "lrnng" (5) in "learning" (8) fits within
 * 10, たべる in たべられる within 6, while letters strewn across a sentence never fit.
 */
const SCATTER_SPAN = 2;

/** Words as they're compared: full- and half-width alike (NFKC), no capitals, katakana as hiragana. */
export function plainText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60));
}

/** A word of what's typed as it's looked for: whole or in part as any of `forms`, its `stem` before hiragana, in order as any of `scatters`. */
export type SearchWord = { forms: readonly string[]; stem: string | null; scatters: readonly string[] };
export type SearchWords = readonly SearchWord[];

const HAN = /\p{Script=Han}/u;
const HIRAGANA = /[ぁ-ゖ]/;
/** A word of a text: letters with no space, punctuation or symbol among them. */
const WORD_IN_TEXT = /[^\s\p{P}\p{S}]+/gu;
const LATIN_START = /^[a-z0-9]/;
const lettersOf = (word: string) => [...word].length;

function searchWordOf(word: string): SearchWord {
  let forms = [word];
  let scatters = [word];
  if (looksLikeRomaji(word)) {
    // One still being typed ends in a letter or two that are no syllable yet ("yob", "kish"): it's looked for as far as
    // it reads ("よ", "き"). Only those last letters are let go, so a word that isn't romaji doesn't shrink to a kana or two.
    const typing = /^(.+?)[^aiueo'-]{1,2}$/.exec(word)?.[1];
    const kana = kanaOf(word) ?? (typing ? kanaOf(typing) : null);
    if (kana) {
      forms = [word, kana];
      scatters = [kana];
    }
  }
  const stem = word.slice(0, -1);
  const inflects = lettersOf(word) >= 2 && HAN.test(stem) && HIRAGANA.test(word.slice(-1));
  return { forms, stem: inflects ? stem : null, scatters: scatters.filter((form) => lettersOf(form) >= SCATTER_MIN) };
}

/** What's typed as it's looked for, a word at a time; none for nothing typed. */
export function searchWords(query: string): SearchWords {
  return plainText(query)
    .split(/\s+/)
    .filter((word) => word !== "")
    .map(searchWordOf);
}

/** Where a stem stands in a text with hiragana right after it, each place's start. */
function stemsAt(stem: string, text: string): number[] {
  const at: number[] = [];
  for (let i = text.indexOf(stem); i >= 0; i = text.indexOf(stem, i + 1)) {
    if (HIRAGANA.test(text.charAt(i + stem.length))) at.push(i);
  }
  return at;
}

/** Where a form's letters stand in order inside one word of a text (`SearchWord`'s rules), each letter's place; null when they don't. */
function scatteredAt(form: string, text: string): number[] | null {
  const letters = [...form];
  const first = letters[0];
  if (first === undefined) return null;
  const most = letters.length * SCATTER_SPAN;
  for (const found of text.matchAll(WORD_IN_TEXT)) {
    const word = found[0];
    const offset = found.index ?? 0;
    const latin = LATIN_START.test(word);
    // A Latin word is matched from its first letter; a Japanese stretch from anywhere in it.
    for (let start = word.indexOf(first); start >= 0 && (!latin || start === 0); start = word.indexOf(first, start + 1)) {
      const places = [start];
      let next = start + first.length;
      for (const letter of letters.slice(1)) {
        const place = word.indexOf(letter, next);
        if (place < 0) break;
        places.push(place);
        next = place + letter.length;
      }
      // From any later start the rest is no nearer to being found.
      if (places.length < letters.length) break;
      if (lettersOf(word.slice(start, next)) <= most) return places.map((place) => offset + place);
    }
  }
  return null;
}

/** How well a word is found in one text, as compared (`plainText`): whole, in part, its letters in order, or 0. */
function scoreIn(word: SearchWord, text: string): number {
  if (word.forms.some((form) => form === text)) return WHOLE;
  if (word.forms.some((form) => form !== "" && text.includes(form))) return PART;
  if (word.stem !== null && stemsAt(word.stem, text).length > 0) return PART;
  return word.scatters.some((form) => scatteredAt(form, text) !== null) ? SCATTERED : 0;
}

/**
 * How well a thing's texts, as compared (`plainText`), have every word on them: each word's best, added up, and whether
 * some word was found only by its letters in order (`loose`); null when a word isn't on them at all.
 */
export function matchTexts(words: SearchWords, texts: readonly string[]): { score: number; loose: boolean } | null {
  let score = 0;
  let loose = false;
  for (const word of words) {
    const best = Math.max(0, ...texts.map((text) => scoreIn(word, text)));
    if (best === 0) return null;
    if (best === SCATTERED) loose = true;
    score += best;
  }
  return { score, loose };
}

/** What was found, loose matches let go while anything matches every word whole or in part (`SearchWord`'s rules). */
export function keepTight<T extends { loose: boolean }>(found: readonly T[]): T[] {
  return found.some((one) => !one.loose) ? found.filter((one) => !one.loose) : [...found];
}

/** Some words, a run at a time: those found of what's typed lit. */
export type LitRun = { text: string; lit: boolean };

/**
 * What was found of `words` on a thing whose texts, as compared, are `texts`, to light wherever its words are shown:
 * a word found whole or in part anywhere on it, every place it stands (a stem, the stem alone); a word found only by
 * its letters in order, those letters, inside the one word they were found in. Words whose compared form isn't as long
 * as they are (a half-width kana that joins with its mark) are shown unlit: there's no telling which letters were found.
 */
export function lighterOf(words: SearchWords, texts: readonly string[]): (text: string) => LitRun[] {
  const tight = words.map((word) => texts.some((text) => scoreIn(word, text) >= PART));
  return (text) => {
    const compared = plainText(text);
    if (compared.length !== text.length || words.length === 0) return [{ text, lit: false }];
    const lit = new Uint8Array(text.length);
    words.forEach((word, i) => {
      if (tight[i]) {
        for (const form of word.forms) {
          if (form === "") continue;
          for (let at = compared.indexOf(form); at >= 0; at = compared.indexOf(form, at + form.length)) lit.fill(1, at, at + form.length);
        }
        if (word.stem !== null) for (const at of stemsAt(word.stem, compared)) lit.fill(1, at, at + word.stem.length);
        return;
      }
      for (const form of word.scatters) {
        const places = scatteredAt(form, compared);
        if (!places) continue;
        for (const place of places) lit.fill(1, place, place + ((compared.codePointAt(place) ?? 0) > 0xffff ? 2 : 1));
        break;
      }
    });
    const out: LitRun[] = [];
    for (let i = 0; i < text.length; i++) {
      const on = lit[i] === 1;
      const last = out[out.length - 1];
      if (last && last.lit === on) last.text += text.charAt(i);
      else out.push({ text: text.charAt(i), lit: on });
    }
    return out;
  };
}

/** A card to search: its deck's card type, and the words of where it stands (its place's name, put aside, flagged) as the app says them. */
export type SearchedCard = { card: Card; type: CardType; standing: readonly string[] };

/** Everything on a card that can be searched for, as it stands on the card: its values and its examples' (`value`), then where it stands. */
function cardTextsOf({ card, type, standing }: SearchedCard): { text: string; value: boolean }[] {
  const texts: { text: string; value: boolean }[] = [];
  const valuesOf = (values: Readonly<Record<string, string>>) => {
    for (const field of type.fields) {
      const value = (values[field.id] ?? "").trim();
      if (value === "" || holdsFile(field.kind)) continue;
      const meta = metaOf(field.kind, value);
      if (meta) texts.push(...[meta.title, meta.channel?.name ?? ""].filter((t) => t !== "").map((text) => ({ text, value: true })));
      else if (holdsExamples(field.kind)) texts.push({ text: examplesText(value), value: true });
      else texts.push({ text: value, value: true });
    }
  };
  valuesOf(card.values);
  for (const example of card.examples) valuesOf(example.values);
  for (const text of standing) texts.push({ text, value: false });
  return texts;
}

/**
 * Searching cards: those with every word of `query` on them somewhere, the best first (each word's best, added up),
 * loose ones let go while any matches whole or in part (`keepTight`), cards that match alike in the order they came in;
 * none for nothing typed. The one search of cards: a deck's and every deck's are this, called with their cards.
 */
export function rankCards<T extends SearchedCard>(items: readonly T[], query: string): (T & { score: number; loose: boolean })[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const found: (T & { score: number; loose: boolean })[] = [];
  for (const item of items) {
    const match = matchTexts(
      words,
      cardTextsOf(item).map((t) => plainText(t.text)),
    );
    if (match) found.push({ ...item, ...match });
  }
  // A stable sort: cards that match alike keep the order they came in.
  return keepTight(found).sort((a, b) => b.score - a.score);
}

/**
 * What a search found on a card, wherever it's drawn: any of its words with the found parts lit (`lighterOf`), and the
 * first of its values it was found in, to say where when what's drawn of the card doesn't show it.
 */
export function cardLighting(item: SearchedCard, words: SearchWords): { runs: (text: string) => LitRun[]; foundIn: string | null } {
  const texts = cardTextsOf(item);
  const runs = lighterOf(
    words,
    texts.map((t) => plainText(t.text)),
  );
  return { runs, foundIn: texts.find((t) => t.value && runs(t.text).some((run) => run.lit))?.text ?? null };
}
