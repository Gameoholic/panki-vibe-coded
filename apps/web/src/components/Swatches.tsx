/** @panki A colour picked from the palette, or one of one's own, and how strongly it's drawn (`Swatches`, `Swatch`, `SwatchStrength`, `hexOfCss`). Never a second row of swatches. */
import { useRef, useState, type CSSProperties } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { Button } from "./Button";
import { ColourWheel } from "./ColourWheel";

/** One colour to pick: its id (what `value` and `onChange` speak in), its name, and how it's written in CSS. */
export type Swatch = { id: string; name: string; css: string };

/** A colour written in CSS as `#rrggbb`: as it is, or a token's value as the page has it right now; white when it can't be read. */
export function hexOfCss(css: string): string {
  const token = /^var\((--[\w-]+)\)$/.exec(css)?.[1];
  const value = token ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : css;
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#ffffff";
}

/** How strongly the colour is drawn, in percent, picked inside the same control: its own `disabled` when it can be set while the colour can't. */
export type SwatchStrength = { value: number; disabled?: boolean; onChange: (value: number) => void };
/** The faintest a colour can be set: below it a mark is gone. */
const STRENGTH_MIN = 5;

/**
 * A colour picked from a palette: a round swatch for each of `swatches`, the one on ringed, and a last one for a colour
 * of one's own (`value` a `#rrggbb` that's none of theirs), rainbow until one is picked, which opens the wheel under the
 * row; the name of the one on after them; and, given a `strength`, how strongly it's drawn, a slider in the same
 * control, kept as it's let go. The extension's colours pick theirs with this, and an SRS type's stages theirs.
 */
export function Swatches({ id, swatches, value, disabled = false, strength, onChange }: { id: string; swatches: readonly Swatch[]; value: string; disabled?: boolean; strength?: SwatchStrength; onChange: (value: string) => void }) {
  const [wheel, setWheel] = useState(false);
  /** The strength while the slider is held, kept only as it's let go, so a drag is one change. */
  const [drawn, setDrawn] = useState<number | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  useDismiss(root, wheel, () => setWheel(false));
  const on = swatches.find((swatch) => swatch.id === value);
  const own = on ? null : value;
  const keep = () => {
    if (strength && drawn !== null && drawn !== strength.value) strength.onChange(drawn);
    setDrawn(null);
  };
  const shownStrength = drawn ?? strength?.value ?? 100;
  return (
    <span ref={root} className="swatches">
      <span className="swatch-row" role="group" aria-label="Color">
        {swatches.map((swatch, i) => (
          <Button
            key={`${i}-${swatch.id}`}
            id={`${id}-${i}`}
            className="swatch"
            aria-label={swatch.name}
            aria-pressed={swatch.id === value}
            disabled={disabled}
            style={{ "--swatch": swatch.css } as CSSProperties}
            onClick={() => onChange(swatch.id)}
          />
        ))}
        <Button
          id={`${id}-own`}
          className={`swatch is-own ${own ? "has-colour" : ""}`.trim()}
          aria-label="Your own color"
          aria-pressed={own !== null}
          aria-expanded={wheel}
          disabled={disabled}
          style={own ? ({ "--swatch": own } as CSSProperties) : undefined}
          onClick={() => setWheel((open) => !open)}
        />
      </span>
      <span className="swatch-name">{on ? on.name : value.toUpperCase()}</span>
      {strength ? (
        <span className="swatch-strength">
          <input
            id={`${id}-strength`}
            type="range"
            min={STRENGTH_MIN}
            max={100}
            step={1}
            value={shownStrength}
            disabled={strength.disabled ?? disabled}
            aria-label="Strength"
            style={{ "--swatch": on?.css ?? value } as CSSProperties}
            onChange={(e) => setDrawn(Number(e.target.value))}
            onPointerUp={keep}
            onKeyUp={keep}
            onBlur={keep}
          />
          <span className="swatch-strength-value">{shownStrength}%</span>
        </span>
      ) : null}
      {wheel && !disabled ? (
        <span className="colour-pop">
          <ColourWheel id={`${id}-wheel`} start={own ?? hexOfCss(on?.css ?? "#ffffff")} onPick={onChange} />
        </span>
      ) : null}
    </span>
  );
}
