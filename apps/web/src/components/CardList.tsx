import { useId, type ReactNode } from "react";
import { MediaId, holdsFile, holdsPitch, holdsWords, linkOf, pitchesOf, type Card, type CardField, type CardType, type SrsType } from "@panki/contracts";
import { api } from "../api";
import { fileKindOf, kindClass } from "../fieldKinds";
import { dueWords } from "../srsKinds";
import { langOf } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { LinkView } from "./LinkView";
import { MediaView } from "./MediaView";
import { PitchAccents } from "./PitchAccent";
import { PlacePill } from "./PlacePill";

type Props = {
  cards: Card[];
  /** The deck's card type: it says which values are the front of the card and which the back. */
  type: CardType;
  /** The deck's SRS type: when given, each row says where the card stands and when it comes back. */
  srsType?: SrsType;
  title: string;
  /** What shows instead of rows when there are no cards. */
  empty?: ReactNode;
  /** When given, each row carries an edit button that asks for its card to be opened. */
  onEdit?: (card: Card) => void;
  /** The card that's open, and what stands in its row's place while it is (the form that changes it). */
  editing?: { id: string; form: ReactNode } | null;
};

/** One of a card's values on its row: words in the given style, a file as a chip that plays it or a thumbnail, or a link as a chip that opens it. Nothing when it's empty. */
function cell(card: Card, field: CardField, className: string) {
  const value = card.values[field.id] ?? "";
  if (!value) return null;
  const file = fileKindOf(field.kind, value, card.files);
  if (file) return <MediaView key={field.id} kind={file} src={api.mediaUrl(value)} label={field.name} size="row" />;
  // A file's id with no file behind it says nothing to anyone: it's left out rather than shown as words.
  if (holdsFile(field.kind) && MediaId.safeParse(value).success) return null;
  const link = linkOf(field.kind, value);
  if (link) return <LinkView key={field.id} link={link} label={field.name} size="row" />;
  // A pitch accent drawn over its reading, when the value reads as one.
  if (holdsPitch(field.kind) && pitchesOf(value).length > 0) {
    return (
      <span key={field.id} className={className}>
        <PitchAccents value={value} />
      </span>
    );
  }
  return (
    <span key={field.id} className={`${className} ${kindClass(field.kind)}`.trim()} lang={langOf(value)}>
      {value}
    </span>
  );
}

/**
 * Cards as rows: the front fields on the first line, the first one that holds words big; the back fields under them; a
 * file where its field stands; the card's place and due time on the right, and an edit button where cards can be
 * changed. A card that's open is its form, in the row's own place in the list.
 */
export function CardList({ cards, type, srsType, title, empty = null, onEdit, editing = null }: Props) {
  const titleId = useId();
  const front = type.fields.filter((f) => f.side === "front");
  const back = type.fields.filter((f) => f.side === "back");
  const lead = front.find((f) => holdsWords(f.kind));
  const now = Date.now();
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="list-title">
        {title}
      </h2>
      {cards.length === 0 ? (
        empty
      ) : (
        <ul className="card-list">
          {cards.map((card) =>
            editing?.id === card.id ? (
              <li key={card.id}>{editing.form}</li>
            ) : (
              <li key={card.id} className={`card-row ${srsType ? "has-state" : ""} ${onEdit ? "has-tools" : ""}`.trim()}>
                <div className="card-row-ja">{front.map((field) => cell(card, field, field.id === lead?.id ? "card-word" : "card-front"))}</div>
                <div className="card-meaning">{back.map((field) => cell(card, field, "card-back"))}</div>
                {srsType ? (
                  <div className="card-state">
                    <PlacePill type={srsType} place={card.place} />
                    <span className={`due ${card.due ? "is-now" : ""}`.trim()}>{dueWords(srsType, card, now)}</span>
                  </div>
                ) : null}
                {onEdit ? (
                  <div className="card-tools">
                    <Button className="btn-icon" aria-label="Edit card" onClick={() => onEdit(card)}>
                      <Icon name="edit" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
