import { useEffect, useRef, useState } from "react";
import {
  ADMIN_PROMPT_PLACE_IDS,
  AI_PLACES,
  AI_PROVIDERS,
  DEFAULT_ADMIN_PROMPTS,
  PROMPT_MAX,
  adminPromptOf,
  messagePartOf,
  variableOf,
  variablesIn,
  type AdminPromptPlaceId,
  type PankiAiStatus,
} from "@panki/contracts";
import { api } from "../api";
import { AnswerParts } from "../components/AnswerParts";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { PromptContext } from "../components/PromptContext";
import { PromptField, type PromptFieldHandle } from "../components/PromptField";
import { useUndoable } from "../hooks/useUndoable";
import type { UnsavedGuard } from "../unsaved";
import type { SaveStatus } from "./SrsTypeView";

/** What the prompts' boxes say. One home. */
const WORDS = {
  empty: "Write the prompt.",
  long: `At most ${PROMPT_MAX.toLocaleString("en")} characters.`,
  label: "Prompt",
  /** What the screen's header names while it's unsaved. */
  name: "Panki AI's prompts",
  /** Under a box while its prompt has nowhere for an account's User instructions to go. */
  noInstructions: `User instructions aren't sent: this prompt has no ${variableOf("instructions")}.`,
  /** Over what Panki sends with every message, under each prompt: where the first goes, and that every later one goes alone. */
  messagePart: `Sent with each message: the first at ${variableOf("firstMessage")} (after the prompt without it), every later one on its own after the conversation so far`,
};

/** Each place's prompt as it's edited, by place. */
type Prompts = Record<AdminPromptPlaceId, string>;
const promptsOf = (status: PankiAiStatus): Prompts =>
  Object.fromEntries(ADMIN_PROMPT_PLACE_IDS.map((place) => [place, adminPromptOf(status.settings, place)])) as Prompts;
const samePrompts = (a: Prompts, b: Prompts) => ADMIN_PROMPT_PLACE_IDS.every((place) => a[place] === b[place]);
/** Whether a prompt is wrong, in the box's words. */
const errorOf = (prompt: string): string | undefined => (prompt.trim() === "" ? WORDS.empty : prompt.length > PROMPT_MAX ? WORDS.long : undefined);
/** Whether a prompt is Panki's own: kept as "" so Panki's default keeps improving under it. */
const isDefaultOf = (place: AdminPromptPlaceId, prompt: string) => prompt.trim() === DEFAULT_ADMIN_PROMPTS[place].trim();

type Props = {
  status: PankiAiStatus;
  onStatus: (status: PankiAiStatus) => void;
  /** The header's words on whether it's saved, and its Save; null while there's nothing unsaved, so the header stays bare. */
  onSaveStatus: (status: SaveStatus | null) => void;
  /** Says whether there's unsaved work here, so leaving the screen can ask first (null when there's none). */
  onGuard: (guard: UnsavedGuard | null) => void;
};

/**
 * The prompts that are the admin's for everyone (Touch up, steered), one per place: the word's, what opens every
 * conversation about a word pointed at, and the card's, about a card; each with its pieces, its rules, how each message is answered, and where
 * each account's User instructions go. Under each place's heading, its Prompt as a template's was: a `PromptField`, a
 * quiet line while it has no `{User instructions}`, Reset to default, Panki's answer format folded under it (the shape is
 * Panki's whatever the prompt says); then Prompt context once, its variables going in at the caret of the prompt last
 * in use. Saved together by Save in the header, leaving unsaved asks first, as every editor that takes a while is; one
 * undo history over both. A prompt is kept as "" while it's Panki's own, so Panki's default keeps improving under it.
 */
export function AiPromptSection({ status, onStatus, onSaveStatus, onGuard }: Props) {
  const kept = promptsOf(status);
  const history = useUndoable(kept);
  const draft = history.present;
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const boxes = { word: useRef<PromptFieldHandle>(null), card: useRef<PromptFieldHandle>(null) } satisfies Record<AdminPromptPlaceId, unknown>;
  /** The prompt a variable pressed goes into: the one last in use, the first to begin with. */
  const [last, setLast] = useState<AdminPromptPlaceId>(ADMIN_PROMPT_PLACE_IDS[0]);

  const dirty = !samePrompts(draft, kept);
  const invalid = ADMIN_PROMPT_PLACE_IDS.some((place) => errorOf(draft[place]) !== undefined);

  const saveRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  async function save(): Promise<boolean> {
    if (invalid || saving) return false;
    setSaving(true);
    setFailure(null);
    try {
      const aiPrompts = Object.fromEntries(ADMIN_PROMPT_PLACE_IDS.map((place) => [place, isDefaultOf(place, draft[place]) ? "" : draft[place]])) as Prompts;
      const next = await api.updateAi({ aiPrompts });
      onStatus(next);
      const saved = promptsOf(next);
      history.amend((present) => (samePrompts(present, draft) ? saved : present));
      return true;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  useEffect(() => {
    onGuard(dirty ? { name: WORDS.name, save: () => saveRef.current() } : null);
  }, [dirty, onGuard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  useEffect(() => {
    onSaveStatus(dirty || saving || failure ? { name: "Admin", state: saving ? "saving" : failure ? "failed" : "unsaved", canSave: dirty && !invalid && !saving } : null);
  }, [dirty, saving, failure, invalid, onSaveStatus]);
  useEffect(() => () => onSaveStatus(null), [onSaveStatus]);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  const provider = AI_PROVIDERS[status.settings.aiProvider].name;
  return (
    <>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      {ADMIN_PROMPT_PLACE_IDS.map((place) => {
        const prompt = draft[place];
        const sendsInstructions = variablesIn(prompt).some((variable) => variable.piece === "instructions");
        return (
          <section key={place} className="panel-section" aria-labelledby={`ai-prompt-${place}-title`}>
            <h3 id={`ai-prompt-${place}-title`} className="panel-subtitle">
              {AI_PLACES[place].name}
            </h3>
            <div onFocus={() => setLast(place)}>
              <PromptField
                id={`ai-prompt-${place}`}
                label={WORDS.label}
                ref={boxes[place]}
                value={prompt}
                error={errorOf(prompt)}
                onChange={(typed) => history.change({ ...draft, [place]: typed }, `prompt-${place}`)}
              />
            </div>
            {sendsInstructions ? null : <p className="ai-prompt-note">{WORDS.noInstructions}</p>}
            {/* What Panki sends with every message, read-only, in plain view: the user's words, then Panki's own lines. */}
            <div className="answer-parts-body">
              <div className="answer-parts-shape">
                <p className="answer-parts-title">{WORDS.messagePart}</p>
                <pre className="answer-parts-message">{messagePartOf(place)}</pre>
              </div>
            </div>
            <div className="add-actions add-actions-start">
              <Button id={`ai-prompt-${place}-reset`} disabled={isDefaultOf(place, prompt)} onClick={() => history.change({ ...draft, [place]: DEFAULT_ADMIN_PROMPTS[place] })}>
                <Icon name="reset" />
                Reset to default
              </Button>
            </div>
            <AnswerParts id={`ai-prompt-${place}-answer`} place={place} provider={provider} />
          </section>
        );
      })}
      <PromptContext limits={status.settings} canInsert onInsert={(text) => boxes[last].current?.insert(text)} />
    </>
  );
}
