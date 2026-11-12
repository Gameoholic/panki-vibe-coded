/** @panki Touch up as it's drawn: its head, a proposal under a field (`TouchUpAll`, `Tied`, `fieldShown`, `proposes`, `UnmarkAi`). Never a second proposal. */
import { Fragment, useState, type ReactNode } from "react";
import {
  TOUCH_UP,
  TOUCH_UP_ERRORS,
  TOUCH_UP_KEYS,
  fieldVerdictOf,
  isError,
  meaningVerdictOf,
  textDiff,
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
import { TONE_CLASS, type Tone } from "./AiConversation";
import { whyNot } from "./AiRun";
import { AiSpark } from "./AiWaiting";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";
import { WhyButton } from "./JudgedRow";

/**
 * Touch up in the capture drawer: the one button over the card's fields, then its run drawn as every place's is
 * (`AiConversation`, the drawer handing in Touch up's `ConversationOf`) with Accept all and Dismiss all; under each
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
  /** Under a Sentence proposal on a video, before where Accept puts the clip's ends and its length, drawn as a diff of where it is (`ClipMove`). */
  clipMoves: "Accept also moves the clip:",
  /** A clip's length, as the drawer writes it beside its two ends. */
  clipLength: (seconds: number) => `${seconds.toFixed(2)} s`,
  /** The same, when the proposed words aren't in the subtitles kept: Accept writes the sentence and leaves the clip. */
  clipStays: "The clip stays as it is.",
  accept: "Accept",
  dismiss: "Dismiss",
  acceptAll: "Accept all",
  dismissAll: "Dismiss all",
  /** Under a value Panki AI wrote and then changed by hand: taking the AI's mark off it, so it's the owner's. */
  unmarkAi: "Unmark as Panki AI's",
};

/** Why nothing can be sent in a card's conversation, said beside its Send (`whyNot`, Explain's too: Panki AI off among them). */
export function touchUpReason(known: boolean, ai: Pick<PankiAiStatus, "settings" | "key"> | null, failure: string | null): string | null {
  return whyNot(known, ai, failure, TOUCH_UP_WORDS.signedOut);
}

/**
 * Under Touch up's head while proposals wait (`AiConversation`'s `tools`): Accept all and Dismiss all, closing every
 * note under the fields. The rest of the head, the run's conversation and its follow-ups are every place's
 * (`AiConversation`), the drawer handing in Touch up's `ConversationOf`.
 */
export function TouchUpAll({ pending, onAcceptAll, onDismissAll }: { pending: number; onAcceptAll: () => void; onDismissAll: () => void }) {
  if (pending === 0) return null;
  return (
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
  );
}

/*
 * The colour a field and its note are drawn in is the conversation's `Tone`, by Panki's verdict: the Meaning's note
 * says what the proposal is, never how a ticked meaning was judged: green with nothing to change, orange or red for
 * other meanings of the list to tick (red when one held is incorrect), blue when Panki AI proposes one of its own.
 */

/**
 * One stretch of the diff, git's way: what goes struck in its proposal's colour (`out`: orange or red for a judged value,
 * the accent for one of Panki AI's own offered with no judgement), what comes in green (`in`).
 */
