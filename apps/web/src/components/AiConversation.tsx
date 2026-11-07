import { Fragment, useEffect, useState, type ReactNode, type Ref } from "react";
import { LOOK_OF, branchOf, mainRuns, type AiCall, type Commit, type Conversation } from "@panki/contracts";
import { wordFor } from "../words";
import { AnswerText, FollowUp, RunAsk, type Asked, type FollowUpProps } from "./AiRun";
import { AiStatus } from "./AiStatus";
import { AiSpark } from "./AiWaiting";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";

/**
 * Every Panki AI action's run drawn as one conversation (`@panki/contracts` → `conversation.ts`, the one model): the
 * head (`AiStatus`), the run as its press (the spark and the template's name in a bubble), each commit as its question
 * at the right then its reply as plain paragraphs and what it changed ("Changed:" and a chip each, "Changed nothing"),
 * a branch merged into main as one block with its field's mark and its questions that changed nothing folded, the
 * question on its way with the spark turning under it, a failure with Try again, and the next follow-up folded at the
 * foot. What's an action's own is what it hands in (`ConversationOf`): what a commit changed as chips and where a chip
 * goes, Panki's own notes under a reply, a field's name where it has branches, what Try again does. Explain's in the
 * pop-up and Touch up's in the drawer are both this; a new action is its `ConversationOf` and nothing drawn again.
 */

/** What this says, one home. */
export const CONVERSATION_WORDS = {
  /** The spark turning where a reply will stand, for a screen reader. */
  answering: "Panki AI is answering",
  tryAgain: "Try again",
  /** Before the chips of what a reply changed (`Changed`), and in their place when it changed nothing. */
  changed: "Changed:",
  changedNothing: "Changed nothing",
  /** The line a merged branch's questions that changed nothing are folded under, in the head. */
  foldedNothing: (n: number) => `${n} ${wordFor(n, "question", "questions")} · Changed nothing`,
  /** The line main's conversation folds under, by what a press does. */
  hide: "Hide conversation",
  show: "Show conversation",
  /** The line a field's branch folds under. */
  followUps: (n: number) => `${n} ${wordFor(n, "follow-up", "follow-ups")}`,
};

/**
 * The colour something Panki AI changed is drawn in: good green, meh orange, bad red (the meanings' own looks,
 * `.ai-accuracy.is-…`, one home), and accent, the blue, for words of Panki AI's own on offer. A chip's dot and Touch
 * up's notes (`TouchUp.tsx` → `Tied`) alike.
 */
export type Tone = "good" | "meh" | "bad" | "accent";
export const TONE_CLASS: Record<Tone, string> = { good: `ai-accuracy is-${LOOK_OF.good}`, meh: `ai-accuracy is-${LOOK_OF.meh}`, bad: `ai-accuracy is-${LOOK_OF.bad}`, accent: "is-accent" };

/**
 * How what a reply changed stands now, on its chip: still standing (a proposal waiting, the meanings lit as it judged
 * them), accepted, dismissed, or replaced (a later reply changed it again, or it was changed under it).
 */
export type ChipState = "live" | "accepted" | "dismissed" | "replaced";
/** Something a reply changed, as its chip draws it: where a press goes (`id`, handed to `onGo`), its name, its colour, how it stands. */
export type ChangeChip = { id: string; name: string; tone: Tone; state: ChipState };

export type Failure = { message: string; retry: boolean };
/**
 * A question on its way, not yet a commit: the run (`run`, its template's name) or a follow-up asked on main (`field`
 * null) or on a field's branch (its id); `failure` once it failed, so it stands with Try again until the next is asked.
 */
export type Asking = { id: number; run: string | null; field: string | null; question: string; failure: Failure | null };

/** What an action hands the conversation: everything about a commit that's its own, and what a press does. */
export type ConversationOf<C> = {
  /**
   * What a commit changed, as chips in the order they're drawn: none is "Changed nothing"; null is a reply that can't
   * change anything (a plain answer), with no line at all.
   */
  chips: (commit: Commit<C>) => readonly ChangeChip[] | null;
  /** Panki's own words under a reply, never the AI's (Explain's "Cut short at the answer limit."). */
  notes?: (commit: Commit<C>) => ReactNode;
  /** A field's name, by its id: a merged branch's mark in the head. Only an action whose follow-ups have branches gives it. */
  fieldName?: (field: string) => string | null;
  /** Whether Try again can go now. */
  canRun: boolean;
  /** A follow-up asked again after it failed. */
  onRetry: (asking: Asking) => void;
  /** A chip or a branch's mark pressed: where it goes (a field, the meanings). */
  onGo: (target: string) => void;
};

/**
 * Where a place of the conversation ends: the question before a follow-up over Ask before a run is over, asked there,
 * and the next follow-up, folded to its quiet line until it's pressed (`follow`: null while none can be asked).
 */
export type ConversationFoot = { id: string; asked: Asked | null; onCancel: () => void; follow: Omit<FollowUpProps, "id" | "folded"> | null };

/** A turn as it's drawn: a commit, or the question on its way. */
type Drawn = {
  id: number;
  run: string | null;
  question: string;
  /** The field it was asked under, where that isn't plain (in the head: a merged branch's). */
  about: { id: string; name: string } | null;
  /** Its reply once it's in: null while it's on its way or failed. */
  reply: string | null;
  notes: ReactNode;
  failure: Failure | null;
  chips: readonly ChangeChip[] | null;
  /** In the head, the commits of its branch that changed nothing and were merged with it. */
  folded: readonly Drawn[];
};

