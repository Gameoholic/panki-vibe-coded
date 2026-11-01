import { useState } from "react";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { KeyField } from "../components/KeyField";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { Toggle } from "../components/Toggle";
import { ALSO_MAX, DEFAULT_KEYS, HOLD_TIMES, setKeyBinds, setKeycapsOnPhone, useKeyBinds, useKeycapsOnPhone, withAdded, withHoldChain, withKey, withoutAdded, withPart, type Bind, type HoldChain, type Key, type KeyBinds, type Part, type Slot } from "../keys";

const seconds = (ms: number) => `${ms / 1000} s`;
/** A key's hold as its choice reads: "Press", "Hold 0.5 s". */
const HOLD_OPTIONS = HOLD_TIMES.map((ms) => ({ id: String(ms), label: ms === 0 ? "Press" : `Hold ${seconds(ms)}` }));
/** Confirmation's extra hold as its choice reads: "+0 s", "+1 s". */
const EXTRA_OPTIONS = HOLD_TIMES.map((ms) => ({ id: String(ms), label: `+${seconds(ms)}` }));
const holdOf = (id: string, fallback: number) => HOLD_TIMES.find((ms) => String(ms) === id) ?? fallback;
/**
 * The Hold button's stages as rows, in the order a hold goes through them: the first (a card's Listen phase ended, or
 * its back shown when it has none), the back after Done listening, and the answer; each after the first held on top of
 * the one before it, so it reads "+1 s".
 */
const HOLD_STAGES = [
  { id: "firstMs", label: "First hold", extra: false },
  { id: "thenMs", label: "Then the back of card", extra: true },
  { id: "answerMs", label: "Then the answer", extra: true },
] as const satisfies readonly { id: keyof Omit<HoldChain, "on">; label: string; extra: boolean }[];

/** One of an action's keys, and how long it's held first. An added one can be taken off before it has a key, and one just added listens for it at once. */
function KeyPair({ id, label, own, part, slot, binds, asking, onAsk, listen = false, disabled = false, keyOnly = false }: { id: string; label: string; own: Key; part: Part; slot: Slot; binds: KeyBinds; asking: boolean; onAsk: () => void; listen?: boolean; disabled?: boolean; keyOnly?: boolean }) {
  return (
    <span className="key-pair">
      <KeyField id={`key-${id}`} label={label} value={own.key} onChange={(key) => setKeyBinds(withKey(binds, slot, key, part))} asking={asking} onAsk={onAsk} removable={part !== "main"} listen={listen} disabled={disabled} />
      {/* The Hold button's key has no hold of its own: its stages' are the rows under it. */}
      {keyOnly ? null : (
        <Dropdown
          id={`key-${id}-hold`}
          label={`${label}: press or hold`}
          options={HOLD_OPTIONS}
          value={String(own.holdMs)}
          disabled={disabled || own.key === null}
          onChange={(ms) => setKeyBinds(withPart(binds, slot, part, (k) => ({ ...k, holdMs: holdOf(ms, k.holdMs) })))}
        />
      )}
    </span>
  );
}

/**
 * One action's row: what it does, its key, and as many more as are added with + (the owner, 2026-10-28: "multiple
 * keybinds to an action"; 2026-10-29: "add however many I want via a plus button"), each pressed or held for a time of
 * its own. A key is one thing on a screen, but for a press and a hold of it. The action's own key taken off leaves it
 * with none; an added one taken off goes.
 */
