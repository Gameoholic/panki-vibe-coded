/** @panki A prompt template typed, its variables lit (`PromptField`, `PromptFieldHandle`). */
import { useImperativeHandle, useMemo, useRef, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { variablesIn } from "@panki/contracts";

/** What a prompt's field lets the screen around it do: put words in at the caret, as typed there (a variable pressed in Prompt context). */
export type PromptFieldHandle = { insert: (text: string) => void };

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  /** Shown, greyed, while what it belongs to is switched off. */
  disabled?: boolean;
  /** Shown, not edited: one of Panki's own templates, to read and copy from. */
  readOnly?: boolean;
  ref?: Ref<PromptFieldHandle>;
};

type Variable = ReturnType<typeof variablesIn>[number];

/** The known variable a caret is strictly inside, if any: the caret never rests there. */
const within = (known: readonly Variable[], at: number) => known.find((v) => at > v.from && at < v.to);

/**
 * A prompt template, every variable in it lit (`{Reading}`, in the accent, braces and all; a name that's no piece's in
 * the danger colours). The box is the browser's own `<textarea>`, so typing, undo, paste and Japanese input are its;
 * a box can't colour part of its own text, so the text is drawn once more under it, in the same type and the same room,
 * and the box's own text is see-through, its caret showing. The copy under it is what gives the field its height, so
 * it grows with its text, never scrolling. A known variable is one thing: Backspace or Delete next to it takes it
 * whole, the arrow keys step over it, and the caret never rests inside one. A template's Prompt and Follow-up prompt are
 * this (Settings → Panki AI).
 */
export function PromptField({ id, label, value, onChange, error, disabled = false, readOnly = false, ref }: Props) {
  const box = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const variables = useMemo(() => variablesIn(value), [value]);
  const known = useMemo(() => variables.filter((v) => v.piece !== null), [variables]);

  useImperativeHandle(
    ref,
    () => ({
      insert(text: string) {
        const el = box.current;
        if (!el || el.disabled || el.readOnly) return;
        el.focus();
        // Typed in as if by hand, so the box's own undo takes it back; the browser's own way, where it still has it.
        if (document.execCommand("insertText", false, text)) return;
        const { selectionStart, selectionEnd } = el;
        el.setRangeText(text, selectionStart, selectionEnd, "end");
        onChange(el.value);
      },
    }),
    [onChange],
  );

  // A variable is taken whole by widening the selection to it and letting the key do what it always does, so the
  // browser's own undo puts it back.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    const { selectionStart: at, selectionEnd } = el;
    if (at !== selectionEnd) return;
    if (e.key === "Backspace" || e.key === "Delete") {
      const next = known.find((v) => (e.key === "Backspace" ? v.to === at : v.from === at));
      if (next) el.setSelectionRange(next.from, next.to);
      return;
    }
    if (e.shiftKey) return;
    // Stepping onto a variable steps over it; the caret otherwise would land inside it and be moved back.
    const over = e.key === "ArrowRight" ? known.find((v) => v.from === at) : e.key === "ArrowLeft" ? known.find((v) => v.to === at) : undefined;
    if (!over) return;
    e.preventDefault();
    const to = e.key === "ArrowRight" ? over.to : over.from;
    el.setSelectionRange(to, to);
  }

  // A caret put inside a variable (a click, the up and down arrows) goes to its nearer edge.
  function handleSelect() {
    const el = box.current;
    if (!el || composing.current || el.selectionStart !== el.selectionEnd) return;
    const at = el.selectionStart;
    const inside = within(known, at);
    if (!inside) return;
    const to = at - inside.from <= inside.to - at ? inside.from : inside.to;
    el.setSelectionRange(to, to);
  }

  // The text again, each variable lit, cut at the variables' edges.
  const drawn: ReactNode[] = [];
  let from = 0;
  for (const v of variables) {
    if (v.from > from) drawn.push(value.slice(from, v.from));
    drawn.push(
      <mark key={v.from} className={v.piece === null ? "prompt-var is-unknown" : "prompt-var"}>
        {value.slice(v.from, v.to)}
      </mark>,
    );
    from = v.to;
  }
  drawn.push(value.slice(from));

  return (
    <div className={`field prompt-field ${error ? "field-invalid" : ""} ${disabled ? "is-disabled" : ""}`.replace(/\s+/g, " ").trim()}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="prompt-box">
        <div className="field-input prompt-drawn" aria-hidden="true">
          {drawn}
          {/* A box keeps a last empty line open; so does this. */}
          {"\n"}
        </div>
        <textarea
          ref={box}
          id={id}
          className="field-input prompt-input"
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
        />
      </div>
      {error ? (
        <div id={`${id}-error`} className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
