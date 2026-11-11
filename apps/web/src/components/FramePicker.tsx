/** @panki A tile's custom time frame picked as an amount, "Last 3 weeks" or "Next 3 weeks", hanging from what opened it (`FramePicker`, `frameShort`). */
import { useEffect, useRef, useState, type RefObject } from "react";
import { FRAME_UNITS, FRAME_UNIT_IDS, type FrameUnit, type StatFrame } from "@panki/contracts";
import { useAnchored } from "../hooks/useAnchored";
import { useDismiss } from "../hooks/useDismiss";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { NumberField } from "./NumberField";
import { Segmented } from "./Segmented";

/** A frame in a tile's dropdown, the window vocabulary's shape: "3 w", "14 d", "2 mo", "1 y". */
export const frameShort = (frame: StatFrame) => `${frame.n} ${FRAME_UNITS[frame.unit].short}`;

/** The frame it opens on when none was picked before. */
const FIRST: StatFrame = { n: 3, unit: "week" };

type Props = {
  /** Every control's id starts with it. */
  idPrefix: string;
  /** What opened it, which it hangs from. */
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  /** The frame it opens on: the one already picked, or none. */
  frame: StatFrame | null;
  /** The word before the amount, the tile's to say: "Last" looking back, "Next" looking ahead. */
  lead: string;
  onPick: (frame: StatFrame) => void;
  onClose: () => void;
};

/**
 * A custom time frame as a question hangs from its button: the tile's word ("Last", "Next"), the amount, and Days /
 * Weeks / Months / Years; a unit picked holds the amount to that unit's most (`FRAME_UNITS`). Show takes it; Cancel
 * leaves it as it was.
 */
export function FramePicker({ idPrefix, anchor, open, frame, lead, onPick, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(frame?.n ?? FIRST.n);
  const [unit, setUnit] = useState<FrameUnit>(frame?.unit ?? FIRST.unit);
  useAnchored(anchor, panel, open, undefined, "auto");
  useDismiss(panel, open, onClose, anchor);
  // Each time it opens, it opens on the frame as it stands.
  useEffect(() => {
    if (!open) return;
    setN(frame?.n ?? FIRST.n);
    setUnit(frame?.unit ?? FIRST.unit);
  }, [open, frame?.n, frame?.unit]);
  const max = FRAME_UNITS[unit].max;
  return (
    <div ref={panel} className="menu frame-pick" role="dialog" aria-label="Custom time frame" hidden={!open} data-no-drag>
      <div className="frame-amount">
        <span className="frame-lead">{lead}</span>
        <NumberField id={`${idPrefix}-n`} label={`${lead}: how many`} value={Math.min(n, max)} min={1} max={max} onChange={setN} />
      </div>
      <Segmented
        idPrefix={`${idPrefix}-unit`}
        label={`${lead}: of what`}
        size="sm"
        options={FRAME_UNIT_IDS.map((id) => ({ id, label: FRAME_UNITS[id].name }))}
        value={unit}
        onChange={(next) => {
          setUnit(next);
          setN((was) => Math.min(was, FRAME_UNITS[next].max));
        }}
      />
      <div className="add-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onPick({ n: Math.min(n, max), unit })}>
          <Icon name="check" />
          Show
        </Button>
      </div>
    </div>
  );
}
