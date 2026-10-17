import type { SrsType } from "@panki/contracts";
import { Button } from "../components/Button";
import { typeSummary } from "../srsKinds";

type Props = {
  types: SrsType[];
  /** The type to start as a copy of, or null to start from nothing. */
  onPick: (base: SrsType | null) => void;
};

/** A new SRS type starts as a copy of one there already, or empty; picking opens it in the editor, as a draft until it's saved. */
export function SrsNewView({ types, onPick }: Props) {
  return (
    <section className="panel" aria-labelledby="srs-start-title">
      <h2 id="srs-start-title" className="panel-title">
        Start from
      </h2>
      <div className="starts">
        <Button variant="row" className="btn-start" data-base="empty" onClick={() => onPick(null)}>
          <span className="deck-name">
            Empty
            <span className="row-sub">No stages, no answers; build it all.</span>
          </span>
        </Button>
        {types.map((type) => (
          <Button key={type.id} variant="row" className="btn-start" data-base={type.id} onClick={() => onPick(type)}>
            <span className="deck-name">
              {type.name}
              {type.description ? <span className="row-sub">{type.description}</span> : null}
              <span className="row-sub">{typeSummary(type)}</span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
