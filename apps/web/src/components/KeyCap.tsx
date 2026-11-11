/** @panki A key as its keycap on the button it presses, a clock face filling while it's held (`KeyCap`, `holdFor`). */
import { DOUBLE_PRESS, pressKind, useKeybindsEnabled, type Key } from "../keys";
import { keyWords } from "../words";

/**
 * How a key is pressed before its button does its thing: its own hold, and `extra` on top (confirmation's); a double
 * press is `DOUBLE_PRESS` whatever's on top, its second press being its yes; none, a press.
 */
export const holdFor = (bind: Key | undefined, extra = 0) => (!bind?.key ? 0 : pressKind(bind) === "double" ? DOUBLE_PRESS : bind.holdMs + extra);

/**
 * A key as its keycap on the button it presses (this device's, `keys.ts`; an action's own key, not its second), none
 * when it has none, and none while keybinds are off on this device (`useKeybindsEnabled`); a key that's held is
 * a clock face that fills as it's held (`useHold`, `.key.is-hold`); one pressed twice is its keycap twice.
 */
export function KeyCap({ bind, extra = 0 }: { bind: Key | undefined; extra?: number }) {
  const shown = useKeybindsEnabled();
  if (!bind?.key || !shown) return null;
  const words = keyWords(bind.key);
  if (pressKind(bind) === "double")
    return (
      <span className="key-twice">
        <span className="key">{words}</span>
        <span className="key">{words}</span>
      </span>
    );
  return <span className={holdFor(bind, extra) > 0 ? "key is-hold" : "key"}>{words}</span>;
}
