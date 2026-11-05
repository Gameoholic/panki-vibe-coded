import { Fragment, useState, type ReactNode } from "react";
import {
  LOOK_OF,
  TOUCH_UP,
  TOUCH_UP_ERRORS,
  TOUCH_UP_KEYS,
  fieldVerdictOf,
  isError,
  meaningVerdictOf,
  type AiCall,
  type AiVerdict,
  type FieldVerdict,
  type Judgement,
  type MeaningAnswer,
  type MeaningMark,
  type MeaningVerdict,
  type PankiAiStatus,
  type TouchUpAnswer,
  type TouchUpNow,
} from "@panki/contracts";
import { langOf } from "../words";
import { AnswerText, whyNot } from "./AiRun";
import { AiStatus } from "./AiStatus";
import { AiSpark } from "./AiWaiting";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";
import { WhyButton } from "./JudgedRow";

/**
 * Touch up in the capture drawer: the one button over the card's fields, then the AI's head with Accept all and Dismiss all; under each
 * field what Panki made of the answer (`fieldVerdictOf`, `meaningVerdictOf`), joined to the field as one shape in its
 * verdict's colour, the field's box the diff while a proposal waits, accepted or dismissed by hand and nothing ever
 * written by itself. The drawer owns what's proposed and what's decided; these are only how it's drawn. The web's, since
 * Settings → Panki AI's explainer draws the drawer at work with them too (`explainers/aiScenes.tsx`).
 */

/** What this says, one home. */
export const TOUCH_UP_WORDS = {
  signedOut: "Sign in to Panki to touch up.",
  /** Every positive line, a text field's and the Meaning's alike. */
  nothing: "Nothing to change.",
  /** A value written into a field that was empty, the Meaning of a dictionary with none among them. */
  proposes: "Panki AI proposes",
  couldBeBetter: "Could be better",
  incorrect: "Incorrect",
  /** The Meaning's titles, by Panki's verdict on its rows against the ticks (`meaningVerdictOf`). */
  meaningMore: "More meanings fit",
  meaningsBetter: "Some meanings could be better",
  meaningsIncorrect: "Some meanings are incorrect",
  meaningBetter: "Panki AI proposes a better meaning",
  meaningNew: "All meanings are incorrect, Panki AI proposes a new meaning",
  /** What the Meaning list says while Panki AI's proposed meaning is the field's. */
  meaningProposed: "Panki AI's meaning",
  accept: "Accept",
  dismiss: "Dismiss",
  acceptAll: "Accept all",
  dismissAll: "Dismiss all",
  tryAgain: "Try again",
};

/** Why the button can't run, said under it (`whyNot`, Explain's too: Panki AI off among them). */
export function touchUpReason(known: boolean, ai: Pick<PankiAiStatus, "settings" | "key"> | null, failure: string | null): string | null {
  return whyNot(known, ai, failure, TOUCH_UP_WORDS.signedOut);
}

/**
 * Touch up itself, in the drawer's button row before Add, at the drawer's top under its head, the drawer's own button size: what it
 * can cost, or why it can't run, stands right under it (`TouchUpCost`), and once it has run its head (`TouchUpBar`)
 * under the row. Pressable again whenever it isn't thinking, a new call each time.
 */
export function TouchUpButton({ name, canRun, busy, thinking, burst, onRun }: { name: string; canRun: boolean; busy: boolean; thinking: boolean; burst: number; onRun: () => void }) {
  return (
    <Button className="ai-explain-button touch-up-go" disabled={!canRun || busy} onClick={onRun}>
      {/* Turning while its call is on its way, and a burst for each press that made one (`burst`, the drawer's count; Try again's too): the button is where the work was asked for. */}
      <AiSpark working={thinking} burst={burst} />
      {/* The template it runs, by name: "Touch up" until another is picked from its menu in this drawer. */}
      {name}
    </Button>
  );
}
/** Right under Touch up whenever it isn't thinking: the most the next run can cost, or why it can't run. */
export function TouchUpCost({ beside }: { beside: string | null }) {
  return beside ? <p className="touch-up-cost">{beside}</p> : null;
}

