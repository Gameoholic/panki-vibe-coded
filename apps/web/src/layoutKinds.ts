import { LISTEN_HEARD_MAX, type AutoPlay, type FaceShow, type ListenShow, type ListenSubtitles, type MediaLook, type PartSize, type PartTone } from "@panki/contracts";

/**
 * The card layout in words: the choices each part has (what a side does with it, its size, its colour, its player
 * style). The one home for them; the shapes are the contracts' (`layout.ts`). (Lines under the side choices and the
 * player style, saying what each came to, were taken out at the owner's word, 2026-10-15: "self explanatory".)
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
/** When a sound or a clip plays by itself in a review (the owner, 2026-10-21). */
export const PLAY_OPTIONS: readonly { id: AutoPlay; label: string }[] = [
  { id: "never", label: "Never" },
  { id: "shown", label: "When the card appears" },
  { id: "turned", label: "When the card is turned" },
  { id: "both", label: "Both" },
];
/** What the Listen phase does with a part (Listen first, the owner, 2026-11-01), in the words of the sides' own choices. */
export const LISTEN_OPTIONS: readonly { id: ListenShow; label: string }[] = [
  { id: "show", label: "Show" },
  { id: "blur", label: "Blur" },
  { id: "hide", label: "Hide" },
];
/** What the Listen phase does with a clip's subtitles: the card's word blurred in them is its Highlight (else the type's main field). */
export const LISTEN_SUBTITLE_OPTIONS: readonly { id: ListenSubtitles; label: string }[] = [
  { id: "show", label: "Show" },
  { id: "word", label: "Blur word" },
  { id: "blur", label: "Blur" },
  { id: "hide", label: "Hide" },
];
/** Listen first's hearings before the card shows itself, as a choice: a sound or clip heard to its end; 0 is only by Show card. */
export const ONLY_BY_BUTTON = 0;
const HEARD_WORDS = ["once", "twice"];
export const HEARD_OPTIONS: readonly { id: number; label: string }[] = [
  ...Array.from({ length: LISTEN_HEARD_MAX }, (_, i) => ({ id: i + 1, label: `Heard ${HEARD_WORDS[i] ?? `${i + 1} times`}` })),
  { id: ONLY_BY_BUTTON, label: "Only by the button" },
];
/** A sound's or a clip's player style: every one the owner chose to keep (2026-10-15), by name alone (the words beside each were taken out at their word). */
export const LOOK_OPTIONS: readonly { id: MediaLook; label: string }[] = [
  { id: "player", label: "Player" },
  { id: "plain", label: "Plain" },
  { id: "button", label: "Button" },
  { id: "voice", label: "Voice note" },
  { id: "round", label: "Round button" },
  { id: "tile", label: "Tile" },
  { id: "speaker", label: "Speaker" },
];
