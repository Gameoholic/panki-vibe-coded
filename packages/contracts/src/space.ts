import { z } from "zod";

/** The disk Panki keeps its data on: how much of it is left, and whether that's little enough to say so. */
export const Space = z.object({
  /** Bytes still free there. */
  freeBytes: z.number().int().nonnegative(),
  /** The whole of the disk, in bytes. */
  totalBytes: z.number().int().nonnegative(),
  /** What's left is under the floor the API speaks up at. Decided by the API; the browser only shows it. */
  low: z.boolean(),
});
export type Space = z.infer<typeof Space>;

export const SpaceResponse = z.object({ space: Space });

const bytes = z.number().int().nonnegative();
const files = z.number().int().nonnegative();
/** Files of one kind: how many and how heavy. */
export const FilesOfKind = z.object({ kind: z.enum(["video", "audio", "image"]), bytes, files });
export type FilesOfKind = z.infer<typeof FilesOfKind>;

/**
 * What Panki's data takes on the disk, read-only, for an admin (the owner, 2026-10-17: "the current storage plus storage
 * allocated, so I know once the videos and audios take too much space"): each account's folder, its files on cards by
 * kind (null when they couldn't be told apart) and the rest (its cards and history), what everyone shares, the whole
 * of Panki, and the disk itself. Nothing here is a thing to do; what `pnpm space` prints, as a shape.
 */
export const StorageReport = z.object({
  accounts: z.array(
    z.object({
      name: z.string(),
      bytes,
      /** Its files on cards, all kinds together. */
      mediaBytes: bytes,
      kinds: z.array(FilesOfKind).nullable(),
    }),
  ),
  shared: z.object({
    bytes,
    dictionaries: z.object({ bytes, files }),
    /** The transcripts in the shared store: about how much they take (worked out from their rows), how many videos, how many words; null when it couldn't be read. */
    transcripts: z.object({ bytes, videos: files, words: files }).nullable(),
  }),
  /**
   * `pnpm backup`'s folder: all it takes, how many snapshots are in it of the most it keeps, when the newest was taken
   * (ms since the epoch, null with none yet), and the files every snapshot shares.
   */
  backups: z.object({ bytes, snapshots: files, keep: files, latestAt: z.number().int().nullable(), filesBytes: bytes }),
  /** Everything under the data folder, and the backups. */
  allBytes: bytes,
  disk: Space,
});
export type StorageReport = z.infer<typeof StorageReport>;
export const StorageReportResponse = z.object({ report: StorageReport });

const UNITS = ["bytes", "KB", "MB", "GB", "TB"] as const;

/** A number of bytes as it's read: "512 bytes", "412 MB", "3.1 GB". One decimal while the number is small, none after. */
export function sizeWords(bytes: number): string {
  let amount = Math.max(0, bytes);
  let unit = 0;
  while (amount >= 1024 && unit < UNITS.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  const shown = unit === 0 || amount >= 100 ? Math.round(amount).toString() : amount.toFixed(1);
  return `${shown} ${UNITS[unit] ?? "bytes"}`;
}
