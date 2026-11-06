import { z } from "zod";
import { AutoPlay, Column, DEFAULT_LISTEN_FIRST, DEFAULT_SPARK_MARK, DEFAULT_STAGE_TAG, FaceShow, SHOW_ON_PLAY_MAX, ListenShow, ListenSubtitles, MediaLook, PartSize, PartTone, TagCorner, type LayoutPart, type ListenFirst, type SparkMark, type StageTag } from "./layout";
import { holdsWords, type CardField } from "./type";

/** One part as it was kept: anything missing or broken in it reads as the field's default, so an old layout still reads. */
const KeptPart = z.object({
  fieldId: z.string(),
  front: FaceShow.optional().catch(undefined),
  back: FaceShow.optional().catch(undefined),
  size: PartSize.optional().catch(undefined),
  tone: PartTone.optional().catch(undefined),
  bold: z.boolean().optional().catch(undefined),
  label: z.boolean().optional().catch(undefined),
  look: MediaLook.optional().catch(undefined),
  plays: AutoPlay.optional().catch(undefined),
  /** Kept before `plays`: on was "as it comes into view", which is when the card comes up for a part on the front and when it's turned for one only on the back. */
  auto: z.boolean().optional().catch(undefined),
  column: Column.optional().catch(undefined),
  beside: z.boolean().optional().catch(undefined),
  over: z.string().nullable().optional().catch(undefined),
  mark: z.string().nullable().optional().catch(undefined),
  subtitles: z.boolean().optional().catch(undefined),
  listen: ListenShow.optional().catch(undefined),
  listenSubtitles: ListenSubtitles.optional().catch(undefined),
  showOnPlay: z.number().int().min(2).max(SHOW_ON_PLAY_MAX).nullable().optional().catch(undefined),
});

type FieldLike = Pick<CardField, "id" | "kind" | "side">;

/**
 * Every field's part as the card looked before there were layouts: the Front fields first, the first of them that
 * holds words big and the others quieter, then the Back fields, shown once it's turned. A type nobody has laid out
 * looks exactly as it always did.
 */
export function defaultLayout(fields: readonly FieldLike[]): LayoutPart[] {
  const front = fields.filter((f) => f.side === "front");
  const back = fields.filter((f) => f.side === "back");
  const lead = front.find((f) => holdsWords(f.kind));
  const part = (field: FieldLike, onFront: boolean): LayoutPart => ({
    fieldId: field.id,
    front: onFront ? "show" : "hide",
    back: "show",
    size: field.id === lead?.id ? "big" : "normal",
    tone: onFront && field.id !== lead?.id ? "quiet" : "normal",
    bold: field.id === lead?.id,
    label: false,
    look: "player",
    plays: "never",
    column: "main",
    beside: false,
    over: null,
    mark: null,
    subtitles: false,
    listen: "show",
    listenSubtitles: "show",
    showOnPlay: null,
  });
  return [...front.map((f) => part(f, true)), ...back.map((f) => part(f, false))];
}

/**
 * A type's layout as it stands: the kept parts of fields it still has, in their order, each filled out with its
 * field's default where something's missing; then every field the layout doesn't name yet (one added since), as its
 * default would have it. Something always shows on the front: when nothing does, the first part does. A part written
 * over another as its reading names another field the type still has, of words of one line as the part itself is, or
 * it's over none. A part's highlight names another field of words too, lit in this part's words, or in a clip's
 * subtitles; a clip's subtitles are on only for a Media field.
 *
 * A layout kept before a part could say which column it stands in (no part says) has its clip in the side column, as
 * the review drew it then: the first part that shows a video in a picture (the Player or Plain look) of a field that
 * holds a clip on some card (`holdsClip`, which only the API can tell), standing in no row; everything else in the main
 * column. A layout that says, says for good.
 */
