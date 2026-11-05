import { useEffect, useId, useRef, useState } from "react";
import {
  APP_LANGUAGES,
  DEFAULT_PANKI_AI,
  PIECE_MAX,
  TRANSCRIBE_LANGUAGES,
  answeredCall,
  ACCURACY_NAMES,
  defaultTemplateOf,
  failedCall,
  firstStarterOf,
  meaningsPiece,
  startCall,
  templateById,
  templatesOf,
  type AiCall,
  type AiRunWhy,
  type AiTemplate,
  type AiVerdict,
  type ExplainMessage,
  type MeaningAccuracy,
  type PankiAi,
  type ProposedMeaning,
  type PromptGaps,
  type PromptPieceId,
  type PromptPieces,
} from "@panki/contracts";
import { AiStatus } from "@web/components/AiStatus";
import { AiSpark } from "@web/components/AiWaiting";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import type { ExampleAnswer } from "@web/explainers/examples";
import type { Pointed } from "../capture/look";
import { sentenceAround } from "../capture/selection";
import type { Found } from "../dictionary/found";
import { dictionaryPieces } from "../dictionary/pieces";
import { askAiState, askExplain, type AiShown } from "../messages";
import { AnswerText, FollowUp, RUN_WORDS, RunAsk, TemplateMenu, ceilingOf, questionProblem, useAskFirst, whyNot } from "@web/components/AiRun";
import { glossaryText } from "./Glossary";

/**
 * Explain, a part of the pop-up's layout (AI step 2, the owner's preview of 2026-10-30): Panki AI saying what the word
 * shown means where it was pointed at. On a press (or by itself once the pop-up is kept open, with Explain as the
 * pop-up opens on), the word, what the dictionaries say of it, its sentence and, on a video, what's around it go to
 * Panki through the worker; the answer stands under the spark as plain paragraphs, and a follow-up can be asked under
 * it, the conversation so far going with it. Before it runs, it says the most it can cost, and over the account's Ask
 * before a run over it asks first (AI step 5). The button runs the account's default template; the arrow beside it
 * every other, each starting a fresh conversation. Nothing is kept: the conversation is this component's, and the
 * pop-up closing, or another word shown, forgets it.
 */

/** What this says, one home. */
const MESSAGES = {
  go: "Explain",
  signedOut: "Sign in to Panki to explain.",
  /** Panki's own note under an answer the provider stopped at Max answer length: never the AI's words. */
  cut: "Cut short at the answer limit.",
  /** An answer with nothing in it: the provider's failure, as good as. */
  nothing: "Panki AI gave no answer.",
  /** Nothing in it and cut at Max answer length: the model's thinking took all of it (it did, on the owner's first try). */
  used: "Panki AI reached the answer limit before it wrote anything. Max answer length is in Admin → Panki AI → Limits.",
  /**
   * Panki's own note when the answer judges none of the dictionary's meanings to fit and proposes none (one from a
   * Panki from before): outside the answer, never the AI's words.
   */
  noneFits: "None of the dictionary's meanings fits here.",
};
/**
 * What Details say an answer came to: its words (the explanation, or a plain template's and a follow-up's answer), then
 * every meaning as it judged it, in the list's order (its number, its accuracy, the dictionary's words and name, the
 * reason), drawn in the accuracy's look as the pop-up draws it, and the meaning it proposed when it proposed one,
 * numbered after them as the pop-up numbers it. A follow-up that left the verdicts standing has no rows.
 */
const explainVerdicts = (found: Found, { text, meanings, proposedMeaning }: Pick<Answered, "text" | "meanings" | "proposedMeaning">, name: string): AiVerdict[] => [
  { name, tag: null, value: text, reason: "" },
  ...meanings.map((row): AiVerdict => {
    const sense = found.senses[row.meaning - 1];
    return {
      name: `Meaning ${row.meaning}`,
      tag: { words: ACCURACY_NAMES[row.accuracy], look: row.accuracy === "fits" ? "good" : row.accuracy === "close" ? "flag" : "muted" },
      value: sense ? `${glossaryText(sense.glossary)} · ${sense.dict}` : "",
      reason: row.reason,
      accuracy: row.accuracy,
    };
  }),
  ...(proposedMeaning !== null
    ? [
        {
          name: `Proposed meaning ${found.senses.length + 1}`,
          tag: { words: ACCURACY_NAMES.fits, look: "good" as const },
          value: proposedMeaning.meaning,
          reason: proposedMeaning.reason,
          accuracy: "fits" as const,
        },
      ]
    : []),
];
/** Whether two answers judged every meaning the same and proposed the same meaning: a follow-up's note that none fits is said again only when it changed. */
const sameJudging = (a: Pick<Answered, "meanings" | "proposedMeaning">, b: Pick<Answered, "meanings" | "proposedMeaning">) =>
  a.proposedMeaning?.meaning === b.proposedMeaning?.meaning &&
  a.meanings.length === b.meanings.length &&
  a.meanings.every((row, i) => row.meaning === b.meanings[i]?.meaning && row.accuracy === b.meanings[i]?.accuracy);

