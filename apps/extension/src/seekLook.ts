import { z } from "zod";

/**
 * How Panki's marks on a video's own seek bar look, this browser's viewer's to set on the options page (YouTube → Seek
 * bar; the owner, 2026-10-19: "make the segments customizable, both for colour and other stuff"): how far the
 * transcript reaches, the cards taken from the video, and the open clip. One registry of colours (or a colour of the
 * viewer's own, from the wheel) and one of thicknesses, every mark choosing from both. The shapes live here, apart from `storage.ts`, so a page's script carries
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
/** A colour of the viewer's own, picked on the wheel (`options/ColourWheel.tsx`): `#rrggbb`. */
export const CustomColour = z.string().regex(/^#[0-9a-f]{6}$/i);
/** A mark's colour: one of the palette's, or one of the viewer's own. */
export const MarkPaint = z.union([MarkColour, CustomColour]);
export type MarkPaint = z.infer<typeof MarkPaint>;
const isPalette = (paint: MarkPaint): paint is MarkColour => MarkColour.safeParse(paint).success;
/** How a mark's colour is written in CSS: the palette's token, or the viewer's own colour as it is. */
export const paintCss = (paint: MarkPaint): string => (isPalette(paint) ? MARK_COLOURS[paint].css : paint);
/** What a mark's colour is called: the palette's name, or the viewer's own colour as it's written. */
export const paintName = (paint: MarkPaint): string => (isPalette(paint) ? MARK_COLOURS[paint].name : paint.toUpperCase());

/** How thick a mark is drawn, in pixels. */
export const MarkSize = z.enum(["thin", "medium", "thick"]);
export type MarkSize = z.infer<typeof MarkSize>;
export const MARK_SIZES: Record<MarkSize, { name: string; px: number }> = {
  thin: { name: "Thin", px: 3 },
  medium: { name: "Medium", px: 5 },
  thick: { name: "Thick", px: 8 },
};
export const MARK_SIZE_IDS = MarkSize.options;

export const MarkLook = z.object({ shown: z.boolean(), colour: MarkPaint, size: MarkSize });
export type MarkLook = z.infer<typeof MarkLook>;

/** When a card's words stand over its mark: while the pointer is on the bar, whenever the bar shows, or never. */
export const CardWords = z.enum(["hover", "always", "off"]);
export type CardWords = z.infer<typeof CardWords>;

/**
 * How a card's words come in (`extension.css` → `.seek-pins.is-…`): growing up out of their mark, flipping up on their
 * bottom edge like a departure board, fading in, or simply there. The owner picked Sprout of eight tried on
 * https://claude.ai/artifact/SqeA5JtrpGtykUKS3hWWR9 (2026-10-19), and had Flap and Fade kept as choices beside it.
 */
export const PinEntrance = z.enum(["sprout", "flap", "fade", "none"]);
export type PinEntrance = z.infer<typeof PinEntrance>;
export const PIN_ENTRANCES: Record<PinEntrance, string> = { sprout: "Sprout", flap: "Flap", fade: "Fade", none: "None" };
export const PIN_ENTRANCE_IDS = PinEntrance.options;

/**
 * How near a card's mark, in pixels of the bar, the pointer is drawn to it: let go there and the video goes to the
 * card's moment, not the pointer's (`SeekLook.cards.snap`; the owner, 2026-10-19: "anchor to any of these timestamps…
 * when moving with the mouse on the seekbar").
 */
export const CARD_SNAP_PX = 10;

export const SeekLook = z.object({
  transcript: MarkLook,
  // `snap` and `entrance` came after the rest: a look kept before them has neither, and is given the default.
  cards: MarkLook.extend({ words: CardWords, snap: z.boolean().default(true), entrance: PinEntrance.default("sprout") }),
  clip: MarkLook,
});
export type SeekLook = z.infer<typeof SeekLook>;
/** Which mark is which, by its key in `SeekLook`. */
export type SeekMarkId = keyof SeekLook;

/** As they were drawn before they could be set: the transcript's thin yellow line, the cards a little thicker in orange on it, the clip in Panki's blue. */
export const DEFAULT_SEEK_LOOK: SeekLook = {
  transcript: { shown: true, colour: "yellow", size: "thin" },
  cards: { shown: true, colour: "orange", size: "medium", words: "hover", snap: true, entrance: "sprout" },
  clip: { shown: true, colour: "accent", size: "medium" },
};

/** The CSS variables the marks are drawn by (`extension.css` → `.seek`), written on the place that holds them. */
export function seekVars(look: SeekLook): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const id of ["transcript", "cards", "clip"] as const satisfies readonly SeekMarkId[]) {
    vars[`--${id}-colour`] = paintCss(look[id].colour);
    vars[`--${id}-size`] = `${MARK_SIZES[look[id].size].px}px`;
  }
  return vars;
}
