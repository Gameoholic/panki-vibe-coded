import { z } from "zod";

/**
 * How subtitles look over a picture (the owner, 2026-10-17: "size, font, position, etc."): the shape and its bounds,
 * the fonts it can be set in, and the CSS variables the band reads them as, one home for both places that draw them.
 * Each keeps its own style: the extension its own in the browser, for the transcript over a YouTube video (set in its
 * Subtitles menu on the page), and the app the account's (`srs.ts` → `Settings.subtitleStyle`), for a card's clip
 * (set in Settings). They were one, on the account, for a few hours on 2026-10-18.
 */

/**
 * The fonts the subtitles can be drawn in. Every one but Panki's is a font of the device's own (nothing is fetched on
 * someone else's page, and Panki's font files aren't there either: "Urbanist (Panki)" is the app's stack, Urbanist
 * when the device has it); a font the device hasn't got falls back to its family's generic. `from` is where it comes
 * with, said beside it in the list, so a font that does nothing on this device is no mystery. Good Japanese faces, by
 * the owner's ask (2026-10-17): the Windows and macOS system faces, the UD (universal design) ones made to be read at
 * a glance, Noto's, and a few free ones many devices have. One registry; a new font is one entry.
 */
const FONT_IDS = [
  "urbanist",
  "device",
  "yuGothic",
  "meiryo",
  "bizUdGothic",
  "udDigiKyokasho",
  "yuMincho",
  "bizUdMincho",
  "hiraginoSans",
  "hiraginoMaru",
  "hiraginoMincho",
  "tsukushiRound",
  "klee",
  "notoSansJP",
  "notoSerifJP",
  "sourceHanSans",
  "mPlusRounded",
  "zenKakuGothic",
  "kosugiMaru",
] as const;
export const SubtitleFont = z.enum(FONT_IDS);
export type SubtitleFont = z.infer<typeof SubtitleFont>;
export const SUBTITLE_FONT_IDS = SubtitleFont.options;
export const SUBTITLE_FONTS: Record<SubtitleFont, { name: string; family: string; from: string }> = {
  urbanist: { name: "Urbanist (Panki)", family: "var(--font)", from: "Panki" },
  device: { name: "Device default", family: "system-ui, sans-serif", from: "Your device" },
  yuGothic: { name: "Yu Gothic", family: '"Yu Gothic UI", "Yu Gothic", sans-serif', from: "Windows" },
  meiryo: { name: "Meiryo", family: "Meiryo, sans-serif", from: "Windows" },
  bizUdGothic: { name: "BIZ UDGothic", family: '"BIZ UDPGothic", "BIZ UDGothic", sans-serif', from: "Windows" },
  udDigiKyokasho: { name: "UD Digi Kyokasho", family: '"UD Digi Kyokasho N-R", "UD Digi Kyokasho NK-R", sans-serif', from: "Windows" },
  yuMincho: { name: "Yu Mincho", family: '"Yu Mincho", serif', from: "Windows" },
  bizUdMincho: { name: "BIZ UDMincho", family: '"BIZ UDPMincho", "BIZ UDMincho", serif', from: "Windows" },
  hiraginoSans: { name: "Hiragino Sans", family: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif', from: "macOS" },
  hiraginoMaru: { name: "Hiragino Maru Gothic", family: '"Hiragino Maru Gothic ProN", sans-serif', from: "macOS" },
  hiraginoMincho: { name: "Hiragino Mincho", family: '"Hiragino Mincho ProN", serif', from: "macOS" },
  tsukushiRound: { name: "Tsukushi A Round Gothic", family: '"Tsukushi A Round Gothic", sans-serif', from: "macOS" },
  klee: { name: "Klee", family: '"Klee", "Klee One", serif', from: "macOS" },
  notoSansJP: { name: "Noto Sans JP", family: '"Noto Sans JP", "Noto Sans CJK JP", sans-serif', from: "Android, Linux" },
  notoSerifJP: { name: "Noto Serif JP", family: '"Noto Serif JP", "Noto Serif CJK JP", serif', from: "Android, Linux" },
  sourceHanSans: { name: "Source Han Sans", family: '"Source Han Sans", "Source Han Sans JP", sans-serif', from: "If installed" },
  mPlusRounded: { name: "M PLUS Rounded 1c", family: '"M PLUS Rounded 1c", sans-serif', from: "If installed" },
  zenKakuGothic: { name: "Zen Kaku Gothic New", family: '"Zen Kaku Gothic New", sans-serif', from: "If installed" },
  kosugiMaru: { name: "Kosugi Maru", family: '"Kosugi Maru", sans-serif', from: "If installed" },
};

export const SubtitleAlign = z.enum(["left", "center", "right"]);
export type SubtitleAlign = z.infer<typeof SubtitleAlign>;

/** The bounds each number is kept in: the words in px, the band's place as shares of the picture, its darkness as a share of a hundred. */
export const SUBTITLE_BOUNDS = {
  size: { min: 14, max: 72 },
  bottom: { min: 0, max: 90 },
  x: { min: 0, max: 100 },
  opacity: { min: 0, max: 100 },
} as const;

export const SubtitleStyle = z.object({
  size: z.number().int().min(SUBTITLE_BOUNDS.size.min).max(SUBTITLE_BOUNDS.size.max),
  font: SubtitleFont,
  /** How far up from the bottom of the picture the band sits, as a share of its height. */
  bottom: z.number().int().min(SUBTITLE_BOUNDS.bottom.min).max(SUBTITLE_BOUNDS.bottom.max),
  /** Where across the picture the band's middle stands, as a share of its width; 50 is centred. */
  x: z.number().int().min(SUBTITLE_BOUNDS.x.min).max(SUBTITLE_BOUNDS.x.max),
  /** How the words sit inside the band when it runs to more than one row. */
  align: SubtitleAlign,
  /** How dark the band behind the words is; 0 is none. */
  opacity: z.number().int().min(SUBTITLE_BOUNDS.opacity.min).max(SUBTITLE_BOUNDS.opacity.max),
});
export type SubtitleStyle = z.infer<typeof SubtitleStyle>;
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = { size: 26, font: "urbanist", bottom: 9, x: 50, align: "center", opacity: 68 };

/**
 * The size is meant for a picture this tall, in px; on a taller or shorter one the words scale with it, so they take
 * the same share of the picture on the page, in the theatre, on the full screen and on a card (the owner, 2026-10-17:
 * made small for the page they were too small on the full screen). Whoever draws the band puts the picture's height
 * over this on it as `--sub-scale`.
 */
export const SUBTITLE_REF_HEIGHT = 720;

/** A number kept inside one of the bounds, whole. */
export const withinBound = (value: number, bound: { min: number; max: number }): number => Math.round(Math.min(bound.max, Math.max(bound.min, value)));

/** The style as the CSS variables the band is drawn with (the web's `app.css` → `.sub-band`), put on what holds it. */
export function subtitleVars(style: SubtitleStyle): Record<string, string> {
  return {
    "--sub-size": `${style.size}px`,
    "--sub-font": SUBTITLE_FONTS[style.font].family,
    "--sub-bottom": `${style.bottom}%`,
    "--sub-x": `${style.x}%`,
    "--sub-align": style.align,
    "--sub-bg": `${style.opacity}%`,
  };
}
