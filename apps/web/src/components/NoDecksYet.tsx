import { Button } from "./Button";

type Props = {
  onMakeDeck: () => void;
};

/** What a screen that needs a deck shows before any exists: the one way forward. */
export function NoDecksYet({ onMakeDeck }: Props) {
  return (
    <section className="empty-state">
      <p className="empty">No decks yet.</p>
      <Button variant="primary" onClick={onMakeDeck}>
        Make a deck
      </Button>
    </section>
  );
}
