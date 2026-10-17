import type { MouseEvent } from "react";
import { youtubeUrl, type YouTubeMeta } from "@panki/contracts";
import { clock } from "../words";
import { Icon } from "./Icon";

type Props = {
  meta: YouTubeMeta;
  /** What the field is, in the owner's words (its name): what a screen reader hears before where it goes. */
  label: string;
  /** `row` is the small one on a card's row. */
  size?: "card" | "row";
};

/**
 * A video's metadata on a card: a chip that says where it goes and how far in, and opens it in a tab of its own, with
 * the title and the channel beside it when the card knows them, small and quiet so they don't crowd the card's own
 * words (the owner, 2026-10-18: "kinda cluttered"); on a row, the chip alone. The address is written afresh from what
 * was read out of the card's value, never the value itself. The channel is words, not a link: one way out of Panki
 * per field is enough.
 */
export function LinkView({ meta, label, size = "card" }: Props) {
  const { link } = meta;
  const words = link.seconds === null ? "YouTube" : `YouTube · ${clock(link.seconds)}`;
  // Its presses are its own: on the review card a press anywhere else flips the card.
  const own = (e: MouseEvent) => e.stopPropagation();
  const chip = (
    <a
      className={`btn btn-chip link-chip ${size === "row" ? "is-row" : ""}`.trim()}
      href={youtubeUrl(link)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label}: ${[meta.title, meta.channel?.name, words].filter(Boolean).join(", ")}`}
      draggable={false}
      onClick={own}
    >
      <Icon name="out" />
      {words}
    </a>
  );
  if (size === "row" || (!meta.title && !meta.channel)) return chip;
  return (
    <span className="video-meta">
      {chip}
      <span className="video-about">
        {meta.title ? <span className="video-title">{meta.title}</span> : null}
        {meta.channel ? <span className="video-channel">{meta.channel.name}</span> : null}
      </span>
    </span>
  );
}
