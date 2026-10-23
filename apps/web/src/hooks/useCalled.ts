import { useEffect, useRef, useState } from "react";
import { CALLED_MAX, toldApart, type ApartValue, type CalledCard } from "@panki/contracts";

/** How long the words must stay as they are before Panki is asked about them. */
const SETTLE_MS = 300;
const NONE: readonly CalledCard[] = [];

/**
 * The account's cards already called by one of these words (what a card about to be added would be called by), asked
 * a moment after they stop changing: the app's form asks Panki itself, the extension's drawer asks through its worker.
 * Nothing while there are no words, or while what's known is about other words; a question that fails says nothing,
 * since the card can be added all the same. `apart` is what the card being added holds that tells cards apart
 * (`apartOf`): a card told apart by it isn't said. The app's `CardForm` and the extension's drawer are both this.
 */
export function useCalled(words: readonly string[], apart: readonly ApartValue[], ask: (words: string[]) => Promise<readonly CalledCard[]>): readonly CalledCard[] {
  const wanted = [...new Set(words.map((word) => word.trim()).filter((word) => word !== ""))].slice(0, CALLED_MAX);
  const key = wanted.join("\n");
  const [known, setKnown] = useState<{ key: string; cards: readonly CalledCard[] }>({ key: "", cards: NONE });
  const latest = useRef(ask);
  latest.current = ask;
  useEffect(() => {
    if (key === "") return;
    let alive = true;
    const soon = setTimeout(() => {
      latest.current(key.split("\n")).then(
        (cards) => {
          if (alive) setKnown({ key, cards });
        },
        () => undefined,
      );
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(soon);
    };
  }, [key]);
  return known.key === key ? known.cards.filter((card) => !toldApart(apart, card.apart)) : NONE;
}
