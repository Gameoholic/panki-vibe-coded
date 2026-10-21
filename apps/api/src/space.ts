import { existsSync, readdirSync, statSync, statfsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MediaKind, type Space, type StorageReport } from "@panki/contracts";
import type { AuthDb } from "./authDb";
import { userDir } from "./dbs";
import { mediaDir, sharedDictionaryDir } from "./mediaFiles";

/**
 * How much room Panki's data has and takes. The disk is asked each time (it's one cheap call), never remembered:
 * other things on the machine fill it too.
 */

/** What's left on the disk a folder is on, and the whole of it. What's left is what Panki itself may still write. */
export function diskOf(dir: string): Pick<Space, "freeBytes" | "totalBytes"> {
  const disk = statfsSync(dir);
  return { freeBytes: disk.bavail * disk.bsize, totalBytes: disk.blocks * disk.bsize };
}

/** The disk under the data, and whether what's left is under the floor. */
export function spaceOf(dataDir: string, lowBytes: number): Space {
  const disk = diskOf(dataDir);
  return { ...disk, low: disk.freeBytes < lowBytes };
}

/** Everything in a folder and under it, in bytes. A file that goes away while it's being counted counts for nothing. */
export function folderBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) bytes += folderBytes(at);
    else if (entry.isFile()) bytes += statSync(at, { throwIfNoEntry: false })?.size ?? 0;
  }
  return bytes;
}

/** How many files a folder holds, itself alone (the shared dictionaries are one flat folder of zips). */
export function fileCount(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).length;
}

/** A file's size, or nothing when it isn't there. */
export function fileBytes(file: string): number {
  return statSync(file, { throwIfNoEntry: false })?.size ?? 0;
}

export type FilesOfKind = { kind: MediaKind; bytes: number; files: number };

/**
 * An account's files by kind, read from its own list of them. Opened for reading only, so nothing is changed and no
 * migration is run under a server that has the same database open. Null when the list can't be read (an account from
 * before files, or a database something else has locked).
 */
function filesByKind(userDir: string): FilesOfKind[] | null {
  const file = path.join(userDir, "panki.sqlite");
  if (!existsSync(file)) return null;
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const rows = db.prepare("SELECT kind, SUM(bytes) AS bytes, COUNT(*) AS files FROM media GROUP BY kind").all();
      return MediaKind.options.map((kind) => {
        const row = rows.find((r) => r.kind === kind);
        return { kind, bytes: Number(row?.bytes ?? 0), files: Number(row?.files ?? 0) };
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** What one account takes on the disk: all of its folder, how much of that is files on cards, and those by kind. */
export function accountSpace(userDir: string): { bytes: number; mediaBytes: number; kinds: FilesOfKind[] | null } {
  return { bytes: folderBytes(userDir), mediaBytes: folderBytes(mediaDir(userDir)), kinds: filesByKind(userDir) };
}

/** Bytes a row takes besides its words and ids: its header, its rowid, its numbers; and the share of a page left empty. */
const ROW_OVERHEAD = { word: 30, wordIndex: 12, piece: 60, pieceIndex: 10, fix: 30, quiet: 100 } as const;
const PAGE_SLACK = 1.25;

/**
 * What the transcripts take in the shared store, worked out from their rows (the owner, 2026-10-22: "add to the storage
 * how much is taken up by transcripts"): every word (its text, its video, its piece, its index entry, those taken out
 * included, as they're kept), every piece of sound sent, every fix and every stretch of quiet, with what a row and a
 * page take besides. About, not exact: Node's SQLite can't say what each table takes on the disk (it has no `dbstat`).
 * Opened for reading only; null when the store can't be read.
 */
export function transcriptsSpace(dataDir: string): { bytes: number; videos: number; words: number } | null {
  const file = path.join(dataDir, "shared.sqlite");
  if (!existsSync(file)) return null;
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const one = (sql: string) => db.prepare(sql).get() ?? {};
      const num = (value: unknown) => Number(value ?? 0);
      const videos = num(one("SELECT COUNT(*) AS n FROM transcripts").n);
      const words = one("SELECT COUNT(*) AS n, SUM(LENGTH(CAST(text AS BLOB)) + 2 * LENGTH(video_id) + LENGTH(piece_id)) AS data FROM transcript_words");
      const pieces = one("SELECT COUNT(*) AS n, SUM(2 * LENGTH(id) + LENGTH(video_id) + LENGTH(engine) + LENGTH(user_id)) AS data FROM transcript_pieces");
      const fixes = one("SELECT COUNT(*) AS n, SUM(LENGTH(CAST(from_text AS BLOB)) + LENGTH(CAST(to_text AS BLOB)) + LENGTH(user_id)) AS data FROM transcript_fixes");
      const quiet = one("SELECT COUNT(*) AS n FROM transcript_quiet");
      const raw =
        num(words.data) +
        num(words.n) * (ROW_OVERHEAD.word + ROW_OVERHEAD.wordIndex) +
        num(pieces.data) +
        num(pieces.n) * (ROW_OVERHEAD.piece + ROW_OVERHEAD.pieceIndex) +
        num(fixes.data) +
        num(fixes.n) * ROW_OVERHEAD.fix +
        num(quiet.n) * ROW_OVERHEAD.quiet;
      return { bytes: Math.round(raw * PAGE_SLACK), videos, words: num(words.n) };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** The shared store's database with its WAL files, and everything under the shared folder. */
export function sharedBytes(dataDir: string): number {
  const database = ["shared.sqlite", "shared.sqlite-wal", "shared.sqlite-shm"].reduce((sum, name) => sum + fileBytes(path.join(dataDir, name)), 0);
  return database + folderBytes(path.join(dataDir, "shared"));
}

/**
 * The whole of it as one report, for an admin's Settings and for `pnpm space`: each account, what everyone shares, all
 * of Panki, and the disk. Read afresh each time; it walks every file, so it's asked for on purpose, never on every screen.
 */
export function storageReport(dataDir: string, auth: AuthDb, lowBytes: number): StorageReport {
  const dictionaries = sharedDictionaryDir(dataDir);
  return {
    accounts: auth.listUsers().map((user) => ({ name: user.name, ...accountSpace(userDir(dataDir, user.id)) })),
    shared: { bytes: sharedBytes(dataDir), dictionaries: { bytes: folderBytes(dictionaries), files: fileCount(dictionaries) }, transcripts: transcriptsSpace(dataDir) },
    allBytes: folderBytes(dataDir),
    disk: spaceOf(dataDir, lowBytes),
  };
}
