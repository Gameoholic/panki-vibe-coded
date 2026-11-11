import { useState } from "react";
import type { Deck, Settings, SettingsUpdate, SrsType } from "@panki/contracts";
import { Board } from "../components/Board";
import { Button } from "../components/Button";
import { useStats } from "../hooks/useStats";
import type { WidgetContext } from "../widgets";

type Props = {
  decks: Deck[];
  srsTypes: SrsType[];
  settings: Settings;
  /** A change to the settings from a tile, saved; the stats are asked for again after it. */
  onSettings: (patch: SettingsUpdate) => Promise<Settings>;
};

/**
 * Stats: every tile but the streaks' (the Streaks screen), for all decks or one, on the same board the home has.
 * Nothing here is arranged: the page is fixed.
 */
export function StatsView({ decks, srsTypes, settings, onSettings }: Props) {
  const [deckId, setDeckId] = useState<string | null>(null);
  const { stats, loading, failure, refresh } = useStats(deckId);

  const ctx: WidgetContext = {
    decks,
    srsTypes,
    settings,
    onStale: refresh,
    onSettings: async (patch) => {
      const saved = await onSettings(patch);
      refresh();
      return saved;
    },
  };

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
      {/* Before the first stats, every tile is there as its shape (`Board` draws a tile's body as a skeleton until it has stats). */}
      {stats === null ? failure ? null : <Board stats={null} ctx={ctx} /> : <Board stats={stats} ctx={ctx} stale={loading} />}
    </>
  );
}
