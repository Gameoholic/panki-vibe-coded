import { useId } from "react";
import type { Deck } from "@panki/contracts";
import { Button } from "../components/Button";
import { NoDecksYet } from "../components/NoDecksYet";
import { TodayBar, todayWords } from "../components/TodayBar";
import type { ReviewBegin } from "./ReviewView";

type Props = {
  decks: Deck[];
  /** Into a deck's review: Start goes straight in, Show cards opens on its cards, Open on a deck with nothing today. */
  onPick: (deck: Deck, begin?: ReviewBegin) => void;
  onMakeDeck: () => void;
};

/**
 * Review starts here when there's more than one deck: each deck folded to today's counts, as one deck's review opens
 * (`TodayBar`, the owner's pick, A of https://claude.ai/artifact/XVHRcYb8TKjrgrBdsUFtoG, 2026-10-27), with its own
 * Start. One deck at a time, by the owner's call.
 */
export function ReviewPickView({ decks, onPick, onMakeDeck }: Props) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="list-title">
        Which deck?
      </h2>
      {decks.length === 0 ? (
        <NoDecksYet onMakeDeck={onMakeDeck} />
      ) : (
        <ul className="pick-list">
          {decks.map((deck) => {
            const words = todayWords(deck.dueCount, deck.newCount);
            return (
              <li key={deck.id}>
                <TodayBar id={`pick-${deck.id}`} name={deck.name} counts={words ?? "Nothing due right now"} onShow={words ? () => onPick(deck, "cards") : undefined}>
                  {words ? (
                    <Button id={`pick-${deck.id}-start`} variant="primary" onClick={() => onPick(deck, "start")}>
                      Start
                    </Button>
                  ) : (
                    <Button id={`pick-${deck.id}-open`} onClick={() => onPick(deck)}>
                      Open
                    </Button>
                  )}
                </TodayBar>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
