import { z } from "zod";

/**
 * How a card type's cards look in a review, edited on the card itself. For each field: what each side of the card does with it, where it sits, and how it looks. The
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
 * a ring, a tile with its name and length, or a speaker to sit beside the words it says, all kept to choose from. All
 * but the player and plain play a clip's sound alone.
 */
export const MediaLook = z.enum(["player", "plain", "button", "voice", "round", "tile", "speaker"]);
export type MediaLook = z.infer<typeof MediaLook>;
/**
 * When a sound or a clip plays by itself in a review: never, only when pressed; when the card comes up, if it's on the front then; when the card is
 * turned, if it's on the back (a clip on both sides plays again); or both. A spoiler waits until it's opened.
 */
export const AutoPlay = z.enum(["never", "shown", "turned", "both"]);
export type AutoPlay = z.infer<typeof AutoPlay>;
/** Whether a part plays by itself on this side. */
export const playsOn = (plays: AutoPlay, side: "front" | "back") => plays === "both" || plays === (side === "front" ? "shown" : "turned");

/**
 * What the Listen phase does with a part on the front (`ListenFirst`): shows it, blurs it, or leaves it unseen, its
 * room kept either way so nothing moves as the front shows. A blurred sound or clip still plays, its picture blurred;
 * a hidden one doesn't.
 */
export const ListenShow = z.enum(["show", "blur", "hide"]);
export type ListenShow = z.infer<typeof ListenShow>;
/** What the Listen phase does with a clip's subtitles: shows them, blurs the card's word in them alone (the part's Highlight), blurs them, or leaves them off. */
export const ListenSubtitles = z.enum(["show", "word", "blur", "hide"]);
export type ListenSubtitles = z.infer<typeof ListenSubtitles>;
/** The latest play of a sound or clip that can show the card out of its Listen phase: its sixth, five heard through first. */
export const SHOW_ON_PLAY_MAX = 6;

/**
 * The card's two columns, one registry: the main one, and the side one, which stands at the card's left as tall as the
 * card where a review has the room for the two side by side (a computer's window, wide enough). Anywhere narrower the
 * parts of both stand under one another in the card's order, as if there were one. A clip is what the side column is
 * for, but any part can stand there. How wide it is is the review's one magnitude (`app.css` → `--clip-side`), never
 * the layout's.
 */
export const COLUMNS = ["main", "side"] as const;
export const Column = z.enum(COLUMNS);
export type Column = z.infer<typeof Column>;

/** One field's part on the card. What doesn't apply to its kind (a size for a link, a look for words) is kept and unused. */
export const LayoutPart = z.object({
  fieldId: z.uuid(),
  front: FaceShow,
  back: FaceShow,
  size: PartSize,
  tone: PartTone,
  /** Its words drawn bold, beside its colour and size; a part laid out before reads as bold when it's big, as it always looked. */
  bold: z.boolean(),
  /** Its name: over words, on a player or a button. */
  label: z.boolean(),
  look: MediaLook,
  /** When a sound or a clip plays by itself (once a switch, `auto`, "as it comes into view"). */
  plays: AutoPlay,
  /** The column it stands in (`Column`); the main one for a layout sent without it. */
  column: Column.default("main"),
  /** It sits beside the one above it in its column, in one row, rather than under it. */
  beside: z.boolean(),
  /**
   * The field this one's words are written small over, as its reading over a word, as the popup shows one; null for
   * none. Set on the reading ("Reading above: Word"), words of one line over words of one line, wherever the two stand
   * in the card's order: it shows there as its own front and back say, and has no place of its own while it does.
   */
  over: z.uuid().nullable(),
  /**
   * Another field whose words are lit where they stand in this one's (its "Highlight"); null for none. The word in its
   * sentence, lit as the extension's drawer lights it while the card is made. Set on words
   * (a line or a paragraph), or on a Media part, whose subtitles it's lit in (the word in the line being said), naming another field of words; its first appearance is lit, and nothing when it isn't there.
   */
  mark: z.uuid().nullable(),
  /**
   * Whether this part's clip plays with its subtitles: the words said in it, as they were heard on the video when it
   * was recorded, each line as it's said and the piece being said underlined (`media.ts` → `MediaCues`), as the
   * extension draws them over YouTube. Set on a Media part; over the picture of the player and the plain player only;
   * in the app's own subtitle style (`Settings.subtitleStyle`). They follow the speech, their times and words from the
   * video, never a field's words laid over the whole clip.
   */
  subtitles: z.boolean(),
  /** What the Listen phase does with it, while its type has Listen first on (`ListenFirst`); shown to begin with, and for a layout sent from before. */
  listen: ListenShow.default("show"),
  /** What the Listen phase does with its clip's subtitles, where they're on; shown to begin with. */
  listenSubtitles: ListenSubtitles.default("show"),
  /**
   * The play of a sound or clip in the Listen phase, by its number (2, its second), that shows the card's front the
   * moment it begins, as Done listening does (its "Ends listening", On second play…); null, only Done listening does (none
   * to begin with). A part's own, and counted as a play begins, never as the one before it finishes. One part of a
   * layout at most.
   */
  showOnPlay: z.number().int().min(2).max(SHOW_ON_PLAY_MAX).nullable().default(null),
  /**
   * The clip a review's full screen fills the screen with (its "Full screen"), picked: one part of a layout at most, a
   * Media part in the Player look. None picked, or the picked one no longer such a part, it's the first such in the
   * card's order (`cardLayout.ts` → `stagedOf`). Not picked to begin with.
   */
  staged: z.boolean().default(false),
});
export type LayoutPart = z.infer<typeof LayoutPart>;

