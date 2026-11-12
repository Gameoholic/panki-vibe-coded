/** @panki Explain, Panki AI on the word in the pop-up, and why each empty piece is empty (`Explain`, `ExplainSource`, `MorePieces`, `gapsOf`). */
import { useEffect, useId, useRef, useState } from "react";
import {
  MEANING_JUDGEMENT_NAMES,
  AI_ACTIONS,
  APP_LANGUAGES,
  AiActionId,
  DEFAULT_PANKI_AI,
  EXPLAIN_PART_NAMES,
  NO_CONVERSATION,
  PIECE_MAX,
  TRANSCRIBE_LANGUAGES,
  answeredCall,
  commit,
  NO_ACCOUNT_ACTIONS,
  actionNamesOf,
  explainAsks,
  explainRequiredFor,
  explainSendPieces,
  wordPromptOf,
  failedCall,
  historyOf,
  mainRuns,
  DEFAULT_ACTION_SECONDS,
  litNow,
  meaningsPiece,
  openingActionsOf,
  actionsOf,
  runNameOf,
  reachOf,
  widerOf,
  startCall,
  startConversation,
  type AccountActions,
  type AiCall,
  type AiMessageWhy,
  type AiVerdict,
  type Commit,
  type Conversation,
  type ExplainSend,
  type Explained,
  type JudgedMeaning,
  type PankiAi,
  type ProposedMeaning,
  type PromptGaps,
  type PromptPieceId,
  type PromptPieces,
} from "@panki/contracts";
import { AiConversation, StandingMessage, type Asking, type ConversationMark, type ConversationOf, type Failure } from "@web/components/AiConversation";
import { KNOB_WORDS, MESSAGE_WORDS, ceilingOf, questionProblem, useAskFirst, whyNot, type ComposerProps } from "@web/components/AiRun";
import { Icon } from "@web/components/Icon";
import { goTo } from "@web/hooks/useHoist";
import { meaningsChip } from "@web/components/JudgedRow";
import type { ExampleAnswer } from "@web/explainers/examples";
import type { Pointed } from "../capture/look";
import { sentenceAround } from "../capture/selection";
import type { Found } from "../dictionary/found";
import { dictionaryPieces } from "../dictionary/pieces";
import { askAiState, askExplain, type AiShown } from "../messages";
import { glossaryText } from "./Glossary";

/**
 * Explain, a part of the pop-up's layout: the word's conversation with Panki AI, about what the word shown means where
 * it was pointed at ("Touch up, steered" step 4, in the format of the card's conversation in the drawer). Always there:
 * the head once a call is made, the account's User instructions at its top, every message and its answer's reply, and
 * the composer at its foot, the word's actions in its dropdown (Explain, the default, lit as the pop-up opens; Grammar,
 * Conjugation, Nuance), one Send. Each message goes with the word, what the dictionaries say of it, its sentence and, on
 * a video, what's around it, to Panki through the worker, over the admin's prompt; every answer is one shape, its reply
 * as plain paragraphs, "Changed: Meanings" when it judged them (the pop-up's own rows lit, the chip going to them), a
 * part its actions required that didn't come back named under it with Try again. Before a message, the most it can
 * cost; over the account's Ask before a message is over it asks first. Nothing is kept: the conversation is this
 * component's, and the pop-up closing, or another word shown, forgets it.
 */

/** What this says, one home. */
const MESSAGES = {
  signedOut: "Sign in to Panki to explain.",
  /** Under Clear conversation's question: what goes, and what stays. */
  clearDetail: "Every message and its answers go, and the meanings show as the dictionaries have them.",
  /** Panki's own note under an answer the provider stopped at Max answer length: never the AI's words. */
  cut: "Cut short at the answer limit.",
  /**
   * Panki's own note when an answer judges none of the dictionary's meanings to fit and proposes none (one from a Panki
   * from before): outside the answer, never the AI's words.
   */
  noneFits: "None of the dictionary's meanings fits here.",
  /** A message without Explain lit, as Details name its call ("Message 2"). */
  message: "Message",
  /** Beside Send once Max messages is reached. */
  noMore: "That's the most messages a word's conversation takes.",
};

