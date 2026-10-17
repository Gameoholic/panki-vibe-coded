import { DictionaryFileError, ZipError, jsonOfEntry, openDictionary, type ZipEntry } from "@panki/contracts";
import { emptyProvides, type Provides } from "../dataKinds";
import { uuid } from "../uuid";
import { metaOf, tagOf, termOf, versionOf, type DictionaryRecord, type MetaRecord, type TagRecord, type TermRecord } from "./format";

/**
 * Where the dictionaries are kept: the browser's own database, in the extension's own corner of this browser. Never
 * sent anywhere (not to Panki either); only a card that's added leaves. The worker looks words up in it, and the
 * options page imports and removes dictionaries; a page's script never opens it (its database would be the page's).
 *
 * Four stores: the dictionaries themselves, and the words, the facts about words (frequencies, pitch accents) and the
 * tags of every dictionary in one each, every row naming the dictionary it's from, so one is removed by its rows.
 */
const NAME = "panki-dictionary";
const VERSION = 1;

export class DictionaryError extends Error {}

let opened: Promise<IDBDatabase> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The dictionary database failed."));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("The dictionary database failed."));
    tx.onabort = () => reject(tx.error ?? new Error("The dictionary database stopped."));
  });
}

function open(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("dictionaries", { keyPath: "id" });
      const terms = db.createObjectStore("terms", { keyPath: "id", autoIncrement: true });
      terms.createIndex("term", "term");
      terms.createIndex("reading", "reading");
      terms.createIndex("dict", "dict");
      const meta = db.createObjectStore("meta", { keyPath: "id", autoIncrement: true });
      meta.createIndex("term", "term");
      meta.createIndex("dict", "dict");
      const tags = db.createObjectStore("tags", { keyPath: ["dict", "name"] });
      tags.createIndex("dict", "dict");
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another part of the extension asked for a newer layout: this one lets go, and opens afresh next time.
      db.onversionchange = () => {
        db.close();
        opened = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opened = null;
      reject(req.error ?? new Error("The dictionary database wouldn't open."));
    };
  });
  return opened;
}

/** The dictionaries, in the owner's order; one that's being removed isn't among them. */
export async function listDictionaries(): Promise<DictionaryRecord[]> {
  const db = await open();
  const all = await request<DictionaryRecord[]>(db.transaction("dictionaries").objectStore("dictionaries").getAll());
  return all.filter((d) => !d.removing).sort((a, b) => a.order - b.order);
}

/** Switches one on or off. */
export async function setDictionaryOn(id: string, on: boolean): Promise<void> {
  const db = await open();
  const tx = db.transaction("dictionaries", "readwrite");
  const store = tx.objectStore("dictionaries");
  const record = await request<DictionaryRecord | undefined>(store.get(id));
  if (record) store.put({ ...record, on });
  await finished(tx);
}

/** How long a dictionary's own name may be. */
export const DICTIONARY_NAME_MAX = 200;

/**
 * Gives a dictionary a name of the owner's own, shown wherever it's named; null (or nothing typed) goes back to the
 * name its file gives it. Its file, its title and its id stay as they are.
 */
export async function setDictionaryName(id: string, name: string | null): Promise<void> {
  const own = name?.trim().slice(0, DICTIONARY_NAME_MAX) ?? "";
  const db = await open();
  const tx = db.transaction("dictionaries", "readwrite");
  const store = tx.objectStore("dictionaries");
  const record = await request<DictionaryRecord | undefined>(store.get(id));
  if (record) {
    const { name: _was, ...rest } = record;
    store.put(own !== "" && own !== record.title ? { ...rest, name: own } : rest);
  }
  await finished(tx);
}

/** What one row of words provides, added to the counts so far. */
function tallyTerm(provides: Provides, row: TermRecord): void {
  provides.form++;
  if (row.reading !== "") provides.reading++;
  if (row.glossary.length > 0) provides.meaning++;
  if (row.termTags.trim() !== "" || row.defTags.trim() !== "") provides.tags++;
  if (row.rules.trim() !== "") provides.wordType++;
}

