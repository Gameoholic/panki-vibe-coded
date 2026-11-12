/** @panki A type's layout as it stands, filled out from its fields, and the moves on it (`layoutOf`, `defaultLayout`, `examplesToColumn`, `moveInColumn`). */
import { z } from "zod";
import {
  AutoPlay,
  BlurShow,
  BlurSubtitles,
  Column,
  DEFAULT_FLAG_MARK,
  DEFAULT_SPARK_MARK,
  DEFAULT_STAGE_TAG,
  EXAMPLES_SLOT,
  ExamplesPlace,
  FaceShow,
  MediaLook,
  PartSize,
  PartTone,
  TagCorner,
  movePart,
  partsOnIn,
  type CardSide,
  type FlagMark,
  type LayoutPart,
  type SparkMark,
  type StageTag,
} from "./layout";
import { holdsProse, holdsWords, type CardField } from "./type";

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
  blur: BlurShow.optional().catch(undefined),
  blurSubtitles: BlurSubtitles.optional().catch(undefined),
  staged: z.boolean().optional().catch(undefined),
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
    blur: "show",
    blurSubtitles: "show",
    staged: false,
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
  /** Words: a line, a paragraph or a Line, what can be lit in and what a clip's subtitles are made of. */
  const wordy = (fieldId: string) => {
    const kind = kindOf.get(fieldId);
    return kind !== undefined && holdsProse(kind);
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
      ...(own.blur !== undefined ? { blur: own.blur } : {}),
      ...(own.blurSubtitles !== undefined ? { blurSubtitles: own.blurSubtitles } : {}),
      // Only a sound or a clip fills the screen, and only the first picked to.
      staged: own.staged === true && kindOf.get(base.fieldId) === "media" && !parts.some((p) => p.staged),
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

/** Whether a part can fill the screen in a review: a Media field's, in the Player look (whose own full screen it is). */
const canStage = (part: LayoutPart, kindOf: (fieldId: string) => string | undefined) => kindOf(part.fieldId) === "media" && part.look === "player";

/**
 * The fields whose clip a review's full screen may fill the screen with, the one it tries first first: the part picked
 * to (`LayoutPart.staged`) while it's still a Media part in the Player look, then every such part in the card's order.
 * A card shows the first of them that holds a clip there to see (not a sound, not under a spoiler); the Layout tab's
 * Full screen says the first.
 */
export function stagedOrder(layout: readonly LayoutPart[], fields: readonly Pick<CardField, "id" | "kind">[]): string[] {
  const kinds = new Map(fields.map((f) => [f.id, f.kind]));
  const can = layout.filter((p) => canStage(p, (id) => kinds.get(id)));
  const picked = can.find((p) => p.staged);
  return [...(picked ? [picked.fieldId] : []), ...can.filter((p) => p !== picked).map((p) => p.fieldId)];
}
/** The field a review's full screen fills the screen with, as laid out: the picked one, else the first that can (`stagedOrder`); none without one. */
export const stagedOf = (layout: readonly LayoutPart[], fields: readonly Pick<CardField, "id" | "kind">[]): string | null => stagedOrder(layout, fields)[0] ?? null;

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

/** The flag as it's kept, beside the stage tag (`flag` in the same JSON): anything missing or broken in it reads as the default's. */
const KeptFlag = z.object({
  flag: z
    .object({
      shown: z.boolean().optional().catch(undefined),
      corner: TagCorner.optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

/** A type's flag as it stands, from what's kept beside its stage tag. One never laid out stands where the spark does. */
export function flagMarkOf(kept: unknown, spark: SparkMark): FlagMark {
  const read = KeptFlag.safeParse(kept);
  const flag = read.success ? read.data.flag : undefined;
  return { shown: flag?.shown ?? DEFAULT_FLAG_MARK.shown, corner: flag?.corner ?? spark.corner };
}

/** The example arrows as they're kept, beside the stage tag (`examples` in the same JSON). */
const KeptExamples = z.object({ examples: ExamplesPlace.nullable().optional().catch(undefined) });

/**
 * A type's example arrows as they're laid out, from what's kept beside its stage tag: null for a type nobody laid them
 * out on, which has them where the example is (`examplesAt`), and for a place that doesn't read or follows a field the
 * type no longer has.
 */
export function examplesPlaceOf(kept: unknown, fields: readonly Pick<CardField, "id">[]): ExamplesPlace | null {
  const read = KeptExamples.safeParse(kept);
  const place = read.success ? (read.data.examples ?? null) : null;
  if (!place) return null;
  return place.after === null || fields.some((f) => f.id === place.after) ? place : null;
}

type ExampleFieldLike = Pick<CardField, "id" | "perExample">;
/** The parts of a type's fields that are One per example, in the card's order. */
const exampleParts = (layout: readonly LayoutPart[], fields: readonly ExampleFieldLike[]) => {
  const ids = new Set(fields.filter((f) => f.perExample).map((f) => f.id));
  return layout.filter((p) => ids.has(p.fieldId));
};

/**
 * Where the example arrows stand: as laid out, else (null, nobody laid them out) right after the example, the last One
 * per example part the front shows, else the last at all, in its column, where they always stood. None for a type with
 * no field that's One per example.
 */
export function examplesAt(layout: readonly LayoutPart[], fields: readonly ExampleFieldLike[], place: ExamplesPlace | null): ExamplesPlace | null {
  const parts = exampleParts(layout, fields);
  if (parts.length === 0) return null;
  if (place) return place;
  const last = parts.filter((p) => p.front !== "hide").at(-1) ?? parts.at(-1);
  return last ? { column: last.column, after: last.fieldId } : null;
}

/** Whether the example arrows show on a side: always on the back, on the front while a part of the example shows there; held unseen for the back otherwise. */
export const examplesOn = (layout: readonly LayoutPart[], fields: readonly ExampleFieldLike[], side: CardSide): boolean =>
  side === "back" || exampleParts(layout, fields).some((p) => p.front !== "hide");

/**
 * Where the example arrows stand among a column's items (`ids`, field ids in the card's order: its parts, or its rows by
 * their first part): how many come before them, those no later in the card's order than the part they follow, and any
 * set beside the last of those, so a row is never split.
 */
export function examplesIndex(layout: readonly LayoutPart[], ids: readonly string[], place: ExamplesPlace): number {
  const at = new Map(layout.map((p, i) => [p.fieldId, i]));
  const until = place.after === null ? -1 : (at.get(place.after) ?? -1);
  let k = 0;
  while (k < ids.length && (at.get(ids[k] ?? "") ?? Infinity) <= until) k++;
  while (k > 0 && k < ids.length && layout[at.get(ids[k] ?? "") ?? -1]?.beside) k++;
  return k;
}

/**
 * What's moved among in a column on a side, in its order: its parts on that side (`partsOnIn`), and the example arrows
 * (`EXAMPLES_SLOT`) where they stand while they show there.
 */
export function columnOrder(layout: readonly LayoutPart[], fields: readonly ExampleFieldLike[], side: CardSide, column: Column, place: ExamplesPlace | null): string[] {
  const ids = partsOnIn(layout, side, column).map((p) => p.fieldId);
  const at = examplesAt(layout, fields, place);
  if (!at || at.column !== column || !examplesOn(layout, fields, side)) return ids;
  const k = examplesIndex(layout, ids, at);
  return [...ids.slice(0, k), EXAMPLES_SLOT, ...ids.slice(k)];
}

/**
 * An item of a column moved to where another stands (`from`, `to`: places in its `columnOrder`). A part moves in the
 * card's order as `movePart` moves it, past the parts it passed. The example arrows then stand after the item before
 * them in the column (or before its first part), so they stay where they're seen; arrows nobody laid out stay so while
 * a part moves, still following the example.
 */
export function moveInColumn(
  layout: readonly LayoutPart[],
  fields: readonly ExampleFieldLike[],
  side: CardSide,
  column: Column,
  place: ExamplesPlace | null,
  from: number,
  to: number,
): { layout: LayoutPart[]; examples: ExamplesPlace | null } {
  const order = columnOrder(layout, fields, side, column, place);
  const moving = order[from];
  if (moving === undefined || order[to] === undefined || from === to) return { layout: [...layout], examples: place };
  const next = order.filter((_, i) => i !== from);
  next.splice(to, 0, moving);
  let moved = [...layout];
  if (moving !== EXAMPLES_SLOT) {
    const was = order.filter((id) => id !== EXAMPLES_SLOT).indexOf(moving);
    const parts = next.filter((id) => id !== EXAMPLES_SLOT);
    const now = parts.indexOf(moving);
    // Past the arrows alone, no part moves.
    const target = now > was ? parts[now - 1] : now < was ? parts[now + 1] : undefined;
    if (target !== undefined) moved = movePart(layout, moving, target);
    if (place === null) return { layout: moved, examples: null };
  }
  const k = next.indexOf(EXAMPLES_SLOT);
  const at = examplesAt(moved, fields, place);
  if (k < 0 || !at) return { layout: moved, examples: place };
  const before = next[k - 1];
  if (before !== undefined) return { layout: moved, examples: { column, after: before } };
  // First in the column: after whatever stands right before its first part in the card's order.
  const first = next[k + 1];
  const i = first === undefined ? -1 : moved.findIndex((p) => p.fieldId === first);
  return { layout: moved, examples: { column, after: i < 0 ? at.after : (moved[i - 1]?.fieldId ?? null) } };
}

/** The example arrows moved to a column: the same place in the card's order, under whatever stands above it there. */
export function examplesToColumn(layout: readonly LayoutPart[], fields: readonly ExampleFieldLike[], place: ExamplesPlace | null, column: Column): ExamplesPlace | null {
  const at = examplesAt(layout, fields, place);
  return at ? { column, after: at.after } : place;
}
