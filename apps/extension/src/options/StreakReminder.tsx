/** @panki YouTube's streak reminder on the options page, a panel of its own: on or off, and the hour it starts at, the account's own (`StreakReminderPanel`). */
import type { Settings } from "@panki/contracts";
import { NumberField } from "@web/components/NumberField";
import { Setting } from "@web/components/Setting";
import { Skeleton } from "@web/components/Skeleton";
import { Toggle } from "@web/components/Toggle";
import { useSavedSoon } from "@web/hooks/useSavedSoon";
import { panki, type Door } from "../panki";
import type { Stored } from "../storage";
import { SceneTitle } from "./explainerScenes";

type Reminder = Pick<Settings, "reminderOnYouTube" | "reminderHour">;

/**
 * The streak reminder on YouTube, a panel of its own, since it shows in two places neither of which holds it: from
 * Starts at until the day turns, a streak with a run to lose whose last day doesn't count yet tints the header bar's
 * Streak with the hours left (while the header bar shows it) and puts Panki's line over YouTube's home (while YouTube
 * home add-ons are on). Its (?) plays both. Only signed in: the account's own settings (`account`, read once for the
 * page), their skeleton while they come, why not when they can't be read.
 */
export function StreakReminderPanel({ store, door, account }: { store: Stored; door: Door; account: { settings: Settings | null; failure: string | null } }) {
  return (
    <section className="panel" aria-labelledby="streak-reminder-title">
      <SceneTitle id="reminder" titleId="streak-reminder-title" store={store} />
      {account.settings ? (
        <ReminderRows door={door} settings={account.settings} />
      ) : account.failure ? (
        <p className="form-failure" role="alert">
          {account.failure}
        </p>
      ) : (
        <Skeleton shape="settings" count={2} />
      )}
    </section>
  );
}

/**
 * The reminder's switch and its Starts at, each saved a moment after it's changed; a YouTube page reads them again as
 * it gets the focus. Greyed while Streaks is off in Panki, Starts at while the reminder is.
 */
function ReminderRows({ door, settings }: { door: Door; settings: Settings }) {
  const [current, patch, failure] = useSavedSoon<Reminder>({ reminderOnYouTube: settings.reminderOnYouTube, reminderHour: settings.reminderHour }, async (change) => {
    const saved = await panki.updateSettings(door, change);
    return { reminderOnYouTube: saved.reminderOnYouTube, reminderHour: saved.reminderHour };
  });
  const off = !settings.streaksOn;
  return (
    <>
      <Setting
        id="streak-reminder"
        label="Streak reminder"
        control={<Toggle id="streak-reminder-on" says={{ on: "On", off: "Off" }} on={current.reminderOnYouTube} disabled={off} onChange={(reminderOnYouTube) => patch({ reminderOnYouTube })} />}
      />
      <Setting
        id="streak-reminder-hour"
        label="Starts at"
        control={<NumberField id="streak-reminder-hour-field" label="Starts at" value={current.reminderHour} min={0} max={23} suffix=":00" disabled={off || !current.reminderOnYouTube} onChange={(reminderHour) => patch({ reminderHour })} />}
      />
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </>
  );
}
