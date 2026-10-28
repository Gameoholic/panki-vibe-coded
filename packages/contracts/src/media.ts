import { z } from "zod";
import { ClientName } from "./auth";
import { ExtensionFingerprint } from "./extension";

/** Minted by whoever sends the file, so a retried upload returns the file that's already there instead of a second one. */
export const MediaId = z.uuid();

/** What a file on a card is. Which of these a field takes is its kind's to say (`mediaKindsOf` in type.ts). */
export const MediaKind = z.enum(["audio", "video", "image"]);
export type MediaKind = z.infer<typeof MediaKind>;

/**
 * The files Panki takes, by kind: only what a browser plays or draws by itself, and nothing that can carry a script
 * (no SVG, no HTML). The API holds a file's first bytes against the type it was sent as, so this list is what's kept.
 */
export const MEDIA_MIMES: Record<MediaKind, readonly string[]> = {
  audio: ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4"],
  video: ["video/webm", "video/mp4"],
  image: ["image/jpeg", "image/png", "image/webp"],
};

/** How those files' names end: what the file chooser is told to show, and how Panki says which files it takes. */
export const MEDIA_ENDINGS: Record<MediaKind, readonly string[]> = {
  audio: ["mp3", "m4a", "ogg", "webm"],
  video: ["mp4", "webm"],
  image: ["jpg", "png", "webp"],
};

const MB = 1024 * 1024;
/** The most one file can weigh, in bytes. A line of a video is about one megabyte; these leave room for a long one. */
export const MEDIA_MAX_BYTES: Record<MediaKind, number> = {
  audio: 10 * MB,
  video: 40 * MB,
  image: 5 * MB,
};

/** A file as Panki holds it. The bytes are fetched by its id; a card's value in a media field is that id. */
export const Media = z.object({
  id: MediaId,
  kind: MediaKind,
  mime: z.string(),
  bytes: z.number().int().positive(),
  /** Stamped by the API, ms since epoch. */
  createdAt: z.number().int().nonnegative(),
});
export type Media = z.infer<typeof Media>;

export const MediaResponse = z.object({ media: Media });

/**
 * What's said in a clip, as it was heard on the video when the clip was recorded (the video's transcript, or its own
 * captions): each line, when it's said in ms from the clip's own start, and where each piece of it begins (`marks`: a
 * character of the text and when it's said). A card plays its clip with these in sync, the piece being said underlined,
 * as the extension draws them over YouTube (the owner, 2026-10-18: "the timestamps and words sourced from the video",
 * in place of a field's words laid over the whole clip). A sound recorded off a video keeps them too (2026-10-28),
 * though nothing shows a sound's. Kept with the file, written once with it, never changed.
 */
export const CueMark = z.object({ at: z.number().int().nonnegative(), ms: z.number().int().nonnegative() });
export const SubtitleCue = z.object({
  text: z.string().min(1).max(500),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  marks: z.array(CueMark).max(200),
});
export type SubtitleCue = z.infer<typeof SubtitleCue>;
export const CUES_MAX = 100;
export const MediaCues = z.array(SubtitleCue).max(CUES_MAX);
export type MediaCues = z.infer<typeof MediaCues>;
export const MediaCuesBody = z.object({ cues: MediaCues });

/** Which of a capture's two cuts a recording is: the sentence's clip, or the picked word's own stretch of it. */
export const RecordingCut = z.enum(["clip", "word"]);
export type RecordingCut = z.infer<typeof RecordingCut>;

/**
 * How a file was recorded off a video, so it can be recorded again, longer or better, from this alone (the owner,
 * 2026-10-28: "save all the data we can… so in the future I can re-record batch on client side"): the video's address,
 * which cut it is, the stretch asked for (ms of the video's own time) and where the video really stood when the
 * recording stopped, the picture's size and rate as the player played it (said for a sound recorded alone too: how good
 * the video was then), and the bit rates the recorder was given (none for the picture of a sound alone). `client` and
 * `build` are the extension that recorded it. Kept with the file, written once with it, never changed; read by nothing
 * yet.
 */
export const MediaRecording = z.object({
  url: z.string().trim().max(2000).regex(/^https?:\/\//i),
  cut: RecordingCut,
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  stoppedMs: z.number().int().nonnegative(),
  width: z.number().int().positive().max(100_000).optional(),
  height: z.number().int().positive().max(100_000).optional(),
  frameRate: z.number().positive().max(1000).optional(),
  videoBits: z.number().int().positive().optional(),
  audioBits: z.number().int().positive().optional(),
  client: ClientName,
  build: ExtensionFingerprint.optional(),
});
export type MediaRecording = z.infer<typeof MediaRecording>;
export const MediaRecordingBody = z.object({ recording: MediaRecording });

/** The cue being said at a moment of its clip (ms from the start), and which of its pieces: null between lines. */
export function cueAt(cues: readonly SubtitleCue[], ms: number): { cue: SubtitleCue; piece: { from: number; to: number } | null } | null {
  const cue = cues.find((c) => ms >= c.startMs && ms < c.endMs);
  if (!cue) return null;
  const said = cue.marks.filter((m) => m.ms <= ms).at(-1);
  if (!said) return { cue, piece: null };
  const next = cue.marks.find((m) => m.at > said.at);
  return { cue, piece: { from: said.at, to: next ? next.at : cue.text.length } };
}

/** A content type without its parameters, lowercased: "video/webm;codecs=vp9,opus" is "video/webm". */
export function bareMime(type: string): string {
  return (type.split(";")[0] ?? "").trim().toLowerCase();
}

/** The kind a type belongs to, or null when Panki doesn't take it. */
export function mediaKindOfMime(type: string): MediaKind | null {
  const mime = bareMime(type);
  return MediaKind.options.find((kind) => MEDIA_MIMES[kind].includes(mime)) ?? null;
}

/** Other words for the same container: what some browsers call it, and what its files' names end with. */
const SAME_AS: Record<string, string> = {
  mp3: "mpeg",
  m4a: "mp4",
  "x-m4a": "mp4",
  m4v: "mp4",
  oga: "ogg",
  opus: "ogg",
  jpg: "jpeg",
};

/**
 * The type a file is sent as when it goes into a field of this kind, or null when Panki doesn't take it. A container
 * says nothing of what's inside (a .webm is "video/webm" to a browser even when it's only sound), so it is named for
 * the field it's going into. What the browser calls the file is tried first, then how its name ends.
 */
export function mediaMimeFor(kind: MediaKind, type: string, name = ""): string | null {
  const said = bareMime(type).split("/")[1] ?? "";
  const ending = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  for (const word of [said, ending]) {
    if (!word) continue;
    const mime = `${kind}/${SAME_AS[word] ?? word}`;
    if (MEDIA_MIMES[kind].includes(mime)) return mime;
  }
  return null;
}

/**
 * What a file is when it goes into a field that takes more than one kind (a clip or a sound), and the type it's sent
 * as; null when it's none of them. What the browser calls it is believed first, so a .webm it calls sound goes in as
 * sound; after that the field's kinds are tried in their own order.
 */
export function mediaFor(kinds: readonly MediaKind[], type: string, name = ""): { kind: MediaKind; mime: string } | null {
  const said = bareMime(type).split("/")[0];
  const order = [...kinds].sort((a, b) => Number(b === said) - Number(a === said));
  for (const kind of order) {
    const mime = mediaMimeFor(kind, type, name);
    if (mime) return { kind, mime };
  }
  return null;
}