export function Mark({ out, children, block }: { out?: Exclude<Tone, "good">; children: string; block?: boolean }) {
  const look = out === "accent" ? "is-accent" : `ai-judgement is-${out ?? "good"}`;
  return (
    <span className={`touch-up-d ${look} ai-judgement-lit${out ? " is-out" : " is-in"}${block ? " is-block" : ""}`} lang={langOf(children)}>
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
function Proposal({ title, why, also, onAccept, onDismiss }: { title: string; why: string; also?: ReactNode; onAccept: () => void; onDismiss: () => void }) {
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
 * is a line saying what else Accept does, given by whoever holds it (the drawer's `ClipMove`).
 */
type Ways = { waiting: boolean; onAccept: () => void; onDismiss: () => void; also?: ReactNode };

/** A clip's two ends, in the video's seconds; `end` null while its last words are still being said. */
type ClipSpan = { start: number; end: number | null };
/**
 * Where Accept moves a clip, as a diff of where it is (`from`, null when there's none to compare with): each end and
 * the length, plain where it stays, what goes struck in the proposal's colour (`out`) and what comes in green, the
 * text diffs' own marks. "The clip stays as it is." when nothing of it moves.
 */
export function ClipMove({ from, to, stamp, out }: { from: ClipSpan | null; to: { start: number; end: number }; stamp: (seconds: number) => string; out: Exclude<Tone, "good"> }) {
  const was = from ? { start: stamp(from.start), end: from.end === null ? null : stamp(from.end), length: from.end === null ? null : TOUCH_UP_WORDS.clipLength(from.end - from.start) } : null;
  const now = { start: stamp(to.start), end: stamp(to.end), length: TOUCH_UP_WORDS.clipLength(to.end - to.start) };
  if (was && was.start === now.start && was.end === now.end) return <>{TOUCH_UP_WORDS.clipStays}</>;
  const part = (held: string | null | undefined, comes: string) =>
    held === null || held === undefined || held === comes ? (
      comes
    ) : (
      <>
        <Mark out={out}>{held}</Mark> <Mark>{comes}</Mark>
      </>
    );
  return (
    <>
      {TOUCH_UP_WORDS.clipMoves} {part(was?.start, now.start)} – {part(was?.end, now.end)} · {part(was?.length, now.length)}
    </>
  );
}

/** The error, the same under any field: Panki's own words for its code, in red, the why open, nothing to press. */
const errorShown = (verdict: { error: keyof typeof TOUCH_UP_ERRORS; why: string }): Shown => ({
  tone: "bad",
  diff: null,
  note: <Line words={TOUCH_UP_ERRORS[verdict.error]} why={verdict.why} />,
  quiet: null,
});

/**
 * A proposal for a text field as one paragraph with its changes lit (`textDiff`) against what the field holds now: kept
 * text plain, what goes struck in the proposal's colour (`out`), what comes in green. A rewrite
 * (`DIFF_KEEP_MIN`) is the held value struck whole with the proposal under it in green; an empty field filled, the
 * proposal all green.
 */
function TextDiff({ held, proposed, out }: { held: string; proposed: string; out: Exclude<Tone, "good"> }) {
  if (held.trim() === "") return <Mark>{proposed}</Mark>;
  const runs = textDiff(held, proposed);
  if (runs === null) {
    return (
      <>
        <Mark out={out}>{held}</Mark>
        <Mark block>{proposed}</Mark>
      </>
    );
  }
  return (
    <span lang={langOf(proposed)}>
      {runs.map((run, i) => (run.kind === "keep" ? <Fragment key={i}>{run.text}</Fragment> : <Mark key={i} out={run.kind === "drop" ? out : undefined}>{run.text}</Mark>))}
    </span>
  );
}

/**
 * A text field as Panki draws its answer: good, the green "Nothing to change" tag; the error, red; meh or bad, the
 * proposal as a diff of the value it holds (`TextDiff`), what goes struck in orange or red, titled Could be better or
 * Incorrect; written, a proposal with no judgement (a value for an empty field, or a follow-up's change, which carries
 * none), under Panki AI proposes in the accent, as a diff of the value it holds where it holds one, what goes struck in
 * the accent, and all green where it was empty. `held` is what the field holds now, as it's drawn (the drawer's live value).
 */
export function fieldShown(verdict: FieldVerdict, held: string, ways: Ways): Shown | null {
  if (verdict.kind === "error") return errorShown(verdict);
  if (verdict.kind === "good") return nothingShown(verdict.why);
  if (!ways.waiting) return null;
  const proposal = (tone: Exclude<Tone, "good">, title: string): Shown => ({
    tone,
    diff: <TextDiff held={held} proposed={verdict.proposed} out={tone} />,
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
        judgement: row.judgement,
      }),
    ),
    ...(part.proposed ? [{ name: `Proposed ${name.toLowerCase()} ${meanings.length + 1}`, tag: tagOf("accent", TOUCH_UP_WORDS.proposes), value: part.proposed, reason: "" }] : []),
  ];
}

/**
 * What Details say each part of an answer came to, by the key's name and Panki's verdict on it, the drawer's own: for
 * the Meaning, the verdict and every meaning judged (`meaningVerdicts`); for a text field, its verdict as a tag, the value
 * proposed, and the why. An answer that broke its message's Requires or Leave out failed whole and has no verdicts: its
 * Log says why. `meanings` is the dictionary's meanings sent, in `{Meaning}`'s order; `now` the card as it was sent, the
 * Meaning's custom meanings read off it.
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
