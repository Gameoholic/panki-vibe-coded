import { useState, type ReactNode } from "react";
import { Button } from "@web/components/Button";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import { TextField } from "@web/components/TextField";

/**
 * A name of the owner's own on a row, and renaming it there: the name with a pencil after it, which becomes the
 * app's field in its place, Save, Cancel, and Reset to default name while the name isn't the thing's own (saving it
 * empty does the same). A dictionary's name and a profile's are both this. `onKeep(null)` is the reset.
 */
export function Rename({ id, shown, className, after, below, canReset, max, onKeep }: { id: string; shown: string; className: string; after?: ReactNode; below?: ReactNode; canReset: boolean; max: number; onKeep: (name: string | null) => Promise<void> }) {
  const [typing, setTyping] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function keep(name: string | null) {
    setBusy(true);
    try {
      await onKeep(name);
      setTyping(null);
    } finally {
      setBusy(false);
    }
  }

  if (typing === null) {
    return (
      <div className={className}>
        {shown}
        {after}
        <Button className="btn-icon rename" aria-label={`Rename ${shown}`} onClick={() => setTyping(shown)}>
          <Icon name="edit" />
        </Button>
        {below}
      </div>
    );
  }
  return (
    <Form onSubmit={() => void keep(typing)} className="rename-form">
      <TextField id={`${id}-name`} label="Name" autoFocus value={typing} onChange={(typed) => setTyping(typed.slice(0, max))} />
      <div className="add-actions add-actions-start">
        <Button type="submit" variant="primary" disabled={busy}>
          <Icon name="save" />
          Save
        </Button>
        <Button disabled={busy} onClick={() => setTyping(null)}>
          Cancel
        </Button>
        {canReset ? (
          <Button disabled={busy} onClick={() => void keep(null)}>
            <Icon name="reset" />
            Reset to default name
          </Button>
        ) : null}
      </div>
    </Form>
  );
}
