import { pitchValue } from "@panki/contracts";
import { bandOf } from "../popupKinds";
import type { DictionaryRoleId } from "../roles";
import { glossaryText } from "../ui/Glossary";
import type { Found, Sense, Tag } from "./found";

/**
 * What the dictionary says of a word, as text, one value for each kind of its data (`roles.ts` → `DICTIONARY_ROLES`):
 * what the drawer fills a card's fields with, and what Explain hands Panki AI by the same names (Prompt context). One
 * reading of a `Found`, so a card and a prompt can't say a word's tags or how common it is two ways.
 */

/** Names once each, in the order first met, joined. */
const listed = (names: readonly string[]) => [...new Set(names)].join(", ");

/** A tag as a card says it: what the dictionary says it means, or its code when it says nothing. */
const tagWords = (tag: Tag) => tag.notes || tag.name;

/** How common the word is, as a card says it: the band from the best rank, then each list's number. */
function frequencyText(found: Found): string {
  const ranks = found.frequencies.flatMap((f) => (f.rank === null ? [] : [f.rank]));
  const lists = found.frequencies.map((f) => `${f.dict} ${f.display}`).join(", ");
  return [ranks.length > 0 ? bandOf(Math.min(...ranks)) : "", lists].filter((part) => part !== "").join(" · ");
}

/** Meanings as one value: one line each, numbered when there's more than one; or one after another on a single line. */
function meaningOf(texts: readonly string[], lines: boolean): string {
  if (!lines) return texts.join("; ");
  return texts.length === 1 ? (texts[0] ?? "") : texts.map((text, i) => `${i + 1}. ${text}`).join("\n");
}

/** Every piece the dictionary gives, empty: what a word nobody has found yet fills them with. */
export const NO_PIECES: Record<DictionaryRoleId, string> = {
  dictForm: "",
  dictReading: "",
  dictMeaning: "",
  dictTags: "",
  dictWordType: "",
  dictFrequency: "",
  dictPitch: "",
};

/**
 * What the dictionary fills each of its pieces with for a word: its meanings those of `senses` (the drawer's ticked
 * ones; every one, for Explain), a line each when `lines` (a box of several lines; and Explain), or on one line.
 */
export function dictionaryPieces(found: Found, senses: readonly Sense[], lines: boolean): Record<DictionaryRoleId, string> {
  const reading = found.reading || found.term;
  return {
    dictForm: found.term,
    dictReading: reading,
    dictMeaning: meaningOf(
      senses.map((sense) => glossaryText(sense.glossary)),
      lines,
    ),
    // The word's own tags, then those of the meanings taken.
    dictTags: listed([...found.tags, ...senses.flatMap((sense) => sense.tags)].map(tagWords)),
    dictWordType: listed(found.wordTypes.map(tagWords)),
    dictFrequency: frequencyText(found),
    // As a Pitch accent field keeps it ("たべる 2"), which the card draws as the line over the reading.
    dictPitch: pitchValue(found.pitches.flatMap((pitch) => pitch.positions.map((position) => ({ reading, position })))),
  };
}
