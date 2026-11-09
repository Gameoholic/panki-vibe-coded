/** @panki Sending to Panki AI: its cost (`ceilingOf`), asking first (`useAskFirst`), `TemplateMenu`, `FieldMessage`, the `Composer`. Never a second cost, question or message box. */
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import {
  AI_PROVIDERS,
  CONVERSATION_REACHES,
  contextLengthOf,
  aiModelOf,
  aiSent,
  asksFirst,
  showsCost,
  ceilingMicros,
  piecesAsSent,
  type ActionPlaceId,
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
import { Dropdown } from "./Dropdown";
import { Fold } from "./Fold";
import { Form } from "./Form";
import { Icon, type IconName } from "./Icon";
import { ScrollEdges } from "./ScrollEdges";
import { Segmented } from "./Segmented";
import { Setting } from "./Setting";
import { TextField } from "./TextField";
import { Tip } from "./Tip";

/**
 * What every Panki AI place on a page sends its messages through (AI step 5), the word's conversation in the pop-up and
 * the card's in the drawer alike (the extension's; the web's since Settings → Panki AI's explainers draw them too,
 * `explainers/aiScenes.tsx`): the most a message can cost, worked out as the call itself will be (`ceilingOf`); the
 * question asked first when that's over the account's Ask before a message is over (`useAskFirst`, `MessageAsk`); the
 * arrow beside Proofread's button with every template it can run (`TemplateMenu`); the composer (`Composer`); and a
 * message sent from under a field (`FieldMessage`). One home each, so the places can't drift apart.
 */

/** What these say, one home. */
export const MESSAGE_WORDS = {
  /**
   * The most a message can cost, as it's said beside it: only at or over the account's Show the cost when a message is
   * over (`PankiAiStatus.showCostOverMicros`), nothing under it.
   */
  upTo: (micros: number, showOver: number | null): string | null => (showsCost(micros, showOver) ? `Up to ${estimateWords(micros)}` : null),
  /** The question before a template's run (Proofread's): its name, and the most it can cost. */
  runFor: (name: string, micros: number) => `Run ${name} for up to ${estimateWords(micros)}?`,
  run: "Run",
  running: "Running…",
  /** The question before a message: the most it can cost. */
  sendFor: (micros: number) => `Send for up to ${estimateWords(micros)}?`,
  send: "Send",
  sending: "Sending…",
  /** The arrow beside Proofread's button, for a screen reader. */
  templates: "Templates",
  /** A message under a field, its branch's: its folded quiet line, its box and its group. */
  followUp: "Ask a follow-up",
  /** What a place's composer's box says while it's empty, each place's own. */
  ask: { word: "Ask anything about this word", card: "Ask anything about this card" } satisfies Record<ActionPlaceId, string>,
  actions: "Actions",
  empty: "Type a message.",
  long: (max: number) => `Keep the message under ${max.toLocaleString("en")} characters.`,
  /** Why a place's button is greyed, beside it, the same for every place (signed out is each place's own). */
  off: "Panki AI is off.",
  noKey: (provider: string) => `No key for ${provider}.`,
};

/**
 * Why a place can't run, said beside its greyed button whatever it is, so a button is never greyed without a
 * reason: what went wrong asking, signed out (`signedOut`, the place's own words),
 * Panki AI switched off, or no key for its provider. Nothing while what's true is still being asked (`known` false), and
 * nothing when it can run (the cost stands there then). Explain and Touch up are both this.
 */
export function whyNot(known: boolean, ai: Pick<PankiAiStatus, "settings" | "key"> | null, failure: string | null, signedOut: string): string | null {
  if (!known) return null;
  if (failure) return failure;
  if (ai === null) return signedOut;
  if (!ai.settings.aiOn) return MESSAGE_WORDS.off;
  return ai.key === null ? MESSAGE_WORDS.noKey(AI_PROVIDERS[ai.settings.aiProvider].name) : null;
}

/**
 * The most a call can cost at the model's listed prices: the template's prompt filled from the pieces as Panki sends
 * them, the conversation so far, and a follow-up's own prompt (`aiSent`), with the place's Max answer length. What
 * `startCall` says of the call once it's made, worked out before the press.
 */
export function ceilingOf(
  settings: PankiAi,
  template: Pick<AiTemplate, "prompt" | "followUp">,
  pieces: PromptPieces,
  said: readonly ExplainMessage[],
  asking: PromptPieces,
  maxAnswerTokens: number,
  opening: PromptPieces = {},
): number {
  return ceilingMicros(aiModelOf(settings), aiSent(template, piecesAsSent(pieces, settings), said, piecesAsSent(asking, settings), opening), maxAnswerTokens);
}

/**
 * A message waiting on its question: where it's asked, the words, whether it's a template's run (Proofread's, Run in
 * the question's button) rather than a message (Send), and the message itself.
 */
export type Asked = { where: string; question: string; runs: boolean; go: () => void };

/**
 * Ask before a message is over (the account's own, `PankiAiStatus.askOverMicros`): a press whose ceiling is over it
 * waits on its question, asked where the answer would go; at or under it, it goes at once. One question at a time: a
 * press elsewhere takes its place. `runs` for a template's run (Proofread's).
 */
export function useAskFirst() {
  const [asked, setAsked] = useState<Asked | null>(null);
  /** A press: send now, or ask first. */
  function press(askOver: number | null, where: string, ceiling: number, question: string, go: () => void, runs = false) {
    if (!asksFirst(ceiling, askOver)) {
      setAsked(null);
      go();
      return;
    }
    setAsked({
      where,
      question,
      runs,
      go: () => {
        setAsked(null);
        go();
      },
    });
  }
  return { asked, press, cancel: () => setAsked(null), at: (where: string) => (asked?.where === where ? asked : null) };
}

/**
 * The question itself, in place where the answer would go: what it can cost, Send (Run, for a template's run) with the
 * spark filled in the accent (a question about money, not a loss: `Ask`'s `spends`), and Cancel.
 */
export function MessageAsk({ id, asked, onCancel }: { id: string; asked: Asked | null; onCancel: () => void }) {
  if (!asked) return null;
  const go = asked.runs ? { words: MESSAGE_WORDS.run, busy: MESSAGE_WORDS.running } : { words: MESSAGE_WORDS.send, busy: MESSAGE_WORDS.sending };
  return (
    <div className="ai-message-ask">
      <Ask
        idPrefix={`${id}-run`}
        question={asked.question}
        go={{ ...go, spends: { lead: <AiSpark /> } }}
        busy={false}
        failure={null}
        onKeep={onCancel}
        onGo={asked.go}
      />
    </div>
  );
}

/** A template as its place's menu lists it: what its first ask can cost here, or nothing while that can't be said. */
export type TemplateRow = { template: AiTemplate; cost: string | null };

type MenuProps = {
  id: string;
  /** The place's templates in their order (`templatesOf`): the account's default is listed first. */
  rows: readonly TemplateRow[];
  defaultId: TemplateId;
  /** The template the button runs here, lit: the default until another is picked in this pop-up or drawer. */
  chosenId: TemplateId;
  disabled: boolean;
  onPick: (template: AiTemplate) => void;
  /** The menu opened: Panki AI asked again, so a template made a moment ago is in it. */
  onOpen?: () => void;
  /** The place's own button, the arrow joined to its end. */
  children: ReactNode;
};

/**
 * A place's button with a small arrow at its end: the button runs the
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
        aria-label={MESSAGE_WORDS.templates}
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
          <div ref={menu} className="menu ai-templates" role="listbox" aria-label={MESSAGE_WORDS.templates}>
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

export type FieldMessageProps = {
  id: string;
  value: string;
  error?: string | undefined;
  disabled: boolean;
  /** What stands beside Send: the most it can cost, the conversation so far included, or why it can't be sent. */
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
   * the focus in it; Escape, or the focus leaving it, with nothing typed folds it back. The card's fields', where a box
   * under every note would make the drawer twice as long.
   */
  folded?: boolean;
  onChange: (value: string) => void;
  onAsk: () => void;
};

