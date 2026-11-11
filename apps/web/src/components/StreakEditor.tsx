/** @panki One streak's settings: name, Streak type, Count from, Conditions (`goals` in code) joined by and / or, in Settings and on its tile alike (`StreakEditor`). */
import { Fragment, useRef, useState } from "react";
import { GOAL_KINDS, GOALS_MAX, STREAK_NAME_MAX, STREAK_PERIODS, STREAK_PER_IDS, goalInMinutes, goalKindsFor, goalMax, groupsSwitchedTo, type Goal, type GoalKind, type StreakPer, type StreakRule } from "@panki/contracts";
import { Ask } from "./Ask";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Icon } from "./Icon";
import { NumberField } from "./NumberField";
import { Segmented } from "./Segmented";
import { Setting } from "./Setting";
import { TextField } from "./TextField";

type Props = {
  /** Every control's id starts with it, so the tile's editor and Settings' never share one. */
  idPrefix: string;
  streak: StreakRule;
  onChange: (change: Partial<StreakRule>) => void;
  /** Greyed while Streaks is Off. */
  disabled?: boolean;
  /** Its dropdowns' lists open in the window: the editor hangs in a panel that scrolls (the tile's). */
  anchored?: boolean;
};

type Groups = readonly (readonly Goal[])[];

/**
 * The joint after a goal flipped: "and" (the next goal in the same group) splits the group there, "or" (the next goal
 * starting the next group) joins the two groups. The groups are all the joints ever change.
 */
function flipped(groups: Groups, gi: number, ci: number): Goal[][] {
  const group = groups[gi] ?? [];
  if (ci < group.length - 1) return [...groups.slice(0, gi), group.slice(0, ci + 1), group.slice(ci + 1), ...groups.slice(gi + 1)].map((g) => [...g]);
  return [...groups.slice(0, gi), [...group, ...(groups[gi + 1] ?? [])], ...groups.slice(gi + 2)].map((g) => [...g]);
}

/** A goal added: at the end of the last group with a kind it hasn't yet, or, with every kind in it, as a group of its own. */
function added(groups: Groups, offered: readonly GoalKind[]): Goal[][] {
  const last = groups[groups.length - 1] ?? [];
  const fresh = offered.find((id) => !last.some((g) => g.kind === id));
  if (fresh) return [...groups.slice(0, -1).map((g) => [...g]), [...last, { kind: fresh, n: GOAL_KINDS[fresh].start }]];
  const first = offered[0] ?? "reviews";
  return [...groups.map((g) => [...g]), [{ kind: first, n: GOAL_KINDS[first].start }]];
}

/**
 * The joint between two goals, the owner's and / or: its word, flipped by a press. An "or" is drawn as the divider
 * between two groups, the word on the line.
 */
function Joint({ id, or, disabled, onFlip }: { id: string; or: boolean; disabled: boolean; onFlip: () => void }) {
  return (
    <div className={`goal-joint ${or ? "is-or" : ""}`.trim()}>
      <Button id={id} className="btn-chip goal-joint-word" aria-label={`${or ? "or" : "and"}, between two conditions`} disabled={disabled} onClick={onFlip}>
        {or ? "or" : "and"}
      </Button>
    </div>
  );
}

/** The minutes a half hour holds: hours are entered by the half. */
const HALF_HOUR = 30;

/**
 * A time goal's number, entered in minutes or hours (a `Segmented` beside the number): whole minutes, or hours by the
 * half ("1.5 h", "2.5 h"), kept as whole minutes either way, so 1.5 h is 90. The unit the row opens in follows the
 * value (an hour or more that sits on a half hour reads as hours); the pick then stands while the row is open and
 * nothing of it is kept. Switching to hours brings the minutes to the nearest half hour, half an hour at the least.
 */
