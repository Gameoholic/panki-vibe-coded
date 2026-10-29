import { isBurned, isNew, stageIndex, type CalledCard, type Card, type SrsType } from "@panki/contracts";
import { NEW_WORDS, stageName } from "./srsKinds";

/** What narrowing a deck's cards needs besides the cards: the deck's SRS type, and each card's duplicates. */
type Context = { srsType: SrsType | undefined; twins: Readonly<Record<string, readonly CalledCard[]>> };

type Narrower = {
  /** What it's called in the Show list; a function where it's named by the deck's SRS type. */
  label: string | ((srsType: SrsType | undefined) => string);
  keeps: (card: Card, ctx: Context) => boolean;
  /** Whether it's offered for this deck: one about stages only where there's an SRS type. */
  offered?: (ctx: Context) => boolean;
};

const ranked = ({ srsType }: Context) => srsType !== undefined;

/**
 * The ways a deck's cards can be narrowed to some of them, one entry each (the owner, 2026-10-30: "a way to FILTER
 * cards, for example but not limited to whether they are suspended or not"); every stage of the deck's SRS type is one
 * more, after these (`stageFilter`). A new way is one entry.
 */
export const CARD_FILTERS = {
  all: { label: "All cards", keeps: () => true },
  due: { label: "Due now", keeps: (card) => card.due },
  new: { label: NEW_WORDS.name, keeps: (card) => isNew(card.place) && !card.hold },
  suspended: { label: "Suspended", keeps: (card) => card.hold?.kind === "suspend" },
  snoozed: { label: "Snoozed", keeps: (card) => card.hold?.kind === "bury" },
  burned: { label: (srsType) => srsType?.burnedName ?? "Burned", keeps: (card, { srsType }) => srsType !== undefined && isBurned(srsType, card.place), offered: ranked },
  duplicates: { label: "Duplicates", keeps: (card, { twins }) => (twins[card.id]?.length ?? 0) > 0 },
  examples: { label: "With other examples", keeps: (card) => card.examples.length > 0 },
} satisfies Record<string, Narrower>;

type FixedId = keyof typeof CARD_FILTERS;
const FIXED_IDS = Object.keys(CARD_FILTERS) as FixedId[];
/** A filter as the Show list knows it: one of the entries above, or a stage of the deck's SRS type by its place on the ladder (`stage:2`). */
export type CardFilterId = FixedId | `stage:${number}`;
export const ALL_CARDS: CardFilterId = "all";

/** Every way offered for this deck, as the Show list lists them. */
export function filterOptions(ctx: Context): { id: CardFilterId; label: string }[] {
  const fixed = FIXED_IDS.filter((id) => {
    const narrower: Narrower = CARD_FILTERS[id];
    return narrower.offered?.(ctx) ?? true;
  }).map((id) => {
    const { label }: Narrower = CARD_FILTERS[id];
    return { id: id as CardFilterId, label: typeof label === "string" ? label : label(ctx.srsType) };
  });
  const stages = (ctx.srsType?.stages ?? []).map((_, idx) => ({ id: `stage:${idx}` as CardFilterId, label: ctx.srsType ? stageName(ctx.srsType, idx) : "" }));
  return [...fixed, ...stages];
}

/** The cards that way keeps, in the order they came in. */
export function filterCards(cards: readonly Card[], id: CardFilterId, ctx: Context): Card[] {
  if (id === ALL_CARDS) return [...cards];
  if (id.startsWith("stage:")) {
    const idx = Number(id.slice("stage:".length));
    const { srsType } = ctx;
    if (!srsType) return [...cards];
    return cards.filter((card) => !isNew(card.place) && !isBurned(srsType, card.place) && stageIndex(srsType, card.place) === idx);
  }
  const narrower: Narrower | undefined = FIXED_IDS.includes(id as FixedId) ? CARD_FILTERS[id as FixedId] : undefined;
  return narrower ? cards.filter((card) => narrower.keeps(card, ctx)) : [...cards];
}
