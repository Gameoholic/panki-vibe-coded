import { ENGINES, ENGINE_IDS, EngineId } from "@panki/contracts";

/**
 * Where the words under a video come from: one of the engines Panki can transcribe with, the site's own captions, or
 * nothing. Picked in the line under the player and kept in this browser, so the next video has the same (the owner,
 * 2026-10-17). One pick, no falling back: with an engine picked the site's captions are never shown, not under the
 * player nor on the picture, however far the transcript has got (the owner, later the same day: "it won't show the
 * YouTube subtitles at all, not even as a fallback… sometimes the old YouTube subtitles pop up"; for a day there was
 * a "waterfall", an order the sources were tried in, dragged on the options page, and the captions came through it).
 * With anything but an engine picked nothing is transcribed at all. One registry; the ids are kept as they are, so a
 * stored pick outlives a renaming.
 */
export type SubtitleSource = EngineId | "youtube" | "none";
export const SUBTITLE_SOURCES: Record<SubtitleSource, { name: string }> = {
  ...(Object.fromEntries(ENGINE_IDS.map((id) => [id, { name: ENGINES[id].name }])) as Record<EngineId, { name: string }>),
  youtube: { name: "YouTube captions" },
  none: { name: "None" },
};
/** The sources as the picker lists them: the engines, then the site's captions, then nothing. */
export const SUBTITLE_SOURCE_IDS = Object.keys(SUBTITLE_SOURCES) as SubtitleSource[];
/** Transcribed, to begin with. */
export const DEFAULT_SOURCE: SubtitleSource = ENGINE_IDS[0] ?? "youtube";

export const isEngine = (source: SubtitleSource): source is EngineId => EngineId.safeParse(source).success;

/** A kept pick read defensively: the source it names, or the default for anything else. */
export function sourceOf(stored: unknown): SubtitleSource {
  return typeof stored === "string" && stored in SUBTITLE_SOURCES ? (stored as SubtitleSource) : DEFAULT_SOURCE;
}

/** Whether the engine is wanted: it's the pick. The one reading of whether anything transcribes. */
export const engineWanted = (source: SubtitleSource, engine: EngineId): boolean => source === engine;
