/** @panki The downloaded mark, on a video's picture wherever Panki draws one and on the player bar (`DownloadedMark`, `DownloadedControl`, `DOWNLOADED_WORDS`). Never a second drawing of it. */
import { useState } from "react";
import { Icon } from "@web/components/Icon";
import { Tip } from "@web/components/Tip";

/** What the mark says to a screen reader, and in its tip on the bar. */
export const DOWNLOADED_WORDS = "Downloaded";
/** How far above the control's top the tip points, in px: where the player's own tooltips stand (as `WatchingControl`'s). */
const TIP_ABOVE = -14;

/**
 * A video downloaded whole in this browser, on its picture: a small glyph in the picture's bottom left corner, on the
 * player's own dark glass as its length is, quiet, never a badge. The same corner on every picture: Panki's shelves,
 * the recap's, and every thumbnail of the site's (drawn there as text by `content/feed.tsx`, the same icon and look).
 */
export function DownloadedMark() {
  return (
    <span className="downloaded-mark" role="img" aria-label={DOWNLOADED_WORDS}>
      <Icon name="downloaded" />
    </span>
  );
}

/**
 * The same mark among the player's own controls, the player's own kind of icon, nothing to press: "Downloaded" in the
 * app's `Tip` above it while a mouse rests on it, as the player's own tooltips sit above the bar; its label says it to
 * anyone else. On the bar only on a video downloaded whole (`content/youtube.tsx` → `barShows`).
 */
export function DownloadedControl() {
  const [tip, setTip] = useState<{ x: number } | null>(null);
  return (
    <span
      className="yt-bar-mark"
      role="img"
      aria-label={DOWNLOADED_WORDS}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setTip({ x: e.currentTarget.offsetWidth / 2 });
      }}
      onPointerLeave={() => setTip(null)}
    >
      <Icon name="downloaded" />
      {tip ? (
        <Tip x={tip.x} y={TIP_ABOVE}>
          {DOWNLOADED_WORDS}
        </Tip>
      ) : null}
    </span>
  );
}