function TimeAmount({ idPrefix, label, minutes, max, disabled, onChange }: { idPrefix: string; label: string; minutes: number; max: number; disabled: boolean; onChange: (minutes: number) => void }) {
  const [unit, setUnit] = useState<"min" | "h">(minutes >= 60 && minutes % HALF_HOUR === 0 ? "h" : "min");
  const toHalfHours = (n: number) => Math.min(max, Math.max(HALF_HOUR, Math.round(n / HALF_HOUR) * HALF_HOUR));
  return (
    <div className="goal-amount">
      {unit === "h" ? (
        <NumberField id={`${idPrefix}-n`} label={`${label}, hours`} value={minutes / 60} min={HALF_HOUR / 60} max={max / 60} step={0.5} disabled={disabled} onChange={(h) => onChange(toHalfHours(h * 60))} />
      ) : (
        <NumberField id={`${idPrefix}-n`} label={`${label}, minutes`} value={minutes} min={1} max={max} disabled={disabled} onChange={onChange} />
      )}
      <Segmented
        idPrefix={`${idPrefix}-unit`}
        label="Unit"
        options={[
          { id: "min", label: "min" },
          { id: "h", label: "h" },
        ]}
        value={unit}
        disabled={disabled}
        onChange={(next) => {
          setUnit(next);
          if (next === "h" && minutes !== toHalfHours(minutes)) onChange(toHalfHours(minutes));
        }}
      />
    </div>
  );
}

/**
 * One goal as a row of the goals' grid: its kind, its number with − and + (a time goal's in min or h, `TimeAmount`;
 * none for a kind without one, the cell left empty so Delete stays in its column), and Delete asking first; the kind's
 * one line under it where it has one. The most a number takes is its kind's for the streak's type (`goalMax`).
 */
function GoalRow({ idPrefix, goal, per, offered, used, only, disabled, anchored, onChange, onRemove }: { idPrefix: string; goal: Goal; per: StreakPer; offered: readonly GoalKind[]; used: readonly GoalKind[]; only: boolean; disabled: boolean; anchored: boolean; onChange: (goal: Goal) => void; onRemove: () => void }) {
  const kind = GOAL_KINDS[goal.kind];
  const [asking, setAsking] = useState(false);
  const removeAt = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className={`goal-row ${asking ? "is-asking" : ""}`.trim()}>
        <Dropdown
          id={`${idPrefix}-kind`}
          label="Condition"
          anchored={anchored}
          disabled={disabled}
          // The kinds the streak's type fits alone; the others its group has already are shown, not offered.
          options={offered.map((id) => ({ id, label: GOAL_KINDS[id].name, disabled: id !== goal.kind && used.includes(id) }))}
          value={goal.kind}
          onChange={(next) => onChange({ kind: next, n: GOAL_KINDS[next].start })}
        />
        {kind.numbered && goalInMinutes(goal.kind) ? (
          <TimeAmount idPrefix={idPrefix} label={kind.name} minutes={goal.n} max={goalMax(goal.kind, per)} disabled={disabled} onChange={(n) => onChange({ ...goal, n })} />
        ) : kind.numbered ? (
          <NumberField id={`${idPrefix}-n`} label={kind.name} value={goal.n} min={1} max={goalMax(goal.kind, per)} disabled={disabled} onChange={(n) => onChange({ ...goal, n })} />
        ) : null}
        <Button
          ref={removeAt}
          id={`${idPrefix}-remove`}
          className="is-danger goal-remove"
          aria-pressed={asking}
          aria-expanded={asking}
          // A streak keeps one goal at least.
          disabled={disabled || only}
          onClick={() => setAsking(!asking)}
        >
          <Icon name="trash" />
          Delete
        </Button>
        {asking ? (
          <Ask
            idPrefix={`${idPrefix}-remove`}
            anchor={removeAt}
            question={`Delete the condition ${kind.name}?`}
            go={{ words: "Delete", busy: "Deleting…" }}
            busy={false}
            failure={null}
            onKeep={() => setAsking(false)}
            onGo={() => {
              setAsking(false);
              onRemove();
            }}
          />
        ) : null}
      </div>
      {kind.why ? <p className="goal-why">{kind.why}</p> : null}
    </>
  );
}

