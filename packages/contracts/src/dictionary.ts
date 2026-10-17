import { z } from "zod";
import { ZipError, readZip, type ZipEntry } from "./zip";

/**
 * A dictionary file as far as both ends read it: what its `index.json` says it is, read out of its zip the same way
 * by the extension (importing it) and by the API (keeping it, to be added to the extension from). And a dictionary
 * kept on Panki's server, as the API tells of it. The format is Yomitan's; how the extension reads the rest of a
 * dictionary (its words, frequencies, pitch accents) is the extension's (`dictionary/format.ts`).
 */

const text = (max: number) => z.string().max(max);
/** A field the format calls optional, that some dictionary somewhere gets wrong: dropped rather than refused. */
const maybe = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

export const DictionaryIndex = z.object({
  title: text(200).min(1),
  revision: text(200).catch(""),
  /** The format's version: 3 is today's, 1 the first (the rows differ). Named `version` in older files. */
  format: maybe(z.number()),
  version: maybe(z.number()),
  author: maybe(text(500)),
  url: maybe(text(500)),
  description: maybe(text(5000)),
  attribution: maybe(text(5000)),
  /** How a frequency list counts: by rank (1 is the most common) or by how often a word was seen (more is more common). */
  frequencyMode: maybe(z.enum(["occurrence-based", "rank-based"])),
});
export type DictionaryIndex = z.infer<typeof DictionaryIndex>;

/** A dictionary file that isn't one Panki reads, said in words that say why. */
export class DictionaryFileError extends Error {}

/** A file inside a dictionary's zip, read as JSON. */
export async function jsonOfEntry(entry: ZipEntry): Promise<unknown> {
  const bytes = await entry.read();
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new DictionaryFileError(`${entry.name} isn't readable.`);
  }
}

/** A dictionary's zip opened: the files in it, and its `index.json` read and checked. Refused when it isn't one. */
export async function openDictionary(file: Blob): Promise<{ entries: ZipEntry[]; index: DictionaryIndex }> {
  let entries: ZipEntry[];
  try {
    entries = await readZip(file);
  } catch (e) {
    throw new DictionaryFileError(e instanceof ZipError ? e.message : "That file couldn't be read.");
  }
  const indexEntry = entries.find((entry) => /^(?:.*\/)?index\.json$/.test(entry.name));
  if (!indexEntry) throw new DictionaryFileError("That zip isn't a dictionary: it has no index.json.");
  const index = DictionaryIndex.safeParse(await jsonOfEntry(indexEntry));
  if (!index.success) throw new DictionaryFileError("That dictionary's index.json doesn't say what it is.");
  return { entries, index: index.data };
}

/** Minted by whoever uploads, so sending the same file again is harmless. */
export const DictionaryFileId = z.uuid();

const MB = 1024 * 1024;
/** The most a dictionary kept on Panki may weigh. The biggest the owner has is under 40 MB. */
export const DICTIONARY_MAX_BYTES = 200 * MB;

/** A dictionary kept on Panki's server, to be added to the extension from: what its index.json says it is, and how big its zip is. */
export const ServerDictionary = z.object({
  id: DictionaryFileId,
  title: z.string(),
  revision: z.string(),
  /** What it says about itself, when it does; empty when it doesn't. */
  description: z.string(),
  bytes: z.number().int().positive(),
  /** Stamped by the API, ms since epoch. */
  uploadedAt: z.number().int().nonnegative(),
});
export type ServerDictionary = z.infer<typeof ServerDictionary>;

export const ServerDictionaryList = z.object({ dictionaries: z.array(ServerDictionary) });
export const ServerDictionaryResponse = z.object({ dictionary: ServerDictionary });
