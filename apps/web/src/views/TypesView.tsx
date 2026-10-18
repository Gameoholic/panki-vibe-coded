import type { CardType } from "@panki/contracts";
import { Button } from "../components/Button";
import { count } from "../words";

type Props = {
  types: CardType[];
  onOpen: (type: CardType) => void;
};

/** The card types as rows you press: the name, its fields, and how many decks use it. */
export function TypesView({ types, onOpen }: Props) {
  return (
    <section aria-labelledby="types-title">
      <h2 id="types-title" className="list-title">
        {types.length === 0 ? "No card types yet" : count(types.length, "card type", "card types")}
      </h2>
      {/* With none, the heading says so and nothing more: New type is in plain sight (the owner, 2026-10-18). */}
      {types.length === 0 ? null : (
        <ul className="deck-list">
          {types.map((type) => (
            <li key={type.id}>
              <Button variant="row" className="type-row" onClick={() => onOpen(type)}>
                <span className="deck-name">
                  {type.name}
                  <span className="row-sub">{type.fields.map((f) => f.name).join(" · ")}</span>
                </span>
                <span className="deck-count">{count(type.deckCount, "deck", "decks")}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
