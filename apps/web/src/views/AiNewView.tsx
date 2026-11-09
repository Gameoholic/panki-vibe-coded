import { templatesOf, type AiPlaceId, type AiTemplate } from "@panki/contracts";
import { Button } from "../components/Button";

type Props = {
  place: AiPlaceId;
  /** The account's own templates, every place's. */
  own: readonly AiTemplate[];
  /** The template to start as a copy of, or null to start from nothing. */
  onPick: (base: AiTemplate | null) => void;
};

/** A new template starts as a copy of one of its place's there already, or empty; picking opens it in the editor, as a draft until it's saved (the SRS type's new page is the pattern). */
export function AiNewView({ place, own, onPick }: Props) {
  return (
    <section className="panel" aria-labelledby="ai-start-title">
      <h2 id="ai-start-title" className="panel-title">
        Start from
      </h2>
      <div className="starts">
        <Button variant="row" className="btn-start" data-base="empty" onClick={() => onPick(null)}>
          <span className="deck-name">
            Empty
            <span className="row-sub">A blank prompt.</span>
          </span>
        </Button>
        {templatesOf(place, own).map((template) => (
          <Button key={template.id} variant="row" className="btn-start" data-base={template.id} onClick={() => onPick(template)}>
            <span className="deck-name">{template.name}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}
