import { useState } from "react";
import { wordsFieldOf, type CalledCard, type Card, type CardType, type Deck, type NewCard, type NewCardExample } from "@panki/contracts";
import { Button } from "../components/Button";
import { CardForm } from "../components/CardForm";
import { CardList } from "../components/CardList";
import { NoDecksYet } from "../components/NoDecksYet";

type Props = {
  decks: Deck[];
  types: CardType[];
  /** The deck the card goes into; `null` only when there are no decks. */
  deckId: string | null;
  onPick: (deckId: string) => void;
  onAdd: (deckId: string, card: NewCard) => Promise<Card>;
  /** A card called the same as the one being added, opened in its deck. */
  onOpenCalled: (card: CalledCard) => void;
  /** What's typed given as another example to a card that's already there; answers with that card. */
  onAddExample: (to: CalledCard, example: NewCardExample) => Promise<Card>;
  onMakeDeck: () => void;
  /** Words the card starts with in the field it's called by (its type's Main field): what was searched for and not found. */
  word?: string | undefined;
};

/** Add a card from the home: pick the deck in the form, add, keep adding. What you added this visit stays under the form. */
export function AddView({ decks, types, deckId, onPick, onAdd, onOpenCalled, onAddExample, onMakeDeck, word }: Props) {
  const [added, setAdded] = useState<Card[]>([]);

  if (deckId === null) return <NoDecksYet onMakeDeck={onMakeDeck} />;
  const target = deckId;
  const deck = decks.find((d) => d.id === target);
  const type = deck ? types.find((t) => t.id === deck.typeId) : undefined;

  async function add(card: NewCard) {
    const saved = await onAdd(target, card);
    setAdded((prev) => [saved, ...prev]);
  }
  /** A card that's already there, given another example, is shown with what was just added too. */
  async function addExample(to: CalledCard, example: NewCardExample) {
    const saved = await onAddExample(to, example);
    setAdded((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)]);
  }

  const chooser = (
    <div className="field">
      <span className="field-label">Deck</span>
      <div className="chips" role="group" aria-label="Deck">
        {decks.map((d) => (
          <Button key={d.id} variant="chip" aria-pressed={d.id === target} onClick={() => onPick(d.id)}>
            {d.name}
          </Button>
        ))}
      </div>
    </div>
  );

  if (!type) {
    return (
      <section className="panel">
        {chooser}
        <p className="load-error" role="alert">
          This deck's card type is missing.
        </p>
      </section>
    );
  }

  const lead = word ? wordsFieldOf(type) : null;
  return (
    <>
      <CardForm key={type.id} type={type} start={lead && word ? { [lead.id]: word } : undefined} onAdd={add} onOpenCalled={onOpenCalled} onAddExample={addExample} autoFocus>
        {chooser}
      </CardForm>
      {added.length > 0 ? <CardList cards={added.filter((c) => c.deckId === target)} type={type} title="Just added" /> : null}
    </>
  );
}
