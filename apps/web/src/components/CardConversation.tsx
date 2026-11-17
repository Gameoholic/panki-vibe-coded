/** @panki A card's conversation with Panki AI on a card opened in a deck (`useCardConversation`): Touch up and every card action, each proposal accepted into the form or dismissed. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AiActionId,
  APP_LANGUAGES,
  ExplainError,
  NO_ACCOUNT_ACTIONS,
  NO_CONVERSATION,
  PIECE_MAX,
  PIECE_SOURCES,
  PROMPT_PIECE_IDS,
  ROLES,
  TOUCH_UP_ERRORS,
  TOUCH_UP_KEYS,
  TRANSCRIBE_LANGUAGES,
  TouchUpErrorId,
  actionNamesOf,
  actionsFor,
  answeredCall,
  asksSomething,
  cardPiece,
  cardPiecesOf,
  cardPromptOf,
  commit,
  commitsOf,
  failedCall,
  fieldVerdictOf,
  historyOf,
  isError,
  isTyped,
  keysFor,
  litNow,
  mapCommits,
  meaningVerdictOf,
  meaningsPiece,
  openingActionsOf,
  readMeaning,
  requiredFor,
  roleOf,
  roleOfKey,
  runNameOf,
  sendPieces,
  sendTokens,
  startCall,
  startConversation,
  stoppedCall,
  tidyMeaning,
  type AiCall,
  type AiMessageWhy,
  type AiUnread,
  type AiValueSource,
  type AiVerdict,
  type CardField,
  type CardType,
  type Commit,
  type Conversation,
  type ExplainProblem,
  type FieldKey,
  type FieldMap,
  type FieldVerdict,
  type MeaningVerdict,
  type PankiAi,
  type PankiAiStatus,
  type PieceGap,
  type PromptGaps,
  type PromptPieceId,
  type PromptPieces,
  type TouchUpAnswer,
  type TouchUpKey,
  type TouchUpNow,
  type TouchUpSend,
  type TouchedUp,
} from "@panki/contracts";
import { ApiError, api } from "../api";
import { MESSAGE_WORDS, ceilingOf, questionProblem, useAskFirst, useStop } from "./AiRun";
import { AiWaiting } from "./AiWaiting";
import { AiConversation, CONVERSATION_WORDS, ConversationTurns, STOPPED, type Asking, type ChipState, type ConversationFoot, type ConversationOf, type Failure, type Tone } from "./AiConversation";
import { TOUCH_UP_WORDS, Tied, TouchUpAll, fieldShown, meaningShown, proposalTone, proposes, touchUpReason, touchUpVerdicts, type Shown } from "./TouchUp";

/*
 * The card's conversation as the Card drawer has it (the extension's `ui/Panel.tsx`), over a card that's already there:
 * the same head, actions, composer, follow-ups under each field, proposals and Accept / Dismiss, drawn by the one
 * conversation (`AiConversation`). What's sent is the card's own fields through its card type's Field mapping: the word
 * and the Line from the fields that take them, every field Touch up judges in `{Card}`. What only a page or a video gives
 * (the dictionaries' data, the surrounding subtitles, the clip) isn't there, said so in Details, and so the Line is never
 * asked for: it's picked from subtitle lines. Accepting writes into the card's form as typing would, marked as Panki
 * AI's, and Save keeps it as any change to a card is kept.
 */

/** A send as it's pressed: where it was asked (null the composer, else a field's id), the actions lit, and what was typed. */
type Sent = { where: string | null; actions: readonly AiActionId[]; text: string };
/** What a send of the conversation read off the card: its pieces (`{Card}` among them), why each empty one is empty, and the card as it stood. */
type TouchRead = { pieces: PromptPieces; gaps: PromptGaps; meanings: string[]; now: TouchUpNow };
/** A proposal a commit made, kept with the commit: its key, the colour it was drawn in, and how it was decided, once it was. */
type Change = { key: TouchUpKey; tone: Tone; decided?: "accepted" | "dismissed" };

