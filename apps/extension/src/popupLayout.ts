import { z } from "zod";

/**
 * How the dictionary's popup is laid out (the owner's pick, C of the popup page, 2026-10-16: "i like layout editor").
 * Each part is shown, folded to one line that opens it, or hidden; what's under the word stands in the owner's order,
 * each dictionary's meanings a part of its own; and the reading, the tags and how common a word is are each written one
 * of a few ways. Set on the options page and kept in the extension's storage, then handed to a page's script in the
 * worker's `lookState` answer: so it lives here, apart from `storage.ts`, as the look-up's other settings do.
 */

/** Shown as it is, folded to a line that opens it, or not there. Only what can run long folds: a dictionary's meanings, the other words found. */
export const PartShow = z.enum(["shown", "folded", "hidden"]);
export type PartShow = z.infer<typeof PartShow>;

/** What's under the word besides the dictionaries' meanings: its tags, how common it is, its type, the endings undone. */
export const BODY_KINDS = ["tags", "frequency", "wordType", "endings"] as const;
export type BodyKind = (typeof BODY_KINDS)[number];
export const isBodyKind = (id: string): id is BodyKind => (BODY_KINDS as readonly string[]).includes(id);
/**
 * How a kind first stands in a layout. The word's type came after the rest (2026-10-16, so every kind of a
 * dictionary's data has a part of its own name) and starts hidden: a popup laid out before doesn't change by itself.
 */
const firstShow = (kind: BodyKind): PartShow => (kind === "wordType" ? "hidden" : "shown");

const DICTIONARY = "dict:";
/** A dictionary's meanings as a part: "dict:" and the dictionary's id. */
export const dictionaryPart = (dictionaryId: string) => `${DICTIONARY}${dictionaryId}`;
/** The dictionary a part is the meanings of; null for a part that isn't one. */
export const dictionaryOf = (partId: string): string | null => (partId.startsWith(DICTIONARY) ? partId.slice(DICTIONARY.length) : null);

const PART_ID_MAX = 200;
/** Far more parts than there will ever be dictionaries: a broken value is cut short, never kept whole. */
const BODY_MAX = 64;
/** The most a dictionary's meanings can be cut to before "more". */
export const MEANINGS_MAX = 20;

export const BodyPart = z.object({
  /** One of `BODY_KINDS`, or a dictionary's meanings (`dictionaryPart`). */
  id: z.string().min(1).max(PART_ID_MAX),
  show: PartShow,
  /** For a dictionary's meanings: how many show before the rest wait behind "more"; 0 for every one. */
  meanings: z.number().int().min(0).max(MEANINGS_MAX).catch(0),
});
export type BodyPart = z.infer<typeof BodyPart>;

/** Where the word's reading is: over it, beside it, or nowhere (the pitch says it too). */
export const ReadingAt = z.enum(["over", "beside", "hidden"]);
export type ReadingAt = z.infer<typeof ReadingAt>;
/** A tag as its dictionary's short code (pressed, it says what it means), or as what it means. */
export const TagWords = z.enum(["codes", "descriptions"]);
export type TagWords = z.infer<typeof TagWords>;
/** How common: a band in words with each list's own number, the band alone, or the numbers alone. */
export const FrequencyWords = z.enum(["both", "band", "number"]);
export type FrequencyWords = z.infer<typeof FrequencyWords>;

export const PopupLayout = z.object({
  /**
   * Every word found at the pointed letter, as one row of chips at the top: the one shown lit, another pressed to see
   * it (on Panki's own line, the line is split around it too).
   */
  split: PartShow.catch("shown"),
  reading: ReadingAt.catch("over"),
  pitch: PartShow.catch("shown"),
  add: PartShow.catch("shown"),
  /**
   * The word's cards already in the decks, under its head: which deck, and Open in Panki. Always there until the owner
   * had it a part of its own, 2026-10-28 ("make that message toggleable in the popup layout"); a layout kept before has it shown.
   */
  cards: PartShow.catch("shown"),
  /** What's under the word, top to bottom. */
  body: z.array(BodyPart).max(BODY_MAX).catch([]),
  /**
   * The words found besides the one shown, each in full under it, or not at all. It could once be folded to an "Also
   * here" row of chips at the bottom, the same words as the row at the top (the owner, 2026-10-16: "why do we have both
   * the top and the bottom?"): that row is gone, and a layout kept with it folded has it hidden.
   */
  others: PartShow.catch("hidden"),
  tagWords: TagWords.catch("codes"),
  frequencyWords: FrequencyWords.catch("both"),
});
export type PopupLayout = z.infer<typeof PopupLayout>;

/** The popup as nobody has laid it out: A of the popup page, the clearer one, which the editor starts from. */
const DEFAULT: PopupLayout = {
  split: "shown",
  reading: "over",
  pitch: "shown",
  add: "shown",
  cards: "shown",
  body: BODY_KINDS.map((id): BodyPart => ({ id, show: firstShow(id), meanings: 0 })),
  others: "hidden",
  tagWords: "codes",
  frequencyWords: "both",
};

/**
 * The layout as it stands: what was kept (the default when nothing was), with each of the kinds under the word and
 * each dictionary that has meanings in it once, in the dictionaries' order. One not placed yet goes at the end, open
 * when no dictionary is open already and folded otherwise (the first open, the rest folded, as the owner saw it on the
 * popup page); one no longer there is left out.
 */
export function popupLayoutOf(kept: PopupLayout | null, dictionaries: readonly { id: string }[]): PopupLayout {
  const base = kept ?? DEFAULT;
  const known = new Set(dictionaries.map((d) => dictionaryPart(d.id)));
  const seen = new Set<string>();
  const body: BodyPart[] = [];
  for (const part of base.body) {
    if (seen.has(part.id) || !(isBodyKind(part.id) || known.has(part.id))) continue;
    seen.add(part.id);
    body.push(part);
  }
  for (const kind of BODY_KINDS) if (!seen.has(kind)) body.push({ id: kind, show: firstShow(kind), meanings: 0 });
  for (const dictionary of dictionaries) {
    const id = dictionaryPart(dictionary.id);
    if (seen.has(id)) continue;
    const open = body.some((p) => dictionaryOf(p.id) !== null && p.show === "shown");
    body.push({ id, show: open ? "folded" : "shown", meanings: 0 });
  }
  return { ...base, body, others: base.others === "folded" ? "hidden" : base.others };
}

/** The dictionaries that have meanings, the only ones that are parts of the popup (a frequency list's numbers and a pitch dictionary's accents go where those parts are). */
export function withMeanings<D extends { counts: { terms: number } }>(dictionaries: readonly D[]): D[] {
  return dictionaries.filter((d) => d.counts.terms > 0);
}

/** One part under the word moved to where another stands: after it when moved down, before it when moved up. */
export function moveBodyPart(layout: PopupLayout, id: string, to: string): PopupLayout {
  const from = layout.body.findIndex((p) => p.id === id);
  const target = layout.body.findIndex((p) => p.id === to);
  const moving = layout.body[from];
  if (!moving || target < 0 || from === target) return layout;
  const body = layout.body.filter((p) => p.id !== id);
  body.splice(body.findIndex((p) => p.id === to) + (from < target ? 1 : 0), 0, moving);
  return { ...layout, body };
}
