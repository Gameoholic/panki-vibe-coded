import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * An account's files (a clip, a recording, a picture) sit beside its database, in a `media` folder, one file per id
 * and nothing but the id for a name: what a file is comes from its row, never from how it's called on disk.
 */
export function mediaDir(userDir: string): string {
  return path.resolve(userDir, "media");
}

/**
 * The dictionaries an account keeps on Panki sit beside its database the same way, in a `dictionaries` folder, one zip
 * per id, written and read by the same functions here.
 */
export function dictionaryDir(userDir: string): string {
  return path.resolve(userDir, "dictionaries");
}

/**
 * The dictionaries everyone shares (since 2026-10-17 they're the shared store's, not an account's) sit under the data
 * folder's `shared/dictionaries`, one zip per id, written and read by the same functions here.
 */
export function sharedDictionaryDir(dataDir: string): string {
  return path.resolve(dataDir, "shared", "dictionaries");
}

/** A file let go of: gone from the disk. One that's gone already is no matter. */
export function removeFile(dir: string, id: string): void {
  rmSync(path.join(dir, id), { force: true });
}

export function hasMediaFile(dir: string, id: string): boolean {
  return existsSync(path.join(dir, id));
}

/** Written under another name and moved onto its own, so a file is whole or not there at all. */
export function writeMediaFile(dir: string, id: string, bytes: Buffer): void {
  mkdirSync(dir, { recursive: true });
  const part = path.join(dir, `${id}.${randomUUID()}.part`);
  try {
    writeFileSync(part, bytes, { flag: "wx" });
    renameSync(part, path.join(dir, id));
  } catch (e) {
    rmSync(part, { force: true });
    throw e;
  }
}

function startsWith(bytes: Buffer, ...head: number[]): boolean {
  return bytes.length >= head.length && head.every((byte, i) => bytes[i] === byte);
}
function says(bytes: Buffer, at: number, word: string): boolean {
  return bytes.length >= at + word.length && bytes.toString("latin1", at, at + word.length) === word;
}

/**
 * What a file's first bytes say it is: every type Panki takes that begins this way, none when it's nothing Panki
 * takes. The type a request names is only a claim; this is what's believed. A container says nothing of what's
 * inside, so webm and mp4 answer for sound and for picture alike.
 */
export function sniffMimes(bytes: Buffer): readonly string[] {
  if (startsWith(bytes, 0x1a, 0x45, 0xdf, 0xa3)) return ["audio/webm", "video/webm"];
  if (says(bytes, 4, "ftyp")) return ["audio/mp4", "video/mp4"];
  if (says(bytes, 0, "OggS")) return ["audio/ogg"];
  if (startsWith(bytes, 0xff, 0xd8, 0xff)) return ["image/jpeg"];
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return ["image/png"];
  if (says(bytes, 0, "RIFF") && says(bytes, 8, "WEBP")) return ["image/webp"];
  // An MP3 opens with its tag, or straight with a frame: eleven set bits.
  if (says(bytes, 0, "ID3") || (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return ["audio/mpeg"];
  return [];
}

/**
 * Whether a file's first bytes are a WAV's: the sound of a piece to transcribe, which the extension records as PCM in
 * that container. Not among `MEDIA_MIMES`: a WAV is never kept as a card's file, only handed on to an engine.
 */
export function isWav(bytes: Buffer): boolean {
  return says(bytes, 0, "RIFF") && says(bytes, 8, "WAVE");
}
