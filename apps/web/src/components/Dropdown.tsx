/** @panki One value from a list too long for a row of chips, or picked inside a sentence (`Dropdown`). Never a native `<select>`. */
import { useRef, useState, type ReactNode } from "react";
import type { Judgement } from "@panki/contracts";
import { useAnchored } from "../hooks/useAnchored";
import { useDismiss } from "../hooks/useDismiss";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { JudgedRow } from "./JudgedRow";
import { ScrollEdges } from "./ScrollEdges";

type Common<T extends string | number> = {
  id: string;
  /** What's being chosen, for a screen reader; the button itself shows only the value. */
  label: string;
  /**
   * `disabled` is a choice that's shown, so it's known to exist, but can't be made here. `note` is a quiet word at the
   * right of a choice in the list (where it comes from, say); the button shows only the label. `icon` is drawn before
   * the label, in the list and on the button (a transcription mode's). A `note` can be a sign rather than words (Panki
   * AI's spark where a meaning's dictionary would be). `judged` is Panki AI's verdict on a meaning: the choice drawn in
   * a `JudgedRow`, as the pop-up draws its meanings (the drawer's Meaning list under Touch up). `fixed` is a choice of
   * several that stands as `values` say and isn't toggled from here, drawn as any other (the Meaning list's custom
   * meanings: ticked, as the field's own words). `under` is another choice's id: the choice stands nested under it,
   * shown once that choice's arrow is pressed (a conversation's actions: Touch up's per-field ones under Touch up); one
   * whose `under` names no choice in the list stands at the top.
   */
  options: readonly { id: T; label: string; disabled?: boolean; fixed?: boolean; note?: ReactNode; icon?: IconName; judged?: { judgement: Judgement; reason: string }; under?: T }[];
  /** What the button says while the value is none of the choices: nothing has been chosen yet. */
  placeholder?: string;
  /** Shown, with what's chosen, but not to be changed just now. */
  disabled?: boolean;
  /** It fills the width it's in, and so does its list, whose choices wrap onto more lines: for choices that are sentences. */
  wide?: boolean;
  /** Headings over the list's two columns, the choices and their notes: what each column is (the field mapping's "Fill with" and "Source"). */
  columns?: { choice: string; note: string };
  /** Its list opens in the window itself (`useAnchored`), never cut off by a box that scrolls around it: one in a `FloatPanel`. */
  anchored?: boolean;
};
/** One choice: picking it closes the list. */
type One<T extends string | number> = { value: T; onChange: (value: T) => void };
/** Several, each ticked on or off where it stands; the list stays open for the next. `summary` is what the button says. */
type Many<T extends string | number> = { values: readonly T[]; onToggle: (value: T) => void; summary: string };
type Props<T extends string | number> = Common<T> & (One<T> | Many<T>);