/** The card's conversation as the form holds it: its calls, its Conversation, every answer as later sends changed it, which proposals were decided. */
type Touch = {
  calls: readonly AiCall[];
  busy: false | "requiring" | "follow";
  working: readonly TouchUpKey[];
  failure: Failure | null;
  retry: Sent | null;
  ran: boolean;
  sends: number;
  opening: TouchUpSend | null;
  answer: TouchUpAnswer | null;
  meanings: readonly string[];
  decided: Partial<Record<TouchUpKey, true>>;
  now: TouchUpNow;
  hidden: Partial<Record<TouchUpKey, true>>;
  runs: number;
  first: TouchRead | null;
  conversation: Conversation<Change>;
  asking: Asking | null;
  asked: number;
};
const NO_TOUCH: Touch = {
  calls: [],
  busy: false,
  working: [],
  failure: null,
  retry: null,
  ran: false,
  sends: 0,
  opening: null,
  answer: null,
  meanings: [],
  decided: {},
  hidden: {},
  now: { values: {}, ticked: [] },
  runs: 0,
  first: null,
  conversation: NO_CONVERSATION,
  asking: null,
  asked: 0,
};

/** The Conversation with a key's proposal decided, on the latest commit that proposed for it. */
function settled(conversation: Conversation<Change>, key: TouchUpKey, how: "accepted" | "dismissed"): Conversation<Change> {
  const latest = commitsOf(conversation)
    .filter((each) => each.changed.some((change) => change.key === key))
    .at(-1);
  if (!latest) return conversation;
  return mapCommits(conversation, (each) =>
    each.id === latest.id ? { ...each, changed: each.changed.map((change) => (change.key === key && !change.decided ? { ...change, decided: how } : change)) } : each,
  );
}
/** The commit that last spoke to a key's proposal: one that made it or took it back; none, never proposed for. */
const lastSaidOn = (conversation: Conversation<Change>, key: TouchUpKey): Commit<Change> | undefined =>
  commitsOf(conversation)
    .filter((each) => each.changed.some((change) => change.key === key) || (each.withdrew ?? []).includes(key))
    .at(-1);
/** Whether a key's proposal stands: made by the commit that last spoke to it, and not decided since. */
const standing = (conversation: Conversation<Change>, key: TouchUpKey): boolean =>
  lastSaidOn(conversation, key)?.changed.some((change) => change.key === key && !change.decided) ?? false;
/** Where the composer sends from, beside the fields' own follow-ups. */
const BAR = "bar";
/** Where a send was asked, as the ask-first question and the typed boxes key it. */
const placeOf = (fieldId: string | null) => (fieldId === null ? BAR : `field:${fieldId}`);

/** What the conversation says on a card in Panki, one home: the Card drawer's own words. */
const TOUCH_WORDS = {
  message: "Message",
  noMore: "That's the most messages a card's conversation takes.",
  clearDetail: "Every message, its answers and any proposal still waiting go. What's on the card stays as it is.",
};

/** What only a page or a video gives, never on a card opened in Panki, and why each is empty: Details says it. */
const GAPS: PromptGaps = Object.fromEntries(
  PROMPT_PIECE_IDS.flatMap((id): [PromptPieceId, PieceGap][] => (PIECE_SOURCES[id] === "video" ? [[id, "notVideo"]] : PIECE_SOURCES[id] === "dictionary" ? [[id, "notLookedUp"]] : [])),
);

/** Panki AI as the account has it: unknown until it answers, or why it couldn't be told. */
type AiNow = { known: boolean; ai: PankiAiStatus | null; failure: string | null };

/** A refusal Panki explained, read off the error: its words, its problem, what it couldn't read, and Panki AI as it stands. */
function refusalOf(e: unknown): { message: string; problem: ExplainProblem | null; unread: AiUnread | null; ai: PankiAiStatus | null } {
  const said = e instanceof ApiError ? ExplainError.safeParse(e.body) : null;
  if (said?.success) return { message: said.data.error.message, problem: said.data.error.problem, unread: said.data.error.unread ?? null, ai: said.data.ai };
  return { message: e instanceof Error ? e.message : "Something went wrong.", problem: null, unread: null, ai: null };
}

export type CardConversationHost = {
  /** Whether the card has a conversation at all: off, nothing is asked of Panki and nothing is drawn. */
  on: boolean;
  /** The card's type, its Field mapping (`mapOf`) and its values as the form holds them now, by field id. */
  type: CardType;
  map: FieldMap;
  values: Readonly<Record<string, string>>;
  /** Something else holds the card just now (its Save on its way): nothing is sent or accepted meanwhile. */
  held: boolean;
  /** A proposal accepted: the field takes Panki AI's words as typing would, with their source (null where they're the field's own runs put in order). */
  write: (field: CardField, text: string, source: AiValueSource | null) => void;
  /** A chip or a branch's mark pressed: the field it's about is brought into view. */
  onGo: (fieldId: string) => void;
};

