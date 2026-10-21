import type { CalledCard } from "@panki/contracts";
import { count, langOf } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";

type Props = {
  /** The cards already called by what's being added (`useCalled`), the newest first. */
  cards: readonly CalledCard[];
  /** Opens one of them: in its deck's list, or Panki opened at it from the extension. None, and there's no button. */
  onOpen?: (card: CalledCard) => void;
  /** What that button says. */
  openWords?: string;
};

/** One line a deck: the words as the cards hold them, where they are, how many, and the newest of them to open. */
type Line = { key: string; words: string; deck: string; cards: CalledCard[] };

function linesOf(cards: readonly CalledCard[]): Line[] {
  const lines = new Map<string, Line>();
  for (const card of cards) {
    const key = `${card.deckId}\n${card.words}`;
    const line = lines.get(key);
    if (line) line.cards.push(card);
    else lines.set(key, { key, words: card.words, deck: card.deck, cards: [card] });
  }
  return [...lines.values()];
}

/**
 * Said under the field a card is called by, while what's typed or picked there is what a card already holds: where
 * that card is, and a way to open it. It stops nothing: Add still adds a second card. The app's form and the
 * extension's drawer are both this.
 */
export function AlreadyIn({ cards, onOpen, openWords = "Open" }: Props) {
  if (cards.length === 0) return null;
  return (
    <div className="already" role="status">
      {linesOf(cards).map((line) => {
        const newest = line.cards[0];
        return (
          <p key={line.key} className="already-line">
            <Icon name="alert" className="is-sign" />
            <span className="already-words">
              “<span lang={langOf(line.words)}>{line.words}</span>” is already in {line.deck}
              {line.cards.length > 1 ? ` (${count(line.cards.length, "card", "cards")})` : ""}.
            </span>
            {onOpen && newest ? (
              <Button className="already-open" onClick={() => onOpen(newest)}>
                {openWords}
              </Button>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}
