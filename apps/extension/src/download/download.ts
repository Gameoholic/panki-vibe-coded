/** @panki A download's numbers, qualities and shapes, and how much is in (`DOWNLOAD`, `DOWNLOAD_QUALITIES`, `DoorwayPiece`, `KeptPiece`, `DownloadRow`, `coveredOf`, `firstGap`). */
import { z } from "zod";
import { VideoId } from "@panki/contracts";
import { NOTE_WORD, PIECE_WORD } from "./mark";

/**
 * A video downloaded is the pieces YouTube's own player hands the browser to play, copied as they go by
 * (`content/doorway.ts`) while the video is played through fast in a hidden frame (`transcribe/silent.ts`), each kept as
 * it came with what's needed to hand it back in order: which stream it belongs to (the picture or the sound), its kind
 * of file, whether it's the stream's start piece (what a player has to be given before any of the rest), and the
 * stretch of the video it added. They're kept in the extension's own database (`download/store.ts`), this browser's alone.
 */

/** Every number downloading is tuned by, in one place. */
export const DOWNLOAD = {
  /** How fast the hidden player plays the video through: four times, what the transcriber plays at. */
  speed: 4,
  /** How often the page looks at the download it runs, ms. */
  lookMs: 1000,
  /** How often a page with no download running asks whether there's one waiting, ms. */
  claimEveryMs: 10_000,
  /** How often the page running a download says it still is, between its pieces, ms. */
  holdEveryMs: 5000,
  /** A download its page hasn't spoken of for this long is let go, for another page to take up, ms. */
  holdMs: 90_000,
  /** Two stretches kept this close together count as one: a stream's pieces meet up to a frame apart, ms. */
  mergeGapMs: 250,
  /** The end of a video short of this, uncovered, still counts as the whole of it: the picture and the sound end a little apart, ms. */
  endSlackMs: 1500,
  /** A stream whose length is known and this or more off the video's is another one (an ad's), and nothing of it is kept, ms. */
  durationSlackMs: 3000,
  /** Reaching a stretch kept on an earlier run, longer than this, the hidden player goes on past it, ms. */
  skipMs: 5000,
  /** Played this far into a run with nothing copied, the download is stopped as one that can't work, seconds of the video. */
  nothingSeconds: 30,
  /** How long a download that stopped waits before it's tried again, ms, longer each time in a row, the last for every try after. */
  retryMs: [30_000, 60_000, 120_000, 300_000, 600_000],
  /** The largest one piece may be: the player hands over a few megabytes at most. */
  pieceMaxBytes: 32 * 1024 * 1024,
  /** The picture kept to show a download by, taken off the video as Download is pressed: its width in pixels, and its JPEG quality. */
  stillWidth: 192,
  stillQuality: 0.72,
} as const;

/** The largest a piece may be as text, a third more than its bytes. */
export const PIECE_BASE64_MAX = Math.ceil((DOWNLOAD.pieceMaxBytes * 4) / 3) + 4;
/** The most stretches of a stream's buffer a piece says. */
const RANGES_MAX = 64;
/** The still as text: a JPEG of a few dozen kilobytes. */
const STILL_MAX = 400_000;
/** The most a download's reason for stopping says: room for each step of starting the hidden player. */
export const TROUBLE_MAX = 600;

/** The qualities a video can be downloaded at, by the height of its picture; 720p to begin with. */
export const DOWNLOAD_QUALITIES = [
  { id: "360", label: "360p" },
  { id: "480", label: "480p" },
  { id: "720", label: "720p" },
  { id: "1080", label: "1080p" },
] as const;
export const DownloadQuality = z.enum(["360", "480", "720", "1080"]);
export type DownloadQuality = z.infer<typeof DownloadQuality>;
export const DEFAULT_DOWNLOAD_QUALITY: DownloadQuality = "720";

/** A stretch of a stream's buffer, in seconds, as the browser says it. */
const Range = z.tuple([z.number(), z.number()]);

/**
 * What the doorway script sends back for each piece the site's player appended (`content/doorway.ts`): the run's mark;
 * which stream of the page's it went to (counted as the page makes them, so an ad's stream is told from the video's) and
 * that stream's length in seconds, null while it isn't known; the kind of file the stream plays (its MIME type, as the
 * player named it); the time offset and the window the player had set on it; the stream's buffered stretches before and
 * after; and the bytes, as text.
 */
export const DoorwayPiece = z.object({
  kind: z.literal(PIECE_WORD),
  mark: z.string().max(64),
  stream: z.number().int().nonnegative(),
  duration: z.number().nonnegative().nullable(),
  type: z.string().max(200),
  offset: z.number(),
  window: z.tuple([z.number(), z.number().nullable()]),
  before: z.array(Range).max(RANGES_MAX),
  after: z.array(Range).max(RANGES_MAX),
  base64: z.string().max(PIECE_BASE64_MAX),
});
export type DoorwayPiece = z.infer<typeof DoorwayPiece>;

