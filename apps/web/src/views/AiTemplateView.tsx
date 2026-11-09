import { useEffect, useMemo, useRef, useState } from "react";
import {
  AI_PLACES,
  AI_PLACE_IDS,
  AI_PROVIDERS,
  AiTemplateUpdate,
  PROMPT_MAX,
  TEMPLATE_NAME_MAX,
  firstStarterOf,
  type AiTemplate,
  type AiTemplateUpdate as Update,
  type PankiAiStatus,
} from "@panki/contracts";
import { TAKES_FOLLOW_UPS, ceilingHow, ceilingWords } from "../aiTemplateKinds";
import { AnswerParts } from "../components/AnswerParts";
import { Ask } from "../components/Ask";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { PromptContext } from "../components/PromptContext";
import { PromptField, type PromptFieldHandle } from "../components/PromptField";
import { Setting } from "../components/Setting";
import { TextField } from "../components/TextField";
import { useUndoable } from "../hooks/useUndoable";
import type { UnsavedGuard } from "../unsaved";
import type { SaveStatus } from "./SrsTypeView";

/** What a field says when it's wrong. One home. */
const MESSAGES = {
  name: "Give the template a name.",
  nameLong: `Keep the name under ${TEMPLATE_NAME_MAX} characters.`,
  prompt: "Write the prompt.",
  followUp: "Write the follow-up prompt.",
  promptLong: `At most ${PROMPT_MAX.toLocaleString("en")} characters.`,
};

const PLACE_OPTIONS = AI_PLACE_IDS.map((id) => ({ id, label: AI_PLACES[id].name }));

/** What's edited: everything a template is but its id and its place, which never change. */
const fieldsOf = (template: AiTemplate): Update => ({ name: template.name, prompt: template.prompt, followUp: template.followUp, judges: template.judges });
const sameFields = (a: Update, b: Update) => a.name === b.name && a.prompt === b.prompt && a.followUp === b.followUp && a.judges === b.judges;

type ParseError = Extract<ReturnType<typeof AiTemplateUpdate.safeParse>, { success: false }>["error"];
type Errors = { name?: string; prompt?: string; followUp?: string };

function errorsOf(error: ParseError): Errors {
  const errors: Errors = {};
  for (const issue of error.issues) {
    const long = issue.code === "too_big";
    const [head] = issue.path;
    if (head === "name") errors.name ??= long ? MESSAGES.nameLong : MESSAGES.name;
    else if (head === "prompt") errors.prompt ??= long ? MESSAGES.promptLong : MESSAGES.prompt;
    else if (head === "followUp") errors.followUp ??= long ? MESSAGES.promptLong : MESSAGES.followUp;
  }
  return errors;
}

/** The two prompts a template has, either the one a variable pressed in Prompt context goes into. */
type Box = "prompt" | "followUp";

type Props = {
  /** The template as it's saved; for one never saved yet, what it starts as. */
  template: AiTemplate;
  /** Never saved yet: it exists only on this screen until its first Save. */
  isNew: boolean;
  /** Panki AI as it stands: the model and limits an admin set, which Each run and Prompt context read. */
  ai: PankiAiStatus;
  /** It's what its place's button runs. */
  isDefault: boolean;
  /** Saves what's on screen: a template made by its first Save (`id` null), or one kept saved again. */
  onSave: (update: Update, id: string | null) => Promise<AiTemplate>;
  onRemove: (id: string) => Promise<void>;
  /** A new template as a copy of this one, unsaved. */
  onDuplicate: (template: AiTemplate) => void;
  onMakeDefault: (id: string) => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  /** Says whether there's unsaved work here, so leaving the screen can ask first (null when there's none). */
  onGuard: (guard: UnsavedGuard | null) => void;
};

/**
 * A Panki AI template's editor (AI step 5), with the SRS editor's care: its name, its place (fixed), what a run can
 * cost; its Prompt and, for a place that takes follow-ups
 * (`TAKES_FOLLOW_UPS`), its Follow-up prompt, each a `PromptField`, Prompt context's
 * variables going in at the caret of the one last in use; what Panki AI answers; then Make default, Duplicate and
 * Delete. Nothing reaches the API until Save, in the screen's header; leaving unsaved asks first, Ctrl+Z undoes. One of
 * Panki's own is shown read-only, Duplicate in the header in Save's place, Make default still here.
 */
