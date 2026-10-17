import { useRef, useState } from "react";
import { Button } from "@web/components/Button";
import { TextField } from "@web/components/TextField";
import { parseStamp, stamp } from "../capture/words";

type Props = {
  id: string;
  /** What moment it is, for whoever can't see it: "Where the clip starts". */
  name: string;
  /** The moment, in the video's seconds. */
  at: number;
  disabled: boolean;
  /** Another moment was typed. Where it may really go is for whoever is told. */
  onSet: (seconds: number) => void;
};

/**
 * A moment of the video, written to the hundredth of a second, that can be typed over: a double-click on it (or Enter
 * while it has the focus) turns it into a field holding the same words. Enter, or leaving the field, keeps what was
 * typed; Escape, or something that isn't a moment, leaves it as it was.
 */
export function Stamp({ id, name, at, disabled, onSet }: Props) {
  const [typed, setTyped] = useState<string | null>(null);
  /** Whether what's being typed has been dealt with: leaving the field comes right after Enter, and must not count twice. */
  const settled = useRef(true);

  function open() {
    settled.current = false;
    setTyped(stamp(at));
  }
  function keep(text: string) {
    if (settled.current) return;
    settled.current = true;
    setTyped(null);
    const seconds = parseStamp(text);
    if (seconds !== null && Math.abs(seconds - at) >= 0.005) onSet(seconds);
  }
  function drop() {
    settled.current = true;
    setTyped(null);
  }

  if (typed === null) {
    return (
      <Button
        className="capture-time"
        aria-label={`${name}: ${stamp(at)}`}
        disabled={disabled}
        onDoubleClick={open}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          open();
        }}
      >
        {stamp(at)}
      </Button>
    );
  }
  return (
    <span
      className="capture-time-edit"
      // Everything in it is picked out as it opens, so typing replaces the lot and an arrow key goes in to change a digit.
      onFocus={(e) => {
        if (e.target instanceof HTMLInputElement) e.target.select();
      }}
      onBlur={() => keep(typed)}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Only this is given up, not the whole drawer.
        e.stopPropagation();
        drop();
      }}
    >
      <TextField id={id} label={name} autoComplete="off" autoFocus value={typed} onChange={setTyped} onEnter={() => keep(typed)} />
    </span>
  );
}
