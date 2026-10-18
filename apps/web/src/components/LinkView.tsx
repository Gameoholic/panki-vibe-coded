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
 * A video's metadata on a card, as one link that opens the video at its moment in a tab of its own: on a card, a
 * small card of its own (a play tile in the clip's colour, the video's title, the channel and the moment under it,
 * the arrow that says it leaves Panki); on a row, a chip, "YouTube · 12:34". A card from before the title and the
 * channel were kept says "YouTube video" and the moment (the owner, 2026-10-18, of the title and chip stacked under
 * each other: "looks shit"). The address is written afresh from what was read out of the card's value, never the
 * value itself.
 */
export function LinkView({ meta, label, size = "card" }: Props) {
  const { link } = meta;
  const at = link.seconds === null ? null : clock(link.seconds);
  // Its presses are its own: on the review card a press anywhere else flips the card.
  const own = (e: MouseEvent) => e.stopPropagation();
  const common = {
    href: youtubeUrl(link),
    target: "_blank",
    rel: "noopener noreferrer",
    draggable: false,
    onClick: own,
  } as const;
  if (size === "row") {
    const words = at === null ? "YouTube" : `YouTube · ${at}`;
    return (
      <a className="btn btn-chip link-chip is-row" aria-label={`${label}: ${words}`} {...common}>
        <Icon name="out" />
        {words}
      </a>
    );
  }
  const title = meta.title || "YouTube video";
  const sub = [meta.channel?.name, at].filter((part): part is string => Boolean(part)).join(" · ");
  return (
    <a className="video-card" aria-label={`${label}: ${[title, sub].filter(Boolean).join(", ")}`} {...common}>
      <span className="video-card-mark" aria-hidden="true">
        <Icon name="play" />
      </span>
      <span className="video-card-text">
        <span className="video-card-title">{title}</span>
        {sub ? <span className="video-card-sub">{sub}</span> : null}
      </span>
      <Icon name="out" />
    </a>
  );
}
