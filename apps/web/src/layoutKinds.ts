import { SHOW_ON_PLAY_MAX, type AutoPlay, type Column, type CornerMarkId, type FaceShow, type ListenShow, type ListenSubtitles, type MediaLook, type PartSize, type PartTone, type TagCorner } from "@panki/contracts";

/**
 * The card layout in words: the choices each part has (what a side does with it, its size, its colour, its player
 * style). The one home for them; the shapes are the contracts' (`layout.ts`). No line under a choice: each
 * explains itself.
 */

export const SHOW_OPTIONS: readonly { id: FaceShow; label: string }[] = [
  { id: "show", label: "Show" },
  { id: "spoiler", label: "Spoiler" },
  { id: "hide", label: "Hide" },
];
export const SIZE_OPTIONS: readonly { id: PartSize; label: string }[] = [
  { id: "big", label: "Big" },
  { id: "normal", label: "Normal" },
  { id: "small", label: "Small" },
];
export const TONE_OPTIONS: readonly { id: PartTone; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "quiet", label: "Quiet" },
  { id: "accent", label: "Accent" },
];
/** The column a part stands in (the contracts' `COLUMNS`). */
export const COLUMN_OPTIONS: readonly { id: Column; label: string }[] = [
  { id: "main", label: "Main" },
  { id: "side", label: "Side" },
];
/** When a sound or a clip plays by itself in a review. */
export const PLAY_OPTIONS: readonly { id: AutoPlay; label: string }[] = [
  { id: "never", label: "Never" },
  { id: "shown", label: "When the card appears" },
  { id: "turned", label: "When the card is turned" },
  { id: "both", label: "Both" },
];
/** What the Listen phase does with a part (Listen first), in the words of the sides' own choices. */
export const LISTEN_OPTIONS: readonly { id: ListenShow; label: string }[] = [
  { id: "show", label: "Show" },
  { id: "blur", label: "Blur" },
  { id: "hide", label: "Hide" },
];
/** What the Listen phase does with a clip's subtitles: what's blurred in them is its Highlight (else the type's main field), named so. */
export const LISTEN_SUBTITLE_OPTIONS: readonly { id: ListenSubtitles; label: string }[] = [
  { id: "show", label: "Show" },
  { id: "word", label: "Blur highlight" },
  { id: "blur", label: "Blur" },
  { id: "hide", label: "Hide" },
];
/**
 * A sound's or clip's Ends listening, as a choice: Never (Done listening alone, 0 here, null as it's kept), or the play
 * whose start shows the card, from the second ("play", not "watch", since a sound has one too).
 */
export const NEVER_BY_ITSELF = 0;
const PLAY_WORDS = ["second", "third", "fourth", "fifth", "sixth"];
export const SHOW_ON_PLAY_OPTIONS: readonly { id: number; label: string }[] = [
  { id: NEVER_BY_ITSELF, label: "Never" },
  ...Array.from({ length: SHOW_ON_PLAY_MAX - 1 }, (_, i) => ({ id: i + 2, label: `On ${PLAY_WORDS[i] ?? `play ${i + 2}`} play` })),
];
/** A sound's or a clip's player style, by name alone. */
/** A corner of the card, where a corner mark (the stage tag, the AI spark) sits. */
export const CORNER_OPTIONS: readonly { id: TagCorner; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];
/** The corner marks by name, as the Layout tab's panel heads them. */
export const CORNER_MARK_NAMES: Record<CornerMarkId, string> = { tag: "Stage tag", spark: "AI spark" };

export const LOOK_OPTIONS: readonly { id: MediaLook; label: string }[] = [
  { id: "player", label: "Player" },
  { id: "plain", label: "Plain" },
  { id: "button", label: "Button" },
  { id: "voice", label: "Voice note" },
  { id: "round", label: "Round button" },
  { id: "tile", label: "Tile" },
  { id: "speaker", label: "Speaker" },
];
