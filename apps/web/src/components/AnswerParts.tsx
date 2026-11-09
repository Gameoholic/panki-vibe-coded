import { useState } from "react";
import { ANSWER_FIXED, answerShapesOf, answerWordsUnsent, messagePartOf, type AiPlaceId, type AnswerPart } from "@panki/contracts";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";

type Props = {
  /** Names the fold for the checks that drive the real UI. */
  id: string;
  place: AiPlaceId;
  /** The provider set in Admin, by name: what never sees the descriptions. */
  provider: string;
};

/** The heading over what Panki sends after a place's prompt with every message. */
const MESSAGE_PART_TITLE = "Each message, after the prompt";

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
 * What a prompt's answers hold, folded under it and read-only (so it's plain that editing a prompt can't break the
 * app): a line a key, read off each fixed shape it answers in (`answerShapesOf`), headed where there's more than one
 * (Touch up's keys, then each shape a key can be in), and that the shape is Panki's whatever the prompt says. A
 * template's editor and Admin's prompts are its homes. Never called "What Panki AI answers", which
 * reads as the prompt's output: it's the shape Panki sends the provider as a schema with every call and holds the
 * answer to; the clause after the title is muted.
 */
export function AnswerParts({ id, place, provider }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="answer-parts">
      <Button className={`ai-details-more${open ? " is-open" : ""}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        Panki's answer format <span className="muted">– the AI must send the data back in this shape</span>
        <Icon name="down" />
      </Button>
      <Fold open={open} arrives={false}>
        <div id={id} className="answer-parts-body">
          {answerShapesOf(place).map((shape) => (
            <div key={shape.title ?? "answer"} className="answer-parts-shape">
              {shape.title ? <p className="answer-parts-title">{shape.title}</p> : null}
              <PartsList parts={shape.parts} />
            </div>
          ))}
          {/* What Panki sends after the prompt with every message: the user's words apart from its own requirements. */}
          {place === "word" || place === "card" ? (
            <div className="answer-parts-shape">
              <p className="answer-parts-title">{MESSAGE_PART_TITLE}</p>
              <pre className="answer-parts-message">{messagePartOf(place)}</pre>
            </div>
          ) : null}
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