/** A message sent from under a field (its branch of the card's conversation): the words, and Send with the most it can cost beside it. */
export function FieldMessage({ id, value, error, disabled, beside, nested = false, small = false, folded = false, onChange, onAsk }: FieldMessageProps) {
  // A message typed and left stands open: it's only the empty box that folds away.
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
            {MESSAGE_WORDS.followUp}
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
        label={MESSAGE_WORDS.followUp}
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
          {MESSAGE_WORDS.send}
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
    <div className={className} role="group" aria-label={MESSAGE_WORDS.followUp} onKeyDown={keep} onBlur={foldBlur}>
      {inside}
    </div>
  );
}

/**
 * An action as the composer lists it: ticked while it goes with the next message; `disabled` greyed with its tick off
 * (its knobs leave nothing the deck maps). The place's lead action (Touch up, Explain) is drawn as any other: it's only
 * the default, lit as the conversation opens.
 */
export type ComposerAction = {
  id: string;
  name: string;
  on: boolean;
  disabled: boolean;
  /** The action it stands under in the list (`AiAction.under`), nested there, closed until opened; at the top when that one isn't listed. */
  under?: string | null;
};
/** What the actions' dropdown says: the one lit by name, "Touch up · 2 more" for several, "Actions" with none. */
export function actionsSummary(actions: readonly ComposerAction[]): string {
  const lit = actions.filter((action) => action.on && !action.disabled);
  const [first] = lit;
  if (!first) return MESSAGE_WORDS.actions;
  return lit.length === 1 ? first.name : `${first.name} · ${lit.length - 1} more`;
}
/**
 * A conversation's own settings, set from the composer's settings button in a fold above it: the one home for every
 * knob of the conversation (a row each), closed until opened, none of it shown otherwise. A knob that's null has no row
 * (How much of the video, off a video).
 */
