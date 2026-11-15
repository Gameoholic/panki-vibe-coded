/** @panki A field of Example sentences typed in where it stands: its rows of Situation, Sentence and Translation, dragged, deleted and added (`ExampleRows`). Never a second editor of examples. */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EMPTY_EXAMPLE, examplesOf, examplesValue, type ExampleRow } from "@panki/contracts";
import { useDragOrder } from "../hooks/useDragOrder";
import { langOf } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** What this says, one home. */
const ROWS_WORDS = { add: "Add example", move: "Move", remove: "Delete" };

/** A row's three lines, top to bottom: what each is called (its placeholder) and its look. */
const LINES = [
  { part: "situation", name: "Situation" },
  { part: "sentence", name: "Sentence" },
  { part: "translation", name: "Translation" },
] as const satisfies readonly { part: keyof ExampleRow; name: string }[];
type Part = (typeof LINES)[number]["part"];

/** A row as it's being edited, with a key of its own, so its inputs (and the cursor in them) stay its own as rows above it move or go. */
type Held = { key: number; row: ExampleRow };
let minted = 0;
const held = (row: ExampleRow): Held => ({ key: ++minted, row });
/** The rows a value holds, to edit: one empty row to type into when it holds none. */
function heldOf(value: string): Held[] {
  const rows = examplesOf(value);
  return (rows.length > 0 ? rows : [EMPTY_EXAMPLE]).map(held);
}
/** Whether a row holds nothing yet. */
const isEmpty = (row: ExampleRow) => examplesValue([row]) === "";

type Props = {
  id: string;
  label: string;
  /** The field's value, its rows' JSON (`examplesValue`); "" for none. */
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  /** Drawn inside the box, before the first row, as `TextField`'s: Panki AI's spark on what it wrote, one for the whole field. */
  lead?: ReactNode;
  /** At the right of the label's row, as `TextField`'s: what Touch up says of a field it has nothing to change in. */
  labelEnd?: ReactNode;
  /** The first row's Situation takes the focus as the field is drawn: the form's first field. */
  autoFocus?: boolean;
  /** Shown, greyed, while what it belongs to is switched off. */
  disabled?: boolean;
  /** Shown, not edited: no rows moved, deleted or added. */
  readOnly?: boolean;
  /** Names the field for the checks that drive the real UI. */
  "data-field"?: string;
};

/**
 * A field of Example sentences: one box, as a text field's, holding a row per example, each its Situation, its
 * Sentence and its Translation, every line typed in where it stands; a row moved by its grip, taken out by its
 * trash, and one more added at the box's foot. The field's value is the rows' JSON (`examplesValue`), which leaves out
 * a row with nothing in it, so the rows being edited are kept here: a value handed in is read afresh only when it isn't
 * the one this last said (an accepted proposal, the form emptied after Add), and a row just added stays while it's empty.
 */