/** The limits that shape what's read off a video for a prompt (Admin → Panki AI → Limits). */
export type PieceLimits = Pick<PankiAi, "aiSurroundingSeconds" | "aiMaxDescriptionChars">;
/** What the page knows besides the pop-up: on a video, its metadata, the subtitles around the moment and its description. */
export type MorePieces = (pointed: Pointed, limits: PieceLimits) => PromptPieces;

/** Explain on the options page (the made-up answers are the web's `explainers/examples.ts`): made-up answers, drawn as an answer is, answering no press, never asking anyone. */
export type ExplainExamples = { kind: "example"; answers: readonly ExampleAnswer[] };
/**
 * Explain on a page: Panki AI through the worker, about the word pointed at, run by its button alone (Explain as the
 * pop-up opens went at the owner's word, 2026-11-02: running by itself is AI step 7's). `more` is what the page adds (a video's).
 */
export type ExplainLive = { kind: "panki"; pointed: Pointed; more: MorePieces | null };
export type ExplainSource = ExplainExamples | ExplainLive;

/**
 * An answer: its words, how it judged each meaning (one row for each, in the list's order; none from a template that
 * doesn't judge, nor from a follow-up that left them standing), the meaning it proposes when none fits, whether it
 * judged them at all (`judged`: a first answer with rows, a follow-up that judged again), whether it was cut short, the
 * answer exactly as it came back (its JSON), which is what goes back with a follow-up (the model reads its own turn as
 * it wrote it), and for a follow-up its Follow-up prompt as Panki filled and sent it (`asked`), which goes back too.
 */
type Answered = { text: string; meanings: readonly MeaningAccuracy[]; proposedMeaning: ProposedMeaning | null; judged: boolean; cut: boolean; raw: string; asked: string };
/** What's sent, read once: the pieces, why each empty one is empty, and every meaning in the order `{Meaning}` indexes them. */
type Read = { pieces: PromptPieces; gaps: PromptGaps; meanings: string[] };
/** One exchange: the question (none for the first, the word itself), then its answer, or why there's none. */
type Turn = { question: string | null; answer: Answered | null; failure: { message: string; retry: boolean } | null };

/**
 * What Explain sends: the word as it stands on the page, every kind of the dictionary's data (every meaning of the
 * dictionaries that are on, numbered), the sentence it was pointed at in, and what the page adds. Each cut to the most
 * a piece can be as it's sent; the server cuts each to its own limit.
 */
function piecesOf(found: Found, pointed: Pointed, more: MorePieces | null, limits: PieceLimits, languages: Pick<PromptPieces, "learningLanguage" | "language">): Read {
  const context = pointed.context;
  const sentence = context ? sentenceAround(context.text, context.at, context.at + found.source.length).sentence : "";
  const video = more?.(pointed, limits) ?? {};
  // Every meaning as the server lists them (`meaningsPiece`), so the index an answer names is this list's.
  const meanings = found.senses.map((sense) => glossaryText(sense.glossary));
  // The account's two languages, as Panki says them (the server puts its own in, the same, whatever this sends).
  const all: PromptPieces = { word: found.source, ...dictionaryPieces(found, found.senses, true), dictMeaning: meaningsPiece(meanings), sentence, ...video, ...languages };
  const pieces: PromptPieces = Object.fromEntries(Object.entries(all).flatMap(([id, text]) => (text?.trim() ? [[id, text.slice(0, PIECE_MAX)]] : [])));
  return { pieces, gaps: gapsOf(pieces, video.source !== undefined), meanings };
}

