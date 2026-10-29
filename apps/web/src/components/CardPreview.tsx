import { useMemo, useState } from "react";
import { NEW_PLACE, exampleShownOf, valuesWithExample, type Card, type CardField, type CardType, type Deck, type SrsType, type SubtitleStyle } from "@panki/contracts";
import { api } from "../api";
import { waveOf } from "../waveform";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Icon } from "./Icon";
import { ReviewCard } from "./ReviewCard";

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
  const named = (field: CardField) => field.name.trim().toLowerCase();
  const out: Record<string, string> = {};
  for (const field of to.fields) {
    const source = from.fields.find((f) => named(f) === named(field) && f.kind === field.kind);
    out[field.id] = source ? (values[source.id] ?? "") : "";
  }
  return out;
}

/**
 * One card as a review would show it in the deck picked (the owner, 2026-10-29: "see how they'd look like in a specific
 * deck, I get to choose which deck"): its own deck to begin with. In a deck of its own card type it's exactly that
 * deck's card, the example its Example shown picks; in another, the card type's fields take the values of this card's
 * fields of the same name and kind. Where it stands is its own in its own deck, and New in another. Turned by a press;
 * nothing plays by itself.
 */
export function CardPreview({ card, type, decks, types, srsTypes, subtitleStyle, onClose }: Props) {
  const [deckId, setDeckId] = useState(card.deckId);
  const [revealed, setRevealed] = useState(false);
  const deck = decks.find((d) => d.id === deckId) ?? null;
  const shownType = deck ? (deck.typeId === type.id ? type : (types.find((t) => t.id === deck.typeId) ?? null)) : null;
  const srsType = deck ? (srsTypes.find((s) => s.id === deck.srsTypeId) ?? null) : null;
  // The example the deck shows, picked once for each deck looked at, as a review picks it once each time the card comes up.
  const exampleId = useMemo(() => (deck && deck.typeId === type.id ? exampleShownOf(type, card, deck.settings.exampleShown, Math.random) : null), [deck, type, card]);
  const values = shownType === null ? {} : shownType.id === type.id ? valuesWithExample(type, card, exampleId) : carried(type, shownType, card.values);

  return (
    <div className="card-preview">
      <div className="card-preview-head">
        <Dropdown
          id={`card-${card.id}-preview-deck`}
          label="Deck"
          options={decks.map((d) => ({ id: d.id, label: d.name }))}
          value={deckId}
          onChange={(id) => {
            setDeckId(id);
            setRevealed(false);
          }}
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
          files={card.files}
          srsType={srsType}
          place={deckId === card.deckId ? card.place : NEW_PLACE}
          revealed={revealed}
          onPress={() => setRevealed((was) => !was)}
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
