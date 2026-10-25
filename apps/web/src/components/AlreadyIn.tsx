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
  /**
   * The card what's being added can go onto as another example (the newest of the same card type, when that type has a
   * field that goes with an example), and whether it's going there: its line then carries Add as an additional
   * example, pressed while the form adds an example instead of a card.
   */
  example?: { card: CalledCard; on: boolean; onToggle: () => void } | null;
};

/** The words for adding to a card that's already there, one home: the button, and what the form's own button says then. */
export const EXAMPLE_WORDS = { add: "Add as an additional example", go: "Add example", busy: "Adding…" };

/** Of the cards already called so, the one to add another example to: the newest of this card type (`CalledCard.typeId`). */
export const exampleTargetOf = (cards: readonly CalledCard[], typeId: string): CalledCard | null => cards.find((card) => card.typeId === typeId) ?? null;

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
 * that card is, and a way to open it. It stops nothing: Add still adds a second card, unless Add as an additional
 * example is pressed (the owner, 2026-10-25), which puts what's being added onto the card that's there. The app's form
 * and the extension's drawer are both this.
 */
export function AlreadyIn({ cards, onOpen, openWords = "Open", example = null }: Props) {
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
            {example && line.cards.includes(example.card) ? (
              <Button className="already-open already-example" aria-pressed={example.on} onClick={example.onToggle}>
                {EXAMPLE_WORDS.add}
              </Button>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}
