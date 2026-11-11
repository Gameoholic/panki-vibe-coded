/** @panki Unblur and Blur, the front's own, a chip of glass in the review card's corner (`BlurButton`). Never a second of it. */
import type { Key } from "../keys";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { KeyCap } from "./KeyCap";

type Props = {
  /** The front blurred now: Unblur; clear: Blur. */
  blurred: boolean;
  /** Blur's key, drawn as its keycap. */
  bind: Key | undefined;
  /** There, but unseen and out of reach, keeping its room: the back, or a card whose type marks nothing to blur. */
  held: boolean;
  onToggle: () => void;
};

/**
 * Unblur while the front is blurred, Blur while it's clear: its words both held in one box, so it keeps one width as it
 * flips. `data-hold="blur"` is where its key's hold is drawn. A press on it is its own, never the card's.
 */
export function BlurButton({ blurred, bind, held, onToggle }: Props) {
  return (
    <Button
      variant="chip"
      className={`review-blur ${held ? "is-held" : ""}`.trim()}
      data-hold="blur"
      aria-label={blurred ? "Unblur" : "Blur"}
      aria-hidden={held || undefined}
      tabIndex={held ? -1 : undefined}
      disabled={held}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Icon name={blurred ? "focus" : "blur"} />
      <span className="review-blur-words" aria-hidden="true">
        <span className={blurred ? "" : "is-off"}>Unblur</span>
        <span className={blurred ? "is-off" : ""}>Blur</span>
      </span>
      <KeyCap bind={bind} />
    </Button>
  );
}
