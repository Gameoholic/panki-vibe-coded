import { useEffect, useState } from "react";
import { NewCardType, type CardField, type CardType, type NewCardType as NewCardTypeShape } from "@panki/contracts";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Form } from "../components/Form";
import { Icon } from "../components/Icon";
import { TextField } from "../components/TextField";
import { Toggle } from "../components/Toggle";
import { useDragOrder } from "../hooks/useDragOrder";
import { FIELD_KIND_OPTIONS } from "../fieldKinds";
import { count } from "../words";

/** What a field says when it's wrong. One home. */
const MESSAGES = {
  name: "Give the type a name.",
  nameLong: "Keep the name under 100 characters.",
  field: "Give the field a name.",
  fieldLong: "Keep it under 60 characters.",
};

function nameInputId(fieldId: string) {
  return `field-name-${fieldId}`;
}

type Props = {
  /** The type being edited, or `null` to make a new one. */
  type: CardType | null;
  onSave: (type: NewCardTypeShape) => Promise<void>;
  onRemove: () => Promise<void>;
};

/**
 * A card type's fields: its name and its fields, each with a kind and whether it's required, in the order a form asks
 * for them; delete at the bottom, only when no deck uses it. Where each field stands on the card, front or back, and
 * how it looks is the type's Layout (`LayoutView`): a field added here starts on the back, under the rest.
 */
export function TypeView({ type, onSave, onRemove }: Props) {
  const [id] = useState(() => type?.id ?? crypto.randomUUID());
  const [name, setName] = useState(type?.name ?? "");
  // A new type starts with one field on the front, because a card needs something there.
  const [fields, setFields] = useState<CardField[]>(() => type?.fields ?? [{ id: crypto.randomUUID(), name: "", kind: "text", side: "front", required: true }]);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(nameInputId(focusId))?.focus();
    setFocusId(null);
  }, [focusId]);

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
    const field: CardField = { id: crypto.randomUUID(), name: "", kind: "text", side: "back", required: false };
    setFields((prev) => [...prev, field]);
    setFocusId(field.id);
  }

  async function submit() {
    const parsed = NewCardType.safeParse({ id, name, fields });
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
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onSave(parsed.data);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

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
      <Form onSubmit={submit} className="type-form">
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
          <div className={`field-rows ${order.dragging !== null ? "is-reordering" : ""}`.trim()}>
            {fields.map((field, i) => (
              <div key={field.id} ref={order.rowRef(i)} style={order.rowStyle(i)} className={`field-row ${order.dragging === i ? "is-dragging" : ""}`.trim()}>
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
                  <Button className="btn-icon field-hide" aria-label="Hide field" disabled={fields.length === 1} onClick={() => hide(field.id)}>
                    <Icon name="close" />
                  </Button>
                </div>
                <div className="field-row-options">
                  <Dropdown id={`field-kind-${field.id}`} label="Kind" options={FIELD_KIND_OPTIONS} value={field.kind} onChange={(kind) => edit(field.id, { kind })} />
                  <Toggle id={`field-required-${field.id}`} says={{ on: "Required", off: "Optional" }} on={field.required} onChange={(required) => edit(field.id, { required })} />
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

        <div className="add-actions">
          {failure ? (
            <span className="form-failure" role="alert">
              {failure}
            </span>
          ) : null}
          <Button id="type-save" type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : type ? "Save" : "Create type"}
          </Button>
        </div>
      </Form>

      {type ? (
        <section className={`panel ${asking ? "panel-alarm" : ""}`.trim()} aria-labelledby="type-delete-title">
          <h2 id="type-delete-title" className="panel-title">
            Delete this type
          </h2>
          {type.deckCount > 0 ? (
            <p className="empty">Used by {count(type.deckCount, "deck", "decks")}. A type can be deleted once no deck uses it.</p>
          ) : asking ? (
            <>
              <p id="type-delete-question" className="question">
                Delete “{type.name}”?
              </p>
              <div className="add-actions">
                <Button id="type-delete-keep" onClick={() => setAsking(false)} disabled={busy}>
                  Keep
                </Button>
                <Button id="type-delete-go" variant="danger" onClick={remove} disabled={busy}>
                  {busy ? "Deleting…" : "Delete type"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="empty">No deck uses it.</p>
              <div className="add-actions add-actions-start">
                <Button id="type-delete" className="is-danger" onClick={() => setAsking(true)}>
                  Delete…
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
