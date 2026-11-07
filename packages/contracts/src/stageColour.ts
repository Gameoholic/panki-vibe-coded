import { isBurned, isNew, stageIndex, type CardPlace, type SrsLadder } from "./srs";

/**
 * A stage's colour, one home for the app, the API and the extension alike. A stage's own colour (`SrsStage.colour`)
 * wins; one with none takes the default ramp's for its place on the ladder: light green at the first stage, through a
 * middle green, to dark green at the last. The end of the ladder (Burned) is grey, and New has no stage colour: it's
 * Panki's accent wherever it's drawn.
 */
export const STAGE_RAMP = ["#a6e3a1", "#3fa860", "#1d6b3c"] as const;
export const BURNED_COLOUR = "#9aa0b4";

/** Two `#rrggbb` colours mixed, `t` of the way from `a` to `b`, rounded once per channel. */
function mix(a: string, b: string, t: number): string {
  const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const [from, to] = [channels(a), channels(b)];
  return `#${from.map((c, i) => Math.round(c + ((to[i] ?? c) - c) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** The default ramp's colour for stage `i` of `n`. */
export function rampColour(i: number, n: number): string {
  const t = n <= 1 ? 0 : Math.min(1, Math.max(0, i / (n - 1)));
  const scaled = t * (STAGE_RAMP.length - 1);
  const k = Math.min(STAGE_RAMP.length - 2, Math.floor(scaled));
  return mix(STAGE_RAMP[k] ?? STAGE_RAMP[0], STAGE_RAMP[k + 1] ?? STAGE_RAMP[0], scaled - k);
}

type Colourable = Pick<SrsLadder, "stages">;

/** The colour of stage `idx` (held to the ladder: past the top is the last stage's): its own, else the ramp's. */
export function stageColourAt(type: Colourable, idx: number): string {
  const n = type.stages.length;
  const i = Math.min(Math.max(0, idx), Math.max(0, n - 1));
  return type.stages[i]?.colour?.toLowerCase() ?? rampColour(i, n);
}

/** Where a card stands, as a colour: its stage's, grey once burned, none while it's new. */
export function placeColour(type: Pick<SrsLadder, "stages" | "after">, place: CardPlace): string | null {
  if (isBurned(type, place)) return BURNED_COLOUR;
  if (isNew(place)) return null;
  return stageColourAt(type, stageIndex(type, place));
}
