import { existsSync } from "node:fs";
import { sizeWords, type MediaKind } from "@panki/contracts";
import { openAuthDb } from "../authDb";
import { userDir } from "../dbs";
import { env } from "../env";
import { sharedDictionaryDir } from "../mediaFiles";
import { accountSpace, backupsSpace, fileCount, folderBytes, sharedBytes, spaceOf, transcriptsSpace } from "../space";

/**
 * `pnpm space`: what Panki's data takes on the disk, account by account (its clips, sounds and pictures, and the rest:
 * the cards and their history), then what everyone shares (the shared store and its dictionaries), the backups, and
 * what's left on that disk. It changes nothing, and can be run while the server is up. The same numbers stand in an admin's Settings
 * (`space.ts` → `storageReport`).
 */

const KIND_WORDS: Record<MediaKind, string> = { video: "Video", audio: "Audio", image: "Images" };
/** The kinds in the order they weigh: clips first. */
const KIND_ORDER: readonly MediaKind[] = ["video", "audio", "image"];

const row = (name: string, size: number, note = "") => console.log(`${name.padEnd(22)}${sizeWords(size).padStart(10)}${note ? `   ${note}` : ""}`);
const files = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;

function main() {
  if (!existsSync(env.dataDir)) {
    console.log(`No data yet in ${env.dataDir}.`);
    return;
  }
  console.log(`Panki's data in ${env.dataDir}\n`);
  const auth = openAuthDb(env.dataDir);
  try {
    for (const user of auth.listUsers()) {
      const taken = accountSpace(userDir(env.dataDir, user.id));
      row(user.name, taken.bytes);
      for (const kind of KIND_ORDER) {
        const of = taken.kinds?.find((k) => k.kind === kind);
        if (of && of.files > 0) row(`  ${KIND_WORDS[kind]}`, of.bytes, files(of.files));
      }
      // Its files couldn't be told apart by kind: they're given as one.
      if (taken.kinds === null && taken.mediaBytes > 0) row("  Files", taken.mediaBytes);
      row("  Cards and history", taken.bytes - taken.mediaBytes);
      console.log("");
    }
  } finally {
    auth.close();
  }
  row("Shared", sharedBytes(env.dataDir));
  const dictionaries = sharedDictionaryDir(env.dataDir);
  const zips = fileCount(dictionaries);
  if (zips > 0) row("  Dictionaries", folderBytes(dictionaries), files(zips));
  // About: worked out from the transcripts' rows (`transcriptsSpace`).
  const transcripts = transcriptsSpace(env.dataDir);
  if (transcripts && transcripts.videos > 0) row("  Transcripts, about", transcripts.bytes, `${transcripts.videos} ${transcripts.videos === 1 ? "video" : "videos"}, ${transcripts.words} words`);
  console.log("");
  const backups = backupsSpace(env.backupDir, env.backupSlots);
  const latest = backups.latestAt === null ? "none yet" : `latest ${new Date(backups.latestAt).toLocaleString("en-GB", { timeZone: env.timeZone, dateStyle: "long", timeStyle: "short" })}`;
  row("Backups", backups.bytes, `${backups.snapshots} of ${backups.keep} slots, ${latest}`);
  if (backups.filesBytes > 0) row("  Files", backups.filesBytes);
  console.log("");
  const space = spaceOf(env.dataDir, env.lowSpaceBytes);
  row("All of Panki", folderBytes(env.dataDir) + backups.bytes);
  row("Left on the disk", space.freeBytes, `of ${sizeWords(space.totalBytes)}`);
  if (space.low) console.log(`\nLow: under ${sizeWords(env.lowSpaceBytes)} left. Everyone signed in is being told on their home screen.`);
}

try {
  main();
} catch (e) {
  console.error("Something went wrong.", e);
  process.exitCode = 1;
}