export function AiTemplateView({ template, isNew, ai, isDefault, onSave, onRemove, onDuplicate, onMakeDefault, onStatus, onGuard }: Props) {
  const history = useUndoable(fieldsOf(template));
  const { change } = history;
  const draft = history.present;
  /** What the API has; null until a new template's first Save. */
  const [saved, setSaved] = useState<AiTemplate | null>(isNew ? null : template);
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteAt = useRef<HTMLButtonElement>(null);
  const locked = template.builtin;
  const { place } = template;

  const fields = { prompt: useRef<PromptFieldHandle>(null), followUp: useRef<PromptFieldHandle>(null) };
  /** The prompt a variable pressed goes into: the one last in use, the Prompt to begin with. */
  const [last, setLast] = useState<Box>("prompt");

  const dirty = !locked && (saved === null || !sameFields(draft, fieldsOf(saved)));
  const parsed = useMemo(() => AiTemplateUpdate.safeParse(draft), [draft]);
  const errors = useMemo(() => (parsed.success || locked ? {} : errorsOf(parsed.error)), [parsed, locked]);
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

  /** Save: what's on screen becomes the template. Says whether it did. */
  async function save(): Promise<boolean> {
    if (!parsed.success || saving || locked) return false;
    const sent = parsed.data;
    setSaving(true);
    setSaveFailure(null);
    try {
      const result = await onSave(sent, saved?.id ?? null);
      setSaved(result);
      // As Panki keeps it (trimmed), unless it's been changed again while the save was on its way.
      history.amend((present) => (sameFields(present, sent) ? fieldsOf(result) : present));
      return true;
    } catch (e) {
      setSaveFailure(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await work();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const promptBox = (box: Box, label: string) => (
    <div onFocus={() => setLast(box)}>
      <PromptField
        id={`ai-template-${box}`}
        label={label}
        ref={fields[box]}
        value={draft[box]}
        readOnly={locked}
        error={errors[box]}
        onChange={(typed) => change({ ...draft, [box]: typed }, box)}
      />
    </div>
  );
  /** The template as Panki keeps it: one never saved has no Make default, Duplicate or Delete. */
  const kept = locked ? template : saved;

  return (
    <div className="ai-template-editor">
      {/* A delete that didn't go through says so in its question, below. */}
      {saveFailure || (failure && !deleting) ? (
        <p className="load-error" role="alert">
          {saveFailure ?? failure}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="ai-template-about-title">
        <h2 id="ai-template-about-title" className="panel-title">
          About
        </h2>
        <TextField id="ai-template-name" label="Name" autoComplete="off" value={draft.name} disabled={locked} onChange={(name) => change({ ...draft, name }, "name")} error={errors.name} />
        <Setting id="aiTemplateAction" label="Place" control={<Dropdown id="ai-template-action" label="Place" options={PLACE_OPTIONS} value={place} disabled onChange={() => undefined} />} />
        <Setting
          id="aiTemplateRun"
          label="Each run"
          hint={{ about: "How Each run is worked out", words: ceilingHow(place, ai.settings) }}
          control={<span className="setting-value">{ceilingWords({ place, prompt: draft.prompt }, ai.settings)}</span>}
        />
      </section>

      <section className="panel" aria-labelledby="ai-template-prompt-title">
        <h2 id="ai-template-prompt-title" className="panel-title">
          Prompt
        </h2>
        {promptBox("prompt", "Prompt")}
        <AnswerParts id="ai-template-answer" place={place} provider={AI_PROVIDERS[ai.settings.aiProvider].name} />
      </section>

      {/* A place with no follow-ups (Proofread) shows none; its template keeps its follow-up prompt as it is. */}
      {TAKES_FOLLOW_UPS[place] ? (
        <section className="panel" aria-labelledby="ai-template-follow-up-title">
          <h2 id="ai-template-follow-up-title" className="panel-title">
            Follow-up prompt
          </h2>
          {promptBox("followUp", "Follow-up prompt")}
        </section>
      ) : null}

      <section className="panel" aria-labelledby="ai-template-context-title">
        <h2 id="ai-template-context-title" className="panel-title">
          Prompt context
        </h2>
        <PromptContext limits={ai.settings} canInsert={!locked} onInsert={(text) => fields[last].current?.insert(text)} />
      </section>

      {kept ? (
        <div className="ai-template-foot">
          <div className="add-actions add-actions-start">
            {isDefault ? (
              <Button id="ai-template-default" aria-pressed disabled>
                <Icon name="star" />
                Default
              </Button>
            ) : (
              <Button id="ai-template-default" disabled={busy} onClick={() => void run(() => onMakeDefault(kept.id))}>
                <Icon name="star" />
                Make default
              </Button>
            )}
            {/* One of Panki's own has Duplicate in the header, where Save would be. */}
            {locked ? null : (
              <>
                <Button id="ai-template-duplicate" disabled={busy} onClick={() => onDuplicate(kept)}>
                  <Icon name="copy" />
                  Duplicate
                </Button>
                <Button
                  ref={deleteAt}
                  id="ai-template-delete"
                  className="is-danger"
                  aria-pressed={deleting}
                  aria-expanded={deleting}
                  disabled={busy}
                  onClick={() => setDeleting(!deleting)}
                >
                  <Icon name="trash" />
                  Delete…
                </Button>
              </>
            )}
          </div>
          {deleting && !locked ? (
            <Ask
              idPrefix="ai-template-delete"
              anchor={deleteAt}
              question={`Delete “${kept.name}”?`}
              detail={isDefault ? `${firstStarterOf(place).name} becomes the default.` : undefined}
              go={{ words: "Delete template", busy: "Deleting…" }}
              busy={busy}
              failure={failure}
              onKeep={() => setDeleting(false)}
              onGo={() => void run(() => onRemove(kept.id))}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
