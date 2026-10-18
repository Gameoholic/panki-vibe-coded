import type { ReactNode } from "react";
import { Button } from "./Button";

type Props = {
  /** Ids for the question and its two buttons: `-question`, `-keep`, `-go`. */
  idPrefix: string;
  /** What's asked, its cost in it when it has one: "Delete “行く”?", "Delete “Mining” and its 120 cards?" */
  question: ReactNode;
  /** The button that does it, and what it says while it's being done: "Delete card", "Deleting…". */
  go: { words: string; busy: string };
  busy: boolean;
  /** Why it didn't go through, when it didn't. */
  failure: string | null;
  onKeep: () => void;
  onGo: () => void;
};

/**
 * A question about something that hurts, asked in place, inside what owns the action: the question, Keep, and the
 * filled danger button that does it (a line under the question saying what a card's deleting leaves behind went at
 * the owner's word, 2026-10-18). Never the browser's `confirm()`, never a pop-up. Whoever asks
 * tints what it stands in (`.panel-alarm`, a card's row `is-asking`) while it's asked. Deleting a card (its row, its
 * form), a deck, a card type and an SRS type are all this.
 */
export function Ask({ idPrefix, question, go, busy, failure, onKeep, onGo }: Props) {
  return (
    <div className="ask">
      <p id={`${idPrefix}-question`} className="question">
        {question}
      </p>
      <div className="add-actions">
        {failure ? (
          <span className="form-failure" role="alert">
            {failure}
          </span>
        ) : null}
        <Button id={`${idPrefix}-keep`} onClick={onKeep} disabled={busy}>
          Keep
        </Button>
        <Button id={`${idPrefix}-go`} variant="danger" onClick={onGo} disabled={busy}>
          {busy ? go.busy : go.words}
        </Button>
      </div>
    </div>
  );
}
