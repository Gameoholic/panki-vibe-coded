/** @panki The home board as this device has it: doors and tiles in one order, and those put away, a streak's tile among them (`DOOR_IDS`, `BoardLayout`, `readLayout`, `writeLayout`, `fitStreaks`). */
import { ledger } from "./ledger";
import { STREAK_TILE, WIDGETS, streakTileId, widgetOf, type WidgetId } from "./widgets";

/** The home's doors, in the order they stand before anything is moved. Their details are the home's. */
export const DOOR_IDS = ["door-review", "door-decks", "door-add", "door-types", "door-srs"] as const;
export type DoorId = (typeof DOOR_IDS)[number];
/** A streak's tile (`streakTileId`): one per streak, the streaks being the account's. */
export type StreakTileId = `${typeof STREAK_TILE}${string}`;
/** A tile on the home: one of the registry's, or a streak's. */
export type TileItemId = WidgetId | StreakTileId;
/** What sits on the home's board: a door or a tile. */
export type BoardItemId = DoorId | TileItemId;

export const isDoorId = (x: unknown): x is DoorId => typeof x === "string" && (DOOR_IDS as readonly string[]).includes(x);
export const isStreakTile = (x: unknown): x is StreakTileId => typeof x === "string" && x.startsWith(STREAK_TILE) && x.length > STREAK_TILE.length;

/**
 * How the home is laid out on this device: the doors and the tiles in one order (a door is moved like any tile), and
 * the tiles that are put away. Kept in the browser, not on the server, because the phone and the PC are set up
 * differently on purpose. Read defensively: a missing or broken value is the default, an id the registry no longer
 * has is dropped, a door not placed yet stands at the front, and a widget the registry gained since is put away
 * rather than let onto the home uninvited. A streak's tile is kept as it was stored until the settings say which
 * streaks there are (`fitStreaks`). Every change is a `layout` row in the ledger.
 */
export type BoardLayout = {
  order: BoardItemId[];
  hidden: TileItemId[];
};

/**
 * The tiles on the home before anything is changed. `streak` is the one Streak tile from before streaks were many:
 * kept so, it stands for the first streak's tile (`fitStreaks`).
 */
const DEFAULT_TILES: readonly TileItemId[] = ["status", "streak", "heat", "coming"];
// "hold" is this way of arranging's name among others it was once tried beside; the key keeps the name so what's
// already arranged on a device stays.
const KEY = "panki.board.hold";
/** Tiles folded into another, read as the one they're in: Days studied into Activity, Watch time into Time watching. */
const FOLDED: Readonly<Record<string, WidgetId>> = { days: "heat", "watch-time": "watched" };

const isHomeId = (x: unknown): x is WidgetId => typeof x === "string" && widgetOf(x)?.home === true;
/** A tile the home keeps: one of the registry's it offers, a streak's, or the Streak tile from before. */
const isTileItem = (x: unknown): x is TileItemId => isHomeId(x) || isStreakTile(x) || x === "streak";

/** Whatever was stored, settled against the registry: ids it knows, each once, the rest put away. */
function settle(order: unknown, hidden: unknown): BoardLayout {
  const seen = new Set<string>();
  const pick = <T extends BoardItemId>(list: unknown, ok: (x: unknown) => x is T): T[] => {
    if (!Array.isArray(list)) return [];
    const ids: T[] = [];
    for (const raw of list) {
      const x: unknown = typeof raw === "string" ? (FOLDED[raw] ?? raw) : raw;
      if (!ok(x) || seen.has(x)) continue;
      seen.add(x);
      ids.push(x);
    }
    return ids;
  };
  const picked = pick<BoardItemId>(order, (x): x is BoardItemId => isTileItem(x) || isDoorId(x));
  picked.unshift(...DOOR_IDS.filter((d) => !seen.has(d)));
  const away = pick<TileItemId>(hidden, isTileItem);
  for (const w of WIDGETS) if (w.home && !seen.has(w.id)) away.push(w.id);
  return { order: picked, hidden: away };
}