/** How many rows are read at once when a dictionary's words are counted. */
const COUNT_BATCH = 5000;

/**
 * What a dictionary imported before Panki counted it provides, counted from its rows now. Its frequencies and pitch
 * accents were counted at import; its words are read a batch at a time by their keys, which an import gives one after
 * another (a row of another dictionary's among them is passed over).
 */
export async function countProvides(dictionary: DictionaryRecord): Promise<Provides> {
  const provides: Provides = { ...emptyProvides(), frequency: dictionary.counts.frequencies, pitch: dictionary.counts.pitches };
  const db = await open();
  const end = async (direction: IDBCursorDirection): Promise<number | null> => {
    const cursor = await request<IDBCursor | null>(db.transaction("terms").objectStore("terms").index("dict").openKeyCursor(IDBKeyRange.only(dictionary.id), direction));
    return typeof cursor?.primaryKey === "number" ? cursor.primaryKey : null;
  };
  const [first, last] = await Promise.all([end("next"), end("prev")]);
  if (first === null || last === null) return provides;
  for (let from = first; from <= last; from += COUNT_BATCH) {
    const range = IDBKeyRange.bound(from, Math.min(from + COUNT_BATCH - 1, last));
    const rows = await request<TermRecord[]>(db.transaction("terms").objectStore("terms").getAll(range));
    for (const row of rows) if (row.dict === dictionary.id) tallyTerm(provides, row);
  }
  return provides;
}

/** Keeps what a dictionary was counted to provide. */
export async function setProvides(id: string, provides: Provides): Promise<void> {
  const db = await open();
  const tx = db.transaction("dictionaries", "readwrite");
  const store = tx.objectStore("dictionaries");
  const record = await request<DictionaryRecord | undefined>(store.get(id));
  if (record) store.put({ ...record, provides });
  await finished(tx);
}

/** Puts the dictionaries in this order: the first is shown first. */
export async function orderDictionaries(ids: readonly string[]): Promise<void> {
  const db = await open();
  const tx = db.transaction("dictionaries", "readwrite");
  const store = tx.objectStore("dictionaries");
  const all = await request<DictionaryRecord[]>(store.getAll());
  for (const record of all) {
    const at = ids.indexOf(record.id);
    store.put({ ...record, order: at < 0 ? ids.length + record.order : at });
  }
  await finished(tx);
}

/**
 * Every row of one dictionary's in a store, deleted. An import writes a dictionary's rows one after another, so
 * they're one run of keys: when nothing of another dictionary's is among them, the run goes in one stroke (a few
 * seconds for JMdict's hundreds of thousands, where one at a time took minutes: the owner, 2026-10-16, "it feels as
 * if it's not deleting"). Otherwise they go a cursor at a time.
 */
async function deleteRows(db: IDBDatabase, storeName: "terms" | "meta" | "tags", dict: string): Promise<void> {
  const own = IDBKeyRange.only(dict);
  const end = async (direction: IDBCursorDirection): Promise<IDBValidKey | null> => {
    const cursor = await request<IDBCursor | null>(db.transaction(storeName).objectStore(storeName).index("dict").openKeyCursor(own, direction));
    return cursor ? cursor.primaryKey : null;
  };
  const [first, last] = await Promise.all([end("next"), end("prev")]);
  if (first === null || last === null) return;
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  const run = IDBKeyRange.bound(first, last);
  const [ownRows, rowsInRun] = await Promise.all([request(store.index("dict").count(own)), request(store.count(run))]);
  if (ownRows === rowsInRun) {
    store.delete(run);
  } else {
    await new Promise<void>((resolve, reject) => {
      const req = store.index("dict").openKeyCursor(own);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve();
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      req.onerror = () => reject(req.error ?? new Error("The dictionary database failed."));
    });
  }
  await finished(tx);
}