/**
 * One streak's settings: its name, its Streak type (`STREAK_PERIODS`), Count from (Now or All time), its Conditions
 * (`goals` in code: each a kind from `GOAL_KINDS` that fits the type and its number, joined by and / or, "and" binding
 * tighter, so they stand in groups and any one group met counts), and Add a condition; YouTube's streak reminder is the account's alone (the extension's YouTube tab). Switching
 * the type takes off, in the same change, the goals that don't fit it, so the switch is never blocked. Each change
 * goes up at once; the owner of the streaks saves them.
 */
export function StreakEditor({ idPrefix, streak, onChange, disabled = false, anchored = false }: Props) {
  // The groups as they count: a goal kept that doesn't fit the type is left out, and goes on the next change.
  const groups = groupsSwitchedTo(streak.per, streak.groups);
  const offered = goalKindsFor(streak.per);
  const total = groups.flat().length;
  return (
    <div className="streak-edit">
      <div className="setting streak-name">
        <TextField id={`${idPrefix}-name`} label="Name" value={streak.name} disabled={disabled} autoComplete="off" onChange={(name) => onChange({ name: name.slice(0, STREAK_NAME_MAX) })} />
      </div>
      <Setting
        id={`${idPrefix}-per`}
        label="Streak type"
        control={
          <Segmented
            idPrefix={`${idPrefix}-per`}
            label="Streak type"
            options={STREAK_PER_IDS.map((id) => ({ id, label: STREAK_PERIODS[id].name }))}
            value={streak.per}
            disabled={disabled}
            onChange={(per) => onChange({ per, groups: groupsSwitchedTo(per, groups) })}
          />
        }
      />
      <Setting
        id={`${idPrefix}-from`}
        label="Count from"
        control={
          <Segmented
            idPrefix={`${idPrefix}-from`}
            label="Count from"
            options={[
              { id: "now", label: "Now" },
              { id: "all", label: "All time" },
            ]}
            // A day kept is Now; the server keeps or stamps it, the browser only asks.
            value={streak.countFrom === "all" ? "all" : "now"}
            disabled={disabled}
            onChange={(from) => onChange({ countFrom: from })}
          />
        }
      />
      <div className="setting">
        <div className="setting-head">
          <span className="setting-label">Conditions</span>
        </div>
        <div className="goals">
          {groups.map((group, gi) =>
            group.map((goal, ci) => (
              <Fragment key={`${gi}-${ci}`}>
                <GoalRow
                  idPrefix={`${idPrefix}-goal-${gi}-${ci}`}
                  goal={goal}
                  per={streak.per}
                  offered={offered}
                  used={group.map((g) => g.kind)}
                  only={total === 1}
                  disabled={disabled}
                  anchored={anchored}
                  onChange={(next) => onChange({ groups: groups.map((g, x) => (x === gi ? g.map((c, y) => (y === ci ? next : c)) : g)) })}
                  onRemove={() => onChange({ groups: groups.map((g, x) => (x === gi ? g.filter((_, y) => y !== ci) : g)).filter((g) => g.length > 0) })}
                />
                {/* The joint after every goal but the last: within a group "and", at a group's end "or". */}
                {gi === groups.length - 1 && ci === group.length - 1 ? null : (
                  <Joint id={`${idPrefix}-joint-${gi}-${ci}`} or={ci === group.length - 1} disabled={disabled} onFlip={() => onChange({ groups: flipped(groups, gi, ci) })} />
                )}
              </Fragment>
            )),
          )}
        </div>
        <div className="add-actions add-actions-start">
          <Button id={`${idPrefix}-add-goal`} disabled={disabled || total >= GOALS_MAX} onClick={() => onChange({ groups: added(groups, offered) })}>
            <Icon name="add" />
            Add a condition
          </Button>
        </div>
      </div>    </div>
  );
}
