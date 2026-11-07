import { useEffect, useId, useRef, useState } from "react";
import {
  APP_LANGUAGES,
  DEFAULT_PANKI_AI,
  NO_CONVERSATION,
  PIECE_MAX,
  TRANSCRIBE_LANGUAGES,
  answeredCall,
  ACCURACY_NAMES,
  commit,
  defaultTemplateOf,
  failedCall,
  firstStarterOf,
  historyOf,
  meaningsPiece,
  startCall,
  startConversation,
  templateById,
  templatesOf,
  type AiCall,
  type AiRunWhy,
  type AiTemplate,
  type AiVerdict,
  type Commit,
  type Conversation,
  type MeaningAccuracy,
  type PankiAi,
  type ProposedMeaning,
  type PromptGaps,
  type PromptPieceId,
  type PromptPieces,
} from "@panki/contracts";
import { AiConversation, type Asking, type ConversationOf, type Failure } from "@web/components/AiConversation";
import { AiSpark } from "@web/components/AiWaiting";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { meaningsChip } from "@web/components/JudgedRow";
import type { ExampleAnswer } from "@web/explainers/examples";
import type { Pointed } from "../capture/look";
import { sentenceAround } from "../capture/selection";
import type { Found } from "../dictionary/found";
import { dictionaryPieces } from "../dictionary/pieces";
import { askAiState, askExplain, type AiShown } from "../messages";
import { RUN_WORDS, RunAsk, TemplateMenu, ceilingOf, questionProblem, useAskFirst, whyNot } from "@web/components/AiRun";
import { glossaryText } from "./Glossary";

/**
 * Explain, a part of the pop-up's layout: Panki AI saying what the word shown means where it was pointed at. On a
 * press, the word, what the dictionaries say of it, its sentence and, on a video, what's around it go to Panki through
 * the worker. Its run is drawn as every action's is (`AiConversation`, main alone: Explain has no branches): the run as
 * its press, the answer as plain paragraphs, "Changed: Meanings" when it judged them (the pop-up's own rows lit, the
 * chip going to them), each follow-up a commit, the next folded at the foot. Before it runs, it says the most it can
 * cost, and over the account's Ask before a run over it asks first (AI step 5). The button runs the account's default
 * template; the arrow beside it every other, each starting a fresh conversation. Nothing is kept: the conversation is
 * this component's, and the pop-up closing, or another word shown, forgets it.
 */

/** What this says, one home. */
const MESSAGES = {
  go: "Explain",
  signedOut: "Sign in to Panki to explain.",
  /** Panki's own note under an answer the provider stopped at Max answer length: never the AI's words. */
  cut: "Cut short at the answer limit.",
  /** An answer with nothing in it: the provider's failure, as good as. */
  nothing: "Panki AI gave no answer.",
  /** Nothing in it and cut at Max answer length: the model's thinking took all of it. */
  used: "Panki AI reached the answer limit before it wrote anything. Max answer length is in Admin → Panki AI → Limits.",
  /**
   * Panki's own note when the answer judges none of the dictionary's meanings to fit and proposes none (one from a
   * Panki from before): outside the answer, never the AI's words.
   */
  noneFits: "None of the dictionary's meanings fits here.",
};

/** What an answer changed: the meanings, judged (one row each, in the list's order), and the meaning it proposes when none fits. */
type Judging = { meanings: readonly MeaningAccuracy[]; proposed: ProposedMeaning | null };

/**
 * What Details say an answer came to: its words (the explanation, or a plain template's and a follow-up's answer), then
 * every meaning as it judged it, in the list's order (its number, its accuracy, the dictionary's words and name, the
 * reason), drawn in the accuracy's look as the pop-up draws it, and the meaning it proposed when it proposed one,
 * numbered after them as the pop-up numbers it. A follow-up that left the verdicts standing has no rows.
 */
