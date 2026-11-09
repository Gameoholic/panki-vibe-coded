/** @panki Where a video's words come from, the sources one registry (`SUBTITLE_SOURCES`, `SubtitleSource`, `DEFAULT_SOURCE`, `sourceOf`, `engineWanted`). */
import { EngineId } from "@panki/contracts";

/**
 * Where the words under a video come from: Panki's own (the transcript, by whichever engine Panki's settings name),
 * the site's own captions, or nothing. Picked in the line under the player and kept in this browser, so the next video
 * has the same. One pick, no falling back: with Panki's picked the site's captions are never shown, not under the
 * player nor on the picture, however far the transcript has got. With anything but Panki's picked nothing is
 * transcribed at all. One registry.
 *
 * The strip says what kind of subtitles they are, never the engine that made them: the engine is Settings → Admin's to
 * say. A pick kept as an engine's id, from when each engine was a source of its own, reads as Panki's. `short` is its
 * name where a Subtitles label already stands over it (the panel's menu: Subtitles, then Panki / YouTube / None).
 */
export type SubtitleSource = "panki" | "youtube" | "none";
export const SUBTITLE_SOURCES: Record<SubtitleSource, { name: string; short: string }> = {
  panki: { name: "Panki subtitles", short: "Panki" },
  youtube: { name: "YouTube subtitles", short: "YouTube" },
  none: { name: "None", short: "None" },
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
