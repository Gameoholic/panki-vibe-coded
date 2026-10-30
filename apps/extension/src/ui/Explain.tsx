import { useEffect, useId, useRef, useState } from "react";
import {
  AI_PROVIDERS,
  APP_LANGUAGES,
  DEFAULT_PANKI_AI,
  PIECE_MAX,
  TRANSCRIBE_LANGUAGES,
  aiModelOf,
  answeredCall,
  ceilingMicros,
  explainSent,
  failedCall,
  startCall,
  type AiCall,
  type AiRunWhy,
  type ExplainMessage,
  type PankiAi,
  type PromptGaps,
  type PromptPieceId,
  type PromptPieces,
} from "@panki/contracts";
import { AiStatus } from "@web/components/AiStatus";
import { AiSpark, AiWaiting } from "@web/components/AiWaiting";
import { Button } from "@web/components/Button";
import { Form } from "@web/components/Form";
import { Icon } from "@web/components/Icon";
import { TextField } from "@web/components/TextField";
import { estimateWords } from "@web/words";
import type { Pointed } from "../capture/look";
import { sentenceAround } from "../capture/selection";
import type { Found } from "../dictionary/found";
import { dictionaryPieces } from "../dictionary/pieces";
import { askAiState, askExplain, type AiShown } from "../messages";

/**
 * Explain, a part of the pop-up's layout (AI step 2, the owner's preview of 2026-10-30): Panki AI saying what the word
 * shown means where it was pointed at. On a press (or by itself once the pop-up is kept open, with Explain as the
 * pop-up opens on), the word, what the dictionaries say of it, its sentence and, on a video, what's around it go to
 * Panki through the worker; the answer stands under the spark as plain paragraphs, and a follow-up can be asked under
 * it, the conversation so far going with it. Before it runs, it says the most it can cost. Nothing is kept: the
 * conversation is this component's, and the pop-up closing, or another word shown, forgets it.
 */

/** What this says, one home. */
const MESSAGES = {
  signedOut: "Sign in to Panki to explain.",
  noKey: (provider: string) => `No key for ${provider}.`,
  empty: "Type a question.",
  long: (max: number) => `Keep the question under ${max.toLocaleString("en")} characters.`,
  /** Panki's own note under an answer the provider stopped at Max answer length: never the AI's words. */
  cut: "Cut short at the answer limit.",
  /** An answer with nothing in it: the provider's failure, as good as. */
  nothing: "Panki AI gave no answer.",
  /** Nothing in it and cut at Max answer length: the model's thinking took all of it (it did, on the owner's first try). */
  used: "Panki AI reached the answer limit before it wrote anything. Max answer length is in Admin → Panki AI → Limits.",
};
const upTo = (micros: number) => `Up to ${estimateWords(micros)}`;

/** The limits that shape what's read off a video for a prompt (Admin → Panki AI → Limits). */
export type PieceLimits = Pick<PankiAi, "aiSurroundingSeconds" | "aiMaxDescriptionChars">;
/** What the page knows besides the pop-up: on a video, its metadata, the subtitles around the moment and its description. */
export type MorePieces = (pointed: Pointed, limits: PieceLimits) => PromptPieces;

/** A made-up answer for the options page, by the dictionary form of the word it's about (`options/examples.ts`). */
export type ExampleAnswer = { term: string; text: string };
/** Explain on the options page: made-up answers, drawn as an answer is, answering no press, never asking anyone. */
export type ExplainExamples = { kind: "example"; answers: readonly ExampleAnswer[] };
/**
 * Explain on a page: Panki AI through the worker, about the word pointed at. `more` is what the page adds (a video's);
 * `auto` is Explain as the pop-up opens with the pop-up kept open, and `onAuto` says it ran so, once a pop-up.
 */
export type ExplainLive = { kind: "panki"; pointed: Pointed; more: MorePieces | null; auto: boolean; onAuto: () => void };
export type ExplainSource = ExplainExamples | ExplainLive;

type Answered = { text: string; cut: boolean };
/** One exchange: the question (none for the first, the word itself), then its answer, or why there's none. */
type Turn = { question: string | null; answer: Answered | null; failure: { message: string; retry: boolean } | null };

