import { useEffect, useMemo, useRef, useState } from "react";
import { ANSWERS_MAX, ANSWERS_MIN, DESCRIPTION_MAX, GROW_MAX, GROW_MIN, SrsTypeUpdate, type SrsType, type SrsTypeUpdate as Update } from "@panki/contracts";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { FlowCanvas } from "../components/FlowCanvas";
import { FlowPreview } from "../components/FlowPreview";
import { Icon } from "../components/Icon";
import { NumberField } from "../components/NumberField";
import type { SaveState, UnsavedGuard } from "../unsaved";
import { Segmented } from "../components/Segmented";
import { TextField } from "../components/TextField";
import { Toggle } from "../components/Toggle";
import { useDragOrder } from "../hooks/useDragOrder";
import { useUndoable } from "../hooks/useUndoable";
import { addAnswer, addStage, edit, moveStage, patchAnswer, patchStage, removeAnswer, removeStage, renameAnswer, type Scope } from "../srsFlow";
import { AFTER_OPTIONS, NEW_WORDS, answerClass, stageName, stageWaitWords, tintStyle } from "../srsKinds";
import { count } from "../words";

/** What a field says when it's wrong. One home. */
const MESSAGES = {
  name: "Give the type a name.",
  nameLong: "Keep the name under 100 characters.",
  descriptionLong: `Keep it under ${DESCRIPTION_MAX} characters.`,
  answer: "Give the answer a name.",
  answersFew: `A type needs at least ${ANSWERS_MIN} answers.`,
  stagesFew: "A type needs at least one stage.",
  answerLong: "Keep it under 30 characters.",
  stageLong: "Keep it under 60 characters.",
  burned: "Give the Burned stage a name.",
};

/** What the header shows: the name as it's typed, and whether what's on screen is what's saved. */
export type SaveStatus = { name: string; state: SaveState; /** There are changes, and they can be saved as they stand. */ canSave: boolean };

type Props = {
  /** The type as it's saved; for one never saved yet, the copy it starts as. */
  type: SrsType;
  /** Never saved yet: it exists only on this screen until its first Save. */
  isNew: boolean;
  onSave: (typeId: string, update: Update, isNew: boolean) => Promise<SrsType>;
  onRemove: () => Promise<void>;
  /** Start a new type as a copy of this one (the way to change one that comes with the app). */
  onCopy: () => void;
  onStatus: (status: SaveStatus) => void;
  /** Says whether there's unsaved work here, so leaving the screen can ask first (null when there's none). */
  onGuard: (guard: UnsavedGuard | null) => void;
};

type ParseError = Extract<ReturnType<typeof SrsTypeUpdate.safeParse>, { success: false }>["error"];

type Errors = { name?: string; description?: string; burned?: string; stagesList?: string; answersList?: string; flow?: string; answers: Record<string, string>; stages: Record<string, string> };
const NO_ERRORS: Errors = { answers: {}, stages: {} };

/** The type as the API takes it; moves only for stages that are gone from the list. */
function updateOf(type: SrsType, moves: Record<string, string>): unknown {
  const stageIds = new Set(type.stages.map((s) => s.id));
  const pending = Object.fromEntries(Object.entries(moves).filter(([stageId]) => !stageIds.has(stageId)));
  return { name: type.name, description: type.description, stages: type.stages, answers: type.answers, flow: type.flow, overrides: type.overrides, lesson: type.lesson, after: type.after, growBy: type.growBy, burnedName: type.burnedName, moves: pending };
}
const sameShape = (a: SrsType, b: SrsType) => JSON.stringify(updateOf(a, {})) === JSON.stringify(updateOf(b, {}));