export const NOTHING_ON_FRONT = "Put something on the front.";
/**
 * A layout as it's sent: each field once, something on the front, or the card couldn't be turned, and one part at
 * most showing the card by itself.
 */
export const CardLayout = z
  .array(LayoutPart)
  .max(200)
  .refine((parts) => new Set(parts.map((p) => p.fieldId)).size === parts.length, { message: "A field is on the card twice." })
  .refine((parts) => parts.length === 0 || parts.some((p) => p.front !== "hide"), { message: NOTHING_ON_FRONT })
  .refine((parts) => parts.filter((p) => p.showOnPlay !== null).length <= 1, { message: "Only one sound or clip can show the card by itself." })
  .refine((parts) => parts.filter((p) => p.staged).length <= 1, { message: "Only one clip can fill the screen." });
export type CardLayout = z.infer<typeof CardLayout>;

/** A corner of the card. */
export const TagCorner = z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]);
export type TagCorner = z.infer<typeof TagCorner>;
/**
 * The card's stage tag (where the card stands: New, its stage, the end; the app's `PlacePill`), laid out apart from the
 * fields, since it's none of them:
 * shown or not, alike on both sides; its size; and the corner it sits in, dragged there on the card being laid out,
 * never a place between corners.
 */
export const StageTag = z.object({ shown: z.boolean(), size: PartSize, corner: TagCorner });
export type StageTag = z.infer<typeof StageTag>;
/** As every card had it before it could be laid out: shown, at its size, top left. */
export const DEFAULT_STAGE_TAG: StageTag = { shown: true, size: "normal", corner: "top-left" };

/**
 * The marks a card carries in its corners, one registry, in the order they stand when two share a corner: the stage
 * tag, then the AI spark (shown while the side shown holds anything Panki AI wrote), then the flag (shown while the card
 * is flagged). Each is laid out as the stage tag is: shown or not, and the corner it sits in. A new mark is one id
 * here, its shape and its drawing.
 */
export const CORNER_MARK_IDS = ["tag", "spark", "flag"] as const;
export type CornerMarkId = (typeof CORNER_MARK_IDS)[number];
/** The AI spark on the card: shown or not, and its corner. */
export const SparkMark = z.object({ shown: z.boolean(), corner: TagCorner });
export type SparkMark = z.infer<typeof SparkMark>;
/** Shown, top right: where it stood while the stage tag kept the top left. */
export const DEFAULT_SPARK_MARK: SparkMark = { shown: true, corner: "top-right" };
/** The flag on a flagged card (`Card.flaggedAt`): shown or not, and its corner, as the spark's. */
export const FlagMark = SparkMark;
export type FlagMark = SparkMark;
/** Shown, top right, after the spark when the two share it. */
export const DEFAULT_FLAG_MARK: FlagMark = { shown: true, corner: "top-right" };

/**
 * Listen first, since a word known by its spelling and its video isn't yet known by ear, and understanding by hearing
 * matters more: a type's cards open in a review on a Listen phase before the
 * front, each part shown, blurred or hidden as its `listen` says, its sounds and clips there to hear; Done listening, or the
 * one sound or clip that shows it by itself beginning the play its `showOnPlay` says, shows the front.
 * Like the stage tag, the type's own, apart from its fields. A card with nothing to hear opens on its front. (A
 * `heard` kept on a type from before, how many hearings for every sound and clip alike, is let go.)
 */
export const ListenFirst = z.object({ on: z.boolean() });
export type ListenFirst = z.infer<typeof ListenFirst>;
/** As every type has it until it's switched on: off. */
export const DEFAULT_LISTEN_FIRST: ListenFirst = { on: false };

/** The card's two sides. */
export type CardSide = "front" | "back";

/** The side a field counts as being on, for what knows only two (a card's row in a list, a form's big field): the front when the front shows it at all. */
export const sideOf = (part: Pick<LayoutPart, "front">): CardSide => (part.front === "hide" ? "back" : "front");

/** The parts that are on a side, spoiler or not, in the card's order. */
export const partsOn = (layout: readonly LayoutPart[], side: CardSide): LayoutPart[] => layout.filter((p) => p[side] !== "hide");
/** The parts on a side that stand in a column, in the card's order: what a column's parts are moved among. */
export const partsOnIn = (layout: readonly LayoutPart[], side: CardSide, column: Column): LayoutPart[] => partsOn(layout, side).filter((p) => p.column === column);

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
