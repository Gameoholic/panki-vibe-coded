import { useId, useState, type ReactNode } from "react";
import { MediaId, holdsFile, holdsPitch, holdsWords, metaOf, pitchesOf, type CalledCard, type Card, type CardField, type CardType, type SrsType } from "@panki/contracts";
import { api } from "../api";
import { fileKindOf, kindClass } from "../fieldKinds";
import { HOLD_KINDS, dueWords } from "../srsKinds";
import { count, langOf } from "../words";
import { Ask } from "./Ask";
import { Button } from "./Button";
import { DELETE_CARD } from "./CardForm";
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
  /** When given, each row carries a delete button under the edit one, which asks in the row before the card goes. */
  onRemove?: (card: Card) => Promise<void>;
  /** When given, a card put aside (buried or suspended) carries a button under its state that brings it back. */
  onLift?: (card: Card) => Promise<void>;
  /** The card that's open, and what stands in its row's place while it is (the form that changes it). */
  editing?: { id: string; form: ReactNode } | null;
  /** When given, each row carries a Preview button that asks for its card to be shown as a review would show it. */
  onPreview?: (card: Card) => void;
  /** The card being previewed, and the preview, drawn in its row under all of it (`CardPreview`). */
  previewing?: { id: string; view: ReactNode } | null;
  /** What sits at the right of the title: how the list is sorted, in a deck. */
  tools?: ReactNode;
  /** Each card's duplicates (`api.deckTwins`), by its id: a card that has some says so at its top right. */
  twins?: Record<string, readonly CalledCard[]>;
  /** When given, what a card says of its duplicates is a button: pressed, the list shows only the cards called the same. */
  onTwins?: (card: Card) => void;
  /** What stands between the title and the rows: which cards alone are being shown, and the way back to all. */
  filter?: ReactNode;
};

/** A card's duplicates as its row says them: "Duplicate" when one is in its own deck, else where they are. */
function twinWords(card: Card, twins: readonly CalledCard[]): string {
  if (twins.some((twin) => twin.deckId === card.deckId)) return "Duplicate";
  const decks = [...new Set(twins.map((twin) => twin.deck))];
  return decks.length === 1 ? `Also in ${decks[0]}` : `Also in ${decks.length} decks`;
}