/** Its words, facts and tags cleared away, then the dictionary itself. */
async function clearAway(db: IDBDatabase, id: string): Promise<void> {
  for (const store of ["terms", "meta", "tags"] as const) await deleteRows(db, store, id);
  const tx = db.transaction("dictionaries", "readwrite");
  tx.objectStore("dictionaries").delete(id);
  await finished(tx);
}

/**
 * Removes a dictionary. It's marked as being removed first, which takes it off every list and out of every look-up at
 * once (`onGone` hears of that, so it can leave the page there and then); then its rows are cleared, and the record
 * goes last. A removal cut short (the page closed) is finished the next time the options page opens
 * (`finishRemovals`).
 */
export async function removeDictionary(id: string, onGone?: () => void): Promise<void> {
  const db = await open();
  const tx = db.transaction("dictionaries", "readwrite");
  const store = tx.objectStore("dictionaries");
  const record = await request<DictionaryRecord | undefined>(store.get(id));
  if (record) store.put({ ...record, removing: true });
  await finished(tx);
  onGone?.();
  await clearAway(db, id);
}

/** Finishes every removal that was cut short. */
export async function finishRemovals(): Promise<void> {
  const db = await open();
  const all = await request<DictionaryRecord[]>(db.transaction("dictionaries").objectStore("dictionaries").getAll());
  for (const record of all) if (record.removing) await clearAway(db, record.id);
}

/** How far an import has got: files read of all there are, and the words kept so far. */
export type Progress = { done: number; of: number; terms: number };

/** The banks of one kind, in their own order: term_bank_1, term_bank_2, … */
function banks(entries: readonly ZipEntry[], kind: "term" | "term_meta" | "tag"): ZipEntry[] {
  const pattern = new RegExp(`^(?:.*/)?${kind}_bank_(\\d+)\\.json$`);
  return entries
    .flatMap((entry) => {
      const match = pattern.exec(entry.name);
      return match ? [{ entry, n: Number(match[1]) }] : [];
    })
    .sort((a, b) => a.n - b.n)
    .map((bank) => bank.entry);
}

/** A bank's rows, or nothing when it isn't a list of rows. */
async function rowsOf(entry: ZipEntry): Promise<unknown[]> {
  const json = await jsonOfEntry(entry);
  if (!Array.isArray(json)) throw new DictionaryError(`${entry.name} isn't a list of rows.`);
  return json;
}

async function putAll(db: IDBDatabase, storeName: "terms" | "meta" | "tags", rows: readonly object[]): Promise<void> {
  if (rows.length === 0) return;
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  for (const row of rows) store.put(row);
  await finished(tx);
}

/**
 * Imports a dictionary's zip: checks it's one, keeps every row of it that reads as a row, and adds it last in the
 * order, switched on. A dictionary already in (by its title) is refused: it's removed first, then imported again. An
 * import that fails part-way takes away what it had kept.
 */
