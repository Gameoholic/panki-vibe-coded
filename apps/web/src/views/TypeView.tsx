import { useEffect, useRef, useState } from "react";
import { NewCardType, holdsWords, wordsFieldOf, type CardField, type CardType, type NewCardType as NewCardTypeShape } from "@panki/contracts";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Form } from "../components/Form";
import { Setting } from "../components/Setting";
import { Icon } from "../components/Icon";
import { TextField } from "../components/TextField";
import { Toggle } from "../components/Toggle";
import { useDragOrder } from "../hooks/useDragOrder";
import { FIELD_KIND_OPTIONS } from "../fieldKinds";
import type { UnsavedGuard } from "../unsaved";
import { count } from "../words";
import type { SaveStatus } from "./SrsTypeView";

/** What a field says when it's wrong. One home. */
const MESSAGES = {
  name: "Give the type a name.",
  nameLong: "Keep the name under 100 characters.",
  field: "Give the field a name.",
  fieldLong: "Keep it under 60 characters.",
};

/** The Main field's choice of none, beside the fields' ids. */
const NO_MAIN = "none";

function nameInputId(fieldId: string) {
  return `field-name-${fieldId}`;
}

type Props = {
  /** The type being edited, or `null` to make a new one. */
  type: CardType | null;
  onSave: (type: NewCardTypeShape, isNew: boolean) => Promise<CardType>;
  onRemove: () => Promise<void>;
  /** Tells the header whether what's on screen is saved, and whether Save can be pressed. */
  onStatus: (status: SaveStatus) => void;
  /** Hands the app what it needs to ask before unsaved work is left, while there is some. */
  onGuard: (guard: UnsavedGuard | null) => void;
};

/** What's compared to say whether there are unsaved changes. */
const shapeOf = (name: string, fields: readonly CardField[], mainField: string | null) => JSON.stringify({ name, fields, mainField });

/**
 * A card type's fields: its name and its fields, each with a kind and whether it's required, in the order a form asks
 * for them; delete at the bottom, only when no deck uses it. Where each field stands on the card, front or back, and
 * how it looks is the type's Layout (`LayoutView`): a field added here starts on the back, under the rest. Saved as
 * the Layout and the SRS editor are, by Save in the header beside whether it's saved (the owner, 2026-10-18: "it
 * should be uniform"; a Save of its own at the bottom, which went back to the list, came first); leaving with unsaved
 * changes asks first. A new type is made by its first Save, and stays open with its Layout.
 */
