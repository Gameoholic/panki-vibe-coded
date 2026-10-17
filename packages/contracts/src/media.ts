import { z } from "zod";

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
