import type { Settings } from "@panki/contracts";
import { NumberField } from "../components/NumberField";
import { Setting } from "../components/Setting";
import { Toggle } from "../components/Toggle";

type Panel = { current: Settings; patch: (change: Partial<Settings>) => void };

/**
 * Settings → General → Reminder: a streak with a run to lose whose day doesn't count yet is said to be at risk from
 * Starts at until the day turns, as a line in the app and on YouTube, never a pop-up. Greyed while Streaks is Off
 * (Stats → Streaks), its rows while Reminder is.
 */
export function ReminderPanel({ current, patch }: Panel) {
  const on = current.streaksOn;
  const reminding = on && current.reminderOn;
  return (
    <section className="panel" aria-labelledby="reminder-title">
      <h2 id="reminder-title" className="panel-title">
        Reminder
      </h2>
      <Setting id="reminderOn" label="Reminder" control={<Toggle id="setting-reminder-on" says={{ on: "On", off: "Off" }} on={current.reminderOn} disabled={!on} onChange={(reminderOn) => patch({ reminderOn })} />} />
      <Setting
        id="reminderHour"
        label="Starts at"
        control={<NumberField id="setting-reminder-hour" label="Starts at" value={current.reminderHour} min={0} max={23} suffix=":00" disabled={!reminding} onChange={(reminderHour) => patch({ reminderHour })} />}
      />
      <Setting id="reminderInApp" label="In the app" control={<Toggle id="setting-reminder-app" says={{ on: "Shown", off: "Hidden" }} on={current.reminderInApp} disabled={!reminding} onChange={(reminderInApp) => patch({ reminderInApp })} />} />
      <Setting id="reminderOnYouTube" label="On YouTube" control={<Toggle id="setting-reminder-youtube" says={{ on: "Shown", off: "Hidden" }} on={current.reminderOnYouTube} disabled={!reminding} onChange={(reminderOnYouTube) => patch({ reminderOnYouTube })} />} />
    </section>
  );
}
