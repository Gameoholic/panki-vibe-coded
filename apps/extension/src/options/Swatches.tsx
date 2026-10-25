import { useRef, useState, type CSSProperties } from "react";
import { Button } from "@web/components/Button";
import { useDismiss } from "@web/hooks/useDismiss";
import { MARK_COLOURS, MARK_COLOUR_IDS, MarkColour, paintCss, paintName, type MarkPaint } from "../seekLook";
import { ColourWheel } from "./ColourWheel";

/** A palette colour as the page has it right now, as `#rrggbb`, for the wheel to start from; white when it can't be read. */
function hexOfPaint(paint: MarkPaint): string {
  const css = paintCss(paint);
  const token = /^var\((--[\w-]+)\)$/.exec(css)?.[1];
  const value = token ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : css;
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#ffffff";
}

/**
 * A colour picked from the palette (`seekLook.ts` → `MARK_COLOURS`): a round swatch for each, the one on ringed, and a
 * last one for a colour of the viewer's own (the owner, 2026-10-19: "a custom colour wheel in case I want custom
 * colours"), rainbow until one is picked, which opens the wheel under the row; its name after them. The seek bar's
 * marks and the words already in the cards both pick their colour with this.
 */
export function Swatches({ id, value, disabled, onChange }: { id: string; value: MarkPaint; disabled: boolean; onChange: (colour: MarkPaint) => void }) {
  const [wheel, setWheel] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useDismiss(root, wheel, () => setWheel(false));
  const own = MarkColour.safeParse(value).success ? null : value;
  return (
    <span ref={root} className="mark-swatches">
      <span className="mark-swatch-row" role="group" aria-label="Colour">
        {MARK_COLOUR_IDS.map((colour) => (
          <Button
            key={colour}
            id={`${id}-${colour}`}
            className="mark-swatch"
            aria-label={MARK_COLOURS[colour].name}
            aria-pressed={colour === value}
            disabled={disabled}
            style={{ "--swatch": MARK_COLOURS[colour].css } as CSSProperties}
            onClick={() => onChange(colour)}
          />
        ))}
        <Button
          id={`${id}-own`}
          className={`mark-swatch is-own ${own ? "has-colour" : ""}`.trim()}
          aria-label="Your own colour"
          aria-pressed={own !== null}
          aria-expanded={wheel}
          disabled={disabled}
          style={own ? ({ "--swatch": own } as CSSProperties) : undefined}
          onClick={() => setWheel((open) => !open)}
        />
      </span>
      <span className="mark-swatch-name">{paintName(value)}</span>
      {wheel && !disabled ? (
        <span className="colour-pop">
          <ColourWheel id={`${id}-wheel`} start={own ?? hexOfPaint(value)} onPick={onChange} />
        </span>
      ) : null}
    </span>
  );
}