function errorsOf(type: SrsType, error: ParseError): Errors {
  const errors: Errors = { answers: {}, stages: {} };
  for (const issue of error.issues) {
    const [head, index, leaf] = issue.path;
    const long = issue.code === "too_big";
    if (head === "name") errors.name ??= long ? MESSAGES.nameLong : MESSAGES.name;
    else if (head === "description") errors.description ??= MESSAGES.descriptionLong;
    else if (head === "stages" && index === undefined) errors.stagesList ??= MESSAGES.stagesFew;
    else if (head === "answers" && index === undefined) errors.answersList ??= MESSAGES.answersFew;
    else if (head === "burnedName") errors.burned ??= MESSAGES.burned;
    else if (head === "answers" && typeof index === "number" && leaf === "name") {
      const answer = type.answers[index];
      if (answer) errors.answers[answer.id] ??= long ? MESSAGES.answerLong : MESSAGES.answer;
    } else if (head === "stages" && typeof index === "number" && leaf === "name") {
      const stage = type.stages[index];
      if (stage) errors.stages[stage.id] ??= MESSAGES.stageLong;
    } else errors.flow ??= issue.message;
  }
  return errors;
}

/**
 * An SRS type's editor: the live preview, its name, its answers, the rules chart, its stages (reordered by dragging,
 * the end of the ladder as the last row), and delete when no deck uses it. Nothing reaches the API until Save, which
 * sits in the screen's header (`App` draws it and calls the guard's `save`). Unsaved work lives on this screen only:
 * leaving asks first (the guard, and the browser's own question on a reload or a closed tab), and discarding is what
 * leaving without saving does. Ctrl+Z undoes a change. One that comes with the app is shown, not edited.
 */