const VIDEO_PIECES: readonly PromptPieceId[] = ["source", "surrounding", "description"];
const DICTIONARY_PIECES: readonly PromptPieceId[] = ["dictForm", "dictReading", "dictMeaning", "dictTags", "dictWordType", "dictFrequency", "dictPitch"];
/** Why each piece went empty, for Details: off a video a video's piece isn't there to have; the rest, when they're empty, say why as far as the page knows. Touch up's too. */
export function gapsOf(pieces: PromptPieces, onVideo: boolean): PromptGaps {
  const gaps: PromptGaps = {};
  for (const id of VIDEO_PIECES) if (!pieces[id]) gaps[id] = !onVideo ? "notVideo" : id === "surrounding" ? "noSubtitles" : "empty";
  for (const id of DICTIONARY_PIECES) if (!pieces[id]) gaps[id] = "notInDictionaries";
  return gaps;
}

const PRESSED: AiRunWhy = { kind: "pressed", action: MESSAGES.go };

/**
 * The conversation so far, as it was sent (`Said`): the first answer, then each follow-up as its Follow-up prompt went
 * and its answer, in turn, ending with an answer. The new question isn't in it: it goes as `asking`.
 */
function saidOf(turns: readonly Turn[]): ExplainMessage[] {
  const said: ExplainMessage[] = [];
  for (const turn of turns) {
    if (!turn.answer) continue;
    if (turn.question !== null) said.push({ role: "user", text: turn.answer.asked || turn.question });
    said.push({ role: "assistant", text: turn.answer.raw || turn.answer.text });
  }
  return said;
}

/**
 * An answer, as plain paragraphs (nothing the model writes reaches the page as markup), rising in as it lands. How it
 * judged each meaning, and the meaning it proposes when none fits, are drawn on the pop-up's own meanings, where they
 * stand (`Judged`); under the answer, only Panki's own notes: that none fits, from a Panki from before that proposed
 * none (said again for a follow-up only when it judged them differently, `before`), and that it was cut short at Max
 * answer length.
 */
function Answer({ answer, before }: { answer: Answered; before: Answered | null }) {
  const judged = answer.judged && answer.meanings.length > 0 && (before === null || !sameJudging(answer, before));
  return (
    <>
      <AnswerText text={answer.text} />
      {judged && answer.proposedMeaning === null && !answer.meanings.some((row) => row.accuracy === "fits") ? (
        <p className="ai-explain-cut">
          <Icon name="info" />
          {MESSAGES.noneFits}
        </p>
      ) : null}
      {answer.cut ? (
        <p className="ai-explain-cut">
          <Icon name="info" />
          {MESSAGES.cut}
        </p>
      ) : null}
    </>
  );
}

/** Explain's own button: the spark and the name of the template it runs ("Explain", "Grammar"). */
function ExplainButton({ name, disabled, onPress }: { name: string; disabled: boolean; onPress: () => void }) {
  return (
    <Button className="ai-explain-button" disabled={disabled} onClick={onPress}>
      <AiSpark />
      {name}
    </Button>
  );
}

/** Where a run's question is asked: under the button for a first ask, after the conversation for a follow-up. */
type Where = "start" | "end";