type BarProps = {
  calls: readonly AiCall[];
  busy: boolean;
  canRun: boolean;
  /** Proposals still waiting on a decision: Accept all and Dismiss all are there while there are any. */
  pending: number;
  failure: { message: string; retry: boolean } | null;
  /** The follow-ups asked here, each pressed: the head's spark blinks once for each. */
  burst: number;
  onRun: () => void;
  onAcceptAll: () => void;
  onDismissAll: () => void;
  /** The conversation under the head (AI step 5): the follow-ups asked here, their replies, and the box to ask the next. */
  children?: ReactNode;
};

/**
 * Under the drawer's button row at its top once Touch up has run: the AI's head (`AiStatus`, its Details the
 * conversation's calls), with Accept all and Dismiss all while proposals wait, or the failure and Try again; then the
 * follow-ups asked under it. Nothing before the first call, when the button in the row is the status.
 */
export function TouchUpBar({ calls, busy, canRun, pending, failure, burst, onRun, onAcceptAll, onDismissAll, children }: BarProps) {
  const button = (words: string) => (
    <Button className="ai-explain-button" disabled={!canRun || busy} onClick={onRun}>
      <AiSpark />
      {words}
    </Button>
  );
  if (calls.length === 0) return null;
  return (
    <section className="field touch-up ai-explain" aria-label="Panki AI" aria-busy={busy}>
      <AiStatus calls={calls} burst={burst} />
      {failure ? (
        <div className="ai-explain-failure">
          <p className="form-failure" role="alert">
            {failure.message}
          </p>
          {failure.retry ? button(TOUCH_UP_WORDS.tryAgain) : null}
        </div>
      ) : pending > 0 ? (
        <div className="touch-up-all">
          <Button variant="primary" onClick={onAcceptAll}>
            <Icon name="check" />
            {TOUCH_UP_WORDS.acceptAll}
          </Button>
          <Button variant="ghost" onClick={onDismissAll}>
            <Icon name="close" />
            {TOUCH_UP_WORDS.dismissAll}
          </Button>
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A follow-up in Touch up's conversation (AI step 5): asked under the head (`field` null) or from a field's note (the
 * field's id), what was asked, and the reply or why there's none. What it changes is a proposal under its field.
 */
export type FollowTurn = { field: string | null; question: string; reply: string | null; failure: { message: string; retry: boolean } | null };

/**
 * The follow-ups asked in one place, as Explain draws its own: the question a bubble at the right, the reply under it as
 * plain paragraphs, or the failure with Try again. One on its way is its question alone: the head's spark and Thinking
 * are the wait.
 */
export function FollowTurns({ turns, canRun, onRetry }: { turns: readonly FollowTurn[]; canRun: boolean; onRetry: (turn: FollowTurn) => void }) {
  return (
    <>
      {turns.map((turn, i) => (
        <div key={i} className="ai-explain-turn">
          <p className="ai-explain-question">{turn.question}</p>
          {turn.reply !== null ? (
            <AnswerText text={turn.reply} />
          ) : turn.failure ? (
            <div className="ai-explain-failure">
              <p className="form-failure" role="alert">
                {turn.failure.message}
              </p>
              {turn.failure.retry ? (
                <Button className="ai-explain-button" disabled={!canRun} onClick={() => onRetry(turn)}>
                  <AiSpark />
                  {TOUCH_UP_WORDS.tryAgain}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

/**
 * The colour a field and its note are drawn in, by Panki's verdict: good green, meh orange, bad red (the meanings' own
 * looks, `.ai-accuracy.is-…`, one home), accent where nothing is wrong but something is offered (a value for an empty
 * field, more meanings that fit).
 */
export type Tone = "good" | "meh" | "bad" | "accent";
const TONE_CLASS: Record<Tone, string> = { good: `ai-accuracy is-${LOOK_OF.good}`, meh: `ai-accuracy is-${LOOK_OF.meh}`, bad: `ai-accuracy is-${LOOK_OF.bad}`, accent: "is-accent" };

/** One stretch of the diff, git's way: what goes struck in its verdict's colour (`out`), what comes in green (`in`). */
function Mark({ out, children, block }: { out?: "meh" | "bad"; children: string; block?: boolean }) {
  return (
    <span className={`touch-up-d ai-accuracy ai-accuracy-lit is-${LOOK_OF[out ?? "good"]}${out ? " is-out" : " is-in"}${block ? " is-block" : ""}`} lang={langOf(children)}>
      {children}
    </span>
  );
}

/**
 * What Touch up has to say under a field: the colour the two are drawn in, the field's box as the diff while a proposal
 * waits (none, and the field stands as it is), and the note under it.
 */
export type Shown = { tone: Tone; diff: ReactNode | null; note: ReactNode };

/**
 * A field and its note as one shape, so a proposal is plainly its field's: the field's box
 * and the note's outline in the verdict's colour, the note hanging straight from the box's foot; while a proposal waits,
 * the box is the diff in the field's place (`.touch-up-tied.is-diffing`), and the field comes back as it's decided.
 */
export function Tied({ shown, children }: { shown: Shown; children: ReactNode }) {
  return (
    <div className={`touch-up-tied ${TONE_CLASS[shown.tone]}${shown.diff ? " is-diffing" : ""}`}>
      {children}
      {shown.diff ? <div className="touch-up-diff">{shown.diff}</div> : null}
      <div className="touch-up-foot">{shown.note}</div>
    </div>
  );
}

/**
 * A note's why under its line, folded by the chevron a judged meaning's row has (`WhyButton`, the one piece): open under a proposal and the error, closed under "Nothing to change.". Nothing when there's no why.
 */
function WithReason({ head, reason, open: start }: { head: ReactNode; reason: string; open: boolean }) {
  const [open, setOpen] = useState(start);
  const has = reason.trim() !== "";
  return (
    <>
      <div className="touch-up-why-row">
        {head}
        {has ? <WhyButton open={open} label="Why" onToggle={() => setOpen(!open)} /> : null}
      </div>
      {has ? (
        <Fold open={open} arrives={false}>
          <p className="touch-up-reason">{reason}</p>
        </Fold>
      ) : null}
    </>
  );
}

/** The note's line: the spark and its words, in the verdict's colour. */
const head = (words: string) => (
  <span className="touch-up-head">
    <AiSpark />
    {words}
  </span>
);

/** A line with nothing to press: "Nothing to change." (its why closed) or Panki's words for an error (open). */
function Line({ words, why, open }: { words: string; why: string; open: boolean }) {
  return (
    <div className="touch-up-note">
      <WithReason open={open} reason={why} head={head(words)} />
    </div>
  );
}

/** A proposal: its title, its why open, and the two ways out, always Accept and Dismiss. Nothing is written until one is pressed. */
function Proposal({ title, why, onAccept, onDismiss }: { title: string; why: string; onAccept: () => void; onDismiss: () => void }) {
  return (
    <div className="touch-up-note">
      <WithReason open reason={why} head={head(title)} />
      <div className="touch-up-tools">
        <Button variant="primary" onClick={onAccept}>
          <Icon name="check" />
          {TOUCH_UP_WORDS.accept}
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          <Icon name="close" />
          {TOUCH_UP_WORDS.dismiss}
        </Button>
      </div>
    </div>
  );
}

/** What a proposal does once pressed, and whether it still waits (decided, nothing of it is drawn but its field). */
type Ways = { waiting: boolean; onAccept: () => void; onDismiss: () => void };

/** The error, the same under any field: Panki's own words for its code, in red, the why open, nothing to press. */
const errorShown = (verdict: { error: keyof typeof TOUCH_UP_ERRORS; why: string }): Shown => ({
  tone: "bad",
  diff: null,
  note: <Line words={TOUCH_UP_ERRORS[verdict.error]} why={verdict.why} open />,
});

/**
 * A text field as Panki draws its answer: good, a green "Nothing to change."; the error, red; meh or bad, the value it
 * holds struck in orange or red with the proposal under it in green, titled Could be better or Incorrect; written, the
 * value for an empty field in green under Panki AI proposes. `held` is what the field held as it was sent.
 */
export function fieldShown(verdict: FieldVerdict, held: string, ways: Ways): Shown | null {
  if (verdict.kind === "error") return errorShown(verdict);
  if (verdict.kind === "good") return { tone: "good", diff: null, note: <Line words={TOUCH_UP_WORDS.nothing} why={verdict.why} open={false} /> };
  if (!ways.waiting) return null;
  const proposal = (tone: Tone, title: string): Shown => ({
    tone,
    diff: (
      <>
        {verdict.kind === "written" ? null : <Mark out={verdict.kind}>{held}</Mark>}
        <Mark block={verdict.kind !== "written"}>{verdict.proposed}</Mark>
      </>
    ),
    note: <Proposal title={title} why={verdict.why} onAccept={ways.onAccept} onDismiss={ways.onDismiss} />,
  });
  if (verdict.kind === "written") return proposal("accent", TOUCH_UP_WORDS.proposes);
  return proposal(verdict.kind, verdict.kind === "meh" ? TOUCH_UP_WORDS.couldBeBetter : TOUCH_UP_WORDS.incorrect);
}

/** The Meaning as the diff reads, joined as the field joins its meanings: kept plain, orange or red struck, green added. */
function MeaningMarks({ marks, wordsOf }: { marks: readonly MeaningMark[]; wordsOf: (number: number) => string }) {
  return (
    <>
      {marks.map(({ number, mark }, i) => (
        <Fragment key={number}>
          {i > 0 ? "; " : null}
          {mark === "keep" ? wordsOf(number) : <Mark out={mark === "add" ? undefined : mark}>{wordsOf(number)}</Mark>}
        </Fragment>
      ))}
    </>
  );
}

/** The Meaning's tone and title, by Panki's verdict on its rows against the ticks: one home for both. */
function meaningTitle(verdict: Extract<MeaningVerdict, { kind: "change" | "propose" }>): { tone: Tone; title: string } {
  if (verdict.kind === "change") {
    if (verdict.tone === "more") return { tone: "accent", title: TOUCH_UP_WORDS.meaningMore };
    return verdict.tone === "meh" ? { tone: "meh", title: TOUCH_UP_WORDS.meaningsBetter } : { tone: "bad", title: TOUCH_UP_WORDS.meaningsIncorrect };
  }
  if (verdict.tone === "empty") return { tone: "accent", title: TOUCH_UP_WORDS.proposes };
  return verdict.tone === "meh" ? { tone: "meh", title: TOUCH_UP_WORDS.meaningBetter } : { tone: "bad", title: TOUCH_UP_WORDS.meaningNew };
}

/**
 * The Meaning as Panki draws its answer: every ticked row good, a green "Nothing to change."; the error, red, the list
 * left unmarked; a change of ticks or a proposed meaning, the Meaning's box as the diff (the proposed meaning green under
 * the ticked ones), titled by `meaningTitle`. `wordsOf` is a meaning's words by its number.
 */
export function meaningShown(verdict: MeaningVerdict, wordsOf: (number: number) => string, ways: Ways): Shown | null {
  if (verdict.kind === "error") return errorShown(verdict);
  if (verdict.kind === "good") return { tone: "good", diff: null, note: <Line words={TOUCH_UP_WORDS.nothing} why={verdict.why} open={false} /> };
  if (!ways.waiting) return null;
  const { tone, title } = meaningTitle(verdict);
  return {
    tone,
    diff: (
      <>
        <MeaningMarks marks={verdict.marks} wordsOf={wordsOf} />
        {verdict.kind === "propose" ? <Mark block={verdict.marks.length > 0}>{verdict.proposed}</Mark> : null}
      </>
    ),
    note: <Proposal title={title} why={verdict.why} onAccept={ways.onAccept} onDismiss={ways.onDismiss} />,
  };
}

/** Whether a verdict is a proposal, the one thing that waits on Accept or Dismiss. */
export const proposes = (verdict: FieldVerdict | MeaningVerdict): boolean => verdict.kind !== "error" && verdict.kind !== "good";

/**
 * What a field's box carries before its value (`TextField`'s `lead`): the spark while Panki AI wrote what it holds, in
 * the accent, the look the deck's rows and the review card give an AI value (`.card-ai`, `.review-ai`, `.field-ai`): in
 * the box, not after the label.
 */
export function fieldMarks(ai: boolean): ReactNode {
  return ai ? <AiSpark className="field-ai" /> : null;
}

/** A meaning row's judgement as Details' tag says it. */
const JUDGEMENT_WORDS: Record<Judgement, string> = { good: "Good", meh: TOUCH_UP_WORDS.couldBeBetter, bad: TOUCH_UP_WORDS.incorrect };
/** A verdict's tag as Details say it, in its colour. */
function tagOf(tone: Tone, words: string): AiVerdict["tag"] {
  return { words: words.replace(/\.$/, ""), look: tone === "good" ? "good" : tone === "meh" ? "flag" : tone === "bad" ? "danger" : "accent" };
}
/** A text field's verdict as Details' tag says it. */
function fieldTag(verdict: FieldVerdict): AiVerdict["tag"] {
  if (verdict.kind === "error") return tagOf("bad", TOUCH_UP_ERRORS[verdict.error]);
  if (verdict.kind === "good") return tagOf("good", TOUCH_UP_WORDS.nothing);
  if (verdict.kind === "written") return tagOf("accent", TOUCH_UP_WORDS.proposes);
  return verdict.kind === "meh" ? tagOf("meh", TOUCH_UP_WORDS.couldBeBetter) : tagOf("bad", TOUCH_UP_WORDS.incorrect);
}

/**
 * The Meaning as Details say it, Explain's way (`Explain.tsx` → `explainVerdicts`): Panki's verdict with the Meaning's
 * own why first, then every meaning judged, its number, words and why, in its judgement's look, and the proposed meaning
 * numbered after them.
 */
function meaningVerdicts(part: MeaningAnswer, verdict: MeaningVerdict, meanings: readonly string[]): AiVerdict[] {
  const name = TOUCH_UP.meaning.name;
  if (verdict.kind === "error" || isError(part)) return [{ name, tag: tagOf("bad", TOUCH_UP_ERRORS[isError(part) ? part.error : "no_context"]), value: "", reason: part.why }];
  const { tone, title } = verdict.kind === "good" ? { tone: "good" as const, title: TOUCH_UP_WORDS.nothing } : meaningTitle(verdict);
  return [
    { name, tag: tagOf(tone, title), value: "", reason: part.why },
    ...part.meanings.map((row): AiVerdict => ({ name: `${name} ${row.meaning}`, tag: { words: JUDGEMENT_WORDS[row.judgement], look: "muted" }, value: meanings[row.meaning - 1] ?? "", reason: row.why, accuracy: LOOK_OF[row.judgement] })),
    ...(part.proposed ? [{ name: `Proposed ${name.toLowerCase()} ${meanings.length + 1}`, tag: tagOf("accent", TOUCH_UP_WORDS.proposes), value: part.proposed, reason: "" }] : []),
  ];
}

/**
 * What Details say each part of an answer came to, by the key's name and Panki's verdict on it, the drawer's own: for
 * the Meaning, the verdict and every meaning judged (`meaningVerdicts`); for a text field, its verdict as a tag, the value
 * proposed, and the why. `meanings` is every meaning sent, in `{Meaning}`'s order; `now` the card as it was sent.
 */
export function touchUpVerdicts(answer: TouchUpAnswer, now: TouchUpNow, meanings: readonly string[]): AiVerdict[] {
  return TOUCH_UP_KEYS.flatMap((key): AiVerdict[] => {
    if (key === "meaning") return answer.meaning ? meaningVerdicts(answer.meaning, meaningVerdictOf(answer.meaning, now.ticked), meanings) : [];
    const part = answer[key];
    if (!part) return [];
    const verdict = fieldVerdictOf(part, now.values[key] ?? "");
    return [{ name: TOUCH_UP[key].name, tag: fieldTag(verdict), value: "proposed" in verdict ? verdict.proposed : "", reason: verdict.why }];
  });
}
