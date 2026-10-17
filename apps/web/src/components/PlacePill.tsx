import { isBurned, isNew, type CardPlace, type SrsType } from "@panki/contracts";
import { placeName, placeTint } from "../srsKinds";

type Props = {
  type: Pick<SrsType, "stages" | "after" | "burnedName">;
  place: CardPlace;
  className?: string;
};

/** Where a card stands, as a small pill: New, its stage in the stage's colour (with "· again" inside an ask-again), or the end. */
export function PlacePill({ type, place, className = "" }: Props) {
  const kind = isNew(place) ? "is-new" : isBurned(type, place) ? "is-done" : "";
  return (
    <span className={`pill ${kind} ${className}`.trim()} style={placeTint(type, place)} data-place={placeName(type, place)}>
      {placeName(type, place)}
      {place.node.length > 0 ? " · again" : ""}
    </span>
  );
}