const explainVerdicts = (found: Found, { text, meanings, proposedMeaning }: { text: string; meanings: readonly MeaningAccuracy[]; proposedMeaning: ProposedMeaning | null }, name: string): AiVerdict[] => [
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
const sameJudging = (a: Judging, b: Judging) =>
  a.proposed?.meaning === b.proposed?.meaning && a.meanings.length === b.meanings.length && a.meanings.every((row, i) => row.meaning === b.meanings[i]?.meaning && row.accuracy === b.meanings[i]?.accuracy);

/** The latest answer on main that judged the meanings, before `id` when given: what the pop-up's rows are lit by. */
const judgingBefore = (conversation: Conversation<Judging>, id?: number): Commit<Judging> | undefined =>
  conversation.main.filter((each) => each.changed.length > 0 && (id === undefined || each.id < id)).at(-1);

/**
 * Panki's own notes under an answer, never the AI's words: that none of the meanings fits, from a Panki from before that
 * proposed none (said again for a follow-up only when it judged them differently), and that it was cut short at Max
 * answer length.
 */
function notesOf(made: Commit<Judging>, conversation: Conversation<Judging>) {
  const judging = made.changed[0];
  const before = judgingBefore(conversation, made.id)?.changed[0];
  const noneFits = judging && judging.meanings.length > 0 && judging.proposed === null && !judging.meanings.some((row) => row.accuracy === "fits") && (!before || !sameJudging(judging, before));
  return (
    <>
      {noneFits ? (
        <p className="ai-explain-cut">
          <Icon name="info" />
          {MESSAGES.noneFits}
        </p>
      ) : null}
      {made.cut ? (
        <p className="ai-explain-cut">
          <Icon name="info" />
          {MESSAGES.cut}
        </p>
      ) : null}
    </>
  );
}

/** The pop-up brought to the word's meanings, lit where they stand: an answer's "Meanings" chip pressed. */
function goToMeanings(from: HTMLElement | null) {
  const scroller = from?.closest(".look");
  const meanings = from?.closest(".look-word")?.querySelector(".look-dict, .look-proposed");
  if (!(scroller instanceof HTMLElement) || !(meanings instanceof HTMLElement)) return;
  const by = meanings.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
  scroller.scrollBy({ top: by, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

/** The limits that shape what's read off a video for a prompt (Admin → Panki AI → Limits). */
export type PieceLimits = Pick<PankiAi, "aiSurroundingSeconds" | "aiMaxDescriptionChars">;
/** What the page knows besides the pop-up: on a video, its metadata, the subtitles around the moment and its description. */
export type MorePieces = (pointed: Pointed, limits: PieceLimits) => PromptPieces;

/** Explain on the options page (the made-up answers are the web's `explainers/examples.ts`): made-up answers, drawn as an answer is, answering no press, never asking anyone. */
export type ExplainExamples = { kind: "example"; answers: readonly ExampleAnswer[] };
/**
 * Explain on a page: Panki AI through the worker, about the word pointed at, run by its button alone (running by
 * itself is AI step 7's). `more` is what the page adds (a video's).
 */
export type ExplainLive = { kind: "panki"; pointed: Pointed; more: MorePieces | null };
export type ExplainSource = ExplainExamples | ExplainLive;

/** What's sent, read once: the pieces, why each empty one is empty, and every meaning in the order `{Meaning}` indexes them. */
type Read = { pieces: PromptPieces; gaps: PromptGaps; meanings: string[] };

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

/** Explain's own button: the spark and the name of the template it runs ("Explain", "Grammar"). */
function ExplainButton({ name, disabled, onPress }: { name: string; disabled: boolean; onPress: () => void }) {
  return (
    <Button className="ai-explain-button" disabled={disabled} onClick={onPress}>
      <AiSpark />
      {name}
    </Button>
  );
}

/** Where a run's question is asked: under the button for a first ask, at the conversation's foot for a follow-up and Try again. */
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
  /** Main alone: the run's commit, then each follow-up's. */
  const [conversation, setConversation] = useState<Conversation<Judging>>(NO_CONVERSATION);
  /** The question on its way, or the follow-up that last failed (with Try again), until the next is asked. */
  const [asking, setAsking] = useState<Asking | null>(null);
  /** Why the run gave no answer: a follow-up's failure is its own question's. */
  const [failure, setFailure] = useState<Failure | null>(null);
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
  /** Each question's id, rising. */
  const ids = useRef(0);
  const alive = useRef(true);
  const box = useRef<HTMLElement>(null);

  // The meanings lit as the latest answer that judged them did; none until one has, nor once a conversation begins afresh.
  useEffect(() => {
    const latest = judgingBefore(conversation)?.changed[0];
    onJudged({ meanings: latest?.meanings ?? [], proposed: latest?.proposed ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation]);

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
  const ceiling = (run: AiTemplate, asked: string | null, before: Conversation<Judging>) =>
    settings && pieces ? ceilingOf(settings, run, pieces, asked === null ? [] : historyOf(before, null), asked === null ? {} : { question: asked }, settings.aiMaxAnswerTokens) : 0;
  const costOf = (run: AiTemplate, asked: string | null, before: Conversation<Judging>) => (canRun && shown ? RUN_WORDS.upTo(ceiling(run, asked, before), shown.showCostOverMicros) : null);

  async function run(using: AiTemplate, asked: string | null, why: AiRunWhy) {
    if (!read || !settings || running.current) return;
    running.current = true;
    setBurst((was) => was + 1);
    // A first ask begins afresh; a follow-up goes on from main as it stands, a failed question before it let go.
    const before: Conversation<Judging> = asked === null ? NO_CONVERSATION : conversation;
    const said = historyOf(before, null);
    const asking = asked === null ? undefined : { question: asked };
    // A first ask is named by its template, numbered when it ran here before; each question after it a follow-up, numbered as they're asked.
    let label = `Follow-up ${before.main.length}`;
    if (asked === null) {
      const times = (ran.current.get(using.id) ?? 0) + 1;
      ran.current.set(using.id, times);
      label = times === 1 ? using.name : `${using.name} ${times}`;
      setTemplate(using);
    }
    const pending: Asking = { id: ++ids.current, run: asked === null ? using.name : null, field: null, question: asked ?? "", failure: null };
    const call = startCall({ label, why, settings, template: using, pieces: read.pieces, gaps: read.gaps, said, asking, now: Date.now() });
    setConversation(before);
    setAsking(pending);
    setFailure(null);
    setCalls((was) => [...was, call]);
    setBusy(true);
    const answer = await askExplain({ templateId: using.id, pieces: read.pieces, meanings: read.meanings, said, asking });
    running.current = false;
    if (!alive.current) return;
    const empty = answer.ok && answer.explain.text.trim() === "" ? (answer.explain.cut ? MESSAGES.used : MESSAGES.nothing) : null;
    // An empty answer was still a call the provider billed: Details say what it took, and why there's nothing.
    const finished = answer.ok
      ? empty === null
        ? answeredCall(call, answer.explain, Date.now(), explainVerdicts(found, answer.explain, asked === null && using.judges ? "Explanation" : "Answer"))
        : failedCall(call, empty, Date.now())
      : failedCall(call, answer.message, Date.now(), answer.unread);
    setCalls((was) => was.map((each) => (each === call ? finished : each)));
    setBusy(false);
    if (!answer.ok || empty !== null) {
      const failed: Failure = answer.ok ? { message: empty ?? MESSAGES.nothing, retry: true } : { message: answer.message, retry: answer.problem === "provider" };
      // A run that failed has no commit: the head says why, with Try again. A follow-up's stands as its question, with its own.
      if (asked === null) {
        setAsking(null);
        setFailure(failed);
      } else setAsking({ ...pending, failure: failed });
    } else {
      const { text, meanings, proposedMeaning, cut, raw, judgedAgain } = answer.explain;
      // A first answer judged them when it has rows; a follow-up only when it says it judged them again.
      const judged = asked === null ? meanings.length > 0 || proposedMeaning !== null : judgedAgain;
      setConversation(
        commit(before, null, {
          id: pending.id,
          run: pending.run,
          field: null,
          question: pending.question,
          reply: text,
          // The model reads its own turn back as it wrote it (its JSON); a follow-up's question as its Follow-up prompt went.
          said: [...(asked === null ? [] : [{ role: "user" as const, text: answer.explain.asked || asked }]), { role: "assistant", text: raw || text }],
          changed: judged ? [{ meanings, proposed: proposedMeaning }] : [],
          cut,
        }),
      );
      setAsking(null);
    }
    // The worker keeps Panki AI as this answer said it stands: what's said beside Ask follows any change.
    void readAi();
  }

  /** A press: run at once, or ask first when it can cost more than the account's Ask before a run over (`then` once it goes). */
  function press(using: AiTemplate, asked: string | null, why: AiRunWhy, where: Where, then?: () => void) {
    if (!shown || !canRun) return;
    const micros = ceiling(using, asked, conversation);
    gate.press(shown.askOverMicros, where, micros, asked === null ? RUN_WORDS.runFor(using.name, micros) : RUN_WORDS.askFor(micros), () => {
      then?.();
      void run(using, asked, why);
    });
  }

  // A new question and its wait come into view inside the pop-up, which scrolls; nothing outside it moves.
  useEffect(() => {
    const turn = [...(box.current?.querySelectorAll(".ai-explain-turn") ?? [])].at(-1);
    const scroller = turn?.closest(".look");
    if (!turn || !(scroller instanceof HTMLElement)) return;
    const room = scroller.getBoundingClientRect();
    const at = turn.getBoundingClientRect();
    if (at.bottom > room.bottom) scroller.scrollTop += Math.max(0, Math.min(at.bottom - room.bottom, at.top - room.top));
  }, [conversation.main.length, asking?.id]);

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
    press(template, text, { kind: "followUp" }, "end", () => setQuestion(""));
  }

  const rows = templatesOf("explain", own).map((each) => ({ template: each, cost: costOf(each, null, NO_CONVERSATION) }));
  // The button keeps its place once it has run (every action's rule 14: run again at will), a press starting afresh.
  const start = (
    <>
      <div className="ai-explain-start">
        <TemplateMenu
          id={id}
          rows={rows}
          defaultId={preferred.id}
          chosenId={current.id}
          disabled={!canRun || busy}
          onPick={(picked) => {
            setChosen(picked.id);
            press(picked, null, { kind: "pressed", action: picked.name }, "start");
          }}
          onOpen={() => void readAi(true)}
        >
          <ExplainButton name={current.name} disabled={!canRun || busy} onPress={() => press(current, null, { kind: "pressed", action: current.name }, "start")} />
        </TemplateMenu>
        {busy ? null : (reason ?? costOf(current, null, NO_CONVERSATION)) ? <span className="btn-beside">{reason ?? costOf(current, null, NO_CONVERSATION)}</span> : null}
      </div>
      <RunAsk id={`${id}-start`} asked={gate.at("start")} onCancel={gate.cancel} />
    </>
  );

  /** Explain's part of its conversation: what an answer changed (the meanings, judged), Panki's notes under it, the chip going to the meanings, Try again asking again. */
  const latestJudging = judgingBefore(conversation)?.id;
  const explainOf: ConversationOf<Judging> = {
    chips: (made) => {
      // A plain template's answers can't change anything: no line at all.
      if (!template?.judges) return null;
      const judging = made.changed[0];
      return judging ? [meaningsChip(judging.meanings, judging.proposed !== null, made.id === latestJudging ? "live" : "replaced")] : [];
    },
    notes: (made) => notesOf(made, conversation),
    canRun: canRun && !busy,
    onRetry: (failed) => {
      if (template) press(template, failed.question, { kind: "retry" }, "end");
    },
    onGo: () => goToMeanings(box.current),
  };
  // The first answer isn't a follow-up; what's left of Max follow-ups is.
  const left = settings ? settings.aiMaxFollowUps - Math.max(0, conversation.main.length - 1) : 0;
  const asked = question.trim();
  return (
    <AiConversation
      ref={box}
      calls={calls}
      burst={burst}
      busy={busy}
      before={start}
      failure={failure}
      onRunAgain={() => {
        if (template) press(template, null, { kind: "retry" }, "end");
      }}
      conversation={conversation}
      asking={asking}
      of={explainOf}
      foot={{
        id,
        asked: gate.at("end"),
        onCancel: gate.cancel,
        follow:
          !busy && conversation.main.length > 0 && left > 0 && template
            ? {
                value: question,
                error: questionError,
                disabled: !canRun,
                beside: reason ?? costOf(template, asked, conversation),
                onChange: (text) => {
                  setQuestion(text);
                  setQuestionError(undefined);
                },
                onAsk: askMore,
              }
            : null,
      }}
    />
  );
}

const nothing = () => undefined;

/**
 * Explain on the options page: the made-up answer for the word shown, drawn as a run is, with its follow-up under it;
 * for a word with none, the button alone. Nothing in it answers a press, and nothing is ever asked: the head's template
 * is Panki's own Explain.
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
  const starter = firstStarterOf("explain");
  const start = (
    <div className="ai-explain-start">
      <span className="ai-split">
        <ExplainButton name={starter.name} disabled={false} onPress={nothing} />
        <Button className="ai-explain-button ai-split-arrow" aria-label={RUN_WORDS.templates}>
          <Icon name="down" />
        </Button>
      </span>
    </div>
  );
  // The head as an answered call has it, made of Panki's defaults and nothing measured: inert, its Details never open.
  const call = answeredCall(
    startCall({ label: MESSAGES.go, why: PRESSED, settings: DEFAULT_PANKI_AI, template: starter, pieces: { dictForm: found.term, learningLanguage: TRANSCRIBE_LANGUAGES.jpn, language: APP_LANGUAGES.eng }, said: [], now: 0 }),
    { inputTokens: 0, outputTokens: 0, costMicros: 0, cut: false },
    0,
  );
  const proposed = answer?.proposedMeaning ?? null;
  const conversation: Conversation<Judging> = answer
    ? startConversation({ id: 1, run: starter.name, field: null, question: "", reply: answer.text, said: [], changed: meanings.length > 0 || proposed ? [{ meanings, proposed }] : [] })
    : NO_CONVERSATION;
  const exampleOf: ConversationOf<Judging> = {
    chips: (made) => (made.changed[0] ? [meaningsChip(made.changed[0].meanings, made.changed[0].proposed !== null, "live")] : []),
    canRun: false,
    onRetry: nothing,
    onGo: nothing,
  };
  return (
    <AiConversation
      inert
      calls={answer ? [call] : []}
      burst={0}
      busy={false}
      before={start}
      failure={null}
      onRunAgain={nothing}
      conversation={conversation}
      asking={null}
      of={exampleOf}
      foot={{ id, asked: null, onCancel: nothing, follow: { value: "", disabled: false, beside: null, onChange: nothing, onAsk: nothing } }}
    />
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
