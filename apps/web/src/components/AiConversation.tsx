/** @panki Any place's conversation with Panki AI (`AiConversation`, `ConversationTurns`). Never a second drawing of a conversation. */
import { Fragment, useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { branchOf, mainRuns, type AiCall, type Commit, type Conversation } from "@panki/contracts";
import { wordFor } from "../words";
import { AnswerText, Composer, FieldMessage, MessageAsk, type Asked, type ComposerProps, type FieldMessageProps } from "./AiRun";
import { AiStatus } from "./AiStatus";
import { AiSpark } from "./AiWaiting";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";
import { ScrollEdges } from "./ScrollEdges";

/**
 * Every Panki AI place's conversation drawn as one (`@panki/contracts` → `conversation.ts`, the one model): the head
 * (`AiStatus`), each message as its bubble at the right (one with actions headed by the spark and their names joined by
 * a comma, what was typed under them; typed words alone as they are), then its answer's reply as plain paragraphs and what it changed ("Changed:" and a chip each,
 * "Changed nothing"), a branch merged into main as one block with its field's mark and its messages that changed
 * nothing folded, the message on its way with the spark turning under it, a failure with Try again, and the composer
 * or the next message folded at the foot; main's messages scroll inside their box once there are more than fit, the
 * newest in view, and the whole block folds under its head's name. What's a place's own is what it hands in (`ConversationOf`): what a commit
 * changed as chips and where a chip goes, Panki's own notes under a reply, a field's name where it has branches, what
 * Try again does. The word's conversation in the pop-up and the card's in the drawer are both this; a new place is its
 * `ConversationOf` and nothing drawn again.
 */

/** What this says, one home. */
export const CONVERSATION_WORDS = {
  /** The spark turning where a reply will stand, for a screen reader. */
  answering: "Panki AI is answering",
  tryAgain: "Try again",
  /** Before the chips of what a reply changed (`Changed`), and in their place when it changed nothing. */
  changed: "Changed:",
  changedNothing: "Changed nothing",
  /** Before the chips of what a reply was asked for and couldn't give (`Failed`), on a line of their own under Changed. */
  failed: "Failed:",
  /** The line a merged branch's questions that changed nothing are folded under, in the head. */
  foldedNothing: (n: number) => `${n} ${wordFor(n, "message", "messages")} · Changed nothing`,
  /** The line a field's branch folds under. */
  messages: (n: number) => `${n} ${wordFor(n, "message", "messages")}`,
};

/**
 * The colour something Panki AI changed is drawn in: good green, meh orange, bad red (the meanings' own looks,
 * `.ai-judgement.is-…`, one home), and accent, the blue, for words of Panki AI's own on offer. A chip's dot and Touch
 * up's notes (`TouchUp.tsx` → `Tied`) alike.
 */
export type Tone = "good" | "meh" | "bad" | "accent";
export const TONE_CLASS: Record<Tone, string> = { good: "ai-judgement is-good", meh: "ai-judgement is-meh", bad: "ai-judgement is-bad", accent: "is-accent" };

/**
 * How what a reply changed stands now, on its chip: still standing (a proposal waiting, the meanings lit as it judged
 * them), accepted, dismissed, or replaced (a later reply changed it again, or it was changed under it).
 */
export type ChipState = "live" | "accepted" | "dismissed" | "replaced";
/** Something a reply changed, as its chip draws it: where a press goes (`id`, handed to `onGo`), its name, its colour, how it stands. */
export type ChangeChip = { id: string; name: string; tone: Tone; state: ChipState };
/** Something a reply couldn't give, as its chip draws it: where a press goes (`id`), its name, and why, in Panki's words. */
export type FailedChip = { id: string; name: string; why: string };

export type Failure = { message: string; retry: boolean };
/**
 * A message on its way, not yet a commit: one carrying one of its place's defaults (`run`, the name it goes by in
 * Details) or not, with every action it went with by name (`actions`, what its bubble heads with), sent on main
 * (`field` null) or on a field's branch (its id); `failure` once it failed, so it stands with Try again until the next
 * is sent.
 */
export type Asking = { id: number; run: string | null; field: string | null; question: string; actions?: readonly string[]; failure: Failure | null };

/** What a place hands the conversation: everything about a commit that's its own, and what a press does. */
export type ConversationOf<C> = {
  /**
   * What a commit changed, as chips in the order they're drawn: none is "Changed nothing"; null is a reply that can't
   * change anything (a plain answer), with no line at all.
   */
  chips: (commit: Commit<C>) => readonly ChangeChip[] | null;
  /**
   * What a commit was asked for and couldn't give (a field Panki AI couldn't decide, lines it couldn't use), a chip
   * each: its own line under Changed, in red. None, no line.
   */
  failed?: (commit: Commit<C>) => readonly FailedChip[];
  /** Panki's own words under a reply, never the AI's (Explain's "Cut short at the answer limit."). */
  notes?: (commit: Commit<C>) => ReactNode;
  /** A field's name, by its id: a merged branch's mark in the head. Only a place whose messages have branches gives it. */
  fieldName?: (field: string) => string | null;
  /** Whether Try again can go now. */
  canRun: boolean;
  /** A message sent again after it failed. */
  onRetry: (asking: Asking) => void;
  /** A chip or a branch's mark pressed: where it goes (a field, the meanings). */
  onGo: (target: string) => void;
};

/**
 * Where a place of the conversation ends: the question before a message over Ask before a message is over, asked
 * there, and the next message, folded to its quiet line until it's pressed (`follow`: null while none can be sent); or,
 * for a conversation's main, the composer, always open (`composer`, in `follow`'s place).
 */
export type ConversationFoot = {
  id: string;
  asked: Asked | null;
  onCancel: () => void;
  follow: Omit<FieldMessageProps, "id" | "folded"> | null;
  composer?: Omit<ComposerProps, "id"> | null;
};

/** A turn as it's drawn: a commit, or the question on its way. */
type Drawn = {
  id: number;
  run: string | null;
  question: string;
  actions?: readonly string[] | undefined;
  /** The field it was asked under, where that isn't plain (in the head: a merged branch's). */
  about: { id: string; name: string } | null;
  /** Its reply once it's in: null while it's on its way or failed. */
  reply: string | null;
  notes: ReactNode;
  failure: Failure | null;
  chips: readonly ChangeChip[] | null;
  failed: readonly FailedChip[];
  /** In the head, the commits of its branch that changed nothing and were merged with it. */
  folded: readonly Drawn[];
};

function drawnOf<C>(made: Commit<C>, of: ConversationOf<C>, marked: boolean): Drawn {
  const name = marked && made.field !== null ? (of.fieldName?.(made.field) ?? null) : null;
  return {
    id: made.id,
    run: made.run,
    question: made.question,
    actions: made.actions,
    about: name !== null && made.field !== null ? { id: made.field, name } : null,
    reply: made.reply,
    notes: of.notes?.(made) ?? null,
    failure: null,
    chips: of.chips(made),
    failed: of.failed?.(made) ?? [],
    folded: [],
  };
}
const askingDrawn = (asking: Asking): Drawn => ({ ...asking, about: null, reply: null, notes: null, chips: null, failed: [], folded: [] });

/** A chip's state in words, for a screen reader: the dot or the tick says it to the eye. */
const CHIP_STATE_WORDS: Record<ChipState, string> = { live: "waiting", accepted: "accepted", dismissed: "dismissed", replaced: "replaced" };

/**
 * What a reply changed, under it: "Changed:" and a chip each, the dot in its colour while it stands, a tick once
 * accepted, hollow once dismissed or replaced; pressed, it goes there. "Changed nothing" for a reply that changed
 * nothing. It stays as the reply's record once all is decided.
 */
function Changed({ chips, onGo }: { chips: readonly ChangeChip[]; onGo: (target: string) => void }) {
  if (chips.length === 0) return <p className="ai-changed">{CONVERSATION_WORDS.changedNothing}</p>;
  return (
    <div className="ai-changed">
      {CONVERSATION_WORDS.changed}
      {chips.map((chip) => (
        <Button key={chip.id} variant="chip" className={`ai-chip ${TONE_CLASS[chip.tone]} is-${chip.state}`} aria-label={`${chip.name}, ${CHIP_STATE_WORDS[chip.state]}`} onClick={() => onGo(chip.id)}>
          {chip.state === "accepted" ? <Icon name="check" /> : <span className="ai-chip-dot" aria-hidden="true" />}
          {chip.name}
        </Button>
      ))}
    </div>
  );
}

/**
 * What a reply was asked for and couldn't give, on its own line under what it changed: "Failed:" in red and a chip
 * each, its why on hover; pressed, it goes to the field, where the why stands in full.
 */
function Failed({ chips, onGo }: { chips: readonly FailedChip[]; onGo: (target: string) => void }) {
  return (
    <div className="ai-changed is-failed">
      {CONVERSATION_WORDS.failed}
      {chips.map((chip) => (
        <Button key={chip.id} variant="chip" className="ai-chip ai-judgement is-bad is-failed" title={chip.why} aria-label={`${chip.name}, failed: ${chip.why}`} onClick={() => onGo(chip.id)}>
          <Icon name="close" />
          {chip.name}
        </Button>
      ))}
    </div>
  );
}

type TurnProps = { canRun: boolean; onRetry: (turn: Drawn) => void; onGo: (target: string) => void };

/**
 * The names a message's bubble heads with: every action it went with, in its place's order; for a template's run with
 * none (Proofread's), the template's name. None for a message of typed words alone.
 */
const pressOf = (turn: Drawn): readonly string[] => (turn.actions && turn.actions.length > 0 ? turn.actions : turn.run !== null ? [turn.run] : []);

/**
 * One turn: its question (a message with actions as its press: the spark and their names joined by a comma, what
 * what was typed under them as a quiet note, never what the actions or User instructions say; the same for every action, a place's default or not), then its reply, Panki's
 * notes and what it changed, the spark while it's on its way, or the failure with Try again.
 */
function Turn({ turn, canRun, onRetry, onGo }: TurnProps & { turn: Drawn }) {
  const about = turn.about;
  const press = pressOf(turn);
  return (
    <div className="ai-explain-turn">
      {about && turn.run === null ? (
        <Button className="ai-about" onClick={() => onGo(about.id)}>
          <Icon name="forward" />
          {about.name}
        </Button>
      ) : null}
      {press.length > 0 ? (
        <div className="ai-explain-question is-run">
          <span className="ai-message-press">
            <AiSpark />
            {press.join(", ")}
          </span>
          {turn.question !== "" ? <span className="ai-message-note">{turn.question}</span> : null}
        </div>
      ) : (
        <p className="ai-explain-question">{turn.question}</p>
      )}
      {turn.reply === null && turn.failure === null ? (
        <div className="ai-answering" role="status" aria-label={CONVERSATION_WORDS.answering}>
          <AiSpark working />
        </div>
      ) : turn.failure ? (
        <div className="ai-explain-failure">
          <p className="form-failure" role="alert">
            {turn.failure.message}
          </p>
          {turn.failure.retry ? (
            <Button className="ai-explain-button" disabled={!canRun} onClick={() => onRetry(turn)}>
              <AiSpark />
              {CONVERSATION_WORDS.tryAgain}
            </Button>
          ) : null}
        </div>
      ) : (
        <AnswerText text={turn.reply ?? ""}>
          {turn.notes}
          {turn.chips !== null ? <Changed chips={turn.chips} onGo={onGo} /> : null}
          {turn.failed.length > 0 ? <Failed chips={turn.failed} onGo={onGo} /> : null}
        </AnswerText>
      )}
    </div>
  );
}

/** A merged branch's messages that changed nothing, in the head: one quiet line, "2 messages · Changed nothing", opening them where they stand. */
function FoldedTurns({ turns, ...rest }: TurnProps & { turns: readonly Drawn[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={`ai-folded${open ? " is-open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {CONVERSATION_WORDS.foldedNothing(turns.length)}
        <Icon name="down" />
      </Button>
      <Fold open={open} arrives={false}>
        <div className="ai-folded-turns">
          {turns.map((turn) => (
            <Turn key={turn.id} turn={turn} {...rest} />
          ))}
        </div>
      </Fold>
    </>
  );
}

/**
 * A branch merged into main, in the head, as one block: its field's mark once at the top right (the forward sign and
 * the field's name, pressed to go there), then a thin rule down its right edge beside, in order, its questions that
 * changed nothing under their fold line and the commit that changed, none of them marked again.
 */
function MergedBranch({ turn, about, ...rest }: TurnProps & { turn: Drawn; about: { id: string; name: string } }) {
  return (
    <div className="ai-merged">
      <Button className="ai-about" onClick={() => rest.onGo(about.id)}>
        <Icon name="forward" />
        {about.name}
      </Button>
      <div className="ai-branch">
        {turn.folded.length > 0 ? <FoldedTurns turns={turn.folded} {...rest} /> : null}
        <Turn turn={{ ...turn, about: null }} {...rest} />
      </div>
    </div>
  );
}

type PlaceProps<C> = {
  conversation: Conversation<C>;
  asking: Asking | null;
  /** Main (null), drawn in the head; or a field's branch, by its id, drawn under the field. */
  where: string | null;
  of: ConversationOf<C>;
  /** Where it ends; none while nothing more can be asked here (before a run has answered). */
  foot?: ConversationFoot | null;
  /** Panki's notes among main's messages where the conversation's settings changed (`ConversationMark`); main's alone. */
  marks?: readonly ConversationMark[];
};
/**
 * A note of Panki's in a conversation's main, where one of its settings changed ("From here on, 90 s of the video each
 * way."): `after` is how many of main's messages stood before it (0 before the first), so it stays where it was made.
 * One with `detail` is pressed to open it under the note (the card's "Panki AI heard 28 lines…", opening the lines).
 */
export type ConversationMark = { id: number; after: number; words: string; detail?: ReactNode };

/** A note of Panki's in the conversation (`ConversationMark`): its words, and pressed, what it has to show under it. */
function MarkNote({ mark }: { mark: ConversationMark }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!mark.detail) {
    return (
      <p className="ai-explain-cut ai-mark">
        <Icon name="info" />
        {mark.words}
      </p>
    );
  }
  return (
    <div className="ai-mark-block">
      <button type="button" className="ai-explain-cut ai-mark is-pressable" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Icon name="info" />
        {mark.words}
        <Icon name="down" />
      </button>
      {open ? <div id={id}>{mark.detail}</div> : null}
    </div>
  );
}

/**
 * One place of the conversation: main (the run first, each commit a merge brought as its branch's block, the ones of
 * its branch that changed nothing folded inside it) or a field's branch (its commits, nothing of them once it was reset); then the question on its way or failed,
 * where it was asked. Main's stand in a box of their own that scrolls once they outgrow it (`.ai-turns.is-main`, with
 * Panki's fade and bar), the newest message scrolled into view as it's sent and as it's answered; a branch's fold
 * under one quiet line ("2 messages"). Then its foot, never folded or scrolled. `AiConversation` draws main with it; Touch up draws each field's under the field.
 */
export function ConversationTurns<C>({ conversation, asking, where, of, foot = null, marks = [] }: PlaceProps<C>) {
  const branch = where === null ? null : branchOf(conversation, where);
  const here: Drawn[] =
    branch === null
      ? mainRuns(conversation).map(({ commit: made, folded }) => ({ ...drawnOf(made, of, true), folded: folded.map((each) => drawnOf(each, of, false)) }))
      : branch.commits.map((each) => drawnOf(each, of, false));
  const waiting = asking !== null && asking.field === where ? [askingDrawn(asking)] : [];
  const rest: TurnProps = {
    canRun: of.canRun,
    onGo: of.onGo,
    onRetry: (turn) => {
      if (asking !== null && asking.id === turn.id) of.onRetry(asking);
    },
  };
  const turns = [...here, ...waiting];
  /** A branch folded by its line, while this drawer or pop-up is open; open to begin with, and again as a question is asked here. */
  const [open, setOpen] = useState(true);
  const askedHere = waiting[0]?.id ?? null;
  useEffect(() => {
    if (askedHere !== null) setOpen(true);
  }, [askedHere]);
  // A field's branch folds from its first question.
  const folds = where !== null && turns.length >= 1;
  /** Main's box: scrolled to its end as a message is sent, answered or fails, so the newest is in view. */
  const box = useRef<HTMLDivElement>(null);
  const latest = turns[turns.length - 1];
  const newest = latest ? `${latest.id}:${latest.reply !== null}:${latest.failure !== null}` : "";
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest]);
  // Panki's notes where a setting changed, main's alone, each before the message that came after it.
  const noted = where === null ? marks : [];
  const marksAt = (i: number) =>
    noted
      .filter((mark) => Math.min(mark.after, here.length) === i)
      .map((mark) => <MarkNote key={`mark-${mark.id}`} mark={mark} />);
  const drawn = [
    ...turns.flatMap((turn, i) => [
      ...marksAt(i),
      turn.run === null && turn.about !== null ? (
        <MergedBranch key={turn.id} turn={turn} about={turn.about} {...rest} />
      ) : (
        <Fragment key={turn.id}>
          {turn.folded.length > 0 ? <FoldedTurns turns={turn.folded} {...rest} /> : null}
          <Turn turn={turn} {...rest} />
        </Fragment>
      ),
    ]),
    // A note made after every message so far (nothing on its way) stands at the end.
    ...(turns.length === here.length ? marksAt(here.length) : []),
  ];
  return (
    <>
      {where === null ? (
        drawn.length > 0 ? (
          <>
            <div ref={box} className="ai-turns is-main">
              {drawn}
            </div>
            <ScrollEdges of={box} />
          </>
        ) : null
      ) : folds ? (
        <>
          <Button className={`ai-folded${open ? " is-open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
            {CONVERSATION_WORDS.messages(turns.length)}
            <Icon name="down" />
          </Button>
          <Fold open={open} arrives={false}>
            <div className="ai-turns is-branch">{drawn}</div>
          </Fold>
        </>
      ) : (
        drawn
      )}
      {foot ? (
        <>
          <MessageAsk id={`${foot.id}-ask`} asked={foot.asked} onCancel={foot.onCancel} />
          {foot.composer ? <Composer id={foot.id} {...foot.composer} /> : foot.follow ? <FieldMessage id={foot.id} folded {...foot.follow} /> : null}
        </>
      ) : null}
    </>
  );
}

type AiConversationProps<C> = Omit<PlaceProps<C>, "where"> & {
  ref?: Ref<HTMLElement>;
  /** Classes beside `ai-explain` for where it stands (Touch up's box in the drawer: `field touch-up`). */
  className?: string;
  /** Drawn to be looked at, answering no press: a made-up run on the options page. */
  inert?: boolean;
  /** Every call of the conversation, a message each, oldest first: the head's. Nothing drawn until the first, unless `always`. */
  calls: readonly AiCall[];
  /** The presses that made a call: the head's spark blinks once for each. */
  burst: number;
  busy: boolean;
  /** Why the run gave no answer, with Try again (`onRunAgain`) when another go could pass. */
  failure: Failure | null;
  onRunAgain: () => void;
  /** Under the head while the run stands (no failure): what's the place's own there, Touch up's Accept all and Dismiss all. */
  tools?: ReactNode;
  /**
   * A conversation (a card's in the drawer, a word's in the pop-up): the block is there before any call, its head and
   * its foot (the composer) with it. User instructions and what the actions say stand in the head's Details, never in the conversation.
   */
  always?: boolean;
};

/**
 * A place's run, whole: once a call is made (or `always`) the head (`AiStatus`), and under it, folded away and brought
 * back by the head's name, the run's failure with Try again or the place's `tools`, main's
 * conversation (`ConversationTurns`), and its foot. Open to begin with, while this drawer or pop-up is open.
 */
export function AiConversation<C>({ ref, className, inert = false, calls, burst, busy, failure, onRunAgain, tools, always = false, ...place }: AiConversationProps<C>) {
  const classes = `${className ? `${className} ` : ""}ai-explain`;
  const id = useId();
  const [open, setOpen] = useState(true);
  if (calls.length === 0 && !always) return null;
  return (
    <section ref={ref} className={classes} aria-label="Panki AI" aria-busy={busy} inert={inert}>
      <AiStatus calls={calls} burst={burst} always={always} fold={{ open, onToggle: () => setOpen(!open), controls: `${id}-body` }} />
      <Fold open={open} arrives={false}>
        <div id={`${id}-body`} className="ai-explain-body">
          {failure ? (
            <div className="ai-explain-failure">
              <p className="form-failure" role="alert">
                {failure.message}
              </p>
              {failure.retry ? (
                <Button className="ai-explain-button" disabled={!place.of.canRun || busy} onClick={onRunAgain}>
                  <AiSpark />
                  {CONVERSATION_WORDS.tryAgain}
                </Button>
              ) : null}
            </div>
          ) : (
            tools
          )}
          <ConversationTurns {...place} where={null} />
        </div>
      </Fold>
    </section>
  );
}
