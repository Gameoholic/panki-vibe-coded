import { useEffect, type CSSProperties } from "react";
import type { Stats } from "@panki/contracts";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Bone, Skeleton } from "./Skeleton";
import { rememberShape, shapeOf } from "../skeletonMemory";
import { useGridDrag } from "../hooks/useGridDrag";
import { isDoorId, type BoardItemId, type BoardLayout, type DoorId } from "../layout";
import { controlOf, WIDGETS, Widget, widgetOf, type WidgetContext, type WidgetEntry, type WidgetId } from "../widgets";

/** One of the home's doors, as the home describes it; the Board draws it. */
export type DoorSpec = {
  id: DoorId;
  icon: IconName;
  label: string;
  /** The line under its name; null while what it says is loading, drawn as its shape (`Bone`). */
  detail: string | null;
  /** The accent one: only while there's something to do. */
  hot?: boolean;
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
  /** Given, the board is the home: doors and chosen tiles, arranged by hand. Without it, it is every tile, as the Stats tab shows them. */
  home?: HomeBoard;
};

/** How long a still press takes to start the arranging, and to lift a tile once it is (a pull lifts it sooner). */
const HOLD_TO_ARRANGE = 450;
const HOLD_WHILE_ARRANGING = 120;
/** An id read off the DOM, back as what it names: the doors and the registry are the only lists. */
const itemOf = (id: string): BoardItemId | null => (isDoorId(id) ? id : (widgetOf(id)?.id ?? null));

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

/**
 * The board: three tiles to a row on a PC, one on the phone. On the Stats tab it is every tile. On the home it is the
 * doors and the tiles this device was set up with, arranged by hand (the owner's pick of six ways tried on
 * 2026-10-11): a still hold on anything starts the arranging; from then a tile or a door is carried under the pointer
 * and let go on another to trade places with it, a × puts a tile away, the dashed tile at the end brings one back,
 * and it ends only on purpose, with the header's Done or Escape. Nothing shakes while it's on.
 */
export function Board({ stats, ctx, stale = false, home }: Props) {
  const arranging = home?.arranging ?? false;
  const endArranging = home?.onArranging;

  function hide(id: WidgetId) {
    if (!home) return;
    home.onLayout({ order: home.layout.order.filter((x) => x !== id), hidden: [...home.layout.hidden, id] });
  }
  function show(id: WidgetId) {
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
  const items: readonly BoardItemId[] = home ? (carried ?? home.layout).order : WIDGETS.map((w) => w.id);

  // Arranging ends on purpose only: Escape here, or the header's Done. A press on the ground used to end it too, and
  // a tile let go between two others then closed the whole thing; the owner had that taken out (2026-10-11).
  useEffect(() => {
    if (!arranging || !endArranging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endArranging(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arranging, endArranging]);

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
      <span className="door-label">{spec.label}</span>
      {spec.detail === null ? <Bone w="6em" h="0.8em" className="door-detail" /> : <span className="door-detail">{spec.detail}</span>}
    </Button>
  );

  // A tile's real height is remembered on this device, and held while its body is a skeleton, so nothing grows or
  // shrinks as its numbers arrive (`skeletonMemory.ts`; the owner, 2026-10-26: the skeleton fits what comes).
  const tileHeight = (id: string): CSSProperties | undefined => {
    const kept = shapeOf(`tile:${id}`, 0);
    return kept > 0 ? { minHeight: `${kept}px` } : undefined;
  };
  const tile = (entry: WidgetEntry) => (
    <Widget
      key={entry.id}
      entry={entry}
      control={controlOf(entry, stats)}
      className={drag.tileClass(entry.id)}
      ref={
        stats && ctx
          ? (el) => {
              if (el !== null) rememberShape(`tile:${entry.id}`, el.offsetHeight);
            }
          : undefined
      }
      // A wide tile takes two of the board's columns.
      style={{ ...(entry.wide ? ({ "--w": 2 } as CSSProperties) : undefined), ...drag.tileStyle(entry.id), ...(stats && ctx ? undefined : tileHeight(entry.id)) }}
      overlay={
        arranging ? (
          <Button className="tile-x" aria-label={`Hide ${entry.name}`} data-no-drag onClick={() => hide(entry.id)}>
            <Icon name="close" />
          </Button>
        ) : undefined
      }
    >
      {stats && ctx ? entry.render(stats, ctx) : <Skeleton shape="tile" />}
    </Widget>
  );

  const doorById = new Map((home?.doors ?? []).map((d) => [d.id, d]));
  const away = (home?.layout.hidden ?? []).flatMap((id) => widgetOf(id) ?? []);
  const { className: dragClass, ...rootProps } = drag.rootProps;
  return (
    <div {...rootProps} className={`board ${arranging ? "is-arranging" : ""} ${stale ? "is-stale" : ""} ${dragClass}`.trim()} aria-label={home ? "Home" : "All Stats"} aria-busy={stale}>
      {items.map((id) => {
        if (isDoorId(id)) {
          const spec = doorById.get(id);
          return spec ? door(spec) : null;
        }
        const entry = widgetOf(id);
        return entry ? tile(entry) : null;
      })}
      {/* Where a tile put away comes back from. */}
      {arranging ? (
        <div className="tile-add" data-no-drag>
          <span className="w-ctl">{away.length > 0 ? "Put away" : "Nothing put away"}</span>
          {away.length > 0 ? (
            <div className="chips">
              {away.map((entry) => (
                <Button key={entry.id} variant="chip" className="chip-add" onClick={() => show(entry.id)}>
                  <Icon name="add" />
                  {entry.name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
