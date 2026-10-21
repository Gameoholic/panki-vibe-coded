import { ledger } from "./ledger";
import { WIDGETS, widgetOf, type WidgetId } from "./widgets";

/** The home's doors, in the order they stand before anything is moved. Their details are the home's. */
export const DOOR_IDS = ["door-review", "door-decks", "door-add", "door-types", "door-srs"] as const;
export type DoorId = (typeof DOOR_IDS)[number];
/** What sits on the home's board: a door or a tile. */
export type BoardItemId = DoorId | WidgetId;

export const isDoorId = (x: unknown): x is DoorId => typeof x === "string" && (DOOR_IDS as readonly string[]).includes(x);

/**
 * How the home is laid out on this device: the doors and the tiles in one order (a door is moved like any tile), and
 * the tiles that are put away. Kept in the browser, not on the server, because the phone and the PC are set up
 * differently on purpose. Read defensively: a missing or broken value is the default, an id the registry no longer
 * has is dropped, a door not placed yet stands at the front, and a widget the registry gained since is put away
 * rather than let onto the home uninvited. Every change is a `layout` row in the ledger.
 */
export type BoardLayout = {
  order: BoardItemId[];
  hidden: WidgetId[];
};

/** The tiles on the home before anything is changed. */
const DEFAULT_TILES: readonly WidgetId[] = ["streak", "heat", "coming"];
// "hold" is what this way of arranging was called while six were tried side by side, each with its own layout
// (2026-10-11). It is the one that was chosen; the key keeps its name so what's already arranged on a device stays.
const KEY = "panki.board.hold";

const isHomeId = (x: unknown): x is WidgetId => typeof x === "string" && widgetOf(x)?.home === true;

/** Whatever was stored, settled against the registry: ids it knows, each once, the rest put away. */
function settle(order: unknown, hidden: unknown): BoardLayout {
  const seen = new Set<string>();
  const pick = (list: unknown, doors: boolean): BoardItemId[] => {
    if (!Array.isArray(list)) return [];
    const ids: BoardItemId[] = [];
    for (const x of list) {
      const ok = isHomeId(x) || (doors && isDoorId(x));
      if (!ok || seen.has(x)) continue;
      seen.add(x);
      ids.push(x);
    }
    return ids;
  };
  const picked = pick(order, true);
  picked.unshift(...DOOR_IDS.filter((d) => !seen.has(d)));
  const away = pick(hidden, false).filter(isHomeId);
  for (const w of WIDGETS) if (w.home && !seen.has(w.id)) away.push(w.id);
  return { order: picked, hidden: away };
}

/**
 * Tiles put on the home once, on each device, the first time it's read after they joined the registry (the owner,
 * 2026-10-21, of the watching tiles: "edit it to look with all the modules on"); from then on each is like any tile,
 * put away with its × and brought back by hand. The ones already put out are kept beside the layout, so one put away
 * stays away.
 */
const PUT_OUT: readonly WidgetId[] = ["continue", "watched", "watch-time", "channels"];
const PUT_OUT_KEY = "panki.board.putOut";

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
  let done: string[] = [];
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PUT_OUT_KEY) ?? "[]");
    done = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // Unreadable: every tile is put out again, once.
  }
  const due = PUT_OUT.filter((id) => !done.includes(id) && isHomeId(id));
  if (due.length === 0) return layout;
  const next: BoardLayout = {
    order: [...layout.order, ...due.filter((id) => !layout.order.includes(id))],
    hidden: layout.hidden.filter((id) => !due.includes(id)),
  };
  try {
    localStorage.setItem(PUT_OUT_KEY, JSON.stringify([...done, ...due]));
  } catch {
    // Storage switched off: they're put out on every visit, as the rest of the layout can't be kept either.
  }
  writeLayout(next);
  return next;
}

export function writeLayout(layout: BoardLayout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Storage full or switched off: the home keeps its layout for this visit and starts over next time.
  }
  ledger.record("layout", { data: { order: layout.order, hidden: layout.hidden } });
}
