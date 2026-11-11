/** @panki What shows the next of a review card, Done listening or Show back of card (`ShowButton`). Never a second of it. */
import type { Key } from "../keys";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { KeyCap } from "./KeyCap";

type Props = {
  /** The card in its Listen phase: Done listening, which shows its front; otherwise Show back of card, which turns it. */
  listening: boolean;
  /** The key it's pressed with, drawn as its keycap: Done listening's own while listening, Show back of card's on the front. */
  bind: Key | undefined;
  onPress: () => void;
};

/**
 * The button under a review card that shows the next of it: Done listening out of its Listen phase, Show back of card on its
 * front. `data-hold="reveal"` is where its key's hold is drawn. The review and the Layout tab (drawn as the review,
 * `ReviewScreen` → `ReviewButtons`) are both this.
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
