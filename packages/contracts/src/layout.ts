import { z } from "zod";

/**
 * How a card type's cards look in a review (the owner's design, 2026-10-15: option B of the card layout page, edited on
 * the card itself). For each field: what each side of the card does with it, where it sits, and how it looks. The
 * order is the card's, top to bottom, and is its own: the fields' order is still the forms'. A type's layout as it
 * stands, filled out from its fields, is `cardLayout.ts` → `layoutOf`.
 *
 * (Nothing here imports `type.ts`, which takes `CardLayout` for its `CardType`: the two would load each other.)
 */

/** What one side of the card does with a field: shows it, hides it behind a spoiler that's pressed to see, or leaves it off. */
export const FaceShow = z.enum(["show", "spoiler", "hide"]);
export type FaceShow = z.infer<typeof FaceShow>;
/** How big words, a picture or a clip's picture are drawn. */
export const PartSize = z.enum(["big", "normal", "small"]);
export type PartSize = z.infer<typeof PartSize>;
/** The colour of words: the card's own, quieter, or the accent. */
export const PartTone = z.enum(["normal", "quiet", "accent"]);
export type PartTone = z.infer<typeof PartTone>;
/**
 * How a sound or a clip shows on the card (its "player style"): Panki's own player (a clip with its picture, and full
 * screen), the browser's own (`plain`), a small button, a voice note (its waveform, and its speed), a round button with
 * a ring, a tile with its name and length, or a speaker to sit beside the words it says (the owner's looks of
 * 2026-10-15, all kept to choose from). All but the player and plain play a clip's sound alone.
 */
export const MediaLook = z.enum(["player", "plain", "button", "voice", "round", "tile", "speaker"]);
export type MediaLook = z.infer<typeof MediaLook>;

/** One field's part on the card. What doesn't apply to its kind (a size for a link, a look for words) is kept and unused. */
export const LayoutPart = z.object({
  fieldId: z.uuid(),
  front: FaceShow,
  back: FaceShow,
  size: PartSize,
  tone: PartTone,
  /** Its words drawn bold (the owner, 2026-10-18, beside its colour and size); a part laid out before reads as bold when it's big, as it always looked. */
  bold: z.boolean(),
  /** Its name: over words, on a player or a button. */
  label: z.boolean(),
  look: MediaLook,
  /** A sound or a clip plays by itself when it comes into view. */
  auto: z.boolean(),
  /** It sits beside the one above it, in one row, rather than under it. */
  beside: z.boolean(),
  /**
   * The field this one's words are written small over, as its reading over a word; null for none (the owner,
   * 2026-10-16: "the card's reading right above the word, optionally, just like in the popup"). Set on the reading
   * ("Reading above: Word"), words of one line over words of one line, wherever the two stand in the card's order: it
   * shows there as its own front and back say, and has no place of its own while it does. (Two tries came first the
   * same day: "over the one below", which did nothing with the reading under its word, then the word naming its reading,
   * which the owner read the other way round.)
   */
  over: z.uuid().nullable(),
  /**
   * Another field whose words are lit where they stand in this one's (its "Highlight"); null for none. The word in its
   * sentence, lit as the extension's drawer lights it while the card is made (the owner, 2026-10-18). Set on words
   * (a line or a paragraph), or on a Media part, whose subtitles it's lit in (the word in the line being said, the same
   * day), naming another field of words; its first appearance is lit, and nothing when it isn't there.
   */
  mark: z.uuid().nullable(),
  /**
   * Whether this part's clip plays with its subtitles: the words said in it, as they were heard on the video when it
   * was recorded, each line as it's said and the piece being said underlined (`media.ts` → `MediaCues`), as the
   * extension draws them over YouTube. Set on a Media part; over the picture of the player and the plain player only;
   * in the app's own subtitle style (`Settings.subtitleStyle`). It named a field whose words were laid over the whole
   * clip for a day (2026-10-18), until the owner had it follow the speech: "the timestamps and words sourced from the
   * video".
   */
  subtitles: z.boolean(),
});
export type LayoutPart = z.infer<typeof LayoutPart>;

export const NOTHING_ON_FRONT = "Put something on the front.";
/** A layout as it's sent: each field once, and something on the front, or the card couldn't be turned. */
export const CardLayout = z
  .array(LayoutPart)
  .max(200)
  .refine((parts) => new Set(parts.map((p) => p.fieldId)).size === parts.length, { message: "A field is on the card twice." })
  .refine((parts) => parts.length === 0 || parts.some((p) => p.front !== "hide"), { message: NOTHING_ON_FRONT });
export type CardLayout = z.infer<typeof CardLayout>;

/** The card's two sides. */
export type CardSide = "front" | "back";

/** The side a field counts as being on, for what knows only two (a card's row in a list, a form's big field): the front when the front shows it at all. */
export const sideOf = (part: Pick<LayoutPart, "front">): CardSide => (part.front === "hide" ? "back" : "front");

/** The parts that are on a side, spoiler or not, in the card's order. */
export const partsOn = (layout: readonly LayoutPart[], side: CardSide): LayoutPart[] => layout.filter((p) => p[side] !== "hide");

/** A layout with one part moved to where another stands: after it when going down, before it when going up. */
export function movePart(layout: readonly LayoutPart[], fieldId: string, toFieldId: string): LayoutPart[] {
  const from = layout.findIndex((p) => p.fieldId === fieldId);
  const to = layout.findIndex((p) => p.fieldId === toFieldId);
  const moving = layout[from];
  if (from < 0 || to < 0 || from === to || !moving) return [...layout];
  const rest = layout.filter((_, i) => i !== from);
  const at = rest.findIndex((p) => p.fieldId === toFieldId);
  rest.splice(from < to ? at + 1 : at, 0, moving);
  return rest;
}
