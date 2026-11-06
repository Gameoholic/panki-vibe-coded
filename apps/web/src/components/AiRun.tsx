import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  AI_PROVIDERS,
  aiModelOf,
  aiSent,
  asksFirst,
  showsCost,
  ceilingMicros,
  piecesAsSent,
  type AiTemplate,
  type ExplainMessage,
  type PankiAi,
  type PankiAiStatus,
  type PromptPieces,
  type TemplateId,
} from "@panki/contracts";
import { useAnchored } from "../hooks/useAnchored";
import { useDismiss } from "../hooks/useDismiss";
import { estimateWords } from "../words";
import { AiSpark } from "./AiWaiting";
import { Ask } from "./Ask";
import { Button } from "./Button";
import { Form } from "./Form";
import { Icon } from "./Icon";
import { ScrollEdges } from "./ScrollEdges";
import { TextField } from "./TextField";

/**
 * What every Panki AI action on a page runs through (AI step 5), the pop-up's Explain and the drawer's Touch up alike
 * (the extension's; the web's since Settings → Panki AI's explainers draw them too, `explainers/aiScenes.tsx`):
 * the most a run can cost, worked out as the call itself will be (`ceilingOf`); the question asked first when that's
 * over the account's Ask before a run over (`useAskFirst`, `RunAsk`); the arrow beside an action's button with every
 * template it can run (`TemplateMenu`); and the follow-up asked under an answer (`FollowUp`). One home each, so the two
 * actions can't drift apart.
 */

/** What these say, one home. */
export const RUN_WORDS = {
  /**
   * The most a run can cost, as it's said beside it: only at or over the account's Show the cost when a run is over
   * (`PankiAiStatus.showCostOverMicros`), nothing under it.
   */
  upTo: (micros: number, showOver: number | null): string | null => (showsCost(micros, showOver) ? `Up to ${estimateWords(micros)}` : null),
  /** The question before a template's first ask: its name, and the most it can cost. */
  runFor: (name: string, micros: number) => `Run ${name} for up to ${estimateWords(micros)}?`,
  /** The question before a follow-up. */
  askFor: (micros: number) => `Ask for up to ${estimateWords(micros)}?`,
  run: "Run",
  running: "Running…",
  /** The arrow beside an action's button, for a screen reader. */
  templates: "Templates",
  followUp: "Ask a follow-up",
  ask: "Ask",
  empty: "Type a question.",
  long: (max: number) => `Keep the question under ${max.toLocaleString("en")} characters.`,
  /** Why an action's button is greyed, beside it, the same for every action (signed out is each action's own). */
  off: "Panki AI is off.",
  noKey: (provider: string) => `No key for ${provider}.`,
};

/**
 * Why an action can't run, said beside its greyed button whatever it is, so a button is never greyed without a
 * reason: what went wrong asking, signed out (`signedOut`, the action's own words),
 * Panki AI switched off, or no key for its provider. Nothing while what's true is still being asked (`known` false), and
 * nothing when it can run (the cost stands there then). Explain and Touch up are both this.
 */
export function whyNot(known: boolean, ai: Pick<PankiAiStatus, "settings" | "key"> | null, failure: string | null, signedOut: string): string | null {
  if (!known) return null;
  if (failure) return failure;
  if (ai === null) return signedOut;
  if (!ai.settings.aiOn) return RUN_WORDS.off;
  return ai.key === null ? RUN_WORDS.noKey(AI_PROVIDERS[ai.settings.aiProvider].name) : null;
}

/**
 * The most a call can cost at the model's listed prices: the template's prompt filled from the pieces as Panki sends
 * them, the conversation so far, and a follow-up's own prompt (`aiSent`), with the action's Max answer length. What
 * `startCall` says of the call once it's made, worked out before the press.
 */
export function ceilingOf(
  settings: PankiAi,
  template: Pick<AiTemplate, "prompt" | "followUp">,
  pieces: PromptPieces,
  said: readonly ExplainMessage[],
  asking: PromptPieces,
  maxAnswerTokens: number,
): number {
  return ceilingMicros(aiModelOf(settings), aiSent(template, piecesAsSent(pieces, settings), said, piecesAsSent(asking, settings)), maxAnswerTokens);
}

/** A run waiting on its question: where it's asked (each action has its places), the words, and the run itself. */
export type Asked = { where: string; question: string; go: () => void };

