import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { TextField } from "./TextField";

type Props = {
  /** Ids for the question and its two buttons: `-question`, `-keep`, `-go`. */
  idPrefix: string;
  /** What's asked, its cost in it when it has one: "Delete “行く”?", "Delete “Mining” and its 120 cards?" */
  question: ReactNode;
  /** Under the question, in plain words: what doing it changes and what it leaves as it is, when that can't be guessed. */
  detail?: ReactNode;
  /** The button that does it, and what it says while it's being done: "Delete card", "Deleting…"; its icon, the trash unless it's something else (signing out, turning off). */
  go: { words: string; busy: string; icon?: IconName };
  /** What the button that leaves it as it is says: Keep, unless that reads wrong for what's asked (turning Video tracking off says Cancel; the owner, 2026-10-28). */
  keep?: string;
  busy: boolean;
  /** Why it didn't go through, when it didn't. */
  failure: string | null;
  /**
   * Words to type before the button does it, for what can't be had back at all (forgetting the watch history: the
   * owner, 2026-10-28, "force you to type 'I understand' or something like AWS does"). Left out, a press does it.
   */
  typed?: string;
  onKeep: () => void;
  onGo: () => void;
};

/**
 * A question about something that hurts, asked in place, inside what owns the action: the question, Keep (`cancel`),
 * and the filled danger button that does it, with its icon (the trash to begin with) (a line under the question saying what a card's deleting leaves behind went at
 * the owner's word, 2026-10-18). Never the browser's `confirm()`, never a pop-up. Whoever asks
 * tints what it stands in (`.panel-alarm`, a card's row `is-asking`) while it's asked. Deleting a card (its row, its
 * form), a deck, a card type and an SRS type are all this.
 */
export function Ask({ idPrefix, question, detail, go, keep = "Keep", busy, failure, typed, onKeep, onGo }: Props) {
  const [typing, setTyping] = useState("");
  const ready = typed === undefined || typing.trim() === typed;
  return (
    <div className="ask">
      <p id={`${idPrefix}-question`} className="question">
        {question}
      </p>
      {detail ? <div className="ask-detail">{detail}</div> : null}
      {typed !== undefined ? <TextField id={`${idPrefix}-typed`} label={`Type “${typed}” to confirm`} value={typing} autoComplete="off" onChange={setTyping} /> : null}
      <div className="add-actions">
        {failure ? (
          <span className="form-failure" role="alert">
            {failure}
          </span>
        ) : null}
        <Button id={`${idPrefix}-keep`} onClick={onKeep} disabled={busy}>
          <Icon name="cancel" />
          {keep}
        </Button>
        <Button id={`${idPrefix}-go`} variant="danger" onClick={onGo} disabled={busy || !ready}>
          <Icon name={go.icon ?? "trash"} />
          {busy ? go.busy : go.words}
        </Button>
      </div>
    </div>
  );
}