export function TypeView({ type, onSave, onRemove, onStatus, onGuard }: Props) {
  const [id] = useState(() => type?.id ?? crypto.randomUUID());
  const [name, setName] = useState(type?.name ?? "");
  // A new type starts with one field on the front, because a card needs something there.
  const [fields, setFields] = useState<CardField[]>(() => type?.fields ?? [{ id: crypto.randomUUID(), name: "", kind: "text", side: "front", required: true, tellsApart: false, perExample: false }]);
  /** The field its cards are called by, as picked here: none until one is (the owner, 2026-10-25: never assumed). */
  const [mainField, setMainField] = useState<string | null>(type?.mainField ?? null);
  /** What's saved, to tell changes by; a new type's is how it starts, so an untouched one has nothing to lose. */
  const [saved, setSaved] = useState(() => shapeOf(name, fields, wordsFieldOf({ fields, mainField })?.id ?? null));
  const [isNew, setIsNew] = useState(type === null);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  /** The field whose Delete is asking first (the owner, 2026-10-29: taking something away is confirmed), if one is. */
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(nameInputId(focusId))?.focus();
    setFocusId(null);
  }, [focusId]);

  // The main field while it's still a field of words here (one hidden, or changed to a file, is none).
  const called = wordsFieldOf({ fields, mainField });
  const dirty = shapeOf(name, fields, called?.id ?? null) !== saved;
  // A new type isn't saved until its first Save, touched or not.
  const state: SaveStatus["state"] = saving ? "saving" : failure ? "failed" : dirty || isNew ? "unsaved" : "saved";
  const shownName = name.trim() || "New card type";
  /** The fields a card can be called by, and compared on: those that hold words. */
  const wordFields = fields.filter((f) => holdsWords(f.kind));
  const fieldLabel = (field: CardField) => field.name.trim() || `Field ${fields.indexOf(field) + 1}`;

  // While there's unsaved work, leaving asks first: the app's own question for its screens, and the browser's for a
  // reload or a closed tab.
  const saveRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  useEffect(() => {
    onGuard(dirty ? { name: shownName, save: () => saveRef.current() } : null);
  }, [dirty, shownName, onGuard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);
  // Save can be pressed with something wrong in it: pressing it says what, in each field's own words.
  useEffect(() => {
    onStatus({ name: shownName, state, canSave: (dirty || isNew) && !saving });
  }, [shownName, state, dirty, isNew, saving, onStatus]);

  function edit(fieldId: string, patch: Partial<CardField>) {
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
    if (patch.name !== undefined && fieldErrors[fieldId]) setFieldErrors((e) => ({ ...e, [fieldId]: "" }));
  }
  function moveField(from: number, to: number) {
    setFields((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }
  const order = useDragOrder(fields.length, moveField);
  function hide(fieldId: string) {
    setFields((prev) => (prev.length > 1 ? prev.filter((f) => f.id !== fieldId) : prev));
  }
  // Enter walks the fields: the next one, or a new one at the end, so a type is typed out in one go instead of saving and leaving.
  function focusNext(i: number) {
    const next = fields[i + 1];
    if (next) setFocusId(next.id);
    else add();
  }
  function add() {
    const field: CardField = { id: crypto.randomUUID(), name: "", kind: "text", side: "back", required: false, tellsApart: false, perExample: false };
    setFields((prev) => [...prev, field]);
    setFocusId(field.id);
  }

  /** Save: what's on screen becomes the type. Says whether it did. */
  async function save(): Promise<boolean> {
    if (saving) return false;
    const parsed = NewCardType.safeParse({ id, name, fields, mainField: called?.id ?? null });
    if (!parsed.success) {
      let nameProblem: string | undefined;
      const fieldProblems: Record<string, string> = {};
      let other: string | null = null;
      for (const issue of parsed.error.issues) {
        const [head, index, leaf] = issue.path;
        if (head === "name") nameProblem ??= issue.code === "too_big" ? MESSAGES.nameLong : MESSAGES.name;
        else if (head === "fields" && typeof index === "number" && leaf === "name") {
          const field = fields[index];
          if (field && !fieldProblems[field.id]) fieldProblems[field.id] = issue.code === "too_big" ? MESSAGES.fieldLong : MESSAGES.field;
        } else if (head === "fields") other ??= issue.message;
      }
      setNameError(nameProblem);
      setFieldErrors(fieldProblems);
      setFailure(other);
      if (nameProblem) document.getElementById("type-name")?.focus();
      else {
        const firstWrong = fields.find((f) => fieldProblems[f.id]);
        if (firstWrong) setFocusId(firstWrong.id);
      }
      return false;
    }
    setSaving(true);
    setFailure(null);
    try {
      await onSave(parsed.data, isNew);
      setSaved(shapeOf(name, fields, called?.id ?? null));
      setIsNew(false);
      return true;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  async function remove() {
    setBusy(true);
    setFailure(null);
    try {
      await onRemove();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <>
      <Form onSubmit={() => void save()} className="type-form">
        <section className="panel" aria-labelledby="type-name-title">
          <h2 id="type-name-title" className="panel-title">
            Name
          </h2>
          <TextField
            id="type-name"
            label="Name"
            autoComplete="off"
            autoFocus={type === null}
            value={name}
            onChange={(value) => {
              setName(value);
              if (nameError) setNameError(undefined);
            }}
            error={nameError}
            onEnter={() => {
              const first = fields[0];
              if (first) setFocusId(first.id);
            }}
          />
        </section>

        <section className="panel" aria-labelledby="type-fields-title">
          <h2 id="type-fields-title" className="panel-title">
            Fields
          </h2>
          {/* What cards are called by and when two are the same, said once at the top (the owner, 2026-10-25), in place
              of a switch on every field: none picked to begin with, so nothing is a duplicate until one is. */}
          <Setting
            id="type-main-field"
            label="Main field"
            control={
              <Dropdown
                id="type-main-field-choice"
                label="Main field"
                options={[{ id: NO_MAIN, label: "None" }, ...wordFields.map((f) => ({ id: f.id, label: fieldLabel(f) }))]}
                value={called?.id ?? NO_MAIN}
                onChange={(picked) => setMainField(picked === NO_MAIN ? null : picked)}
              />
            }
          />
          {called ? (
            <Setting
              id="type-duplicates"
              label="Duplicate when these match"
              control={
                <div className="chips" role="group" aria-label="Duplicate when these match">
                  {/* The main field always; another field of words ticked (`tellsApart`) must match too. */}
                  {wordFields.map((f) => (
                    <Button key={f.id} variant="chip" aria-pressed={f.id === called.id || f.tellsApart} disabled={f.id === called.id} onClick={() => edit(f.id, { tellsApart: !f.tellsApart })}>
                      {fieldLabel(f)}
                    </Button>
                  ))}
                </div>
              }
            />
          ) : null}
          <div className={`field-rows ${order.dragging !== null ? "is-reordering" : ""}`.trim()}>
            {fields.map((field, i) => (
              <div key={field.id} ref={order.rowRef(i)} style={order.rowStyle(i)} className={`field-row ${order.dragging === i ? "is-dragging" : ""} ${deleting === field.id ? "is-asking" : ""}`.replace(/\s+/g, " ").trim()}>
                <TextField
                  id={nameInputId(field.id)}
                  label={`Field ${i + 1}`}
                  autoComplete="off"
                  value={field.name}
                  onChange={(value) => edit(field.id, { name: value })}
                  error={fieldErrors[field.id] || undefined}
                  onEnter={() => focusNext(i)}
                />
                <div className="field-row-tools">
                  <Button className="btn-icon field-grip" aria-label="Move" disabled={fields.length === 1} {...order.handleProps(i)}>
                    <Icon name="grip" />
                  </Button>
                  <Button className="is-danger" aria-pressed={deleting === field.id} disabled={fields.length === 1} onClick={() => setDeleting((was) => (was === field.id ? null : field.id))}>
                    <Icon name="trash" />
                    Delete
                  </Button>
                </div>
                {/* Deleting only hides the field in what's on screen, as it always did: the type changes at Save. */}
                {deleting === field.id ? (
                  <Ask
                    idPrefix={`field-delete-${field.id}`}
                    question={`Delete the “${fieldLabel(field)}” field?`}
                    go={{ words: "Delete field", busy: "Deleting…" }}
                    busy={false}
                    failure={null}
                    onKeep={() => setDeleting(null)}
                    onGo={() => {
                      setDeleting(null);
                      hide(field.id);
                    }}
                  />
                ) : null}
                <div className="field-row-options">
                  <Dropdown id={`field-kind-${field.id}`} label="Kind" options={FIELD_KIND_OPTIONS} value={field.kind} onChange={(kind) => edit(field.id, { kind })} />
                  <Toggle id={`field-required-${field.id}`} says={{ on: "Required", off: "Optional" }} on={field.required} onChange={(required) => edit(field.id, { required })} />
                  {/* The field cards are called by is the card's own: it's how a card that's already there is found to give another example to. */}
                  {field.id !== called?.id ? (
                    <Toggle id={`field-example-${field.id}`} says={{ on: "One per example", off: "One per card" }} on={field.perExample} onChange={(perExample) => edit(field.id, { perExample })} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="add-actions add-actions-start">
            <Button id="add-field" onClick={add}>
              <Icon name="add" />
              Add field
            </Button>
          </div>
        </section>

        {failure ? (
          <p className="form-failure" role="alert">
            {failure}
          </p>
        ) : null}
      </Form>

      {type ? (
        <section className={`panel ${asking ? "panel-alarm" : ""}`.trim()} aria-labelledby="type-delete-title">
          <h2 id="type-delete-title" className="panel-title">
            Delete this type
          </h2>
          {type.deckCount > 0 ? (
            <p className="empty">Used by {count(type.deckCount, "deck", "decks")}. A type can be deleted once no deck uses it.</p>
          ) : asking ? (
            <Ask
              idPrefix="type-delete"
              question={`Delete “${type.name}”?`}
              go={{ words: "Delete type", busy: "Deleting…" }}
              busy={busy}
              failure={null}
              onKeep={() => setAsking(false)}
              onGo={() => void remove()}
            />
          ) : (
            <>
              <p className="empty">No deck uses it.</p>
              <div className="add-actions add-actions-start">
                <Button id="type-delete" className="is-danger" onClick={() => setAsking(true)}>
                  <Icon name="trash" />
                  Delete type…
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
