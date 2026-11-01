import type { Key } from "../keys";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { KeyCap } from "./KeyCap";

type Props = {
  /** The card in its Listen phase: Show card, which shows its front; otherwise Show answer, which turns it. */
  listening: boolean;
  /** Show answer's key, which is Show card's too while the card is listened to: drawn as its keycap. */
  bind: Key | undefined;
  onPress: () => void;
};

/**
 * The button under a review card that shows the next of it: Show card out of its Listen phase, Show answer on its
 * front. `data-hold="reveal"` is where its key's hold is drawn. The review and the Layout tab's Preview are both this.
 */
export function ShowButton({ listening, bind, onPress }: Props) {
  return (
    <Button variant="primary" size="lg" data-hold="reveal" onClick={onPress}>
      <Icon name="eye" />
      {listening ? "Show card" : "Show answer"}
      <KeyCap bind={bind} />
    </Button>
  );
}
