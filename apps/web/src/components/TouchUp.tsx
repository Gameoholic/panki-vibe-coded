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
  type MeaningRowVerdict,
  type MeaningVerdict,
  type PankiAiStatus,
  type TouchUpAnswer,
  type TouchUpNow,
} from "@panki/contracts";
import { langOf, listWords, wordFor } from "../words";
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
  /** Every positive verdict, a text field's and the Meaning's alike: the tag on its label's row (`NothingTag`). */
  nothing: "Nothing to change",
  /** The spark turning where a follow-up's reply will stand, for a screen reader. */
  answering: "Panki AI is answering",
  /** A value written into a field that was empty, the Meaning of a dictionary with none among them. */
  proposes: "Panki AI proposes",
  couldBeBetter: "Could be better",
  incorrect: "Incorrect",
  /**
   * The Meaning's titles (`meaningTitle`), clauses joined by commas: what each meaning the field holds that doesn't fit
   * is, incorrect first, then close; then what fits instead, or that Panki AI proposes. Each verb as it is for one, and
   * for several.
   */
  meaningIncorrect: ["is incorrect", "are incorrect"] as const,
  meaningClose: ["is close", "are close"] as const,
  meaningFits: ["fits", "fit"] as const,
  meaningFitsBetter: ["fits better", "fit better"] as const,
  /** After the meanings that fit beside what the field already holds, nothing of it off. */
  meaningToo: "too",
  meaningProposesBetter: "but Panki AI proposes a better meaning",
  meaningProposes: "Panki AI proposes a meaning",
  /** Every meaning there, the dictionary's and the field's own, incorrect, and Panki AI's in their place. */
  meaningAllIncorrect: "All existing meanings are incorrect, but Panki AI proposes a better meaning",
  /** A run of the Meaning no dictionary meaning claims, by its count: in the Meaning list, the titles' numbered form and Details. */
  customMeaning: (n: number) => `Custom meaning ${n}`,
  /** What the Meaning list says while Panki AI's proposed meaning is the field's. */
  meaningProposed: "Panki AI's meaning",
  /** Under a Sentence proposal on a video: where Accept puts the clip's ends, its two times as a clip's stamp writes them. */
  clipMoves: (start: string, end: string) => `Accept also moves the clip to ${start} – ${end}.`,
  /** The same, when the proposed words aren't in the subtitles kept: Accept writes the sentence and leaves the clip. */
  clipStays: "The clip stays as it is.",
  accept: "Accept",
  dismiss: "Dismiss",
  acceptAll: "Accept all",
  dismissAll: "Dismiss all",
  tryAgain: "Try again",
  /** Before the chips of the fields a round changed (`Changed`), and in their place when it changed none. */
  changed: "Changed:",
  changedNothing: "Changed nothing",
  /** The line a merged branch's questions that changed nothing are folded under, in the head. */
  foldedNothing: (n: number) => `${n} ${wordFor(n, "question", "questions")} · Changed nothing`,
  /** Under a field whose branch was reset when main moved on: its questions there are gone, until the next is asked. */
  startedAgain: "Started again from the latest changes",
  /** Under a value Panki AI wrote and then changed by hand: taking the AI's mark off it, so it's the owner's. */
  unmarkAi: "Unmark as Panki AI's",
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
 * How a proposal a round made stands now, on its chip: still waiting under its field, accepted, dismissed, or replaced
 * (a later round proposed for the field again, or the field changed under it before it was decided).
 */
export type ChipState = "live" | "accepted" | "dismissed" | "replaced";
/** A field a round changed, as its chip draws it: the field's id and name, its proposal's colour, how it stands. */
export type ChangeChip = { id: string; name: string; tone: Tone; state: ChipState };

/**
 * A turn of Touch up's conversation as it's drawn (AI step 5; a commit, `@panki/contracts` → `conversation.ts`, or the
 * question on its way): the run itself (`run`, the template it ran, by name), or a follow-up, marked with the field it
 * was asked under where that isn't plain (`about`: in the head, a merged branch's); its reply once it's in, or why
 * there's none; what it changed, once it's in, a chip a field (none for nothing); and in the head, the commits of its
 * branch that changed nothing and were merged with it (`folded`), under one quiet line before it.
 */
export type TouchUpTurn = {
  id: number;
  run: string | null;
  question: string;
  about: { id: string; name: string } | null;
  reply: string | null;
  failure: { message: string; retry: boolean } | null;
  changed: readonly ChangeChip[] | null;
  folded?: readonly TouchUpTurn[];
};