/**
 * Ask before a run over (the account's own, `PankiAiStatus.askOverMicros`): a press whose ceiling is over it waits on
 * its question, asked where the answer would go; at or under it, it runs at once. One question at a time: a press
 * elsewhere takes its place.
 */
export function useAskFirst() {
  const [asked, setAsked] = useState<Asked | null>(null);
  /** A press: run now, or ask first. */
  function press(askOver: number | null, where: string, ceiling: number, question: string, go: () => void) {
    if (!asksFirst(ceiling, askOver)) {
      setAsked(null);
      go();
      return;
    }
    setAsked({
      where,
      question,
      go: () => {
        setAsked(null);
        go();
      },
    });
  }
  return { asked, press, cancel: () => setAsked(null), at: (where: string) => (asked?.where === where ? asked : null) };
}

/**
 * The question itself, in place where the answer would go: what it can cost, Run with the spark filled in the accent
 * (a question about money, not a loss: `Ask`'s `spends`), and Cancel.
 */
export function RunAsk({ id, asked, onCancel }: { id: string; asked: Asked | null; onCancel: () => void }) {
  if (!asked) return null;
  return (
    <div className="ai-run-ask">
      <Ask
        idPrefix={`${id}-run`}
        question={asked.question}
        go={{ words: RUN_WORDS.run, busy: RUN_WORDS.running, spends: { lead: <AiSpark /> } }}
        busy={false}
        failure={null}
        onKeep={onCancel}
        onGo={asked.go}
      />
    </div>
  );
}

/** A template as its action's menu lists it: what its first ask can cost here, or nothing while that can't be said. */
export type TemplateRow = { template: AiTemplate; cost: string | null };

type MenuProps = {
  id: string;
  /** The action's templates in their order (`templatesOf`): the account's default is listed first. */
  rows: readonly TemplateRow[];
  defaultId: TemplateId;
  /** The template the button runs here, lit: the default until another is picked in this pop-up or drawer. */
  chosenId: TemplateId;
  disabled: boolean;
  onPick: (template: AiTemplate) => void;
  /** The menu opened: Panki AI asked again, so a template made a moment ago is in it. */
  onOpen?: () => void;
  /** The action's own button, the arrow joined to its end. */
  children: ReactNode;
};

/**
 * An action's button with a small arrow at its end: the button runs the
 * template chosen here, named on it; the arrow opens a menu under it of every template, each with the most its first
 * ask can cost, the account's default first, the chosen one lit as a `Dropdown`'s value is (`aria-pressed`; templates
 * are edited in Settings → Panki AI alone, so the menu has no Edit row).
 * Picking one runs it and makes it the button's for this pop-up or drawer alone, never the account's default. A press
 * outside it or Escape closes it.
 */
