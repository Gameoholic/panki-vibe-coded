import { isBurned, isNew, stageIndex, wordsFieldOf, type Card, type CardType, type SrsType } from "@panki/contracts";
import { ledger } from "./ledger";

/** Which way a sort runs: up puts the smallest first. */
export type SortWay = "up" | "down";
const SORT_WAYS: readonly SortWay[] = ["up", "down"];

/** What a card is sorted against: its deck's types. */
type Deck = { type: CardType; srsType: SrsType | undefined };

type Sorter = {
  /** What it sorts by, in the Sort by list. */
  label: string;
  /** Each way as it puts the cards: "Newest first", "Oldest first". */
  ways: Record<SortWay, string>;
  /** The way it runs when it's picked, and the one shown first. */
  first: SortWay;
  /** What a card is sorted on; null for one that has none (a new card's due time), which goes last whichever way. */
  key: (card: Card, deck: Deck) => number | string | null;
};

/** The ways a deck's cards can be put in order, one entry each (the owner, 2026-10-21: "add sort settings to the cards view in the deck"). */
export const CARD_SORTS = {
  added: { label: "Added", ways: { up: "Oldest first", down: "Newest first" }, first: "down", key: (card) => card.createdAt },
  due: { label: "Due", ways: { up: "Soonest first", down: "Latest first" }, first: "up", key: (card) => card.dueAt },
  words: {
    label: "Word",
    ways: { up: "A to Z", down: "Z to A" },
    first: "up",
    key: (card, { type }) => {
      const field = wordsFieldOf(type);
      const words = field ? (card.values[field.id] ?? "").trim() : "";
      return words === "" ? null : words;
    },
  },
  stage: {
    label: "Stage",
    ways: { up: "Lowest first", down: "Highest first" },
    first: "up",
    // New before the first stage, burned past the last.
    key: (card, { srsType }) => (!srsType ? null : isNew(card.place) ? -1 : isBurned(srsType, card.place) ? srsType.stages.length + card.place.past : stageIndex(srsType, card.place)),
  },
  // Reviews and Last reviewed were here for an hour; the owner had them out the same day.
} satisfies Record<string, Sorter>;

export type CardSortId = keyof typeof CARD_SORTS;
export const CARD_SORT_IDS = Object.keys(CARD_SORTS) as CardSortId[];
export type CardSort = { by: CardSortId; way: SortWay };
/** As the list always was: the newest card first. */
export const DEFAULT_CARD_SORT: CardSort = { by: "added", way: "down" };

/** The two ways of a sort, the one it starts on first. */
export const waysOf = (by: CardSortId): readonly SortWay[] => (CARD_SORTS[by].first === "up" ? SORT_WAYS : [...SORT_WAYS].reverse());

/** The cards in that order; cards alike in it stay newest first. Words are compared as Japanese is ordered. */
export function sortCards(cards: readonly Card[], sort: CardSort, deck: Deck): Card[] {
  const sorter: Sorter = CARD_SORTS[sort.by];
  const sign = sort.way === "up" ? 1 : -1;
  const keyed = cards.map((card) => ({ card, key: sorter.key(card, deck) }));
  keyed.sort((a, b) => {
    if (a.key !== null && b.key !== null) {
      const by = typeof a.key === "number" && typeof b.key === "number" ? a.key - b.key : String(a.key).localeCompare(String(b.key), "ja");
      if (by !== 0) return sign * by;
    } else if (a.key !== b.key) return a.key === null ? 1 : -1;
    return b.card.createdAt - a.card.createdAt || (a.card.id < b.card.id ? 1 : a.card.id > b.card.id ? -1 : 0);
  });
  return keyed.map(({ card }) => card);
}

// Kept on this device for every deck, as the home's layout is: how a list is read is the device's, not the account's.
const KEY = "panki.cards.sort";

/** The sort last picked here; a missing or broken value is the default. */
export function readCardSort(): CardSort {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_CARD_SORT;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("by" in parsed) || !("way" in parsed)) return DEFAULT_CARD_SORT;
    const { by, way } = parsed;
    const known = CARD_SORT_IDS.find((id) => id === by);
    const going = SORT_WAYS.find((w) => w === way);
    return known && going ? { by: known, way: going } : DEFAULT_CARD_SORT;
  } catch {
    return DEFAULT_CARD_SORT;
  }
}

/** Keeps it for next time; every change is a `sort` row in the ledger. */
export function writeCardSort(sort: CardSort) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sort));
  } catch {
    // Storage full or switched off: the list keeps its order for this visit and starts newest first next time.
  }
  ledger.record("sort", { data: { by: sort.by, way: sort.way } });
}
