import type { CSSProperties } from "react";
import type { HoldButtonView } from "../hooks/useHoldButton";
import type { Key } from "../keys";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { HoldClock, KeyCap } from "./KeyCap";

type Props = {
  /** The card in its Listen phase: Done listening, which shows its front; otherwise Show back of card (Show answer until 2026-11-01), which turns it. */
  listening: boolean;
  /** The key it's pressed with, drawn as its keycap: Done listening's own while listening, Show back of card's on the front. */
  bind: Key | undefined;
  onPress: () => void;
};

/**
 * The button under a review card that shows the next of it: Done listening out of its Listen phase, Show back of card on its
 * front (with the Hold button on, still there to press, with no key: `bind` left out). `data-hold="reveal"` is where its
 * key's hold is drawn. The review and the Layout tab's Preview are both this.
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
 * The Hold button (`useHoldButton`), drawn as the owner's drawing A of https://claude.ai/artifact/4pgpAtQJRkEAfV1iWmm9NA
 * (2026-11-02: "it looked cool and was better for this"): its key as one clock face for every stage of the card
 * (`HoldClock`), what's done filled and the stage being held filling on from there, and beside it the next stage in
 * words (Done listening, Show back of card, the deck's answer by its name) over how it's held and what comes after it.
 * Held, it goes on; tapped, the card goes back to its start. It stands under the card on both its sides, beside the
 * review's own buttons, which keep working by hand with no keys of their own while it's on (the owner, 2026-11-02). The
 * review, the Layout tab's Preview and its explainer are all this.
 */
export function HoldButton({ view }: { view: HoldButtonView }) {
  const style = { "--hold-from": view.from.toFixed(4), "--hold-span": view.span.toFixed(4) } as CSSProperties;
  const how = [view.ms === null ? null : holdWords(view.ms), view.then.length > 0 ? `then ${view.then.join(", ")}` : null].filter((part) => part !== null);
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
        {how.length > 0 ? <span>{how.join(" · ")}</span> : null}
      </span>
    </Button>
  );
}
