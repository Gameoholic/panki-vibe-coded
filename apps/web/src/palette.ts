/** @panki The palette colours are picked from, each by name, the `--mark-*` tokens (`PALETTE`, `PaletteColour`). */
/**
 * The palette colours are picked from, one home: the app's `--mark-*` tokens (`theme.css`), the same in every theme,
 * each by name. A stage's colour picks from it (`views/SrsTypeView.tsx`), and so do the extension's marks on a video's
 * seek bar and its words in the decks (`seekLook.ts` → `MARK_COLOURS`, which adds the theme's accent). A new colour is
 * one entry here and one token there.
 */
export const PALETTE = {
  yellow: { name: "Yellow", css: "var(--mark-yellow)" },
  orange: { name: "Orange", css: "var(--mark-orange)" },
  red: { name: "Red", css: "var(--mark-red)" },
  pink: { name: "Pink", css: "var(--mark-pink)" },
  violet: { name: "Violet", css: "var(--mark-violet)" },
  blue: { name: "Blue", css: "var(--mark-blue)" },
  cyan: { name: "Cyan", css: "var(--mark-cyan)" },
  green: { name: "Green", css: "var(--mark-green)" },
  white: { name: "White", css: "var(--mark-white)" },
} as const satisfies Record<string, { name: string; css: string }>;
export type PaletteColour = keyof typeof PALETTE;
