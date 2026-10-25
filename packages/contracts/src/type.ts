import { z } from "zod";
import { CardLayout, DEFAULT_STAGE_TAG, StageTag } from "./layout";
import { MediaId, type MediaKind } from "./media";
import { youtubeMetaOf, type YouTubeLink, type YouTubeMeta } from "./youtube";

export const CardTypeId = z.uuid();
export const CardFieldId = z.uuid();
export const FieldSide = z.enum(["front", "back"]);
/**
 * What a field holds: one line of text, several, a file (media: a clip or a sound, whichever is put there; or a
 * picture), a link to a YouTube video, or a pitch accent (drawn as the line over its reading, `pitch.ts`; the owner,
 * 2026-10-16). The ids live here so the API refuses a kind that doesn't exist; the word for each and how it's filled
 * in and shown is the web's `FIELD_KINDS` registry. (Sound and clips were two kinds, `audio` and `video`, until
 * 2026-10-11; the owner made them one, since the same field takes either.)
 */
export const FieldKind = z.enum(["text", "long", "media", "image", "youtube", "pitch"]);

/** The kinds of file each kind of field takes. One home: a kind that isn't here holds no file. */
const FILES_IN: Partial<Record<FieldKind, readonly MediaKind[]>> = {
  media: ["video", "audio"],
  image: ["image"],
};
const NO_FILES: readonly MediaKind[] = [];

/** The kinds of file a field can hold; none for a field of anything else. Its value on a card is then the file's id, or empty. */
export function mediaKindsOf(kind: FieldKind): readonly MediaKind[] {
  return FILES_IN[kind] ?? NO_FILES;
}

/** Whether a field holds a file: its value on a card is then the file's id, and what the file is (a clip, a sound, a picture) is the file's own to say. */
export function holdsFile(kind: FieldKind): boolean {
  return mediaKindsOf(kind).length > 0;
}

/** Whether a field holds a video's metadata (its link, its title, its channel: `youtube.ts` → `YouTubeMeta`); its value on a card is then `youtubeMetaValue`'s, or a bare address from before. */
export function holdsLink(kind: FieldKind): boolean {
  return kind === "youtube";
}

/**
 * The metadata a value is, when its field holds it and the value is some; null when it's to be read as words. Words
 * typed into a field before it was changed to this kind are still words, and still shown.
 */
export function metaOf(kind: FieldKind, value: string): YouTubeMeta | null {
  return holdsLink(kind) ? youtubeMetaOf(value) : null;
}
/** The link alone, out of the same. */
export function linkOf(kind: FieldKind, value: string): YouTubeLink | null {
  return metaOf(kind, value)?.link ?? null;
}

/** Whether a field holds a pitch accent: its value is then the accents (`pitch.ts` → `pitchesOf`), drawn over their readings. */
export function holdsPitch(kind: FieldKind): boolean {
  return kind === "pitch";
}

/** Whether a field's value is typed in a box: words, a paragraph, a pitch accent. A file's id isn't, and an address isn't. */
export function isTyped(kind: FieldKind): boolean {
  return !holdsFile(kind) && !holdsLink(kind);
}

/** Whether a field holds words to read: what a card is called by, and what can be shown big. A file's id isn't, an address isn't, and a pitch accent isn't. */
export function holdsWords(kind: FieldKind): boolean {
  return isTyped(kind) && !holdsPitch(kind);
}

/**
 * One field of a card type. The list's order is the fields' order in a form. `side` is where it stands for what knows
 * only two sides (a card's row in a list, a form's big field): since layouts (2026-10-15) it's read from the type's
 * layout, the front when the front shows the field at all; sent, it's only where a field with no part yet starts.
 */
export const CardField = z.object({
  id: CardFieldId,
  name: z.string().trim().min(1).max(60),
  kind: FieldKind,
  side: FieldSide,
  required: z.boolean(),
  /**
   * Whether two cards called the same (`wordsFieldOf`) are told apart by this field: when both hold something here and
   * it differs, neither is the other's duplicate (the owner, 2026-10-23: a word added again with another meaning is no
   * duplicate). Only a field of words means anything by it (`apartOf`); left out, it's off.
   */
  tellsApart: z.boolean().default(false),
  /**
   * Whether this field goes with an example rather than the card (the owner, 2026-10-25): a card that's already there
   * can be given another example (a sentence, its clip, its video), and a field that's One per example holds a value of
   * each example's own. Off, the field is the card's alone, as every field was before. Left out, it's off.
   */
  perExample: z.boolean().default(false),
});

