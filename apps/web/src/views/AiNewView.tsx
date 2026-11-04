import { templatesOf, type AiActionId, type AiTemplate } from "@panki/contracts";
import { templateSub } from "../aiTemplateKinds";
import { Button } from "../components/Button";

type Props = {
  action: AiActionId;
  /** The account's own templates, every action's. */
  own: readonly AiTemplate[];
  /** The template to start as a copy of, or null to start from nothing. */
  onPick: (base: AiTemplate | null) => void;
};

/** A new template starts as a copy of one of its action's there already, or empty; picking opens it in the editor, as a draft until it's saved (the SRS type's new page is the pattern). */
export function AiNewView({ action, own, onPick }: Props) {
  return (
    <section className="panel" aria-labelledby="ai-start-title">
      <h2 id="ai-start-title" className="panel-title">
        Start from
      </h2>
      <div className="starts">
        <Button variant="row" className="btn-start" data-base="empty" onClick={() => onPick(null)}>
          <span className="deck-name">
            Empty
            <span className="row-sub">A blank prompt.</span>
          </span>
        </Button>
        {templatesOf(action, own).map((template) => {
          const sub = templateSub(template);
          return (
            <Button key={template.id} variant="row" className="btn-start" data-base={template.id} onClick={() => onPick(template)}>
              <span className="deck-name">
                {template.name}
                {sub ? <span className="row-sub">{sub}</span> : null}
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
