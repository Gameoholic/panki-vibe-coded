import { z } from "zod";
import { DEFAULT_SUBTITLE_STYLE, SubtitleStyle, TranscribeMode } from "@panki/contracts";
import { DEFAULT_SEEK_LOOK, SeekLook } from "../seekLook";

/**
 * How transcribing behaves for this browser's viewer, theirs to set on the options page (YouTube → Transcribing),
 * apart from what it costs, which stays Panki's settings and an admin's (the speed, the lead, the engine, the pieces):
 * the owner, 2026-10-17, "this is fine to allow per user… any option that's client side". The shapes live here, apart
 * from `storage.ts`, so a page's script carries no storage code; the worker hands them to the page with the transcript.
 */

/** When transcribing starts: on every video played, or only at a press on Transcribe. */
export const TranscribeTrigger = z.enum(["auto", "press"]);
export type TranscribeTrigger = z.infer<typeof TranscribeTrigger>;
// What it does while the video is paused was the viewer's here (`paused`) until it became an admin's, Panki's
// `Transcription.paused` (the owner, 2026-10-27); a browser that kept `transcribePaused` keeps it unread.

export const TranscribePrefs = z.object({
  trigger: TranscribeTrigger,
  /** Whether the transcript is drawn over the video in place of the site's own captions, as well as under it ("Override YouTube's native subtitles", the owner's words, with a line under it naming the Panki panel's Panki subtitles; it was "Replace YouTube subtitles with Panki's" until the owner, 2026-10-27, read that as YouTube's swapped for some of Panki's own, and asked for the line under it too). */
  overVideo: z.boolean(),
  /** How the transcript looks over the video (the contracts' `subtitleStyle.ts`): this browser's own, as the rest here. */
  style: SubtitleStyle,
  /**
   * Whether the word being said carries its mark (the line under it, `Line`'s `now`): on the line under the player,
   * and on the subtitles over the video, each its own (the owner, 2026-10-18). They apply to the site's captions as
   * much as to the transcript, and ride with the rest here because this is what the page is handed.
   */
  markUnder: z.boolean(),
  markOver: z.boolean(),
  /** How Panki's marks on the video's seek bar look (`seekLook.ts`): this viewer's, riding here for the same reason. */
  seek: SeekLook,
  /** The transcription mode this viewer picked in the strip's menu, among those an admin left on; null for the one everyone starts on (`modeOf`). */
  mode: TranscribeMode.nullable(),
});
export type TranscribePrefs = z.infer<typeof TranscribePrefs>;
export const DEFAULT_PREFS: TranscribePrefs = { trigger: "auto", overVideo: true, style: DEFAULT_SUBTITLE_STYLE, markUnder: true, markOver: true, seek: DEFAULT_SEEK_LOOK, mode: null };
