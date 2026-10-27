import { useRef, type KeyboardEvent } from "react";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  /** Several lines, for a sentence or notes: the box grows as you type, Enter makes a new line (the `Form` sends on Ctrl+Enter). */
  multiline?: boolean;
  /** For a one-line field: what Enter does instead of sending the form, like moving to the next field. Ctrl+Enter still sends. */
  onEnter?: () => void;
  /** A password is hidden as it's typed. One line only. */
  type?: "text" | "password";
  lang?: string | undefined;
  autoFocus?: boolean;
  /** Off for the owner's own words; the name and password of the sign-in, so the browser's password manager can fill them. */
  autoComplete?: "off" | "username" | "current-password";
  /** Shown, not edited: the words of something that's only for looking at. */
  readOnly?: boolean;
  /** Shown, greyed, while what it belongs to is switched off. */
  disabled?: boolean;
  /**
   * For a field of several lines: a stretch of its text shown lit, behind the words, from one character up to (not
   * counting) another; null when nothing is lit just now. The word a sentence is about. Left out, nothing is ever lit.
   */
  mark?: { from: number; to: number } | null;
  className?: string;
  /** Names the field for the checks that drive the real UI. */
  "data-field"?: string;
};

/** A labelled text input, one line or several, with the app's own error bubble under it; never Chrome's "Please fill out this field." */
export function TextField({ id, label, value, onChange, error, multiline = false, onEnter, type = "text", lang, autoFocus, autoComplete, readOnly = false, disabled = false, mark, className = "", "data-field": dataField }: Props) {
  const behind = useRef<HTMLDivElement>(null);
  const shared = {
    id,
    readOnly,
    disabled,
    className: "field-input",
    value,
    lang,
    autoFocus,
    autoComplete,
    "data-field": dataField,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
  // An Enter that confirms a Japanese composition is the IME's, not ours.
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!onEnter || e.key !== "Enter" || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    onEnter();
  }
  // What's drawn behind a box with a lit stretch (below) moves with the box's own text when that's scrolled.
  const box = (
    <textarea
      {...shared}
      rows={3}
      onChange={(e) => onChange(e.target.value)}
      onScroll={(e) => {
        if (behind.current) behind.current.scrollTop = e.currentTarget.scrollTop;
      }}
    />
  );
  return (
    <div className={`field ${error ? "field-invalid" : ""} ${className}`.trim()}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {!multiline ? (
        <input {...shared} type={type} onChange={(e) => onChange(e.target.value)} onKeyDown={onEnter ? handleKeyDown : undefined} />
      ) : mark === undefined ? (
        box
      ) : (
        // A box can't light part of its own text, so the text is drawn once more behind it, in the same type and the
        // same room, with only the lit stretch showing; the box is see-through. It's there whether or not anything is
        // lit, so the box is never made anew (and the cursor lost) as the lit stretch comes and goes.
        <div className="field-marked">
          <div ref={behind} className="field-input field-behind" lang={lang} aria-hidden="true">
            {mark ? (
              <>
                {value.slice(0, mark.from)}
                <mark>{value.slice(mark.from, mark.to)}</mark>
                {value.slice(mark.to)}
              </>
            ) : (
              value
            )}
            {/* A box keeps a last empty line open; so does this. */}
            {"\n"}
          </div>
          {box}
        </div>
      )}
      {error ? (
        <div id={`${id}-error`} className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
