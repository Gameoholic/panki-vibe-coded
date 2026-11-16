/** @panki A download in words, the same in the panel's menu and on the options page (`shareOf`, `downloadWords`, `totalWords`). */
import { sizeWords } from "@panki/contracts";
import { agoWords, daysOf, percentOf } from "@web/words";
import type { DownloadRow } from "./download";

/** How much of the video is in, as a whole percent down (`percentOf`), never 100 before it's whole. */
export const shareOf = (row: DownloadRow): number => (row.state === "done" ? 100 : Math.min(99, percentOf(row.coveredMs, row.durationMs)));

/**
 * How a download stands, as its row's line under its name: whole, its size, quality and when ("412 MB · 720p · Today");
 * being downloaded, how far ("Downloading · 34%"); or waiting, how far and why it stopped when it did.
 */
export function downloadWords(row: DownloadRow, now: number): string {
  if (row.state === "done") return [sizeWords(row.bytes), `${row.quality}p`, row.doneAt === null ? null : agoWords(row.doneAt, now, daysOf(null))].filter((part) => part !== null).join(" · ");
  if (row.state === "going") return `Downloading · ${shareOf(row)}%`;
  return [`Waiting · ${shareOf(row)}%`, row.trouble].filter((part) => part !== null).join(" · ");
}

/** Every download together: how many, and the room they take ("3 videos · 1.2 GB"). */
export const totalWords = (rows: readonly DownloadRow[]): string =>
  `${rows.length} ${rows.length === 1 ? "video" : "videos"} · ${sizeWords(rows.reduce((sum, row) => sum + row.bytes, 0))}`;
