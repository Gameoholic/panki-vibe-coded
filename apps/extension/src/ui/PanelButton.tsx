import { useState } from "react";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { KeyCap } from "@web/components/KeyCap";
import { Tip } from "@web/components/Tip";
import type { Key } from "@web/keys";

/** What a press does, said under each button while a mouse rests on it. */
const PRESS_WORDS = { show: "Show panel", hide: "Hide panel" } as const;
/** The room between a button's foot and its tip, in px. */
const TIP_GAP = 8;

/** Where a button's tip hangs: under it, ending flush with its right edge, so it never runs off the screen or the column (`.tip` moved there by its CSS). */
type TipAt = { x: number; y: number };
const tipUnder = (button: HTMLElement): TipAt => ({ x: button.offsetWidth, y: button.offsetHeight + TIP_GAP });

/** A tip shown while a mouse rests on the button or it has the keyboard's focus; a touch screen has no tip, so the words are in the button's label too. */
function useTip() {
  const [tip, setTip] = useState<TipAt | null>(null);
  return {
    tip,
    handlers: {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse") setTip(tipUnder(e.currentTarget));
      },
      onPointerLeave: () => setTip(null),
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        if (e.currentTarget.matches(":focus-visible")) setTip(tipUnder(e.currentTarget));
      },
      onBlur: () => setTip(null),
    },
  };
}

/**
 * The Panki panel's button in the screen's top-right corner in the site's full screen, while the panel is folded away:
 * a round disc of the player's own dark glass with the panel's icon, as the site draws its playlist button there,
 * pressed to bring the panel back. It stands in a place of Panki's fixed over everything that fills the screen
 * (`content/youtube.tsx` → `corner`), which the page shows and hides with the player's own controls. What a press
 * does is the app's `Tip` under it.
 */
export function PanelButton({ onOpen }: { onOpen: () => void }) {
  const { tip, handlers } = useTip();
  return (
    <span className="yt-corner">
      <Button className="yt-corner-button" aria-label={PRESS_WORDS.show} onClick={onOpen} {...handlers}>
        <Icon name="panelBeside" />
      </Button>
      {tip ? (
        <Tip x={tip.x} y={tip.y}>
          {PRESS_WORDS.show}
        </Tip>
      ) : null}
    </span>
  );
}

/**
 * Hide panel among the panel head's tools in full screen: an icon button of the tools' own kind, the panel's icon, as
 * the menu's ≡ beside it is, pressed to fold the panel away (the button in the screen's corner, or the key, brings it
 * back). What a press does and its key (`bind`, the panel's own, as its keycap) are the app's `Tip` under it.
 */
export function HidePanelButton({ bind, onHide }: { bind: Key; onHide: () => void }) {
  const { tip, handlers } = useTip();
  return (
    <span className="strip-hide">
      <Button className="capture-tool btn-icon" aria-label={PRESS_WORDS.hide} onClick={onHide} {...handlers}>
        <Icon name="panelBeside" />
      </Button>
      {tip ? (
        <Tip x={tip.x} y={tip.y}>
          {PRESS_WORDS.hide}
          <KeyCap bind={bind} />
        </Tip>
      ) : null}
    </span>
  );
}
