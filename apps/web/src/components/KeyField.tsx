import { useEffect, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { bindable, isModifier, keyOf } from "../keys";
import { keyWords } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";

type Props = {
  id: string;
  /** What the key does, for the button's name. */
  label: string;
  /** The key bound now (`keys.ts`), none when there's none. */
  value: string | null;
  /** A key pressed while it listens. */
  onChange: (key: string) => void;
  /** Whether taking the key off is being asked about, under the row (`Ask`): its trash is lit while it is. */
  asking?: boolean;
  /**
   * The trash pressed: the row asks before the key is taken off, or stops asking. Left out, the key can be changed and
   * never taken off, so there's no trash (the extension's Toggle panel keybind, which always has one).
   */
  onAsk?: () => void;
  /** The trash stands with no key too: a key added to an action, not given one yet, is taken off with it. */
  removable?: boolean;
  /** It listens for its key from the start: one just added with +. */
  listen?: boolean;
  /** Shown and not changed: a key that does nothing just now (Show back of card's while the Hold button stands for it). */
  disabled?: boolean;
};

/**
 * A key set by pressing it: its keycap on a chip; pressed, the chip says "Press a key" and takes the next key pressed
 * (but one the page keeps for itself), with Ctrl or Alt when either is held with it ("Ctrl+Z", `keys.ts` → `keyOf`);
 * Shift, Ctrl or Alt pressed and let go with nothing else is that key by itself; Escape, or a
 * press anywhere else, leaves it as it was. The trash takes the key off, once the
 * row has asked: the question stands under the whole row, so the keys beside it stay where they are. Settings →
 * Keybinds is made of these.
 */
export function KeyField({ id, label, value, onChange, asking = false, onAsk, removable = false, listen = false, disabled = false }: Props) {
  const [listening, setListening] = useState(listen);
  const box = useRef<HTMLSpanElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  useDismiss(box, listening, () => setListening(false));
  useEffect(() => {
    if (!listening) return;
    /** Shift, Ctrl or Alt pressed and not yet let go: the key itself if it's let go with nothing else pressed, else what's held with it. */
    let modifier: string | null = null;
    const take = (key: string) => {
      latest.current(key);
      setListening(false);
      // Space or Enter on the chip would press it again as it's let go.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    // Heard before anything else on the page, so the key sets this and does nothing more.
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(false);
        return;
      }
      if (e.repeat || e.metaKey || !bindable(e.key)) return;
      if (isModifier(e.key)) {
        modifier = keyOf(e);
        return;
      }
      take(keyOf(e));
    }
    function onUp(e: KeyboardEvent) {
      if (modifier === null || !isModifier(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (keyOf(e) === modifier) take(modifier);
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, [listening]);

  return (
    <span ref={box} className="key-field">
      <Button id={id} variant="chip" className="key-field-button" aria-pressed={listening} aria-label={`${label}: ${listening ? "press a key" : value ? keyWords(value) : "no key"}`} disabled={disabled} onClick={() => setListening((now) => !now)}>
        {listening ? "Press a key" : value ? <span className="key">{keyWords(value)}</span> : "None"}
      </Button>
      {onAsk && (value || removable) && !listening ? (
        <Button className="btn-icon is-danger key-field-clear" aria-label={`Take the key off ${label}`} aria-pressed={asking} disabled={disabled} onClick={onAsk}>
          <Icon name="trash" />
        </Button>
      ) : null}
    </span>
  );
}
