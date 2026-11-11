/** @panki Parts of something laid out as rows: a grip, its name, Shown / Hidden, a part's own settings under it (`PartRows`, `LaidPart`). Never a second list of rows to lay out. */
import type { ReactNode } from "react";
import { Button } from "@web/components/Button";
import { Icon, type IconName } from "@web/components/Icon";
import { Toggle } from "@web/components/Toggle";
import { useDragOrder } from "@web/hooks/useDragOrder";

/** One part of something laid out: shown or not, where it stands in the list. */
export type LaidPart<Id extends string> = { id: Id; shown: boolean };

/**
 * The parts of something laid out on the options page, as rows: a grip to move each (or the arrow keys on it), its
 * icon and name, a quiet word after it (`noteOf`: whose it is), and its Shown / Hidden switch; under a part, inside
 * its row and in line with its name, the settings that are that part's own (`moreOf`: the header bar's Streak, which
 * streak it shows). The pill in the header bar and the player's control bar are both this; `onChange` is handed the
 * parts as they now stand, to keep.
 */
export function PartRows<Id extends string>({
  idPrefix,
  parts,
  nameOf,
  iconOf,
  noteOf,
  moreOf,
  disabled,
  onChange,
}: {
  idPrefix: string;
  parts: readonly LaidPart<Id>[];
  nameOf: (id: Id) => string;
  iconOf: (id: Id) => IconName;
  noteOf?: (id: Id) => ReactNode;
  moreOf?: (part: LaidPart<Id>) => ReactNode;
  disabled: boolean;
  onChange: (next: LaidPart<Id>[]) => void;
}) {
  const order = useDragOrder(parts.length, (from, to) => {
    const next = [...parts];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    onChange(next);
  });
  return (
    <div className="pill-rows">
      {parts.map((part, i) => {
        const more = moreOf?.(part) ?? null;
        return (
          <div key={part.id} ref={order.rowRef(i)} style={order.rowStyle(i)} className="pill-row">
            <Button className="btn-icon pill-grip" aria-label={`Move ${nameOf(part.id)}`} disabled={disabled} {...order.handleProps(i)}>
              <Icon name="grip" />
            </Button>
            <span className="pill-row-name">
              <Icon name={iconOf(part.id)} />
              {nameOf(part.id)}
              {noteOf ? <span className="pill-row-note">{noteOf(part.id)}</span> : null}
            </span>
            <Toggle
              id={`${idPrefix}-${part.id}`}
              says={{ on: "Shown", off: "Hidden" }}
              on={part.shown}
              disabled={disabled}
              onChange={(on) => onChange(parts.map((p) => (p.id === part.id ? { ...p, shown: on } : p)))}
            />
            {more ? <div className="pill-row-more">{more}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