/**
 * What the doorway script says of itself, so a run that copies nothing can say where it stopped: it woke in the frame
 * (`awake`), or the site's player made a stream (`stream`, with its kind of file).
 */
export const DoorwayNote = z.object({ kind: z.literal(NOTE_WORD), mark: z.string().max(64), note: z.enum(["awake", "stream"]), type: z.string().max(200).nullable() });
export type DoorwayNote = z.infer<typeof DoorwayNote>;

/** The two streams a video is played from. */
export const Track = z.enum(["video", "audio"]);
export type Track = z.infer<typeof Track>;
/** Which stream a kind of file plays, by its MIME type; null for anything else. */
export const trackOf = (type: string): Track | null => (type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : null);

/**
 * A stream's start piece, by its first bytes: a WebM's EBML header, or an MP4's `ftyp` box. The rest of a stream's
 * pieces are its frames, which can't be played without the start piece before them.
 */
export function startPiece(bytes: Uint8Array): boolean {
  const webm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const mp4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  return webm || mp4;
}

const Ms = z.number().int();
/**
 * A piece as it's kept, all but its bytes: its place in the order it came in (`seq`, the video's own count), its stream
 * and kind of file, whether it's that stream's start piece, the stretch of the video it added (null when it added none),
 * the offset and the window the player had set, and its size.
 */
export const KeptPiece = z.object({
  videoId: VideoId,
  seq: Ms.nonnegative(),
  track: Track,
  type: z.string().max(200),
  init: z.boolean(),
  fromMs: Ms.nonnegative().nullable(),
  toMs: Ms.nonnegative().nullable(),
  offsetMs: Ms,
  windowMs: z.tuple([Ms, Ms.nullable()]),
  size: Ms.nonnegative(),
  keptAt: z.number(),
});
export type KeptPiece = z.infer<typeof KeptPiece>;
/** A piece as a page sends it to be kept: the worker gives it its place and its size. */
export const PieceAsk = KeptPiece.omit({ videoId: true, seq: true, size: true, keptAt: true });
export type PieceAsk = z.infer<typeof PieceAsk>;

/** What's known of the video as Download is pressed: its name and channel as the page shows them, its length, and a still. */
export const DownloadAbout = z.object({
  videoId: VideoId,
  title: z.string().max(300),
  channel: z.string().max(100),
  durationMs: Ms.positive(),
  still: z.string().max(STILL_MAX).nullable(),
});
export type DownloadAbout = z.infer<typeof DownloadAbout>;

/**
 * A download as it's kept: what's known of the video, the quality it's downloaded at (the picture's height), when it was
 * asked for and when it was whole; which page is running it and when it last said so; and why it last stopped, with
 * how many times in a row, so it waits longer before each try.
 */
export const DownloadVideo = DownloadAbout.extend({
  quality: Ms.positive(),
  startedAt: z.number(),
  doneAt: z.number().nullable(),
  heldBy: z.number().int().nullable(),
  heldAt: z.number().nullable(),
  trouble: z.string().max(TROUBLE_MAX).nullable(),
  troubleAt: z.number().nullable(),
  tries: Ms.nonnegative(),
});
export type DownloadVideo = z.infer<typeof DownloadVideo>;

/** How a download stands: whole, being downloaded by a page now, or waiting for one (another first, or tried again soon). */
export const DownloadState = z.enum(["done", "going", "waiting"]);
export type DownloadState = z.infer<typeof DownloadState>;

/** A download as it's listed: what's kept of it, how it stands, how much of the video is in, and its size. */
export const DownloadRow = DownloadVideo.omit({ heldBy: true, heldAt: true, troubleAt: true, tries: true }).extend({
  state: DownloadState,
  coveredMs: Ms.nonnegative(),
  bytes: Ms.nonnegative(),
});
export type DownloadRow = z.infer<typeof DownloadRow>;

/** How the page running a download says it stands: still going, whole, or stopped and why. */
export const HoldEnd = z.discriminatedUnion("kind", [z.object({ kind: z.literal("going") }), z.object({ kind: z.literal("done") }), z.object({ kind: z.literal("stopped"), trouble: z.string().max(TROUBLE_MAX) })]);
export type HoldEnd = z.infer<typeof HoldEnd>;

/** A stretch of the video, ms. */
export type Stretch = { fromMs: number; toMs: number };
export const StretchShape = z.object({ fromMs: Ms.nonnegative(), toMs: Ms.nonnegative() });

/** A stretch one stream covers. */
const TrackStretch = StretchShape.extend({ track: Track });
export type TrackStretch = z.infer<typeof TrackStretch>;
/** A download handed to a page to run: the video, how long it is, at what quality, and what each stream holds already. */
export const DownloadJob = z.object({ videoId: VideoId, durationMs: Ms.positive(), quality: Ms.positive(), covered: z.array(TrackStretch) });
export type DownloadJob = z.infer<typeof DownloadJob>;