/**
 * Tiles put on the home once, on each device, the first time it's read after they joined the registry, so the
 * home shows what's new; from then on each is like any tile,
 * put away with its × and brought back by hand. The ones already put out are kept beside the layout, so one put away
 * stays away. Each goes at the end, or right after the last door (`afterDoors`), near the top. Each streak's tile is
 * put out so too, once its streak is known (`fitStreaks`).
 */
const PUT_OUT: readonly { id: WidgetId; afterDoors?: true }[] = [{ id: "continue" }, { id: "watched" }, { id: "channels" }, { id: "recent" }, { id: "status", afterDoors: true }];
const PUT_OUT_KEY = "panki.board.putOut";

function readPutOut(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PUT_OUT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // Unreadable: every tile is put out again, once.
    return [];
  }
}
function writePutOut(done: readonly string[]) {
  try {
    localStorage.setItem(PUT_OUT_KEY, JSON.stringify(done));
  } catch {
    // Storage switched off: they're put out on every visit, as the rest of the layout can't be kept either.
  }
}

function readStored(): BoardLayout {
  const fallback = () => settle(DEFAULT_TILES, []);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return fallback();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback();
    return settle("order" in parsed ? parsed.order : undefined, "hidden" in parsed ? parsed.hidden : undefined);
  } catch {
    return fallback();
  }
}

export function readLayout(): BoardLayout {
  const layout = readStored();
  const done = readPutOut();
  const due = PUT_OUT.filter((t) => !done.includes(t.id) && isHomeId(t.id));
  if (due.length === 0) return layout;
  const dueIds: readonly string[] = due.map((t) => t.id);
  const { order } = layout;
  // Each one not on the home yet, where it goes.
  const placed = (afterDoors: boolean) => due.filter((t) => (t.afterDoors === true) === afterDoors && !order.includes(t.id)).map((t) => t.id);
  const lastDoor = order.reduce((at, id, i) => (isDoorId(id) ? i : at), -1);
  const next: BoardLayout = {
    order: [...order.slice(0, lastDoor + 1), ...placed(true), ...order.slice(lastDoor + 1), ...placed(false)],
    hidden: layout.hidden.filter((id) => !dueIds.includes(id)),
  };
  writePutOut([...done, ...dueIds]);
  writeLayout(next);
  return next;
}

/**
 * The layout fitted to the account's streaks, once they're known: the Streak tile from before is the first streak's,
 * a streak gone takes its tile with it, and a streak never put out on this device is, once, at the end. Null when
 * nothing changes.
 */
export function fitStreaks(layout: BoardLayout, streakIds: readonly string[]): BoardLayout | null {
  const tiles = streakIds.map(streakTileId);
  const first = tiles[0];
  const fit = <T extends BoardItemId>(list: readonly T[], taken: ReadonlySet<string>): T[] => {
    const out: T[] = [];
    for (const x of list) {
      const id = x === "streak" ? first : x;
      if (id === undefined || (isStreakTile(id) && !tiles.includes(id)) || taken.has(id) || out.includes(id as T)) continue;
      out.push(id as T);
    }
    return out;
  };
  const order = fit(layout.order, new Set());
  const hidden = fit(layout.hidden, new Set(order));
  const done = readPutOut();
  const due = tiles.filter((id) => !done.includes(id) && !order.includes(id) && !hidden.includes(id));
  const marked = tiles.filter((id) => !done.includes(id));
  if (marked.length > 0) writePutOut([...done, ...marked]);
  const next: BoardLayout = { order: [...order, ...due], hidden };
  const same = next.order.length === layout.order.length && next.hidden.length === layout.hidden.length && next.order.every((x, i) => x === layout.order[i]) && next.hidden.every((x, i) => x === layout.hidden[i]);
  return same ? null : next;
}

export function writeLayout(layout: BoardLayout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Storage full or switched off: the home keeps its layout for this visit and starts over next time.
  }
  ledger.record("layout", { data: { order: layout.order, hidden: layout.hidden } });
}
