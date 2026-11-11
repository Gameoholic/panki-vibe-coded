/** @panki YouTube's streak reminder on the options page: on or off, and the hour it starts at, the account's own (`StreakReminder`). */
import type { Settings } from "@panki/contracts";
import { NumberField } from "@web/components/NumberField";
import { Setting } from "@web/components/Setting";
import { Toggle } from "@web/components/Toggle";
import { useSavedSoon } from "@web/hooks/useSavedSoon";
import { panki, type Door } from "../panki";

type Reminder = Pick<Settings, "reminderOnYouTube" | "reminderHour">;

/**
 * The streak reminder on YouTube, one group: from Starts at until the day turns, a streak with a run to lose whose last
 * day doesn't count yet tints the pill's streak with the hours left and puts Panki's line over YouTube's home. The
 * account's own settings (`reminderOnYouTube`, `reminderHour`), kept on Panki and saved a moment after each change;
 * a YouTube page reads them again as it gets the focus. Greyed with the add-ons' switch or while Streaks is off in
 * Panki, Starts at while the reminder is.
 */
export function StreakReminder({ door, settings, disabled }: { door: Door; settings: Settings; disabled: boolean }) {
  const [current, patch, failure] = useSavedSoon<Reminder>({ reminderOnYouTube: settings.reminderOnYouTube, reminderHour: settings.reminderHour }, async (change) => {
    const saved = await panki.updateSettings(door, change);
    return { reminderOnYouTube: saved.reminderOnYouTube, reminderHour: saved.reminderHour };
  });
  const off = disabled || !settings.streaksOn;
  return (
    <div className="seek-group">
      <h3 className="seek-group-title">Streak reminder</h3>
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
    </div>
  );
}
