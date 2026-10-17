import type { Deck, SrsType } from "@panki/contracts";
import { DeckList } from "../components/DeckList";
import { NoDecksYet } from "../components/NoDecksYet";

type Props = {
  decks: Deck[];
  srsTypes: SrsType[];
  onPick: (deck: Deck) => void;
  onMakeDeck: () => void;
};

/** Review starts here: which deck? One deck at a time, by the owner's call; each says what's due and what's new. */
export function ReviewPickView({ decks, srsTypes, onPick, onMakeDeck }: Props) {
  const srsNames = new Map(srsTypes.map((t) => [t.id, t.name]));
  return (
    <DeckList
      decks={decks}
      title="Which deck?"
      empty={<NoDecksYet onMakeDeck={onMakeDeck} />}
      onOpen={onPick}
      subOf={(deck) => srsNames.get(deck.srsTypeId) ?? ""}
      countOf={(deck) => `${deck.dueCount} due · ${deck.newCount} new`}
    />
  );
}
