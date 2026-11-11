/** @panki The board: the home's doors and tiles, and every tile on Stats, held to arrange (`Board`). Never a second way of arranging. */
import { useEffect, type ReactNode } from "react";
import { streakNameOf, type Settings, type Stats } from "@panki/contracts";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { KeyCap } from "./KeyCap";
import { Bone } from "./Skeleton";
import type { Bind } from "../keys";
import { rememberShape, shapeOf } from "../skeletonMemory";
import { useGridDrag } from "../hooks/useGridDrag";
import { isDoorId, isStreakTile, type BoardItemId, type BoardLayout, type DoorId, type TileItemId } from "../layout";
import { NewStreakTile, StreakTile, Tile, WIDGETS, isOfStreaks, streakIdOfTile, streakTileId, widgetOf, type WidgetContext } from "../widgets";

/** One of the home's doors, as the home describes it; the Board draws it. */
export type DoorSpec = {
  id: DoorId;
  icon: IconName;
  label: string;
  /** The line under its name; null while what it says is loading, drawn as its shape (`Bone`). */
  detail: string | null;
  /** Small words after the line, when there's something to add to it. */
  note?: string | null;
  /** The accent one: only while there's something to do. */
  hot?: boolean;
  /** The key that opens it from the keyboard, its keycap after the name (Settings → Keybinds). */
  bind?: Bind;
  onClick: () => void;
};

/** What makes a board the home's: its doors, its layout on this device, and the arranging, which the home owns so its header can end it. */
type HomeBoard = {
  doors: readonly DoorSpec[];
  layout: BoardLayout;
  onLayout: (next: BoardLayout) => void;
  arranging: boolean;
  onArranging: (on: boolean) => void;
};

type Props = {
  stats: Stats | null;
  ctx: WidgetContext | null;
  /** The numbers on screen are the last ones while the next load. */
  stale?: boolean;
  /** Given, the board is the home: doors and chosen tiles, arranged by hand. Without it, it is every tile, as Stats → Overview shows them. */
  home?: HomeBoard;
  /** Stats → Streaks: Streak status, every streak's tile, then the dashed tile a new one is made from; greyed while Streaks is Off. */
  streaks?: boolean;
};

/** How long a still press takes to start the arranging, and to lift a tile once it is (a pull lifts it sooner). */
const HOLD_TO_ARRANGE = 450;
const HOLD_WHILE_ARRANGING = 120;
/** How many streak tiles this device last drew, for the shells while the settings load. */
const STREAK_TILES_SHAPE = "tiles:streaks";
/** An id read off the DOM, back as what it names: the doors, the registry and the streaks are the only lists. */
const itemOf = (id: string): BoardItemId | null => (isDoorId(id) || isStreakTile(id) ? id : (widgetOf(id)?.id ?? null));

/** The two change places; everything else stays where it is. */
function swap<T>(list: readonly T[], a: T, b: T): T[] {
  const i = list.indexOf(a);
  const j = list.indexOf(b);
  if (i < 0 || j < 0) return [...list];
  const next = [...list];
  next[i] = b;
  next[j] = a;
  return next;
}

/** A tile's name for the put-away chips: the registry's, or its streak's. */
function tileName(id: TileItemId, settings: Settings | null): string | null {
  const streakId = streakIdOfTile(id);
  if (streakId === null) return widgetOf(id)?.name ?? null;
  const rule = settings?.streaks.find((s) => s.id === streakId);
  return rule ? streakNameOf(rule) : null;
}

/**
 * The board: three tiles to a row on a PC, one on the phone. On Stats → Overview it is every tile but the streaks', on
 * Stats → Streaks Streak status, every streak's and the dashed one that makes a new one. On the home it is the
 * doors and the tiles this device was set up with, arranged by hand: a still hold on anything starts the arranging; from then a tile or a door is carried under the pointer
 * and let go on another to trade places with it, a × puts a tile away, the dashed tile at the end brings one back,
 * and it ends only on purpose, with the header's Done or Escape. Nothing shakes while it's on. Streaks Off takes every
 * streak's tile and Streak status off the home, and greys them on Stats → Streaks.
 */
