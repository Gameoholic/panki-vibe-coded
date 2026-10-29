import { useState } from "react";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { KeyField } from "../components/KeyField";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { ALSO_MAX, DEFAULT_KEYS, HOLD_TIMES, setKeyBinds, useKeyBinds, withAdded, withKey, withoutAdded, withPart, type Bind, type Key, type KeyBinds, type Part, type Slot } from "../keys";

const seconds = (ms: number) => `${ms / 1000} s`;
/** A key's hold as its choice reads: "Press", "Hold 0.5 s". */
const HOLD_OPTIONS = HOLD_TIMES.map((ms) => ({ id: String(ms), label: ms === 0 ? "Press" : `Hold ${seconds(ms)}` }));
/** Confirmation's extra hold as its choice reads: "+0 s", "+1 s". */
const EXTRA_OPTIONS = HOLD_TIMES.map((ms) => ({ id: String(ms), label: `+${seconds(ms)}` }));
const holdOf = (id: string, fallback: number) => HOLD_TIMES.find((ms) => String(ms) === id) ?? fallback;

/** One of an action's keys, and how long it's held first. An added one can be taken off before it has a key, and one just added listens for it at once. */
function KeyPair({ id, label, own, part, slot, binds, asking, onAsk, listen = false }: { id: string; label: string; own: Key; part: Part; slot: Slot; binds: KeyBinds; asking: boolean; onAsk: () => void; listen?: boolean }) {
  return (
    <span className="key-pair">
      <KeyField id={`key-${id}`} label={label} value={own.key} onChange={(key) => setKeyBinds(withKey(binds, slot, key, part))} asking={asking} onAsk={onAsk} removable={part !== "main"} listen={listen} />
      <Dropdown
        id={`key-${id}-hold`}
        label={`${label}: press or hold`}
        options={HOLD_OPTIONS}
        value={String(own.holdMs)}
        disabled={own.key === null}
        onChange={(ms) => setKeyBinds(withPart(binds, slot, part, (k) => ({ ...k, holdMs: holdOf(ms, k.holdMs) })))}
      />
    </span>
  );
}

/**
 * One action's row: what it does, its key, and as many more as are added with + (the owner, 2026-10-28: "multiple
 * keybinds to an action"; 2026-10-29: "add however many I want via a plus button"), each pressed or held for a time of
 * its own. A key is one thing on a screen, but for a press and a hold of it. The action's own key taken off leaves it
 * with none; an added one taken off goes.
 */
function KeyRow({ id, label, bind, slot, binds }: { id: string; label: string; bind: Bind; slot: Slot; binds: KeyBinds }) {
  /** Which of its keys is being asked about before it's taken off, if one is. */
  const [asking, setAsking] = useState<Part | null>(null);
  /** A key was just added with +: the last one listens for its key at once. */
  const [added, setAdded] = useState(false);
  const labelOf = (part: Part) => (part === "main" ? label : `${label}, key ${part + 2}`);
  // An added key with none yet has nothing to lose: it goes at once.
  const ask = (part: Part) => () => (part !== "main" && bind.also[part]?.key === null ? setKeyBinds(withoutAdded(binds, slot, part)) : setAsking((was) => (was === part ? null : part)));
  return (
    <Setting
      id={id}
      label={label}
      control={
        <span className="key-controls">
          <KeyPair id={id} label={labelOf("main")} own={bind} part="main" slot={slot} binds={binds} asking={asking === "main"} onAsk={ask("main")} />
          {bind.also.map((own, i) => (
            <KeyPair key={i} id={`${id}-also-${i}`} label={labelOf(i)} own={own} part={i} slot={slot} binds={binds} asking={asking === i} onAsk={ask(i)} listen={added && i === bind.also.length - 1 && own.key === null} />
          ))}
          {bind.also.length < ALSO_MAX ? (
            <Button
              className="btn-icon key-add"
              aria-label={`Add another key for ${label}`}
              onClick={() => {
                setAdded(true);
                setKeyBinds(withAdded(binds, slot));
              }}
            >
              <Icon name="add" />
            </Button>
          ) : null}
        </span>
      }
    >
      {asking !== null ? (
        <div className="ask-box">
          <Ask
            idPrefix={`key-${id}-${asking}-off`}
            question={`Take the key off ${labelOf(asking)}?`}
            go={{ words: "Take it off", busy: "Taking it off…" }}
            busy={false}
            failure={null}
            onKeep={() => setAsking(null)}
            onGo={() => {
              setKeyBinds(asking === "main" ? withKey(binds, slot, null) : withoutAdded(binds, slot, asking));
              setAsking(null);
            }}
          />
        </div>
      ) : null}
    </Setting>
  );
}

