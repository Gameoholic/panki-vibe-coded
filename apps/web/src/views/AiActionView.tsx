import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTION_NAME_MAX,
  ACTION_SECONDS_MAX,
  ACTION_WORDS_MAX,
  AiActionUpdate,
  CARD_LEAVES,
  CARD_PARTS,
  EXPLAIN_PARTS,
  EXPLAIN_PART_NAMES,
  TOUCH_UP,
  contextLengthOf,
  eachWayOf,
  isPankiAction,
  knobsProblem,
  type ActionPart,
  type AiActionUpdate as Update,
  type KeptAction,
  type PankiAiStatus,
  type TouchUpKey,
} from "@panki/contracts";
import { actionCeilingWords } from "../aiTemplateKinds";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { KNOB_WORDS } from "../components/AiRun";
import { Icon } from "../components/Icon";
import { NumberField } from "../components/NumberField";
import { Setting } from "../components/Setting";
import { TextField } from "../components/TextField";
import { Toggle } from "../components/Toggle";
import { useUndoable } from "../hooks/useUndoable";
import type { UnsavedGuard } from "../unsaved";
import type { SaveStatus } from "./SrsTypeView";

/** What a field says when it's wrong. One home. */
const MESSAGES = {
  name: "Give the action a name.",
  nameLong: `Keep the name under ${ACTION_NAME_MAX} characters.`,
  wordsLong: `At most ${ACTION_WORDS_MAX.toLocaleString("en")} characters.`,
};

/** What's edited: everything an action is but its id and its place, which never change, and whether it's a default. */
type Draft = Update & { isDefault: boolean };
const draftOf = (action: KeptAction, isDefault: boolean): Draft => ({
  name: action.name,
  words: action.words,
  requires: action.requires,
  leaves: action.leaves,
  seconds: action.seconds,
  isDefault,
});
const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
/** A list of knobs with one ticked or unticked, in the order the place gives them. */
function toggled<T extends string>(all: readonly T[], list: readonly T[], one: T): T[] {
  return all.filter((each) => (each === one ? !list.includes(each) : list.includes(each)));
}

type Props = {
  /** The action as it's saved (one of Panki's as it comes); for one never saved yet, what it starts as. */
  action: KeptAction;
  /** Never saved yet: it exists only on this screen until its first Save. */
  isNew: boolean;
  /** Ticked as its place's conversation opens. */
  isDefault: boolean;
  /** Panki AI as it stands: the model and limits an admin set, which "Each message" reads. */
  ai: PankiAiStatus;
  /** Saves what's on screen: an action made by its first Save (`id` null), or one kept saved again; with whether it's a default. */
  onSave: (update: Update, isDefault: boolean, id: string | null) => Promise<KeptAction>;
  onRemove: (id: string) => Promise<void>;
  /** A new action as a copy of this one, unsaved. */
  onDuplicate: (action: KeptAction) => void;
  onStatus: (status: SaveStatus) => void;
  /** Says whether there's unsaved work here, so leaving the screen can ask first (null when there's none). */
  onGuard: (guard: UnsavedGuard | null) => void;
};

/**
 * A Panki AI action's editor ("Touch up, steered" step 2), with a template's care: its name, its words (what it says in
 * a message), what a message with it alone can cost, its knobs (what it requires, a card's fields or a word's parts, and
 * how far the video subtitles reach, either place's), and whether it's a default, ticked as
 * a conversation opens; then Duplicate and Delete. One of Panki's is edited the same way, the account's copy standing in
 * its place. Nothing reaches the API until Save, in the screen's header; leaving unsaved asks first, Ctrl+Z undoes.
 */
