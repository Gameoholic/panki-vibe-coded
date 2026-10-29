import { useEffect, useMemo, useState } from "react";
import { wordsFieldOf, type CalledCard, type Card, type CardExampleUpdate, type CardType, type CardUpdate, type Deck, type NewCard, type NewCardExample, type SrsType, type SubtitleStyle } from "@panki/contracts";
import { api } from "../api";
import { ALL_CARDS, filterCards, filterOptions, type CardFilterId } from "../cardFilter";
import { CARD_SORTS, CARD_SORT_IDS, readCardSort, sortCards, waysOf, writeCardSort, type CardSort } from "../cardSort";
import { AlreadyIn } from "../components/AlreadyIn";
import { Button } from "../components/Button";
import { CardForm } from "../components/CardForm";
import { CardList } from "../components/CardList";
import { CardPreview } from "../components/CardPreview";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { TextField } from "../components/TextField";
import { searchCards } from "../cardSearch";
import { count, langOf } from "../words";

type Props = {
  deckId: string;
  cards: Card[];
  /** The deck's card type: the shape of the form and of every row. */
  type: CardType;
  /** The deck's SRS type, for each card's place and due time. */
  srsType?: SrsType | undefined;
  /** Whether the "Add a card" form is open; it's opened from the button above and sits above the list. */
  adding: boolean;
  /** The card open in its row, to change or delete; its address is the screen's (`App` → `setOpenCard`). */
  openId: string | null;
  onOpen: (cardId: string) => void;
  /** That card closed, saved or not; the screen leaves it be if another is open by then. */
  onClose: (cardId: string) => void;
  /** A card called the same as the one being added, opened from the add form: here, or in its own deck. */
  onOpenCalled: (card: CalledCard) => void;
  onAdd: (card: NewCard) => Promise<void>;
  onCancelAdd: () => void;
  onSave: (cardId: string, update: CardUpdate) => Promise<void>;
  onRemove: (cardId: string) => Promise<void>;
  /** Brings a card put aside (buried or suspended) back into reviews. */
  onLift: (cardId: string) => Promise<void>;
  /** Suspends a card, from its row, until it's brought back. */
  onSuspend: (cardId: string) => Promise<void>;
  /** What's typed in the add form, given as another example to a card that's already there (in this deck or another). */
  onAddExample: (to: CalledCard, example: NewCardExample) => Promise<Card>;
  /** One of a card's other examples, changed or deleted from its form. */
  onSaveExample: (cardId: string, exampleId: string, update: CardExampleUpdate) => Promise<void>;
  onRemoveExample: (cardId: string, exampleId: string) => Promise<void>;
  /** Every deck, card type and SRS type: a card previewed is seen as any deck would show it. */
  decks: readonly Deck[];
  types: readonly CardType[];
  srsTypes: readonly SrsType[];
  /** How a clip's subtitles look (`Settings.subtitleStyle`), in a card's form and its preview. */
  subtitleStyle?: SubtitleStyle | undefined;
};

/**
 * Inside a deck: the cards, in the order picked over them (newest first to begin with, kept on this device), and the
 * add form above them when asked for. A card called the same as another, in this deck or any other, says so on its
 * row, and pressed, the list shows that word's cards alone (the owner, 2026-10-21: "when I click duplicate it should
 * show only the duplicate cards of this same word"), those in other decks named over them. A card's edit button opens it where it stands in the list: its fields to change, Save, and Delete, which asks
 * first; the delete button under it deletes it from the row, asking there first. A card is suspended from its row, and
 * one put aside is brought back from it.
 */
