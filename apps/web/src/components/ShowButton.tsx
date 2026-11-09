/** @panki What shows the next of a review card, Done listening or Show back of card (`ShowButton`), and the Hold button (`HoldButton`). Never a second of either. */
import type { CSSProperties } from "react";
import type { HoldButtonView } from "../hooks/useHoldButton";
import type { Key } from "../keys";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { HoldClock, KeyCap } from "./KeyCap";

type Props = {
  /** The card in its Listen phase: Done listening, which shows its front; otherwise Show back of card, which turns it. */
  listening: boolean;
  /** The key it's pressed with, drawn as its keycap: Done listening's own while listening, Show back of card's on the front. */
  bind: Key | undefined;
  onPress: () => void;
};

/**
 * The button under a review card that shows the next of it: Done listening out of its Listen phase, Show back of card on its
 * front (with the Hold button on, still there to press, with no key: `bind` left out). `data-hold="reveal"` is where its
 * key's hold is drawn. The review and the Layout tab (drawn as the review, `ReviewScreen` → `ReviewButtons`) are both this.
 */
export function ShowButton({ listening, bind, onPress }: Props) {
  return (
    <Button variant="primary" size="lg" data-hold="reveal" onClick={onPress}>
      <Icon name={listening ? "check" : "eye"} />
      {listening ? "Done listening" : "Show back of card"}
      <KeyCap bind={bind} />
    </Button>
  );
}

/** A stage's hold in words: "Hold 0.5 s", or "Press". */
const holdWords = (ms: number) => (ms > 0 ? `Hold ${ms / 1000} s` : "Press");

/**
 * The Hold button (`useHoldButton`): its key as one clock face for every stage of the card
 * (`HoldClock`), what's done filled and the stage being held filling on from there, and beside it the next stage in
 * words (Done listening, Show back of card, the deck's answer by its name) over how long it's held ("Hold 0.5 s"; what
 * comes after it is the clock's to show).
 * Held, it goes on; tapped, the card goes back to its start. It stands under the card on both its sides, beside the
 * review's own buttons, which keep their keys while it's on: it's one more action with a key of its own. The
 * review, the Layout tab and its explainer are all this.
 */
export function HoldButton({ view }: { view: HoldButtonView }) {
  const style = { "--hold-from": view.from.toFixed(4), "--hold-span": view.span.toFixed(4) } as CSSProperties;
  return (
    <Button
      className="hold-button"
      data-hold="chain"
      style={style}
      onPointerDown={view.onPointerDown}
      onPointerUp={view.onPointerUp}
      onPointerCancel={view.onPointerCancel}
      onClick={view.onClick}
      onContextMenu={view.onContextMenu}
    >
      <HoldClock bind={view.bind} pieces={view.pieces} tone={view.tone} />
      <span className="hold-button-words">
        <b>{view.label}</b>
        {view.ms === null ? null : <span>{holdWords(view.ms)}</span>}
      </span>
    </Button>
  );
}
