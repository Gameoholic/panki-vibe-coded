/** @panki A stage's colour for the app, the API and the extension alike: its own, else the ramp's; Burned's; New's (`stageColourAt`, `placeColour`, `STAGE_RAMP`). */
import { isBurned, isNew, stageIndex, type CardPlace, type SrsLadder, type SrsType } from "./srs";

/**
 * A stage's colour, one home for the app, the API and the extension alike. A stage's own colour (`SrsStage.colour`)
 * wins; one with none takes the default ramp's for its place on the ladder: light green at the first stage, through a
 * middle green, to dark green at the last. The end of the ladder (Burned) is grey. New has a colour only when its type
 * gives it one (`SrsType.newColour`); with none it's drawn plain, Panki's accent where it stands as a place of its own.
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
/** What New's colour is read from: a type, or anything carrying its `newColour`. */
export type NewColoured = Partial<Pick<SrsType, "newColour">>;

/** The colour of stage `idx` (held to the ladder: past the top is the last stage's): its own, else the ramp's. */
export function stageColourAt(type: Colourable, idx: number): string {
  const n = type.stages.length;
  const i = Math.min(Math.max(0, idx), Math.max(0, n - 1));
  return type.stages[i]?.colour?.toLowerCase() ?? rampColour(i, n);
}

/** New's colour: the type's own, none when it has none. */
export function newColourOf(type: NewColoured): string | null {
  return type.newColour?.toLowerCase() ?? null;
}

/** Where a card stands, as a colour: its stage's, grey once burned, New's own while it's new (none when it has none). */
export function placeColour(type: Pick<SrsLadder, "stages" | "after"> & NewColoured, place: CardPlace): string | null {
  if (isBurned(type, place)) return BURNED_COLOUR;
  if (isNew(place)) return newColourOf(type);
  return stageColourAt(type, stageIndex(type, place));
}