/**
 * What Explain sends: the word as it stands on the page, every kind of the dictionary's data (every meaning of the
 * dictionaries that are on, numbered), the sentence it was pointed at in, and what the page adds. Each cut to the most
 * a piece can be as it's sent; the server cuts each to its own limit.
 */
function piecesOf(found: Found, pointed: Pointed, more: MorePieces | null, limits: PieceLimits, languages: Pick<PromptPieces, "learningLanguage" | "language">): { pieces: PromptPieces; gaps: PromptGaps } {
  const context = pointed.context;
  const sentence = context ? sentenceAround(context.text, context.at, context.at + found.source.length).sentence : "";
  const video = more?.(pointed, limits) ?? {};
  // The account's two languages, as Panki says them (the server puts its own in, the same, whatever this sends).
  const all: PromptPieces = { word: found.source, ...dictionaryPieces(found, found.senses, true), sentence, ...video, ...languages };
  const pieces: PromptPieces = Object.fromEntries(Object.entries(all).flatMap(([id, text]) => (text?.trim() ? [[id, text.slice(0, PIECE_MAX)]] : [])));
  return { pieces, gaps: gapsOf(pieces, video.source !== undefined) };
}

const VIDEO_PIECES: readonly PromptPieceId[] = ["source", "surrounding", "description"];
const DICTIONARY_PIECES: readonly PromptPieceId[] = ["dictForm", "dictReading", "dictMeaning", "dictTags", "dictWordType", "dictFrequency", "dictPitch"];
/** Why each piece went empty, for Details: off a video a video's piece isn't there to have; the rest, when they're empty, say why as far as the page knows. */
function gapsOf(pieces: PromptPieces, onVideo: boolean): PromptGaps {
  const gaps: PromptGaps = {};
  for (const id of VIDEO_PIECES) if (!pieces[id]) gaps[id] = !onVideo ? "notVideo" : id === "surrounding" ? "noSubtitles" : "empty";
  for (const id of DICTIONARY_PIECES) if (!pieces[id]) gaps[id] = "notInDictionaries";
  return gaps;
}

const AUTO: AiRunWhy = { kind: "auto", setting: "Explain as the pop-up opens" };
const PRESSED: AiRunWhy = { kind: "pressed", action: "Explain" };

/** The conversation so far, as the model is sent it: each answer, the question that came before it, and a new question last. */
function saidOf(turns: readonly Turn[], asked: string | null): ExplainMessage[] {
  const said: ExplainMessage[] = [];
  for (const turn of turns) {
    if (!turn.answer) continue;
    if (turn.question !== null) said.push({ role: "user", text: turn.question });
    said.push({ role: "assistant", text: turn.answer.text });
  }
  if (asked !== null) said.push({ role: "user", text: asked });
  return said;
}

/**
 * An answer, as plain paragraphs (nothing the model writes reaches the page as markup), rising in as it lands; and, cut
 * short at Max answer length, Panki's own note under it, outside it.
 */
function Answer({ answer }: { answer: Answered }) {
  const paragraphs = answer.text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "");
  return (
    <>
      <div className="ai-explain-answer">
        {paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      {answer.cut ? (
        <p className="ai-explain-cut">
          <Icon name="info" />
          {MESSAGES.cut}
        </p>
      ) : null}
    </>
  );
}

type FollowUpProps = { id: string; value: string; error?: string | undefined; disabled: boolean; beside: string | null; onChange: (value: string) => void; onAsk: () => void };

/** A follow-up asked under the last answer, with the most it can cost beside Ask, the conversation so far included. */
function FollowUp({ id, value, error, disabled, beside, onChange, onAsk }: FollowUpProps) {
  return (
    <Form className="ai-explain-ask" onSubmit={onAsk}>
      <TextField id={`${id}-question`} label="Ask a follow-up" value={value} onChange={onChange} error={error} autoComplete="off" />
      <div className="ai-explain-go">
        <Button type="submit" className="ai-explain-button" disabled={disabled}>
          <AiSpark />
          Ask
        </Button>
        {beside ? <span className="ai-explain-beside">{beside}</span> : null}
      </div>
    </Form>
  );
}

