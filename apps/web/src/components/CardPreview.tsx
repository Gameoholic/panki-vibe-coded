import { useMemo, useState } from "react";
import { NEW_PLACE, exampleShownOf, sourcesWithExample, valuesWithExample, type Card, type CardField, type CardType, type Deck, type SrsType, type SubtitleStyle, type ValueSources } from "@panki/contracts";
import { api } from "../api";
import { waveOf } from "../waveform";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Icon } from "./Icon";
import { ReviewCard, listensFirst } from "./ReviewCard";

/** What's showing of the card: its Listen phase (its type's Listen first), its front, or its back. */
type Face = "listen" | "front" | "back";

type Props = {
  card: Card;
  /** The card's own card type. */
  type: CardType;
  /** Every deck the card can be seen in, its own among them, with the card types and SRS types they're drawn by. */
  decks: readonly Deck[];
  types: readonly CardType[];
  srsTypes: readonly SrsType[];
  subtitleStyle?: SubtitleStyle | undefined;
  onClose: () => void;
};

/** The words for a card that can't be drawn in the deck picked. One home. */
const MESSAGES = { missing: "That deck's card type or SRS type is missing." };

/**
 * A card's values as another card type would hold them: each of its fields takes the value of the card's field of the
 * same name and kind (names compared as written, ignoring case and the space around them), and is empty without one.
 */
function carried(from: CardType, to: CardType, values: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of to.fields) {
    const source = carriedFrom(from, field);
    out[field.id] = source ? (values[source.id] ?? "") : "";
  }
  return out;
}

/** The field of the card's own type a field of another type takes its value from: the same name and kind. */
function carriedFrom(from: CardType, field: CardField): CardField | undefined {
  const named = (f: CardField) => f.name.trim().toLowerCase();
  return from.fields.find((f) => named(f) === named(field) && f.kind === field.kind);
}

/** Where each carried value came from, the way `carried` carries the values, so what Panki AI wrote stays marked. */
function carriedSources(from: CardType, to: CardType, sources: ValueSources): ValueSources {
  const out: ValueSources = {};
  for (const field of to.fields) {
    const source = carriedFrom(from, field);
    const kept = source ? sources[source.id] : undefined;
    if (kept) out[field.id] = kept;
  }
  return out;
}

/**
 * One card as a review would show it in the deck picked: its own deck to begin with. In a deck of its own card type it's exactly that
 * deck's card, the example its Example shown picks; in another, the card type's fields take the values of this card's
 * fields of the same name and kind. Where it stands is its own in its own deck, and New in another. A card type with
 * Listen first opens it on its Listen phase, as a review does, and it shows its front as its sound or clip begins the play set to show it. Turned by a
 * press, round from its Listen phase to its back; nothing plays by itself.
 */
export function CardPreview({ card, type, decks, types, srsTypes, subtitleStyle, onClose }: Props) {
  const [deckId, setDeckId] = useState(card.deckId);
  const deck = decks.find((d) => d.id === deckId) ?? null;
  const shownType = deck ? (deck.typeId === type.id ? type : (types.find((t) => t.id === deck.typeId) ?? null)) : null;
  const srsType = deck ? (srsTypes.find((s) => s.id === deck.srsTypeId) ?? null) : null;
  // The example the deck shows, picked once for each deck looked at, as a review picks it once each time the card comes up.
  const exampleId = useMemo(() => (deck && deck.typeId === type.id ? exampleShownOf(type, card, deck.settings.exampleShown, Math.random) : null), [deck, type, card]);
  const values = shownType === null ? {} : shownType.id === type.id ? valuesWithExample(type, card, exampleId) : carried(type, shownType, card.values);
  /** Where it opens: its Listen phase in a deck whose card type listens first and with something to hear, else its front. */
  const opening: Face = shownType && listensFirst(shownType, values, card.files) ? "listen" : "front";
  // Held as the face chosen and the deck it was chosen in: another deck picked opens the card afresh.
  const [chosen, setFace] = useState<{ deckId: string; face: Face } | null>(null);
  const face = chosen && chosen.deckId === deckId ? chosen.face : opening;
  const turn = () => setFace({ deckId, face: face === "listen" ? "front" : face === "front" ? "back" : opening });

  return (
    <div className="card-preview">
      <div className="card-preview-head">
        <Dropdown
          id={`card-${card.id}-preview-deck`}
          label="Deck"
          options={decks.map((d) => ({ id: d.id, label: d.name }))}
          value={deckId}
          onChange={setDeckId}
        />
        <Button className="btn-icon" aria-label="Close the preview" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      {shownType && srsType ? (
        <ReviewCard
          key={deckId}
          type={shownType}
          values={values}
          // What Panki AI wrote stays marked: in its own card type's deck by field, carried into another with its value.
          sources={shownType.id === type.id ? sourcesWithExample(type, card, exampleId) : carriedSources(type, shownType, card.sources)}
          files={card.files}
          srsType={srsType}
          place={deckId === card.deckId ? card.place : NEW_PLACE}
          // The card's flag is its own, whichever deck it's seen in.
          flagged={card.flaggedAt !== null}
          revealed={face === "back"}
          listening={face === "listen"}
          onListened={() => setFace({ deckId, face: "front" })}
          onPress={turn}
          srcOf={api.mediaUrl}
          waveOf={waveOf}
          cues={card.cues}
          {...(subtitleStyle ? { subtitleStyle } : {})}
          picturesOf={api.videoPictures}
        />
      ) : (
        <p className="load-error" role="alert">
          {MESSAGES.missing}
        </p>
      )}
    </div>
  );
}
