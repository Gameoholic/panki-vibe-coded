/** @panki The account's settings as Panki has them, read once a sign-in, for the options panels that set some of them (`useAccountSettings`). */
import { useEffect, useState } from "react";
import type { Settings } from "@panki/contracts";
import { panki, type Door } from "../panki";

/**
 * The account's settings, asked for again whenever the sign-in changes: null until they're said, or while signed out,
 * with why they couldn't be read. A panel that changes one saves it itself, a moment after the change (`useSavedSoon`).
 */
export function useAccountSettings(door: Door | null): { settings: Settings | null; failure: string | null } {
  const address = door?.address ?? null;
  const token = door?.token ?? null;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    setSettings(null);
    setFailure(null);
    if (address === null || token === null) return;
    let alive = true;
    panki
      .settings({ address, token })
      .then((read) => alive && setSettings(read))
      .catch((e: unknown) => alive && setFailure(e instanceof Error ? e.message : "Couldn't reach Panki."));
    return () => {
      alive = false;
    };
  }, [address, token]);
  return { settings, failure };
}
