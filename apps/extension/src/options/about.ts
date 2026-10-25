import { firstRowsOf, metaFor, tagsOf, termsFor } from "../dictionary/store";
import type { TagRecord, TermRecord } from "@panki/contracts";
import type { DictionaryRecord } from "../dictionary/format";
import { glossaryText } from "../ui/Glossary";

/**
 * One word as a dictionary gives it, read from the dictionary itself each time the page opens, so what each kind of
 * its data is can be shown with what it really says: its form, reading and meaning, a tag on it with the dictionary's
 * own note, its word type, its frequency, its pitch. Nothing here is guessed: what a dictionary doesn't say is null.
 */
export type About = {
  example: { term: string; reading: string; text: string } | null;
  /** A tag on the example word, with what the dictionary says it means (empty when it says nothing). */
  tag: { name: string; notes: string } | null;
  /** The example word's type, as the dictionary names it ("v1"), and its note on that name when it has one. */
  wordType: { term: string; name: string; notes: string } | null;
  frequency: { term: string; display: string } | null;
  pitch: { term: string; reading: string; position: number } | null;
};

/** Everyday words looked for first, so the example is one anybody knows; failing those, the dictionary's first word. */
const PROBES = ["食べる", "見る", "行く", "日本", "言葉", "水"];
const SAMPLE = 30;
const EXAMPLE_MAX = 160;

const clipped = (text: string) => (text.length > EXAMPLE_MAX ? `${text.slice(0, EXAMPLE_MAX).trimEnd()}…` : text);
const namesIn = (text: string) => text.split(/\s+/).filter((name) => name !== "");

const tagsOn = (row: TermRecord) => namesIn(`${row.termTags} ${row.defTags}`);

export async function aboutOf(dictionary: DictionaryRecord): Promise<About> {
  const [probed, first, probedMeta] = await Promise.all([termsFor(PROBES), firstRowsOf(dictionary.id, SAMPLE), metaFor(PROBES)]);
  const own = probed.filter((row) => row.dict === dictionary.id);
  const word = PROBES.flatMap((probe) => own.filter((row) => row.term === probe))[0] ?? first.terms[0] ?? null;
  // The example word's tag and type when it has them; another word's when it hasn't (a noun has no type).
  const rows = [...(word ? [word] : []), ...own, ...first.terms];
  const withTags = rows.find((row) => tagsOn(row).length > 0);
  const withType = rows.find((row) => namesIn(row.rules).length > 0);
  const tagNames = withTags ? tagsOn(withTags) : [];
  const typeName = withType ? namesIn(withType.rules)[0] : undefined;
  const notes = tagNames.length > 0 || typeName ? await tagsOf(dictionary.id) : new Map<string, TagRecord>();
  // A tag the dictionary explains, if the word has one; its first tag otherwise.
  const tagName = tagNames.find((name) => (notes.get(name)?.notes ?? "") !== "") ?? tagNames[0];
  const meta = [...probedMeta.filter((row) => row.dict === dictionary.id), ...first.meta];
  const frequency = meta.find((row) => row.mode === "freq");
  const pitch = meta.find((row) => row.mode === "pitch");
  return {
    example: word ? { term: word.term, reading: word.reading, text: clipped(glossaryText(word.glossary)) } : null,
    tag: tagName ? { name: tagName, notes: notes.get(tagName)?.notes ?? "" } : null,
    wordType: withType && typeName ? { term: withType.term, name: typeName, notes: notes.get(typeName)?.notes ?? "" } : null,
    frequency: frequency ? { term: frequency.term, display: frequency.display } : null,
    pitch: pitch && pitch.positions[0] !== undefined ? { term: pitch.term, reading: pitch.reading ?? pitch.term, position: pitch.positions[0] } : null,
  };
}
