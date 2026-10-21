import { EngineId } from "@panki/contracts";

/**
 * Where the words under a video come from: Panki's own (the transcript, by whichever engine Panki's settings name),
 * the site's own captions, or nothing. Picked in the line under the player and kept in this browser, so the next video
 * has the same (the owner, 2026-10-17). One pick, no falling back: with Panki's picked the site's captions are never
 * shown, not under the player nor on the picture, however far the transcript has got (the owner, later the same day:
 * "it won't show the YouTube subtitles at all, not even as a fallback"). With anything but Panki's picked nothing is
 * transcribed at all. One registry.
 *
 * The strip says what kind of subtitles they are, never the engine that made them (the owner, 2026-10-21): the engine
 * is Settings → Admin's to say, as it always was. Until then each engine was a source of its own, by its id; a pick kept
 * from then reads as Panki's.
 */
export type SubtitleSource = "panki" | "youtube" | "none";
export const SUBTITLE_SOURCES: Record<SubtitleSource, { name: string }> = {
  panki: { name: "Panki subtitles" },
  youtube: { name: "YouTube subtitles" },
  none: { name: "None" },
};
/** The sources as the picker lists them: Panki's, then the site's, then nothing. */
export const SUBTITLE_SOURCE_IDS = Object.keys(SUBTITLE_SOURCES) as SubtitleSource[];
/** Transcribed, to begin with. */
export const DEFAULT_SOURCE: SubtitleSource = "panki";

/** A kept pick read defensively: the source it names (an engine's id, from before, being Panki's), or the default for anything else. */
export function sourceOf(stored: unknown): SubtitleSource {
  if (typeof stored !== "string") return DEFAULT_SOURCE;
  if (EngineId.safeParse(stored).success) return "panki";
  return stored in SUBTITLE_SOURCES ? (stored as SubtitleSource) : DEFAULT_SOURCE;
}

/** Whether the engine is wanted: Panki's subtitles are the pick. The one reading of whether anything transcribes. */
export const engineWanted = (source: SubtitleSource): boolean => source === "panki";
