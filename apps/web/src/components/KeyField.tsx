import { useEffect, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { bindable, keyOf } from "../keys";
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
  asking: boolean;
  /** The trash pressed: the row asks before the key is taken off, or stops asking. */
  onAsk: () => void;
};

/**
 * A key set by pressing it: its keycap on a chip; pressed, the chip says "Press a key" and takes the next key pressed
 * (but a modifier alone, or one the page keeps for itself), with Ctrl or Alt when either is held with it ("Ctrl+Z",
 * `keys.ts` → `keyOf`); Escape, or a press anywhere else, leaves it as it was. The trash takes the key off, once the
 * row has asked: the question stands under the whole row, so the keys beside it stay where they are. Settings →
 * Keybinds is made of these.
 */
export function KeyField({ id, label, value, onChange, asking, onAsk }: Props) {
  const [listening, setListening] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  useDismiss(box, listening, () => setListening(false));
  useEffect(() => {
    if (!listening) return;
    // Heard before anything else on the page, so the key sets this and does nothing more.
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(false);
        return;
      }
      if (e.repeat || e.metaKey || !bindable(e.key)) return;
      latest.current(keyOf(e));
      setListening(false);
      // Space or Enter on the chip would press it again as it's let go.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening]);

  return (
    <span ref={box} className="key-field">
      <Button id={id} variant="chip" className="key-field-button" aria-pressed={listening} aria-label={`${label}: ${listening ? "press a key" : value ? keyWords(value) : "no key"}`} onClick={() => setListening((now) => !now)}>
        {listening ? "Press a key" : value ? <span className="key">{keyWords(value)}</span> : "None"}
      </Button>
      {value && !listening ? (
        <Button className="btn-icon is-danger key-field-clear" aria-label={`Take the key off ${label}`} aria-pressed={asking} onClick={onAsk}>
          <Icon name="trash" />
        </Button>
      ) : null}
    </span>
  );
}
