/** @panki The pill's parts, laid out and previewed on the options page, and the streak it shows (`PillParts`). */
import { streakNameOf, type Settings } from "@panki/contracts";
import { Dropdown } from "@web/components/Dropdown";
import { Setting } from "@web/components/Setting";
import { useSavedSoon } from "@web/hooks/useSavedSoon";
import { PILL_PARTS, type PillLayout } from "../modules";
import { panki, type Door } from "../panki";
import { PartRows } from "./PartRows";
import { writeStore, type Stored } from "../storage";
import { PankiPill, SAMPLE_NUMBERS, pillValue } from "../ui/PankiPill";

/**
 * Panki's pill in YouTube's header bar, laid out, every part of it chosen: the pill as it will stand, on a strip of the
 * site's dark header bar with made-up numbers, then every part it can say as a row, each shown or hidden, moved by its
 * grip (or the arrow keys on it) into the order it's said in, then which streak it says. Kept the moment it's changed;
 * a YouTube page reads it again as it gets the focus. Greyed with the master switch, or with the pill hidden. The
 * account's settings (`settings`, null until they're said or while signed out) are the panel's, read once for it.
 */
export function PillParts({ store, door, settings, failure, disabled, onChanged }: { store: Stored; door: Door | null; settings: Settings | null; failure: string | null; disabled: boolean; onChanged: () => void }) {
  const layout = store.pill;
  const keep = (next: PillLayout) => void writeStore({ pill: next }).then(onChanged);
  return (
    <div className="pill-parts">
      <div className="pill-preview" aria-label="How the header bar looks">
        {/* The profile in use, as the pill always says it: its own name, or the account's. */}
        <PankiPill layout={layout} numbers={SAMPLE_NUMBERS} profile={store.profileName || store.userName} power={{ on: true, onChange: () => undefined }} onClick={() => undefined} />
      </div>
      {/* Panki's own on / off switch is always at the pill's end, its one place while the pill is on (`switchInPill`),
          so there's no row to show or hide it. */}
      <PartRows idPrefix="pill" parts={layout} nameOf={(id) => PILL_PARTS[id]} iconOf={(id) => pillValue(id, SAMPLE_NUMBERS)?.icon ?? "stats"} disabled={disabled} onChange={keep} />
      {door && settings ? <PillStreak door={door} settings={settings} disabled={disabled || !settings.streaksOn || !layout.some((p) => p.id === "streak" && p.shown)} /> : null}
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Which of the account's streaks the pill's Streak says: the account's own (`Settings.pillStreak`), kept on Panki and
 * saved a moment after it's changed; one that's gone, or none picked, is the first. Greyed while Streaks is off or the
 * pill's Streak is hidden.
 */
function PillStreak({ door, settings, disabled }: { door: Door; settings: Settings; disabled: boolean }) {
  const [current, patch, failure] = useSavedSoon<{ pillStreak: string | null }>({ pillStreak: settings.pillStreak }, async (change) => ({
    pillStreak: (await panki.updateSettings(door, change)).pillStreak,
  }));
  const streaks = settings.streaks;
  const picked = streaks.find((s) => s.id === current.pillStreak)?.id ?? streaks[0]?.id ?? "";
  return (
    <Setting
      id="pill-streak"
      label="Streak on the pill"
      control={
        // An account with no streak has nothing to pick, and the pill's Streak says nothing.
        streaks.length === 0 ? (
          <span className="setting-value">No streaks</span>
        ) : (
          <Dropdown id="pill-streak-pick" label="Streak on the pill" options={streaks.map((s) => ({ id: s.id, label: streakNameOf(s) }))} value={picked} disabled={disabled} onChange={(pillStreak) => patch({ pillStreak })} />
        )
      }
    >
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </Setting>
  );
}
