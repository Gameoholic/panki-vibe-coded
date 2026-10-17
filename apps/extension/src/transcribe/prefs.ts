import { z } from "zod";

/**
 * How transcribing behaves for this browser's viewer, theirs to set on the options page (YouTube → Transcribing),
 * apart from what it costs, which stays Panki's settings and an admin's (the speed, the lead, the engine, the pieces):
 * the owner, 2026-10-17, "this is fine to allow per user… any option that's client side". The shapes live here, apart
 * from `storage.ts`, so a page's script carries no storage code; the worker hands them to the page with the transcript.
 */

/** When transcribing starts: on every video played, or only at a press on Transcribe. */
export const TranscribeTrigger = z.enum(["auto", "press"]);
export type TranscribeTrigger = z.infer<typeof TranscribeTrigger>;
/** While the viewer's video is paused: the silent player keeps filling its lead, or stops at once. */
export const TranscribePaused = z.enum(["keep", "stop"]);
export type TranscribePaused = z.infer<typeof TranscribePaused>;

export const TranscribePrefs = z.object({
  trigger: TranscribeTrigger,
  paused: TranscribePaused,
  /** Whether the transcript is drawn over the video in place of the site's own captions, as well as under it ("Replace YouTube subtitles"). */
  overVideo: z.boolean(),
});
export type TranscribePrefs = z.infer<typeof TranscribePrefs>;
export const DEFAULT_PREFS: TranscribePrefs = { trigger: "auto", paused: "keep", overVideo: true };
