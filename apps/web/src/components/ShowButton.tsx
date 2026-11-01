import type { Key } from "../keys";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { KeyCap } from "./KeyCap";

type Props = {
  /** The card in its Listen phase: Show card, which shows its front; otherwise Show back of card (Show answer until 2026-11-01), which turns it. */
  listening: boolean;
  /** The key it's pressed with, drawn as its keycap: Show card's own while listening, Show back of card's on the front. */
  bind: Key | undefined;
  onPress: () => void;
};

/**
 * The button under a review card that shows the next of it: Show card out of its Listen phase, Show back of card on its
 * front. `data-hold="reveal"` is where its key's hold is drawn. The review and the Layout tab's Preview are both this.
 */
export function ShowButton({ listening, bind, onPress }: Props) {
  return (
    <Button variant="primary" size="lg" data-hold="reveal" onClick={onPress}>
      <Icon name="eye" />
      {listening ? "Show card" : "Show back of card"}
      <KeyCap bind={bind} />
    </Button>
  );
}
