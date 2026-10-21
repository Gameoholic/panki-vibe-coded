import { Fragment, useId, useState, type ReactNode } from "react";
import {
  CardUpdate,
  MEDIA_ENDINGS,
  MEDIA_MAX_BYTES,
  NewCard,
  VALUE_MAX,
  cardProblems,
  holdsFile,
  mediaFor,
  mediaKindsOf,
  wordsFieldOf,
  type CalledCard,
  type Card,
  type CardProblem,
  type CardType,
  type MediaKind,
} from "@panki/contracts";
import { api } from "../api";
import { FIELD_KINDS, fileKindOf } from "../fieldKinds";
import { useCalled } from "../hooks/useCalled";
import { langOf, listWords } from "../words";
import { AlreadyIn } from "./AlreadyIn";
import { Ask } from "./Ask";
import { Button } from "./Button";
import { Form } from "./Form";
import { MediaField } from "./MediaField";
import { TextField } from "./TextField";

const MB = 1024 * 1024;

/** What a field says when it's wrong. One home. */
const MESSAGES = {
  missing: (field: string) => `Fill in the ${field}.`,
  long: (field: string) => `Keep the ${field} under ${VALUE_MAX} characters.`,
  noFile: (field: string) => `Choose a file for the ${field}.`,
  notLink: "That isn't a YouTube link.",
  notTaken: (kinds: readonly MediaKind[]) => `That file won't work here. Panki takes ${listWords([...new Set(kinds.flatMap((kind) => MEDIA_ENDINGS[kind]))])}.`,
  heavy: (kind: MediaKind) => `That file is over ${MEDIA_MAX_BYTES[kind] / MB} MB.`,
  empty: "That file is empty.",
};

/** Deleting a card, asked in place (`Ask`) wherever it's done: on its row, and in its form. One home for the words. */
export const DELETE_CARD = {
  /** "Delete “行く”?": the card by the field it's called by, or "this card" when that's empty. */
  question: (type: CardType, card: Card) => {
    const lead = wordsFieldOf(type);
    const named = lead ? (card.values[lead.id] ?? "").trim() : "";
    return `Delete ${named ? `“${named}”` : "this card"}?`;
  },
  go: { words: "Delete card", busy: "Deleting…" },
};

/** A file picked for a field: the id it will be kept under (minted here, so sending it twice is harmless), what it is and the type it's sent as. */
type Picked = { id: string; file: File; kind: MediaKind; mime: string };

type Shared = {
  /** The deck's card type: it says which fields the form has, what each holds, and which must be filled. */
  type: CardType;
  autoFocus?: boolean;
  /** When given, a Cancel button closes the form. */
  onCancel?: () => void;
  /** Anything that belongs above the fields, like the deck chooser on the Add screen. */
  children?: ReactNode;
};
/**
 * Adding: the form starts empty and stays open after a card is added, for the next one. While what's typed in the field
 * a card is called by is what a card already holds, it says so under it (`AlreadyIn`); `onOpenCalled` opens that card.
 */
type Adding = Shared & { card?: undefined; onAdd: (card: NewCard) => Promise<void>; onOpenCalled?: (card: CalledCard) => void };
/** Changing a card that's there: the form starts from what it holds, saves only what differs, and can delete it. */
type Editing = Shared & { card: Card; onSave: (update: CardUpdate) => Promise<void>; onRemove: () => Promise<void> };
type Props = Adding | Editing;

/** What a card holds, as the form starts from it: the words to type over, and the ids of the files in its fields of files. */
function startFrom(type: CardType, card: Card) {
  const words: Record<string, string> = {};
  const files: Record<string, string> = {};
  for (const field of type.fields) {
    const value = card.values[field.id] ?? "";
    if (!holdsFile(field.kind)) words[field.id] = value;
    else if (fileKindOf(field.kind, value, card.files)) files[field.id] = value;
  }
  return { words, files };
}

