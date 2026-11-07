import { useState } from "react";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { Tip } from "@web/components/Tip";

/** What a press does, said under the button while a mouse rests on it. */
const PRESS_WORDS = "Show panel";
/** The button's height, in px (`extension.css` → `.yt-corner-button`): the tip hangs under it. */
const BUTTON_PX = 48;
/** The room between the button's foot and its tip, in px. */
const TIP_GAP = 8;

/**
 * The Panki panel's button in the video's top-right corner in the site's full screen, while the panel is folded away:
 * a round disc of the player's own dark glass with the panel's icon, as the site draws its playlist button there,
 * pressed to bring the panel back. It stands in a place of Panki's over the player (`content/youtube.tsx` → `corner`),
 * which the page shows and hides with the player's own controls. What a press does is the app's `Tip` under it while a
 * mouse rests on it or it has the keyboard's focus; a touch screen has no tip, so the words are in its label too.
 */
export function PanelButton({ onOpen }: { onOpen: () => void }) {
  const [tip, setTip] = useState(false);
  return (
    <span className="yt-corner">
      <Button
        className="yt-corner-button"
        aria-label={PRESS_WORDS}
        onClick={onOpen}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setTip(true);
        }}
        onPointerLeave={() => setTip(false)}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) setTip(true);
        }}
        onBlur={() => setTip(false)}
      >
        <Icon name="panelBeside" />
      </Button>
      {tip ? (
        <Tip x={0} y={BUTTON_PX + TIP_GAP}>
          {PRESS_WORDS}
        </Tip>
      ) : null}
    </span>
  );
}
