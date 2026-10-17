import { dictionaryOf } from "./popupLayout";
import type { NamedPart } from "./popupKinds";

/**
 * What Panki reads from a dictionary, one registry: each kind of data a dictionary can provide, what it's called
 * everywhere it's shown (a dictionary's row, the popup's layout, the field mapping), what it is in a sentence, and the
 * parts of the popup it's shown in. Which of a card's fields it can fill is the field mapping's: each piece the
 * dictionary gives names its kind (`roles.ts`). The owner, 2026-10-16: a dictionary should say "we provide this
 * data", in data Panki accepts, each explained where it's named, rather than one list of the fields it fills and
 * another of where it shows in the popup. A new kind is one entry here and one count in `dictionary/store.ts`.
 */
export const DATA_KIND_IDS = ["form", "reading", "meaning", "tags", "wordType", "frequency", "pitch"] as const;
export type DataKind = (typeof DATA_KIND_IDS)[number];

/** How many of a dictionary's entries carry each kind: counted from its rows, never guessed. */
export type Provides = Record<DataKind, number>;
export const emptyProvides = (): Provides => ({ form: 0, reading: 0, meaning: 0, tags: 0, wordType: 0, frequency: 0, pitch: 0 });

type Kind = {
  name: string;
  /** What it is, in a sentence or two. */
  about: string;
  /** The parts of the popup it's shown in. */
  parts: readonly NamedPart[];
  /** Shown in a part of the popup of its own, under the dictionary's name. */
  ownPart?: true;
  /** Carried by a dictionary's entries, some or all of them; otherwise it's a list of its own (a frequency, a pitch accent), each row one word. */
  perEntry?: true;
};

export const DATA_KINDS: Record<DataKind, Kind> = {
  form: {
    name: "Dictionary form",
    about: "The word as a dictionary lists it, before any endings: 食べる for 食べました.",
    parts: ["split", "word", "others"],
    perEntry: true,
  },
  reading: { name: "Reading", about: "How the word is read, written in kana.", parts: ["reading", "split", "others"], perEntry: true },
  meaning: { name: "Meaning", about: "What the word means, in the dictionary's own words.", parts: [], ownPart: true, perEntry: true },
  tags: {
    name: "Tags",
    about: "Short labels on a word or one of its meanings, each explained by the dictionary itself: what kind of word it is, how it's used, whether it's usually written in kana.",
    parts: ["tags"],
    perEntry: true,
  },
  wordType: {
    name: "Word type",
    about: "Which kind of verb or adjective a word is: what lets the endings on it be taken off, so 食べました is found as 食べる. Only words that change their endings have one.",
    parts: ["wordType", "endings"],
    perEntry: true,
  },
  frequency: {
    name: "Frequency",
    about: "How common a word is, by what the list counted. A list that counts by rank also decides which word found comes first, and how Panki's line under a video is split into words.",
    parts: ["frequency"],
  },
  pitch: { name: "Pitch accent", about: "Where the voice falls in the word, drawn as a line over its reading.", parts: ["pitch"] },
};

/** The kinds a part of the popup shows; none for one that's Panki's own (Add). */
export function kindsIn(part: string): DataKind[] {
  if (dictionaryOf(part) !== null) return DATA_KIND_IDS.filter((kind) => DATA_KINDS[kind].ownPart);
  return DATA_KIND_IDS.filter((kind) => (DATA_KINDS[kind].parts as readonly string[]).includes(part));
}

/** The kinds a dictionary provides, in the registry's order. */
export const providedBy = (provides: Provides): DataKind[] => DATA_KIND_IDS.filter((kind) => provides[kind] > 0);