function drawnOf<C>(made: Commit<C>, of: ConversationOf<C>, marked: boolean): Drawn {
  const name = marked && made.field !== null ? (of.fieldName?.(made.field) ?? null) : null;
  return {
    id: made.id,
    run: made.run,
    question: made.question,
    about: name !== null && made.field !== null ? { id: made.field, name } : null,
    reply: made.reply,
    notes: of.notes?.(made) ?? null,
    failure: null,
    chips: of.chips(made),
    folded: [],
  };
}
const askingDrawn = (asking: Asking): Drawn => ({ ...asking, about: null, reply: null, notes: null, chips: null, folded: [] });

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

type TurnProps = { canRun: boolean; onRetry: (turn: Drawn) => void; onGo: (target: string) => void };

/** One turn: its question (or the run's press), then its reply, Panki's notes and what it changed, the spark while it's on its way, or the failure with Try again. */
function Turn({ turn, canRun, onRetry, onGo }: TurnProps & { turn: Drawn }) {
  const about = turn.about;
  return (
    <div className="ai-explain-turn">
      {turn.run !== null ? (
        <p className="ai-explain-question is-run">
          <AiSpark />
          {turn.run}
        </p>
      ) : (
        <>
          {about ? (
            <Button className="ai-about" onClick={() => onGo(about.id)}>
              <Icon name="forward" />
              {about.name}
            </Button>
          ) : null}
          <p className="ai-explain-question">{turn.question}</p>
        </>
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
        </AnswerText>
      )}
    </div>
  );
}

/** A merged branch's questions that changed nothing, in the head: one quiet line, "2 questions · Changed nothing", opening them where they stand. */
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
};

/**
 * One place of the conversation: main (the run first, each commit a merge brought as its branch's block, the ones of
 * its branch that changed nothing folded inside it) or a field's branch (its commits, nothing of them once it was reset); then the question on its way or failed,
 * where it was asked, all of it folding under one quiet line (main's "Hide conversation" / "Show conversation" once
 * there's more than the run, its chips folding with it; a branch's "2 follow-ups"); then its foot, never folded. `AiConversation` draws main with it; Touch up draws each field's under the field.
 */
export function ConversationTurns<C>({ conversation, asking, where, of, foot = null }: PlaceProps<C>) {
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
  /** Folded by its line, while this drawer or pop-up is open; open to begin with, and again as a question is asked here. */
  const [open, setOpen] = useState(true);
  const askedHere = waiting[0]?.id ?? null;
  useEffect(() => {
    if (askedHere !== null) setOpen(true);
  }, [askedHere]);
  // Main folds once there's more than the run to fold; a field's branch from its first question.
  const folds = turns.length >= (where === null ? 2 : 1);
  const drawn = turns.map((turn) =>
    turn.run === null && turn.about !== null ? (
      <MergedBranch key={turn.id} turn={turn} about={turn.about} {...rest} />
    ) : (
      <Fragment key={turn.id}>
        {turn.folded.length > 0 ? <FoldedTurns turns={turn.folded} {...rest} /> : null}
        <Turn turn={turn} {...rest} />
      </Fragment>
    ),
  );
  return (
    <>
      {folds ? (
        <>
          <Button className={`ai-folded${open ? " is-open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
            {where === null ? (open ? CONVERSATION_WORDS.hide : CONVERSATION_WORDS.show) : CONVERSATION_WORDS.followUps(turns.length)}
            <Icon name="down" />
          </Button>
          <Fold open={open} arrives={false}>
            <div className={`ai-turns${where === null ? "" : " is-branch"}`}>{drawn}</div>
          </Fold>
        </>
      ) : (
        drawn
      )}
      {foot ? (
        <>
          <RunAsk id={`${foot.id}-ask`} asked={foot.asked} onCancel={foot.onCancel} />
          {foot.follow ? <FollowUp id={foot.id} folded {...foot.follow} /> : null}
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
  /** Every call of the run and its follow-ups, oldest first: the head's. Nothing but `before` until the first. */
  calls: readonly AiCall[];
  /** The presses that made a call: the head's spark blinks once for each. */
  burst: number;
  busy: boolean;
  /** Above the head: an action's own button where it keeps its place once it has run (Explain's). */
  before?: ReactNode;
  /** Why the run gave no answer, with Try again (`onRunAgain`) when another go could pass. */
  failure: Failure | null;
  onRunAgain: () => void;
  /** Under the head while the run stands (no failure): what's the action's own there, Touch up's Accept all and Dismiss all. */
  tools?: ReactNode;
};

/**
 * An action's run, whole: `before`, then once a call is made the head (`AiStatus`), the run's failure with Try again
 * or the action's `tools`, main's conversation (`ConversationTurns`), and its foot.
 */
export function AiConversation<C>({ ref, className, inert = false, calls, burst, busy, before, failure, onRunAgain, tools, ...place }: AiConversationProps<C>) {
  const classes = `${className ? `${className} ` : ""}ai-explain`;
  if (calls.length === 0) {
    return before ? (
      <section ref={ref} className={classes} aria-label="Panki AI" inert={inert}>
        {before}
      </section>
    ) : null;
  }
  return (
    <section ref={ref} className={classes} aria-label="Panki AI" aria-busy={busy} inert={inert}>
      {before}
      <AiStatus calls={calls} burst={burst} />
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
    </section>
  );
}
