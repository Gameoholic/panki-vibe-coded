import { z } from "zod";
import { DEFAULT_SUBTITLE_STYLE, SubtitleStyle, TranscribeMode } from "@panki/contracts";
import { DEFAULT_SEEK_LOOK, MarkPaint, SeekLook } from "../seekLook";

/**
 * How transcribing behaves for this browser's viewer, theirs to set on the options page (Videos → Transcribing),
 * apart from what it costs, which stays Panki's settings and an admin's (the speed, the lead, the engine, the pieces):
 * whatever only the viewer's own browser does is theirs to choose. The shapes live here, apart
 * from `storage.ts`, so a page's script carries no storage code; the page gets them with the rest of this browser's
 * settings (`messages.ts` → `Local`, `local.ts`).
 */

/** When transcribing starts: on every video played, or only at a press on Transcribe. */
export const TranscribeTrigger = z.enum(["auto", "press"]);
export type TranscribeTrigger = z.infer<typeof TranscribeTrigger>;
// What it does while the video is paused is an admin's, Panki's `Transcription.paused`; a browser that kept a
// `transcribePaused` of its own keeps it unread.

export const TranscribePrefs = z.object({
  trigger: TranscribeTrigger,
  /** Whether the transcript is drawn over the video in place of the site's own captions, as well as under it. */
  overVideo: z.boolean(),
  /** How the transcript looks over the video (the contracts' `subtitleStyle.ts`): this browser's own, as the rest here. */
  style: SubtitleStyle,
  /**
   * Whether the word being said carries its mark (the line under it, `Line`'s `now`): on the line under the player,
   * and on the subtitles over the video, each its own. They apply to the site's captions as much as to the transcript.
   */
  markUnder: z.boolean(),
  markOver: z.boolean(),
  /** How Panki's marks on the video's seek bar look (`seekLook.ts`): this viewer's. */
  seek: SeekLook,
  /** The colour the picked word is lit in, under the player and over the video (`Line`'s `pickColour`): the Clip's to begin with. */
  pick: MarkPaint,
  /** The transcription mode this viewer picked in the strip's menu, among those an admin left on; null for the one everyone starts on (`modeOf`). */
  mode: TranscribeMode.nullable(),
});
export type TranscribePrefs = z.infer<typeof TranscribePrefs>;
export const DEFAULT_PREFS: TranscribePrefs = { trigger: "auto", overVideo: true, style: DEFAULT_SUBTITLE_STYLE, markUnder: true, markOver: true, seek: DEFAULT_SEEK_LOOK, pick: DEFAULT_SEEK_LOOK.clip.colour, mode: null };
