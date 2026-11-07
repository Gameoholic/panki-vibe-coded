import { isNew, placeColour, type CalledCard, type CardPlace, type SrsType } from "@panki/contracts";
import { NEW_WORDS, placeName, tintOf } from "../srsKinds";

type Props = {
  type: Pick<SrsType, "stages" | "after" | "burnedName">;
  place: CardPlace;
  className?: string;
};

/** Where a card stands, as a small pill: New, its stage in the stage's colour (with "· again" inside an ask-again), or the end in its grey. */
export function PlacePill({ type, place, className = "" }: Props) {
  const colour = placeColour(type, place);
  return <StagePill stage={colour === null ? null : { name: placeName(type, place), colour, again: place.node.length > 0 }} again={isNew(place) && place.node.length > 0} className={className} />;
}

/**
 * The same pill from where a card stands as told without its type (`CalledCard.stage`, the API's): the stage's name in
 * its colour, or New for null. `again` is a new card's own ask-again, which `stage` can't carry.
 */
export function StagePill({ stage, again = false, className = "" }: { stage: NonNullable<CalledCard["stage"]> | null; again?: boolean; className?: string }) {
  const name = stage?.name ?? NEW_WORDS.name;
  return (
    <span className={`pill ${stage ? "" : "is-new"} ${className}`.replace(/\s+/g, " ").trim()} style={stage ? tintOf(stage.colour) : undefined} data-place={name}>
      {name}
      {(stage?.again ?? again) ? " · again" : ""}
    </span>
  );
}
