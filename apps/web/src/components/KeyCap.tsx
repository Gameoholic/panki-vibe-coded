import type { Bind } from "../keys";
import { keyWords } from "../words";

/** How long a key is held before its button does its thing: its own hold, and `extra` on top (confirmation's). */
export const holdFor = (bind: Bind | undefined, extra = 0) => (bind?.key ? bind.holdMs + extra : 0);

/**
 * A key as its keycap on the button it presses (this device's, `keys.ts`), none when it has none; a key that's held
 * is a clock face that fills as it's held (`useHold`, `.key.is-hold`).
 */
export function KeyCap({ bind, extra = 0 }: { bind: Bind | undefined; extra?: number }) {
  if (!bind?.key) return null;
  return <span className={holdFor(bind, extra) > 0 ? "key is-hold" : "key"}>{keyWords(bind.key)}</span>;
}
