import type { CSSProperties } from "react";
import type { HoldButtonView } from "../hooks/useHoldButton";
import { useKeycapsShown, type Key } from "../keys";
import { keyWords } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { KeyCap } from "./KeyCap";

type Props = {
  /** The card in its Listen phase: Done listening, which shows its front; otherwise Show back of card (Show answer until 2026-11-01), which turns it. */
  listening: boolean;
  /** The key it's pressed with, drawn as its keycap: Done listening's own while listening, Show back of card's on the front. */
  bind: Key | undefined;
  onPress: () => void;
  /** The Hold button, while it's on (Settings → Keybinds): drawn in this one's place (`HoldButton`). */
  chain?: HoldButtonView | null | undefined;
};

/**
 * The button under a review card that shows the next of it: Done listening out of its Listen phase, Show back of card on its
 * front; with the Hold button on, the Hold button. `data-hold="reveal"` is where its key's hold is drawn. The review and
 * the Layout tab's Preview are both this.
 */
export function ShowButton({ listening, bind, onPress, chain }: Props) {
  if (chain) return <HoldButton view={chain} variant="primary" size="lg" />;
  return (
    <Button variant="primary" size="lg" data-hold="reveal" onClick={onPress}>
      <Icon name={listening ? "check" : "eye"} />
      {listening ? "Done listening" : "Show back of card"}
      <KeyCap bind={bind} />
    </Button>
  );
}

/**
 * The Hold button (`useHoldButton`): the next stage of the card in words (Done listening, Show back of card, the deck's
 * answer), and its key as one clock face, a mark where each stage ends (`.key.is-chain`), what's done filled and the
 * stage being held filling on from there. Held, it goes on; tapped, the card goes back to its start. In Show back of
 * card's place on the front, in Hide back of card's on the back (`className`), its words there too in a full screen's top row.
 */
export function HoldButton({ view, variant = "ghost", size = "md", className = "" }: { view: HoldButtonView; variant?: "primary" | "ghost"; size?: "md" | "lg"; className?: string }) {
  const shown = useKeycapsShown();
  const cuts = view.cuts.map((at) => `transparent 0 ${(at - 0.012).toFixed(4)}turn, var(--chain-cut) 0 ${(at + 0.012).toFixed(4)}turn`).join(", ");
  const style = { "--hold-from": view.from.toFixed(4), "--hold-span": view.span.toFixed(4) } as CSSProperties;
  // On the keycap itself, where the colour of its marks (`--chain-cut`) is known.
  const marks = { "--chain-cuts": `conic-gradient(${cuts ? `${cuts}, ` : ""}transparent 0)` } as CSSProperties;
  return (
    <Button
      variant={variant}
      size={size}
      className={`hold-button ${className}`.trim()}
      data-hold="chain"
      style={style}
      onPointerDown={view.onPointerDown}
      onPointerUp={view.onPointerUp}
      onPointerCancel={view.onPointerCancel}
      onClick={view.onClick}
      onContextMenu={view.onContextMenu}
    >
      {view.icon ? <Icon name={view.icon} /> : null}
      {view.label}
      {view.bind.key && shown ? <span className="key is-hold is-chain" style={marks}>{keyWords(view.bind.key)}</span> : null}
    </Button>
  );
}
