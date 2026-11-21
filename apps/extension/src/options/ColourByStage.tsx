/** @panki Words in the decks' colour, Use stage's color or Custom color (`ColourByStage`). */
import { Segmented } from "@web/components/Segmented";
import { Swatches } from "@web/components/Swatches";
import { MARK_SWATCHES, paintOf, type FillStrength, type MarkPaint } from "../seekLook";

const WAYS = [
  { id: "stage", label: "Use stage's color" },
  { id: "one", label: "Custom color" },
] as const;

/**
 * A colour by where cards stand, as a `Setting`'s control: Use stage's colour (each word in its highest card's stage's
 * colour, each card in its own) or Custom colour, and under it the palette, greyed while the stage's is used, its
 * strength set either way. The
 * Highlight words that are in your decks panel, and the seek bar's Words that are in your decks and Where cards came
 * from marks, pick theirs with this.
 */
export function ColourByStage({
  id,
  byStage,
  colour,
  strength,
  disabled,
  onByStage,
  onColour,
  onStrength,
}: {
  id: string;
  byStage: boolean;
  colour: MarkPaint;
  strength: FillStrength;
  disabled: boolean;
  onByStage: (byStage: boolean) => void;
  onColour: (colour: MarkPaint) => void;
  onStrength: (strength: FillStrength) => void;
}) {
  return (
    <span className="colour-by-stage">
      <Segmented idPrefix={`${id}-way`} label="Color" options={WAYS} value={byStage ? "stage" : "one"} disabled={disabled} onChange={(way) => onByStage(way === "stage")} />
      <Swatches
        id={id}
        swatches={MARK_SWATCHES}
        value={colour}
        disabled={disabled || byStage}
        // The strength is the stages' colours' too, so it's set whichever way the colour goes.
        strength={{ value: strength, disabled, onChange: onStrength }}
        onChange={(value) => {
          const paint = paintOf(value);
          if (paint) onColour(paint);
        }}
      />
    </span>
  );
}
