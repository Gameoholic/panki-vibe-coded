import { useId, type ReactNode } from "react";
import type { Deck } from "@panki/contracts";
import { count } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";

type Props = {
  decks: Deck[];
  title: string;
  /** What shows instead of rows when there are no decks. */
  empty: ReactNode;
  onOpen: (deck: Deck) => void;
  /** When given, each row gets a settings button beside it. */
  onSettings?: (deck: Deck) => void;
  /** What each row says under the deck's name, like its card type and its SRS type. */
  subOf?: (deck: Deck) => string;
  /** The pill on the right; the card count unless said otherwise. */
  countOf?: (deck: Deck) => string;
};

/** The decks as rows you press, each with its count: the Decks screen. */
export function DeckList({ decks, title, empty, onOpen, onSettings, subOf, countOf = (deck) => count(deck.cardCount, "card", "cards") }: Props) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="list-title">
        {title}
      </h2>
      {decks.length === 0 ? (
        empty
      ) : (
        <ul className="deck-list">
          {decks.map((deck) => (
            <li key={deck.id} className="deck-item">
              <Button variant="row" className="deck-row" onClick={() => onOpen(deck)}>
                <span className="deck-name">
                  {deck.name}
                  {subOf ? <span className="row-sub">{subOf(deck)}</span> : null}
                </span>
                <span className="deck-count">{countOf(deck)}</span>
              </Button>
              {onSettings ? (
                <Button className="deck-settings" aria-label={`Settings for ${deck.name}`} onClick={() => onSettings(deck)}>
                  <Icon name="settings" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