/** Only what differs from the card as it stands, so a save changes (and keeps the history of) nothing it didn't touch. */
function changedFrom(type: CardType, card: Card, values: Record<string, string>): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const field of type.fields) {
    const now = values[field.id] ?? "";
    const before = card.values[field.id] ?? "";
    // Words still in a field from before it held files aren't a file to take off: left alone, they stay.
    const was = holdsFile(field.kind) && fileKindOf(field.kind, before, card.files) === null ? "" : before;
    if (now !== was) changed[field.id] = now;
  }
  return changed;
}

/**
 * A card's fields as a form, one per field of the type, each saying what's wrong in the app's words. Without a card it
 * is the "Add a card" panel: Enter adds it. With one it changes that card, and deletes it after asking in place.
 */
export function CardForm(props: Props) {
  const { type, autoFocus = false, onCancel, children } = props;
  const card = props.card;
  // Two of these can be on one screen (the add form above the list, a card open in it): each names its fields apart.
  const formId = useId();
  const inputId = (fieldId: string) => `${formId}-${fieldId}`;
  const [draft, setDraft] = useState<Record<string, string>>(() => (card ? startFrom(type, card).words : {}));
  /** The files the card already holds, by field, until one is replaced or taken off. */
  const [kept, setKept] = useState<Record<string, string>>(() => (card ? startFrom(type, card).files : {}));
  const [picks, setPicks] = useState<Record<string, Picked>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const first = type.fields[0];
  /** The field the card is called by: a card being added says under it when one is already called so. */
  const lead = card ? null : wordsFieldOf(type);
  const called = useCalled(lead ? [draft[lead.id] ?? ""] : [], api.cardsCalled);
  const onOpenCalled = "onAdd" in props ? props.onOpenCalled : undefined;

  function focusField(fieldId: string) {
    document.getElementById(inputId(fieldId))?.focus();
  }

  function edit(fieldId: string, value: string) {
    setDraft((d) => ({ ...d, [fieldId]: value }));
    if (errors[fieldId]) setErrors((e) => ({ ...e, [fieldId]: "" }));
  }

  const without = <T,>(record: Record<string, T>, fieldId: string) => Object.fromEntries(Object.entries(record).filter(([id]) => id !== fieldId));

  /** A file chosen for a field, or the one showing taken off it. One Panki doesn't take is said under the field and what was there stays. */
  function pick(fieldId: string, kinds: readonly MediaKind[], file: File | null) {
    if (!file) {
      setPicks((p) => without(p, fieldId));
      setKept((k) => without(k, fieldId));
      setErrors((e) => ({ ...e, [fieldId]: "" }));
      return;
    }
    // A field of media takes a clip or a sound: which one this is, is the file's own to say.
    const as = mediaFor(kinds, file.type, file.name);
    const problem = as === null ? MESSAGES.notTaken(kinds) : file.size === 0 ? MESSAGES.empty : file.size > MEDIA_MAX_BYTES[as.kind] ? MESSAGES.heavy(as.kind) : "";
    setErrors((e) => ({ ...e, [fieldId]: problem }));
    if (as === null || problem) return;
    setPicks((p) => ({ ...p, [fieldId]: { id: crypto.randomUUID(), file, ...as } }));
    // The new file takes the old one's place: taking it off again leaves the field empty.
    setKept((k) => without(k, fieldId));
  }

  async function submit() {
    // While the question about deleting is up, Enter in a field answers nothing.
    if (asking) return;
    // A field of files holds its file's id; a file just picked goes to Panki first, below.
    const values: Record<string, string> = {};
    for (const field of type.fields) values[field.id] = holdsFile(field.kind) ? (picks[field.id]?.id ?? kept[field.id] ?? "") : (draft[field.id] ?? "").trim();
    // Words still in a field from before it held links are no fault of a save that leaves them as they are.
    const leftAlone = (problem: CardProblem) => problem.problem === "link" && card !== undefined && values[problem.fieldId] === (card.values[problem.fieldId] ?? "");
    const problems = cardProblems(type, values).filter((problem) => !leftAlone(problem));
    if (problems.length > 0) {
      const next: Record<string, string> = {};
      for (const problem of problems) {
        const field = type.fields.find((f) => f.id === problem.fieldId);
        if (!field || next[field.id]) continue;
        next[field.id] =
          problem.problem === "long" ? MESSAGES.long(field.name) : problem.problem === "link" ? MESSAGES.notLink : holdsFile(field.kind) ? MESSAGES.noFile(field.name) : MESSAGES.missing(field.name);
      }
      setErrors(next);
      const firstWrong = type.fields.find((f) => next[f.id]);
      if (firstWrong) focusField(firstWrong.id);
      return;
    }
    setBusy(true);
    setFailure(null);
    // Nothing is wrong with the card as it stands: a file refused earlier, with a good one still picked, is no longer news.
    setErrors({});
    try {
      for (const field of type.fields) {
        const picked = holdsFile(field.kind) ? picks[field.id] : undefined;
        if (!picked) continue;
        try {
          await api.uploadMedia(picked.id, picked.mime, picked.file);
        } catch (e) {
          // The file's own trouble is said under its field, and nothing is saved without it.
          setErrors((prev) => ({ ...prev, [field.id]: e instanceof Error ? e.message : "Something went wrong." }));
          focusField(field.id);
          return;
        }
      }
      if ("onSave" in props) {
        await props.onSave(CardUpdate.parse({ values: changedFrom(type, props.card, values) }));
        return;
      }
      await props.onAdd(NewCard.parse({ id: crypto.randomUUID(), values }));
      setDraft({});
      setPicks({});
      if (first) focusField(first.id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!("onRemove" in props)) return;
    setBusy(true);
    setFailure(null);
    try {
      await props.onRemove();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const failed = failure ? (
    <span className="form-failure" role="alert">
      {failure}
    </span>
  ) : null;

  return (
    <section className={`panel ${asking ? "panel-alarm" : ""}`.trim()} aria-labelledby={`${formId}-title`}>
      <h2 id={`${formId}-title`} className="panel-title">
        {card ? "Edit card" : "Add a card"}
      </h2>
      <Form onSubmit={submit} className="add-form">
        {children}
        {type.fields.map((field) => {
          const label = field.required ? field.name : `${field.name} · optional`;
          const kinds = mediaKindsOf(field.kind);
          if (kinds.length > 0) {
            const held = kept[field.id];
            const picked = picks[field.id];
            return (
              <MediaField
                key={field.id}
                id={inputId(field.id)}
                label={label}
                kinds={kinds}
                kind={picked?.kind ?? (held ? (card?.files[held] ?? null) : null)}
                file={picked?.file ?? null}
                held={held ? api.mediaUrl(held) : undefined}
                onPick={(file) => pick(field.id, kinds, file)}
                error={errors[field.id] || undefined}
              />
            );
          }
          const value = draft[field.id] ?? "";
          return (
            <Fragment key={field.id}>
              <TextField
                id={inputId(field.id)}
                data-field={field.name}
                label={label}
                multiline={FIELD_KINDS[field.kind].multiline}
                lang={langOf(value)}
                autoComplete="off"
                autoFocus={autoFocus && field.id === first?.id}
                value={value}
                onChange={(text) => edit(field.id, text)}
                error={errors[field.id] || undefined}
              />
              {field.id === lead?.id ? <AlreadyIn cards={called} onOpen={onOpenCalled} /> : null}
            </Fragment>
          );
        })}
        {asking && card ? (
          <Ask
            idPrefix={`${formId}-delete`}
            question={DELETE_CARD.question(type, card)}
            go={DELETE_CARD.go}
            busy={busy}
            failure={failure}
            onKeep={() => setAsking(false)}
            onGo={() => void remove()}
          />
        ) : (
          <div className="add-actions">
            {card ? (
              <Button className="is-danger card-delete" onClick={() => setAsking(true)} disabled={busy}>
                Delete…
              </Button>
            ) : null}
            {failed}
            {onCancel ? (
              <Button onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" variant="primary" disabled={busy}>
              {card ? (busy ? "Saving…" : "Save") : busy ? "Adding…" : "Add card"}
            </Button>
          </div>
        )}
      </Form>
    </section>
  );
}
