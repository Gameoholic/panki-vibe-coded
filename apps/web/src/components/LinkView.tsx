import { useState, type MouseEvent } from "react";
import { youtubeUrl, type VideoPicture, type YouTubeMeta } from "@panki/contracts";
import { clock } from "../words";
import { Icon } from "./Icon";

/** Where a video's pictures are drawn from (Panki's copies, `api.videoPictures`, or their bytes in the extension); null for one there's none of. */
export type VideoPictures = Readonly<Record<VideoPicture, string | null>>;

type Props = {
  meta: YouTubeMeta;
  /** What the field is, in the owner's words (its name): what a screen reader hears before where it goes. */
  label: string;
  /** `row` is the small one on a card's row. */
  size?: "card" | "row";
  /** The video's thumbnail and its channel's picture, on the card; left out, it's words alone. */
  pictures?: VideoPictures | null;
};

/**
 * A video's metadata on a card, as one link that opens the video at its moment in a tab of its own: on a card, a
 * small card of its own (the video's thumbnail, its title, the channel's picture and name and the moment under it, the
 * arrow that says it leaves Panki); on a row, a chip, "YouTube · 12:34". A picture Panki doesn't have (a card from
 * before they were kept) is left out, and so is the channel when it wasn't read. A card from before the title was
 * kept says "YouTube video" (the owner, 2026-10-18, of the title and chip stacked under each other: "looks shit"; then
 * of a play tile where the thumbnail now is: "no need for the play button"). The address is written afresh from what
 * was read out of the card's value, never the value itself.
 */
export function LinkView({ meta, label, size = "card", pictures = null }: Props) {
  /** The pictures that couldn't be drawn: Panki has none for this video. */
  const [missing, setMissing] = useState<readonly string[]>([]);
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
  const shown = (which: VideoPicture) => {
    const src = pictures?.[which] ?? null;
    return src !== null && !missing.includes(src) ? src : null;
  };
  /** A picture drawn, or let go of when there's nothing behind it. */
  const picture = (which: VideoPicture, className: string) => {
    const src = shown(which);
    return src ? <img className={className} src={src} alt="" draggable={false} onError={() => setMissing((was) => [...was, src])} /> : null;
  };
  const title = meta.title || "YouTube video";
  const sub = [meta.channel?.name, at].filter((part): part is string => Boolean(part)).join(" · ");
  return (
    <a className="video-card" aria-label={`${label}: ${[title, sub].filter(Boolean).join(", ")}`} {...common}>
      {picture("thumbnail", "video-card-thumb")}
      <span className="video-card-text">
        <span className="video-card-title">{title}</span>
        {sub ? (
          <span className="video-card-sub">
            {meta.channel ? picture("avatar", "video-card-avatar") : null}
            <span className="video-card-sub-words">{sub}</span>
          </span>
        ) : null}
      </span>
      <Icon name="out" />
    </a>
  );
}
