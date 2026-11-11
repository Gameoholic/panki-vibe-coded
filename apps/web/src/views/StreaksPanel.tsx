import { useEffect, useRef, useState } from "react";
import { GOAL_KINDS, GOAL_KIND_IDS, STREAKS_MAX, streakNameOf, type Settings, type StreakRule } from "@panki/contracts";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { NumberField } from "../components/NumberField";
import { Setting } from "../components/Setting";
import { StreakEditor } from "../components/StreakEditor";
import { Toggle } from "../components/Toggle";
import { rememberShape } from "../skeletonMemory";

/** Where Settings remembers how many streaks it drew, for its skeleton (`skeletonMemory.ts`). */
export const STREAKS_SHAPE = "settings:streaks";

type Panel = { current: Settings; patch: (change: Partial<Settings>) => void };

/** One streak in Settings: its name over its editor, and Delete asking first (not for the last one). */
function StreakSection({ streak, only, disabled, onChange, onDelete }: { streak: StreakRule; only: boolean; disabled: boolean; onChange: (change: Partial<StreakRule>) => void; onDelete: () => void }) {
  const [asking, setAsking] = useState(false);
  const deleteAt = useRef<HTMLButtonElement>(null);
  const name = streakNameOf(streak);
  return (
    <div id={`streak-${streak.id}`} className="panel-section streak-section">
      <div className="streak-head">
        <h3 className="panel-subtitle">{name}</h3>
        <Button ref={deleteAt} id={`setting-streak-${streak.id}-delete`} className="is-danger" aria-pressed={asking} aria-expanded={asking} disabled={disabled || only} onClick={() => setAsking(!asking)}>
          <Icon name="trash" />
          Delete
        </Button>
        {asking ? (
          <Ask
            idPrefix={`setting-streak-${streak.id}-delete`}
            anchor={deleteAt}
            question={`Delete the streak “${name}”?`}
            go={{ words: "Delete", busy: "Deleting…" }}
            busy={false}
            failure={null}
            onKeep={() => setAsking(false)}
            onGo={() => {
              setAsking(false);
              onDelete();
            }}
          />
        ) : null}
      </div>
      <StreakEditor idPrefix={`setting-streak-${streak.id}`} streak={streak} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/**
 * Settings → General → Streaks: Streaks On / Off heading it and greying the rest while off; the streak the YouTube pill
 * shows; each streak a section of its own; Add a streak, the streak just added scrolled to.
 */
export function StreaksPanel({ current, patch }: Panel) {
  const on = current.streaksOn;
  const streaks = current.streaks;
  const [focused, setFocused] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (focused === undefined) return;
    document.getElementById(`streak-${focused}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focused]);
  useEffect(() => {
    rememberShape(STREAKS_SHAPE, streaks.length);
  }, [streaks.length]);

  // The pill's streak: one that's gone, or none picked, is the first.
  const pill = streaks.find((s) => s.id === current.pillStreak)?.id ?? streaks[0]?.id ?? "";
  function change(id: string, next: Partial<StreakRule>) {
    patch({ streaks: streaks.map((s) => (s.id === id ? { ...s, ...next } : s)) });
  }
  function add() {
    const kind = GOAL_KIND_IDS[0];
    const id = crypto.randomUUID();
    patch({ streaks: [...streaks, { id, name: "New streak", per: "day", countFrom: "all", groups: [[{ kind, n: GOAL_KINDS[kind].start }]] }] });
    setFocused(id);
  }
  return (
    <section className="panel streaks-panel" aria-labelledby="streaks-title">
      <h2 id="streaks-title" className="panel-title">
        Streaks
      </h2>
      <Setting id="streaksOn" label="Streaks" control={<Toggle id="setting-streaks-on" says={{ on: "On", off: "Off" }} on={on} onChange={(streaksOn) => patch({ streaksOn })} />} />
      <Setting
        id="pillStreak"
        label="Streak on the YouTube pill"
        control={<Dropdown id="setting-pill-streak" label="Streak on the YouTube pill" options={streaks.map((s) => ({ id: s.id, label: streakNameOf(s) }))} value={pill} disabled={!on} onChange={(pillStreak) => patch({ pillStreak })} />}
      />
      {streaks.map((s) => (
        <StreakSection
          key={s.id}
          streak={s}
          only={streaks.length === 1}
          disabled={!on}
          onChange={(next) => change(s.id, next)}
          onDelete={() => patch({ streaks: streaks.filter((x) => x.id !== s.id), ...(current.pillStreak === s.id ? { pillStreak: null } : {}) })}
        />
      ))}
      <div className="panel-section">
        <div className="add-actions add-actions-start">
          <Button id="setting-streak-add" disabled={!on || streaks.length >= STREAKS_MAX} onClick={add}>
            <Icon name="add" />
            Add a streak
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * Settings → General → Reminder: a streak with a run to lose whose day doesn't count yet is said to be at risk from
 * Starts at until the day turns, as a line in the app and on YouTube, never a pop-up. Greyed while Streaks is Off, its
 * rows while Reminder is.
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
