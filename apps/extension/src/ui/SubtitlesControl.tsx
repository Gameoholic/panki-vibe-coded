/** @panki The subtitles off and back on, as a control of the player's bar (`SubtitlesControl`). */
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";

/**
 * The subtitles on or off, among the player's own controls: the subtitles glyph of the player's own kind of icon button
 * (`.yt-bar-button`), in the accent while they're on; pressed, the other: off, or back to the pick last shown, Panki's
 * or YouTube's (`subtitles.ts` → `toggledSource`). Its key does the same (`Modules.subtitlesKey`). Panki's: on the bar
 * only while Panki and its panel are on (`content/youtube.tsx` → `barShows`).
 */
export function SubtitlesControl({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Button className="yt-bar-button" aria-label={on ? "Subtitles on" : "Subtitles off"} aria-pressed={on} onClick={onToggle}>
      <Icon name="subtitles" />
    </Button>
  );
}
