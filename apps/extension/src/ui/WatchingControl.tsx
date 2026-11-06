import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";

/**
 * Finished or not, among the player's own controls: "Watching · 9%" with the clock until the video is played into its
 * end, then "Finished" with a tick in the good colour; pressed, the other, said by hand. Words of the player's own kind
 * of button, in the player's own time's type (`--yt-bar-*`, as the speed button's are). Panki's: on the bar only while
 * Panki is on and the account keeps the video's watching (`content/youtube.tsx` → `finishHere`, `barShows`).
 */
export function WatchingControl({ finished, percent, onToggle }: { finished: boolean; percent: number | null; onToggle: () => void }) {
  return (
    <Button className={`yt-bar-words yt-watching ${finished ? "is-finished" : ""}`.trim()} aria-pressed={finished} onClick={onToggle}>
      {finished ? (
        <>
          <Icon name="check" />
          Finished
        </>
      ) : (
        <>
          <Icon name="clock" />
          Watching · {percent ?? 0}%
        </>
      )}
    </Button>
  );
}
