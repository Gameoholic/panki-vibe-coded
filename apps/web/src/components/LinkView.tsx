import type { MouseEvent } from "react";
import { youtubeUrl, type YouTubeLink } from "@panki/contracts";
import { clock } from "../words";
import { Icon } from "./Icon";

type Props = {
  link: YouTubeLink;
  /** What the link is, in the owner's words (its field's name): what a screen reader hears before where it goes. */
  label: string;
  /** `row` is the small one on a card's row. */
  size?: "card" | "row";
};

/**
 * A link on a card, shown as what it is: a chip that says where it goes and how far in, and opens it in a tab of its
 * own. The address is written afresh from what was read out of the card's value, never the value itself.
 */
export function LinkView({ link, label, size = "card" }: Props) {
  const words = link.seconds === null ? "YouTube" : `YouTube · ${clock(link.seconds)}`;
  // Its presses are its own: on the review card a press anywhere else flips the card.
  const own = (e: MouseEvent) => e.stopPropagation();
  return (
    <a
      className={`btn btn-chip link-chip ${size === "row" ? "is-row" : ""}`.trim()}
      href={youtubeUrl(link)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label}: ${words}`}
      draggable={false}
      onClick={own}
    >
      <Icon name="out" />
      {words}
    </a>
  );
}
