import { useEffect, useState } from "react";
import {
  ACTION_PLACE_IDS,
  AI_ACTIONS,
  AI_PLACES,
  AI_PLACE_IDS,
  AI_INSTRUCTIONS_MAX,
  AI_STARTERS,
  NO_ACCOUNT_ACTIONS,
  TEMPLATED_PLACE_IDS,
  actionKindOf,
  actionOf,
  actionsOf,
  defaultTemplateOf,
  keptActionOf,
  openingActionsOf,
  restorableOf,
  templatesOf,
  type ActionPlaceId,
  type AiAction,
  type AiPlaceId,
  type AiTemplate,
  type KeptAction,
  type PankiAiStatus,
  type Settings,
} from "@panki/contracts";
import { ASK_OVER_OPTIONS, actionCeilingWords, askOverId, askOverOf, ceilingWords } from "../aiTemplateKinds";
import { useDragOrder } from "../hooks/useDragOrder";
import { AiSpark } from "../components/AiWaiting";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { ExplainedTitle } from "../components/Explainer";
import { Icon } from "../components/Icon";
import { Setting } from "../components/Setting";
import { Skeleton } from "../components/Skeleton";
import { TextField } from "../components/TextField";
import { AiScene } from "../explainers/aiScenes";
import { rememberShape, shapeOf } from "../skeletonMemory";

type Props = {
  /** Panki AI as it stands, with the account's own templates; null while it loads. */
  ai: PankiAiStatus | null;
  /** Each place's default as the account has it. */
  defaults: Settings["aiDefaults"];
  /** Above what a run asks first (`Settings.aiAskOverMicros`). */
  askOver: number | null;
  onAskOver: (askOver: number | null) => void;
  /** From what a run's cost is shown beside it (`Settings.aiShowCostOverMicros`). */
  showCostOver: number | null;
  onShowCostOver: (showCostOver: number | null) => void;
  /** User instructions, the account's standing message (`Settings.aiInstructions`). */
  instructions: string;
  onInstructions: (instructions: string) => void;
  onOpen: (template: AiTemplate) => void;
  onNew: (place: AiPlaceId) => void;
  /** An action opened in its editor: the account's own, or one of Panki's (as it comes, or the account's copy). */
  onOpenAction: (action: KeptAction) => void;
  onNewAction: (place: ActionPlaceId) => void;
  /** A place's actions dragged into a new order, every one of them by id. */
  onArrange: (place: ActionPlaceId, order: string[]) => void;
  /** One of Panki's actions the account edited or deleted, Panki's own again. */
  onRestore: (id: string) => void;
};

/** What this device remembers of how many rows a place's list drew: its actions, or its templates with Panki's own. */
const rowsKey = (place: AiPlaceId) => `rows:ai:${place}`;

/**
 * Settings → Panki AI (AI step 5): Ask before a message is over and Show the cost when a message is over, the account's
 * own, two thresholds on the same choices, saved a moment after a change, and User instructions, the account's standing
 * message to every conversation, whose prompts are the admin's; then a panel per place, its title with its (?), the
 * place played at work (`explainers/aiScenes.tsx`). The word's and the card's list their actions ("Touch up, steered"
 * step 2) in the account's order, which is the composer's, each dragged by its grip, New action under them and, where
 * the account edited or deleted any of Panki's, Restore Panki's actions…. The transcript's lists Proofread's templates as
 * the SRS types are: the account's own first, then under a thin line Panki's, quieter and each with a lock; New template
 * under them.
 */