export function SrsTypeView({ type, isNew, onSave, onRemove, onCopy, onStatus, onGuard }: Props) {
  const history = useUndoable(type);
  const { change, undo, redo } = history;
  const draft = history.present;
  /** What the API has; null until a new type's first Save. */
  const [saved, setSaved] = useState<SrsType | null>(isNew ? null : type);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  /** Where the cards on a removed stage go, until the save that carries it. */
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState<{ stageId: string; target: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  const dirty = saved === null || !sameShape(draft, saved);
  const parsed = useMemo(() => SrsTypeUpdate.safeParse(updateOf(draft, moves)), [draft, moves]);
  const errors = useMemo(() => (parsed.success ? NO_ERRORS : errorsOf(draft, parsed.error)), [draft, parsed]);
  const status: SaveStatus["state"] = saving ? "saving" : saveFailure ? "failed" : dirty ? "unsaved" : "saved";

  // While there's unsaved work, leaving asks first: the app's own question for its screens, and the browser's for a
  // reload or a closed tab (that one is the browser's to word; a page can only ask for it).
  const saveRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  useEffect(() => {
    onGuard(dirty ? { name: draft.name, save: () => saveRef.current() } : null);
  }, [dirty, draft.name, onGuard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  useEffect(() => {
    onStatus({ name: draft.name, state: status, canSave: dirty && parsed.success && !saving });
  }, [draft.name, status, dirty, parsed.success, saving, onStatus]);
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  /** Save: what's on screen becomes the type. Says whether it did. */
  async function save(): Promise<boolean> {
    if (!parsed.success || saving) return false;
    setSaving(true);
    setSaveFailure(null);
    try {
      const result = await onSave(draft.id, parsed.data, saved === null);
      setSaved(result);
      setMoves({});
      // The counts are the API's to derive; the draft takes them so a moved stage's cards show where they went.
      history.amend((present) => ({ ...present, cardCounts: result.cardCounts, deckCount: result.deckCount, builtin: result.builtin, createdAt: result.createdAt }));
      return true;
    } catch (e) {
      setSaveFailure(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  const order = useDragOrder(draft.stages.length, (from, to) => change(moveStage(draft, from, to)));
  const n = draft.stages.length;

  function askRemoveStage(stageId: string) {
    const cards = draft.cardCounts[stageId] ?? 0;
    if (cards === 0) {
      change(removeStage(draft, stageId));
      return;
    }
    const idx = draft.stages.findIndex((s) => s.id === stageId);
    const target = draft.stages[idx - 1] ?? draft.stages[idx + 1];
    if (target) setAsking({ stageId, target: target.id });
  }
  function confirmRemove() {
    if (!asking) return;
    setMoves((m) => ({ ...m, [asking.stageId]: asking.target }));
    change(removeStage(draft, asking.stageId));
    setAsking(null);
  }
  function addOneAnswer() {
    const id = crypto.randomUUID();
    change(addAnswer(draft, id));
    setFocusId(`answer-${id}`);
  }
  function addOneStage() {
    const id = crypto.randomUUID();
    change(addStage(draft, id));
    setFocusId(`stage-${id}`);
  }
  async function remove() {
    setBusy(true);
    setFailure(null);
    try {
      await onRemove();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const askingStage = asking ? draft.stages.find((s) => s.id === asking.stageId) : undefined;
  const askingIdx = asking ? draft.stages.findIndex((s) => s.id === asking.stageId) : -1;

  /**
   * An answer's name with whether it sits apart and whether it asks first. `locked` shows them as they're set, to be
   * read and not changed (a type that comes with the app; the owner, 2026-10-21: "answers too, everything").
   */
  const answerBlock = (answer: SrsType["answers"][number], i: number, locked: boolean) => (
    <div key={answer.id} className={`answer-name ${answerClass(draft.answers, i)} ${locked ? "is-locked" : ""}`.trim()}>
      <TextField id={`answer-${answer.id}`} label={`Answer ${i + 1}`} autoComplete="off" value={answer.name} readOnly={locked} onChange={(name) => change(renameAnswer(draft, answer.id, name), `answer-${answer.id}`)} error={errors.answers[answer.id]} />
      {locked ? null : (
        <Button className="btn-icon" aria-label="Remove answer" disabled={draft.answers.length <= ANSWERS_MIN} onClick={() => change(removeAnswer(draft, answer.id))}>
          <Icon name="close" />
        </Button>
      )}
      <div className="answer-opts">
        <Toggle
          id={`answer-aside-${answer.id}`}
          says={{ on: "Set apart", off: "With the others" }}
          on={answer.aside === true}
          disabled={locked || (!answer.aside && draft.answers.filter((a) => !a.aside).length <= ANSWERS_MIN)}
          onChange={(aside) => change(patchAnswer(draft, answer.id, { aside }))}
        />
        <Toggle id={`answer-confirm-${answer.id}`} says={{ on: "Ask to confirm", off: "No confirmation" }} on={answer.confirm === true} disabled={locked} onChange={(confirm) => change(patchAnswer(draft, answer.id, { confirm }))} />
      </div>
    </div>
  );
  /** New heads the stages: every type's, before the first, with nothing of its own to set but its rules on the chart. */
  const lessonLine = (
    <div className="stage-line lesson-line">
      <span className="stage-no is-lesson" aria-hidden="true" />
      <span className="stage-line-name">{NEW_WORDS.name}</span>
      <span className="field-hint">{NEW_WORDS.note}</span>
    </div>
  );

  // A type that comes with the app is for looking at and for starting your own from: the same preview and chart, every
  // setting shown as it's set and none to be changed.
  if (draft.builtin) {
    return (
      <div className="srs-editor">
        <FlowPreview type={draft} />
        <section className="panel" aria-labelledby="srs-builtin-title">
          <h2 id="srs-builtin-title" className="panel-title">
            Comes with Panki
          </h2>
          {draft.description ? <p className="empty">{draft.description}</p> : null}
          <p className="field-hint">It can't be changed. To make it yours, start a new type from it.</p>
          <div className="add-actions add-actions-start">
            <Button id="srs-copy" variant="primary" onClick={onCopy}>
              <Icon name="add" />
              New type from this one
            </Button>
          </div>
        </section>
        <section className="panel" aria-labelledby="srs-answers-title">
          <h2 id="srs-answers-title" className="panel-title">
            Answers
          </h2>
          <div className="answer-names">{draft.answers.map((answer, i) => answerBlock(answer, i, true))}</div>
        </section>
        <section className="panel" aria-labelledby="srs-flow-title">
          <h2 id="srs-flow-title" className="panel-title">
            What each answer does
          </h2>
          <FlowCanvas type={draft} scope={scope} onScope={setScope} onChange={change} onUndo={undo} onRedo={redo} canUndo={false} canRedo={false} readOnly />
          <p className="field-hint">Pick a stage above the chart to see its rules, and tap a box to see what it's set to. Drag the ground to pan, scroll to zoom.</p>
        </section>
        <section className="panel" aria-labelledby="srs-stages-title">
          <h2 id="srs-stages-title" className="panel-title">
            Stages
          </h2>
          <div className="stage-lines">
            {lessonLine}
            {draft.stages.map((stage, i) => (
              <div key={stage.id} className="stage-line">
                <span className="stage-no" style={tintStyle(i, n)}>
                  {i + 1}
                </span>
                <span className="stage-line-name">{stageName(draft, i)}</span>
                <span className="field-hint">{stageWaitWords(stage)}</span>
              </div>
            ))}
            {draft.after === "burn" ? (
              <div className="stage-line">
                <span className="stage-no is-burned">
                  <Icon name="flame" />
                </span>
                <span className="stage-line-name">{draft.burnedName}</span>
                <span className="field-hint">the card never comes back</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="srs-editor">
      <FlowPreview type={draft} />

      {failure || saveFailure ? (
        <p className="load-error" role="alert">
          {failure ?? saveFailure}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="srs-name-title">
        <h2 id="srs-name-title" className="panel-title">
          Name
        </h2>
        <TextField id="srs-name" label="Name" autoComplete="off" value={draft.name} onChange={(name) => change(edit(draft, (d) => void (d.name = name)), "name")} error={errors.name} />
        <TextField
          id="srs-description"
          label="Description"
          multiline
          autoComplete="off"
          value={draft.description}
          onChange={(description) => change(edit(draft, (d) => void (d.description = description)), "description")}
          error={errors.description}
        />
      </section>

      <section className="panel" aria-labelledby="srs-answers-title">
        <h2 id="srs-answers-title" className="panel-title">
          Answers
        </h2>
        <div className="answer-names">{draft.answers.map((answer, i) => answerBlock(answer, i, false))}</div>
        {errors.answersList ? (
          <p className="field-error" role="alert">
            {errors.answersList}
          </p>
        ) : null}
        <div className="add-actions add-actions-start">
          <Button id="add-answer" disabled={draft.answers.length >= ANSWERS_MAX} onClick={addOneAnswer}>
            <Icon name="add" />
            Add answer
          </Button>
        </div>
      </section>

      <section className="panel" aria-labelledby="srs-flow-title">
        <h2 id="srs-flow-title" className="panel-title">
          What each answer does
        </h2>
        <FlowCanvas type={draft} scope={scope} onScope={setScope} onChange={change} onUndo={undo} onRedo={redo} canUndo={history.canUndo} canRedo={history.canRedo} />
        {errors.flow ? (
          <p className="field-error" role="alert">
            {errors.flow}
          </p>
        ) : null}
        <p className="field-hint">Tap a box to change it, drag boxes around, press + on an arrow to ask again first. Drag the ground to pan, scroll to zoom. Ctrl+Z undoes.</p>
      </section>

      <section className={`panel ${asking ? "panel-alarm" : ""}`.trim()} aria-labelledby="srs-stages-title">
        <h2 id="srs-stages-title" className="panel-title">
          Stages
        </h2>
        <p className="field-hint">Drag to reorder. Pick a stage on the chart to name it and set how long it waits.</p>
        <div className={`stage-rows ${order.dragging !== null ? "is-reordering" : ""}`.trim()}>
          {lessonLine}
          {draft.stages.map((stage, i) => (
            <div key={stage.id} ref={order.rowRef(i)} style={order.rowStyle(i)} className={`stage-row ${order.dragging === i ? "is-dragging" : ""}`.trim()} data-stage={stage.id}>
              <Button className="btn-icon field-grip" aria-label="Move" disabled={n === 1} {...order.handleProps(i)}>
                <Icon name="grip" />
              </Button>
              <span className="stage-no" style={tintStyle(i, n)}>
                {i + 1}
              </span>
              <TextField id={`stage-${stage.id}`} label={`Stage ${i + 1}`} autoComplete="off" value={stage.name} onChange={(name) => change(patchStage(draft, stage.id, { name }), `stage-name-${stage.id}`)} error={errors.stages[stage.id]} />
              <Button className="btn-icon stage-remove" aria-label="Remove stage" disabled={n === 1 || asking !== null} onClick={() => askRemoveStage(stage.id)}>
                <Icon name="close" />
              </Button>
            </div>
          ))}
          {draft.after === "burn" ? (
            <div className="stage-row burned-row">
              <span className="stage-no is-burned">
                <Icon name="flame" />
              </span>
              <TextField id="burned-name" label="Burned stage" autoComplete="off" value={draft.burnedName} onChange={(name) => change(edit(draft, (d) => void (d.burnedName = name)), "burned")} error={errors.burned} />
              <span className="field-hint">the card never comes back</span>
              <Button id="remove-burned" className="btn-icon" aria-label="Remove the Burned stage" onClick={() => change(edit(draft, (d) => void (d.after = "repeat")))}>
                <Icon name="close" />
              </Button>
            </div>
          ) : null}
        </div>
        {asking && askingStage ? (
          <div className="ask">
            <p id="stage-move-question" className="question">
              Where do the {count(draft.cardCounts[asking.stageId] ?? 0, "card", "cards")} on {stageName(draft, askingIdx)} go?
            </p>
            <div className="chips" role="group" aria-label="Move to">
              {draft.stages
                .filter((s) => s.id !== asking.stageId)
                .map((s) => (
                  <Button key={s.id} variant="chip" aria-pressed={s.id === asking.target} onClick={() => setAsking({ ...asking, target: s.id })}>
                    {stageName(draft, draft.stages.indexOf(s))}
                  </Button>
                ))}
            </div>
            <div className="add-actions">
              <Button id="stage-move-keep" onClick={() => setAsking(null)}>
                Keep the stage
              </Button>
              <Button id="stage-move-go" variant="danger" onClick={confirmRemove}>
                Move them and remove it
              </Button>
            </div>
          </div>
        ) : null}
        {errors.stagesList ? (
          <p className="field-error" role="alert">
            {errors.stagesList}
          </p>
        ) : null}
        <div className="add-actions add-actions-start">
          <Button id="add-stage" onClick={addOneStage}>
            <Icon name="add" />
            Add stage
          </Button>
          {draft.after === "burn" ? null : (
            <Button id="add-burned" onClick={() => change(edit(draft, (d) => void (d.after = "burn")))}>
              <Icon name="flame" />
              Add {draft.burnedName}
            </Button>
          )}
        </div>
        {draft.after === "burn" ? null : (
          <div className="after-line">
            <span className="field-hint">After the last stage the card keeps coming back</span>
            <Segmented idPrefix="after" label="After the last stage" options={AFTER_OPTIONS} value={draft.after} onChange={(after) => change(edit(draft, (d) => void (d.after = after)))} />
            {draft.after === "grow" ? (
              <span className="grow">
                × <NumberField id="grow-by" label="Growth" value={draft.growBy} min={GROW_MIN} max={GROW_MAX} step={0.1} size="sm" onChange={(growBy) => change(edit(draft, (d) => void (d.growBy = growBy)))} />
              </span>
            ) : null}
          </div>
        )}
      </section>

      {/* A type never saved has nothing to delete: Discard does that. */}
      {saved === null ? null : (
      <section className={`panel ${deleting ? "panel-alarm" : ""}`.trim()} aria-labelledby="srs-delete-title">
        <h2 id="srs-delete-title" className="panel-title">
          Delete this SRS type
        </h2>
        {draft.deckCount > 0 ? (
          <p className="empty">Used by {count(draft.deckCount, "deck", "decks")}. An SRS type can be deleted once no deck uses it.</p>
        ) : deleting ? (
          <Ask
            idPrefix="srs-delete"
            question={`Delete “${draft.name}”?`}
            go={{ words: "Delete type", busy: "Deleting…" }}
            busy={busy}
            failure={null}
            onKeep={() => setDeleting(false)}
            onGo={() => void remove()}
          />
        ) : (
          <>
            <p className="empty">No deck uses it.</p>
            <div className="add-actions add-actions-start">
              <Button id="srs-delete" className="is-danger" onClick={() => setDeleting(true)}>
                Delete…
              </Button>
            </div>
          </>
        )}
      </section>
      )}
    </div>
  );
}