export function CardsView({
  deckId,
  cards,
  type,
  srsType,
  adding,
  openId,
  onOpen,
  onClose,
  onOpenCalled,
  onAdd,
  onCancelAdd,
  onSave,
  onRemove,
  onLift,
  onSuspend,
  onAddExample,
  onSaveExample,
  onRemoveExample,
  decks,
  types,
  srsTypes,
  subtitleStyle,
}: Props) {
  /** The card seen as a review would show it, in its row; null for none. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewed = cards.find((card) => card.id === previewId) ?? null;
  const [sort, setSort] = useState<CardSort>(readCardSort);
  const sorted = useMemo(() => sortCards(cards, sort, { type, srsType }), [cards, sort, type, srsType]);
  /** The words whose duplicates alone are shown, pressed on a card's mark; null for every card. */
  const [only, setOnly] = useState<string | null>(null);
  const lead = wordsFieldOf(type);
  const wordsOf = (card: Card) => (lead ? (card.values[lead.id] ?? "").trim() : "");
  // Asked again whenever the cards change (one added, changed or deleted): a duplicate is a pair, and both rows say so.
  const [twins, setTwins] = useState<Record<string, readonly CalledCard[]>>({});
  useEffect(() => {
    let alive = true;
    api.deckTwins(deckId).then(
      (found) => {
        if (alive) setTwins(found);
      },
      // Not known, nothing is marked: the cards are all there all the same.
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [deckId, cards]);
  // Read from the list every time: a card that's gone (deleted here) is simply no longer open.
  const open = cards.find((card) => card.id === openId) ?? null;

  /** What's typed in the search over the list: the cards with all of it on them somewhere, best first (`cardSearch.ts`). */
  const [query, setQuery] = useState("");
  const twinsOnly = useMemo(() => (only === null || !lead ? sorted : sorted.filter((card) => (card.values[lead.id] ?? "").trim() === only)), [sorted, only, lead]);
  /** Which of the cards are shown (`cardFilter.ts`): all of them to begin with, for this visit. */
  const [show, setShow] = useState<CardFilterId>(ALL_CARDS);
  const narrowed = useMemo(() => filterCards(twinsOnly, show, { srsType, twins }), [twinsOnly, show, srsType, twins]);
  const shown = useMemo(() => searchCards(narrowed, query, { type, srsType }), [narrowed, query, type, srsType]);
  const searching = query.trim() !== "" || show !== ALL_CARDS;
  /** While one word's duplicates are shown, its cards in other decks: each said with a way to it. */
  const elsewhere =
    only === null ? [] : [...new Map(shown.flatMap((card) => twins[card.id] ?? []).filter((twin) => twin.deckId !== deckId).map((twin) => [twin.cardId, twin])).values()];
  const duplicates =
    only === null ? null : (
      <div className="list-filter">
        <p className="list-filter-line">
          <span>
            Duplicates of “<span lang={langOf(only)}>{only}</span>”
          </span>
          <Button className="list-filter-clear" onClick={() => setOnly(null)}>
            <Icon name="close" />
            Show all
          </Button>
        </p>
        <AlreadyIn cards={elsewhere} onOpen={onOpenCalled} />
      </div>
    );
  // The search, over a deck with more than one card (as Sort by is), above whatever else the list is narrowed to.
  const filter =
    cards.length > 1 || duplicates ? (
      <>
        {cards.length > 1 ? (
          <div className="list-search">
            <TextField id="card-search" label="Search" autoComplete="off" lang={langOf(query)} value={query} onChange={setQuery} />
          </div>
        ) : null}
        {duplicates}
      </>
    ) : null;

  function pick(next: CardSort) {
    setSort(next);
    writeCardSort(next);
  }
  const sorter = CARD_SORTS[sort.by];
  const tools =
    cards.length > 1 ? (
      <div className="list-sort">
        <span className="list-sort-label">Show</span>
        <Dropdown id="card-show" label="Show" options={filterOptions({ srsType, twins })} value={show} onChange={setShow} />
        <span className="list-sort-label">Sort by</span>
        <Dropdown
          id="card-sort"
          label="Sort by"
          options={CARD_SORT_IDS.map((id) => ({ id, label: CARD_SORTS[id].label }))}
          value={sort.by}
          onChange={(by) => pick({ by, way: CARD_SORTS[by].first })}
        />
        <Segmented
          idPrefix="card-sort-way"
          label="Order"
          size="sm"
          options={waysOf(sort.by).map((way) => ({ id: way, label: sorter.ways[way] }))}
          value={sort.way}
          onChange={(way) => pick({ ...sort, way })}
        />
      </div>
    ) : null;

  return (
    <>
      {adding ? <CardForm type={type} onAdd={onAdd} onOpenCalled={onOpenCalled} onAddExample={async (to, example) => void (await onAddExample(to, example))} autoFocus onCancel={onCancelAdd} /> : null}
      <CardList
        cards={shown}
        type={type}
        srsType={srsType}
        title={cards.length === 0 ? "No cards yet" : count(shown.length, "card", "cards")}
        empty={searching ? <p className="empty">No cards match.</p> : null}
        tools={tools}
        twins={twins}
        onTwins={(card) => setOnly(wordsOf(card))}
        filter={filter}
        // Pressed again, it closes the card, as Preview does (the owner, 2026-10-30).
        onEdit={(card) => (open?.id === card.id ? onClose(card.id) : onOpen(card.id))}
        onRemove={(card) => onRemove(card.id)}
        onLift={(card) => onLift(card.id)}
        onSuspend={(card) => onSuspend(card.id)}
        onPreview={(card) => setPreviewId((was) => (was === card.id ? null : card.id))}
        previewing={
          previewed
            ? {
                id: previewed.id,
                view: <CardPreview key={previewed.id} card={previewed} type={type} decks={decks} types={types} srsTypes={srsTypes} subtitleStyle={subtitleStyle} onClose={() => setPreviewId(null)} />,
              }
            : null
        }
        editing={
          open
            ? {
                id: open.id,
                form: (
                  <CardForm
                    key={open.id}
                    type={type}
                    card={open}
                    {...(subtitleStyle ? { subtitleStyle } : {})}
                    autoFocus
                    onCancel={() => onClose(open.id)}
                    onSave={async (update) => {
                      await onSave(open.id, update);
                      onClose(open.id);
                    }}
                    onRemove={() => onRemove(open.id)}
                    onSaveExample={(exampleId, update) => onSaveExample(open.id, exampleId, update)}
                    onRemoveExample={(exampleId) => onRemoveExample(open.id, exampleId)}
                  />
                ),
              }
            : null
        }
      />
    </>
  );
}