export function TemplateMenu({ id, rows, defaultId, chosenId, disabled, onPick, onOpen, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(root, open, () => setOpen(false));
  // The pop-up and the drawer scroll: the menu stands over them in the window, never cut off by them.
  useAnchored(root, menu, open && !disabled);
  const ordered = [...rows.filter((row) => row.template.id === defaultId), ...rows.filter((row) => row.template.id !== defaultId)];
  return (
    <span ref={root} className="ai-split">
      {children}
      <Button
        id={`${id}-templates`}
        className="ai-explain-button ai-split-arrow"
        aria-label={RUN_WORDS.templates}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        disabled={disabled}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        <Icon name="down" />
      </Button>
      {open && !disabled ? (
        <>
          <div ref={menu} className="menu ai-templates" role="listbox" aria-label={RUN_WORDS.templates}>
            {ordered.map(({ template, cost }) => (
              <Button
                key={template.id}
                variant="item"
                role="option"
                aria-pressed={template.id === chosenId}
                onClick={() => {
                  setOpen(false);
                  onPick(template);
                }}
              >
                <span className="dropdown-choice">{template.name}</span>
                {cost ? <span className="dropdown-note">{cost}</span> : null}
              </Button>
            ))}
          </div>
          <ScrollEdges of={menu} />
        </>
      ) : null}
    </span>
  );
}

type FollowUpProps = {
  id: string;
  value: string;
  error?: string | undefined;
  disabled: boolean;
  /** What stands beside Ask: the most it can cost, the conversation so far included, or why it can't run. */
  beside: string | null;
  /**
   * Inside another form (the drawer's, whose submit is Add): a box of its own rather than a form in a form, Enter and
   * Ctrl+Enter asking here and never reaching the card's form.
   */
  nested?: boolean;
  /** A small one, under a field's note. */
  small?: boolean;
  /**
   * Folded to one quiet line, "Ask a follow-up" with the most it can cost beside it, until it's pressed: then the box,
   * the focus in it; Escape, or the focus leaving it, with nothing typed folds it back. Touch up's, where a box under
   * every note would make the drawer twice as long.
   */
  folded?: boolean;
  onChange: (value: string) => void;
  onAsk: () => void;
};

/** A follow-up asked under an answer: the question, and Ask with the most it can cost beside it. Explain's and Touch up's alike. */
export function FollowUp({ id, value, error, disabled, beside, nested = false, small = false, folded = false, onChange, onAsk }: FollowUpProps) {
  // A question typed and left stands open: it's only the empty box that folds away.
  const [open, setOpen] = useState(!folded || value.trim() !== "");
  const line = useRef<HTMLDivElement>(null);
  // Folded back by Escape, the focus goes to the line it folded into rather than out of the drawer.
  const refocus = useRef(false);
  useEffect(() => {
    if (open || !refocus.current) return;
    refocus.current = false;
    line.current?.querySelector("button")?.focus();
  }, [open]);
  const className = `ai-explain-ask${small ? " is-small" : ""}`;
  if (folded && !open) {
    return (
      <div ref={line} className={`${className} is-folded`}>
        <div className="ai-explain-go">
          <Button className="ai-explain-button is-quiet" disabled={disabled} onClick={() => setOpen(true)}>
            <AiSpark />
            {RUN_WORDS.followUp}
          </Button>
          {beside ? <span className="btn-beside">{beside}</span> : null}
        </div>
      </div>
    );
  }
  const inside = (
    <>
      <TextField
        id={`${id}-question`}
        label={RUN_WORDS.followUp}
        value={value}
        onChange={onChange}
        error={error}
        autoComplete="off"
        autoFocus={folded}
        onEnter={nested ? () => (disabled ? undefined : onAsk()) : undefined}
      />
      <div className="ai-explain-go">
        <Button type={nested ? "button" : "submit"} className="ai-explain-button" disabled={disabled} onClick={nested ? onAsk : undefined}>
          <AiSpark />
          {RUN_WORDS.ask}
        </Button>
        {beside ? <span className="btn-beside">{beside}</span> : null}
      </div>
    </>
  );
  /** Folding back, only while nothing is typed: Escape (kept from closing what it stands in) and the focus going elsewhere. */
  const foldKeys = (e: KeyboardEvent<HTMLElement>) => {
    if (!folded || e.key !== "Escape" || value.trim() !== "") return;
    e.preventDefault();
    e.stopPropagation();
    refocus.current = true;
    setOpen(false);
  };
  const foldBlur = (e: FocusEvent<HTMLElement>) => {
    if (!folded || value.trim() !== "" || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setOpen(false);
  };
  if (!nested) {
    return (
      <Form className={className} onSubmit={onAsk} onKeyDownCapture={foldKeys} onBlur={foldBlur}>
        {inside}
      </Form>
    );
  }
  // Ctrl+Enter sends the form it's in from any field: here it asks, and the card's form never hears it.
  const keep = (e: KeyboardEvent<HTMLDivElement>) => {
    foldKeys(e);
    if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) onAsk();
  };
  return (
    <div className={className} role="group" aria-label={RUN_WORDS.followUp} onKeyDown={keep} onBlur={foldBlur}>
      {inside}
    </div>
  );
}

/**
 * What Panki AI wrote, as plain paragraphs (nothing the model writes reaches the page as markup), rising in as it
 * lands: Explain's answers and Touch up's replies alike.
 */
export function AnswerText({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
  return (
    <div className="ai-explain-answer">
      {paragraphs.map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
    </div>
  );
}

/** Whether a question can be asked, and why not in the app's words: typed, and within Max follow-up length. */
export function questionProblem(text: string, maxChars: number): string | null {
  if (text === "") return RUN_WORDS.empty;
  return text.length > maxChars ? RUN_WORDS.long(maxChars) : null;
}