/**
 * Settings → Keybinds: the home's and the review's keys on this device (`keys.ts`), each set by pressing it and each pressed or held for
 * a time of its own, and how much longer an answer that requires confirmation is held on top.
 */
export function KeysPanels() {
  const binds = useKeyBinds();
  const changed = JSON.stringify(binds) !== JSON.stringify(DEFAULT_KEYS);
  return (
    <>
      <section className="panel" aria-labelledby="keys-home-title">
        <h2 id="keys-home-title" className="panel-title">
          Home
        </h2>
        <KeyRow id="home-review" label="Review" bind={binds.homeReview} slot={{ kind: "homeReview" }} binds={binds} />
      </section>
      <section className="panel" aria-labelledby="keys-review-title">
        <h2 id="keys-review-title" className="panel-title">
          Review
        </h2>
        <KeyRow id="start" label="Start" bind={binds.start} slot={{ kind: "start" }} binds={binds} />
        <KeyRow id="reveal" label="Show answer" bind={binds.reveal} slot={{ kind: "reveal" }} binds={binds} />
        {binds.answers.map((bind, index) => (
          <KeyRow key={index} id={`answer-${index + 1}`} label={`Answer ${index + 1}`} bind={bind} slot={{ kind: "answers", index }} binds={binds} />
        ))}
        <Setting
          id="confirmMs"
          label="Extra hold for answers that require confirmation"
          control={<Segmented idPrefix="key-confirm" label="Extra hold for answers that require confirmation" options={EXTRA_OPTIONS} value={String(binds.confirmMs)} onChange={(id) => setKeyBinds({ ...binds, confirmMs: holdOf(id, binds.confirmMs) })} />}
        />
        <KeyRow id="undo" label="Undo" bind={binds.undo} slot={{ kind: "undo" }} binds={binds} />
        <KeyRow id="example-prev" label="Previous example" bind={binds.examplePrev} slot={{ kind: "examplePrev" }} binds={binds} />
        <KeyRow id="example-next" label="Next example" bind={binds.exampleNext} slot={{ kind: "exampleNext" }} binds={binds} />
      </section>
      <section className="panel" aria-labelledby="keys-media-title">
        <h2 id="keys-media-title" className="panel-title">
          Sounds and clips
        </h2>
        {binds.media.map((bind, index) => (
          <KeyRow key={index} id={`media-${index + 1}`} label={`Sound or clip ${index + 1}`} bind={bind} slot={{ kind: "media", index }} binds={binds} />
        ))}
        {binds.restart.map((bind, index) => (
          <KeyRow key={`restart-${index}`} id={`restart-${index + 1}`} label={`Restart sound or clip ${index + 1}`} bind={bind} slot={{ kind: "restart", index }} binds={binds} />
        ))}
        <KeyRow id="full-screen" label="Full screen" bind={binds.fullScreen} slot={{ kind: "fullScreen" }} binds={binds} />
      </section>
      {changed ? (
        <div className="add-actions add-actions-start">
          <Button id="keys-reset" onClick={() => setKeyBinds(DEFAULT_KEYS)}>
            <Icon name="reset" />
            Reset to default keys
          </Button>
        </div>
      ) : null}
    </>
  );
}