/** Explain as a page has it: Panki AI asked through the worker. */
function LiveExplain({ found, source, onJudged }: { found: Found; source: ExplainLive; onJudged: Judged }) {
  const id = useId();
  /** Panki AI as the worker keeps it: unknown until it answers; null signed out; or why it couldn't be told. */
  const [ai, setAi] = useState<{ known: false } | { known: true; ai: AiShown | null; failure: string | null }>({ known: false });
  /** What's sent, read once as Panki AI is first told: the word as it was pointed at, whatever the video does since. */
  const [read, setRead] = useState<Read | null>(null);
  const pieces = read?.pieces ?? null;
  /** The template the conversation runs, its first ask's: its follow-ups go by its Follow-up prompt. */
  const [template, setTemplate] = useState<AiTemplate | null>(null);
  /** The template picked from the menu in this pop-up, by its id: the button's from then on, the account's default untouched. */
  const [chosen, setChosen] = useState<string | null>(null);
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  /** Every call this Explain made, oldest first, as the AI's status tells of them: never sent, gone with the pop-up. */
  const [calls, setCalls] = useState<readonly AiCall[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionError, setQuestionError] = useState<string | undefined>(undefined);
  /** The presses that made a call (Explain, Ask, Try again): the head's spark blinks once for each, where the button was. */
  const [burst, setBurst] = useState(0);
  const gate = useAskFirst();
  /** A call on its way: a second press waits for it. */
  const running = useRef(false);
  /** How many first asks each template has had here: its calls named "Grammar", then "Grammar 2". */
  const ran = useRef(new Map<string, number>());
  const alive = useRef(true);
  const latest = useRef<HTMLDivElement>(null);

  // The meanings lit as the latest answer that judged them did; none until one has, nor once a conversation begins afresh.
  useEffect(() => {
    const latest = turns.filter((turn) => turn.answer?.judged).at(-1)?.answer;
    onJudged({ meanings: latest?.meanings ?? [], proposed: latest?.proposedMeaning ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

  const readAi = async (fresh = false) => {
    const answer = await askAiState(fresh);
    if (!alive.current) return null;
    setAi(answer.ok ? { known: true, ai: answer.ai, failure: null } : { known: true, ai: null, failure: answer.message });
    return answer.ok ? answer.ai : null;
  };
  useEffect(() => {
    alive.current = true;
    void readAi().then((shown) => {
      if (shown && alive.current) setRead(piecesOf(found, source.pointed, source.more, shown.settings, { learningLanguage: TRANSCRIBE_LANGUAGES[shown.learningLanguage], language: APP_LANGUAGES[shown.language] }));
    });
    return () => {
      alive.current = false;
    };
    // Once, as the pop-up opens on this word: it's keyed by the word, so another word is another Explain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = ai.known ? ai.ai : null;
  const settings = shown?.settings ?? null;
  const canRun = settings !== null && settings.aiOn && shown?.key !== null && pieces !== null;
  /** Why it can't run, beside the greyed button (`whyNot`, Touch up's too: Panki AI off among them). */
  const reason = ai.known ? whyNot(true, shown, ai.failure, MESSAGES.signedOut) : null;
  const own = shown?.templates ?? [];
  /** The account's default Explain template: what this pop-up opens on. */
  const preferred = defaultTemplateOf("explain", shown?.defaults ?? {}, own);
  /** What the button runs, and says: the one picked from the menu in this pop-up, else the default; never kept anywhere. */
  const picked = chosen ? templateById(chosen, own) : null;
  const current = picked && picked.action === "explain" ? picked : preferred;
  /** The most a run can cost at the model's listed prices: a template's first ask, or a follow-up with the conversation so far. */
  const ceiling = (run: AiTemplate, asked: string | null, before: readonly Turn[]) =>
    settings && pieces ? ceilingOf(settings, run, pieces, asked === null ? [] : saidOf(before), asked === null ? {} : { question: asked }, settings.aiMaxAnswerTokens) : 0;
  const costOf = (run: AiTemplate, asked: string | null, before: readonly Turn[]) => (canRun && shown ? RUN_WORDS.upTo(ceiling(run, asked, before), shown.showCostOverMicros) : null);

  async function run(using: AiTemplate, asked: string | null, before: readonly Turn[], why: AiRunWhy) {
    if (!read || !settings || running.current) return;
    running.current = true;
    setBurst((was) => was + 1);
    // A first ask begins afresh; a follow-up goes on from the answers so far, what failed before it let go.
    const kept = asked === null ? [] : before.filter((turn) => turn.answer !== null);
    const pending: Turn = { question: asked, answer: null, failure: null };
    const said = saidOf(kept);
    const asking = asked === null ? undefined : { question: asked };
    // A first ask is named by its template, numbered when it ran here before; each question after it a follow-up, numbered as they're asked.
    let label = `Follow-up ${kept.length}`;
    if (asked === null) {
      const times = (ran.current.get(using.id) ?? 0) + 1;
      ran.current.set(using.id, times);
      label = times === 1 ? using.name : `${using.name} ${times}`;
      setTemplate(using);
    }
    const call = startCall({ label, why, settings, template: using, pieces: read.pieces, gaps: read.gaps, said, asking, now: Date.now() });
    setTurns([...kept, pending]);
    setCalls((was) => [...was, call]);
    setBusy(true);
    const answer = await askExplain({ templateId: using.id, pieces: read.pieces, meanings: read.meanings, said, asking });
    running.current = false;
    if (!alive.current) return;
    const empty = answer.ok && answer.explain.text.trim() === "" ? (answer.explain.cut ? MESSAGES.used : MESSAGES.nothing) : null;
    const answered = (): Turn => {
      if (!answer.ok) return { ...pending, failure: { message: answer.message, retry: answer.problem === "provider" } };
      if (empty !== null) return { ...pending, failure: { message: empty, retry: true } };
      const { text, meanings, proposedMeaning, cut, raw, judgedAgain } = answer.explain;
      // A first answer judged them when it has rows; a follow-up only when it says it judged them again.
      const judged = asked === null ? meanings.length > 0 || proposedMeaning !== null : judgedAgain;
      return { ...pending, answer: { text, meanings, proposedMeaning, judged, cut, raw, asked: answer.explain.asked } };
    };
    const done = answered();
    // An empty answer was still a call the provider billed: Details say what it took, and why there's nothing.
    const finished = answer.ok
      ? empty === null
        ? answeredCall(call, answer.explain, Date.now(), explainVerdicts(found, answer.explain, asked === null && using.judges ? "Explanation" : "Answer"))
        : failedCall(call, empty, Date.now())
      : failedCall(call, answer.message, Date.now(), answer.unread);
    setTurns([...kept, done]);
    setCalls((was) => was.map((each) => (each === call ? finished : each)));
    setBusy(false);
    // The worker keeps Panki AI as this answer said it stands: what's said beside Ask follows any change.
    void readAi();
  }

  /** A press: run at once, or ask first when it can cost more than the account's Ask before a run over (`then` once it goes). */
  function press(using: AiTemplate, asked: string | null, before: readonly Turn[], why: AiRunWhy, where: Where, then?: () => void) {
    if (!shown || !canRun) return;
    const micros = ceiling(using, asked, before);
    gate.press(shown.askOverMicros, where, micros, asked === null ? RUN_WORDS.runFor(using.name, micros) : RUN_WORDS.askFor(micros), () => {
      then?.();
      void run(using, asked, before, why);
    });
  }

  // A new question and its wait come into view inside the pop-up, which scrolls; nothing outside it moves.
  useEffect(() => {
    const turn = latest.current;
    const box = turn?.closest(".look");
    if (!turn || !(box instanceof HTMLElement)) return;
    const room = box.getBoundingClientRect();
    const at = turn.getBoundingClientRect();
    if (at.bottom > room.bottom) box.scrollTop += Math.max(0, Math.min(at.bottom - room.bottom, at.top - room.top));
  }, [turns.length]);

  function askMore() {
    const text = question.trim();
    const problem = settings ? questionProblem(text, settings.aiMaxQuestionChars) : null;
    if (problem !== null) {
      setQuestionError(problem);
      return;
    }
    if (!template) return;
    setQuestionError(undefined);
    // The question stays in its box until it's really sent: a question asked first and cancelled keeps it.
    press(template, text, turns, { kind: "followUp" }, "end", () => setQuestion(""));
  }

  const rows = templatesOf("explain", own).map((each) => ({ template: each, cost: costOf(each, null, []) }));
  // The button keeps its place once it has run (every action's rule 14: run again at will), a press starting afresh.
  const start = (
    <div className="ai-explain-start">
      <TemplateMenu
        id={id}
        rows={rows}
        defaultId={preferred.id}
        chosenId={current.id}
        disabled={!canRun || busy}
        onPick={(picked) => {
          setChosen(picked.id);
          press(picked, null, [], { kind: "pressed", action: picked.name }, "start");
        }}
        onOpen={() => void readAi(true)}
      >
        <ExplainButton name={current.name} disabled={!canRun || busy} onPress={() => press(current, null, [], { kind: "pressed", action: current.name }, "start")} />
      </TemplateMenu>
      {busy ? null : (reason ?? costOf(current, null, [])) ? <span className="btn-beside">{reason ?? costOf(current, null, [])}</span> : null}
    </div>
  );
  const runAsk = (where: Where) => <RunAsk id={`${id}-${where}`} asked={gate.at(where)} onCancel={gate.cancel} />;

  if (turns.length === 0) {
    return (
      <section className="ai-explain" aria-label="Panki AI">
        {start}
        {runAsk("start")}
      </section>
    );
  }

  const answered = turns.filter((turn) => turn.answer !== null).length;
  // The first answer isn't a follow-up; what's left of Max follow-ups is.
  const left = settings ? settings.aiMaxFollowUps - Math.max(0, answered - 1) : 0;
  const asked = question.trim();
  return (
    <section className="ai-explain" aria-label="Panki AI" aria-busy={busy}>
      {start}
      {runAsk("start")}
      <AiStatus calls={calls} burst={burst} />
      {/* A turn on its way is its question alone, or nothing: the head's turning spark and Thinking are the wait (the owner, 2026-10-31). */}
      {turns.map((turn, i) =>
        turn.question === null && !turn.answer && !turn.failure ? null : (
        <div key={i} ref={i === turns.length - 1 ? latest : undefined} className="ai-explain-turn">
          {turn.question !== null ? <p className="ai-explain-question">{turn.question}</p> : null}
          {turn.answer ? (
            <Answer answer={turn.answer} before={turns.slice(0, i).filter((each) => each.answer?.judged).at(-1)?.answer ?? null} />
          ) : turn.failure ? (
            <div className="ai-explain-failure">
              <p className="form-failure" role="alert">
                {turn.failure.message}
              </p>
              {turn.failure.retry && template ? (
                <Button className="ai-explain-button" disabled={!canRun || busy} onClick={() => press(template, turn.question, turns.slice(0, i), { kind: "retry" }, "end")}>
                  <AiSpark />
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        ),
      )}
      {runAsk("end")}
      {!busy && answered > 0 && left > 0 && template ? (
        <FollowUp
          id={id}
          value={question}
          error={questionError}
          disabled={!canRun}
          beside={reason ?? costOf(template, asked, turns)}
          onChange={(text) => {
            setQuestion(text);
            setQuestionError(undefined);
          }}
          onAsk={askMore}
        />
      ) : null}
    </section>
  );
}

const nothing = () => undefined;

/**
 * Explain on the options page: the made-up answer for the word shown, drawn as an answer is, with its follow-up under
 * it; for a word with none, the button alone. Nothing in it answers a press, and nothing is ever asked: the head's
 * template is Panki's own Explain.
 */
function ExampleExplain({ found, answers, onJudged }: { found: Found; answers: readonly ExampleAnswer[]; onJudged: Judged }) {
  const id = useId();
  const answer = answers.find((example) => example.term === found.term);
  // Only the meanings this browser's dictionaries have for the word.
  const meanings = answer?.meanings.filter((row) => found.senses[row.meaning - 1] !== undefined) ?? [];
  useEffect(() => {
    onJudged({ meanings, proposed: answer?.proposedMeaning ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);
  const start = (
    <div className="ai-explain-start">
      <span className="ai-split">
        <ExplainButton name={firstStarterOf("explain").name} disabled={false} onPress={nothing} />
        <Button className="ai-explain-button ai-split-arrow" aria-label={RUN_WORDS.templates}>
          <Icon name="down" />
        </Button>
      </span>
    </div>
  );
  if (!answer) {
    return (
      <section className="ai-explain" aria-label="Panki AI" inert>
        {start}
      </section>
    );
  }
  // The head as an answered call has it, made of Panki's defaults and nothing measured: inert, its Details never open.
  const call = answeredCall(
    startCall({ label: MESSAGES.go, why: PRESSED, settings: DEFAULT_PANKI_AI, template: firstStarterOf("explain"), pieces: { dictForm: found.term, learningLanguage: TRANSCRIBE_LANGUAGES.jpn, language: APP_LANGUAGES.eng }, said: [], now: 0 }),
    { inputTokens: 0, outputTokens: 0, costMicros: 0, cut: false },
    0,
  );
  return (
    <section className="ai-explain" aria-label="Panki AI" inert>
      {start}
      <AiStatus calls={[call]} />
      <div className="ai-explain-turn">
        <Answer answer={{ text: answer.text, meanings, proposedMeaning: answer.proposedMeaning, judged: true, cut: false, raw: "", asked: "" }} before={null} />
      </div>
      <FollowUp id={id} value="" disabled={false} beside={null} onChange={nothing} onAsk={nothing} />
    </section>
  );
}

/**
 * How Explain's latest answer judged the meanings, and the meaning it proposed when none fits (none of either before it
 * has answered, or once it's begun afresh): the pop-up lights its own meaning rows by it and draws the proposed one as
 * one more row after them (`Lookup.tsx` → `SenseRow`, `ProposedRow`).
 */
export type Judgement = { meanings: readonly MeaningAccuracy[]; proposed: ProposedMeaning | null };
export type Judged = (judgement: Judgement) => void;

/** Explain for the word shown in the pop-up: asking Panki AI on a page, the made-up answers on the options page. */
export function Explain({ found, source, onJudged }: { found: Found; source: ExplainSource; onJudged: Judged }) {
  return source.kind === "example" ? <ExampleExplain found={found} answers={source.answers} onJudged={onJudged} /> : <LiveExplain found={found} source={source} onJudged={onJudged} />;
}