export type ConversationKnobs = {
  /**
   * How much of the video Panki AI hears, from the message sent next on: kept in seconds each way
   * (`CONVERSATION_REACHES`), shown as its whole length (`contextLengthOf`).
   */
  reach: { seconds: number; onChange: (seconds: number) => void } | null;
  /**
   * Clear conversation, the fold's last row, always there: asking first, then the place's `onClear`, which puts the
   * conversation back as it opened. `detail` is what goes and what stays, in the place's words; `empty` while there's
   * nothing to clear (greyed, why beside it); `disabled` while a call is out.
   */
  clear: { detail: string; empty: boolean; disabled: boolean; onClear: () => void } | null;
};
/** The words of a conversation's settings, one home: its button's, Video context length's, and the note a change writes. */
export const KNOB_WORDS = {
  button: "Conversation settings",
  /** The one name of a reach on screen, the conversation's and an action's alike. */
  reach: "Video context length",
  /** A reach kept each way, said as its whole length: "30 s", "1 min", "3 min". */
  length: (eachWay: number) => {
    const whole = contextLengthOf(eachWay);
    return whole < 60 || whole % 60 !== 0 ? `${whole} s` : `${whole / 60} min`;
  },
  /** The note a change of Video context length writes into the conversation where it was made. */
  reachFrom: (eachWay: number) => `From here on, ${KNOB_WORDS.length(eachWay)} of video context.`,
  /** The fold's row clearing the conversation whole, and its question. */
  clear: "Clear conversation",
  clearing: "Clearing…",
  clearAsk: "Clear this conversation?",
  /** Beside Clear conversation, greyed, before there's anything in the conversation. */
  nothingToClear: "Nothing to clear yet.",
};
/** Whether a conversation has any knob to show: its settings button is there only then. */
const hasKnobs = (knobs: ConversationKnobs | null | undefined): knobs is ConversationKnobs => knobs != null && (knobs.reach !== null || knobs.clear !== null);

/**
 * Clear conversation as the settings fold's row: the trash and its words, quiet as the fold is, asking first in `Ask`
 * hanging from it (what's cleared can't be had back; the red is the question's own button), then `onClear`.
 */