/** Explain as a page has it: Panki AI asked through the worker. */
function LiveExplain({ found, source }: { found: Found; source: ExplainLive }) {
  const id = useId();
  /** Panki AI as the worker keeps it: unknown until it answers; null signed out; or why it couldn't be told. */
  const [ai, setAi] = useState<{ known: false } | { known: true; ai: AiShown | null; failure: string | null }>({ known: false });
  /** What's sent, read once as Panki AI is first told: the word as it was pointed at, whatever the video does since. */
  const [read, setRead] = useState<{ pieces: PromptPieces; gaps: PromptGaps } | null>(null);
  const pieces = read?.pieces ?? null;
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  /** Every call this Explain made, oldest first, as the AI's status tells of them: never sent, gone with the pop-up. */
  const [calls, setCalls] = useState<readonly AiCall[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionError, setQuestionError] = useState<string | undefined>(undefined);
  /** A call on its way: a second press (the auto run and the press that kept the pop-up open, together) waits for it. */
  const running = useRef(false);
  /** It has run, by a press or by itself: Explain as the pop-up opens runs it once at most. */
  const started = useRef(false);
  const alive = useRef(true);
  const latest = useRef<HTMLDivElement>(null);

  const readAi = async () => {
    const answer = await askAiState();
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
  /** Why it can't run, when that can be put right from here; Panki AI switched off says nothing but the greyed button. */
  const reason = !ai.known ? null : ai.failure ? ai.failure : shown === null ? MESSAGES.signedOut : !shown.settings.aiOn ? null : shown.key === null ? MESSAGES.noKey(AI_PROVIDERS[shown.settings.aiProvider].name) : null;
  /** The most a call with this conversation can cost, at the model's listed prices. */
  const costOf = (said: ExplainMessage[]) => (canRun && settings && pieces ? upTo(ceilingMicros(aiModelOf(settings), explainSent(settings.aiExplainPrompt, { pieces, said }), settings.aiMaxAnswerTokens)) : null);

  async function run(asked: string | null, before: readonly Turn[], why: AiRunWhy) {
    if (!read || !settings || running.current) return;
    running.current = true;
    started.current = true;
    // What failed before a new question is let go: only answers go back with it.
    const kept = before.filter((turn) => turn.answer !== null);
    const pending: Turn = { question: asked, answer: null, failure: null };
    const said = saidOf(kept, asked);
    // The first answer is Explain's; each question after it a follow-up, numbered as they're asked.
    const label = asked === null ? "Explain" : `Follow-up ${kept.length}`;
    const call = startCall({ label, why, settings, template: settings.aiExplainPrompt, pieces: read.pieces, gaps: read.gaps, said, now: Date.now() });
    setTurns([...kept, pending]);
    setCalls((was) => [...was, call]);
    setBusy(true);
    const answer = await askExplain({ pieces: read.pieces, said });
    running.current = false;
    if (!alive.current) return;
    const empty = answer.ok && answer.explain.text.trim() === "" ? (answer.explain.cut ? MESSAGES.used : MESSAGES.nothing) : null;
    const done: Turn = answer.ok
      ? empty !== null
        ? { ...pending, failure: { message: empty, retry: true } }
        : { ...pending, answer: { text: answer.explain.text, cut: answer.explain.cut } }
      : { ...pending, failure: { message: answer.message, retry: answer.problem === "provider" } };
    // An empty answer was still a call the provider billed: Details say what it took, and why there's nothing.
    const finished = answer.ok ? (empty === null ? answeredCall(call, answer.explain, Date.now()) : failedCall(call, empty, Date.now())) : failedCall(call, answer.message, Date.now());
    setTurns([...kept, done]);
    setCalls((was) => was.map((each) => (each === call ? finished : each)));
    setBusy(false);
    // The worker keeps Panki AI as this answer said it stands: what's said beside Ask follows any change.
    void readAi();
  }

  // Explain as the pop-up opens: once it's kept open (never on a passing hover), and once a pop-up.
  useEffect(() => {
    if (!source.auto || started.current || !canRun) return;
    source.onAuto();
    void run(null, [], AUTO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.auto, canRun]);

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
    if (text === "") {
      setQuestionError(MESSAGES.empty);
      return;
    }
    if (settings && text.length > settings.aiMaxQuestionChars) {
      setQuestionError(MESSAGES.long(settings.aiMaxQuestionChars));
      return;
    }
    setQuestion("");
    setQuestionError(undefined);
    void run(text, turns, { kind: "followUp" });
  }

  if (turns.length === 0) {
    const beside = reason ?? costOf([]);
    return (
      <div className="ai-explain-start">
        <Button className="ai-explain-button" disabled={!canRun} onClick={() => void run(null, [], PRESSED)}>
          <AiSpark />
          Explain
        </Button>
        {beside ? <span className="ai-explain-beside">{beside}</span> : null}
      </div>
    );
  }

  const answered = turns.filter((turn) => turn.answer !== null).length;
  // The first answer isn't a follow-up; what's left of Max follow-ups is.
  const left = settings ? settings.aiMaxFollowUps - Math.max(0, answered - 1) : 0;
  return (
    <section className="ai-explain" aria-label="Panki AI" aria-busy={busy}>
      <AiStatus calls={calls} />
      {turns.map((turn, i) => (
        <div key={i} ref={i === turns.length - 1 ? latest : undefined} className="ai-explain-turn">
          {turn.question !== null ? <p className="ai-explain-question">{turn.question}</p> : null}
          {turn.answer ? (
            <Answer answer={turn.answer} />
          ) : turn.failure ? (
            <div className="ai-explain-failure">
              <p className="form-failure" role="alert">
                {turn.failure.message}
              </p>
              {turn.failure.retry ? (
                <Button className="ai-explain-button" disabled={!canRun} onClick={() => void run(turn.question, turns.slice(0, i), { kind: "retry" })}>
                  <AiSpark />
                  Try again
                </Button>
              ) : null}
            </div>
          ) : (
            <AiWaiting lines={turn.question === null ? 4 : 2} />
          )}
        </div>
      ))}
      {!busy && answered > 0 && left > 0 ? (
        <FollowUp
          id={id}
          value={question}
          error={questionError}
          disabled={!canRun}
          beside={reason ?? costOf(saidOf(turns, question.trim()))}
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
 * it; for a word with none, the button. Nothing in it answers a press, and nothing is ever asked.
 */
function ExampleExplain({ found, answers }: { found: Found; answers: readonly ExampleAnswer[] }) {
  const id = useId();
  const answer = answers.find((example) => example.term === found.term);
  if (!answer) {
    return (
      <div className="ai-explain-start" inert>
        <Button className="ai-explain-button">
          <AiSpark />
          Explain
        </Button>
      </div>
    );
  }
  // The head as an answered call has it, made of Panki's defaults and nothing measured: inert, its Details never open.
  const call = answeredCall(
    startCall({ label: "Explain", why: PRESSED, settings: DEFAULT_PANKI_AI, template: DEFAULT_PANKI_AI.aiExplainPrompt, pieces: { dictForm: found.term, learningLanguage: TRANSCRIBE_LANGUAGES.jpn, language: APP_LANGUAGES.eng }, said: [], now: 0 }),
    { inputTokens: 0, outputTokens: 0, costMicros: 0, cut: false },
    0,
  );
  return (
    <section className="ai-explain" aria-label="Panki AI" inert>
      <AiStatus calls={[call]} />
      <div className="ai-explain-turn">
        <Answer answer={{ text: answer.text, cut: false }} />
      </div>
      <FollowUp id={id} value="" disabled={false} beside={null} onChange={nothing} onAsk={nothing} />
    </section>
  );
}

/** Explain for the word shown in the pop-up: asking Panki AI on a page, the made-up answers on the options page. */
export function Explain({ found, source }: { found: Found; source: ExplainSource }) {
  return source.kind === "example" ? <ExampleExplain found={found} answers={source.answers} /> : <LiveExplain found={found} source={source} />;
}