export function Board({ stats, ctx, stale = false, home, streaks = false }: Props) {
  const arranging = home?.arranging ?? false;
  const endArranging = home?.onArranging;
  const settings = ctx?.settings ?? null;
  const streaksOn = settings?.streaksOn ?? true;

  function hide(id: TileItemId) {
    if (!home) return;
    home.onLayout({ order: home.layout.order.filter((x) => x !== id), hidden: [...home.layout.hidden, id] });
  }
  function show(id: TileItemId) {
    if (!home) return;
    home.onLayout({ order: [...home.layout.order.filter((x) => x !== id), id], hidden: home.layout.hidden.filter((x) => x !== id) });
  }
  /** What letting one thing go over another makes of the layout: the two change places. Null when either isn't of the board. */
  function dropped(from: string, to: string): BoardLayout | null {
    const f = itemOf(from);
    const t = itemOf(to);
    if (!home || f === null || t === null) return null;
    return { ...home.layout, order: swap(home.layout.order, f, t) };
  }

  // Before the board is being arranged, only a still hold lifts a tile (and starts the arranging): a move is the page
  // scrolling. Once it is, a tile comes away the moment it's pulled.
  const drag = useGridDrag({
    enabled: home !== undefined,
    hold: arranging ? HOLD_WHILE_ARRANGING : HOLD_TO_ARRANGE,
    eager: arranging,
    onStart: () => {
      if (!arranging) home?.onArranging(true);
    },
    onMove: (from, to) => {
      const next = dropped(from, to);
      if (next) home?.onLayout(next);
    },
  });
  // While a tile is carried the board is drawn as letting go right now would leave it; the layout itself changes once, on the drop.
  const carried = drag.lifted !== null && drag.over !== null ? dropped(drag.lifted, drag.over) : null;
  // Overview leaves out what's the streaks' (Streak status), which heads Stats → Streaks.
  const items: readonly BoardItemId[] = home ? (carried ?? home.layout).order : WIDGETS.filter((w) => !w.ofStreaks).map((w) => w.id);

  // Arranging ends on purpose only: Escape here, or the header's Done. A press on the ground doesn't end it, so a tile
  // let go between two others never closes the whole thing.
  useEffect(() => {
    if (!arranging || !endArranging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endArranging(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arranging, endArranging]);

  // How many streaks there are, for Stats → Streaks' shells next time the settings are still on their way.
  const streakCount = settings ? settings.streaks.length : null;
  useEffect(() => {
    if (streakCount !== null) rememberShape(STREAK_TILES_SHAPE, streakCount);
  }, [streakCount]);

  const door = (spec: DoorSpec) => (
    <Button
      key={spec.id}
      id={spec.id}
      variant="door"
      data-id={spec.id}
      className={`${spec.hot ? "is-hot" : ""} ${spec.id === "door-review" ? "is-main" : ""} ${drag.tileClass(spec.id)}`.trim()}
      style={drag.tileStyle(spec.id)}
      // While the board is being arranged a door is a tile to move, not a place to go.
      onClick={arranging ? undefined : spec.onClick}
    >
      <Icon name={spec.icon} className="door-icon" />
      <span className="door-label">
        {spec.label}
        <KeyCap bind={spec.bind} />
      </span>
      {spec.detail === null ? (
        <Bone w="6em" h="0.8em" className="door-detail" />
      ) : (
        <span className="door-detail">
          {spec.detail}
          {spec.note && <small className="door-note">{spec.note}</small>}
        </span>
      )}
    </Button>
  );

  const overlayOf = (id: TileItemId, name: string) =>
    arranging ? (
      <Button className="btn-icon tile-x" aria-label={`Hide ${name}`} data-no-drag onClick={() => hide(id)}>
        <Icon name="close" />
      </Button>
    ) : undefined;

  /** A streak's tile while the streak is there (on the home, while Streaks is on too); on Stats, its shell while the settings load. */
  const streakTile = (id: TileItemId, streakId: string | null): ReactNode => {
    const rule = streakId === null ? undefined : settings?.streaks.find((s) => s.id === streakId);
    if (settings && (!rule || (!streaksOn && !streaks))) return null;
    const state = stats?.streaks.find((s) => s.id === streakId);
    return (
      <StreakTile
        key={id}
        id={id}
        rule={rule}
        state={state}
        today={stats?.today ?? null}
        ctx={ctx}
        className={drag.tileClass(id)}
        style={drag.tileStyle(id)}
        overlay={overlayOf(id, rule ? streakNameOf(rule) : "")}
      />
    );
  };

  const doorById = new Map((home?.doors ?? []).map((d) => [d.id, d]));
  const away = (home?.layout.hidden ?? []).flatMap((id) => {
    const name = tileName(id, settings);
    // A streak's tile, or Streak status, put away comes back only while Streaks is on.
    return name === null || (isOfStreaks(id) && !streaksOn) ? [] : [{ id, name }];
  });
  const { className: dragClass, ...rootProps } = drag.rootProps;
  if (streaks) {
    const off = settings !== null && !streaksOn;
    return (
      <div className={`board ${stale ? "is-stale" : ""} ${off ? "is-off" : ""}`.trim()} aria-label="Streaks" aria-busy={stale} inert={off}>
        {WIDGETS.filter((w) => w.ofStreaks).map((entry) => (
          <Tile key={entry.id} entry={entry} stats={stats} ctx={ctx} />
        ))}
        {settings ? settings.streaks.map((s) => streakTile(streakTileId(s.id), s.id)) : Array.from({ length: shapeOf(STREAK_TILES_SHAPE, 1) }, (_, i) => streakTile(streakTileId(`shell-${i}`), null))}
        <NewStreakTile ctx={ctx} />
      </div>
    );
  }
  return (
    <div {...rootProps} className={`board ${arranging ? "is-arranging" : ""} ${stale ? "is-stale" : ""} ${dragClass}`.trim()} aria-label={home ? "Home" : "Stats"} aria-busy={stale}>
      {items.map((id) => {
        if (isDoorId(id)) {
          const spec = doorById.get(id);
          return spec ? door(spec) : null;
        }
        if (isStreakTile(id)) return streakTile(id, streakIdOfTile(id));
        const entry = widgetOf(id);
        if (!entry) return null;
        if (entry.ofStreaks && settings && !streaksOn) return null;
        return <Tile key={entry.id} entry={entry} stats={stats} ctx={ctx} className={drag.tileClass(entry.id)} style={drag.tileStyle(entry.id)} overlay={overlayOf(entry.id, entry.name)} />;
      })}
      {/* Where a tile put away comes back from. */}
      {arranging ? (
        <div className="tile-add" data-no-drag>
          <span className="w-ctl">{away.length > 0 ? "Put away" : "Nothing put away"}</span>
          {away.length > 0 ? (
            <div className="chips">
              {away.map((tile) => (
                <Button key={tile.id} variant="chip" className="chip-add" onClick={() => show(tile.id)}>
                  <Icon name="add" />
                  {tile.name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