function KeyRow({ id, label, bind, slot, binds, disabled = false, keyOnly = false }: { id: string; label: string; bind: Bind; slot: Slot; binds: KeyBinds; disabled?: boolean; keyOnly?: boolean }) {
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
          <KeyPair id={id} label={labelOf("main")} own={bind} part="main" slot={slot} binds={binds} asking={asking === "main"} onAsk={ask("main")} disabled={disabled} keyOnly={keyOnly} />
          {bind.also.map((own, i) => (
            <KeyPair key={i} id={`${id}-also-${i}`} label={labelOf(i)} own={own} part={i} slot={slot} binds={binds} asking={asking === i} onAsk={ask(i)} listen={added && i === bind.also.length - 1 && own.key === null} disabled={disabled} keyOnly={keyOnly} />
          ))}
          {bind.also.length < ALSO_MAX ? (
            <Button
              className="btn-icon key-add"
              disabled={disabled}
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
  /** Reset to default keys is asking first. */
  const [resetting, setResetting] = useState(false);
  const keycapsOnPhone = useKeycapsOnPhone();
  const chain = binds.holdChain;
  return (
    <>
      {/* Whether a phone draws the keys on its buttons (the owner, 2026-11-01): hidden to begin with, there being no keyboard. */}
      <section className="panel" aria-labelledby="keys-phone-title">
        <h2 id="keys-phone-title" className="panel-title">
          Phone
        </h2>
        <Setting id="keycapsOnPhone" label="Keys on buttons" control={<Toggle id="keycaps-on-phone" says={{ on: "Shown", off: "Hidden" }} on={keycapsOnPhone} onChange={setKeycapsOnPhone} />} />
      </section>
      <section className="panel" aria-labelledby="keys-home-title">
        <h2 id="keys-home-title" className="panel-title">
          Home
        </h2>
        <KeyRow id="home-review" label="Review" bind={binds.homeReview} slot={{ kind: "homeReview" }} binds={binds} />
      </section>
      {/*
        The Hold button (the owner, 2026-11-02): held, one key carries a card from its start through every stage to the
        deck's answer (a deck's "Hold button answers with"), each stage held for its own time; a double press goes back to
        the start. Off to begin with; its rows greyed while it's off.
      */}
      <section className="panel" aria-labelledby="keys-hold-title">
        <h2 id="keys-hold-title" className="panel-title">
          Hold button
        </h2>
        <Setting id="holdChain" label="Hold button" control={<Toggle id="hold-chain" says={{ on: "On", off: "Off" }} on={chain.on} onChange={(on) => setKeyBinds(withHoldChain(binds, on))} />} />
        <KeyRow id="hold-button" label="Key" bind={binds.holdButton} slot={{ kind: "holdButton" }} binds={binds} disabled={!chain.on} keyOnly />
        {HOLD_STAGES.map((stage) => (
          <Setting
            key={stage.id}
            id={stage.id}
            label={stage.label}
            control={
              <Dropdown
                id={`key-hold-${stage.id}`}
                label={stage.label}
                options={stage.extra ? EXTRA_OPTIONS : HOLD_OPTIONS}
                value={String(chain[stage.id])}
                disabled={!chain.on}
                onChange={(ms) => setKeyBinds({ ...binds, holdChain: { ...chain, [stage.id]: holdOf(ms, chain[stage.id]) } })}
              />
            }
          />
        ))}
      </section>
      <section className="panel" aria-labelledby="keys-review-title">
        <h2 id="keys-review-title" className="panel-title">
          Review
        </h2>
        <KeyRow id="start" label="Start" bind={binds.start} slot={{ kind: "start" }} binds={binds} />
        {/* In the order a card goes: out of its Listen phase, to its back, and back to its front. The Hold button stands for all three while it's on. */}
        <KeyRow id="show-card" label="Done listening" bind={binds.showCard} slot={{ kind: "showCard" }} binds={binds} disabled={chain.on} />
        <KeyRow id="reveal" label="Show back of card" bind={binds.reveal} slot={{ kind: "reveal" }} binds={binds} disabled={chain.on} />
        <KeyRow id="hide" label="Hide back of card" bind={binds.hide} slot={{ kind: "hide" }} binds={binds} disabled={chain.on} />
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
      {/* Every key set here goes at once, so it asks first, in place (the owner, 2026-10-29). */}
      {changed && resetting ? (
        <div className="ask-box">
          <Ask
            idPrefix="keys-reset"
            question="Reset every key to its default?"
            go={{ words: "Reset keys", busy: "Resetting…", icon: "reset" }}
            busy={false}
            failure={null}
            onKeep={() => setResetting(false)}
            onGo={() => {
              setKeyBinds(DEFAULT_KEYS);
              setResetting(false);
            }}
          />
        </div>
      ) : changed ? (
        <div className="add-actions add-actions-start">
          <Button id="keys-reset" onClick={() => setResetting(true)}>
            <Icon name="reset" />
            Reset to default keys
          </Button>
        </div>
      ) : null}
    </>
  );
}
