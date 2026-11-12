/** @panki A home door (`Door`, `DoorSpec`, `DoorWay`): one way in, a figure at its right if it has one, or two in rows (`rows`) with their counts. */
import type { CSSProperties } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { KeyCap } from "./KeyCap";
import { Bone } from "./Skeleton";
import type { Bind } from "../keys";
import type { DoorId } from "../layout";

/** One way in a door offers, as the home describes it. */
export type DoorWay = {
  icon: IconName;
  label: string;
  /** The line under its name; null while what it says is loading, drawn as its shape (`Bone`). */
  detail: string | null;
  /** Small words after the line, when there's something to add to it. */
  note?: string | null;
  /** How many there are behind it, drawn large at the end of its row; left out while loading. Rows only. */
  count?: number;
  /** A number drawn large at the door's right, its unit beside it and a line under it ("38 min", "Done by 21:47"). One way in only. */
  figure?: { value: string; unit: string; under: string } | null;
  /** The key that opens it from the keyboard, its keycap after the name (Settings → Keybinds). */
  bind?: Bind;
  onClick: () => void;
};

/** A door: one way in, or two folded into one place on the board, in rows. */
export type DoorSpec = {
  id: DoorId;
  /** The accent one: only while there's something to do. */
  hot?: boolean;
} & ({ shape: "one"; way: DoorWay } | { shape: "rows"; ways: readonly [DoorWay, DoorWay] });

type Props = {
  spec: DoorSpec;
  /** While the board is being arranged a door is a tile to move, not a place to go. */
  arranging: boolean;
  /** The board's drag classes and style, on the element that is the door's place on the board. */
  className: string;
  style: CSSProperties | undefined;
};

/** A way's line under its name, or its shape while loading. */
function Detail({ way }: { way: DoorWay }) {
  if (way.detail === null) return <Bone w="6em" h="0.8em" className="door-detail" />;
  return (
    <span className="door-detail">
      {way.detail}
      {way.note && <small className="door-note">{way.note}</small>}
    </span>
  );
}

/** A way's name, its keycap after it. */
function Label({ way }: { way: DoorWay }) {
  return (
    <span className="door-label">
      {way.label}
      <KeyCap bind={way.bind} />
    </span>
  );
}

/** What pressing a way does: nothing while the board is being arranged. */
function go(way: DoorWay, arranging: boolean) {
  return arranging ? undefined : way.onClick;
}

export function Door({ spec, arranging, className, style }: Props) {
  if (spec.shape === "one") {
    const { way } = spec;
    return (
      <Button
        id={spec.id}
        variant="door"
        data-id={spec.id}
        className={`${spec.hot ? "is-hot" : ""} ${spec.id === "door-review" ? "is-main" : ""} ${way.figure ? "has-figure" : ""} ${className}`.trim()}
        style={style}
        onClick={go(way, arranging)}
      >
        <Icon name={way.icon} className="door-icon" />
        <Label way={way} />
        <Detail way={way} />
        {way.figure && (
          <span className="door-figure">
            <span className="door-figure-value">
              {way.figure.value}
              <small>{way.figure.unit}</small>
            </span>
            <span className="door-figure-under">{way.figure.under}</span>
          </span>
        )}
      </Button>
    );
  }
  return (
    <div id={spec.id} data-id={spec.id} className={`door-rows ${className}`.trim()} style={style}>
      {spec.ways.map((way) => (
        <Button key={way.label} variant="door" className="door-row" onClick={go(way, arranging)}>
          <Icon name={way.icon} className="door-icon" />
          <span className="door-row-words">
            <Label way={way} />
            <Detail way={way} />
          </span>
          {way.count !== undefined && <span className="door-count">{way.count}</span>}
          <Icon name="forward" className="door-arrow" />
        </Button>
      ))}
    </div>
  );
}
