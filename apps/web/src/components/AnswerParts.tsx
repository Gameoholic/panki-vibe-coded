import { useState } from "react";
import { ANSWER_FIXED, answerShapesOf, answerWordsUnsent, type AiActionId, type AnswerPart } from "@panki/contracts";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";

type Props = {
  /** Names the fold for the checks that drive the real UI. */
  id: string;
  action: AiActionId;
  /** Whether the template judges the meanings (Explain's): its shapes are the plain one's otherwise. */
  judges: boolean;
  /** The provider set in Admin, by name: what never sees the descriptions. */
  provider: string;
};

/** An answer's parts as a list, each key's own parts indented under it. */
function PartsList({ parts }: { parts: readonly AnswerPart[] }) {
  return (
    <ul className="answer-parts-list">
      {parts.map((part) => (
        <li key={part.key}>
          <code>{part.key}</code>: {part.words}
          {part.parts.length > 0 ? <PartsList parts={part.parts} /> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * What a template's answers hold, folded under its prompt and read-only (the owner, 2026-10-31, who feared that editing a
 * prompt could break the app): a line a key, read off each fixed shape it answers in (`answerShapesOf`), headed by which
 * call answers in it where there's more than one (Explain's first answer and a follow-up), and that the shape is
 * Panki's whatever the prompt says. A template's editor is its one home (Admin → Panki AI's until AI step 5). "What
 * Panki AI answers" until the owner, 2026-11-02: that read as the prompt's output, when it's the shape Panki sends the
 * provider as a schema with every call and holds the answer to; the clause after the title is their own words, muted.
 */
export function AnswerParts({ id, action, judges, provider }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="answer-parts">
      <Button className={`ai-details-more${open ? " is-open" : ""}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        Panki's answer format <span className="muted">– the AI must send the data back in this shape</span>
        <Icon name="down" />
      </Button>
      <Fold open={open} arrives={false}>
        <div id={id} className="answer-parts-body">
          {answerShapesOf(action, judges).map((shape) => (
            <div key={shape.title ?? "answer"} className="answer-parts-shape">
              {shape.title ? <p className="answer-parts-title">{shape.title}</p> : null}
              <PartsList parts={shape.parts} />
            </div>
          ))}
          {[ANSWER_FIXED, answerWordsUnsent(provider)].map((note) => (
            <p key={note} className="answer-parts-fixed">
              <Icon name="info" />
              {note}
            </p>
          ))}
        </div>
      </Fold>
    </div>
  );
}
