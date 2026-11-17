/** @panki Cards as rows (`CardList`), and a card's row wherever one is drawn, what a search found lit (`cardRowCells`). Never a second drawing of a card's row. */
import { useId, useRef, useState, type ReactNode } from "react";
import { MediaId, byAi, examplesSentences, holdsExamples, holdsFile, holdsPitch, holdsWords, metaOf, pitchesOf, searchWords, type CalledCard, type Card, type CardField, type CardType, type LitRun, type SrsType } from "@panki/contracts";
import { api } from "../api";
import { lightingOf, type Lighting } from "../cardSearch";
import { AiSpark } from "./AiWaiting";
import { fileKindOf, kindClass } from "../fieldKinds";
import { FLAG_WORDS, HOLD_KINDS, dueWords } from "../srsKinds";
import { count, langOf } from "../words";
import { Ask } from "./Ask";
import { Button } from "./Button";
import { DELETE_CARD } from "./CardForm";
import { FlagTag } from "./FlagTag";
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
  /** When given, each row carries an edit button that opens its card's form under it, or closes it again. */
  onEdit?: (card: Card) => void;
  /** When given, each row carries a delete button under the edit one, which asks in a small panel hanging from it before the card goes. */
  onRemove?: (card: Card) => Promise<void>;
  /** When given, a card put aside (buried or suspended) carries a button among its tools that brings it back, where Suspend stands otherwise. */
  onLift?: (card: Card) => Promise<void>;
  /** When given, each row not put aside carries a suspend button among its tools. */
  onSuspend?: (card: Card) => Promise<void>;
  /** When given, each row carries Flag among its tools, Unflag on one that's flagged: the card flagged or not, as asked. */
  onFlag?: (card: Card, flagged: boolean) => Promise<void>;
  /** The card that's open, and the form that changes it, drawn in its row under all of it. */
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
  /** What the list was searched for: each row lights what was found, as the search palette does (`cardRowCells`). */
  searched?: string;
};

/** A card's duplicates as its row says them: "Duplicate" when one is in its own deck, else where they are. */
function twinWords(card: Card, twins: readonly CalledCard[]): string {
  if (twins.some((twin) => twin.deckId === card.deckId)) return "Duplicate";
  const decks = [...new Set(twins.map((twin) => twin.deck))];
  return decks.length === 1 ? `Also in ${decks[0]}` : `Also in ${decks.length} decks`;
}

/**
 * How a row draws a card's values somewhere else (a search's results): `light` draws its words, the parts found lit;
 * `still`, files and links are left out, as nothing on the row is pressed but the row itself.
 */
export type CellLook = { light?: (words: string) => ReactNode; still?: boolean };

/** One of a card's values on its row: words in the given style, a file as a chip that plays it or a thumbnail, or a link as a chip that opens it. Nothing when it's empty. */
export function cardCell(card: Card, field: CardField, className: string, { light, still = false }: CellLook = {}) {
  const value = card.values[field.id] ?? "";
  if (!value) return null;
  const file = fileKindOf(field.kind, value, card.files);
  if (file) return still ? null : <MediaView key={field.id} kind={file} src={api.mediaUrl(value)} label={field.name} player={field.id} size="row" />;
  // A file's id with no file behind it says nothing to anyone: it's left out rather than shown as words.
  if (holdsFile(field.kind) && MediaId.safeParse(value).success) return null;
  const meta = metaOf(field.kind, value);
  if (meta) return still ? null : <LinkView key={field.id} meta={meta} label={field.name} size="row" />;
  // A pitch accent drawn over its reading, when the value reads as one.
  if (holdsPitch(field.kind) && pitchesOf(value).length > 0) {
    return (
      <span key={field.id} className={className}>
        <PitchAccents value={value} />
      </span>
    );
  }
  // Example sentences as their sentences alone, one after another.
  const words = holdsExamples(field.kind) ? examplesSentences(value).join(" / ") : value;
  if (!words) return null;
  // What Panki AI wrote is in the AI's ink; the row carries its spark once, at its top right (`aiOn`).
  return (
    <span key={field.id} className={`${className} ${kindClass(field.kind)} ${byAi(card.sources, field.id) ? "is-ai" : ""}`.replace(/\s+/g, " ").trim()} lang={langOf(words)}>
      {light ? light(words) : words}
    </span>
  );
}

/** How far into a value its first lit part can stand before the line it's shown on starts near it instead, and how much comes before it then. */
const FOUND_LEAD = 24;
const FOUND_BEFORE = 10;

