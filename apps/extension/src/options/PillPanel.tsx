/** @panki The Header bar panel on the options page: Shown / Hidden, the pill previewed, its parts laid out, the streak its Streak shows (`HeaderBarPanel`). */
import { streakNameOf, type Settings } from "@panki/contracts";
import { Dropdown } from "@web/components/Dropdown";
import { Setting } from "@web/components/Setting";
import { Skeleton } from "@web/components/Skeleton";
import { Toggle } from "@web/components/Toggle";
import { useSavedSoon } from "@web/hooks/useSavedSoon";
import { PILL_PARTS, type PillLayout } from "../modules";
import { panki, type Door } from "../panki";
import { writeStore, type Stored } from "../storage";
import { PankiPill, SAMPLE_NUMBERS, pillValue } from "../ui/PankiPill";
import { SceneTitle } from "./explainerScenes";
import { PartRows } from "./PartRows";

/**
 * Panki's pill in YouTube's header bar, on every page of the site, a panel of its own whatever YouTube home add-ons
 * says: its Shown / Hidden at its head, then the pill as it will stand, on a strip of the site's dark header bar with
 * made-up numbers, then every part it can say as a row, each shown or hidden, moved by its grip (or the arrow keys on
 * it) into the order it's said in; the Streak's row holds which streak it says. Kept the moment it's changed; a
 * YouTube page reads it again as it gets the focus. The account's settings (`account`, read once for the page) are
 * where the streak picked is kept.
 */
export function HeaderBarPanel({ store, door, account, onChanged }: { store: Stored; door: Door | null; account: { settings: Settings | null; failure: string | null }; onChanged: () => void }) {
  const layout = store.pill;
  const off = !store.homePill;
  const keep = (next: PillLayout) => void writeStore({ pill: next }).then(onChanged);
  /** Which streak, in the Streak's row: signed out there's none to pick; while the account's settings come, their skeleton. */
  const streakShown = (shown: boolean) => {
    if (!door) return null;
    if (account.settings) return <StreakShown door={door} settings={account.settings} disabled={off || !shown || !account.settings.streaksOn} />;
    return account.failure ? null : <Skeleton shape="settings" count={1} />;
  };
  return (
    <section className="panel" aria-labelledby="header-bar-title">
      <SceneTitle id="headerBar" titleId="header-bar-title" store={store} />
      <Setting id="home-pill" label="Header bar" control={<Toggle id="home-pill-on" says={{ on: "Shown", off: "Hidden" }} on={store.homePill} onChange={(homePill) => void writeStore({ homePill }).then(onChanged)} />} />
      <div className="pill-preview" aria-label="How the header bar looks">
        {/* The profile in use, as the pill always says it: its own name, or the account's. */}
        <PankiPill layout={layout} numbers={SAMPLE_NUMBERS} profile={store.profileName || store.userName} power={{ on: true, onChange: () => undefined }} onClick={() => undefined} />
      </div>
      {/* Panki's own on / off switch is always at the pill's end, its one place while the pill is on (`switchInPill`),
          so there's no row to show or hide it. */}
      <PartRows
        idPrefix="pill"
        parts={layout}
        nameOf={(id) => PILL_PARTS[id]}
        iconOf={(id) => pillValue(id, SAMPLE_NUMBERS)?.icon ?? "stats"}
        // Which streak is the Streak's own setting, so it stands in its row.
        moreOf={(part) => (part.id === "streak" ? streakShown(part.shown) : null)}
        disabled={off}
        onChange={keep}
      />
      {account.failure ? (
        <p className="form-failure" role="alert">
          {account.failure}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Which of the account's streaks the header bar's Streak says: the account's own (`Settings.pillStreak`), kept on Panki
 * and saved a moment after it's changed; one that's gone, or none picked, is the first. Greyed while the header bar or
 * its Streak is hidden, or Streaks is off in Panki.
 */
function StreakShown({ door, settings, disabled }: { door: Door; settings: Settings; disabled: boolean }) {
  const [current, patch, failure] = useSavedSoon<{ pillStreak: string | null }>({ pillStreak: settings.pillStreak }, async (change) => ({
    pillStreak: (await panki.updateSettings(door, change)).pillStreak,
  }));
  const streaks = settings.streaks;
  const picked = streaks.find((s) => s.id === current.pillStreak)?.id ?? streaks[0]?.id ?? "";
  return (
    <Setting
      id="pill-streak"
      label="Streak shown"
      control={
        // An account with no streak has nothing to pick, and the header bar's Streak says nothing.
        streaks.length === 0 ? (
          <span className="setting-value">No streaks</span>
        ) : (
          <Dropdown id="pill-streak-pick" label="Streak shown" options={streaks.map((s) => ({ id: s.id, label: streakNameOf(s) }))} value={picked} disabled={disabled} onChange={(pillStreak) => patch({ pillStreak })} />
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
