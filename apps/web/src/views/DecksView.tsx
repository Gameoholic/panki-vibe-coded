import { useState } from "react";
import { NewDeck, type CardType, type Deck, type SrsType } from "@panki/contracts";
import { Button } from "../components/Button";
import { DeckList } from "../components/DeckList";
import { DeckNameForm } from "../components/DeckNameForm";
import { count } from "../words";

type Props = {
  decks: Deck[];
  types: CardType[];
  srsTypes: SrsType[];
  /** Whether the "New deck" form is open; it's opened from the screen's header and sits above the list. */
  creating: boolean;
  onOpen: (deck: Deck) => void;
  onSettings: (deck: Deck) => void;
  onAdd: (deck: NewDeck) => Promise<void>;
  onCancel: () => void;
};

export function DecksView({ decks, types, srsTypes, creating, onOpen, onSettings, onAdd, onCancel }: Props) {
  const [typeId, setTypeId] = useState<string | null>(types[0]?.id ?? null);
  const [srsTypeId, setSrsTypeId] = useState<string | null>(srsTypes[0]?.id ?? null);
  const typeNames = new Map(types.map((t) => [t.id, t.name]));
  const srsNames = new Map(srsTypes.map((t) => [t.id, t.name]));

  return (
    <>
      {creating ? (
        <section className="panel" aria-labelledby="new-deck-title">
          <h2 id="new-deck-title" className="panel-title">
            New deck
          </h2>
          <DeckNameForm
            id="deck-name"
            initial=""
            action="Create deck"
            busyAction="Creating…"
            icon="add"
            autoFocus
            onSubmit={async (name) => {
              if (!typeId) throw new Error("Pick a card type.");
              if (!srsTypeId) throw new Error("Pick an SRS type.");
              await onAdd(NewDeck.parse({ id: crypto.randomUUID(), name, typeId, srsTypeId }));
            }}
            onCancel={onCancel}
          >
            <div className="field">
              <span className="field-label">Card type</span>
              <div className="chips" role="group" aria-label="Card type">
                {types.map((type) => (
                  <Button key={type.id} variant="chip" aria-pressed={type.id === typeId} onClick={() => setTypeId(type.id)}>
                    {type.name}
                  </Button>
                ))}
              </div>
              <p className="field-hint">What a card in this deck is made of. It can't be changed after.</p>
            </div>
            <div className="field">
              <span className="field-label">SRS type</span>
              <div className="chips" role="group" aria-label="SRS type">
                {srsTypes.map((type) => (
                  <Button key={type.id} variant="chip" className="srs-chip" aria-pressed={type.id === srsTypeId} onClick={() => setSrsTypeId(type.id)}>
                    {type.name}
                  </Button>
                ))}
              </div>
              <p className="field-hint">How its cards come back. It can be changed in the deck's settings.</p>
            </div>
          </DeckNameForm>
        </section>
      ) : null}

      <DeckList
        decks={decks}
        title={decks.length === 0 ? "No decks yet" : count(decks.length, "deck", "decks")}
        empty={null}
        onOpen={onOpen}
        onSettings={onSettings}
        subOf={(deck) => [typeNames.get(deck.typeId), srsNames.get(deck.srsTypeId)].filter(Boolean).join(" · ")}
      />
    </>
  );
}
