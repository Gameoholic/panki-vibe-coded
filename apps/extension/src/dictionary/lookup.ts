import { deinflect, fits, type Deinflected } from "./deinflect";
import { shownName, type DictionaryRecord, type MetaRecord, type TagRecord, type TermRecord } from "./format";
import type { Found, Lattice, Tag } from "./found";
import { listDictionaries, metaFor, tagsOf, termsFor } from "./store";

/**
 * Looking words up, in the worker. From a place in some text: every stretch from there, longest first (up to
 * `SCAN` letters, never across a stop or a space), every form each may be a changed form of (`deinflect`), and each
 * of those looked for by how it's written and by how it's read. What's found is grouped by word, best first: the
 * longest stretch, the fewest endings, the most common, the dictionary first in the owner's order.
 */

/** How far from the pointer a word is looked for: no real word is longer. */
const SCAN = 16;
/** What's never inside a word: a stretch stops before it. */
const BREAK = /[\s、。，．,.!！?？「」『』（）()［］[\]【】〈〉《》…‥・：:；;"'“”‘’]/;
/** Where a word can begin: kana, kanji and their marks. */
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ々〆ヶ]/;
/** The most words a look-up gives. */
const FOUND_MAX = 12;

/** The stretch of text a look-up from its first letter can reach. */
function scanOf(text: string): string {
  let end = 0;
  while (end < text.length && end < SCAN && !BREAK.test(text.charAt(end))) end++;
  return text.slice(0, end);
}

/** Katakana as hiragana, for a word written in katakana that the dictionary reads in hiragana (ダメ, 駄目). */
function hiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

type Candidate = Deinflected & { source: string };

function candidatesOf(scan: string): Candidate[] {
  const out: Candidate[] = [];
  for (let length = scan.length; length > 0; length--) {
    const source = scan.slice(0, length);
    for (const form of deinflect(source)) out.push({ ...form, source });
  }
  return out;
}

/** The dictionaries switched on, by id, with their place in the order. */
async function dictionariesOn(): Promise<Map<string, DictionaryRecord>> {
  return new Map((await listDictionaries()).filter((d) => d.on).map((d) => [d.id, d]));
}

/** Rows found for some candidates: each candidate with the rows it is, of a dictionary that's on and of the kind its endings say. */
async function match<C extends Candidate>(candidates: readonly C[], on: ReadonlyMap<string, DictionaryRecord>): Promise<{ candidate: C; row: TermRecord }[]> {
  const keys = new Set<string>();
  for (const candidate of candidates) {
    keys.add(candidate.text);
    keys.add(hiragana(candidate.text));
  }
  const rows = (await termsFor([...keys])).filter((row) => on.has(row.dict));
  const byKey = new Map<string, TermRecord[]>();
  const file = (key: string, row: TermRecord) => byKey.set(key, [...(byKey.get(key) ?? []), row]);
  for (const row of rows) {
    file(row.term, row);
    if (row.reading !== "" && row.reading !== row.term) file(row.reading, row);
  }
  const out: { candidate: C; row: TermRecord }[] = [];
  for (const candidate of candidates) {
    const there = new Set([...(byKey.get(candidate.text) ?? []), ...(byKey.get(hiragana(candidate.text)) ?? [])]);
    for (const row of there) if (fits(candidate.kind, row.rules)) out.push({ candidate, row });
  }
  return out;
}

const readingOf = (row: TermRecord) => (row.reading === "" ? row.term : row.reading);
const keyOf = (term: string, reading: string) => `${term}\u0000${reading}`;

/** How common a word is by the frequency lists that count by rank: its best rank, or null when none of them knows it. */
function rankOf(meta: readonly MetaRecord[], term: string, reading: string, on: ReadonlyMap<string, DictionaryRecord>): number | null {
  let best: number | null = null;
  for (const row of meta) {
    if (row.mode !== "freq" || row.term !== term || row.value === null || row.value <= 0) continue;
    if (row.reading !== null && row.reading !== reading) continue;
    if (!on.get(row.dict)?.ranked) continue;
    best = best === null ? row.value : Math.min(best, row.value);
  }
  return best;
}

/** Tags by dictionary, kept while the worker is awake: they're the same for every word of a dictionary. */
const tagCache = new Map<string, Map<string, TagRecord>>();
async function tagsBy(dicts: Iterable<string>): Promise<Map<string, Map<string, TagRecord>>> {
  for (const dict of dicts) if (!tagCache.has(dict)) tagCache.set(dict, await tagsOf(dict));
  return tagCache;
}
function tagsIn(names: string, dict: string, tags: ReadonlyMap<string, ReadonlyMap<string, TagRecord>>): Tag[] {
  return names
    .split(/\s+/)
    .filter((name) => name !== "")
    .map((name) => {
      const known = tags.get(dict)?.get(name);
      return { name, category: known?.category ?? "", notes: known?.notes ?? "" };
    });
}

