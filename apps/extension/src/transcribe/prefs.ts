import { z } from "zod";
import { DEFAULT_SUBTITLE_STYLE, SubtitleStyle } from "@panki/contracts";
import { DEFAULT_SEEK_LOOK, FillStrength, MarkPaint, SeekLook } from "../seekLook";

/**
 * How transcribing behaves for this browser's viewer, theirs to set on the options page (Videos → Transcribing),
 * apart from what it costs, which stays Panki's settings and an admin's (the speed, the lead, the engine, the pieces):
 * whatever only the viewer's own browser does is theirs to choose. The shapes live here, apart
 * from `storage.ts`, so a page's script carries no storage code; the page gets them with the rest of this browser's
 * settings (`messages.ts` → `Local`, `local.ts`).
 */

/**
 * When transcribing started, as this browser kept it: on every video played, or only at a press. Read by nothing:
 * whether it starts by itself is the account's automation (`rules.ts`, When a video plays → Transcribe it live), so every browser
 * follows the same one. Still in the shape, since a browser that kept it still has it.
 */
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
  /** The colour the picked word is lit in, under the player and over the video (`Line`'s `pickColour`): Panki blue to begin with. */
  pick: MarkPaint,
  /** The colour the picked word's other places are lit in, fainter than the pick, while its card is being added (`Line`'s `same`): Panki blue to begin with. */
  same: MarkPaint,
  /** How strongly they're filled with it, in percent: fainter than the pick to begin with. */
  sameStrength: FillStrength,
  /**
   * The colour a word in Panki's subtitles takes where you added a card for it (`capture/known.ts` → `cameFromHere`),
   * the same word elsewhere tinted by its stage: the subtitles' own, apart from the seek bar's mark of the same.
   */
  added: MarkPaint,
  // There's no mode to pick: Live and Full are each an action and an automation of their own (`transcriber.ts`).
});
export type TranscribePrefs = z.infer<typeof TranscribePrefs>;
export const DEFAULT_PREFS: TranscribePrefs = { trigger: "auto", overVideo: true, style: DEFAULT_SUBTITLE_STYLE, markUnder: true, markOver: true, seek: DEFAULT_SEEK_LOOK, pick: "accent", same: "accent", sameStrength: 25, added: "violet" };
