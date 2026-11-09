/** @panki How much of the video is watched, as a control of the player's bar (`WatchingControl`). */
import { useState } from "react";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { Tip } from "@web/components/Tip";

/** What a press does, said over the control as the player's own controls say theirs. */
const PRESS_WORDS = { watching: "Mark as finished", finished: "Mark as still watching" } as const;
/** How far above the control's top the tip points, in px: clear of the progress bar over the controls, where the player's own tooltips stand. */
const TIP_ABOVE = -14;

/**
 * Finished or not, among the player's own controls: "Watching · 9%" with the clock until the video is played into its
 * end, then "Finished" with a tick in the good colour; pressed, the other, said by hand. Words of the player's own kind
 * of button, in the player's own time's type (`--yt-bar-*`, as the speed button's are). What a press does is the app's
 * `Tip` above it while a mouse rests on it or it has the keyboard's focus, as the player's own tooltips sit above the
 * bar; a touch screen has no tip, so the words are in its label too. Panki's: on the bar only while Panki is on and the
 * account keeps the video's watching (`content/youtube.tsx` → `finishHere`, `barShows`).
 */
export function WatchingControl({ finished, percent, onToggle }: { finished: boolean; percent: number | null; onToggle: () => void }) {
  const [tip, setTip] = useState<{ x: number } | null>(null);
  const shown = finished ? "Finished" : `Watching · ${percent ?? 0}%`;
  const press = finished ? PRESS_WORDS.finished : PRESS_WORDS.watching;
  const show = (element: HTMLElement) => setTip({ x: element.offsetWidth / 2 });
  return (
    <span className="yt-watching-wrap">
      <Button
        className={`yt-bar-words yt-watching ${finished ? "is-finished" : ""}`.trim()}
        aria-pressed={finished}
        aria-label={`${shown}. ${press}`}
        onClick={onToggle}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") show(e.currentTarget);
        }}
        onPointerLeave={() => setTip(null)}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
        }}
        onBlur={() => setTip(null)}
      >
        {finished ? <Icon name="check" /> : <Icon name="clock" />}
        {shown}
      </Button>
      {tip ? (
        <Tip x={tip.x} y={TIP_ABOVE}>
          {press}
        </Tip>
      ) : null}
    </span>
  );
}
