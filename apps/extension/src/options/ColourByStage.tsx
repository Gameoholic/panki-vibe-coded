/** @panki Words in the decks' colour, Use stage's colour or Custom colour (`ColourByStage`). */
import { Segmented } from "@web/components/Segmented";
import { Swatches } from "@web/components/Swatches";
import { MARK_SWATCHES, paintOf, type MarkPaint } from "../seekLook";

const WAYS = [
  { id: "stage", label: "Use stage's colour" },
  { id: "one", label: "Custom colour" },
] as const;

/**
 * A colour by where cards stand, as a `Setting`'s control: Use stage's colour (each word in its highest card's stage's
 * colour, each card in its own) or Custom colour, and under it the palette, greyed while the stage's is used. The
 * Highlight words that are in your decks panel, and the seek bar's Words that are in your decks and Where cards came
 * from marks, pick theirs with this.
 */
export function ColourByStage({ id, byStage, colour, disabled, onByStage, onColour }: { id: string; byStage: boolean; colour: MarkPaint; disabled: boolean; onByStage: (byStage: boolean) => void; onColour: (colour: MarkPaint) => void }) {
  return (
    <span className="colour-by-stage">
      <Segmented idPrefix={`${id}-way`} label="Colour" options={WAYS} value={byStage ? "stage" : "one"} disabled={disabled} onChange={(way) => onByStage(way === "stage")} />
      <Swatches
        id={id}
        swatches={MARK_SWATCHES}
        value={colour}
        disabled={disabled || byStage}
        onChange={(value) => {
          const paint = paintOf(value);
          if (paint) onColour(paint);
        }}
      />
    </span>
  );
}
