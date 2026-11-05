import { useState, type ReactNode } from "react";
import { ACCURACY_NAMES, type MeaningAccuracyId } from "@panki/contracts";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";

/**
 * The chevron that unfolds a reason under what it's beside (`.judged-why`), turned over while it's open, in the
 * accuracy's colour where there is one and its line's otherwise. A judged meaning's row and every Touch up note under a
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
 * A meaning Panki AI judged, wherever it's listed, the meaning itself highlighted and the why a small fold of its own: lit in its accuracy's look (`app.css` →
 * `.ai-accuracy`, the one home: green, orange, red and struck through, on what's in `.ai-accuracy-words`), a chevron at its
 * end unfolding the reason under it, closed to begin with. `children` is the row itself: the pop-up's meaning, or a
 * `Dropdown`'s choice. `as="li"` in a list, with `value` its number there where it isn't its place. The pop-up under
 * Explain and the drawer's Meaning list under Touch up are both this; never a second drawing of a judged meaning.
 */
export function JudgedRow({
  accuracy,
  reason,
  as = "div",
  value,
  className,
  children,
}: {
  accuracy: MeaningAccuracyId;
  reason: string;
  as?: "div" | "li";
  value?: number;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Tag = as;
  return (
    <Tag className={["judged ai-accuracy ai-accuracy-lit", `is-${accuracy}`, className].filter(Boolean).join(" ")} {...(value !== undefined ? { value } : {})}>
      <div className="judged-row">
        <div className="judged-words">{children}</div>
        <WhyButton open={open} label={`${ACCURACY_NAMES[accuracy]}: why`} onToggle={() => setOpen(!open)} />
      </div>
      <Fold open={open}>
        <p className="judged-reason">
          <span className="ai-answer-tag ai-accuracy-tag">{ACCURACY_NAMES[accuracy]}</span>
          {reason}
        </p>
      </Fold>
    </Tag>
  );
}
