import { z } from "zod";

/**
 * Where the sound of a word said by a person comes from: one source today, Forvo, and the same registry a second
 * would join (the owner, 2026-10-17: "like engine and key; even though there's only one engine for audio
 * pronunciation, we might have others in the future"). The settings are everyone's, changed by an admin alone,
 * beside the transcription engine's in Settings → Admin. Calling a source is the API's alone.
 */
export const WordAudioSourceId = z.enum(["forvo"]);
export type WordAudioSourceId = z.infer<typeof WordAudioSourceId>;
export const WORD_AUDIO_SOURCE_IDS = WordAudioSourceId.options;
export type WordAudioSource = {
  name: string;
  /** Who runs it, and gives the key for it. */
  vendor: string;
  /** How many requests a day its plan allows (Forvo's non-commercial plan: 500, every list and every file counted); null for one that doesn't count them. */
  dailyLimit: number | null;
};
export const WORD_AUDIO_SOURCES: Record<WordAudioSourceId, WordAudioSource> = {
  forvo: { name: "Forvo", vendor: "Forvo", dailyLimit: 500 },
};

/** The settings for word audio, for everyone. */
export const WordAudio = z.object({ source: WordAudioSourceId });
export type WordAudio = z.infer<typeof WordAudio>;
export const DEFAULT_WORD_AUDIO: WordAudio = { source: "forvo" };
export const WordAudioUpdate = WordAudio.partial();
export type WordAudioUpdate = z.infer<typeof WordAudioUpdate>;

/**
 * The settings as they stand and whose key the chosen source has (typed in Settings, the server's own from its
 * environment, or none); for an admin alone, that key as it was typed (`saved`; the server's own is never shown) and
 * how many requests Panki has made to the source since midnight UTC (`calls`), against its `dailyLimit`.
 */
export const WordAudioStatus = z.object({
  settings: WordAudio,
  key: z.enum(["settings", "server"]).nullable(),
  saved: z.string().optional(),
  calls: z.number().int().nonnegative().optional(),
});
export type WordAudioStatus = z.infer<typeof WordAudioStatus>;
export const WordAudioResponse = z.object({ wordAudio: WordAudioStatus });

/** The longest key taken for a source; Forvo's are 32 letters. */
export const WORD_AUDIO_KEY_MAX = 200;
/** A source's key typed in Settings, or null to forget it. */
export const WordAudioKeyUpdate = z.object({ key: z.string().trim().min(1).max(WORD_AUDIO_KEY_MAX).nullable() });
export type WordAudioKeyUpdate = z.infer<typeof WordAudioKeyUpdate>;