function ClearRow({ detail, empty, disabled, onClear }: NonNullable<ConversationKnobs["clear"]>) {
  const [asking, setAsking] = useState(false);
  const at = useRef<HTMLButtonElement>(null);
  const id = useId();
  return (
    <div className="composer-knob-action">
      <Button ref={at} aria-pressed={asking} aria-expanded={asking} disabled={disabled || empty} onClick={() => setAsking(!asking)}>
        <Icon name="trash" />
        {KNOB_WORDS.clear}
      </Button>
      {empty ? <span className="btn-beside">{KNOB_WORDS.nothingToClear}</span> : null}
      {asking ? (
        <Ask
          idPrefix={`${id}-clear`}
          anchor={at}
          question={KNOB_WORDS.clearAsk}
          detail={detail}
          go={{ words: KNOB_WORDS.clear, busy: KNOB_WORDS.clearing }}
          busy={false}
          failure={null}
          onKeep={() => setAsking(false)}
          onGo={() => {
            setAsking(false);
            onClear();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A conversation's quiet icon button: its icon alone, muted, its words its label and in a `Tip` while a mouse is on it
 * or it has the focus (none while what it opens is open). The composer's settings and the head's Clear conversation.
 */
export function QuietIconButton({
  ref,
  className,
  icon,
  words,
  open,
  controls,
  disabled = false,
  onClick,
}: {
  ref?: Ref<HTMLButtonElement>;
  className: string;
  icon: IconName;
  words: string;
  open: boolean;
  controls?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <span className={`quiet-icon ${className}`}>
      <Button
        ref={ref}
        className="btn-icon"
        aria-label={words}
        aria-expanded={open}
        aria-controls={controls}
        disabled={disabled}
        onMouseEnter={() => setOver(true)}
        onMouseLeave={() => setOver(false)}
        onFocus={() => setOver(true)}
        onBlur={() => setOver(false)}
        onClick={onClick}
      >
        <Icon name={icon} />
      </Button>
      {over && !open ? (
        <Tip x={16} y={0}>
          {words}
        </Tip>
      ) : null}
    </span>
  );
}
/** The composer's settings button: the sliders, opening the fold above the composer. */
function KnobsButton({ id, open, onToggle, disabled }: { id: string; open: boolean; onToggle: () => void; disabled: boolean }) {
  return <QuietIconButton className="composer-knobs-button" icon="settings" words={KNOB_WORDS.button} open={open} controls={`${id}-knobs`} disabled={disabled} onClick={onToggle} />;
}

/** A conversation's settings, a row each: today Video context length, then Clear conversation. */
function ConversationSettings({ id, knobs, disabled }: { id: string; knobs: ConversationKnobs; disabled: boolean }) {
  const { reach, clear } = knobs;
  return (
    <div id={`${id}-knobs`} className="composer-knobs" role="group" aria-label={KNOB_WORDS.button}>
      {reach ? (
        <Setting
          id={`${id}-reach`}
          label={KNOB_WORDS.reach}
          control={
            <Segmented
              idPrefix={`${id}-reach`}
              label={KNOB_WORDS.reach}
              size="sm"
              wrap
              disabled={disabled}
              options={CONVERSATION_REACHES.map((seconds) => ({ id: String(seconds), label: KNOB_WORDS.length(seconds) }))}
              value={String(reach.seconds)}
              onChange={(seconds) => reach.onChange(Number(seconds))}
            />
          }
        />
      ) : null}
      {clear ? <ClearRow {...clear} /> : null}
    </div>
  );
}

export type ComposerProps = {
  id: string;
  /** The place it sends in: what its box says while it's empty ("Ask anything about this word"). */
  place: ActionPlaceId;
  value: string;
  error?: string | undefined;
  actions: readonly ComposerAction[];
  /** A call is out: the box read-only, the actions still, Send's spark turning. */
  sending: boolean;
  /** Whether Send would send anything: an action lit that asks something, or words typed, and Panki AI able to answer. */
  canSend: boolean;
  /** What stands beside Send: the most the message can cost, the conversation so far included, or why it can't be sent. */
  beside: string | null;
  /** The presses that sent: Send's spark blinks once for each. */
  burst: number;
  /** The conversation's own settings, behind the settings button beside the actions; none, no button. */
  knobs?: ConversationKnobs | null;
  onChange: (value: string) => void;
  onToggle: (id: string) => void;
  onSend: () => void;
};

/**
 * Where a conversation is sent from (Touch up, steered): a box growing as it's typed, and under it one row, the actions
 * as a dropdown ticking several (every action of the place in the registry's order), what the message can cost, and
 * Send with the spark; the row wraps on a phone, the dropdown first. Enter sends, Shift+Enter is a new line, and
 * Ctrl+Enter sends here too, never reaching the form it stands in (the drawer's, whose submit is Add). A
 * conversation's foot, always there while Panki AI can answer.
 */
export function Composer({ id, place, value, error, actions, sending, canSend, beside, burst, knobs, onChange, onToggle, onSend }: ComposerProps) {
  const box = useRef<HTMLTextAreaElement>(null);
  /** The conversation's settings, open above the box: closed whenever the composer comes, opened by its button alone. */
  const [knobsOpen, setKnobsOpen] = useState(false);
  // The box grows with what's typed, from its two lines, as a multiline `TextField` does.
  useEffect(() => {
    const area = box.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [value]);
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || (e.shiftKey && !(e.ctrlKey || e.metaKey))) return;
    e.preventDefault();
    e.stopPropagation();
    if (canSend && !sending) onSend();
  };
  return (
    <div className="composer" role="group" aria-label={MESSAGE_WORDS.ask[place]}>
      {hasKnobs(knobs) ? (
        <Fold open={knobsOpen} arrives={false}>
          <ConversationSettings id={id} knobs={knobs} disabled={sending} />
        </Fold>
      ) : null}
      <div className={`composer-box${error ? " is-error" : ""}`}>
        <textarea
          ref={box}
          id={`${id}-message`}
          className="composer-input"
          rows={2}
          aria-label={MESSAGE_WORDS.ask[place]}
          aria-invalid={error ? true : undefined}
          placeholder={MESSAGE_WORDS.ask[place]}
          value={value}
          readOnly={sending}
          autoComplete="off"
          lang={/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value) ? "ja" : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={keys}
        />
      </div>
      {error ? (
        <p className="composer-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="composer-tools">
        {actions.length > 0 ? (
          <span className="composer-actions">
            <Dropdown
              id={`${id}-actions`}
              label={MESSAGE_WORDS.actions}
              options={actions.map((action) => ({ id: action.id, label: action.name, disabled: action.disabled, ...(action.under ? { under: action.under } : {}) }))}
              values={actions.filter((action) => action.on && !action.disabled).map((action) => action.id)}
              summary={actionsSummary(actions)}
              onToggle={onToggle}
              disabled={sending}
              anchored
            />
          </span>
        ) : null}
        {hasKnobs(knobs) ? <KnobsButton id={id} open={knobsOpen} onToggle={() => setKnobsOpen((was) => !was)} disabled={false} /> : null}
        {beside ? <span className="btn-beside">{beside}</span> : null}
        <Button variant="primary" className="composer-send" disabled={!canSend || sending} onClick={onSend}>
          <AiSpark working={sending} burst={burst} />
          {MESSAGE_WORDS.send}
        </Button>
      </div>
    </div>
  );
}

/**
 * What Panki AI wrote, as plain paragraphs (nothing the model writes reaches the page as markup), rising in as it
 * lands: Explain's answers and Touch up's replies alike. `children` stand under the words, rising in with them (what a
 * Touch up round changed).
 */
export function AnswerText({ text, children }: { text: string; children?: ReactNode }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
  return (
    <div className="ai-explain-answer">
      {paragraphs.map((paragraph, i) => (
        <p key={i}>{paragraph}</p>
      ))}
      {children}
    </div>
  );
}

/** Whether a question can be asked, and why not in the app's words: typed, and within Max follow-up length. */
export function questionProblem(text: string, maxChars: number): string | null {
  if (text === "") return MESSAGE_WORDS.empty;
  return text.length > maxChars ? MESSAGE_WORDS.long(maxChars) : null;
}
