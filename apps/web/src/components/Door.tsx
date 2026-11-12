/** @panki A home door (`Door`, `DoorSpec`, `DoorWay`): one way in, two in rows (`rows`), or two stacked, the one behind rising out (`stack`). The board draws them. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  /** The key that opens it from the keyboard, its keycap after the name (Settings → Keybinds). */
  bind?: Bind;
  onClick: () => void;
};

/** A door: one way in, or two folded into one place on the board, in rows or stacked (the first in front). */
export type DoorSpec = {
  id: DoorId;
  /** The accent one: only while there's something to do. */
  hot?: boolean;
} & ({ shape: "one"; way: DoorWay } | { shape: "rows" | "stack"; ways: readonly [DoorWay, DoorWay] });

type Props = {
  spec: DoorSpec;
  /** While the board is being arranged a door is a tile to move, not a place to go, and a stack stays shut. */
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

export function Door({ spec, arranging, className, style }: Props) {
  if (spec.shape === "one") {
    const { way } = spec;
    return (
      <Button
        id={spec.id}
        variant="door"
        data-id={spec.id}
        className={`${spec.hot ? "is-hot" : ""} ${spec.id === "door-review" ? "is-main" : ""} ${className}`.trim()}
        style={style}
        onClick={go(way, arranging)}
      >
        <Icon name={way.icon} className="door-icon" />
        <Label way={way} />
        <Detail way={way} />
      </Button>
    );
  }
  if (spec.shape === "rows") {
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
  return <DoorStack spec={spec} ways={spec.ways} arranging={arranging} className={className} style={style} />;
}

/**
 * Two doors stacked, the second behind the first with its edge showing. Pointed at or focused, the one behind rises
 * out over the top; on a touch screen the first tap raises it and the next picks either, a tap anywhere else lowering it.
 */
function DoorStack({ spec, ways, arranging, className, style }: { spec: DoorSpec; ways: readonly [DoorWay, DoorWay]; arranging: boolean; className: string; style: CSSProperties | undefined }) {
  const [front, behind] = ways;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const touch = useRef(false);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => {
    if (arranging) setOpen(false);
  }, [arranging]);

  return (
    <div
      ref={root}
      id={spec.id}
      data-id={spec.id}
      className={`door-stack ${open ? "is-open" : ""} ${className}`.trim()}
      style={style}
      onPointerDown={(e) => {
        touch.current = e.pointerType !== "mouse";
      }}
      // A touch that lands on the shut stack only raises the one behind; picking is the next tap.
      onClickCapture={(e) => {
        if (arranging || open || !touch.current) return;
        setOpen(true);
        e.stopPropagation();
      }}
    >
      <Button variant="door" className="door-front" onClick={go(front, arranging)}>
        <Icon name={front.icon} className="door-icon" />
        <Label way={front} />
        <Detail way={front} />
      </Button>
      <Button variant="door" className="door-behind" onClick={go(behind, arranging)}>
        <span className="door-behind-head">
          <Icon name={behind.icon} className="door-icon" />
          <Label way={behind} />
        </span>
        <Detail way={behind} />
      </Button>
    </div>
  );
}

/** What pressing a way does: nothing while the board is being arranged. */
function go(way: DoorWay, arranging: boolean) {
  return arranging ? undefined : way.onClick;
}
