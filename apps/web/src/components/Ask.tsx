import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useAnchored } from "../hooks/useAnchored";
import { useDismiss } from "../hooks/useDismiss";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { TextField } from "./TextField";

type Props = {
  /** Ids for the question and its two buttons: `-question`, `-cancel`, `-go`. */
  idPrefix: string;
  /**
   * The button that asked. The question opens in a small panel hanging from it, placed in the window (under it, over it
   * where there's more room), so nothing that scrolls around it cuts it off; a press outside it or Escape is Cancel.
   * Every question about taking something away gives one. Left out, the question stands where it's drawn: a Panki AI
   * run's question about money (`AiRun.tsx` → `MessageAsk`), asked where its answer would go.
   */
  anchor?: RefObject<HTMLElement | null>;
  /** What's asked, its cost in it when it has one: "Delete “行く”?", "Delete “Mining” and its 120 cards?" */
  question: ReactNode;
  /** Under the question, in plain words: what doing it changes and what it leaves as it is, when that can't be guessed. */
  detail?: ReactNode;
  /**
   * The button that does it, and what it says while it's being done: "Delete card", "Deleting…"; its icon, the trash
   * unless it's something else (signing out, turning off). `spends` is a question about money rather than a loss (AI
   * step 5: a Panki AI run over the amount it asks above): the button filled in the accent with the AI's spark,
   * `lead`, in its icon's place.
   */
  go: { words: string; busy: string; icon?: IconName; spends?: { lead: ReactNode } };
  /**
   * What the button that leaves it as it is says: Cancel, as every way of backing out says, unless a question really needs another word.
   */
  cancel?: string;
  busy: boolean;
  /** Why it didn't go through, when it didn't. */
  failure: string | null;
  /**
   * Words to type before the button does it, for what can't be had back at all (forgetting the watch history: "I
   * understand" typed first, as AWS does). Left out, a press does it.
   */
  typed?: string;
  /** Cancel pressed (or, anchored, a press outside or Escape): nothing done. */
  onKeep: () => void;
  onGo: () => void;
};

/** What `useAnchored` and `useDismiss` are given for a question that isn't anchored, which they then leave alone. */
const NOWHERE: RefObject<HTMLElement | null> = { current: null };

/**
 * A question about something that hurts: the question, Cancel (no icon, as backing out never has one), and the filled
 * danger button that does it, with its icon (the trash to begin with). Never the browser's `confirm()`, never a centred
 * pop-up, never at the foot of what owns the action: a small panel hanging from the button that asked (`anchor`), the
 * look of the chart's menu with the danger colours at its edge, the focus on its first control as it opens. What owns
 * the action stays as it is; a row may tint itself while it asks (a card's row `is-asking`), so it's plain which row
 * it's about, and the button that asked shows it's pressed (`aria-expanded`, the caller's). Deleting a card, a deck, a
 * type, a stage, a key, a dictionary, a video off a shelf, the transcript: all this.
 */
export function Ask({ idPrefix, anchor, question, detail, go, cancel = "Cancel", busy, failure, typed, onKeep, onGo }: Props) {
  const [typing, setTyping] = useState("");
  const ready = typed === undefined || typing.trim() === typed;
  const panel = useRef<HTMLDivElement>(null);
  const anchored = anchor !== undefined;
  useAnchored(anchor ?? NOWHERE, panel, anchored, undefined, "auto");
  useDismiss(panel, anchored && !busy, onKeep, anchor);
  useEffect(() => {
    if (!anchored) return;
    panel.current?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus({ preventScroll: true });
  }, [anchored]);
  const keep = () => {
    onKeep();
    anchor?.current?.focus({ preventScroll: true });
  };
  return (
    <div
      ref={panel}
      className={anchored ? "menu ask ask-pop" : "ask"}
      role={anchored ? "dialog" : undefined}
      aria-labelledby={anchored ? `${idPrefix}-question` : undefined}
    >
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
        <Button id={`${idPrefix}-cancel`} onClick={keep} disabled={busy}>
          {cancel}
        </Button>
        <Button id={`${idPrefix}-go`} variant={go.spends ? "primary" : "danger"} onClick={onGo} disabled={busy || !ready}>
          {go.spends ? go.spends.lead : <Icon name={go.icon ?? "trash"} />}
          {busy ? go.busy : go.words}
        </Button>
      </div>
    </div>
  );
}
