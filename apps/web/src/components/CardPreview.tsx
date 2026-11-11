/** @panki A card seen as a review would show it, in a deck picked (`CardPreview`). */
import { useMemo, useState } from "react";
import { NEW_PLACE, exampleShownOf, sourcesWithExample, valuesWithExample, type Card, type CardField, type CardType, type Deck, type ExampleShown, type SrsType, type SubtitleStyle, type ValueSources } from "@panki/contracts";
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
  /** Which of the card's examples it's shown with, the account's Example shown. */
  exampleShown: ExampleShown;
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
 * deck's card, the example the account's Example shown picks; in another, the card type's fields take the values of this card's
 * fields of the same name and kind. Where it stands is its own in its own deck, and New in another. Its front is clear,
 * whatever its type marks to blur: it's looked at, not reviewed. Turned back and forth by a press; nothing plays by
 * itself.
 */
export function CardPreview({ card, type, decks, types, srsTypes, subtitleStyle, exampleShown, onClose }: Props) {
  const [deckId, setDeckId] = useState(card.deckId);
  const deck = decks.find((d) => d.id === deckId) ?? null;
  const shownType = deck ? (deck.typeId === type.id ? type : (types.find((t) => t.id === deck.typeId) ?? null)) : null;
  const srsType = deck ? (srsTypes.find((s) => s.id === deck.srsTypeId) ?? null) : null;
  // The example a review shows, picked once for each deck looked at, as a review picks it once each time the card comes up.
  const exampleId = useMemo(() => (deck && deck.typeId === type.id ? exampleShownOf(type, card, exampleShown, Math.random) : null), [deck, type, card, exampleShown]);
  const values = shownType === null ? {} : shownType.id === type.id ? valuesWithExample(type, card, exampleId) : carried(type, shownType, card.values);
  // Held as turned or not and the deck it was turned in: another deck picked opens the card afresh, on its front.
  const [turnedIn, setTurnedIn] = useState<{ deckId: string; back: boolean } | null>(null);
  const back = turnedIn !== null && turnedIn.deckId === deckId && turnedIn.back;
  const turn = () => setTurnedIn({ deckId, back: !back });

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
          revealed={back}
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
