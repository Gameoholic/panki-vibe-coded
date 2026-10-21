import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { Toggle } from "@web/components/Toggle";
import { useDragOrder } from "@web/hooks/useDragOrder";
import { PILL_PARTS, type PillLayout } from "../modules";
import { writeStore, type Stored } from "../storage";
import { PankiPill, SAMPLE_NUMBERS, pillValue } from "../ui/PankiPill";

/**
 * Panki's pill in YouTube's header bar, laid out (the owner, 2026-10-21: "make it so I can completely customize this
 * widget, including what to put there (cards, review spending, etc.)"): the pill as it will stand, on a strip of the
 * site's dark header bar with made-up numbers, then every part it can say as a row, each shown or hidden, moved by its
 * grip (or the arrow keys on it) into the order it's said in. Kept the moment it's changed; a YouTube page reads it
 * again as it gets the focus. Greyed with the master switch, or with the pill hidden.
 */
export function PillParts({ store, disabled, onChanged }: { store: Stored; disabled: boolean; onChanged: () => void }) {
  const layout = store.pill;
  const keep = (next: PillLayout) => void writeStore({ pill: next }).then(onChanged);
  const order = useDragOrder(layout.length, (from, to) => {
    const next = [...layout];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    keep(next);
  });
  return (
    <div className="pill-parts">
      <div className="pill-preview" aria-label="How the pill looks">
        <PankiPill layout={layout} numbers={SAMPLE_NUMBERS} power={store.pillPower ? { on: true, onChange: () => undefined } : null} onClick={() => undefined} />
      </div>
      <div className="pill-rows">
        {layout.map((part, i) => {
          const icon = pillValue(part.id, SAMPLE_NUMBERS)?.icon ?? "stats";
          return (
            <div key={part.id} ref={order.rowRef(i)} style={order.rowStyle(i)} className="pill-row">
              <Button className="btn-icon pill-grip" aria-label={`Move ${PILL_PARTS[part.id]}`} disabled={disabled} {...order.handleProps(i)}>
                <Icon name="grip" />
              </Button>
              <span className="pill-row-name">
                <Icon name={icon} />
                {PILL_PARTS[part.id]}
              </span>
              <Toggle
                id={`pill-${part.id}`}
                says={{ on: "Shown", off: "Hidden" }}
                on={part.shown}
                disabled={disabled}
                onChange={(on) => keep(layout.map((p) => (p.id === part.id ? { ...p, shown: on } : p)))}
              />
            </div>
          );
        })}
        {/* Panki's own on / off switch, always at the pill's end (the owner, 2026-10-21); with it there the pill stays while Panki is off. */}
        <div className="pill-row is-fixed">
          <span aria-hidden="true" />
          <span className="pill-row-name">
            <Icon name="lock" />
            Panki on / off switch
          </span>
          <Toggle id="pill-power" says={{ on: "Shown", off: "Hidden" }} on={store.pillPower} disabled={disabled} onChange={(pillPower) => void writeStore({ pillPower }).then(onChanged)} />
        </div>
      </div>
    </div>
  );
}
