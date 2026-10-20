import { useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

type Common<T extends string | number> = {
  id: string;
  /** What's being chosen, for a screen reader; the button itself shows only the value. */
  label: string;
  /**
   * `disabled` is a choice that's shown, so it's known to exist, but can't be made here. `note` is a quiet word at the
   * right of a choice in the list (where it comes from, say); the button shows only the label. `icon` is drawn before
   * the label, in the list and on the button (a transcription mode's).
   */
  options: readonly { id: T; label: string; disabled?: boolean; note?: string; icon?: IconName }[];
  /** What the button says while the value is none of the choices: nothing has been chosen yet. */
  placeholder?: string;
  /** Shown, with what's chosen, but not to be changed just now. */
  disabled?: boolean;
  /** It fills the width it's in, and so does its list, whose choices wrap onto more lines: for choices that are sentences. */
  wide?: boolean;
  /** Headings over the list's two columns, the choices and their notes: what each column is (the field mapping's "Fill with" and "Source"). */
  columns?: { choice: string; note: string };
};
/** One choice: picking it closes the list. */
type One<T extends string | number> = { value: T; onChange: (value: T) => void };
/** Several, each ticked on or off where it stands; the list stays open for the next. `summary` is what the button says. */
type Many<T extends string | number> = { values: readonly T[]; onToggle: (value: T) => void; summary: string };
type Props<T extends string | number> = Common<T> & (One<T> | Many<T>);

/** One value picked from a short list that drops under its button, or several ticked in it; a tap outside or Escape closes it. Never a native select. */
export function Dropdown<T extends string | number>(props: Props<T>) {
  const { id, label, options, placeholder = "", disabled = false, wide = false, columns } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const many = "values" in props;
  const isOn = (value: T) => ("values" in props ? props.values.includes(value) : props.value === value);
  const current = "values" in props ? null : options.find((o) => o.id === props.value);
  const says = "values" in props ? props.summary : (current?.label ?? placeholder);

  useDismiss(rootRef, open, () => setOpen(false));

  return (
    <span ref={rootRef} className={`dropdown ${wide ? "is-wide" : ""}`.trim()}>
      <Button
        id={id}
        variant="chip"
        className={`dropdown-button ${many || current ? "" : "is-unset"}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-label={`${label}: ${says}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {current?.icon ? <Icon name={current.icon} className="dropdown-icon" /> : null}
        <span className="dropdown-says">{says}</span>
        <Icon name="down" />
      </Button>
      {open && !disabled ? (
        <div className="menu dropdown-menu" role="listbox" aria-label={label} aria-multiselectable={many || undefined}>
          {columns ? (
            <div className="dropdown-columns" aria-hidden="true">
              <span>{columns.choice}</span>
              <span>{columns.note}</span>
            </div>
          ) : null}
          {options.map((o) => (
            <Button
              key={o.id}
              variant="item"
              role="option"
              aria-selected={isOn(o.id)}
              aria-pressed={isOn(o.id)}
              disabled={o.disabled === true}
              onClick={() => {
                if ("values" in props) {
                  props.onToggle(o.id);
                  return;
                }
                props.onChange(o.id);
                setOpen(false);
              }}
            >
              {/* Ticked or not, each choice of several keeps the tick's room, so their words stand in one column. */}
              {many ? <Icon name="check" className={`dropdown-tick ${isOn(o.id) ? "" : "is-off"}`.trim()} /> : null}
              {o.icon ? <Icon name={o.icon} className="dropdown-icon" /> : null}
              <span className="dropdown-choice">{o.label}</span>
              {o.note ? <span className="dropdown-note">{o.note}</span> : null}
            </Button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
