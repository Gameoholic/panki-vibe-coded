import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sizeWords } from "@panki/contracts";
import { userDir } from "../dbs";
import { env } from "../env";
import { dictionaryDir, mediaDir, sharedDictionaryDir } from "../mediaFiles";

/**
 * `pnpm backup [dir]`: a copy of everything Panki keeps, safe to run while the API is up. Each database is snapshotted
 * with SQLite's own `VACUUM INTO` through a read-only connection: a consistent copy of what was committed, and nothing
 * here can change the data. The snapshots go in a folder named for the moment, one per run. The files (the clips,
 * sounds and pictures on cards, the dictionary zips) never change under their names, so they're copied once each into
 * one `files` folder shared by every run, and a run after the first copies only what's new. Nothing in the backup
 * folder is ever deleted or overwritten by this; pruning old snapshots is the owner's.
 *
 *   <dir>/2026-10-17T21-05-33Z/auth.sqlite, shared.sqlite, users/<account id>/panki.sqlite
 *   <dir>/files/shared/dictionaries/<id>, users/<account id>/media/<id>
 *
 * Restoring is the reverse, with the API stopped: a snapshot's databases over the data folder's, and the files from
 * `files/` where they were (`RUNNING.md`).
 */

const row = (name: string, size: number, note = "") => console.log(`${name.padEnd(28)}${sizeWords(size).padStart(10)}${note ? `   ${note}` : ""}`);
const files = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;

/** A consistent copy of a database as it stands, read through a connection that can write nothing. */
function snapshot(from: string, to: string): number {
  mkdirSync(path.dirname(to), { recursive: true });
  const db = new DatabaseSync(from, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.prepare("VACUUM INTO ?").run(to);
  } finally {
    db.close();
  }
  return statSync(to).size;
}

/** Every file of a flat folder copied into its mirror once (a name with a dot is a write under way, not a file of Panki's); what was new. */
function mirror(from: string, to: string): { files: number; bytes: number } {
  const copied = { files: 0, bytes: 0 };
  if (!existsSync(from)) return copied;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.includes(".")) continue;
    const target = path.join(to, entry.name);
    if (existsSync(target)) continue;
    copyFileSync(path.join(from, entry.name), target, constants.COPYFILE_EXCL);
    copied.files += 1;
    copied.bytes += statSync(target).size;
  }
  return copied;
}

/** The account folders under `users/`, by id. */
function accountIds(dataDir: string): string[] {
  const dir = path.join(dataDir, "users");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function main() {
  const dataDir = env.dataDir;
  if (!existsSync(dataDir)) {
    console.log(`No data yet in ${dataDir}.`);
    return;
  }
  const backupDir = path.resolve(process.argv[2] ?? env.backupDir);
  if (path.resolve(backupDir).startsWith(path.resolve(dataDir) + path.sep)) {
    console.error("The backup folder can't be inside the data folder.");
    process.exitCode = 1;
    return;
  }
  const stamp = new Date().toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
  const snapshotDir = path.join(backupDir, stamp);
  const filesDir = path.join(backupDir, "files");
  console.log(`Backing up ${dataDir}\n`);

  for (const name of ["auth.sqlite", "shared.sqlite"]) {
    const from = path.join(dataDir, name);
    if (existsSync(from)) row(name, snapshot(from, path.join(snapshotDir, name)));
  }
  const dictionaries = mirror(sharedDictionaryDir(dataDir), path.join(filesDir, "shared", "dictionaries"));
  if (dictionaries.files > 0) row("  dictionaries, new", dictionaries.bytes, files(dictionaries.files));

  for (const id of accountIds(dataDir)) {
    const account = userDir(dataDir, id);
    const database = path.join(account, "panki.sqlite");
    if (existsSync(database)) row(`users/${id.slice(0, 8)}…/panki.sqlite`, snapshot(database, path.join(snapshotDir, "users", id, "panki.sqlite")));
    const media = mirror(mediaDir(account), path.join(filesDir, "users", id, "media"));
    if (media.files > 0) row("  files, new", media.bytes, files(media.files));
    // An account's own dictionaries from before they were everyone's, should any still be there.
    const own = mirror(dictionaryDir(account), path.join(filesDir, "users", id, "dictionaries"));
    if (own.files > 0) row("  dictionaries, new", own.bytes, files(own.files));
  }

  console.log(`\nSnapshot in ${snapshotDir}\nFiles in ${filesDir}`);
}

try {
  main();
} catch (e) {
  console.error("Something went wrong.", e);
  process.exitCode = 1;
}
