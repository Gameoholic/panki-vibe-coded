/** @panki Save for later as a control of the player's bar (`SaveControl`). */
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";

/**
 * The video saved for later or not, among the player's own controls: the bookmark of the player's own kind of icon
 * button (`.yt-bar-button`), filled in the accent once saved; pressed, the other. The same save as a thumbnail's button,
 * shown on YouTube's home. Panki's: on the bar only while Panki is on and signed in (`content/youtube.tsx` → `barShows`).
 */
export function SaveControl({ saved, onToggle }: { saved: boolean; onToggle: () => void }) {
  return (
    <Button className="yt-bar-button" aria-label={saved ? "Saved" : "Save for later"} aria-pressed={saved} onClick={onToggle}>
      <Icon name="bookmark" className={saved ? "is-solid" : ""} />
    </Button>
  );
}
