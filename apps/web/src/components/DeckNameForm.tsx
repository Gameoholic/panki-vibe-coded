import { useState, type ReactNode } from "react";
import { NewDeck } from "@panki/contracts";
import { Button } from "./Button";
import { Form } from "./Form";
import { TextField } from "./TextField";

/** What the name field says when it's wrong. One home: making a deck and renaming one both say this. */
const MESSAGES = {
  empty: "Give the deck a name.",
  long: "Keep the name under 100 characters.",
};

type Props = {
  id: string;
  initial: string;
  /** The submit button's words, and its words while waiting. */
  action: string;
  busyAction: string;
  autoFocus?: boolean;
  /** For renaming: the button stays off until the name differs from `initial`. */
  onlyWhenChanged?: boolean;
  onSubmit: (name: string) => Promise<void>;
  onCancel?: () => void;
  /** Anything that belongs under the name, like the card type chooser when making a deck. */
  children?: ReactNode;
};

/** A deck's name, validated by the contracts' rule, with the app's own words when it's wrong. */
export function DeckNameForm({ id, initial, action, busyAction, autoFocus = false, onlyWhenChanged = false, onSubmit, onCancel, children }: Props) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unchanged = onlyWhenChanged && name.trim() === initial;

  async function submit() {
    const parsed = NewDeck.shape.name.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.code === "too_big" ? MESSAGES.long : MESSAGES.empty);
      document.getElementById(id)?.focus();
      return;
    }
    if (unchanged) return;
    setBusy(true);
    setFailure(null);
    try {
      await onSubmit(parsed.data);
      setName(onlyWhenChanged ? parsed.data : "");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={submit} className="add-form">
      <TextField
        id={id}
        label="Name"
        autoComplete="off"
        autoFocus={autoFocus}
        value={name}
        onChange={(value) => {
          setName(value);
          if (error) setError(undefined);
        }}
        error={error}
      />
      {children}
      <div className="add-actions">
        {failure ? (
          <span className="form-failure" role="alert">
            {failure}
          </span>
        ) : null}
        {onCancel ? (
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy || unchanged}>
          {busy ? busyAction : action}
        </Button>
      </div>
    </Form>
  );
}