/** What an answer changed: the meanings, judged (one row each, in the list's order), and the meaning it proposes when none fits. */
type Judging = { meanings: readonly JudgedMeaning[]; proposed: ProposedMeaning | null };

/**
 * What Details say an answer came to: its reply, then every meaning as it judged it, in the list's order (its number,
 * its judgement, the dictionary's words and name, the reason), drawn in the judgement's look as the pop-up draws it,
 * and the meaning it proposed when it proposed one, numbered after them as the pop-up numbers it.
 */
const explainVerdicts = (found: Found, { text, meanings, proposedMeaning }: Pick<Explained, "text" | "meanings" | "proposedMeaning">): AiVerdict[] => [
  ...(text !== "" ? [{ name: EXPLAIN_PART_NAMES.reply, tag: null, value: text, reason: "" }] : []),
  ...meanings.map((row): AiVerdict => {
    const sense = found.senses[row.meaning - 1];
    return {
      name: `Meaning ${row.meaning}`,
      tag: { words: MEANING_JUDGEMENT_NAMES[row.judgement], look: row.judgement === "good" ? "good" : row.judgement === "meh" ? "flag" : "muted" },
      value: sense ? `${glossaryText(sense.glossary)} · ${sense.dict}` : "",
      reason: row.reason,
      judgement: row.judgement,
    };
  }),
  ...(proposedMeaning !== null
    ? [
        {
          name: `Proposed meaning ${found.senses.length + 1}`,
          tag: { words: MEANING_JUDGEMENT_NAMES.good, look: "good" as const },
          value: proposedMeaning.meaning,
          reason: proposedMeaning.reason,
          judgement: "good" as const,
        },
      ]
    : []),
];
/** Whether two answers judged every meaning the same and proposed the same meaning: a later note that none fits is said again only when it changed. */
const sameJudging = (a: Judging, b: Judging) =>
  a.proposed?.meaning === b.proposed?.meaning && a.meanings.length === b.meanings.length && a.meanings.every((row, i) => row.meaning === b.meanings[i]?.meaning && row.judgement === b.meanings[i]?.judgement);

/** The latest answer on main that judged the meanings, before `id` when given: what the pop-up's rows are lit by. */
const judgingBefore = (conversation: Conversation<Judging>, id?: number): Commit<Judging> | undefined =>
  conversation.main.filter((each) => each.changed.length > 0 && (id === undefined || each.id < id)).at(-1);

/**
 * Panki's own notes under an answer, never the AI's words: that none of the meanings fits, from a Panki from before that
 * proposed none (said again for a later answer only when it judged them differently), and that it was cut short at Max
 * answer length.
 */
