import { holdsFile, metaOf, type Card, type CardType, type SrsType } from "@panki/contracts";
import { kanaOf, looksLikeRomaji } from "./romaji";
import { placeName } from "./srsKinds";

/**
 * Searching a deck's cards by anything on them (the owner, 2026-10-25: "search by ANYTHING (fuzzy search)"): every
 * field's words (a video's title and channel for a field that holds one), its other examples' too, and where it stands
 * (its stage's name, New, the end). Each word of what's typed must be found somewhere on the card, as a whole value, as
 * part of one, or failing that its letters in order with others between them (行く finds 行きます, "apprnt" finds
 * Apprentice). Katakana and hiragana count as one, as do full- and half-width letters and capitals; a word typed in
 * romaji is also looked for as the hiragana it reads as ("yobun" finds よぶん; one typed part-way, "yob", as far as it
 * goes; `romaji.ts`; the owner, 2026-10-29). The best matches come first; cards that match alike keep the order picked
 * over the list.
 */

/** How well a word of what's typed is found in some words of the card: the whole of them, part of them, its letters in order, or not at all. */
const WHOLE = 3;
const PART = 2;
const SCATTERED = 1;

/** Words as they're compared: full- and half-width alike (NFKC), no capitals, katakana as hiragana. */
function plain(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60));
}

/** Whether every letter of `word` stands in `words`, in its order, others allowed between. */
function inOrder(word: string, words: string): boolean {
  let at = 0;
  for (const letter of word) {
    at = words.indexOf(letter, at);
    if (at < 0) return false;
    at += letter.length;
  }
  return true;
}

function scoreIn(word: string, words: string): number {
  if (words === word) return WHOLE;
  if (words.includes(word)) return PART;
  return inOrder(word, words) ? SCATTERED : 0;
}

/**
 * A word as it's looked for: as typed, and, typed in romaji, as hiragana too. One still being typed ends in a letter
 * or two that are no syllable yet ("yob", "kish"): it's looked for as far as it reads ("よ", "き"). Only those last
 * letters are let go, so a word that isn't romaji ("apprnt") doesn't shrink to a kana or two that'd match anything.
 */
function formsOf(word: string): string[] {
  if (!looksLikeRomaji(word)) return [word];
  const typing = /^(.+?)[^aiueo'-]{1,2}$/.exec(word)?.[1];
  const kana = kanaOf(word) ?? (typing ? kanaOf(typing) : null);
  return kana ? [word, kana] : [word];
}

/** Everything on a card that can be searched for, each as compared. */
function textsOf(card: Card, type: CardType, srsType: SrsType | undefined): string[] {
  const texts: string[] = [];
  const valuesOf = (values: Readonly<Record<string, string>>) => {
    for (const field of type.fields) {
      const value = (values[field.id] ?? "").trim();
      if (value === "" || holdsFile(field.kind)) continue;
      const meta = metaOf(field.kind, value);
      if (meta) texts.push(...[meta.title, meta.channel?.name ?? ""].filter((t) => t !== ""));
      else texts.push(value);
    }
  };
  valuesOf(card.values);
  for (const example of card.examples) valuesOf(example.values);
  if (srsType) texts.push(placeName(srsType, card.place));
  return texts.map(plain);
}

/** The cards that have every word of `query` on them somewhere, the best matches first; all of them, as they are, for nothing typed. */
export function searchCards(cards: readonly Card[], query: string, of: { type: CardType; srsType?: SrsType | undefined }): Card[] {
  const words = plain(query)
    .split(/\s+/)
    .filter((word) => word !== "")
    .map(formsOf);
  if (words.length === 0) return [...cards];
  const scored: { card: Card; score: number }[] = [];
  for (const card of cards) {
    const texts = textsOf(card, of.type, of.srsType);
    let score = 0;
    for (const forms of words) {
      const best = Math.max(0, ...forms.flatMap((word) => texts.map((text) => scoreIn(word, text))));
      if (best === 0) {
        score = 0;
        break;
      }
      score += best;
    }
    if (score > 0) scored.push({ card, score });
  }
  // A stable sort: cards that match alike keep the order they came in.
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.card);
}
