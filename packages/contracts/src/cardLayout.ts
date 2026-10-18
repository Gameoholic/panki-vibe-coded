import { z } from "zod";
import { FaceShow, MediaLook, PartSize, PartTone, type LayoutPart } from "./layout";
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
  auto: z.boolean().optional().catch(undefined),
  beside: z.boolean().optional().catch(undefined),
  over: z.string().nullable().optional().catch(undefined),
  mark: z.string().nullable().optional().catch(undefined),
  subtitles: z.boolean().optional().catch(undefined),
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
    auto: false,
    beside: false,
    over: null,
    mark: null,
    subtitles: false,
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
 */
export function layoutOf(fields: readonly FieldLike[], kept: readonly unknown[] = []): LayoutPart[] {
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
  for (const raw of kept) {
    const read = KeptPart.safeParse(raw);
    if (!read.success) continue;
    const base = byId.get(read.data.fieldId);
    if (!base || placed.has(base.fieldId)) continue;
    placed.add(base.fieldId);
    const { fieldId: _id, ...own } = read.data;
    parts.push({
      ...base,
      ...(own.front !== undefined ? { front: own.front } : {}),
      ...(own.back !== undefined ? { back: own.back } : {}),
      ...(own.size !== undefined ? { size: own.size } : {}),
      ...(own.tone !== undefined ? { tone: own.tone } : {}),
      // Bold was the big size's own until a part could say (2026-10-18): one kept without it is bold when it's big.
      bold: own.bold ?? (own.size ?? base.size) === "big",
      ...(own.label !== undefined ? { label: own.label } : {}),
      ...(own.look !== undefined ? { look: own.look } : {}),
      ...(own.auto !== undefined ? { auto: own.auto } : {}),
      ...(own.beside !== undefined ? { beside: own.beside } : {}),
      ...(own.over ? { over: overFits(base.fieldId, own.over) ? own.over : null } : {}),
      ...(own.mark ? { mark: markFits(base.fieldId, own.mark) ? own.mark : null } : {}),
      ...(own.subtitles !== undefined ? { subtitles: own.subtitles && kindOf.get(base.fieldId) === "media" } : {}),
    });
  }
  for (const part of defaults) if (!placed.has(part.fieldId)) parts.push(part);
  const first = parts[0];
  if (first && !parts.some((p) => p.front !== "hide")) parts[0] = { ...first, front: "show" };
  return parts;
}