/** Words drawn as runs, the found ones lit. */
const litWords = (runs: readonly LitRun[]): ReactNode =>
  runs.map((run, i) =>
    run.lit ? (
      <mark key={i} className="search-lit">
        {run.text}
      </mark>
    ) : (
      run.text
    ),
  );

/** Runs starting near their first lit part when it stands far in, "…" before them. */
function nearFound(runs: readonly LitRun[]): LitRun[] {
  let at = 0;
  for (const run of runs) {
    if (run.lit) break;
    at += run.text.length;
  }
  if (at <= FOUND_LEAD) return [...runs];
  let skip = at - FOUND_BEFORE;
  const out: LitRun[] = [{ text: "…", lit: false }];
  for (const run of runs) {
    if (skip >= run.text.length) {
      skip -= run.text.length;
      continue;
    }
    out.push({ text: run.text.slice(skip), lit: run.lit });
    skip = 0;
  }
  return out;
}

/**
 * A card as a row draws it, wherever cards are drawn as rows (a deck's list, the search palette): its front fields (the
 * first that holds words big), its back fields, and, searched (`lighting`), what was found lit, with a line saying where
 * it was found when none of what's drawn shows it (another example, a translation). `still`: files and links left out.
 */
export function cardRowCells(card: Card, type: CardType, { lighting = null, still = false }: { lighting?: Lighting | null; still?: boolean } = {}) {
  // Whether what's drawn of the card shows anything found.
  let shownLit = false;
  const light = lighting
    ? (words: string) => {
        const runs = lighting.runs(words);
        if (runs.some((run) => run.lit)) shownLit = true;
        return litWords(runs);
      }
    : undefined;
  const look: CellLook = light ? { light, still } : { still };
  const front = type.fields.filter((f) => f.side === "front");
  const lead = front.find((f) => holdsWords(f.kind));
  const frontCells = front.map((field) => cardCell(card, field, field.id === lead?.id ? "card-word" : "card-front", look));
  const backCells = type.fields.filter((f) => f.side === "back").map((field) => cardCell(card, field, "card-back", look));
  const foundIn = lighting && !shownLit ? lighting.foundIn : null;
  const found =
    lighting && foundIn !== null ? (
      <p className="search-found" lang={langOf(foundIn)}>
        {litWords(nearFound(lighting.runs(foundIn)))}
      </p>
    ) : null;
  return { front: frontCells, back: backCells, found };
}

/** Whether anything on a card's row is Panki AI's: the row then carries the spark once. */
export const aiOn = (card: Card, type: CardType) => type.fields.some((field) => (card.values[field.id] ?? "") !== "" && byAi(card.sources, field.id));

/**
 * Cards as rows: the front fields on the first line, the first one that holds words big; the back fields under them; a
 * file where its field stands; at the top right the card's place and when it's next reviewed, then its tools one under
 * another, where cards can be changed: Preview, Edit, Flag, Suspend, Delete, held to the row's top. Delete asks in a
 * small panel hanging from it before the card goes, the row tinted while it does; Flag and Suspend don't, as Unflag and Unsuspend, standing
 * in their place once they're done, take them back at once. A card that's open has its form under it, as a preview is (Edit
 * pressed again closes it, as Preview does). A card put aside says so where its next review
 * would be, with Unsnooze or Unsuspend where Suspend stands; a suspended one is tinted red whole. A flagged one says so
 * under where it stands, its schedule as it was, and is tinted in the highlighter's yellow, unless it's suspended too,
 * whose red it keeps.
 */