export function ExampleRows({ id, label, value, onChange, error, lead, labelEnd, autoFocus = false, disabled = false, readOnly = false, "data-field": dataField }: Props) {
  const [rows, setRows] = useState<Held[]>(() => heldOf(value));
  const [said, setSaid] = useState(value);
  if (value !== said) {
    setSaid(value);
    setRows(heldOf(value));
  }
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const inputKey = (key: number, part: Part) => `${key}:${part}`;
  /** A row just added, whose Situation takes the focus once it's drawn. */
  const [focusOn, setFocusOn] = useState<number | null>(null);
  useEffect(() => {
    if (focusOn === null) return;
    inputs.current.get(inputKey(focusOn, "situation"))?.focus();
    setFocusOn(null);
  }, [focusOn]);

  /** The rows as they now stand, said to the field when its value changes by it; never none, so there's always a row to type into. */
  function change(next: Held[]) {
    const shown = next.length > 0 ? next : [held(EMPTY_EXAMPLE)];
    setRows(shown);
    const now = examplesValue(shown.map((h) => h.row));
    setSaid(now);
    if (now !== value) onChange(now);
  }
  const order = useDragOrder(rows.length, (from, to) => {
    const next = [...rows];
    const [moving] = next.splice(from, 1);
    if (moving) next.splice(to, 0, moving);
    change(next);
  });
  const type = (i: number, part: Part, text: string) => change(rows.map((h, k) => (k === i ? { ...h, row: { ...h.row, [part]: text } } : h)));
  function add() {
    const fresh = held(EMPTY_EXAMPLE);
    change([...rows, fresh]);
    setFocusOn(fresh.key);
  }
  // Enter in a row's Situation or Sentence goes on to its next line; in its Translation it sends the form, as a one-line
  // field's does. An Enter that confirms a Japanese composition is the IME's.
  function onEnter(e: KeyboardEvent<HTMLInputElement>, key: number, part: Part) {
    if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
    const next = LINES[LINES.findIndex((line) => line.part === part) + 1];
    if (!next) return;
    e.preventDefault();
    inputs.current.get(inputKey(key, next.part))?.focus();
  }

  const tools = !readOnly;
  const named = (
    <label className="field-label" htmlFor={id}>
      {label}
    </label>
  );
  return (
    <div className={`field examples-field ${error ? "field-invalid" : ""} ${lead ? "has-lead" : ""}`.replace(/\s+/g, " ").trim()}>
      {labelEnd ? (
        <div className="field-label-row">
          {named}
          {labelEnd}
        </div>
      ) : (
        named
      )}
      <div className="field-leads">
        {lead ? (
          <span className="field-lead" aria-hidden="true">
            {lead}
          </span>
        ) : null}
        <div
          className={`field-input examples-box ${readOnly ? "is-readonly" : ""} ${disabled ? "is-disabled" : ""} ${order.dragging !== null ? "is-reordering" : ""}`.replace(/\s+/g, " ").trim()}
          role="group"
          aria-label={label}
          aria-describedby={error ? `${id}-error` : undefined}
          data-field={dataField}
        >
          {rows.map((h, i) => (
            <div key={h.key} ref={order.rowRef(i)} style={order.rowStyle(i)} className={`examples-row ${order.dragging === i ? "is-dragging" : ""}`.trim()}>
              <div className="examples-lines">
                {LINES.map(({ part, name }) => {
                  const text = h.row[part];
                  return (
                    <input
                      key={part}
                      ref={(el) => {
                        const at = inputKey(h.key, part);
                        if (el) inputs.current.set(at, el);
                        else inputs.current.delete(at);
                      }}
                      id={i === 0 && part === "situation" ? id : undefined}
                      autoFocus={autoFocus && i === 0 && part === "situation"}
                      className={`examples-input examples-${part}`}
                      type="text"
                      value={text}
                      placeholder={name}
                      aria-label={`${name} ${i + 1}`}
                      aria-invalid={error ? true : undefined}
                      // The sentence is in the language learned; the other two in whatever they're typed in.
                      lang={langOf(text)}
                      autoComplete="off"
                      readOnly={readOnly}
                      disabled={disabled}
                      onChange={(e) => type(i, part, e.target.value)}
                      onKeyDown={(e) => onEnter(e, h.key, part)}
                    />
                  );
                })}
              </div>
              {tools ? (
                <div className="examples-tools">
                  <Button className="btn-icon field-grip" aria-label={ROWS_WORDS.move} disabled={disabled || rows.length === 1} {...order.handleProps(i)}>
                    <Icon name="grip" />
                  </Button>
                  {/* Taken out at once, with nothing asked: it's a row of a form not yet saved, and nothing is lost until the form is. */}
                  <Button className="btn-icon examples-remove" aria-label={ROWS_WORDS.remove} disabled={disabled || (rows.length === 1 && isEmpty(h.row))} onClick={() => change(rows.filter((_, k) => k !== i))}>
                    <Icon name="trash" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {tools ? (
            <Button className="examples-add" disabled={disabled} onClick={add}>
              <Icon name="add" />
              {ROWS_WORDS.add}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <div id={`${id}-error`} className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
