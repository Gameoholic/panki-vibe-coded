import { Segmented } from "@web/components/Segmented";
import { Swatches } from "@web/components/Swatches";
import { MARK_SWATCHES, paintOf, type MarkPaint } from "../seekLook";

const WAYS = [
  { id: "stage", label: "By stage" },
  { id: "one", label: "One colour" },
] as const;

/**
 * The colour of the words that are in the decks, as a `Setting`'s control: By stage (each word in its highest card's
 * stage's colour) or One colour, and under it the palette, greyed while By stage. The Highlight words that are in your
 * decks panel and the seek bar's Words that are in your decks mark both pick theirs with this.
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
