import { useState } from "react";
import { likenessOf, type ApartValue, type CalledCard } from "@panki/contracts";
import { langOf, listWords } from "../words";
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
   * What the card being added holds in the fields its type compares beside its main field (`apartOf`), and the names of
   * those fields (`comparedOf`): how each card listed stands to it (`likenessOf`). `compared` null is nothing being
   * added, only a word looked up (the popup): every card is told of, none called a duplicate.
   */
  mine?: readonly ApartValue[];
  compared?: readonly string[] | null;
  /**
   * The card what's being added can go onto as another example (`exampleTargetOf`), and whether it's going there: its
   * row then carries Add as an additional example, pressed while the form adds an example instead of a card.
   */
  example?: { card: CalledCard; on: boolean; onToggle: () => void } | null;
  /** Add anyway, beside it while one is the same: pressed, a second card is added after all (`useAddAnyway`). */
  anyway?: { on: boolean; onToggle: () => void } | null;
};

/** The words for adding to a card that's already there, one home: the button, and what the form's own button says then. */
export const EXAMPLE_WORDS = { add: "Add as an additional example", go: "Add example", busy: "Adding…" };

/** What adds a second card called the same as one already there. */
const ANYWAY_WORDS = "Add anyway";

/**
 * Whether a card being added may be added (the owner, 2026-10-29: "I can't add it as a card until I resolve this
 * warning"): not while one already there is the same in every field compared, until that's resolved by Add as an
 * additional example, by a compared field changed so it's no longer the same, or by Add anyway. Add anyway holds for
 * those cards alone: once another card is the same, it's asked again.
 */
export function useAddAnyway(cards: readonly CalledCard[], mine: readonly ApartValue[], compared: readonly string[] | null) {
  const same = cards.filter((card) => likenessOf(mine, card.apart, compared) === "same");
  const key = same.map((card) => card.cardId).join(" ");
  const [anywayFor, setAnywayFor] = useState<string | null>(null);
  const on = key !== "" && anywayFor === key;
  return {
    /** One already there is the same: the warning stands until it's resolved. */
    duplicate: key !== "",
    on,
    set: (next: boolean) => setAnywayFor(next ? key : null),
  };
}

/**
 * Of the cards already called so, the one to add another example to: the newest of this card type (`CalledCard.typeId`)
 * that isn't told apart from what's being added (another meaning is another card, not another example of this one).
 */
export function exampleTargetOf(cards: readonly CalledCard[], typeId: string, mine: readonly ApartValue[] = [], compared: readonly string[] | null = []): CalledCard | null {
  return cards.find((card) => card.typeId === typeId && likenessOf(mine, card.apart, compared) !== "other") ?? null;
}

/** A deck's name once each, in the order met. */
const decksOf = (cards: readonly CalledCard[]) => listWords([...new Set(cards.map((card) => card.deck))]);

/**
 * Said under the field a card is called by, while what's typed or picked there is what a card already holds (the
 * owner, 2026-10-25): a warning, in amber, when one of them is the same in every field its type compares (the same
 * word and meaning: "“生” is already in Mining, with the same Meaning."); otherwise a quieter notice that the word is in
 * the decks. Under it, every card called so, each with its deck and what it holds in the fields compared, and a way
 * to open it, at the row's right with a magnifying glass, apart from what resolves the warning: opening only looks (the
 * Duplicate and Different tags on each went at the owner's word, 2026-10-25). A warning holds Add back until it's
 * resolved (`useAddAnyway`); what resolves it is in a row of its own at its foot: Add as an additional example, which
 * puts what's being added onto the card that's there, and Add anyway. The app's form, the extension's drawer and its
 * popup are all this.
 */
export function AlreadyIn({ cards, onOpen, openWords = "Open", mine = [], compared = [], example = null, anyway = null }: Props) {
  const first = cards[0];
  if (!first) return null;
  const rows = cards.map((card) => ({ card, like: likenessOf(mine, card.apart, compared) }));
  const same = rows.filter((row) => row.like === "same").map((row) => row.card);
  const word = (same[0] ?? first).words;
  const named = <>“<span lang={langOf(word)}>{word}</span>”</>;
  const what = compared && compared.length > 0 ? listWords(compared) : null;
  const allOther = rows.every((row) => row.like === "other");
  const toExample = example && cards.some((card) => card.cardId === example.card.cardId) ? example : null;
  const addAnyway = same.length > 0 ? anyway : null;
  return (
    <div className={`already ${same.length > 0 ? "" : "is-notice"}`.trim()} role="status">
      <p className="already-line">
        {same.length > 0 ? <Icon name="alert" className="is-sign" /> : null}
        <span className="already-words">
          {same.length > 0 ? (
            <>
              {named} is already in {decksOf(same)}
              {what ? `, with the same ${what}` : ""}.
            </>
          ) : allOther && what ? (
            <>
              {named} is in your decks with another {what}.
            </>
          ) : (
            <>{named} is in your decks.</>
          )}
        </span>
      </p>
      <ul className="already-cards">
        {rows.map(({ card }) => {
          return (
            <li key={card.cardId} className="already-card">
              <span className="already-card-words">
                <span lang={langOf(card.words)}>{card.words}</span>
                <span className="already-card-deck">{card.deck}</span>
                {card.apart.map((value) => (
                  <span key={value.name} className="already-card-value">
                    {value.name}: <span lang={langOf(value.value)}>{value.value}</span>
                  </span>
                ))}
              </span>
              {onOpen ? (
                <Button className="already-open" onClick={() => onOpen(card)}>
                  <Icon name="search" />
                  {openWords}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {toExample || addAnyway ? (
        <div className="already-resolve">
          {toExample ? (
            <Button className="already-pick" aria-pressed={toExample.on} onClick={toExample.onToggle}>
              {EXAMPLE_WORDS.add}
            </Button>
          ) : null}
          {addAnyway ? (
            <Button className="already-pick" aria-pressed={addAnyway.on} onClick={addAnyway.onToggle}>
              {ANYWAY_WORDS}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
