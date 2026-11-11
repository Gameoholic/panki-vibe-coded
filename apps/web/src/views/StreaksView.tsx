import { useState, type ReactNode } from "react";
import type { Deck, Settings, SettingsUpdate, SrsType } from "@panki/contracts";
import { Board } from "../components/Board";
import { Bone } from "../components/Skeleton";
import { Toggle } from "../components/Toggle";
import { useStats } from "../hooks/useStats";
import type { WidgetContext } from "../widgets";

type Props = {
  decks: Deck[];
  srsTypes: SrsType[];
  settings: Settings;
  /** A streak made, changed or deleted, or Streaks turned on or off: saved; the stats are asked for again after it. */
  onSettings: (patch: SettingsUpdate) => Promise<Settings>;
};

/** Stats → Streaks' first line: Streaks and its On / Off; its switch as a shape while the settings load. */
export function StreaksHead({ toggle }: { toggle?: ReactNode }) {
  return (
    <div className="streaks-head">
      <span className="setting-label">Streaks</span>
      {toggle ?? <Bone w="92px" h="42px" />}
    </div>
  );
}

/**
 * Stats → Streaks: where streaks are made, changed and deleted. Streaks On / Off heads it (Off greys everything under it
 * and takes the streaks off the home, the YouTube pill and the reminder); every streak's tile, its settings button
 * opening its editor beside it; and the dashed tile a new one is made from. Every deck counts, so there's no deck to pick.
 */
export function StreaksView({ decks, srsTypes, settings, onSettings }: Props) {
  const { stats, loading, failure, refresh } = useStats(null);
  const [switchFailure, setSwitchFailure] = useState<string | null>(null);

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

  async function turn(streaksOn: boolean) {
    setSwitchFailure(null);
    try {
      await onSettings({ streaksOn });
    } catch (e) {
      setSwitchFailure(e instanceof Error ? e.message : "Couldn't save that.");
    }
  }

  const wrong = switchFailure ?? failure;
  return (
    <>
      <StreaksHead toggle={<Toggle id="streaks-on" says={{ on: "On", off: "Off" }} on={settings.streaksOn} onChange={(on) => void turn(on)} />} />
      {wrong ? (
        <p className="load-error" role="alert">
          {wrong}
        </p>
      ) : null}
      {/* Before the first stats, every streak's tile is there as its shape. */}
      {stats === null ? failure ? null : <Board stats={null} ctx={ctx} streaks /> : <Board stats={stats} ctx={ctx} stale={loading} streaks />}
    </>
  );
}
