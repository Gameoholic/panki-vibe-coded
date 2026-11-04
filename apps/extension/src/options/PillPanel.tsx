import { PILL_PARTS, type PillLayout } from "../modules";
import { PartRows } from "./PartRows";
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
  return (
    <div className="pill-parts">
      <div className="pill-preview" aria-label="How the header bar looks">
        {/* The profile in use, as the pill always says it: its own name, or the account's. */}
        <PankiPill layout={layout} numbers={SAMPLE_NUMBERS} profile={store.profileName || store.userName} power={{ on: true, onChange: () => undefined }} onClick={() => undefined} />
      </div>
      {/* Panki's own on / off switch is always at the pill's end, its one place while the pill is on (`switchInPill`;
          the owner, 2026-10-22): a row that showed or hid it stood here for a day. */}
      <PartRows idPrefix="pill" parts={layout} nameOf={(id) => PILL_PARTS[id]} iconOf={(id) => pillValue(id, SAMPLE_NUMBERS)?.icon ?? "stats"} disabled={disabled} onChange={keep} />
    </div>
  );
}
