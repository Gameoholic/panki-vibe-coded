import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * The backup folder's snapshots: one folder per `pnpm backup` run, named for its moment ("2026-10-17T21-05-33Z"), beside
 * the one `files` folder every run shares. Only the newest few are kept (the owner, 2026-10-22: "it should only store up
 * to 3 slots at a time"); the files stay, as every snapshot's cards may name them. Nothing but a folder named exactly
 * like a snapshot is ever taken away.
 */

const SNAPSHOT_NAME = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/;

/** A moment as its snapshot's folder name: the ISO time to the second, its colons dashes (Windows has no colons in names). */
export function snapshotName(at: Date): string {
  return at.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

/** The moment a snapshot's folder is named for, in ms since the epoch. */
export function momentOf(name: string): number {
  const [, day, h, m, s] = SNAPSHOT_NAME.exec(name) ?? [];
  return Date.parse(`${day}T${h}:${m}:${s}Z`);
}

/** The snapshots in a backup folder, oldest first (their names sort as their moments do). */
export function snapshotsIn(backupDir: string): string[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SNAPSHOT_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** Every snapshot but the newest `keep` taken away; the ones taken away. */
export function pruneSnapshots(backupDir: string, keep: number): string[] {
  const gone = snapshotsIn(backupDir).slice(0, -keep);
  for (const name of gone) rmSync(path.join(backupDir, name), { recursive: true });
  return gone;
}
