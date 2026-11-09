/** @panki Saying a card is flagged, wherever it's named (`FlagTag`). Never a second drawing of a flag. */
import { FLAG_WORDS } from "../srsKinds";
import { Icon } from "./Icon";

/**
 * Saying a card is flagged, wherever it's named: the flag filled in the highlighter's yellow and "Flagged", on a small
 * tag tinted the same (`.flag-tag`). A card's row and a card already there are both this.
 */
export function FlagTag({ className = "" }: { className?: string }) {
  return (
    <span className={`flag-tag ${className}`.trim()}>
      <Icon name={FLAG_WORDS.icon} className="is-flagged" />
      {FLAG_WORDS.state}
    </span>
  );
}
