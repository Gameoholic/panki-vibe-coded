import type { FaceShow, MediaLook, PartSize, PartTone } from "@panki/contracts";

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
