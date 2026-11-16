/** @panki A number typed or stepped with − and +: a wait, a setting, a count, dollars to the cent (`NumberField`). Never `<input type="number">` or `type="time"`. */
import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

type Props = {
  id: string;
  /** What the number is, for a screen reader; the words beside it are the row's. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** How much − and + move it, and how fine a number can be typed: 1 (whole numbers) unless said, 0.1 for one decimal. */
  step?: number;
  /**
   * An amount always shown to this many decimals and typed no finer, whatever `step` moves it by: 2 for dollars and
   * cents ("0.50", stepped a dime at a time).
   */
  decimals?: number;
  /** Words before the number, like "$". */
  prefix?: string;
  /** The − and + beside the number; off where there's no room, like inside a box on the chart. */
  steppers?: boolean;
  /** `sm` is the compact one for a box on the chart or a menu. */
  size?: "md" | "sm";
  /** Words after the number, like "hours early". */
  suffix?: string;
  disabled?: boolean;
  /** Names the field for the checks that drive the real UI. */
  "data-field"?: string;
};

/** A number between two bounds, whole unless `step` says finer, typed or stepped; never the browser's spinner. What's typed is taken as soon as it's a number in range. */
export function NumberField({ id, label, value, onChange, min, max, step: by = 1, decimals, prefix, steppers = true, size = "md", suffix, disabled = false, "data-field": dataField }: Props) {
  const places = decimals ?? (by >= 1 ? 0 : Math.ceil(-Math.log10(by)));
  /** To the step's own fineness, so stepping 0.1 at a time never drifts into 1.2000000000000002. */
  const fine = (n: number) => Number(n.toFixed(places));
  /** The number as it's shown: to its decimals where it has them ("0.50"), else as it is. */
  const shown = (n: number) => (decimals === undefined ? String(n) : n.toFixed(decimals));
  const [text, setText] = useState(shown(value));
  // A change from outside (undo, another control) shows; a half-typed number stays as typed.
  useEffect(() => {
    setText((current) => (Number(current.replace(",", ".")) === value && current.trim() !== "" ? current : shown(value)));
    // `shown` reads `decimals` alone, which a field keeps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function type(next: string) {
    setText(next);
    // A comma typed is a decimal point.
    const n = Number(next.replace(",", "."));
    if (next.trim() !== "" && Number.isFinite(n) && (places > 0 || Number.isInteger(n)) && n >= min && n <= max) onChange(fine(n));
  }
  function step(dir: 1 | -1) {
    const next = fine(Math.min(max, Math.max(min, value + dir * by)));
    setText(shown(next));
    if (next !== value) onChange(next);
  }

  return (
    <div className={`numfield ${size === "sm" ? "numfield-sm" : ""}`.trim()}>
      {steppers ? (
        <Button className="btn-icon" aria-label="Fewer" disabled={disabled || value <= min} onClick={() => step(-1)}>
          <Icon name="minus" />
        </Button>
      ) : null}
      {prefix ? <span className="numfield-prefix">{prefix}</span> : null}
      <input
        id={id}
        className="field-input num"
        inputMode={places > 0 ? "decimal" : "numeric"}
        aria-label={label}
        data-field={dataField}
        value={text}
        disabled={disabled}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setText(shown(value))}
      />
      {steppers ? (
        <Button className="btn-icon" aria-label="More" disabled={disabled || value >= max} onClick={() => step(1)}>
          <Icon name="add" />
        </Button>
      ) : null}
      {suffix ? <span className="numfield-suffix">{suffix}</span> : null}
    </div>
  );
}
