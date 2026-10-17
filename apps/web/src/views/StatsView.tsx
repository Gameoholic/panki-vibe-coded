import { useEffect, useState } from "react";
import type { Deck, Settings, SrsType, Stats } from "@panki/contracts";
import { api } from "../api";
import { Board } from "../components/Board";
import { Button } from "../components/Button";
import type { WidgetContext } from "../widgets";

type Props = {
  decks: Deck[];
  srsTypes: SrsType[];
  settings: Settings;
  /** Into a review: of one deck, or from the picker when every deck is in scope. */
  onReview: (deckId: string | null) => void;
};

/** The Stats tab: every widget, for all decks or one, on the same board the home has. Nothing here is arranged: the page is fixed. */
export function StatsView({ decks, srsTypes, settings, onReview }: Props) {
  const [deckId, setDeckId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  // The last stats stay on screen, dimmed, while the next scope loads: no empty flash between two sets of numbers.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailure(null);
    api
      .stats(deckId)
      .then((next) => {
        if (!cancelled) setStats(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailure(e instanceof Error ? e.message : "Couldn't load your stats.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const ctx: WidgetContext = { decks, srsTypes, settings, onReview: () => onReview(deckId) };

  return (
    <>
      <div className="chips" role="group" aria-label="Which decks">
        <Button id="stats-all" variant="chip" aria-pressed={deckId === null} onClick={() => setDeckId(null)}>
          All decks
        </Button>
        {decks.map((deck) => (
          <Button key={deck.id} variant="chip" aria-pressed={deckId === deck.id} onClick={() => setDeckId(deck.id)}>
            {deck.name}
          </Button>
        ))}
      </div>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      {stats === null ? failure ? null : <p className="loading">Loading…</p> : <Board stats={stats} ctx={ctx} stale={loading} />}
    </>
  );
}
