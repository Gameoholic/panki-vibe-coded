/** @panki Show back of card, the button under a review card that turns it (`ShowButton`). Never a second of it. */
import type { Key } from "../keys";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { KeyCap } from "./KeyCap";

type Props = {
  /** The key it's pressed with, drawn as its keycap. */
  bind: Key | undefined;
  onPress: () => void;
};

/**
 * Show back of card, under a review card's front. `data-hold="reveal"` is where its key's hold is drawn. The review
 * and the Layout tab (drawn as the review, `ReviewScreen` → `ReviewButtons`) are both this.
 */
export function ShowButton({ bind, onPress }: Props) {
  return (
    <Button variant="primary" size="lg" data-hold="reveal" onClick={onPress}>
      <Icon name="eye" />
      Show back of card
      <KeyCap bind={bind} />
    </Button>
  );
}
