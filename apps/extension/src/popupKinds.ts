import { DATA_KINDS } from "./dataKinds";
import type { BodyKind, FrequencyWords, PartShow, ReadingAt, TagWords } from "./popupLayout";

/**
 * The popup's layout in words: what each part is called, the choices each has, and how common a word is said in a
 * word. One home, as the card layout's are in the app's `layoutKinds.ts`.
 */

export type FixedPart = "split" | "word" | "reading" | "pitch" | "add" | "cards" | "others";
export type NamedPart = FixedPart | BodyKind;
/**
 * A part that shows one kind of a dictionary's data is called by that kind's own name, taken from `dataKinds.ts` so
 * the two can't drift apart: the dictionaries' Provides and the popup's layout say the same words (the owner,
 * 2026-10-16: "why not make them the same?"). The rest are Panki's own: the words found, the endings it takes off, Add.
 */
export const PART_NAMES: Record<NamedPart, string> = {
  split: "Words found here",
  word: DATA_KINDS.form.name,
  reading: DATA_KINDS.reading.name,
  pitch: DATA_KINDS.pitch.name,
  add: "Add",
  cards: "In your decks",
  others: "Other words in full",
  tags: DATA_KINDS.tags.name,
  frequency: DATA_KINDS.frequency.name,
  wordType: DATA_KINDS.wordType.name,
  endings: "Endings",
};
/** What each part is for, said beside it when it's picked in the layout (the owner, 2026-10-16: "Words that start here, I don't get what that's for"). */
export const PART_ABOUT: Record<NamedPart, string> = {
  split: "Every word found at the letter pointed at, when there's more than one: 喫茶店 and the shorter 喫茶, or 新 read しん and read あら. The one shown is lit; press another to see it. On Panki's line under a video, the line is split around it too.",
  word: "The word as the dictionary lists it: what the pop-up is about, always shown.",
  reading: "How the word is read, over it or beside it.",
  pitch: "Where the voice falls in the word.",
  add: "Opens the drawer to add the word to a deck.",
  cards: "When the word is already a card: which deck it's in, with Open in Panki.",
  others: "Every other word found at the same letter, each in full under the one shown, besides its chip at the top.",
  tags: "The dictionary's labels on the word. Press one to read what it means.",
  frequency: "How common the word is: a band from the best rank among your lists, and each list's own number.",
  wordType: "Which kind of verb or adjective the word is, as the dictionary names it, written the way Tags are.",
  endings: "Panki's own: the endings it took off the word on the page to find it in the dictionary, one after another, using the word's type.",
};
/** What a dictionary's own part is for. */
export const MEANINGS_ABOUT = "What this dictionary says the word means, under its name.";

/** Whether a part is one of those named here (a dictionary's meanings go by the dictionary's name). */
export const isNamedPart = (id: string): id is NamedPart => Object.hasOwn(PART_NAMES, id);
/** What a dictionary's own part is: that kind of data, from that dictionary. */
export const MEANINGS_NAME = DATA_KINDS.meaning.name;

export const SHOW_OPTIONS: readonly { id: PartShow; label: string }[] = [
  { id: "shown", label: "Shown" },
  { id: "folded", label: "Folded" },
  { id: "hidden", label: "Hidden" },
];
/** For a part too short to fold. */
export const SHOWN_OR_HIDDEN = SHOW_OPTIONS.filter((option) => option.id !== "folded");
export const READING_OPTIONS: readonly { id: ReadingAt; label: string }[] = [
  { id: "over", label: "Over the word" },
  { id: "beside", label: "Beside it" },
  { id: "hidden", label: "Hidden" },
];
export const TAG_OPTIONS: readonly { id: TagWords; label: string }[] = [
  { id: "codes", label: "Codes" },
  { id: "descriptions", label: "Descriptions" },
];
export const FREQUENCY_OPTIONS: readonly { id: FrequencyWords; label: string }[] = [
  { id: "both", label: "Band and number" },
  { id: "band", label: "Band" },
  { id: "number", label: "Number" },
];
/** How many of a dictionary's meanings show before "more": 0 is every one. */
export const MEANINGS_OPTIONS: readonly { id: number; label: string }[] = [{ id: 0, label: "All" }, ...[1, 2, 3, 4, 5, 8, 10].map((n) => ({ id: n, label: `First ${n}` }))];

/** Where each band of how common a word is ends, by its best rank in the lists that count by rank (1 the most common). */
const BANDS: readonly { upTo: number; name: string }[] = [
  { upTo: 3_000, name: "Very common" },
  { upTo: 10_000, name: "Common" },
  { upTo: 30_000, name: "Uncommon" },
];
const RARE = "Rare";
export function bandOf(rank: number): string {
  return BANDS.find((band) => rank <= band.upTo)?.name ?? RARE;
}