function notesOf(made: Commit<Judging>, conversation: Conversation<Judging>) {
  const judging = made.changed[0];
  const before = judgingBefore(conversation, made.id)?.changed[0];
  const noneFits = judging && judging.meanings.length > 0 && judging.proposed === null && !judging.meanings.some((row) => row.judgement === "good") && (!before || !sameJudging(judging, before));
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

/**
 * The pop-up brought to the word's meanings, lit where they stand: an answer's "Meanings" chip pressed. The one way to
 * something a press names (`useHoist.ts` → `goTo`), the drawer's chips' too; the first dictionary's meanings, folded or
 * not, or the proposed one.
 */
function goToMeanings(from: HTMLElement | null) {
  const meanings = from?.closest(".look-word")?.querySelector(".look-dict, .look-fold, .look-proposed");
  if (meanings instanceof HTMLElement) goTo(meanings);
}

/** The limits that shape what's read off a video for a prompt (Admin → Panki AI → Limits). */
export type PieceLimits = Pick<PankiAi, "aiMaxDescriptionChars">;
/**
 * What a video adds to a prompt, read at a moment: its metadata and description (`pieces`), and the subtitles around
 * that moment as far as a message reaches (`around(seconds)`, one a line; a message's reach is its actions', `reachOf`).
 */
export type VideoMore = { pieces: PromptPieces; around: (seconds: number) => string };
/** What the page knows besides the pop-up: on a video, what it adds to a prompt, read as the pop-up opens. */
export type MorePieces = (pointed: Pointed, limits: PieceLimits) => VideoMore;

/** Explain on the options page (the made-up answers are the web's `explainers/examples.ts`): made-up answers, drawn as an answer is, answering no press, never asking anyone. */
export type ExplainExamples = { kind: "example"; answers: readonly ExampleAnswer[] };
/**
 * Explain on a page: Panki AI through the worker, about the word pointed at, asked by a send alone (running by itself is
 * AI step 7's). `more` is what the page adds (a video's).
 */
export type ExplainLive = { kind: "panki"; pointed: Pointed; more: MorePieces | null };
export type ExplainSource = ExplainExamples | ExplainLive;

/**
 * What's sent, read once as the pop-up opens: the pieces but the subtitles, every meaning in the order `{Meaning}`
 * indexes them, whether it's on a video, and the subtitles around the moment it was pointed at, as far as a message
 * reaches (none off a video).
 */
type Read = { pieces: PromptPieces; meanings: string[]; onVideo: boolean; around: ((seconds: number) => string) | null };
/** What a message sends with what was read: the subtitles cut to `reach` as the prompt's `{Surrounding video subtitles}`, and why each empty piece is empty. */
function withSurrounding(read: Read, reach: number): { pieces: PromptPieces; gaps: PromptGaps } {
  const surrounding = (read.around?.(reach) ?? "").slice(0, PIECE_MAX);
  const pieces: PromptPieces = { ...read.pieces, ...(surrounding.trim() !== "" ? { surrounding } : {}) };
  return { pieces, gaps: gapsOf(pieces, read.onVideo) };
}

/**
 * What Explain sends: the word as it stands on the page, every kind of the dictionary's data (every meaning of the
 * dictionaries that are on, numbered), the sentence it was pointed at in, and what the page adds. Each cut to the most
 * a piece can be as it's sent; the server cuts each to its own limit.
 */
function piecesOf(found: Found, pointed: Pointed, more: MorePieces | null, limits: PieceLimits, account: Pick<PromptPieces, "learningLanguage" | "language" | "instructions">): Read {
  const context = pointed.context;
  const sentence = context ? sentenceAround(context.text, context.at, context.at + found.source.length).sentence : "";
  const video = more?.(pointed, limits) ?? null;
  // Every meaning as the server lists them (`meaningsPiece`), so the index an answer names is this list's.
  const meanings = found.senses.map((sense) => glossaryText(sense.glossary));
  // The account's two languages and its User instructions, as Panki says them (the server puts its own in, the same, whatever this sends).
  const all: PromptPieces = { word: found.source, ...dictionaryPieces(found, found.senses, true), dictMeaning: meaningsPiece(meanings), sentence, ...(video?.pieces ?? {}), ...account };
  const pieces: PromptPieces = Object.fromEntries(Object.entries(all).flatMap(([id, text]) => (text?.trim() ? [[id, text.slice(0, PIECE_MAX)]] : [])));
  return { pieces, meanings, onVideo: video?.pieces.source !== undefined, around: video?.around ?? null };
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

/** The word's actions as the composer lists them, the account's in its order, the ticked ones on. */
const switchesOf = (book: AccountActions, lit: readonly AiActionId[], disabled: boolean): ComposerProps["actions"] =>
  actionsOf(book, "word").map((action) => ({ id: action.id, name: action.name, on: lit.includes(action.id), disabled }));
/** The one place a word's conversation's sends are asked from: the composer's foot. */
const FOOT = "foot";

/** Explain as a page has it: Panki AI asked through the worker. */
function LiveExplain({ found, source, onJudged }: { found: Found; source: ExplainLive; onJudged: Judged }) {
  const id = useId();
  /** Panki AI as the worker keeps it: unknown until it answers; null signed out; or why it couldn't be told. */
  const [ai, setAi] = useState<{ known: false } | { known: true; ai: AiShown | null; failure: string | null }>({ known: false });
  /** What's sent, read once as Panki AI is first told: the word as it was pointed at, whatever the video does since. */
  const [read, setRead] = useState<Read | null>(null);
  /** Main alone: each send's commit. */
  const [conversation, setConversation] = useState<Conversation<Judging>>(NO_CONVERSATION);
  /** The send on its way, or the later send that last failed (with Try again), until the next. */
  const [asking, setAsking] = useState<Asking | null>(null);
  /** Why the conversation's first send gave no answer, with Try again; a later send's failure is its own turn's. */
  const [failure, setFailure] = useState<Failure | null>(null);
  /** Every call this Explain made, oldest first, as the AI's status tells of them: never sent, gone with the pop-up. */
  const [calls, setCalls] = useState<readonly AiCall[]>([]);
  const [busy, setBusy] = useState(false);
  /** A message requiring the meanings judged is on its way: the pop-up dims its rows meanwhile. */
  const [judging, setJudging] = useState(false);
  /** The actions ticked on the composer for its next send, by id: null while they're the account's defaults, ticked as the pop-up opens; none after each send. */
  const [ticked, setTicked] = useState<readonly AiActionId[] | null>(null);
  /** What's typed in the composer, and why it can't go when it can't. */
  const [typed, setTyped] = useState<{ text: string; error?: string }>({ text: "" });
  /** The conversation's first send, which its first prompt ends with. */
  const [opening, setOpening] = useState<ExplainSend | null>(null);
  /** The last send that failed: what Try again sends again. */
  const [retry, setRetry] = useState<ExplainSend | null>(null);
  /** How many sends there have been: Send's spark blinks once for each. */
  const [sends, setSends] = useState(0);
  /**
   * How much of the video the conversation hears each way, as its settings set it, from the next message on: null until
   * it's set; and the notes each change wrote where it was made.
   */
  const [reachSet, setReachSet] = useState<number | null>(null);
  const [marks, setMarks] = useState<readonly ConversationMark[]>([]);
  const gate = useAskFirst();
  /** A call on its way: a second press waits for it. */
  const running = useRef(false);
  /** How many runs and messages were sent here, for each one's name in Details ("Explain 2", "Message 3"). */
  const counts = useRef({ runs: 0, messages: 0 });
  /** Each send's id, rising. */
  const ids = useRef(0);
  const alive = useRef(true);
  const box = useRef<HTMLElement>(null);

  // The meanings lit as the latest answer that judged them did; none until one has.
  useEffect(() => {
    const latest = judgingBefore(conversation)?.changed[0];
    onJudged({ meanings: latest?.meanings ?? [], proposed: latest?.proposed ?? null, working: judging });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, judging]);

  const readAi = async (fresh = false) => {
    const answer = await askAiState(fresh);
    if (!alive.current) return null;
    setAi(answer.ok ? { known: true, ai: answer.ai, failure: null } : { known: true, ai: null, failure: answer.message });
    return answer.ok ? answer.ai : null;
  };
  useEffect(() => {
    alive.current = true;
    void readAi().then((shown) => {
      if (shown && alive.current) {
        setRead(
          piecesOf(found, source.pointed, source.more, shown.settings, {
            learningLanguage: TRANSCRIBE_LANGUAGES[shown.learningLanguage],
            language: APP_LANGUAGES[shown.language],
            instructions: shown.instructions,
          }),
        );
      }
    });
    return () => {
      alive.current = false;
    };
    // Once, as the pop-up opens on this word: it's keyed by the word, so another word is another Explain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = ai.known ? ai.ai : null;
  const settings = shown?.settings ?? null;
  const canRun = settings !== null && settings.aiOn && shown?.key !== null && read !== null;
  /** Why nothing can be sent, beside the greyed Send (`whyNot`, Touch up's too: Panki AI off among them). */
  const reason = ai.known ? whyNot(true, shown, ai.failure, MESSAGES.signedOut) : null;
  /** Whether the conversation has begun: a send's reply is in. Until then a send is its first, whatever came before and failed. */
  const begun = conversation.main.length > 0;
  /** Sends after the first are follow-ups: what Max follow-ups holds. */
  const sendsLeft = !begun || (settings !== null && conversation.main.length - 1 < settings.aiMaxFollowUps);
  /** The account's actions beside Panki's: what the composer lists, in its order, and what each message is made of. */
  const book = shown?.actions ?? NO_ACCOUNT_ACTIONS;
  /** The actions ticked on the composer now: the account's defaults until one is pressed or a message goes. */
  const lit = ticked ?? openingActionsOf(book, "word");

  /**
   * A send made ready, the same for the call itself and for what it can cost before the press: the send as the server
   * takes it, the conversation's first send (its own, while it hasn't begun), the conversation so far, and the most it
   * can cost; the pieces with the subtitles as far as the first send reaches (its actions and the conversation's own
   * reach, `reachOf`), and a later send's own wider ones where it reaches further (`widerOf`).
   */
  function prepared(sent: ExplainSend, run: PankiAi, words: Read) {
    const plain: ExplainSend = { actions: [...sent.actions], text: sent.text.trim(), ...(reachSet !== null ? { reach: reachSet } : {}) };
    const first = begun && opening ? opening : plain;
    const firstLit = litNow(book, "word", first.actions);
    const { pieces, gaps } = withSurrounding(words, reachOf(firstLit, first.reach ?? null));
    const reach = begun ? widerOf(litNow(book, "word", plain.actions), firstLit, plain.reach ?? null, first.reach ?? null) : null;
    const wider = reach !== null ? (words.around?.(reach) ?? "").slice(0, PIECE_MAX) : "";
    const send: ExplainSend = { ...plain, ...(wider.trim() !== "" ? { wider } : {}) };
    const said = begun ? historyOf(conversation, null) : [];
    const template = wordPromptOf(run);
    const asking = begun ? explainSendPieces(send, book) : {};
    const ceiling = ceilingOf(run, template, pieces, said, asking, run.aiMaxAnswerTokens, explainSendPieces(first, book));
    return { send, first, said, template, asking, ceiling, pieces, gaps };
  }
  /** Whether a send would send anything: Panki AI able to run, nothing on its way, follow-ups left, and a part it requires or words to say. */
  const sendable = (sent: ExplainSend) => canRun && !busy && sendsLeft && explainAsks(litNow(book, "word", sent.actions), sent.text);

  /**
   * One send of the word's conversation: one call, answered in the one shape. Its reply is a commit on main (the first
   * begins the conversation); the meanings it judged light the pop-up's rows; a part its actions required that didn't
   * come back is named under it, with Try again.
   */
  async function sendExplain(sent: ExplainSend, why: AiMessageWhy) {
    if (!read || !settings || running.current) return;
    running.current = true;
    const { send, first, said, template, asking: own, pieces, gaps } = prepared(sent, settings, read);
    const firstSend = !begun;
    // A message with one of the defaults goes by its name ("Explain", "Explain 2"); any other is a message.
    const name = runNameOf(book, "word", send.actions);
    if (name !== null) counts.current.runs += 1;
    else counts.current.messages += 1;
    const label = name !== null ? (counts.current.runs === 1 ? name : `${name} ${counts.current.runs}`) : `${MESSAGES.message} ${counts.current.messages}`;
    const names = actionNamesOf(book, "word", send.actions);
    const pending: Asking = { id: ++ids.current, run: name, field: null, question: send.text, actions: names, failure: null };
    const call = startCall({
      label,
      why,
      settings,
      template,
      pieces,
      gaps,
      said,
      asking: own,
      opening: explainSendPieces(first, book),
      now: Date.now(),
      steering: { instructions: shown?.instructions ?? "", actions: litNow(book, "word", send.actions).map((action) => action.name), typed: send.text },
    });
    setAsking(pending);
    setFailure(null);
    setRetry(null);
    setCalls((was) => [...was, call]);
    setBusy(true);
    setJudging(explainRequiredFor(litNow(book, "word", send.actions)).includes("meanings"));
    setSends((was) => was + 1);
    if (firstSend) setOpening(send);
    const answer = await askExplain({ pieces, meanings: read.meanings, opening: first, said, ...(firstSend ? {} : { send }) });
    running.current = false;
    if (!alive.current) return;
    const now = Date.now();
    setBusy(false);
    setJudging(false);
    if (!answer.ok) {
      setCalls((was) => was.map((each) => (each === call ? failedCall(call, answer.message, now, answer.unread) : each)));
      const failed: Failure = { message: answer.message, retry: answer.problem === "provider" };
      setRetry(sent);
      // The first send's failure stands under the head; a later one's as its own turn, each with Try again.
      if (firstSend) {
        setAsking(null);
        setFailure(failed);
      } else setAsking({ ...pending, failure: failed });
    } else {
      const done = answer.explain;
      setCalls((was) => was.map((each) => (each === call ? answeredCall(call, done, now, explainVerdicts(found, done)) : each)));
      const made: Commit<Judging> = {
        id: pending.id,
        run: pending.run,
        field: null,
        question: send.text,
        actions: names,
        reply: done.text,
        // The model reads its own turn back as it wrote it, its JSON; a later send's message goes before it, as sent.
        said: [
          ...(firstSend ? [] : [{ role: "user" as const, text: done.asked || send.text }]),
          { role: "assistant" as const, text: done.raw || JSON.stringify({ reply: done.text, meanings: done.meanings, proposedMeaning: done.proposedMeaning ?? { meaning: "", reason: "" } }) },
        ],
        changed: done.judged ? [{ meanings: done.meanings, proposed: done.proposedMeaning }] : [],
        cut: done.cut,
      };
      setConversation((was) => (firstSend ? startConversation(made) : commit(was, null, made)));
      setAsking(null);
    }
    // The worker keeps Panki AI as this answer said it stands: what's said beside Send follows any change.
    void readAi();
  }

  /** A send pressed (Send, Try again): at once, or asking first over the account's Ask before a run over, at the foot. `then` once it goes. */
  function pressSend(sent: ExplainSend, why: AiMessageWhy, then?: () => void) {
    if (!shown || !settings || !read || !sendable(sent)) return;
    const micros = prepared(sent, settings, read).ceiling;
    const question = MESSAGE_WORDS.sendFor(micros);
    gate.press(shown.askOverMicros, FOOT, micros, question, () => {
      then?.();
      void sendExplain(sent, why);
    });
  }
  /** What's typed, checked, then sent with the actions lit; it stays in its box until it really goes. */
  function sendFromComposer() {
    const text = typed.text.trim();
    // A message may be actions alone; what's typed is held to Max follow-up length.
    const problem = settings && text !== "" ? questionProblem(text, settings.aiMaxQuestionChars) : null;
    if (problem !== null) {
      setTyped((was) => ({ ...was, error: problem }));
      return;
    }
    pressSend({ actions: [...lit], text }, { kind: "pressed", action: MESSAGE_WORDS.send }, () => {
      setTyped({ text: "" });
      // Every ticked action clears with the send, the defaults with them: the next run is Explain ticked again.
      setTicked([]);
    });
  }

  // A new send and its wait come into view inside the pop-up, which scrolls; nothing outside it moves.
  useEffect(() => {
    const turn = [...(box.current?.querySelectorAll(".ai-explain-turn") ?? [])].at(-1);
    const scroller = turn?.closest(".look");
    if (!turn || !(scroller instanceof HTMLElement)) return;
    const room = scroller.getBoundingClientRect();
    const at = turn.getBoundingClientRect();
    if (at.bottom > room.bottom) scroller.scrollTop += Math.max(0, Math.min(at.bottom - room.bottom, at.top - room.top));
  }, [conversation.main.length, asking?.id]);

  /** Explain's part of its conversation: what an answer changed (the meanings, judged), Panki's notes under it, the chip going to the meanings, Try again sending again. */
  const latestJudging = judgingBefore(conversation)?.id;
  const explainOf: ConversationOf<Judging> = {
    chips: (made) => {
      const judging = made.changed[0];
      return judging ? [meaningsChip(judging.meanings, judging.proposed !== null, made.id === latestJudging ? "live" : "replaced")] : [];
    },
    notes: (made) => notesOf(made, conversation),
    canRun: canRun && !busy,
    onRetry: () => {
      if (retry) pressSend(retry, { kind: "retry" });
    },
    onGo: () => goToMeanings(box.current),
  };
  /**
   * Clear conversation: the word's conversation as the pop-up opened on it, no message, no call, the meanings unlit, the
   * actions and Video context length the defaults, nothing typed. What was read of the word stays.
   */
  function clearConversation() {
    setConversation(NO_CONVERSATION);
    setAsking(null);
    setFailure(null);
    setCalls([]);
    setJudging(false);
    setTicked(null);
    setTyped({ text: "" });
    setOpening(null);
    setRetry(null);
    setReachSet(null);
    setMarks([]);
    gate.cancel();
    counts.current = { runs: 0, messages: 0 };
  }
  const current: ExplainSend = { actions: [...lit], text: typed.text };
  const cost = settings && read && shown && sendable(current) ? MESSAGE_WORDS.upTo(prepared(current, settings, read).ceiling, shown.showCostOverMicros) : null;
  return (
    <AiConversation
      ref={box}
      always
      calls={calls}
      burst={0}
      busy={busy}
      failure={failure}
      onRunAgain={() => {
        if (retry) pressSend(retry, { kind: "retry" });
      }}
      standing={<StandingMessage text={shown?.instructions ?? ""} />}
      conversation={conversation}
      asking={asking}
      of={explainOf}
      marks={marks}
      foot={{
        id,
        asked: gate.at(FOOT),
        onCancel: gate.cancel,
        follow: null,
        composer: {
          place: "word",
          value: typed.text,
          error: typed.error,
          actions: switchesOf(book, lit, false),
          sending: busy,
          canSend: sendable(current),
          beside: reason ?? (!sendsLeft ? MESSAGES.noMore : cost),
          burst: sends,
          // On a video, how much of it the conversation hears, from the next message on, a note written where it changed.
          knobs: {
            reach: read?.around
              ? {
                  seconds: reachSet ?? DEFAULT_ACTION_SECONDS,
                  onChange: (seconds) => {
                    setReachSet(seconds);
                    setMarks((was) => [...was, { id: was.length + 1, after: mainRuns(conversation).length, words: KNOB_WORDS.reachFrom(seconds) }]);
                  },
                }
              : null,
            // And Clear conversation, always: greyed until there's something to clear (a call, a message, a note, one on its way).
            clear: {
              detail: MESSAGES.clearDetail,
              empty: calls.length === 0 && conversation.main.length === 0 && marks.length === 0 && asking === null,
              disabled: busy,
              onClear: clearConversation,
            },
          },
          onChange: (text) => setTyped({ text }),
          onToggle: (action) => {
            const parsed = AiActionId.safeParse(action);
            if (parsed.success) setTicked(lit.includes(parsed.data) ? lit.filter((each) => each !== parsed.data) : [...lit, parsed.data]);
          },
          onSend: sendFromComposer,
        },
      }}
    />
  );
}

const nothing = () => undefined;

/**
 * Explain on the options page: the made-up answer for the word shown, drawn as a send of Explain is, the composer at
 * its foot; for a word with none, the composer alone with Explain lit. Nothing in it answers a press, and nothing is
 * ever asked: the head's prompt is Panki's own.
 */
function ExampleExplain({ found, answers, onJudged }: { found: Found; answers: readonly ExampleAnswer[]; onJudged: Judged }) {
  const id = useId();
  const answer = answers.find((example) => example.term === found.term);
  // Only the meanings this browser's dictionaries have for the word.
  const meanings = answer?.meanings.filter((row) => found.senses[row.meaning - 1] !== undefined) ?? [];
  useEffect(() => {
    onJudged({ meanings, proposed: answer?.proposedMeaning ?? null, working: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);
  const opening = openingActionsOf(NO_ACCOUNT_ACTIONS, "word");
  // The head as an answered call has it, made of Panki's defaults and nothing measured: inert, its Details never open.
  const call = answeredCall(
    startCall({
      label: AI_ACTIONS.explain.name,
      why: { kind: "pressed", action: MESSAGE_WORDS.send },
      settings: DEFAULT_PANKI_AI,
      template: wordPromptOf(DEFAULT_PANKI_AI),
      pieces: { dictForm: found.term, learningLanguage: TRANSCRIBE_LANGUAGES.jpn, language: APP_LANGUAGES.eng },
      said: [],
      opening: explainSendPieces({ actions: opening, text: "" }, NO_ACCOUNT_ACTIONS),
      now: 0,
    }),
    { inputTokens: 0, outputTokens: 0, costMicros: 0, cut: false },
    0,
  );
  const proposed = answer?.proposedMeaning ?? null;
  const conversation: Conversation<Judging> = answer
    ? startConversation({ id: 1, run: AI_ACTIONS.explain.name, field: null, question: "", actions: [], reply: answer.text, said: [], changed: meanings.length > 0 || proposed ? [{ meanings, proposed }] : [] })
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
      always
      calls={answer ? [call] : []}
      burst={0}
      busy={false}
      failure={null}
      onRunAgain={nothing}
      conversation={conversation}
      asking={null}
      of={exampleOf}
      foot={{
        id,
        asked: null,
        onCancel: nothing,
        follow: null,
        composer: { place: "word", value: "", actions: switchesOf(NO_ACCOUNT_ACTIONS, answer ? [] : opening, false), sending: false, canSend: !answer, beside: null, burst: 0, onChange: nothing, onToggle: nothing, onSend: nothing },
      }}
    />
  );
}

/**
 * How Explain's latest answer judged the meanings, and the meaning it proposed when none fits (none of either before it
 * has answered): the pop-up lights its own meaning rows by it and draws the proposed one as one more row after them
 * (`Lookup.tsx` → `SenseRow`, `ProposedRow`).
 */
export type MeaningsJudged = {
  meanings: readonly JudgedMeaning[];
  proposed: ProposedMeaning | null;
  /** A message requiring the meanings judged is on its way: the pop-up's rows dimmed under the sweep, as the drawer dims the fields a message requires. */
  working: boolean;
};
export type Judged = (judged: MeaningsJudged) => void;

/** Explain for the word shown in the pop-up: asking Panki AI on a page, the made-up answers on the options page. */
export function Explain({ found, source, onJudged }: { found: Found; source: ExplainSource; onJudged: Judged }) {
  return source.kind === "example" ? <ExampleExplain found={found} answers={source.answers} onJudged={onJudged} /> : <LiveExplain found={found} source={source} onJudged={onJudged} />;
}