/** Everything found from the first letter of `text` on, as words, best first. */
export async function lookUp(text: string): Promise<Found[]> {
  const scan = scanOf(text);
  if (scan === "" || !JAPANESE.test(scan.charAt(0))) return [];
  const on = await dictionariesOn();
  if (on.size === 0) return [];
  const matches = await match(candidatesOf(scan), on);

  // One word per written form and reading, across dictionaries; the stretch it's taken as is its best one.
  const words = new Map<string, { term: string; reading: string; best: Candidate; rows: Map<number, TermRecord> }>();
  for (const { candidate, row } of matches) {
    const key = keyOf(row.term, readingOf(row));
    const word = words.get(key) ?? { term: row.term, reading: readingOf(row), best: candidate, rows: new Map() };
    const better = candidate.source.length > word.best.source.length || (candidate.source.length === word.best.source.length && candidate.steps.length < word.best.steps.length);
    if (better) word.best = candidate;
    if (row.id !== undefined) word.rows.set(row.id, row);
    words.set(key, word);
  }
  const meta = await metaFor([...new Set([...words.values()].map((word) => word.term))]);
  const tags = await tagsBy(new Set(matches.map((m) => m.row.dict)));
  const orderOf = (dict: string) => on.get(dict)?.order ?? Infinity;
  /** A dictionary as it's named where it's shown: the owner's name for it, or its own. */
  const nameOf = (dict: string) => {
    const dictionary = on.get(dict);
    return dictionary ? shownName(dictionary) : "";
  };

  const ranked = [...words.values()].map((word) => {
    const rows = [...word.rows.values()].sort((a, b) => orderOf(a.dict) - orderOf(b.dict) || a.sequence - b.sequence || b.score - a.score || (a.id ?? 0) - (b.id ?? 0));
    const own = meta.filter((row) => row.term === word.term && (row.reading === null || row.reading === word.reading) && on.has(row.dict));
    const byOrder = (a: MetaRecord, b: MetaRecord) => orderOf(a.dict) - orderOf(b.dict);
    const termTags = new Map<string, Tag>();
    for (const row of rows) for (const tag of tagsIn(row.termTags, row.dict, tags)) termTags.set(tag.name, tag);
    // A word's types are named like its tags, and most dictionaries explain the names among them.
    const wordTypes = new Map<string, Tag>();
    for (const row of rows) for (const tag of tagsIn(row.rules, row.dict, tags)) wordTypes.set(tag.name, tag);
    const found: Found = {
      source: word.best.source,
      term: word.term,
      reading: word.reading,
      steps: word.best.steps,
      tags: [...termTags.values()],
      wordTypes: [...wordTypes.values()],
      senses: rows.map((row) => ({ dict: nameOf(row.dict), dictId: row.dict, tags: tagsIn(row.defTags, row.dict, tags), glossary: row.glossary })),
      frequencies: own
        .filter((row) => row.mode === "freq")
        .sort(byOrder)
        .map((row) => ({
          dict: nameOf(row.dict),
          display: row.display,
          rank: on.get(row.dict)?.ranked && row.value !== null && row.value > 0 ? row.value : null,
        })),
      pitches: own
        .filter((row) => row.mode === "pitch")
        .sort(byOrder)
        .map((row) => ({ dict: nameOf(row.dict), positions: row.positions })),
    };
    return {
      found,
      rank: rankOf(meta, word.term, word.reading, on) ?? Infinity,
      order: Math.min(...rows.map((row) => orderOf(row.dict))),
      score: Math.max(...rows.map((row) => row.score)),
    };
  });
  ranked.sort((a, b) => b.found.source.length - a.found.source.length || a.found.steps.length - b.found.steps.length || a.rank - b.rank || a.order - b.order || b.score - a.score);
  return ranked.slice(0, FOUND_MAX).map((r) => r.found);
}

/** What one word costs in a split: something for being a word at all, less the more common it is, a little more for every ending undone. */
function costOf(rank: number | null, steps: number): number {
  return 2 + (rank === null ? 16 : Math.log2(rank + 1)) + steps * 0.5;
}

/** The words starting at each place a word can start, as a stretch of text gives them. Kept while the worker is awake, so a line that grows is only looked at again near its end. */
const options = new Map<string, { length: number; cost: number }[]>();
const OPTIONS_MAX = 5000;
let optionsFor = "";

/** Every word that starts at each place of a line, with its cost: what the line is split by. */
export async function latticeOf(text: string): Promise<Lattice> {
  const on = await dictionariesOn();
  if (on.size === 0) return [];
  // The dictionaries changed since: what was kept was found in others.
  const signature = [...on.values()].map((d) => d.id).join(",");
  if (signature !== optionsFor) {
    options.clear();
    optionsFor = signature;
  }
  const scans: { at: number; scan: string }[] = [];
  for (let at = 0; at < text.length; at++) {
    if (!JAPANESE.test(text.charAt(at))) continue;
    const scan = scanOf(text.slice(at));
    if (scan !== "") scans.push({ at, scan });
  }
  const fresh = [...new Set(scans.map((s) => s.scan).filter((scan) => !options.has(scan)))];
  if (fresh.length > 0) {
    const candidates = fresh.flatMap((scan) => candidatesOf(scan).map((candidate) => ({ ...candidate, scan })));
    const matches = await match(candidates, on);
    const meta = await metaFor([...new Set(matches.map((m) => m.row.term))]);
    const best = new Map<string, Map<number, number>>();
    for (const { candidate, row } of matches) {
      const scan = candidate.scan;
      const cost = costOf(rankOf(meta, row.term, readingOf(row), on), candidate.steps.length);
      const lengths = best.get(scan) ?? new Map<number, number>();
      const length = candidate.source.length;
      lengths.set(length, Math.min(lengths.get(length) ?? Infinity, cost));
      best.set(scan, lengths);
    }
    for (const scan of fresh) {
      if (options.size >= OPTIONS_MAX) options.clear();
      options.set(
        scan,
        [...(best.get(scan) ?? new Map<number, number>()).entries()].map(([length, cost]) => ({ length, cost })),
      );
    }
  }
  return scans.flatMap(({ at, scan }) => {
    const there = options.get(scan) ?? [];
    return there.length > 0 ? [{ at, options: there }] : [];
  });
}