export async function importDictionary(file: Blob, onProgress: (progress: Progress) => void): Promise<DictionaryRecord> {
  let opened: Awaited<ReturnType<typeof openDictionary>>;
  try {
    opened = await openDictionary(file);
  } catch (e) {
    throw new DictionaryError(e instanceof DictionaryFileError ? e.message : "That file couldn't be read.");
  }
  const { entries, index } = opened;
  const db = await open();
  const known = await listDictionaries();
  if (known.some((d) => d.title === index.title)) throw new DictionaryError(`${index.title} is in already. Remove it first to import it again.`);

  const id = uuid();
  const version = versionOf(index);
  const termBanks = banks(entries, "term");
  const metaBanks = banks(entries, "term_meta");
  const tagBanks = banks(entries, "tag");
  const of = termBanks.length + metaBanks.length + tagBanks.length;
  if (of === 0) throw new DictionaryError("That dictionary has nothing in it Panki reads.");
  const counts = { terms: 0, frequencies: 0, pitches: 0 };
  const provides = emptyProvides();
  let done = 0;
  try {
    for (const bank of termBanks) {
      const rows = (await rowsOf(bank)).flatMap((row) => termOf(row, version, id) ?? []);
      await putAll(db, "terms", rows);
      counts.terms += rows.length;
      for (const row of rows) tallyTerm(provides, row);
      onProgress({ done: ++done, of, terms: counts.terms });
    }
    for (const bank of metaBanks) {
      const rows: MetaRecord[] = (await rowsOf(bank)).flatMap((row) => metaOf(row, id) ?? []);
      await putAll(db, "meta", rows);
      for (const row of rows) {
        if (row.mode === "freq") counts.frequencies++;
        else counts.pitches++;
      }
      provides.frequency = counts.frequencies;
      provides.pitch = counts.pitches;
      onProgress({ done: ++done, of, terms: counts.terms });
    }
    for (const bank of tagBanks) {
      const rows: TagRecord[] = (await rowsOf(bank)).flatMap((row) => tagOf(row, id) ?? []);
      await putAll(db, "tags", rows);
      onProgress({ done: ++done, of, terms: counts.terms });
    }
    if (counts.terms + counts.frequencies + counts.pitches === 0) throw new DictionaryError("That dictionary has nothing in it Panki reads.");
    const record: DictionaryRecord = {
      id,
      title: index.title,
      revision: index.revision,
      author: index.author ?? "",
      url: index.url ?? "",
      attribution: index.attribution ?? "",
      description: index.description ?? "",
      ranked: index.frequencyMode !== "occurrence-based",
      counts,
      provides,
      importedAt: Date.now(),
      on: true,
      order: known.reduce((last, d) => Math.max(last, d.order + 1), 0),
    };
    const tx = db.transaction("dictionaries", "readwrite");
    tx.objectStore("dictionaries").put(record);
    await finished(tx);
    return record;
  } catch (e) {
    for (const store of ["terms", "meta", "tags"] as const) await deleteRows(db, store, id).catch(() => undefined);
    if (e instanceof DictionaryError || e instanceof DictionaryFileError || e instanceof ZipError) throw new DictionaryError(e.message);
    throw new DictionaryError("The import stopped part-way. Nothing of it was kept.");
  }
}

/** Every word row whose written form or reading is one of these, of any dictionary. One read for the lot. */
export async function termsFor(keys: readonly string[]): Promise<TermRecord[]> {
  if (keys.length === 0) return [];
  const db = await open();
  const tx = db.transaction("terms");
  const store = tx.objectStore("terms");
  const byTerm = store.index("term");
  const byReading = store.index("reading");
  const found = await Promise.all(keys.flatMap((key) => [request<TermRecord[]>(byTerm.getAll(key)), request<TermRecord[]>(byReading.getAll(key))]));
  const seen = new Set<number>();
  const rows: TermRecord[] = [];
  for (const row of found.flat()) {
    if (row.id === undefined || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}

/** Every frequency and pitch accent kept for these words. */
export async function metaFor(terms: readonly string[]): Promise<MetaRecord[]> {
  if (terms.length === 0) return [];
  const db = await open();
  const index = db.transaction("meta").objectStore("meta").index("term");
  return (await Promise.all(terms.map((term) => request<MetaRecord[]>(index.getAll(term))))).flat();
}

/** The first few rows of one dictionary's words and of its facts about words: what it has inside, to show. */
export async function firstRowsOf(dict: string, count: number): Promise<{ terms: TermRecord[]; meta: MetaRecord[] }> {
  const db = await open();
  const tx = db.transaction(["terms", "meta"]);
  const [terms, meta] = await Promise.all([
    request<TermRecord[]>(tx.objectStore("terms").index("dict").getAll(dict, count)),
    request<MetaRecord[]>(tx.objectStore("meta").index("dict").getAll(dict, count)),
  ]);
  return { terms, meta };
}

/** One dictionary's tags, by name. */
export async function tagsOf(dict: string): Promise<Map<string, TagRecord>> {
  const db = await open();
  const rows = await request<TagRecord[]>(db.transaction("tags").objectStore("tags").index("dict").getAll(dict));
  return new Map(rows.map((row) => [row.name, row]));
}
