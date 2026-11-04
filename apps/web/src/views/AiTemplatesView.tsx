import { useEffect } from "react";
import { AI_ACTIONS, AI_ACTION_IDS, AI_STARTERS, defaultTemplateOf, templatesOf, type AiActionId, type AiTemplate, type PankiAiStatus, type Settings } from "@panki/contracts";
import { ASK_OVER_OPTIONS, askOverId, askOverOf, ceilingWords, templateSub } from "../aiTemplateKinds";
import { AiSpark } from "../components/AiWaiting";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { ExplainedTitle } from "../components/Explainer";
import { Icon } from "../components/Icon";
import { Setting } from "../components/Setting";
import { Skeleton } from "../components/Skeleton";
import { AiScene } from "../explainers/aiScenes";
import { rememberShape, shapeOf } from "../skeletonMemory";

type Props = {
  /** Panki AI as it stands, with the account's own templates; null while it loads. */
  ai: PankiAiStatus | null;
  /** Each action's default as the account has it. */
  defaults: Settings["aiDefaults"];
  /** Above what a run asks first (`Settings.aiAskOverMicros`). */
  askOver: number | null;
  onAskOver: (askOver: number | null) => void;
  /** From what a run's cost is shown beside it (`Settings.aiShowCostOverMicros`). */
  showCostOver: number | null;
  onShowCostOver: (showCostOver: number | null) => void;
  onOpen: (template: AiTemplate) => void;
  onNew: (action: AiActionId) => void;
};

/** What this device remembers of how many of an action's templates the list drew, Panki's own with them. */
const rowsKey = (action: AiActionId) => `rows:ai:${action}`;

/**
 * Settings → Panki AI (AI step 5): Ask before a run is over and Show the cost when a run is over, the account's own, two
 * thresholds on the same choices (the owner, 2026-11-01: "2 settings overall"), saved a moment after a change; then a
 * panel per action listing its templates as the SRS types are listed (the owner, 2026-11-01: "do it like the SRS
 * does"): the account's own first, then under a thin line Panki's, quieter and each with a lock. A row is its name,
 * Default with the star on the one its button runs, whether it judges the meanings (Explain's), and what a run can cost
 * on the model set in Admin. New template under each. Each action's title has its (?), the action played at work
 * (`explainers/aiScenes.tsx`).
 */
export function AiTemplatesTab({ ai, defaults, askOver, onAskOver, showCostOver, onShowCostOver, onOpen, onNew }: Props) {
  useEffect(() => {
    if (ai) for (const action of AI_ACTION_IDS) rememberShape(rowsKey(action), templatesOf(action, ai.templates).length);
  }, [ai]);

  return (
    <>
      <section className="panel" aria-labelledby="panki-ai-title">
        <h2 id="panki-ai-title" className="panel-title has-icon">
          <AiSpark />
          Panki AI
        </h2>
        <Setting
          id="aiAskOver"
          label="Ask before a run is over"
          control={<Dropdown id="setting-ai-ask-over" label="Ask before a run is over" options={ASK_OVER_OPTIONS} value={askOverId(askOver)} onChange={(id) => onAskOver(askOverOf(id))} />}
        />
        <Setting
          id="aiShowCostOver"
          label="Show the cost when a run is over"
          control={
            <Dropdown
              id="setting-ai-show-cost-over"
              label="Show the cost when a run is over"
              options={ASK_OVER_OPTIONS}
              value={askOverId(showCostOver)}
              onChange={(id) => onShowCostOver(askOverOf(id))}
            />
          }
        />
      </section>
      {AI_ACTION_IDS.map((action) => (
        <section key={action} className="panel" aria-labelledby={`ai-${action}-templates-title`}>
          {/* Its (?) plays the action at work, as the extension's panels play theirs, with the account's templates and costs. */}
          <ExplainedTitle name={AI_ACTIONS[action].name} titleId={`ai-${action}-templates-title`}>
            <AiScene action={action} ai={ai} defaults={defaults} showCostOver={showCostOver} />
          </ExplainedTitle>
          {ai ? (
            <TemplateRows action={action} ai={ai} defaultId={defaultTemplateOf(action, defaults, ai.templates).id} onOpen={onOpen} />
          ) : (
            <Skeleton shape="rows" count={shapeOf(rowsKey(action), AI_STARTERS.filter((t) => t.action === action).length)} />
          )}
          <div className="add-actions add-actions-start">
            <Button id={`ai-${action}-new`} onClick={() => onNew(action)}>
              <Icon name="add" />
              New template
            </Button>
          </div>
        </section>
      ))}
    </>
  );
}

/** One action's templates: the account's own, a thin line, then Panki's. */
function TemplateRows({ action, ai, defaultId, onOpen }: { action: AiActionId; ai: PankiAiStatus; defaultId: string; onOpen: (template: AiTemplate) => void }) {
  const all = templatesOf(action, ai.templates);
  const own = all.filter((t) => !t.builtin);
  const builtin = all.filter((t) => t.builtin);
  const row = (template: AiTemplate) => {
    const sub = templateSub(template);
    return (
      <li key={template.id}>
        <Button variant="row" className={`srs-row template-row ${template.builtin ? "is-builtin" : ""}`.trim()} data-template={template.id} onClick={() => onOpen(template)}>
          {template.builtin ? <Icon name="lock" /> : null}
          <span className="deck-name">
            {template.name}
            {template.id === defaultId ? (
              <span className="template-default">
                <Icon name="star" />
                Default
              </span>
            ) : null}
            {sub ? <span className="row-sub">{sub}</span> : null}
          </span>
          <span className="deck-count">{ceilingWords(template, ai.settings)}</span>
        </Button>
      </li>
    );
  };
  return (
    <div>
      {own.length > 0 ? <ul className="deck-list">{own.map(row)}</ul> : null}
      {own.length > 0 && builtin.length > 0 ? <div className="list-rule" role="separator" /> : null}
      <ul className="deck-list">{builtin.map(row)}</ul>
    </div>
  );
}