/** Stretches in order, those that touch or come within `DOWNLOAD.mergeGapMs` of each other made one. */
export function merged(stretches: readonly Stretch[]): Stretch[] {
  const sorted = stretches.filter((s) => s.toMs > s.fromMs).sort((a, b) => a.fromMs - b.fromMs);
  const out: Stretch[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && s.fromMs <= last.toMs + DOWNLOAD.mergeGapMs) last.toMs = Math.max(last.toMs, s.toMs);
    else out.push({ ...s });
  }
  return out;
}

/** Where two sets of merged stretches both cover. */
function both(a: readonly Stretch[], b: readonly Stretch[]): Stretch[] {
  const out: Stretch[] = [];
  for (const x of a) for (const y of b) {
    const fromMs = Math.max(x.fromMs, y.fromMs);
    const toMs = Math.min(x.toMs, y.toMs);
    if (toMs > fromMs) out.push({ fromMs, toMs });
  }
  return merged(out);
}

/** What each stream covers, merged: from its pieces, or from stretches of it known already. */
export function trackStretchesOf(pieces: readonly { track: Track; fromMs: number | null; toMs: number | null }[]): TrackStretch[] {
  const byTrack = new Map<Track, Stretch[]>();
  for (const piece of pieces) {
    if (piece.fromMs === null || piece.toMs === null) continue;
    byTrack.set(piece.track, [...(byTrack.get(piece.track) ?? []), { fromMs: piece.fromMs, toMs: piece.toMs }]);
  }
  return [...byTrack.entries()].flatMap(([track, stretches]) => merged(stretches).map((s) => ({ track, ...s })));
}

/** What of the video can be played from what's kept: where every stream it has pieces of covers. */
export function coveredOf(pieces: readonly { track: Track; fromMs: number | null; toMs: number | null }[]): Stretch[] {
  const byTrack = new Map<Track, Stretch[]>();
  for (const s of trackStretchesOf(pieces)) byTrack.set(s.track, [...(byTrack.get(s.track) ?? []), { fromMs: s.fromMs, toMs: s.toMs }]);
  const [first, ...rest] = [...byTrack.values()];
  return first ? rest.reduce(both, first) : [];
}

/** How much of the video the stretches cover, ms, never past its end. */
export const coveredMsOf = (covered: readonly Stretch[], durationMs: number): number =>
  covered.reduce((sum, s) => sum + Math.max(0, Math.min(s.toMs, durationMs) - Math.max(0, s.fromMs)), 0);

/** The first moment of the video not covered, ms; null once the whole of it is, the last `endSlackMs` aside. */
export function firstGap(covered: readonly Stretch[], durationMs: number): number | null {
  let at = 0;
  for (const s of merged(covered)) {
    if (s.fromMs > at + DOWNLOAD.mergeGapMs) break;
    at = Math.max(at, s.toMs);
  }
  return at >= durationMs - DOWNLOAD.endSlackMs ? null : at;
}

/** Where the stretch covering a moment ends, ms; null when none covers it. */
export const coveredUntil = (covered: readonly Stretch[], atMs: number): number | null => merged(covered).find((s) => s.fromMs <= atMs && atMs < s.toMs)?.toMs ?? null;

/** What a stream's buffer gained from one piece: the stretches after, less those before, ms; null when it gained nothing. */
export function gainedOf(before: readonly (readonly [number, number])[], after: readonly (readonly [number, number])[]): Stretch | null {
  const had = before.map(([from, to]) => ({ fromMs: Math.round(from * 1000), toMs: Math.round(to * 1000) }));
  const gained: Stretch[] = [];
  for (const [from, to] of after) {
    let parts: Stretch[] = [{ fromMs: Math.round(from * 1000), toMs: Math.round(to * 1000) }];
    for (const h of had)
      parts = parts.flatMap((p) => [
        ...(h.fromMs > p.fromMs ? [{ fromMs: p.fromMs, toMs: Math.min(p.toMs, h.fromMs) }] : []),
        ...(h.toMs < p.toMs ? [{ fromMs: Math.max(p.fromMs, h.toMs), toMs: p.toMs }] : []),
      ]);
    gained.push(...parts.filter((p) => p.toMs > p.fromMs));
  }
  if (gained.length === 0) return null;
  return { fromMs: Math.max(0, Math.min(...gained.map((g) => g.fromMs))), toMs: Math.max(...gained.map((g) => g.toMs)) };
}

/** How long a download that stopped `tries` times in a row waits before it's tried again, ms. */
export const retryAfterMs = (tries: number): number => DOWNLOAD.retryMs[Math.min(Math.max(0, tries - 1), DOWNLOAD.retryMs.length - 1)] ?? 0;

/** How a download stands at `now`, from what's kept of it. */
export function stateOf(video: DownloadVideo, now: number): DownloadState {
  if (video.doneAt !== null) return "done";
  return video.heldAt !== null && now - video.heldAt < DOWNLOAD.holdMs ? "going" : "waiting";
}
