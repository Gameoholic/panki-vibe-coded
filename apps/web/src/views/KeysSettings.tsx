import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { KeyField } from "../components/KeyField";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { DEFAULT_KEYS, HOLD_TIMES, setKeyBinds, useKeyBinds, withBind, withKey, type Bind, type KeyBinds, type Slot } from "../keys";

const seconds = (ms: number) => `${ms / 1000} s`;
/** A key's hold as its choice reads: "Press", "Hold 0.5 s". */
const HOLD_OPTIONS = HOLD_TIMES.map((ms) => ({ id: String(ms), label: ms === 0 ? "Press" : `Hold ${seconds(ms)}` }));
/** Confirmation's extra hold as its choice reads: "+0 s", "+1 s". */
const EXTRA_OPTIONS = HOLD_TIMES.map((ms) => ({ id: String(ms), label: `+${seconds(ms)}` }));
const holdOf = (id: string, fallback: number) => HOLD_TIMES.find((ms) => String(ms) === id) ?? fallback;

/** One key's row: what it does, its key, and how long it's held first. */
function KeyRow({ id, label, bind, slot, binds }: { id: string; label: string; bind: Bind; slot: Slot; binds: KeyBinds }) {
  return (
    <Setting
      id={id}
      label={label}
      control={
        <span className="key-controls">
          <KeyField id={`key-${id}`} label={label} value={bind.key} onChange={(key) => setKeyBinds(withKey(binds, slot, key))} />
          <Dropdown
            id={`key-${id}-hold`}
            label={`${label}: press or hold`}
            options={HOLD_OPTIONS}
            value={String(bind.holdMs)}
            disabled={bind.key === null}
            onChange={(ms) => setKeyBinds(withBind(binds, slot, (b) => ({ ...b, holdMs: holdOf(ms, b.holdMs) })))}
          />
        </span>
      }
    />
  );
}

/**
 * Settings → Keybinds: the review's keys on this device (`keys.ts`), each set by pressing it and each pressed or held for
 * a time of its own, and how much longer an answer that asks for confirmation is held on top.
 */
export function KeysPanels() {
  const binds = useKeyBinds();
  const changed = JSON.stringify(binds) !== JSON.stringify(DEFAULT_KEYS);
  return (
    <>
      <section className="panel" aria-labelledby="keys-review-title">
        <h2 id="keys-review-title" className="panel-title">
          Review
        </h2>
        <KeyRow id="reveal" label="Show answer" bind={binds.reveal} slot={{ kind: "reveal" }} binds={binds} />
        {binds.answers.map((bind, index) => (
          <KeyRow key={index} id={`answer-${index + 1}`} label={`Answer ${index + 1}`} bind={bind} slot={{ kind: "answers", index }} binds={binds} />
        ))}
        <Setting
          id="confirmMs"
          label="Extra hold for answers that ask for confirmation"
          control={<Segmented idPrefix="key-confirm" label="Extra hold for answers that ask for confirmation" options={EXTRA_OPTIONS} value={String(binds.confirmMs)} onChange={(id) => setKeyBinds({ ...binds, confirmMs: holdOf(id, binds.confirmMs) })} />}
        />
      </section>
      <section className="panel" aria-labelledby="keys-media-title">
        <h2 id="keys-media-title" className="panel-title">
          Sounds and clips
        </h2>
        {binds.media.map((bind, index) => (
          <KeyRow key={index} id={`media-${index + 1}`} label={`Sound or clip ${index + 1}`} bind={bind} slot={{ kind: "media", index }} binds={binds} />
        ))}
      </section>
      {changed ? (
        <div className="add-actions add-actions-start">
          <Button id="keys-reset" onClick={() => setKeyBinds(DEFAULT_KEYS)}>
            Reset to default keys
          </Button>
        </div>
      ) : null}
    </>
  );
}