/** What the browser sends to make a type. The ids are minted by the browser, so a retry is harmless. */
export const NewCardType = z.object({
  id: CardTypeId,
  name: z.string().trim().min(1).max(100),
  fields: z.array(CardField).min(1),
  /** How its cards look in a review (`layout.ts`); left out, it's worked out from the fields' sides. */
  layout: CardLayout.optional(),
  /** Where its cards' stage tag sits and how (`layout.ts` → `StageTag`); left out, as it stands (or the default). */
  tag: StageTag.optional(),
  /**
   * The field its cards are called by (`wordsFieldOf`): what names a card and what a card already there is found by
   * (the warning on adding, the duplicates, the popup, the highlighting). Picked by the owner, never assumed (2026-10-25:
   * "I don't want you to assume what the main word is"): null, and its cards have no duplicates. Left out, as it stands
   * (none for a new type).
   */
  mainField: CardFieldId.nullable().optional(),
});

/** What a type's settings can change: the name, the whole list of fields in order (a field left out is hidden; a new id is added), and its layout and stage tag when they're sent (left out, they stay as they are). */
export const CardTypeUpdate = NewCardType.omit({ id: true });

export const CardType = NewCardType.extend({
  /** Every field's part, in the card's order, filled out by the API on every read (`cardLayout.ts` → `layoutOf`). */
  layout: CardLayout,
  /** The stage tag as it stands; a type from before it could be laid out (or an older server) has the default. */
  tag: StageTag.default(DEFAULT_STAGE_TAG),
  /** Its main field as it stands, a field of words it has; null when none is picked (or from an older server). */
  mainField: CardFieldId.nullable().default(null),
  /** Stamped by the API, ms since epoch. */
  createdAt: z.number().int().nonnegative(),
  /** Derived by the API on every read: how many decks use it. */
  deckCount: z.number().int().nonnegative(),
});

export type CardField = z.infer<typeof CardField>;
export type FieldKind = z.infer<typeof FieldKind>;
export type FieldSide = z.infer<typeof FieldSide>;
export type NewCardType = z.infer<typeof NewCardType>;
export type CardTypeUpdate = z.infer<typeof CardTypeUpdate>;
export type CardType = z.infer<typeof CardType>;

export const CardTypeList = z.object({ types: z.array(CardType) });
export const CardTypeResponse = z.object({ type: CardType });

/**
 * The field a type's cards are called by in words: its main field, as the owner picked it (`mainField`), while it's one
 * of its fields that holds words. None when none is picked (the owner, 2026-10-25: no assuming which it is; until then
 * it was the first Front field of words). A card is named by it wherever it's named: asked about before it's deleted,
 * over its mark on a video's bar, as a card already there when one called the same is being added, and in duplicates.
 */
export function wordsFieldOf(type: { fields: readonly CardField[]; mainField?: string | null | undefined }): CardField | null {
  if (!type.mainField) return null;
  return type.fields.find((f) => f.id === type.mainField && holdsWords(f.kind)) ?? null;
}

/** The fields an example holds: its type's fields that are One per example (`CardField.perExample`). None, and its cards take no examples. */
export function exampleFieldsOf(type: Pick<CardType, "fields">): CardField[] {
  return type.fields.filter((f) => f.perExample);
}

/** The most one value can hold. */
export const VALUE_MAX = 2000;

export type CardProblem = { fieldId: string; problem: "missing" | "long" | "media" | "link" | "unknown" };

/**
 * What's wrong with a card's values for a type: a required field left empty, a value too long, a field of files given
 * something that isn't a file's id, a field of links given something that isn't one, a field the type doesn't have.
 * Pure, so the browser says it before sending and the API says it again at the boundary (where it also checks the file
 * is really there, which only it can know).
 */
export function cardProblems(type: Pick<CardType, "fields">, values: Record<string, string>): CardProblem[] {
  const problems: CardProblem[] = [];
  const known = new Set<string>();
  for (const field of type.fields) {
    known.add(field.id);
    const value = (values[field.id] ?? "").trim();
    if (field.required && value === "") problems.push({ fieldId: field.id, problem: "missing" });
    else if (value !== "" && holdsFile(field.kind) && !MediaId.safeParse(value).success) problems.push({ fieldId: field.id, problem: "media" });
    else if (value !== "" && holdsLink(field.kind) && linkOf(field.kind, value) === null) problems.push({ fieldId: field.id, problem: "link" });
    else if (value.length > VALUE_MAX) problems.push({ fieldId: field.id, problem: "long" });
  }
  for (const fieldId of Object.keys(values)) {
    if (!known.has(fieldId)) problems.push({ fieldId, problem: "unknown" });
  }
  return problems;
}