/** A round asked and not yet answered or failed: the one on its way. */
export const turnGoing = (turn: { changed: readonly unknown[] | null; failure: unknown }): boolean => turn.changed === null && turn.failure === null;

/** A chip's state in words, for a screen reader: the dot or the tick says it to the eye. */
const CHIP_STATE_WORDS: Record<ChipState, string> = { live: "waiting", accepted: "accepted", dismissed: "dismissed", replaced: "replaced" };

/**
 * What a round changed, under its reply: "Changed:" and a chip a field, in the card type's order, the dot in its
 * proposal's colour while it waits, a tick once accepted, hollow once dismissed or replaced; pressed, the drawer goes to
 * the field. "Changed nothing" for a round that changed nothing. It stays as the round's record once all is decided.
 */
function Changed({ chips, onGo }: { chips: readonly ChangeChip[]; onGo: (fieldId: string) => void }) {
  if (chips.length === 0) return <p className="touch-up-changed">{TOUCH_UP_WORDS.changedNothing}</p>;
  return (
    <div className="touch-up-changed">
      {TOUCH_UP_WORDS.changed}
      {chips.map((chip) => (
        <Button key={chip.id} variant="chip" className={`touch-up-chip ${TONE_CLASS[chip.tone]} is-${chip.state}`} aria-label={`${chip.name}, ${CHIP_STATE_WORDS[chip.state]}`} onClick={() => onGo(chip.id)}>
          {chip.state === "accepted" ? <Icon name="check" /> : <span className="touch-up-chip-dot" aria-hidden="true" />}
          {chip.name}
        </Button>
      ))}
    </div>
  );
}

type TurnsProps = { canRun: boolean; onRetry: (id: number) => void; onGo: (fieldId: string) => void };

/** One turn: its question (or the run's press), then its reply and what it changed, the spark while it's on its way, or the failure with Try again. */
function Turn({ turn, canRun, onRetry, onGo }: TurnsProps & { turn: TouchUpTurn }) {
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
            <Button className="touch-up-about" onClick={() => onGo(about.id)}>
              <Icon name="forward" />
              {about.name}
            </Button>
          ) : null}
          <p className="ai-explain-question">{turn.question}</p>
        </>
      )}
      {turnGoing(turn) ? (
        <div className="touch-up-answering" role="status" aria-label={TOUCH_UP_WORDS.answering}>
          <AiSpark working />
        </div>
      ) : turn.failure ? (
        <div className="ai-explain-failure">
          <p className="form-failure" role="alert">
            {turn.failure.message}
          </p>
          {turn.failure.retry ? (
            <Button className="ai-explain-button" disabled={!canRun} onClick={() => onRetry(turn.id)}>
              <AiSpark />
              {TOUCH_UP_WORDS.tryAgain}
            </Button>
          ) : null}
        </div>
      ) : (
        <AnswerText text={turn.reply ?? ""}>
          <Changed chips={turn.changed ?? []} onGo={onGo} />
        </AnswerText>
      )}
    </div>
  );
}

