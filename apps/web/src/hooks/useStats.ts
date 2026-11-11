/** @panki The stats for all decks or one, asked for again on demand, the last ones kept while the next load (`useStats`). */
import { useCallback, useEffect, useState } from "react";
import type { Stats } from "@panki/contracts";
import { api } from "../api";

/**
 * The stats for every deck (`deckId` null) or one: what's on screen, whether the next ones are on their way, what went
 * wrong, and `refresh` to ask for the same scope again when something they're made of changed (a video put away, a
 * streak saved). The last stats stay while the next load: no empty flash between two sets of numbers.
 */
export function useStats(deckId: string | null): { stats: Stats | null; loading: boolean; failure: string | null; refresh: () => void } {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);

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
  }, [deckId, turn]);

  const refresh = useCallback(() => setTurn((n) => n + 1), []);
  return { stats, loading, failure, refresh };
}
