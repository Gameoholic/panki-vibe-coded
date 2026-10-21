import { z } from "zod";
import type { DictionaryIndex } from "@panki/contracts";
import type { Provides } from "../dataKinds";

/**
 * The dictionary file format Panki reads: the term-bank zip that nearly every Japanese dictionary for a browser popup
 * comes in (JMdict, Jitendex, the frequency lists, the pitch accents). A zip with an `index.json` saying what it is, and banks
 * of rows: `term_bank_N.json` (the words), `term_meta_bank_N.json` (how common a word is, its pitch accent), and
 * `tag_bank_N.json` (what the short tags on a word mean). Kanji banks are there in some and aren't read yet. The zip
 * itself and its `index.json` are read by the contracts (`readZip`, `openDictionary`), which the API shares.
 *
 * Written from the format's published description; none of any dictionary tool's code is used. Every row is a stranger's data
 * and is checked here, at the door, before anything keeps it. What a row says is kept as it was said; how a formatted
 * definition is shown is `ui/Glossary.tsx`'s, which draws it from a short list of allowed pieces.
 */

const text = (max: number) => z.string().max(max);
/** A field the format calls optional, that some dictionary somewhere gets wrong: dropped rather than refused. */
const maybe = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

/** A word as it was given: [term, reading, definition tags, the kinds of word it is, score, definitions, sequence, term tags]. */
const TermRowV3 = z.tuple([text(100), text(100), text(500).nullable(), text(200), z.number(), z.array(z.unknown()).max(500), z.number(), text(500)]);
/** The first version's: the same first five, then the definitions themselves, each a string. */
const TermRowV1 = z.tuple([text(100), text(100), text(500).nullable(), text(200), z.number()], z.string().max(20_000));

/** A frequency as it was given: a number, a number written as text ("1234", "1234㋕"), or the two together. */
const FrequencyValue = z.union([z.number(), text(100), z.object({ value: z.number(), displayValue: maybe(text(100)) })]);
const FrequencyData = z.union([FrequencyValue, z.object({ reading: text(100), frequency: FrequencyValue })]);
const PitchData = z.object({
  reading: text(100),
  pitches: z.array(z.object({ position: z.union([z.number(), text(50)]) })).max(20),
});
const MetaRow = z.tuple([text(100), z.string(), z.unknown()]);
const TagRow = z.tuple([text(100), text(100), z.number(), text(2000), z.number()]);

/** What's kept of a dictionary itself: what it's called, and how it stands among the others in this browser. */
export type DictionaryRecord = {
  id: string;
  title: string;
  revision: string;
  author: string;
  url: string;
  attribution: string;
  /** What it says about itself in its index.json. Missing on one imported before it was kept. */
  description?: string;
  /** Whether it counts by rank (a frequency list); only rank counts can weigh how a line is split. */
  ranked: boolean;
  counts: { terms: number; frequencies: number; pitches: number };
  /** How many of its entries carry each kind of data Panki reads. Missing on one imported before they were counted: counted once on the options page. */
  provides?: Provides;
  importedAt: number;
  /** Switched on: looked in. */
  on: boolean;
  /** Its place in the owner's order: the first is shown first. */
  order: number;
  /** Being removed: on no list and in no look-up, its rows being cleared away (`store.ts` → `removeDictionary`). */
  removing?: true;
  /**
   * The owner's own name for it (2026-10-16), shown wherever it's named: its row, the popup, the drawer, the popup's
   * layout. Its `title` stays what its file says, which is what tells one dictionary from another (and Panki's copy
   * from this one); nothing of the file or its id changes. Missing while it goes by its title.
   */
  name?: string;
};

/** What a dictionary is called wherever it's shown: the owner's name for it, or the one its file gives it. */
export const shownName = (dictionary: Pick<DictionaryRecord, "title" | "name">): string => dictionary.name?.trim() || dictionary.title;

