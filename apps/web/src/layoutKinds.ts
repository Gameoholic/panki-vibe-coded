import { SHOW_ON_PLAY_MAX, type AutoPlay, type FaceShow, type ListenShow, type ListenSubtitles, type MediaLook, type PartSize, type PartTone } from "@panki/contracts";

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
/** What the Listen phase does with a clip's subtitles: what's blurred in them is its Highlight (else the type's main field), named so (the owner, 2026-11-01). */
export const LISTEN_SUBTITLE_OPTIONS: readonly { id: ListenSubtitles; label: string }[] = [
  { id: "show", label: "Show" },
  { id: "word", label: "Blur highlight" },
  { id: "blur", label: "Blur" },
  { id: "hide", label: "Hide" },
];
/**
 * A sound's or clip's Ends listening, as a choice: Never (Done listening alone, 0 here, null as it's kept), or the play
 * whose start shows the card, from the second (the owner, 2026-11-01: "On second watch", a sound's too, so "play").
 */
export const NEVER_BY_ITSELF = 0;
const PLAY_WORDS = ["second", "third", "fourth", "fifth", "sixth"];
export const SHOW_ON_PLAY_OPTIONS: readonly { id: number; label: string }[] = [
  { id: NEVER_BY_ITSELF, label: "Never" },
  ...Array.from({ length: SHOW_ON_PLAY_MAX - 1 }, (_, i) => ({ id: i + 2, label: `On ${PLAY_WORDS[i] ?? `play ${i + 2}`} play` })),
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
