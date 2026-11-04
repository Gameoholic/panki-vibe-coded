import { useEffect, useRef, type KeyboardEvent } from "react";
import { AiSpark } from "@web/components/AiWaiting";

/**
 * A line of Panki subtitles typed in where it stands (AI step 6, the editors): a real `<textarea>`, so typing, undo,
 * paste and Japanese input are the browser's own, laid over a drawing of the same text in which Panki AI's words are
 * lit in the accent with the spark after them (the spark takes no room, so the two stay one over the other). No box
 * pops in and there's no Save: what's typed is the line's, kept by whoever holds it as the caret leaves (the strip's
 * editor and the subtitle over the video, `TranscriptEditor.tsx`). One line, never a newline: Enter is the holder's.
 */

/** A stretch of the text Panki AI wrote. */
export type EditedRange = { from: number; to: number };

type Props = {
  id: string;
  label: string;
  text: string;
  edited: readonly EditedRange[];
  /** Take the focus and put the caret here, once for each `n`: the line just moved to. Null leaves the focus alone. */
  focusAt: { at: number; n: number } | null;
  disabled?: boolean;
  className?: string;
  onChange: (text: string) => void;
  /** A key pressed in it (never while a Japanese word is being composed), with the caret and whether nothing is selected. */
  onKey: (e: KeyboardEvent<HTMLTextAreaElement>, caret: number, collapsed: boolean) => void;
  onCaret: (caret: number) => void;
  onFocus: () => void;
  onBlur: (to: EventTarget | null) => void;
};

export function LineText({ id, label, text, edited, focusAt, disabled = false, className = "", onChange, onKey, onCaret, onFocus, onBlur }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = input.current;
    if (!focusAt || !el) return;
    el.focus({ preventScroll: true });
    const at = Math.max(0, Math.min(focusAt.at, el.value.length));
    el.setSelectionRange(at, at);
    // Once for each move, whatever the text does meanwhile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusAt?.n]);

  const parts: { text: string; ai: boolean }[] = [];
  let at = 0;
  for (const range of [...edited].sort((a, b) => a.from - b.from)) {
    if (range.from < at) continue;
    if (range.from > at) parts.push({ text: text.slice(at, range.from), ai: false });
    parts.push({ text: text.slice(range.from, range.to), ai: true });
    at = range.to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), ai: false });

  return (
    <div className={`line-text ${className}`.trim()}>
      <div className="line-text-drawn" aria-hidden="true">
        {parts.map((part, i) =>
          part.ai ? (
            <span key={i} className="line-text-ai">
              {part.text}
              <span className="line-text-spark">
                <AiSpark />
              </span>
            </span>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
        {/* Keeps an empty line one line tall. */}
        {"​"}
      </div>
      <textarea
        ref={input}
        id={id}
        aria-label={label}
        className="line-text-input"
        lang="ja"
        rows={1}
        spellCheck={false}
        value={text}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ""))}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          const el = e.currentTarget;
          onKey(e, el.selectionStart, el.selectionStart === el.selectionEnd);
        }}
        onSelect={(e) => onCaret(e.currentTarget.selectionStart)}
        onFocus={onFocus}
        onBlur={(e) => onBlur(e.relatedTarget)}
      />
    </div>
  );
}
