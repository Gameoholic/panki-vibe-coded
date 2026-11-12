/** @panki A colour picked from the palette, or one of one's own (`Swatches`, `Swatch`, `hexOfCss`). Never a second row of swatches. */
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

/**
 * A colour picked from a palette: a round swatch for each of `swatches`, the one on ringed, and a last one for a colour
 * of one's own (`value` a `#rrggbb` that's none of theirs), rainbow until one is picked, which opens the wheel under the
 * row; the name of the one on after them. The extension's seek bar marks and words in the decks pick their colour with
 * this, and an SRS type's stages theirs.
 */
export function Swatches({ id, swatches, value, disabled = false, onChange }: { id: string; swatches: readonly Swatch[]; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [wheel, setWheel] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useDismiss(root, wheel, () => setWheel(false));
  const on = swatches.find((swatch) => swatch.id === value);
  const own = on ? null : value;
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
      {wheel && !disabled ? (
        <span className="colour-pop">
          <ColourWheel id={`${id}-wheel`} start={own ?? hexOfCss(on?.css ?? "#ffffff")} onPick={onChange} />
        </span>
      ) : null}
    </span>
  );
}