/** One row of the words, as kept. `id` is given by the store. */
export type TermRecord = {
  id?: number;
  dict: string;
  term: string;
  /** Empty for a word written in kana alone: its reading is itself. */
  reading: string;
  defTags: string;
  /** The kinds of word it is, as the format names them ("v5", "v1", "vs", "adj-i"): what its endings can be. */
  rules: string;
  score: number;
  glossary: unknown[];
  sequence: number;
  termTags: string;
};

export type MetaRecord = {
  id?: number;
  dict: string;
  term: string;
  mode: "freq" | "pitch";
  /** The reading it's for, when it says; null when it's for every reading of the word. */
  reading: string | null;
  /** A frequency's number (null when it gives none, only words). */
  value: number | null;
  /** A frequency as it's shown. */
  display: string;
  /** A pitch accent's downsteps: after which mora the voice falls, 0 for never. */
  positions: number[];
};

export type TagRecord = { dict: string; name: string; category: string; notes: string; order: number };

/** The format's version, from its index: 3 unless it says 1. */
export function versionOf(index: DictionaryIndex): 1 | 3 {
  return (index.format ?? index.version) === 1 ? 1 : 3;
}

/** A row of words; null when it isn't one. */
export function termOf(row: unknown, version: 1 | 3, dict: string): TermRecord | null {
  if (version === 1) {
    const parsed = TermRowV1.safeParse(row);
    if (!parsed.success) return null;
    const [term, reading, defTags, rules, score, ...glossary] = parsed.data;
    return { dict, term, reading, defTags: defTags ?? "", rules, score, glossary, sequence: 0, termTags: "" };
  }
  const parsed = TermRowV3.safeParse(row);
  if (!parsed.success) return null;
  const [term, reading, defTags, rules, score, glossary, sequence, termTags] = parsed.data;
  return { dict, term, reading, defTags: defTags ?? "", rules, score, glossary, sequence, termTags };
}

function frequencyOf(value: z.infer<typeof FrequencyValue>): { value: number | null; display: string } {
  if (typeof value === "number") return { value, display: value.toLocaleString("en") };
  if (typeof value === "string") {
    const number = /^\d+/.exec(value.trim());
    return { value: number ? Number(number[0]) : null, display: value };
  }
  return { value: value.value, display: value.displayValue ?? value.value.toLocaleString("en") };
}

/** A downstep written as a pattern of highs and lows ("LHHL") instead of a number: where the first fall is. */
function positionOf(position: number | string): number | null {
  if (typeof position === "number") return Number.isInteger(position) && position >= 0 && position < 50 ? position : null;
  const pattern = position.toUpperCase();
  if (!/^[HL]+$/.test(pattern)) return null;
  const fall = pattern.indexOf("HL");
  return fall < 0 ? 0 : fall + 1;
}

/** A row about a word (its frequency, its pitch accent); null when it isn't one, or is one Panki doesn't read. */
export function metaOf(row: unknown, dict: string): MetaRecord | null {
  const parsed = MetaRow.safeParse(row);
  if (!parsed.success) return null;
  const [term, mode, data] = parsed.data;
  if (mode === "freq") {
    const freq = FrequencyData.safeParse(data);
    if (!freq.success) return null;
    const given = freq.data;
    const withReading = typeof given === "object" && "frequency" in given;
    const { value, display } = frequencyOf(withReading ? given.frequency : given);
    return { dict, term, mode, reading: withReading ? given.reading : null, value, display, positions: [] };
  }
  if (mode === "pitch") {
    const pitch = PitchData.safeParse(data);
    if (!pitch.success) return null;
    const positions = pitch.data.pitches.flatMap((p) => positionOf(p.position) ?? []);
    if (positions.length === 0) return null;
    return { dict, term, mode, reading: pitch.data.reading, value: null, display: "", positions };
  }
  return null;
}

export function tagOf(row: unknown, dict: string): TagRecord | null {
  const parsed = TagRow.safeParse(row);
  if (!parsed.success) return null;
  const [name, category, order, notes] = parsed.data;
  return { dict, name, category, notes, order };
}
