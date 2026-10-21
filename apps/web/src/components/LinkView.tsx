import { useState, type MouseEvent } from "react";
import { youtubeUrl, type VideoPicture, type YouTubeMeta } from "@panki/contracts";
import { clock } from "../words";
import { Icon } from "./Icon";

/** Where a video's pictures are drawn from (Panki's copies, `api.videoPictures`, or their bytes in the extension); null for one there's none of. */
export type VideoPictures = Readonly<Record<VideoPicture, string | null>>;

/** How far into the video it was stopped: a share of its length, and what's left in words ("12 min left"). */
export type VideoProgress = { share: number; left: string };

type Props = {
  /** The video, its title and its channel's name: a card's metadata (`YouTubeMeta`), or a video watched. */
  meta: Pick<YouTubeMeta, "link" | "title"> & { channel: { name: string } | null };
  /** What the field is, in the owner's words (its name): what a screen reader hears before where it goes. */
  label: string;
  /** `row` is the small one on a card's row. */
  size?: "card" | "row";
  /** The video's thumbnail and its channel's picture, on the card; left out, it's words alone. */
  pictures?: VideoPictures | null;
  /** A video left part-way (Continue watching): a thin line over the thumbnail, and what's left in place of the moment. */
  progress?: VideoProgress;
};

/**
 * A video's metadata on a card, as one link that opens the video at its moment in a tab of its own: on a card, a
 * small card of its own (the video's thumbnail, its title, the channel's picture and name and the moment under it, the
 * arrow that says it leaves Panki); on a row, a chip, "YouTube · 12:34". A picture Panki doesn't have (a card from
 * before they were kept) is left out, and so is the channel when it wasn't read. A card from before the title was
 * kept says "YouTube video" (the owner, 2026-10-18, of the title and chip stacked under each other: "looks shit"; then
 * of a play tile where the thumbnail now is: "no need for the play button"). The address is written afresh from what
 * was read out of the card's value, never the value itself. Continue watching draws a video watched as the same card,
 * opening where it was stopped, with how much is left and a line over the thumbnail as far as it got.
 */
export function LinkView({ meta, label, size = "card", pictures = null, progress }: Props) {
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
  // A video left part-way says what's left of it; where it opens is the same moment, so that isn't said twice.
  const sub = [meta.channel?.name, progress ? progress.left : at].filter((part): part is string => Boolean(part)).join(" · ");
  const thumbnail = picture("thumbnail", "video-card-thumb");
  return (
    <a className="video-card" aria-label={`${label}: ${[title, sub].filter(Boolean).join(", ")}`} {...common}>
      {thumbnail && progress ? (
        <span className="video-card-thumbs">
          {thumbnail}
          <span className="video-card-progress" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(0, progress.share * 100))}%` }} />
          </span>
        </span>
      ) : (
        thumbnail
      )}
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