/** One value picked from a short list that drops under its button, or several ticked in it; a tap outside or Escape closes it. Never a native select. */
export function Dropdown<T extends string | number>(props: Props<T>) {
  const { id, label, options, placeholder = "", disabled = false, wide = false, columns, anchored = false } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const many = "values" in props;
  const isOn = (value: T) => ("values" in props ? props.values.includes(value) : props.value === value);
  const current = "values" in props ? null : options.find((o) => o.id === props.value);
  const says = "values" in props ? props.summary : (current?.label ?? placeholder);
  // Nested choices: each stands under a choice in the list, else at the top. A parent opens with the list when one of
  // its own is on, so what's ticked is never hidden; otherwise closed until its arrow is pressed.
  const parentOf = (o: (typeof options)[number]) => (o.under !== undefined && o.under !== o.id && options.some((p) => p.id === o.under && p.under === undefined) ? o.under : undefined);
  const childrenOf = (id: T) => options.filter((o) => parentOf(o) === id);
  const [unfolded, setUnfolded] = useState<readonly T[]>([]);
  const openList = () => {
    setUnfolded(options.filter((o) => childrenOf(o.id).some((child) => isOn(child.id))).map((o) => o.id));
    setOpen(true);
  };

  useDismiss(rootRef, open, () => setOpen(false));
  useAnchored(rootRef, menu, anchored && open && !disabled, wide ? "same" : "least");

  return (
    <span ref={rootRef} className={`dropdown ${wide ? "is-wide" : ""}`.trim()}>
      <Button
        id={id}
        variant="chip"
        // Nothing chosen, or of several none ticked: said quietly. Several with one ticked or more: `is-lit`, which a
        // place may draw as lit (a conversation's actions).
        className={`dropdown-button ${("values" in props ? props.values.length > 0 : current) ? (many ? "is-lit" : "") : "is-unset"}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-label={`${label}: ${says}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
      >
        {current?.icon ? <Icon name={current.icon} className="dropdown-icon" /> : null}
        <span className="dropdown-says">{says}</span>
        <Icon name="down" />
      </Button>
      {open && !disabled ? (
        <>
          <div
            ref={menu}
            // In the window, `useAnchored` gives it its button's width, as it has when it opens in place.
            className={`menu dropdown-menu ${anchored ? "is-anchored" : ""}`.trim()}
            role="listbox"
            aria-label={label}
            aria-multiselectable={many || undefined}
          >
            {columns ? (
              <div className="dropdown-columns" aria-hidden="true">
                <span>{columns.choice}</span>
                <span>{columns.note}</span>
              </div>
            ) : null}
            {options.flatMap((o) => {
              if (parentOf(o) !== undefined) return [];
              const children = childrenOf(o.id);
              const shown = unfolded.includes(o.id);
              return [o, ...(shown ? children : [])];
            }).map((o) => {
              const nested = parentOf(o) !== undefined;
              const children = nested ? [] : childrenOf(o.id);
              const shown = unfolded.includes(o.id);
              const choice = (
                <Button
                  key={o.id}
                  variant="item"
                  role="option"
                  aria-selected={isOn(o.id)}
                  aria-pressed={isOn(o.id)}
                  aria-readonly={o.fixed === true || undefined}
                  className={[o.fixed ? "is-fixed" : "", nested ? "is-nested" : ""].filter(Boolean).join(" ") || undefined}
                  disabled={o.disabled === true}
                  onClick={() => {
                    if ("values" in props) {
                      if (!o.fixed) props.onToggle(o.id);
                      return;
                    }
                    props.onChange(o.id);
                    setOpen(false);
                  }}
                >
                  {/* Ticked or not, each choice of several keeps the tick's room, so their words stand in one column. */}
                  {many ? <Icon name="check" className={`dropdown-tick ${isOn(o.id) ? "" : "is-off"}`.trim()} /> : null}
                  {o.icon ? <Icon name={o.icon} className="dropdown-icon" /> : null}
                  <span className={o.judged ? "dropdown-choice ai-judgement-words" : "dropdown-choice"}>{o.label}</span>
                  {o.note ? <span className="dropdown-note">{o.note}</span> : null}
                </Button>
              );
              if (children.length > 0) {
                // A choice with others under it: the choice itself, and its arrow beside it opening or closing them.
                return (
                  <div key={o.id} className="dropdown-parent">
                    {choice}
                    <Button
                      className="btn-icon dropdown-unfold"
                      aria-expanded={shown}
                      aria-label={`${shown ? "Hide" : "Show"} ${children.length} under ${o.label}`}
                      onClick={() => setUnfolded((was) => (was.includes(o.id) ? was.filter((id) => id !== o.id) : [...was, o.id]))}
                    >
                      <Icon name="down" />
                    </Button>
                  </div>
                );
              }
              return o.judged ? (
                <JudgedRow key={o.id} judgement={o.judged.judgement} reason={o.judged.reason}>
                  {choice}
                </JudgedRow>
              ) : (
                choice
              );
            })}
          </div>
          <ScrollEdges of={menu} />
        </>
      ) : null}
    </span>
  );
}
