import { useState } from "react";
import { PIECE_SOURCES, PROMPT_PIECE_IDS, SOURCE_WORDS, pieceAbout, variableOf, type PankiAi } from "@panki/contracts";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** The limits a piece's description says, as they're set (Admin → Panki AI → Limits). */
export type PieceLimits = Pick<PankiAi, "aiMaxDescriptionChars" | "aiSurroundingSeconds">;

type Props = {
  /** The limits as they're set, which the descriptions say. */
  limits: PieceLimits;
  /** Whether a variable pressed can go into a prompt: not into one that's only for reading (one of Panki's templates). Copy stays. */
  canInsert: boolean;
  /** A variable pressed: it goes in at the caret of the prompt last in use. */
  onInsert: (text: string) => void;
};

/**
 * Every piece a prompt can use, drawn from the registry (`PROMPT_PIECE_IDS`), never typed out here: the variable, pressed
 * to go in at the prompt's caret, with Copy beside it; what it holds, its numbers read from the limits as they're set;
 * and where it comes from, in the field mapping's own words. A template's editor is its one home (Admin → Panki AI's
 * until AI step 5, 2026-11-01).
 */
export function PromptContext({ limits, canInsert, onInsert }: Props) {
  return (
    <div className="prompt-context" role="table" aria-label="Prompt context">
      <div className="prompt-context-row is-head" role="row">
        <span role="columnheader">Variable</span>
        <span role="columnheader">Description</span>
        <span role="columnheader">Source</span>
      </div>
      {PROMPT_PIECE_IDS.map((id) => (
        <div key={id} className="prompt-context-row" role="row">
          <span className="prompt-context-var" role="cell">
            <Button id={`ai-variable-${id}`} variant="chip" className="prompt-var-chip" disabled={!canInsert} onClick={() => onInsert(variableOf(id))}>
              {variableOf(id)}
            </Button>
            <CopyButton id={`ai-variable-${id}-copy`} text={variableOf(id)} />
          </span>
          <span role="cell">{pieceAbout(id, limits)}</span>
          <span className="prompt-context-source" role="cell">
            {SOURCE_WORDS[PIECE_SOURCES[id]]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** What pressing Copy came to, said on the button until the pointer leaves it or it loses the focus (never on a timer). */
type Copied = "copied" | "failed" | null;
const COPY_LOOKS: Record<"copy" | "copied" | "failed", { icon: "copy" | "check" | "alert"; words: string }> = {
  copy: { icon: "copy", words: "Copy" },
  copied: { icon: "check", words: "Copied" },
  failed: { icon: "alert", words: "Couldn't copy" },
};

/** Some words to the clipboard: Copy, then Copied with a tick. Its words are stacked, so it's as wide in every state. */
export function CopyButton({ id, text, disabled = false }: { id: string; text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState<Copied>(null);
  const now = copied ?? "copy";
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <Button
      id={id}
      variant="ghost"
      className="prompt-context-copy"
      disabled={disabled}
      onClick={() => void copy()}
      // A finger "leaves" as it lifts, so on a touch screen only the focus moving on says it's done.
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setCopied(null);
      }}
      onBlur={() => setCopied(null)}
    >
      <Icon name={COPY_LOOKS[now].icon} />
      <span className="copy-words" role="status">
        {/* Copy and Copied hold the width; the rare Couldn't copy is let widen it rather than every button stand that wide. */}
        {(now === "failed" ? (["failed"] as const) : (["copy", "copied"] as const)).map((look) => (
          <span key={look} aria-hidden={look === now ? undefined : true}>
            {COPY_LOOKS[look].words}
          </span>
        ))}
      </span>
    </Button>
  );
}
