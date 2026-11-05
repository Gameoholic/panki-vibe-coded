import type { CSSProperties } from "react";
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

/** One stretch of the Hold button's clock: its share of the turn, and its colour (a stage, the answer, the answer's confirmation). */
export type ClockPiece = { share: number; tone: "step" | "answer" | "confirm" };
const TONE_INK: Record<ClockPiece["tone"], string> = { step: "var(--accent)", answer: "var(--ans, var(--accent))", confirm: "var(--flag)" };
/** The gap left between two stretches, as a share of the turn. */
const CLOCK_GAP = 0.012;
const turn = (share: number) => `${share.toFixed(4)}turn`;

/**
 * The Hold button's key as one clock face for every stage of a card: a ring cut into its stretches, each in its own colour, filling
 * round from the top as far as the card has got (`--hold-from`) and the stage held fills on (`--hold`, `useHold`'s, over
 * `--hold-span`), the key's name in its middle (none while keybinds are off). `tone` is the answer's colour class
 * (`answerClass`), which its stretch is drawn in. The keycap's clock grown to the button it stands for: never a second
 * drawing of a hold.
 */
export function HoldClock({ bind, pieces, tone }: { bind: Key | undefined; pieces: readonly ClockPiece[]; tone?: string | undefined }) {
  const shown = useKeybindsEnabled();
  let at = 0;
  const paint: string[] = [];
  const gaps: string[] = [`transparent 0 ${turn(CLOCK_GAP / 2)}`];
  pieces.forEach((piece, i) => {
    const end = at + piece.share;
    paint.push(`${TONE_INK[piece.tone]} ${turn(at)} ${turn(end)}`);
    if (i < pieces.length - 1) gaps.push(`#000 0 ${turn(end - CLOCK_GAP / 2)}`, `transparent 0 ${turn(end + CLOCK_GAP / 2)}`);
    at = end;
  });
  gaps.push(`#000 0 ${turn(1 - CLOCK_GAP / 2)}`, "transparent 0");
  const style = {
    "--clock-paint": paint.length > 0 ? `conic-gradient(${paint.join(", ")})` : "none",
    "--clock-gaps": pieces.length > 1 ? `conic-gradient(${gaps.join(", ")})` : "linear-gradient(#000 0 0)",
  } as CSSProperties;
  return (
    <span className={`hold-clock ${tone ?? ""}`.trim()} style={style} aria-hidden="true">
      <span className="hold-clock-key">{bind?.key && shown ? keyWords(bind.key) : null}</span>
    </span>
  );
}
