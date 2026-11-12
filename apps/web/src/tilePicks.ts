/** @panki A tile's window, custom frame, view and measure as this device last picked them, per tile (`readTilePick`, `writeTilePick`, `TilePick`). */
import { CALENDAR_WINDOWS, STAT_WINDOWS, StatFrame, type WindowId } from "@panki/contracts";
import { ledger } from "./ledger";

/**
 * Kept on this device for every tile, as a deck's sort is: how the numbers are read is the device's, not the account's,
 * and the same tile on the home and on Stats shares its pick. A window is one of `STAT_WINDOWS` or `custom`, the frame
 * kept beside it as an amount and a unit (Custom…, "3 w"); a streak's tile keeps the stretch its Show more draws as
 * `span` instead. Read defensively: a window or a view the tile doesn't offer
 * (any more), or `custom` with no frame that reads, is its default, which the tile decides. Every pick is a `tile` row
 * in the ledger.
 */
export type TilePick = { window?: WindowId; frame?: StatFrame; view?: string; measure?: string; span?: string };

const KEY = "panki.tiles";

function readAll(): Record<string, TilePick> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    const out: Record<string, TilePick> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (typeof value !== "object" || value === null) continue;
      const pick: TilePick = {};
      const frame = "frame" in value ? StatFrame.safeParse(value.frame) : null;
      if (frame?.success) pick.frame = frame.data;
      const window = "window" in value ? [...STAT_WINDOWS, ...CALENDAR_WINDOWS, "custom" as const].find((w) => w === value.window) : undefined;
      if (window && (window !== "custom" || pick.frame)) pick.window = window;
      if ("view" in value && typeof value.view === "string") pick.view = value.view;
      if ("measure" in value && typeof value.measure === "string") pick.measure = value.measure;
      if ("span" in value && typeof value.span === "string") pick.span = value.span;
      out[id] = pick;
    }
    return out;
  } catch {
    return {};
  }
}

/** What this device last picked for a tile; nothing for one never touched here. */
export function readTilePick(id: string): TilePick {
  return readAll()[id] ?? {};
}

/**
 * Keeps a tile's window (a frame with Custom…), view or measure for next time; or a streak's Show more stretch
 * (`span`, the tile's own choices, a frame with Custom…), which no window of the stats is.
 */
export function writeTilePick(
  id: string,
  change: { window: Exclude<WindowId, "custom"> } | { window: "custom"; frame: StatFrame } | { view: string } | { measure: string } | { span: string } | { span: "custom"; frame: StatFrame },
) {
  const all = readAll();
  all[id] = { ...all[id], ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or switched off: the tile keeps its pick for this visit and starts from its default next time.
  }
  ledger.record("tile", { data: { id, ...change } });
}
