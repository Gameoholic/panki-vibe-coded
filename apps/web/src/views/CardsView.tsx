import { useState } from "react";
import type { Card, CardType, CardUpdate, NewCard, SrsType } from "@panki/contracts";
import { CardForm } from "../components/CardForm";
import { CardList } from "../components/CardList";
import { count } from "../words";

type Props = {
  cards: Card[];
  /** The deck's card type: the shape of the form and of every row. */
  type: CardType;
  /** The deck's SRS type, for each card's place and due time. */
  srsType?: SrsType | undefined;
  /** Whether the "Add a card" form is open; it's opened from the button above and sits above the list. */
  adding: boolean;
  onAdd: (card: NewCard) => Promise<void>;
  onCancelAdd: () => void;
  onSave: (cardId: string, update: CardUpdate) => Promise<void>;
  onRemove: (cardId: string) => Promise<void>;
  /** Brings a card put aside (buried or suspended) back into reviews. */
  onLift: (cardId: string) => Promise<void>;
};

/**
 * Inside a deck: the cards, newest first, and the add form above them when asked for. A card's edit button opens it
 * where it stands in the list: its fields to change, Save, and Delete, which asks first; the delete button under it
 * deletes it from the row, asking there first. A card put aside is brought back from its row.
 */
export function CardsView({ cards, type, srsType, adding, onAdd, onCancelAdd, onSave, onRemove, onLift }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // Read from the list every time: a card that's gone (deleted here) is simply no longer open.
  const open = cards.find((card) => card.id === editingId) ?? null;
  return (
    <>
      {adding ? <CardForm type={type} onAdd={onAdd} autoFocus onCancel={onCancelAdd} /> : null}
      <CardList
        cards={cards}
        type={type}
        srsType={srsType}
        title={cards.length === 0 ? "No cards yet" : count(cards.length, "card", "cards")}
        onEdit={(card) => setEditingId(card.id)}
        onRemove={(card) => onRemove(card.id)}
        onLift={(card) => onLift(card.id)}
        editing={
          open
            ? {
                id: open.id,
                form: (
                  <CardForm
                    key={open.id}
                    type={type}
                    card={open}
                    autoFocus
                    onCancel={() => setEditingId(null)}
                    onSave={async (update) => {
                      await onSave(open.id, update);
                      setEditingId(null);
                    }}
                    onRemove={() => onRemove(open.id)}
                  />
                ),
              }
            : null
        }
      />
    </>
  );
}
