import { isNew, placeColour, type CalledCard, type CardPlace, type NewColoured, type SrsType } from "@panki/contracts";
import { NEW_WORDS, placeName, tintOf } from "../srsKinds";

type Props = {
  type: Pick<SrsType, "stages" | "after" | "burnedName"> & NewColoured;
  place: CardPlace;
  className?: string;
};

/**
 * Where a card stands, as a small pill: New (in its type's New colour when it has one, plain without), its stage in the
 * stage's colour (with "· again" inside an ask-again), or the end in its grey.
 */
export function PlacePill({ type, place, className = "" }: Props) {
  const colour = placeColour(type, place);
  if (isNew(place)) return <StagePill stage={null} newColour={colour} again={place.node.length > 0} className={className} />;
  return <StagePill stage={colour === null ? null : { name: placeName(type, place), colour, again: place.node.length > 0 }} className={className} />;
}

/**
 * The same pill from where a card stands as told without its type (`CalledCard.stage`, the API's): the stage's name in
 * its colour, or New for null, tinted by `newColour` when its type gives New one. `again` is a new card's own
 * ask-again, which `stage` can't carry.
 */
export function StagePill({ stage, newColour = null, again = false, className = "" }: { stage: NonNullable<CalledCard["stage"]> | null; newColour?: string | null; again?: boolean; className?: string }) {
  const name = stage?.name ?? NEW_WORDS.name;
  const colour = stage?.colour ?? newColour;
  return (
    <span className={`pill ${colour === null ? "is-new" : ""} ${className}`.replace(/\s+/g, " ").trim()} style={colour === null ? undefined : tintOf(colour)} data-place={name}>
      {name}
      {(stage?.again ?? again) ? " · again" : ""}
    </span>
  );
}