/** One of a card's values on its row: words in the given style, a file as a chip that plays it or a thumbnail, or a link as a chip that opens it. Nothing when it's empty. */
function cell(card: Card, field: CardField, className: string) {
  const value = card.values[field.id] ?? "";
  if (!value) return null;
  const file = fileKindOf(field.kind, value, card.files);
  if (file) return <MediaView key={field.id} kind={file} src={api.mediaUrl(value)} label={field.name} size="row" />;
  // A file's id with no file behind it says nothing to anyone: it's left out rather than shown as words.
  if (holdsFile(field.kind) && MediaId.safeParse(value).success) return null;
  const meta = metaOf(field.kind, value);
  if (meta) return <LinkView key={field.id} meta={meta} label={field.name} size="row" />;
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
 * file where its field stands; at the top right the card's place and due time, then edit with delete under it, where
 * cards can be changed (the owner, 2026-10-18: deleting was only inside the opened card, "make deleting easier… the
 * delete button should be directly below the pencil"; and everything at the right sat halfway down the row). Delete
 * asks in the row itself before the card goes. A card that's open is its form, in the row's own place in the list. A
 * card put aside says so where its due time would be, with Unsnooze or Unsuspend under it.
 */
export function CardList({ cards, type, srsType, title, empty = null, onEdit, onRemove, onLift, editing = null, onPreview, previewing = null, tools = null, twins = {}, onTwins, filter = null }: Props) {
  const titleId = useId();
  /** The card whose row is asking whether to delete it, how that's going, and why it didn't. */
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  function ask(cardId: string | null) {
    setAsking(cardId);
    setFailure(null);
  }
  async function remove(card: Card) {
    if (!onRemove) return;
    setBusy(true);
    setFailure(null);
    try {
      await onRemove(card);
      setAsking(null);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  /** The card being brought back, and why the last one wasn't. */
  const [lifting, setLifting] = useState<string | null>(null);
  const [liftFailure, setLiftFailure] = useState<{ cardId: string; message: string } | null>(null);
  async function lift(card: Card) {
    if (!onLift) return;
    setLifting(card.id);
    setLiftFailure(null);
    try {
      await onLift(card);
    } catch (e) {
      setLiftFailure({ cardId: card.id, message: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setLifting(null);
    }
  }
  const front = type.fields.filter((f) => f.side === "front");
  const back = type.fields.filter((f) => f.side === "back");
  const lead = front.find((f) => holdsWords(f.kind));
  const now = Date.now();
  const heading = (
    <h2 id={titleId} className="list-title">
      {title}
    </h2>
  );
  return (
    <section aria-labelledby={titleId}>
      {tools ? (
        <div className="list-head">
          {heading}
          {tools}
        </div>
      ) : (
        heading
      )}
      {filter}
      {cards.length === 0 ? (
        empty
      ) : (
        <ul className="card-list">
          {cards.map((card) => {
            if (editing?.id === card.id) return <li key={card.id}>{editing.form}</li>;
            const itsTwins = twins[card.id] ?? [];
            const twin = itsTwins.length > 0 ? twinWords(card, itsTwins) : null;
            const when = srsType ? dueWords(srsType, card, now) : null;
            return (
              <li
                key={card.id}
                className={`card-row ${srsType || twin || card.examples.length > 0 ? "has-state" : ""} ${onEdit || onRemove || onPreview ? "has-tools" : ""} ${asking === card.id ? "is-asking" : ""}`.replace(/\s+/g, " ").trim()}
              >
                <div className="card-row-ja">{front.map((field) => cell(card, field, field.id === lead?.id ? "card-word" : "card-front"))}</div>
                <div className="card-meaning">{back.map((field) => cell(card, field, "card-back"))}</div>
                {srsType || twin || card.examples.length > 0 ? (
                  <div className="card-state">
                    {srsType ? (
                      <>
                        <PlacePill type={srsType} place={card.place} />
                        {when === null ? null : <span className={`due ${card.due ? "is-now" : ""}`.trim()}>{when}</span>}
                      </>
                    ) : null}
                    {/* Its own example and each one added to it. */}
                    {card.examples.length > 0 ? <span className="card-example-count">{count(card.examples.length + 1, "example", "examples")}</span> : null}
                    {card.hold && onLift ? (
                      <Button variant="chip" className="card-lift" disabled={lifting === card.id} onClick={() => void lift(card)}>
                        <Icon name="wake" />
                        {HOLD_KINDS[card.hold.kind].lift}
                      </Button>
                    ) : null}
                    {twin && onTwins ? (
                      <Button className="card-twin" onClick={() => onTwins(card)}>
                        <Icon name="alert" className="is-sign" />
                        {twin}
                      </Button>
                    ) : twin ? (
                      <span className="card-twin">
                        <Icon name="alert" className="is-sign" />
                        {twin}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {onEdit || onRemove || onPreview ? (
                  <div className="card-tools">
                    {onEdit ? (
                      <Button className="btn-icon" aria-label="Edit card" onClick={() => onEdit(card)}>
                        <Icon name="edit" />
                      </Button>
                    ) : null}
                    {onRemove ? (
                      <Button className="btn-icon is-danger" aria-label="Delete card" aria-pressed={asking === card.id} disabled={busy} onClick={() => ask(asking === card.id ? null : card.id)}>
                        <Icon name="trash" />
                      </Button>
                    ) : null}
                    {onPreview ? (
                      <Button className="btn-icon" aria-label="Preview card" aria-pressed={previewing?.id === card.id} onClick={() => onPreview(card)}>
                        <Icon name="eye" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {previewing?.id === card.id ? <div className="card-preview-row">{previewing.view}</div> : null}
                {liftFailure?.cardId === card.id ? (
                  <p className="load-error card-lift-error" role="alert">
                    {liftFailure.message}
                  </p>
                ) : null}
                {asking === card.id ? (
                  <div className="card-ask">
                    <Ask
                      idPrefix={`card-${card.id}-delete`}
                      question={DELETE_CARD.question(type, card)}
                      go={DELETE_CARD.go}
                      busy={busy}
                      failure={failure}
                      onKeep={() => ask(null)}
                      onGo={() => void remove(card)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