export function CardList({ cards, type, srsType, title, empty = null, onEdit, onRemove, onLift, onSuspend, onFlag, editing = null, onPreview, previewing = null, tools = null, twins = {}, onTwins, filter = null, searched = "" }: Props) {
  const words = searchWords(searched);
  const titleId = useId();
  /** The card whose row is asking whether to delete it, how that's going, and why it didn't. */
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const deleteAt = useRef<HTMLButtonElement>(null);
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
  /** The card being suspended, flagged or brought back, and why the last one wasn't. */
  const [holding, setHolding] = useState<string | null>(null);
  const [holdFailure, setHoldFailure] = useState<{ cardId: string; message: string } | null>(null);
  async function hold(card: Card, change: ((card: Card) => Promise<void>) | undefined) {
    if (!change) return;
    setHolding(card.id);
    setHoldFailure(null);
    try {
      await change(card);
    } catch (e) {
      setHoldFailure({ cardId: card.id, message: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setHolding(null);
    }
  }
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
            const itsTwins = twins[card.id] ?? [];
            const twin = itsTwins.length > 0 ? twinWords(card, itsTwins) : null;
            const when = srsType ? dueWords(srsType, card, now) : null;
            const ai = aiOn(card, type);
            const flagged = card.flaggedAt !== null;
            const state = srsType || twin || card.examples.length > 0 || ai || flagged;
            const tooled = onEdit || onRemove || onPreview || onSuspend || onFlag;
            const tint = card.hold?.kind === "suspend" ? "is-suspended" : flagged ? "is-flagged" : "";
            const cells = cardRowCells(card, type, { lighting: words.length > 0 ? lightingOf(card, words, { type, srsType }) : null });
            return (
              <li
                key={card.id}
                className={`card-row ${state ? "has-state" : ""} ${tooled ? "has-tools" : ""} ${tint} ${asking === card.id ? "is-asking" : ""}`.replace(/\s+/g, " ").trim()}
              >
                <div className="card-row-ja">{cells.front}</div>
                <div className="card-meaning">{cells.back}</div>
                {cells.found}
                {state ? (
                  <div className="card-state">
                    {srsType || ai ? (
                      <span className="card-state-top">
                        {ai ? <AiSpark className="card-ai" /> : null}
                        {srsType ? <PlacePill type={srsType} place={card.place} /> : null}
                      </span>
                    ) : null}
                    {srsType && when !== null ? <span className={`due ${card.due ? "is-now" : ""}`.trim()}>{when}</span> : null}
                    {flagged ? <FlagTag /> : null}
                    {/* Its own example and each one added to it. */}
                    {card.examples.length > 0 ? <span className="card-example-count">{count(card.examples.length + 1, "example", "examples")}</span> : null}
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
                {tooled ? (
                  <div className="card-tools">
                    {/* Each with its word beside its icon. */}
                    {onPreview ? (
                      <Button className="card-tool" aria-pressed={previewing?.id === card.id} onClick={() => onPreview(card)}>
                        <Icon name="eye" />
                        Preview
                      </Button>
                    ) : null}
                    {onEdit ? (
                      <Button className="card-tool" aria-pressed={editing?.id === card.id} onClick={() => onEdit(card)}>
                        <Icon name="edit" />
                        Edit
                      </Button>
                    ) : null}
                    {/* One place for both: Unflag on a flagged card, Flag on the rest. */}
                    {onFlag ? (
                      <Button className="card-tool" disabled={holding === card.id} onClick={() => void hold(card, (c) => onFlag(c, !flagged))}>
                        <Icon name={FLAG_WORDS.icon} />
                        {flagged ? FLAG_WORDS.lift : FLAG_WORDS.set}
                      </Button>
                    ) : null}
                    {/* One place for both: Unsuspend (or Unsnooze) on a card put aside, Suspend on the rest. */}
                    {card.hold && onLift ? (
                      <Button className="card-tool" disabled={holding === card.id} onClick={() => void hold(card, onLift)}>
                        <Icon name="wake" />
                        {HOLD_KINDS[card.hold.kind].lift}
                      </Button>
                    ) : !card.hold && onSuspend ? (
                      <Button className="card-tool" disabled={holding === card.id} onClick={() => void hold(card, onSuspend)}>
                        <Icon name={HOLD_KINDS.suspend.icon} />
                        Suspend
                      </Button>
                    ) : null}
                    {onRemove ? (
                      <Button
                        ref={asking === card.id ? deleteAt : undefined}
                        className="card-tool is-danger"
                        aria-pressed={asking === card.id}
                        aria-expanded={asking === card.id}
                        disabled={busy}
                        onClick={() => ask(asking === card.id ? null : card.id)}
                      >
                        <Icon name="trash" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {previewing?.id === card.id ? <div className="card-preview-row">{previewing.view}</div> : null}
                {editing?.id === card.id ? <div className="card-preview-row card-edit-row">{editing.form}</div> : null}
                {holdFailure?.cardId === card.id ? (
                  <p className="load-error card-lift-error" role="alert">
                    {holdFailure.message}
                  </p>
                ) : null}
                {asking === card.id ? (
                  <Ask
                    idPrefix={`card-${card.id}-delete`}
                    anchor={deleteAt}
                    question={DELETE_CARD.question(type, card)}
                    go={DELETE_CARD.go}
                    busy={busy}
                    failure={failure}
                    onKeep={() => ask(null)}
                    onGo={() => void remove(card)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
