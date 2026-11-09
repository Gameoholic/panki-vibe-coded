import { useState, type ReactNode } from "react";
import { MEANING_JUDGEMENT_NAMES, type Judgement } from "@panki/contracts";
import type { ChangeChip, ChipState } from "./AiConversation";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";

/** Where the chip of an answer that judged the meanings goes when pressed: the meanings themselves. */
export const MEANINGS_CHIP = "meanings";
/**
 * What an answer that judged the meanings changed, as its conversation's chip (`AiConversation`): "Meanings", its dot in
 * how they came out (green when one fits, the accent for a meaning Panki AI proposes, orange when the best is close,
 * red when none fits), standing while they're lit as it judged them and replaced once a later answer judged them again.
 * The word's conversation in the pop-up, and its explainer's.
 */
export function meaningsChip(rows: readonly { judgement: Judgement }[], proposed: boolean, state: ChipState): ChangeChip {
  const tone = rows.some((row) => row.judgement === "good") ? "good" : proposed ? "accent" : rows.some((row) => row.judgement === "meh") ? "meh" : "bad";
  return { id: MEANINGS_CHIP, name: "Meanings", tone, state };
}

/**
 * The chevron that unfolds a reason under what it's beside (`.judged-why`), turned over while it's open, in the
 * judgement's colour where there is one and its line's otherwise. A judged meaning's row and every Touch up note under a
 * field are this; the reason itself goes in a `Fold` under them.
 */
export function WhyButton({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
  return (
    <Button className={`judged-why${open ? " is-open" : ""}`} aria-expanded={open} aria-label={label} onClick={onToggle}>
      <Icon name="down" />
    </Button>
  );
}

/**
 * A meaning Panki AI judged, wherever it's listed, the meaning itself highlighted and the why a small fold of its own:
 * lit in its judgement's look (`app.css` → `.ai-judgement`, the one home: green, orange, red and struck through, on
 * what's in `.ai-judgement-words`), a chevron at its end unfolding the reason under it, its judgement's words on a
 * meaning (Fits, Close, Doesn't fit) as a tag before it, closed to begin with. `children` is the row itself: the
 * pop-up's meaning, or a `Dropdown`'s choice. `as="li"` in a list, with `value` its number there where it isn't its
 * place. The pop-up and the drawer's Meaning list are both this; never a second drawing of a judged meaning.
 */
export function JudgedRow({
  judgement,
  reason,
  as = "div",
  value,
  className,
  children,
}: {
  judgement: Judgement;
  reason: string;
  as?: "div" | "li";
  value?: number;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Tag = as;
  return (
    <Tag className={["judged ai-judgement ai-judgement-lit", `is-${judgement}`, className].filter(Boolean).join(" ")} {...(value !== undefined ? { value } : {})}>
      <div className="judged-row">
        <div className="judged-words">{children}</div>
        <WhyButton open={open} label={`${MEANING_JUDGEMENT_NAMES[judgement]}: why`} onToggle={() => setOpen(!open)} />
      </div>
      <Fold open={open}>
        <p className="judged-reason">
          <span className="ai-answer-tag ai-judgement-tag">{MEANING_JUDGEMENT_NAMES[judgement]}</span>
          {reason}
        </p>
      </Fold>
    </Tag>
  );
}