/**
 * The card's conversation, for a form to draw: `conversation` its head, its messages and its composer (nothing for a
 * card type with no field Touch up judges); `tied` a field with what Touch up says of it (a proposal as a diff with
 * Accept and Dismiss, Nothing to change as a tag) and its follow-ups under it; `reworked` a field dimmed while Panki
 * AI works on it; `touching` while a message is on its way, when nothing on the card is changed.
 */
export function useCardConversation({ on, type, map, values, held, write, onGo }: CardConversationHost) {
  const [ai, setAi] = useState<AiNow>({ known: false, ai: null, failure: null });
  const [touch, setTouch] = useState<Touch>(NO_TOUCH);
  const [ticked, setTicked] = useState<readonly AiActionId[] | null>(null);
  const [follows, setFollows] = useState<Record<string, { text: string; error?: string }>>({});
  const touchGate = useAskFirst();
  /** Each message on its way that Stop may cut, by its name. */
  const cutting = useRef(new Map<string, AbortController>());
  const touchStop = useStop((name) => cutting.current.get(name)?.abort());
  const roundIds = useRef(0);

  const readAi = () =>
    void api.getAi().then(
      (status) => setAi({ known: true, ai: status, failure: null }),
      (e: unknown) => setAi({ known: true, ai: null, failure: e instanceof Error ? e.message : "Something went wrong." }),
    );
  useEffect(() => {
    if (on) readAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const fieldOf = (role: keyof FieldMap) => type.fields.find((f) => f.id === map[role]) ?? null;
  const meaningField = fieldOf("dictMeaning");
  /** A key's field, when the card type maps one that's typed. */
  const keyField = (key: TouchUpKey): CardField | null => {
    const role = roleOfKey(key);
    const field = role ? fieldOf(role) : null;
    return field && isTyped(field.kind) ? field : null;
  };
  // The Line is answered as subtitle lines, which a card in Panki has none of.
  const touchKeys = TOUCH_UP_KEYS.filter((key) => keyField(key) !== null && key !== "line");
  const keyOfField = (fieldId: string): TouchUpKey | null => touchKeys.find((key) => keyField(key)?.id === fieldId) ?? null;
  const aiSettings = ai.ai?.settings ?? null;
  const book = ai.ai?.actions ?? NO_ACCOUNT_ACTIONS;
  const litActions = ticked ?? openingActionsOf(book, "card");
  const litOf = (ids: readonly AiActionId[]) => litNow(book, "card", ids);
  const canTouch = aiSettings !== null && aiSettings.aiOn && ai.ai?.key !== null && touchKeys.length > 0;
  const showCostOver = ai.ai ? ai.ai.showCostOverMicros : 0;
  const touchWhyNot = touchUpReason(ai.known, ai.ai, ai.failure);
  const begun = touch.conversation.main.length > 0;
  const laterSends = Math.max(0, commitsOf(touch.conversation).length - 1);
  const sendsLeft = !begun || (aiSettings !== null && laterSends < aiSettings.aiMaxFollowUps);
  const touching = touch.busy !== false;
  const still = held || touching;

  /** The card's word in words: the field the word goes in, else the field its cards are called by. */
  const wordNow = (): string => {
    const field = fieldOf("word") ?? type.fields.find((f) => f.id === type.mainField) ?? null;
    return field ? (values[field.id] ?? "").trim() : "";
  };
  const sentenceField = fieldOf("sentence");

  /** What a send reads: the word, the Line, the account's languages and its standing message, and the card as it stands, each field the send may change marked with its key. */
  function touchPieces(keys: readonly TouchUpKey[] = touchKeys): TouchRead {
    const meanings: string[] = [];
    const sentValue = (field: CardField) => (field.id === meaningField?.id ? tidyMeaning(values[field.id] ?? "") : (values[field.id] ?? ""));
    const sent: TouchUpNow["values"] = Object.fromEntries(
      touchKeys.flatMap((key) => {
        const field = keyField(key);
        return field ? [[key, sentValue(field)]] : [];
      }),
    );
    // The Meaning's runs are all its own here, with no dictionary's to set them against (`readMeaning`), each a row.
    const meaning = readMeaning(sent.meaning ?? "", meanings);
    const ticked = meaning.custom.map((_, i) => i + 1);
    const now: TouchUpNow = { values: sent, ticked };
    const card = cardPiece(
      type.fields
        .filter((f) => isTyped(f.kind))
        .map((f) => {
          const key = keyOfField(f.id);
          return { name: f.name, key: key && keys.includes(key) ? key : null, value: sentValue(f), ...(f.id === meaningField?.id ? { ticked } : {}) };
        }),
    );
    const languages = ai.ai ? { learningLanguage: TRANSCRIBE_LANGUAGES[ai.ai.learningLanguage], language: APP_LANGUAGES[ai.ai.language], instructions: ai.ai.instructions } : {};
    const all: PromptPieces = {
      word: wordNow(),
      dictMeaning: meaningsPiece(meanings, meaning.custom),
      sentence: sentenceField ? (values[sentenceField.id] ?? "") : "",
      ...languages,
      card,
    };
    const pieces: PromptPieces = Object.fromEntries(Object.entries(all).flatMap(([id, text]) => (text?.trim() ? [[id, text.slice(0, PIECE_MAX)]] : [])));
    return { pieces, gaps: GAPS, meanings, now };
  }

  /** A send made ready, the same for the call and for what it can cost before the press. */
  function prepared(sent: Sent, settings: PankiAi) {
    const lit = litOf(sent.actions);
    const run = runNameOf(book, "card", sent.actions);
    const keys = keysFor(touchKeys);
    const required = requiredFor(touchKeys, lit);
    const read = touchPieces(keys);
    const field = sent.where ? type.fields.find((f) => f.id === sent.where) : undefined;
    const send: TouchUpSend = { actions: [...sent.actions], text: sent.text.trim(), card: read.pieces.card ?? "", ...(field ? { field: field.name } : {}) };
    const opening = begun && touch.opening ? touch.opening : send;
    const first = begun && touch.first ? touch.first : read;
    const said = begun ? historyOf(touch.conversation, sent.where) : [];
    const template = cardPromptOf(settings);
    const maxTokens = sendTokens(settings.aiMaxTouchUpTokens, touchKeys, lit, send.text);
    const asking = begun ? sendPieces(send, touchKeys, book) : {};
    const ceiling = ceilingOf(settings, template, cardPiecesOf(first.pieces), said, asking, maxTokens, sendPieces(opening, touchKeys, book));
    return { run, required, read, send, opening, first, said, template, maxTokens, asking, ceiling };
  }
  const sendable = (sent: Sent) => canTouch && touch.busy === false && !held && sendsLeft && asksSomething(touchKeys, litOf(sent.actions), sent.text);

  /** What an answer changed: each key it proposes for, with the colour its proposal is drawn in. */
  function changesOf(answer: TouchUpAnswer, now: TouchUpNow, meanings: readonly string[]): Change[] {
    return touchKeys.flatMap((key): Change[] => {
      let verdict: FieldVerdict | MeaningVerdict | null = null;
      if (key === "meaning") verdict = answer.meaning ? meaningVerdictOf(answer.meaning, now, meanings) : null;
      else {
        const part = answer[key];
        verdict = part ? fieldVerdictOf(part, now.values[key] ?? "") : null;
      }
      const tone = verdict ? proposalTone(verdict) : null;
      return tone ? [{ key, tone }] : [];
    });
  }
  /** A reply's commit with the proposals it took back: each key it answered again with nothing proposed whose proposal stood until then. */
  function withdrawing(conversation: Conversation<Change>, made: Commit<Change>, answered: readonly TouchUpKey[]): Commit<Change> {
    const failed = new Set((made.aside ?? []).map((each) => each.part));
    const withdrew = answered.filter((key) => !made.changed.some((change) => change.key === key) && !failed.has(key) && standing(conversation, key));
    return withdrew.length > 0 ? { ...made, withdrew } : made;
  }

  /** One send of the conversation, from the composer or from a field's follow-up, on the card as it stands. */
  async function sendTouch(sent: Sent, why: AiMessageWhy) {
    if (!aiSettings || !sendable(sent)) return;
    const ready = prepared(sent, aiSettings);
    const { run, required, read, send, opening, first, said } = ready;
    const firstSend = !begun;
    const runs = touch.runs + (run !== null ? 1 : 0);
    const call = startCall({
      label: run !== null ? (runs === 1 ? run : `${run} ${runs}`) : `${TOUCH_WORDS.message} ${touch.asked + 1}`,
      why,
      settings: aiSettings,
      template: ready.template,
      pieces: cardPiecesOf(first.pieces),
      gaps: first.gaps,
      said,
      asking: ready.asking,
      opening: sendPieces(opening, touchKeys, book),
      now: Date.now(),
      maxAnswerTokens: ready.maxTokens,
      steering: { instructions: ai.ai?.instructions ?? "", actions: litOf(sent.actions).map((action) => action.name), typed: send.text },
    });
    const pending: Asking = { id: ++roundIds.current, run, field: sent.where, question: send.text, actions: actionNamesOf(book, "card", sent.actions), failure: null };
    setTouch((was) => ({
      ...was,
      calls: [...was.calls, call],
      busy: required.length > 0 ? "requiring" : "follow",
      working: required,
      failure: null,
      retry: null,
      sends: was.sends + 1,
      runs,
      asked: run !== null ? was.asked : was.asked + 1,
      asking: pending,
      ...(firstSend ? { first: read, opening: send, meanings: read.meanings } : {}),
    }));
    const stop = touchStop.begin(() =>
      setTouch((was) => ({
        ...was,
        calls: was.calls.map((each) => (each === call ? stoppedCall(call, Date.now()) : each)),
        busy: false,
        working: [],
        retry: sent,
        ...(firstSend ? { failure: STOPPED, asking: null } : { asking: { ...pending, failure: STOPPED } }),
      })),
    );
    const controller = new AbortController();
    cutting.current.set(stop, controller);
    let done: TouchedUp | null = null;
    let refused: ReturnType<typeof refusalOf> | null = null;
    try {
      done = (await api.touchUp({ pieces: first.pieces, meanings: first.meanings, keys: touchKeys, now: read.now, opening, said, ...(firstSend ? {} : { send }) }, controller.signal)).touchUp;
    } catch (e) {
      refused = refusalOf(e);
    } finally {
      cutting.current.delete(stop);
    }
    if (!touchStop.end(stop)) return;
    const now = Date.now();
    if (!done) {
      const message = refused?.message ?? "Something went wrong.";
      const failed = failedCall(call, message, now, refused?.unread ?? null);
      const failure = { message, retry: refused?.problem === "provider" };
      setTouch((was) => ({
        ...was,
        calls: was.calls.map((each) => (each === call ? failed : each)),
        busy: false,
        working: [],
        retry: sent,
        ...(firstSend ? { failure, asking: null } : { asking: { ...pending, failure } }),
      }));
      if (refused?.ai) setAi({ known: true, ai: refused.ai, failure: null });
      else readAi();
      return;
    }
    const answered = done;
    const reply: AiVerdict[] = answered.reply !== "" ? [{ name: "Answer", tag: null, value: answered.reply, reason: "" }] : [];
    const finished = answeredCall(call, { ...answered, cut: false }, now, [...reply, ...touchUpVerdicts(answered.answer, read.now, first.meanings)]);
    const changed = TOUCH_UP_KEYS.filter((key) => answered.answer[key] !== undefined);
    const without = (marks: Partial<Record<TouchUpKey, true>>) => Object.fromEntries(Object.entries(marks).filter(([key]) => !changed.some((each) => each === key)));
    const made: Commit<Change> = {
      id: pending.id,
      run: pending.run,
      field: sent.where,
      question: send.text,
      actions: pending.actions ?? [],
      reply: answered.reply,
      said: [...(firstSend ? [] : [{ role: "user" as const, text: answered.asked || send.text }]), { role: "assistant" as const, text: answered.raw || JSON.stringify({ reply: answered.reply, ...answered.answer }) }],
      changed: changesOf(answered.answer, read.now, first.meanings),
      aside: touchKeys.flatMap((key) => {
        const part = answered.answer[key];
        return part && isError(part) ? [{ part: key, error: part.error }] : [];
      }),
    };
    setTouch((was) => ({
      ...was,
      calls: was.calls.map((each) => (each === call ? finished : each)),
      busy: false,
      working: [],
      ran: was.ran || run !== null || changed.length > 0,
      answer: { ...(was.answer ?? {}), ...answered.answer },
      now: {
        values: { ...was.now.values, ...Object.fromEntries(changed.map((key) => [key, read.now.values[key] ?? ""])) },
        ticked: answered.answer.meaning ? read.now.ticked : was.now.ticked,
      },
      decided: without(was.decided),
      hidden: without(was.hidden),
      conversation: firstSend ? startConversation(made) : commit(was.conversation, sent.where, withdrawing(was.conversation, made, changed)),
      asking: null,
    }));
    readAi();
  }

  /** A send pressed: at once, or asking first over the account's Ask before a message is over. */
  function pressSend(sent: Sent, why: AiMessageWhy, then?: () => void) {
    if (!ai.ai || !aiSettings || !sendable(sent)) return;
    const micros = prepared(sent, aiSettings).ceiling;
    touchGate.press(ai.ai.askOverMicros, placeOf(sent.where), micros, MESSAGE_WORDS.sendFor(micros), () => {
      then?.();
      void sendTouch(sent, why);
    });
  }
  /** What's typed where it's sent from, checked, then sent with the actions lit there. */
  function sendFrom(fieldId: string | null) {
    const where = placeOf(fieldId);
    const text = (follows[where]?.text ?? "").trim();
    const actions = fieldId === null ? litActions : [];
    const problem = aiSettings ? (fieldId === null && text === "" ? null : questionProblem(text, aiSettings.aiMaxQuestionChars)) : null;
    if (problem !== null) {
      setFollows((was) => ({ ...was, [where]: { text: was[where]?.text ?? "", error: problem } }));
      return;
    }
    const field = fieldId ? type.fields.find((f) => f.id === fieldId) : undefined;
    const why: AiMessageWhy = fieldId === null ? { kind: "pressed", action: MESSAGE_WORDS.send } : field ? { kind: "message", field: field.name } : { kind: "message" };
    pressSend({ where: fieldId, actions, text }, why, () => {
      setFollows((was) => ({ ...was, [where]: { text: "" } }));
      if (fieldId === null) setTicked([]);
    });
  }
  const clearTouch = () => {
    setTouch(NO_TOUCH);
    setFollows({});
    setTicked(null);
    touchGate.cancel();
  };

  /** How a commit's proposal for a key stands, on its chip. */
  function chipState(made: Commit<Change>, change: Change): { state: ChipState; by?: number } {
    if (change.decided) return { state: change.decided };
    const last = lastSaidOn(touch.conversation, change.key);
    if (last?.id === made.id) return { state: waiting(change.key) ? "live" : "replaced" };
    return last && (last.withdrew ?? []).includes(change.key) ? { state: "withdrawn", by: last.id } : { state: "replaced" };
  }
  const fieldPlace = (fieldId: string) => type.fields.findIndex((f) => f.id === fieldId);
  const touchOf: ConversationOf<Change> = {
    chips: (made) => {
      const failed = new Set((made.aside ?? []).map((each) => each.part));
      return made.changed
        .flatMap((change) => {
          const field = failed.has(change.key) ? null : keyField(change.key);
          return field ? [{ id: field.id, name: field.name, tone: change.tone, ...chipState(made, change) }] : [];
        })
        .sort((a, b) => fieldPlace(a.id) - fieldPlace(b.id));
    },
    withdrew: (made) =>
      (made.withdrew ?? [])
        .flatMap((part) => {
          const key = TOUCH_UP_KEYS.find((each) => each === part);
          const field = key ? keyField(key) : null;
          return field ? [{ id: field.id, name: field.name }] : [];
        })
        .sort((a, b) => fieldPlace(a.id) - fieldPlace(b.id)),
    failed: (made) =>
      (made.aside ?? [])
        .flatMap(({ part, error }) => {
          const key = TOUCH_UP_KEYS.find((each) => each === part);
          const why = TouchUpErrorId.safeParse(error);
          const field = key ? keyField(key) : null;
          return field && why.success ? [{ id: field.id, name: field.name, why: TOUCH_UP_ERRORS[why.data] }] : [];
        })
        .sort((a, b) => fieldPlace(a.id) - fieldPlace(b.id)),
    fieldName: (fieldId) => type.fields.find((f) => f.id === fieldId)?.name ?? null,
    canRun: canTouch && touch.busy === false && !held,
    onRetry: () => {
      if (touch.retry) pressSend(touch.retry, { kind: "retry" });
    },
    onGo,
  };
  const costOf = (sent: Sent): string | null => (aiSettings && canTouch ? MESSAGE_WORDS.upTo(prepared(sent, aiSettings).ceiling, showCostOver) : null);

  /** Where the conversation is sent from: under it the composer, always there; under a field, its follow-up once a run has answered. */
  function footOf(fieldId: string | null): ConversationFoot | null {
    const where = placeOf(fieldId);
    const typed = follows[where] ?? { text: "" };
    const onChange = (text: string) => setFollows((was) => ({ ...was, [where]: { text } }));
    const base = { id: `card-follow-${where.replace(":", "-")}`, asked: touchGate.at(where), onCancel: touchGate.cancel };
    if (fieldId === null) {
      const sent: Sent = { where: null, actions: litActions, text: typed.text };
      return {
        ...base,
        follow: null,
        composer: {
          place: "card",
          value: typed.text,
          error: typed.error,
          actions: actionsFor(book, touchKeys).map((action) => ({ id: action.id, name: action.name, on: litActions.includes(action.id), disabled: false })),
          sending: touching,
          canSend: sendable(sent),
          beside: touchWhyNot ?? (!sendsLeft ? TOUCH_WORDS.noMore : sendable(sent) ? costOf(sent) : null),
          burst: touch.sends,
          // No video here, so no Video context length; Clear conversation, always.
          knobs: {
            reach: null,
            clear: {
              detail: TOUCH_WORDS.clearDetail,
              empty: touch.calls.length === 0 && touch.conversation.main.length === 0 && touch.asking === null,
              disabled: touching,
              onClear: clearTouch,
            },
          },
          onChange,
          onToggle: (id) => {
            const action = AiActionId.safeParse(id);
            if (action.success) setTicked(litActions.includes(action.data) ? litActions.filter((each) => each !== action.data) : [...litActions, action.data]);
          },
          onSend: () => sendFrom(null),
          onStop: touchStop.onStop,
        },
      };
    }
    if (!touch.ran) return null;
    const sent: Sent = { where: fieldId, actions: [], text: typed.text };
    return {
      ...base,
      follow:
        canTouch && touch.busy === false && sendsLeft
          ? { nested: true, small: true, value: typed.text, error: typed.error, disabled: held, beside: costOf(sent), onChange, onAsk: () => sendFrom(fieldId) }
          : null,
    };
  }
  const followBlock = (fieldId: string): ReactNode => <ConversationTurns conversation={touch.conversation} asking={touch.asking} where={fieldId} of={touchOf} foot={footOf(fieldId)} />;

  const lastCall = touch.calls[touch.calls.length - 1];
  /** Where a value Panki AI wrote came from: Touch up, on the model the call ran on. */
  const aiSourceOf = (): AiValueSource | null => (lastCall ? { by: "ai", place: "card", provider: lastCall.provider, model: lastCall.model } : null);
  const heldNow = (key: FieldKey): string => {
    const field = keyField(key);
    return field ? (values[field.id] ?? "") : "";
  };
  const fieldVerdict = (key: FieldKey) => {
    const part = touch.answer?.[key];
    return part ? fieldVerdictOf(part, heldNow(key)) : null;
  };
  const meaningVerdict = () => (touch.answer?.meaning ? meaningVerdictOf(touch.answer.meaning, touch.now, touch.meanings) : null);
  /** The Meaning has changed since it was judged: what was said of it is about words no longer there. */
  const meaningMoved = meaningField !== null && touch.answer?.meaning !== undefined && tidyMeaning(values[meaningField.id] ?? "") !== (touch.now.values.meaning ?? "");
  function waiting(key: TouchUpKey): boolean {
    if (touch.decided[key] || keyField(key) === null || (key === "meaning" && meaningMoved)) return false;
    const verdict = key === "meaning" ? meaningVerdict() : fieldVerdict(key);
    return verdict !== null && proposes(verdict);
  }
  const decide = (key: TouchUpKey, how: "accepted" | "dismissed") => setTouch((was) => ({ ...was, decided: { ...was.decided, [key]: true }, conversation: settled(was.conversation, key, how) }));
  /** Panki AI's words into their field: its own where only Touch up fills the field, a correction anywhere else. */
  function writeAi(field: CardField, text: string) {
    const role = roleOf(map, field.id);
    const source = aiSourceOf();
    write(field, text, source && (role === null || ROLES[role].from !== "ai") ? { ...source, corrected: true } : source);
  }
  /** A proposal accepted: the Meaning's own runs put in order, or the AI's words written in. */
  function accept(key: TouchUpKey) {
    const field = keyField(key);
    if (!field || held) return;
    if (key === "meaning") {
      const verdict = meaningVerdict();
      if (verdict?.kind === "change") write(field, verdict.accepted, null);
      else if (verdict?.kind === "propose" && verdict.proposed) writeAi(field, verdict.proposed);
    } else {
      const verdict = fieldVerdict(key);
      if (verdict && "proposed" in verdict) writeAi(field, verdict.proposed);
    }
    decide(key, "accepted");
  }
  const pendingKeys = touchKeys.filter(waiting);
  const allHidden = () => Object.fromEntries(touchKeys.map((key) => [key, true]));
  const acceptAll = () => {
    for (const key of pendingKeys) accept(key);
    setTouch((was) => ({ ...was, hidden: allHidden() }));
  };
  const dismissAll = () =>
    setTouch((was) => ({
      ...was,
      hidden: allHidden(),
      decided: { ...was.decided, ...Object.fromEntries(pendingKeys.map((key) => [key, true])) },
      conversation: pendingKeys.reduce((conversation, key) => settled(conversation, key, "dismissed"), was.conversation),
    }));

  function touchShown(field: CardField): Shown | null {
    const key = keyOfField(field.id);
    if (!key || !touch.answer || touch.hidden[key]) return null;
    const ways = { waiting: waiting(key), onAccept: () => accept(key), onDismiss: () => decide(key, "dismissed") };
    if (key === "meaning" && meaningMoved) return null;
    const meaning = key === "meaning" ? meaningVerdict() : null;
    if (meaning) return meaningShown(meaning, ways);
    if (key === "meaning" || touch.decided[key]) return null;
    const verdict = fieldVerdict(key);
    return verdict ? fieldShown(verdict, heldNow(key), ways, key) : null;
  }
  /** A field and what Touch up says of it as one shape, its follow-ups under it once a run has answered. */
  function tied(field: CardField, box: (labelEnd: ReactNode) => ReactNode): ReactNode {
    const shown = touchShown(field);
    if (shown) {
      return (
        <Tied shown={shown} more={followBlock(field.id)}>
          {box}
        </Tied>
      );
    }
    const asked = touch.conversation.branches.has(field.id) || touch.asking?.field === field.id || (touch.ran && keyOfField(field.id) !== null);
    if (asked || (meaningMoved && keyOfField(field.id) === "meaning" && !touch.hidden.meaning)) {
      return (
        <>
          {box(null)}
          {followBlock(field.id)}
        </>
      );
    }
    return box(null);
  }
  const followingField = touch.busy === "follow" && touch.asking !== null && touch.asking.failure === null ? touch.asking.field : null;
  /** A field Panki AI is working on, dimmed under the sweep. */
  const reworked = (fieldId: string, inside: ReactNode): ReactNode => {
    const key = keyOfField(fieldId);
    if (key === null) return inside;
    if (touch.busy === "requiring" && touch.working.includes(key)) return <AiWaiting label={TOUCH_UP_WORDS.working}>{inside}</AiWaiting>;
    if (followingField === fieldId) return <AiWaiting label={CONVERSATION_WORDS.answering}>{inside}</AiWaiting>;
    return inside;
  };

  const conversation =
    on && touchKeys.length > 0 ? (
      <AiConversation
        className="field touch-up"
        always
        calls={touch.calls}
        burst={0}
        busy={still}
        failure={touch.failure}
        onRunAgain={() => {
          if (touch.retry) pressSend(touch.retry, { kind: "retry" });
        }}
        tools={<TouchUpAll pending={pendingKeys.length} onAcceptAll={acceptAll} onDismissAll={dismissAll} />}
        conversation={touch.conversation}
        asking={touch.asking}
        of={touchOf}
        foot={footOf(null)}
      />
    ) : null;

  return { conversation, tied, reworked, touching };
}