/** A merged branch's questions that changed nothing, in the head: one quiet line, "2 questions · Changed nothing", opening them where they stand. */
function FoldedTurns({ turns, ...rest }: TurnsProps & { turns: readonly TouchUpTurn[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={`touch-up-folded${open ? " is-open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {TOUCH_UP_WORDS.foldedNothing(turns.length)}
        <Icon name="down" />
      </Button>
      <Fold open={open} arrives={false}>
        <div className="touch-up-folded-turns">
          {turns.map((turn) => (
            <Turn key={turn.id} turn={turn} {...rest} />
          ))}
        </div>
      </Fold>
    </>
  );
}

/**
 * A branch merged into main, in the head, as one block: its field's mark once at the top (the forward sign and the
 * field's name, pressed to go there) at the top right, then a thin rule down its right edge beside, in order, its questions that changed
 * nothing under their fold line and the commit that changed, none of them marked again.
 */
function MergedBranch({ turn, about, ...rest }: TurnsProps & { turn: TouchUpTurn; about: { id: string; name: string } }) {
  return (
    <div className="touch-up-merged">
      <Button className="touch-up-about" onClick={() => rest.onGo(about.id)}>
        <Icon name="forward" />
        {about.name}
      </Button>
      <div className="touch-up-branch">
        {turn.folded && turn.folded.length > 0 ? <FoldedTurns turns={turn.folded.map((each) => ({ ...each, about: null }))} {...rest} /> : null}
        <Turn turn={{ ...turn, about: null }} {...rest} />
      </div>
    </div>
  );
}

/**
 * Touch up's conversation as Explain draws its own (the Conversation: main in the head, a field's branch under the
 * field; `@panki/contracts` → `conversation.ts`): the run as its press (the spark and the template's name in the bubble),
 * a follow-up as its question at the right; then the reply as plain paragraphs and what it changed (`Changed`), or the
 * failure with Try again. One on its way is the spark turning where its reply will stand. A follow-up marked with its
 * field (`about`: in the head, the commit a merge brought) is its branch drawn as one block (`MergedBranch`), its
 * questions that changed nothing folded inside it. `startedAgain`, under a field whose branch was reset, is the muted
 * line before them.
 */
export function TouchUpTurns({ turns, startedAgain = false, ...rest }: TurnsProps & { turns: readonly TouchUpTurn[]; startedAgain?: boolean }) {
  return (
    <>
      {startedAgain ? <p className="touch-up-again">{TOUCH_UP_WORDS.startedAgain}</p> : null}
      {turns.map((turn) =>
        turn.run === null && turn.about !== null ? (
          <MergedBranch key={turn.id} turn={turn} about={turn.about} {...rest} />
        ) : (
          <Fragment key={turn.id}>
            {turn.folded && turn.folded.length > 0 ? <FoldedTurns turns={turn.folded} {...rest} /> : null}
            <Turn turn={turn} {...rest} />
          </Fragment>
        ),
      )}
    </>
  );
}

/**
 * The colour a field and its note are drawn in, by Panki's verdict: good green, meh orange, bad red (the meanings' own
 * looks, `.ai-accuracy.is-…`, one home), and accent, the blue, for words of Panki AI's own on offer (a value for an
 * empty field, a meaning it proposes). The Meaning's note says what the proposal is, never how a ticked meaning was
 * judged: green with nothing to change, orange or red for other meanings of the list to tick (red when one held is
 * incorrect), blue when Panki AI proposes one of its own.
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
 * What Touch up has to say of a field: the colour the two are drawn in, the field's box as the diff while a proposal
 * waits (none, and the field stands as it is), and the note under it; or, with nothing to change, no note at all but
 * the tag on the label's row, `quiet` holding its why.
 */
export type Shown = { tone: Tone; diff: ReactNode | null; note: ReactNode | null; quiet: { why: string } | null };

/**
 * "Nothing to change" as a small tag at the right of its field's label row, in the good look, the spark before it and
 * the chevron after: pressed, its why and the field's follow-ups open under the field (`Tied`), so a field that's fine
 * takes no row of its own.
 */
function NothingTag({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button className={`touch-up-tag${open ? " is-open" : ""}`} aria-expanded={open} onClick={onToggle}>
      <AiSpark />
      {TOUCH_UP_WORDS.nothing}
      <Icon name="down" />
    </Button>
  );
}

type TiedProps = {
  shown: Shown;
  /** What stands under the note, or in the tag's fold: the follow-ups asked at this field and the box to ask the next. */
  more?: ReactNode;
  /** The field itself, handed what goes at the right of its label's row (`TextField`'s `labelEnd`): the tag, or nothing. */
  children: (labelEnd: ReactNode) => ReactNode;
};

/**
 * A field and its note as one shape, so a proposal is plainly its field's: the field's box
 * and the note's outline in the verdict's colour, the note hanging straight from the box's foot; while a proposal waits,
 * the box is the diff in the field's place (`.touch-up-tied.is-diffing`), and the field comes back as it's decided.
 * With nothing to change there's no note: the box in the good colour, the tag on its label's row, and pressed, its why
 * and `more` in a box of their own under the field (`.touch-up-open`).
 */
export function Tied({ shown, more, children }: TiedProps) {
  const [open, setOpen] = useState(false);
  if (shown.quiet) {
    const why = shown.quiet.why.trim();
    return (
      <div className={`touch-up-tied is-quiet ${TONE_CLASS[shown.tone]}`}>
        {children(<NothingTag open={open} onToggle={() => setOpen(!open)} />)}
        <Fold open={open} className="touch-up-more">
          <div className="touch-up-open">
            {why !== "" ? <p className="touch-up-reason">{why}</p> : null}
            {more}
          </div>
        </Fold>
      </div>
    );
  }
  return (
    <div className={`touch-up-tied ${TONE_CLASS[shown.tone]}${shown.diff ? " is-diffing" : ""}`}>
      {children(null)}
      {shown.diff ? <div className="touch-up-diff">{shown.diff}</div> : null}
      <div className="touch-up-foot">
        {shown.note}
        {more}
      </div>
    </div>
  );
}

/**
 * A note's why under its line, folded by the chevron a judged meaning's row has (`WhyButton`, the one piece): open to begin with under a proposal and the error. Nothing when there's no why.
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

/** A line with nothing to press: Panki's words for an error, its why open. */
function Line({ words, why }: { words: string; why: string }) {
  return (
    <div className="touch-up-note">
      <WithReason open reason={why} head={head(words)} />
    </div>
  );
}

/** Nothing to change: no note, the tag on the label's row with its why. */
const nothingShown = (why: string): Shown => ({ tone: "good", diff: null, note: null, quiet: { why } });

/**
 * A proposal: its title, its why open, what else Accept does (`also`: the Sentence's clip on a video), and the two ways
 * out, always Accept and Dismiss. Nothing is written until one is pressed.
 */
function Proposal({ title, why, also, onAccept, onDismiss }: { title: string; why: string; also?: string | null; onAccept: () => void; onDismiss: () => void }) {
  return (
    <div className="touch-up-note">
      <WithReason open reason={why} head={head(title)} />
      {also ? <p className="touch-up-also">{also}</p> : null}
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

/**
 * What a proposal does once pressed, and whether it still waits (decided, nothing of it is drawn but its field); `also`
 * is a line saying what else Accept does, given by whoever holds it (the drawer's `TOUCH_UP_WORDS.clipMoves`).
 */
type Ways = { waiting: boolean; onAccept: () => void; onDismiss: () => void; also?: string | null };

/** The error, the same under any field: Panki's own words for its code, in red, the why open, nothing to press. */
const errorShown = (verdict: { error: keyof typeof TOUCH_UP_ERRORS; why: string }): Shown => ({
  tone: "bad",
  diff: null,
  note: <Line words={TOUCH_UP_ERRORS[verdict.error]} why={verdict.why} />,
  quiet: null,
});

/**
 * A text field as Panki draws its answer: good, the green "Nothing to change" tag; the error, red; meh or bad, the value it
 * holds struck in orange or red with the proposal under it in green, titled Could be better or Incorrect; written, the
 * value for an empty field in green under Panki AI proposes. `held` is what the field held as it was sent.
 */
export function fieldShown(verdict: FieldVerdict, held: string, ways: Ways): Shown | null {
  if (verdict.kind === "error") return errorShown(verdict);
  if (verdict.kind === "good") return nothingShown(verdict.why);
  if (!ways.waiting) return null;
  const proposal = (tone: Tone, title: string): Shown => ({
    tone,
    diff: (
      <>
        {verdict.kind === "written" ? null : <Mark out={verdict.kind}>{held}</Mark>}
        <Mark block={verdict.kind !== "written"}>{verdict.proposed}</Mark>
      </>
    ),
    note: <Proposal title={title} why={verdict.why} also={ways.also} onAccept={ways.onAccept} onDismiss={ways.onDismiss} />,
    quiet: null,
  });
  if (verdict.kind === "written") return proposal("accent", TOUCH_UP_WORDS.proposes);
  return proposal(verdict.kind, verdict.kind === "meh" ? TOUCH_UP_WORDS.couldBeBetter : TOUCH_UP_WORDS.incorrect);
}

/** The Meaning as the diff reads, joined as the field joins its glosses: kept plain, orange or red struck, green added. */
function MeaningMarks({ marks }: { marks: readonly MeaningMark[] }) {
  return (
    <>
      {marks.map(({ kind, number, words, mark }, i) => (
        <Fragment key={`${kind}${number}`}>
          {i > 0 ? "; " : null}
          {mark === "keep" ? words : <Mark out={mark === "add" ? undefined : mark}>{words}</Mark>}
        </Fragment>
      ))}
    </>
  );
}

/**
 * How the Meaning's titles name a meaning: by its words, quoted ("“lenient; indulgent” is close"), or by its number
 * ("meaning 2 is close", "custom meaning 1 is incorrect"). One switch, so the other is one edit away.
 */
const MEANING_NAMES: "quoted" | "numbered" = "quoted";
/** Some meanings named in a title, as `MEANING_NAMES` says: "“to multiply”", "“to hang” and “to multiply”", "meanings 1 and 3 and custom meaning 1". */
function meaningsNamed(rows: readonly MeaningRowVerdict[]): string {
  if (MEANING_NAMES === "quoted") return listWords(rows.map((row) => `“${row.words}”`));
  const numbered = (kind: MeaningRowVerdict["kind"], one: string, many: string) => {
    const numbers = rows.filter((row) => row.kind === kind).map((row) => String(row.number));
    return numbers.length > 0 ? [`${wordFor(numbers.length, one, many)} ${listWords(numbers)}`] : [];
  };
  return listWords([...numbered("dictionary", "meaning", "meanings"), ...numbered("custom", "custom meaning", "custom meanings")]);
}
/** One clause: the meanings named, then the verb for one or for several. */
const clauseOf = (rows: readonly MeaningRowVerdict[], [one, many]: readonly [string, string]) => `${meaningsNamed(rows)} ${rows.length === 1 ? one : many}`;
const capitalised = (words: string) => words.slice(0, 1).toUpperCase() + words.slice(1);

/**
 * The Meaning's tone and title, one home for both, by one grammar over the rows judged: the meanings the field holds
 * that don't fit, incorrect first then close, each named; then, when a meaning of the list fits, every one that fits
 * ("but … fits better" beside a close one, "but … fits" beside incorrect ones alone, "… fits too" when nothing held is
 * off), an unheld one named only when it fits; when none fits, that Panki AI proposes (a better meaning after a clause,
 * "a meaning" alone). Every meaning there incorrect is said as one. Orange, or red when one held is incorrect, for
 * meanings to tick; blue for a meaning of Panki AI's own.
 */
function meaningTitle(verdict: Extract<MeaningVerdict, { kind: "change" | "propose" }>): { tone: Tone; title: string } {
  const { rows } = verdict;
  if (verdict.kind === "propose" && rows.length > 0 && rows.every((row) => row.judgement === "bad")) return { tone: "accent", title: TOUCH_UP_WORDS.meaningAllIncorrect };
  const incorrect = rows.filter((row) => row.ticked && row.judgement === "bad");
  const close = rows.filter((row) => row.ticked && row.judgement === "meh");
  const clauses = [
    ...(incorrect.length > 0 ? [clauseOf(incorrect, TOUCH_UP_WORDS.meaningIncorrect)] : []),
    ...(close.length > 0 ? [clauseOf(close, TOUCH_UP_WORDS.meaningClose)] : []),
  ];
  if (verdict.kind === "change") {
    const fits = rows.filter((row) => row.judgement === "good");
    if (clauses.length > 0) clauses.push(`but ${clauseOf(fits, close.length > 0 ? TOUCH_UP_WORDS.meaningFitsBetter : TOUCH_UP_WORDS.meaningFits)}`);
    else {
      const added = clauseOf(
        fits.filter((row) => !row.ticked),
        TOUCH_UP_WORDS.meaningFits,
      );
      clauses.push(rows.some((row) => row.ticked) ? `${added} ${TOUCH_UP_WORDS.meaningToo}` : added);
    }
    return { tone: incorrect.length > 0 ? "bad" : "meh", title: capitalised(clauses.join(", ")) };
  }
  clauses.push(clauses.length > 0 ? TOUCH_UP_WORDS.meaningProposesBetter : TOUCH_UP_WORDS.meaningProposes);
  return { tone: "accent", title: capitalised(clauses.join(", ")) };
}

/**
 * The Meaning as Panki draws its answer: every meaning held good, the green "Nothing to change" tag; the error, red, the list
 * left unmarked; other meanings to tick or a proposed meaning, the Meaning's box as the diff (what goes struck, what
 * comes in green; the proposed meaning green under the struck ones), titled by `meaningTitle`. Its note says nothing of
 * what Accept does beyond the diff: Accept and Dismiss are the two ways out.
 */
export function meaningShown(verdict: MeaningVerdict, ways: Ways): Shown | null {
  if (verdict.kind === "error") return errorShown(verdict);
  if (verdict.kind === "good") return nothingShown(verdict.why);
  if (!ways.waiting) return null;
  const { tone, title } = meaningTitle(verdict);
  return {
    tone,
    diff: (
      <>
        <MeaningMarks marks={verdict.marks} />
        {verdict.kind === "propose" ? <Mark block={verdict.marks.length > 0}>{verdict.proposed}</Mark> : null}
      </>
    ),
    note: <Proposal title={title} why={verdict.why} onAccept={ways.onAccept} onDismiss={ways.onDismiss} />,
    quiet: null,
  };
}

/** Whether a verdict is a proposal, the one thing that waits on Accept or Dismiss. */
export const proposes = (verdict: FieldVerdict | MeaningVerdict): boolean => verdict.kind !== "error" && verdict.kind !== "good";

/** The colour a proposal is drawn in, the same as its note's (a round's chip for it takes it); none for what isn't one. */
export function proposalTone(verdict: FieldVerdict | MeaningVerdict): Tone | null {
  switch (verdict.kind) {
    case "meh":
    case "bad":
      return verdict.kind;
    case "written":
      return "accent";
    case "change":
    case "propose":
      return meaningTitle(verdict).tone;
    default:
      return null;
  }
}

/**
 * What a field's box carries before its value (`TextField`'s `lead`): the spark while Panki AI wrote what it holds, in
 * the accent, the look the deck's rows and the review card give an AI value (`.card-ai`, `.review-ai`, `.field-ai`): in
 * the box, not after the label.
 */
export function fieldMarks(ai: boolean): ReactNode {
  return ai ? <AiSpark className="field-ai" /> : null;
}

/**
 * Under a field Panki AI wrote and the owner has since changed, which stays the AI's (its source `edited`): a quiet
 * line offering to take the AI's mark off it, Unmark as Panki AI's, so it's theirs. Whoever holds the field decides when
 * it shows (only while the value differs from what the AI wrote) and what the press does: the capture drawer and a card
 * opened to edit (`CardForm`) alike. Nothing dismisses it: it's one quiet line, there as long as it applies.
 */
export function UnmarkAi({ disabled = false, onUnmark }: { disabled?: boolean; onUnmark: () => void }) {
  return (
    <div className="ai-unmark">
      <Button className="ai-unmark-go" disabled={disabled} onClick={onUnmark}>
        <Icon name="user" />
        {TOUCH_UP_WORDS.unmarkAi}
      </Button>
    </div>
  );
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
 * own why first, then every meaning judged, the dictionary's by number and the field's own as Custom meaning 1 and on,
 * its words and why, in its judgement's look, and the proposed meaning numbered after the dictionary's.
 */
function meaningVerdicts(part: MeaningAnswer, verdict: MeaningVerdict, meanings: readonly string[]): AiVerdict[] {
  const name = TOUCH_UP.meaning.name;
  if (verdict.kind === "error" || isError(part)) return [{ name, tag: tagOf("bad", TOUCH_UP_ERRORS[isError(part) ? part.error : "no_context"]), value: "", reason: part.why }];
  const { tone, title } = verdict.kind === "good" ? { tone: "good" as const, title: TOUCH_UP_WORDS.nothing } : meaningTitle(verdict);
  return [
    { name, tag: tagOf(tone, title), value: "", reason: part.why },
    ...verdict.rows.map(
      (row): AiVerdict => ({
        name: row.kind === "dictionary" ? `${name} ${row.number}` : TOUCH_UP_WORDS.customMeaning(row.number),
        tag: { words: JUDGEMENT_WORDS[row.judgement], look: "muted" },
        value: row.words,
        reason: row.why,
        accuracy: LOOK_OF[row.judgement],
      }),
    ),
    ...(part.proposed ? [{ name: `Proposed ${name.toLowerCase()} ${meanings.length + 1}`, tag: tagOf("accent", TOUCH_UP_WORDS.proposes), value: part.proposed, reason: "" }] : []),
  ];
}

/**
 * What Details say each part of an answer came to, by the key's name and Panki's verdict on it, the drawer's own: for
 * the Meaning, the verdict and every meaning judged (`meaningVerdicts`); for a text field, its verdict as a tag, the value
 * proposed, and the why. `meanings` is the dictionary's meanings sent, in `{Meaning}`'s order; `now` the card as it was
 * sent, the Meaning's custom meanings read off it.
 */
export function touchUpVerdicts(answer: TouchUpAnswer, now: TouchUpNow, meanings: readonly string[]): AiVerdict[] {
  return TOUCH_UP_KEYS.flatMap((key): AiVerdict[] => {
    if (key === "meaning") return answer.meaning ? meaningVerdicts(answer.meaning, meaningVerdictOf(answer.meaning, now, meanings), meanings) : [];
    const part = answer[key];
    if (!part) return [];
    const verdict = fieldVerdictOf(part, now.values[key] ?? "");
    return [{ name: TOUCH_UP[key].name, tag: fieldTag(verdict), value: "proposed" in verdict ? verdict.proposed : "", reason: verdict.why }];
  });
}