export function layoutOf(fields: readonly FieldLike[], kept: readonly unknown[] = [], holdsClip: (fieldId: string) => boolean = () => false): LayoutPart[] {
  const defaults = defaultLayout(fields);
  const byId = new Map(defaults.map((p) => [p.fieldId, p]));
  const kindOf = new Map(fields.map((f) => [f.id, f.kind]));
  const overFits = (fieldId: string, word: string) => word !== fieldId && kindOf.get(word) === "text" && kindOf.get(fieldId) === "text";
  /** Words: a line or a paragraph, what can be lit in and what a clip's subtitles are made of. */
  const wordy = (fieldId: string) => {
    const kind = kindOf.get(fieldId);
    return kind === "text" || kind === "long";
  };
  const markFits = (fieldId: string, other: string) => other !== fieldId && wordy(other) && (wordy(fieldId) || kindOf.get(fieldId) === "media");
  const placed = new Set<string>();
  const parts: LayoutPart[] = [];
  let saysColumns = false;
  for (const raw of kept) {
    const read = KeptPart.safeParse(raw);
    if (!read.success) continue;
    if (read.data.column !== undefined) saysColumns = true;
    const base = byId.get(read.data.fieldId);
    if (!base || placed.has(base.fieldId)) continue;
    placed.add(base.fieldId);
    const { fieldId: _id, auto, ...own } = read.data;
    const front = own.front ?? base.front;
    const plays = own.plays ?? (auto === undefined ? undefined : !auto ? "never" : front !== "hide" ? "shown" : "turned");
    parts.push({
      ...base,
      ...(own.front !== undefined ? { front: own.front } : {}),
      ...(own.back !== undefined ? { back: own.back } : {}),
      ...(own.size !== undefined ? { size: own.size } : {}),
      ...(own.tone !== undefined ? { tone: own.tone } : {}),
      // Bold was the big size's own before a part could say: one kept without it is bold when it's big.
      bold: own.bold ?? (own.size ?? base.size) === "big",
      ...(own.label !== undefined ? { label: own.label } : {}),
      ...(own.look !== undefined ? { look: own.look } : {}),
      ...(plays !== undefined ? { plays } : {}),
      ...(own.column !== undefined ? { column: own.column } : {}),
      ...(own.beside !== undefined ? { beside: own.beside } : {}),
      ...(own.over ? { over: overFits(base.fieldId, own.over) ? own.over : null } : {}),
      ...(own.mark ? { mark: markFits(base.fieldId, own.mark) ? own.mark : null } : {}),
      ...(own.subtitles !== undefined ? { subtitles: own.subtitles && kindOf.get(base.fieldId) === "media" } : {}),
      ...(own.listen !== undefined ? { listen: own.listen } : {}),
      ...(own.listenSubtitles !== undefined ? { listenSubtitles: own.listenSubtitles } : {}),
      // Only a sound or a clip shows the card by itself, and only the first that says so.
      showOnPlay: own.showOnPlay && kindOf.get(base.fieldId) === "media" && !parts.some((p) => p.showOnPlay !== null) ? own.showOnPlay : null,
    });
  }
  for (const part of defaults) if (!placed.has(part.fieldId)) parts.push(part);
  const first = parts[0];
  if (first && !parts.some((p) => p.front !== "hide")) parts[0] = { ...first, front: "show" };
  if (!saysColumns) {
    // A clip in a row (set beside the part above it, or with the next part set beside it) stood in that row.
    const clip = parts.findIndex(
      (p, i) => kindOf.get(p.fieldId) === "media" && (p.look === "player" || p.look === "plain") && !p.beside && !parts[i + 1]?.beside && holdsClip(p.fieldId),
    );
    const part = parts[clip];
    if (part) parts[clip] = { ...part, column: "side" };
  }
  return parts;
}

/** The stage tag as it was kept: anything missing or broken in it reads as the default's, so a tag from before still reads. */
const KeptTag = z.object({
  shown: z.boolean().optional().catch(undefined),
  size: PartSize.optional().catch(undefined),
  corner: TagCorner.optional().catch(undefined),
});

/** A type's stage tag as it stands, from what's kept (nothing, for a type nobody laid it out on). */
export function stageTagOf(kept: unknown): StageTag {
  const read = KeptTag.safeParse(kept);
  if (!read.success) return { ...DEFAULT_STAGE_TAG };
  const { shown, size, corner } = read.data;
  return { shown: shown ?? DEFAULT_STAGE_TAG.shown, size: size ?? DEFAULT_STAGE_TAG.size, corner: corner ?? DEFAULT_STAGE_TAG.corner };
}

/** The AI spark as it's kept, beside the stage tag (`spark` in the same JSON): anything missing or broken in it reads as the default's. */
const KeptSpark = z.object({
  spark: z
    .object({
      shown: z.boolean().optional().catch(undefined),
      corner: TagCorner.optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

/**
 * A type's AI spark as it stands, from what's kept beside its stage tag. One never laid out stands where it always did:
 * the top corner the tag leaves free (the top left while a shown tag is in the top right, else the top right).
 */
export function sparkMarkOf(kept: unknown, tag: StageTag): SparkMark {
  const read = KeptSpark.safeParse(kept);
  const spark = read.success ? read.data.spark : undefined;
  const corner = tag.shown && tag.corner === "top-right" ? "top-left" : DEFAULT_SPARK_MARK.corner;
  return { shown: spark?.shown ?? DEFAULT_SPARK_MARK.shown, corner: spark?.corner ?? corner };
}

/**
 * Listen first as it was kept: anything missing or broken in it reads as the default's, so a type from before reads as
 * off. A count of hearings kept on it (`heard`) is let go: a sound or clip says that now.
 */
const KeptListen = z.object({
  on: z.boolean().optional().catch(undefined),
});

/** A type's Listen first as it stands, from what's kept (nothing, for a type it was never switched on for). */
export function listenFirstOf(kept: unknown): ListenFirst {
  const read = KeptListen.safeParse(kept);
  if (!read.success) return { ...DEFAULT_LISTEN_FIRST };
  return { on: read.data.on ?? DEFAULT_LISTEN_FIRST.on };
}