export function AiActionView({ action, isNew, isDefault, ai, onSave, onRemove, onDuplicate, onStatus, onGuard }: Props) {
  const history = useUndoable(draftOf(action, isDefault));
  const { change } = history;
  const draft = history.present;
  /** What the API has; null until a new action's first Save. */
  const [saved, setSaved] = useState<Draft | null>(isNew ? null : draftOf(action, isDefault));
  const [keptId, setKeptId] = useState<string | null>(isNew ? null : action.id);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteAt = useRef<HTMLButtonElement>(null);
  const { place } = action;
  const settings = ai.settings;

  const { isDefault: lit, ...update } = draft;
  const dirty = saved === null || !sameDraft(draft, saved);
  const parsed = useMemo(() => AiActionUpdate.safeParse(update), [update]);
  const knobs = parsed.success ? knobsProblem({ ...parsed.data, place }) : null;
  const errors = useMemo(() => {
    if (parsed.success) return {};
    const found: { name?: string; words?: string } = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "name") found.name ??= issue.code === "too_big" ? MESSAGES.nameLong : MESSAGES.name;
      else if (issue.path[0] === "words") found.words ??= MESSAGES.wordsLong;
    }
    return found;
  }, [parsed]);
  const valid = parsed.success && knobs === null;
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
    onStatus({ name: draft.name, state: status, canSave: dirty && valid && !saving });
  }, [draft.name, status, dirty, valid, saving, onStatus]);

  /** Save: what's on screen becomes the action. Says whether it did. */
  async function save(): Promise<boolean> {
    if (!parsed.success || knobs !== null || saving) return false;
    const sent = parsed.data;
    const sentDraft = draft;
    setSaving(true);
    setSaveFailure(null);
    try {
      const result = await onSave(sent, lit, keptId);
      setKeptId(result.id);
      const now = draftOf(result, sentDraft.isDefault);
      setSaved(now);
      // As Panki keeps it (trimmed), unless it's been changed again while the save was on its way.
      history.amend((present) => (sameDraft(present, sentDraft) ? now : present));
      return true;
    } catch (e) {
      setSaveFailure(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  async function remove(id: string) {
    setBusy(true);
    setFailure(null);
    try {
      await onRemove(id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  /** A row of chips, one per knob the place takes, each ticked or not. */
  function chips<T extends string>(
    id: string,
    label: string,
    all: readonly T[],
    on: readonly T[],
    nameOf: (each: T) => string,
    onChange: (next: T[]) => void,
    hint?: { about: string; words: string },
  ) {
    return (
      <Setting
        id={id}
        label={label}
        hint={hint}
        control={
          <div className="chips" role="group" aria-label={label}>
            {all.map((each) => (
              <Button key={each} variant="chip" aria-pressed={on.includes(each)} onClick={() => onChange(toggled(all, on, each))}>
                {nameOf(each)}
              </Button>
            ))}
          </div>
        }
      />
    );
  }
  /** The (?) on Requires. */
  const REQUIRES_HINT = {
    about: "What Requires means",
    words: "What Panki AI must include in its answer when you send this action.",
  };
  /** The (?) on Leave out. */
  const LEAVES_HINT = {
    about: "What Leave out means",
    words: "What Panki AI must never answer when you send this action.",
  };
  const requiresCard = draft.requires.filter((part) => CARD_PARTS.includes(part));
  const leavesCard = draft.leaves.filter((part) => CARD_LEAVES.includes(part));
  /** A card's part by its name: the answer's reply as the word's says it, a field by its Touch up name. */
  const cardPartName = (part: ActionPart) => (part === "reply" ? EXPLAIN_PART_NAMES.reply : TOUCH_UP[part as TouchUpKey].name);
  const isWordPart = (part: ActionPart) => (EXPLAIN_PARTS as readonly string[]).includes(part);
  const requiresWord = draft.requires.filter(isWordPart);
  const leavesWord = draft.leaves.filter(isWordPart);
  const wordPartName = (part: ActionPart) => EXPLAIN_PART_NAMES[part as (typeof EXPLAIN_PARTS)[number]];
  /** Requires set: a part ticked there is taken out of Leave out, never both. */
  const setRequires = (next: ActionPart[]) => change({ ...draft, requires: next, leaves: draft.leaves.filter((part) => !next.includes(part)) });
  /** Leave out set: a part ticked there is taken out of Requires, never both. */
  const setLeaves = (next: ActionPart[]) => change({ ...draft, leaves: next, requires: draft.requires.filter((part) => !next.includes(part)) });
  const kept = keptId;
  /**
   * How much of the video a message with this action sends, either place's: the same row for both, the conversation's
   * name for it, typed as its whole length (half before and half after) and kept each way (`eachWayOf`).
   */
  const secondsRow = (
    <Setting
      id="aiActionSeconds"
      label={KNOB_WORDS.reach}
      control={
        <NumberField
          id="ai-action-seconds"
          label={KNOB_WORDS.reach}
          value={contextLengthOf(draft.seconds)}
          min={0}
          max={contextLengthOf(ACTION_SECONDS_MAX)}
          step={10}
          suffix="seconds"
          onChange={(length) => change({ ...draft, seconds: eachWayOf(length) }, "seconds")}
        />
      }
    />
  );

  return (
    <div className="ai-template-editor">
      {saveFailure || (failure && !deleting) ? (
        <p className="load-error" role="alert">
          {saveFailure ?? failure}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="ai-action-about-title">
        <h2 id="ai-action-about-title" className="panel-title">
          About
        </h2>
        <TextField id="ai-action-name" label="Name" autoComplete="off" value={draft.name} onChange={(name) => change({ ...draft, name }, "name")} error={errors.name} />
        <TextField id="ai-action-words" label="Words" multiline value={draft.words} onChange={(words) => change({ ...draft, words }, "words")} error={errors.words} />
        <Setting id="aiActionCost" label="Each message" control={<span className="setting-value">{actionCeilingWords({ ...draft, id: action.id, place }, settings)}</span>} />
        <Setting
          id="aiActionDefault"
          label="Default"
          control={<Toggle id="ai-action-default" says={{ on: "On", off: "Off" }} on={draft.isDefault} onChange={(on) => change({ ...draft, isDefault: on })} />}
        />
      </section>

      <section className="panel" aria-labelledby="ai-action-knobs-title">
        <h2 id="ai-action-knobs-title" className="panel-title">
          Answer
        </h2>
        {place === "card" ? (
          <>
            {chips<ActionPart>("aiActionRequires", "Requires", CARD_PARTS, requiresCard, cardPartName, setRequires, REQUIRES_HINT)}
            {chips<ActionPart>("aiActionLeaves", "Leave out", CARD_LEAVES, leavesCard, cardPartName, setLeaves, LEAVES_HINT)}
            {secondsRow}
          </>
        ) : (
          <>
            {chips<ActionPart>("aiActionRequires", "Requires", EXPLAIN_PARTS, requiresWord, wordPartName, setRequires, REQUIRES_HINT)}
            {chips<ActionPart>("aiActionLeaves", "Leave out", EXPLAIN_PARTS, leavesWord, wordPartName, setLeaves, LEAVES_HINT)}
            {secondsRow}
          </>
        )}
        {knobs !== null ? (
          <p className="field-error" role="alert">
            {knobs}
          </p>
        ) : null}
      </section>

      {kept !== null ? (
        <div className="ai-template-foot">
          <div className="add-actions add-actions-start">
            <Button id="ai-action-duplicate" disabled={busy} onClick={() => onDuplicate({ ...action, ...update, id: kept })}>
              <Icon name="copy" />
              Duplicate
            </Button>
            <Button
              ref={deleteAt}
              id="ai-action-delete"
              className="is-danger"
              aria-pressed={deleting}
              aria-expanded={deleting}
              disabled={busy}
              onClick={() => setDeleting(!deleting)}
            >
              <Icon name="trash" />
              Delete…
            </Button>
          </div>
          {deleting ? (
            <Ask
              idPrefix="ai-action-delete"
              anchor={deleteAt}
              question={`Delete “${saved?.name ?? draft.name}”?`}
              detail={isPankiAction(kept) ? "Restore Panki's actions brings it back." : undefined}
              go={{ words: "Delete action", busy: "Deleting…" }}
              busy={busy}
              failure={failure}
              onKeep={() => setDeleting(false)}
              onGo={() => void remove(kept)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