export function AiTemplatesTab({ ai, defaults, askOver, onAskOver, showCostOver, onShowCostOver, instructions, onInstructions, onOpen, onNew, onOpenAction, onNewAction, onArrange, onRestore }: Props) {
  useEffect(() => {
    if (!ai) return;
    for (const place of AI_PLACE_IDS) rememberShape(rowsKey(place), isActionPlace(place) ? actionsOf(ai.actions, place).length : templatesOf(place, ai.templates).length);
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
          label="Ask before a message is over"
          control={<Dropdown id="setting-ai-ask-over" label="Ask before a message is over" options={ASK_OVER_OPTIONS} value={askOverId(askOver)} onChange={(id) => onAskOver(askOverOf(id))} />}
        />
        <Setting
          id="aiShowCostOver"
          label="Show the cost when a message is over"
          control={
            <Dropdown
              id="setting-ai-show-cost-over"
              label="Show the cost when a message is over"
              options={ASK_OVER_OPTIONS}
              value={askOverId(showCostOver)}
              onChange={(id) => onShowCostOver(askOverOf(id))}
            />
          }
        />
        {/* The word's and the card's prompts are the admin's: what the account steers both with is its standing message. */}
        <Instructions value={instructions} onChange={onInstructions} />
      </section>
      {AI_PLACE_IDS.map((place) => (
        <section key={place} className="panel" aria-labelledby={`ai-${place}-templates-title`}>
          {/* Its (?) plays the place at work, as the extension's panels play theirs, with the account's templates and costs. */}
          <ExplainedTitle name={AI_PLACES[place].name} titleId={`ai-${place}-templates-title`}>
            <AiScene place={place} ai={ai} defaults={defaults} showCostOver={showCostOver} />
          </ExplainedTitle>
          {isActionPlace(place) ? (
            ai ? (
              <ActionRows place={place} ai={ai} onOpen={onOpenAction} onArrange={onArrange} />
            ) : (
              <Skeleton shape="rows" count={shapeOf(rowsKey(place), actionsOf(NO_ACCOUNT_ACTIONS, place).length)} />
            )
          ) : ai ? (
            <TemplateRows place={place} ai={ai} defaultId={defaultTemplateOf(place, defaults, ai.templates).id} onOpen={onOpen} />
          ) : (
            <Skeleton shape="rows" count={shapeOf(rowsKey(place), AI_STARTERS.filter((t) => t.place === place).length)} />
          )}
          {isActionPlace(place) ? (
            <div className="add-actions add-actions-start">
              <Button id={`ai-${place}-new`} onClick={() => onNewAction(place)}>
                <Icon name="add" />
                New action
              </Button>
              {ai ? <RestoreActions place={place} ai={ai} onRestore={onRestore} /> : null}
            </div>
          ) : TEMPLATED_PLACE_IDS.includes(place) ? (
            <div className="add-actions add-actions-start">
              <Button id={`ai-${place}-new`} onClick={() => onNew(place)}>
                <Icon name="add" />
                New template
              </Button>
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}

const isActionPlace = (place: AiPlaceId): place is ActionPlaceId => (ACTION_PLACE_IDS as readonly string[]).includes(place);

/** A list of rows moved by one drag: `from` taken out and put back at `to`. */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [taken] = next.splice(from, 1);
  if (taken !== undefined) next.splice(to, 0, taken);
  return next;
}

/**
 * One place's actions in the account's order, the composer's: a row each, its grip to drag it (or the arrow keys on it),
 * its name with Default where it's ticked as a conversation opens, its words on one quiet line, and what a message with
 * it alone can cost on the model set in Admin. One of Panki's as it comes is quieter, with the lock; edited, it reads as
 * the account's own.
 */
function ActionRows({ place, ai, onOpen, onArrange }: { place: ActionPlaceId; ai: PankiAiStatus; onOpen: (action: KeptAction) => void; onArrange: (place: ActionPlaceId, order: string[]) => void }) {
  const all = actionsOf(ai.actions, place);
  const order = useDragOrder(all.length, (from, to) => onArrange(place, moved(all, from, to).map((action) => action.id)));
  return (
    <ul className={`deck-list action-list ${order.dragging !== null ? "is-reordering" : ""}`.trim()}>
      {all.map((action, i) => (
        <li key={action.id} ref={order.rowRef(i)} style={order.rowStyle(i)} className={`deck-item action-item ${order.dragging === i ? "is-dragging" : ""}`.trim()}>
          <ActionRow action={action} ai={ai} grip={order.handleProps(i)} gripOff={all.length === 1} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

/** One action's row: its grip, then the row that opens it. */
function ActionRow({
  action,
  ai,
  grip,
  gripOff,
  onOpen,
}: {
  action: AiAction;
  ai: PankiAiStatus;
  grip: ReturnType<ReturnType<typeof useDragOrder>["handleProps"]>;
  gripOff: boolean;
  onOpen: (action: KeptAction) => void;
}) {
  const book = ai.actions;
  const builtin = actionKindOf(book, action.id) === "panki";
  const opening = openingActionsOf(book, action.place);
  return (
    <div className="action-line">
      <Button className="btn-icon field-grip" aria-label={`Move ${action.name}`} disabled={gripOff} {...grip}>
        <Icon name="grip" />
      </Button>
      {/* The editor opens on the action as it's kept, where it stands under another as it was saved. */}
      <Button variant="row" className={`srs-row action-row ${builtin ? "is-builtin" : ""}`.trim()} data-action={action.id} onClick={() => onOpen(keptActionOf(actionOf(book, action.id) ?? action))}>
        {builtin ? <Icon name="lock" /> : null}
        <span className="deck-name">
          {action.name}
          {opening.includes(action.id) ? (
            <span className="template-default">
              <Icon name="star" />
              Default
            </span>
          ) : null}
          {action.words.trim() !== "" ? <span className="row-sub">{action.words}</span> : null}
        </span>
        <span className="deck-count">{actionCeilingWords(action, ai.settings)}</span>
      </Button>
    </div>
  );
}

/** Panki's actions of a place the account edited or deleted, each brought back as Panki's own when it's picked. */
function RestoreActions({ place, ai, onRestore }: { place: ActionPlaceId; ai: PankiAiStatus; onRestore: (id: string) => void }) {
  const restorable = restorableOf(ai.actions, place);
  if (restorable.length === 0) return null;
  return (
    <Dropdown
      id={`ai-${place}-restore`}
      label={RESTORE_WORDS}
      placeholder={RESTORE_WORDS}
      options={restorable.map((id): { id: string; label: string } => ({ id, label: AI_ACTIONS[id].name }))}
      // Nothing is ever the value: a pick restores that action, and the button goes on saying what it does.
      value=""
      onChange={onRestore}
    />
  );
}
const RESTORE_WORDS = "Restore Panki's actions…";

/**
 * User instructions, the account's standing message to Panki AI: typed here, saved a moment after typing stops as the
 * tab's other settings are, the `{User instructions}` of the word's and the card's prompts with every message of a
 * conversation, and shown at its top.
 * Kept on screen as typed; one past the limit says so and isn't saved until it's back under.
 */
function Instructions({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [typed, setTyped] = useState(value);
  // What's kept arrives after the tab is drawn, and again after a save elsewhere: taken while nothing's being typed here.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setTyped(value);
  }, [value, touched]);
  const over = typed.length > AI_INSTRUCTIONS_MAX;
  return (
    <TextField
      id="setting-ai-instructions"
      label={INSTRUCTIONS_WORDS.label}
      multiline
      value={typed}
      error={over ? INSTRUCTIONS_WORDS.long : undefined}
      onChange={(text) => {
        setTouched(true);
        setTyped(text);
        if (text.length <= AI_INSTRUCTIONS_MAX) onChange(text);
      }}
    />
  );
}
const INSTRUCTIONS_WORDS = {
  label: "User instructions",
  long: `Keep the instructions under ${AI_INSTRUCTIONS_MAX.toLocaleString("en")} characters.`,
};

/** One place's templates: the account's own, a thin line, then Panki's. */
function TemplateRows({ place, ai, defaultId, onOpen }: { place: AiPlaceId; ai: PankiAiStatus; defaultId: string; onOpen: (template: AiTemplate) => void }) {
  const all = templatesOf(place, ai.templates);
  const own = all.filter((t) => !t.builtin);
  const builtin = all.filter((t) => t.builtin);
  const row = (template: AiTemplate) => {
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
