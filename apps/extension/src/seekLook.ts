import { z } from "zod";

/**
 * How Panki's marks on a video's own seek bar look, this browser's viewer's to set on the options page (YouTube → Seek
 * bar; the owner, 2026-10-19: "make the segments customizable, both for colour and other stuff"): how far the
 * transcript reaches, the cards taken from the video, and the open clip. One registry of colours and one of
 * thicknesses, every mark choosing from both. The shapes live here, apart from `storage.ts`, so a page's script carries
 * no storage code; the worker hands them to the page with the transcript (`TranscribePrefs.seek`).
 */

/** The colours a mark can be: the palette in the app's `theme.css` (`--mark-*`), and the theme's own accent. */
export const MarkColour = z.enum(["yellow", "orange", "red", "pink", "violet", "blue", "cyan", "green", "white", "accent"]);
export type MarkColour = z.infer<typeof MarkColour>;
export const MARK_COLOURS: Record<MarkColour, { name: string; css: string }> = {
  yellow: { name: "Yellow", css: "var(--mark-yellow)" },
  orange: { name: "Orange", css: "var(--mark-orange)" },
  red: { name: "Red", css: "var(--mark-red)" },
  pink: { name: "Pink", css: "var(--mark-pink)" },
  violet: { name: "Violet", css: "var(--mark-violet)" },
  blue: { name: "Blue", css: "var(--mark-blue)" },
  cyan: { name: "Cyan", css: "var(--mark-cyan)" },
  green: { name: "Green", css: "var(--mark-green)" },
  white: { name: "White", css: "var(--mark-white)" },
  accent: { name: "Panki blue", css: "var(--accent)" },
};
export const MARK_COLOUR_IDS = MarkColour.options;

/** How thick a mark is drawn, in pixels. */
export const MarkSize = z.enum(["thin", "medium", "thick"]);
export type MarkSize = z.infer<typeof MarkSize>;
export const MARK_SIZES: Record<MarkSize, { name: string; px: number }> = {
  thin: { name: "Thin", px: 3 },
  medium: { name: "Medium", px: 5 },
  thick: { name: "Thick", px: 8 },
};
export const MARK_SIZE_IDS = MarkSize.options;

export const MarkLook = z.object({ shown: z.boolean(), colour: MarkColour, size: MarkSize });
export type MarkLook = z.infer<typeof MarkLook>;

/** When a card's words stand over its mark: while the pointer is on the bar, whenever the bar shows, or never. */
export const CardWords = z.enum(["hover", "always", "off"]);
export type CardWords = z.infer<typeof CardWords>;

export const SeekLook = z.object({
  transcript: MarkLook,
  cards: MarkLook.extend({ words: CardWords }),
  clip: MarkLook,
});
export type SeekLook = z.infer<typeof SeekLook>;
/** Which mark is which, by its key in `SeekLook`. */
export type SeekMarkId = keyof SeekLook;

/** As they were drawn before they could be set: the transcript's thin yellow line, the cards a little thicker in orange on it, the clip in Panki's blue. */
export const DEFAULT_SEEK_LOOK: SeekLook = {
  transcript: { shown: true, colour: "yellow", size: "thin" },
  cards: { shown: true, colour: "orange", size: "medium", words: "hover" },
  clip: { shown: true, colour: "accent", size: "medium" },
};

/** The CSS variables the marks are drawn by (`extension.css` → `.seek`), written on the place that holds them. */
export function seekVars(look: SeekLook): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const id of ["transcript", "cards", "clip"] as const satisfies readonly SeekMarkId[]) {
    vars[`--${id}-colour`] = MARK_COLOURS[look[id].colour].css;
    vars[`--${id}-size`] = `${MARK_SIZES[look[id].size].px}px`;
  }
  return vars;
}
