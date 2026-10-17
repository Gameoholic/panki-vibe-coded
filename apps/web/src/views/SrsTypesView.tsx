import type { SrsType } from "@panki/contracts";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { typeSummary } from "../srsKinds";
import { count } from "../words";

type Props = {
  types: SrsType[];
  onOpen: (type: SrsType) => void;
};

/**
 * The SRS types as rows you press: the name, what it says about itself, the ladder in one line, and how many decks
 * use it. One list, the owner's own first; the ones that come with the app follow under a thin line, drawn quieter
 * and with a lock, since they're for looking at and copying.
 */
export function SrsTypesView({ types, onOpen }: Props) {
  const own = types.filter((t) => !t.builtin);
  const builtin = types.filter((t) => t.builtin);
  const row = (type: SrsType) => (
    <li key={type.id}>
      <Button variant="row" className={`srs-row ${type.builtin ? "is-builtin" : ""}`.trim()} onClick={() => onOpen(type)}>
        {type.builtin ? <Icon name="lock" /> : null}
        <span className="deck-name">
          {type.name}
          {type.description ? <span className="row-sub">{type.description}</span> : null}
          <span className="row-sub">{typeSummary(type)}</span>
        </span>
        <span className="deck-count">{count(type.deckCount, "deck", "decks")}</span>
      </Button>
    </li>
  );
  return (
    <section aria-labelledby="srs-types-title">
      <h2 id="srs-types-title" className="list-title">
        {count(types.length, "SRS type", "SRS types")}
      </h2>
      {own.length > 0 ? <ul className="deck-list">{own.map(row)}</ul> : null}
      {own.length > 0 && builtin.length > 0 ? <div className="list-rule" role="separator" /> : null}
      <ul className="deck-list">{builtin.map(row)}</ul>
    </section>
  );
}
