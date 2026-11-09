/** @panki What Settings → Panki AI's explainers play, each action at work, made of the real pieces (`AiScene`). */
import { useId, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import {
  AI_ACTIONS,
  NO_ACCOUNT_ACTIONS,
  litNow,
  APP_LANGUAGES,
  DEFAULT_PANKI_AI,
  NO_CONVERSATION,
  TRANSCRIBE_LANGUAGES,
  aiModelOf,
  answeredCall,
  defaultTemplateOf,
  explainSendPieces,
  wordPromptOf,
  fieldVerdictOf,
  meaningsPiece,
  openingActionsOf,
  actionsFor,
  actionsOf,
  proofreadPieces,
  proofreadTokens,
  proofreadVerdicts,
  sendPieces,
  startCall,
  startConversation,
  tokenCostMicros,
  cardPromptOf,
  type AiPlaceId,
  type AiCall,
  type AiTemplate,
  type AiVerdict,
  type CallSteering,
  type ExplainSend,
  type TouchUpKey,
  type TouchUpSend,
  type FieldAnswer,
  type JudgedMeaning,
  type PankiAi,
  type PankiAiStatus,
  type PromptPieces,
  type ProofreadLineAnswer,
  type Settings,
} from "@panki/contracts";
import { AiConversation, StandingMessage, type ChangeChip } from "../components/AiConversation";
import { MESSAGE_WORDS } from "../components/AiRun";
import { AiStatus } from "../components/AiStatus";
import { AiSpark, AiWaiting } from "../components/AiWaiting";
import { Button } from "../components/Button";
import { Stage, type Spot, type Tools } from "../components/Explainer";
import { Icon } from "../components/Icon";
import { JudgedRow, meaningsChip } from "../components/JudgedRow";
import { PitchAccent } from "../components/PitchAccent";
import { TextField } from "../components/TextField";
import { Tied, TouchUpAll, fieldMarks, fieldShown } from "../components/TouchUp";
import { useHoist } from "../hooks/useHoist";
import { hmsWords } from "../words";
import { EXAMPLE_ANSWERS, EXAMPLE_SENTENCE, EXAMPLE_TRANSCRIPT, IN_DECKS, type HeardPart } from "./examples";
import { WATCH, WATCHED, WatchPage } from "./site";

/**
 * What Settings → Panki AI's explainers play (`components/Explainer.tsx`): each action at work on the video site, as the extension does it, made of the
 * same pieces (`AiConversation`, `AiStatus`, `JudgedRow`, `Composer`, `StandingMessage`, `TouchUpAll`, `Tied`,
 * `fieldShown`, `useHoist`) in the pop-up's and the drawer's own classes; Proofread's (AI step 6) on the Panki panel under the
 * player, whose looks are the extension's alone, so the scene draws it in shapes of its own (`app.css` → `.ex-under`),
 * its menu of the app's menu rows. They play as the account has Panki AI set: its User instructions, Proofread's
 * default template's name on its button, what a run can cost on the model an admin set, shown as Show the cost when a
 * run is over says. Every answer is made up (`examples.ts`), never asked of anyone. A new action is one entry in `AI_SCENES`.
 */

type SceneProps = {
  /** Panki AI as it stands; null while it loads, when Panki's defaults stand in. */
  ai: PankiAiStatus | null;
  /** Each place's default template as the account has it. */
  defaults: Settings["aiDefaults"];
  /** From what a run's cost is shown beside it (`Settings.aiShowCostOverMicros`). */
  showCostOver: number | null;
};

const nothing = () => undefined;

/** The word pointed at, the example deck's, as the examples' dictionary has it. */
const WORD = { term: IN_DECKS.words, reading: "きっさてん", pitch: 0 };
/** Its meanings in the examples' dictionary, as the pop-up lists them and `{Meaning}` numbers them. */
const MEANINGS = ["coffee shop; café", "tearoom; tea parlor", "teahouse (for the tea ceremony)"] as const;
/** What the made-up calls took, in the provider's tokens: what Details and the head's cost say. */
const TOKENS: Record<AiPlaceId, { input: number; output: number }> = {
  word: { input: 1_400, output: 320 },
  card: { input: 1_900, output: 240 },
  transcript: { input: 1_300, output: 180 },
};
/** The answer limit a made-up call is held to, as the server holds a real one of the place's. */
const ANSWER_LIMIT: Record<AiPlaceId, (settings: PankiAi) => number> = {
  word: (s) => s.aiMaxAnswerTokens,
  card: (s) => s.aiMaxTouchUpTokens,
  transcript: (s) => proofreadTokens(EXAMPLE_TRANSCRIPT.length, s.aiMaxProofreadTokens),
};
/** How long a made-up call thinks before its answer is in. */
const THINKING_MS = 1_700;

/** Panki AI's settings and what the account has, Panki's own while it loads. */
function standing(ai: PankiAiStatus | null): { settings: PankiAi; own: readonly AiTemplate[]; languages: PromptPieces } {
  return {
    settings: ai?.settings ?? DEFAULT_PANKI_AI,
    own: ai?.templates ?? [],
    languages: { learningLanguage: TRANSCRIBE_LANGUAGES[ai?.learningLanguage ?? "jpn"], language: APP_LANGUAGES[ai?.language ?? "eng"] },
  };
}

/**
 * A made-up call of `template`'s, as the page that made it tells of it: thinking, and once answered, what it came to
 * and, where Details list it, what it said (`said`: its verdicts and its answer as it came).
 */
function madeUpCall(
  place: AiPlaceId,
  template: Pick<AiTemplate, "name" | "prompt" | "followUp">,
  settings: PankiAi,
  pieces: PromptPieces,
  said?: { verdicts: readonly AiVerdict[]; raw: string },
  opening?: { pieces: PromptPieces; steering: CallSteering; pressed: string },
) {
  const started = startCall({
    label: template.name,
    why: { kind: "pressed", action: opening?.pressed ?? template.name },
    settings,
    template,
    pieces,
    said: [],
    ...(opening ? { opening: opening.pieces, steering: opening.steering } : {}),
    now: Date.now(),
    maxAnswerTokens: ANSWER_LIMIT[place](settings),
  });
  const { input, output } = TOKENS[place];
  const answered = (): AiCall =>
    answeredCall(
      started,
      { inputTokens: input, outputTokens: output, costMicros: tokenCostMicros(aiModelOf(settings), input, output), cut: false, ...(said ? { raw: said.raw } : {}) },
      started.sentAt + THINKING_MS,
      said?.verdicts ?? [],
    );
  return { started, answered };
}

/** Something inside a box that scrolls brought to its top, as reading on would: the page is scaled, the box's scroll isn't. */
function readOn(box: HTMLElement | null, el: Element | null, smooth: boolean) {
  if (!box || !el) return;
  const room = box.getBoundingClientRect();
  const scale = room.height / box.offsetHeight || 1;
  const top = box.scrollTop + (el.getBoundingClientRect().top - room.top) / scale - 12;
  box.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}

// ---------- Explain: the pop-up over Panki subtitles

/** The sentence over the video, the word pointed at in it. */
const [BEFORE, AFTER] = ((at) => [EXAMPLE_SENTENCE.slice(0, at), EXAMPLE_SENTENCE.slice(at + WORD.term.length)])(EXAMPLE_SENTENCE.indexOf(WORD.term));
const ANSWER = EXAMPLE_ANSWERS.find((answer) => answer.term === WORD.term);

/**
 * The pop-up over the word it's for, as the Word pop-up places it on a page: over the word where there's more
 * room above it than under (a word in the subtitles, low on the video), the word lit.
 */
function PopupOver({ at, box, children }: { at: Spot; box: (el: HTMLDivElement | null) => void; children: ReactNode }) {
  const lit: CSSProperties = { left: `calc(${at.left}% - 2px)`, top: `calc(${at.top}% - 1px)`, width: `calc(${at.right - at.left}% + 4px)`, height: `calc(${at.bottom - at.top}% + 2px)` };
  return (
    <>
      <span className="look-lit" style={lit} />
      <div ref={box} className="look" style={{ left: `${Math.min(at.left, 58)}%`, bottom: `calc(${100 - at.top}% + 6px)`, width: 420, maxHeight: `calc(${at.top}% - 18px)` }}>
        {children}
      </div>
    </>
  );
}

/** One of the word's meanings, as plain as the dictionary has it, or in Explain's verdict on it once it has one. */
function Meaning({ words, mark }: { words: string; mark: JudgedMeaning | undefined }) {
  if (!mark) return <li>{words}</li>;
  return (
    <JudgedRow as="li" judgement={mark.judgement} reason={mark.reason}>
      <span className="ai-judgement-words">{words}</span>
    </JudgedRow>
  );
}

/**
 * Explain: the key held over a word of Panki subtitles on a video, the pop-up opening and kept, its conversation's
 * composer with Explain lit, Send pressed, the spark turning while it thinks, the answer arriving with each meaning lit
 * in its verdict, one's reason opened, and the answer read on down the pop-up.
 */
function ExplainScene({ ai, showCostOver }: SceneProps) {
  const id = useId();
  const { settings, languages } = standing(ai);
  const instructions = ai?.instructions ?? "";
  const pieces: PromptPieces = { word: WORD.term, dictForm: WORD.term, dictReading: WORD.reading, dictMeaning: meaningsPiece(MEANINGS), sentence: EXAMPLE_SENTENCE, instructions, ...languages };
  // Panki's own actions, whatever the account made of them: the scene plays the feature as it comes.
  const send: ExplainSend = { actions: openingActionsOf(NO_ACCOUNT_ACTIONS, "word"), text: "" };
  const template = wordPromptOf(settings);
  const call = madeUpCall("word", template, settings, pieces, undefined, {
    pieces: explainSendPieces(send, NO_ACCOUNT_ACTIONS),
    steering: { instructions, actions: litNow(NO_ACCOUNT_ACTIONS, "word", send.actions).map((each) => each.name), typed: "" },
    pressed: MESSAGE_WORDS.send,
  });
  const [at, setAt] = useState<Spot | null>(null);
  const [calls, setCalls] = useState<readonly AiCall[]>([]);
  const [answered, setAnswered] = useState(false);
  const [burst, setBurst] = useState(0);
  const word = useRef<HTMLSpanElement | null>(null);
  const popup = useRef<HTMLDivElement | null>(null);
  const find = (selector: string) => popup.current?.querySelector(selector) ?? null;
  const script = async (t: Tools) => {
    setAt(null);
    setCalls([]);
    setAnswered(false);
    setBurst(0);
    const video = word.current?.closest(".ex-video") ?? null;
    t.frame(video);
    await t.move([40, 42], 450);
    await t.move(word.current, 550);
    // Panki subtitles' key to hold is the extension's own, on each computer: Shift, as it begins.
    t.hold("Shift");
    await t.wait(250);
    setAt(t.spot(word.current));
    await t.wait(60);
    t.frame(word.current, popup.current);
    await t.wait(900);
    // Let go on the word: the pop-up stays.
    t.letGo("Shift");
    await t.wait(350);
    await t.move(find(".composer-send"), 600);
    await t.click();
    setBurst(1);
    setCalls([call.started]);
    await t.wait(THINKING_MS);
    setCalls([call.answered()]);
    setAnswered(true);
    // The answer grows the pop-up up from the word, to as tall as the room over it: the camera takes it all in again.
    await t.wait(60);
    t.frame(word.current, popup.current);
    await t.wait(1100);
    const why = find(".judged-why");
    await t.move(why, 500);
    await t.click();
    if (why instanceof HTMLElement) why.click();
    await t.wait(1600);
    readOn(popup.current, find(".ai-status"), !t.still);
    await t.move(find(".ai-explain-answer"), 700);
    await t.wait(2600);
    if (t.still) return;
    await t.move([30, 30], 450);
    await t.click();
    setAt(null);
    t.frame();
    await t.wait(500);
  };
  /** The composer at the conversation's foot: Explain lit until Send, every action cleared once it's sent. */
  const sent = calls.length > 0;
  const composer = {
    place: "word" as const,
    value: "",
    actions: actionsOf(NO_ACCOUNT_ACTIONS, "word").map((each) => ({ id: each.id, name: each.name, on: !sent && send.actions.includes(each.id), disabled: false })),
    sending: sent && !answered,
    canSend: !sent,
    beside: sent ? null : MESSAGE_WORDS.upTo(call.started.ceilingMicros, showCostOver),
    burst,
    onChange: nothing,
    onToggle: nothing,
    onSend: nothing,
  };
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage
        paused={at !== null}
        video={
          <div className="ex-over">
            <div className="sub-band" lang="ja">
              {BEFORE}
              <span ref={word}>{WORD.term}</span>
              {AFTER}
            </div>
          </div>
        }
      >
        {at ? (
          <PopupOver
            at={at}
            box={(el) => {
              popup.current = el;
            }}
          >
            <article className="look-word">
              <header className="look-head">
                <span className="look-term" lang="ja">
                  <ruby>
                    {WORD.term}
                    <rt>{WORD.reading}</rt>
                  </ruby>
                </span>
                <PitchAccent reading={WORD.reading} position={WORD.pitch} className="look-pitch" />
                <Button className="look-add">
                  <Icon name="add" />
                  Add
                </Button>
              </header>
              <section className="look-dict">
                <span className="look-dict-name">Example</span>
                <ol className="look-senses">
                  {MEANINGS.map((words, i) => (
                    <Meaning key={words} words={words} mark={answered ? ANSWER?.meanings.find((row) => row.meaning === i + 1) : undefined} />
                  ))}
                </ol>
              </section>
              <AiConversation
                always
                calls={calls}
                burst={0}
                busy={sent && !answered}
                failure={null}
                onRunAgain={nothing}
                standing={<StandingMessage text={instructions} />}
                conversation={answered && ANSWER ? startConversation({ id: 1, run: template.name, field: null, question: "", actions: [], reply: ANSWER.text, said: [], changed: [ANSWER] }) : NO_CONVERSATION}
                asking={sent && !answered ? { id: 1, run: template.name, field: null, question: "", failure: null } : null}
                of={{
                  chips: (made) => made.changed.map((each) => meaningsChip(each.meanings, each.proposedMeaning !== null, "live")),
                  canRun: true,
                  onRetry: nothing,
                  onGo: nothing,
                }}
                foot={{ id: `${id}-composer`, asked: null, onCancel: nothing, follow: null, composer }}
              />
            </article>
          </PopupOver>
        ) : null}
      </WatchPage>
    </Stage>
  );
}

// ---------- Touch up: the drawer beside the video

/** The sentence as the subtitles had it, misheard where it says what was found; Touch up's proposal puts it right. */
const HEARD = EXAMPLE_SENTENCE.replace(`${WORD.term}を`, `${WORD.term}お`);
const MARKED = { from: EXAMPLE_SENTENCE.indexOf(WORD.term), to: EXAMPLE_SENTENCE.indexOf(WORD.term) + WORD.term.length };
/** What the made-up Touch up answers: the sentence could be better, and an Explanation for the field that was empty. */
const TOUCHED: { sentence: FieldAnswer; explanation: FieldAnswer } = {
  sentence: { judgement: "meh", proposed: EXAMPLE_SENTENCE, why: "The particle after 喫茶店 is を, marking what was found; お was misheard." },
  explanation: {
    judgement: null,
    proposed: "The older, sit-down kind of café, with coffee made slowly and often the same owner for decades; カフェ is the newer word.",
    why: "Nothing explained the word yet.",
  },
};

/** The made-up card's fields, by key, in its card type's order. */
const SCENE_FIELDS = ["word", "sentence", "explanation"] as const;
/** The Touch up keys the scene's deck maps: its composer shows their own actions. */
const SCENE_KEYS: readonly TouchUpKey[] = ["sentence", "explanation"];

/**
 * Touch up: a card being added in the drawer beside a paused video, its conversation's composer with Touch up lit, Send
 * pressed, the fields it judges reworked under the spark, then the head with Accept all and what the run changed, the
 * fields with a proposal at the top, a proposal under each; the sentence's accepted, its words now Panki AI's, its
 * field back in its place, and the Explanation's proposal read on down the drawer.
 */
function TouchUpScene({ ai, showCostOver }: SceneProps) {
  const id = useId();
  const { settings, languages } = standing(ai);
  const instructions = ai?.instructions ?? "";
  const pieces: PromptPieces = {
    word: WORD.term,
    dictForm: WORD.term,
    dictReading: WORD.reading,
    dictMeaning: meaningsPiece(MEANINGS),
    sentence: HEARD,
    source: `${WATCHED.title} · ${WATCHED.channel}`,
    instructions,
    ...languages,
  };
  const send: TouchUpSend = { actions: ["touchUp"], text: "", card: `Word: ${WORD.term}\nSentence [sentence]: ${HEARD}\nExplanation [explanation]: (empty)` };
  const template = cardPromptOf(settings);
  const call = madeUpCall("card", template, settings, pieces, undefined, {
    pieces: sendPieces(send, SCENE_KEYS, NO_ACCOUNT_ACTIONS),
    steering: { instructions, actions: [AI_ACTIONS.touchUp.name], typed: "" },
    pressed: MESSAGE_WORDS.send,
  });
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<readonly AiCall[]>([]);
  const [thinking, setThinking] = useState(false);
  const [runs, setRuns] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const drawer = useRef<HTMLElement | null>(null);
  const find = (selector: string) => drawer.current?.querySelector(selector) ?? null;
  const script = async (t: Tools) => {
    setOpen(false);
    setCalls([]);
    setThinking(false);
    setRuns(0);
    setAccepted(false);
    drawer.current?.scrollTo({ top: 0 });
    t.frame();
    await t.wait(300);
    setOpen(true);
    await t.wait(650);
    t.frame(drawer.current);
    await t.move(find(".composer-send"), 600);
    await t.click();
    setRuns(1);
    setThinking(true);
    setCalls([call.started]);
    await t.wait(THINKING_MS);
    setThinking(false);
    setCalls([call.answered()]);
    await t.wait(1100);
    const sentence = find(".touch-up-tied");
    readOn(drawer.current, sentence, !t.still);
    await t.wait(500);
    const accept = sentence?.querySelector(".touch-up-tools .btn-primary") ?? null;
    await t.move(accept, 650);
    await t.wait(400);
    await t.click();
    setAccepted(true);
    await t.wait(1300);
    const explanation = [...(drawer.current?.querySelectorAll(".touch-up-tied") ?? [])].at(-1) ?? null;
    readOn(drawer.current, explanation, !t.still);
    await t.wait(400);
    await t.move(explanation?.querySelector(".touch-up-diff") ?? null, 650);
    await t.wait(2200);
    if (t.still) return;
    setOpen(false);
    t.frame();
    await t.wait(700);
  };
  const answered = calls.length > 0 && !thinking;
  const ways = (waiting: boolean, onAccept: () => void) => ({ waiting, onAccept, onDismiss: nothing });
  const sentenceShown = answered ? fieldShown(fieldVerdictOf(TOUCHED.sentence, HEARD), HEARD, ways(!accepted, () => setAccepted(true))) : null;
  const explanationShown = answered ? fieldShown(fieldVerdictOf(TOUCHED.explanation, ""), "", ways(true, nothing)) : null;
  /** The fields as the drawer orders them: those whose proposal waits at the top, sliding back once decided. */
  const hoist = useHoist(SCENE_FIELDS, answered ? (accepted ? ["explanation"] : ["sentence", "explanation"]) : []);
  /** The run as the head's conversation has it: its press, then what it changed, a chip a field. */
  const changed: ChangeChip[] = [
    { id: "sentence", name: "Sentence", tone: "meh", state: accepted ? "accepted" : "live" },
    { id: "explanation", name: "Explanation", tone: "accent", state: "live" },
  ];
  const conversation = answered ? startConversation({ id: 1, run: template.name, field: null, question: "", actions: [], reply: "", said: [], changed }) : NO_CONVERSATION;
  /** The composer at the conversation's foot: Touch up lit until Send, every action cleared once it's sent. */
  const sent = calls.length > 0;
  const composer = {
    place: "card" as const,
    value: "",
    actions: actionsFor(NO_ACCOUNT_ACTIONS, SCENE_KEYS).map((each) => ({ id: each.id, name: each.name, on: !sent && each.id === "touchUp", disabled: false })),
    sending: thinking,
    canSend: !sent,
    beside: sent ? null : MESSAGE_WORDS.upTo(call.started.ceilingMicros, showCostOver),
    burst: runs,
    onChange: nothing,
    onToggle: nothing,
    onSend: nothing,
  };
  /** A field Touch up reworks: dimmed under the sweep while it thinks, then tied to what it says of it. */
  const touched = (shown: ReturnType<typeof fieldShown>, box: (labelEnd: ReactNode) => ReactNode) => {
    const inside = shown ? <Tied shown={shown}>{box}</Tied> : box(null);
    return thinking ? <AiWaiting label="Panki AI is touching up">{inside}</AiWaiting> : inside;
  };
  const fields: Record<string, ReactNode> = {
    word: <TextField id={`${id}-word`} label="Word" lang="ja" value={WORD.term} onChange={nothing} />,
    sentence: touched(sentenceShown, (labelEnd) => (
      <TextField
        id={`${id}-sentence`}
        label="Sentence"
        labelEnd={labelEnd}
        lang="ja"
        multiline
        value={accepted ? EXAMPLE_SENTENCE : HEARD}
        mark={MARKED}
        lead={fieldMarks(accepted)}
        onChange={nothing}
      />
    )),
    explanation: touched(explanationShown, (labelEnd) => <TextField id={`${id}-explanation`} label="Explanation" labelEnd={labelEnd} value="" onChange={nothing} />),
  };
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage paused={open}>
        <div className={`ex-drawer ${open ? "is-open" : ""}`.trim()}>
          <section
            ref={(el) => {
              drawer.current = el;
            }}
            className="panel capture"
            aria-label="Add to Panki"
          >
            <div className="capture-head">
              <h2 className="panel-title">Add to Panki</h2>
              <Button className="btn-icon" aria-label="Close">
                <Icon name="close" />
              </Button>
            </div>
            <div className="capture-body">
              <div ref={hoist.ref} className="add-form">
                <div className="capture-live capture-ends">
                  <Button variant="primary" className="capture-add">
                    <Icon name="add" />
                    Add to {IN_DECKS.deck}
                  </Button>
                </div>
                <AiConversation
                  className="field touch-up"
                  always
                  calls={calls}
                  burst={0}
                  busy={thinking}
                  failure={null}
                  onRunAgain={nothing}
                  tools={<TouchUpAll pending={answered ? (accepted ? 1 : 2) : 0} onAcceptAll={nothing} onDismissAll={nothing} />}
                  standing={<StandingMessage text={instructions} />}
                  conversation={conversation}
                  asking={calls.length > 0 && !answered ? { id: 1, run: template.name, field: null, question: "", failure: null } : null}
                  of={{ chips: (made) => made.changed, canRun: true, onRetry: nothing, onGo: hoist.go }}
                  foot={{ id: `${id}-composer`, asked: null, onCancel: nothing, follow: null, composer }}
                />
                {hoist.order.map((key) => (
                  <div key={key} className="capture-field" data-hoist={key}>
                    {fields[key]}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </WatchPage>
    </Stage>
  );
}

// ---------- Proofread: the Panki panel under the player, its Transcription menu

/** A line of the made-up transcript as the engine heard it, and as Proofread puts it right. */
const heardOf = (line: readonly HeardPart[]) => line.map((part) => (typeof part === "string" ? part : part.heard)).join("");
const proofreadOf = (line: readonly HeardPart[]) => line.map((part) => (typeof part === "string" ? part : part.proofread)).join("");
/**
 * The lines as Proofread is sent them (`proofreadPieces`, the server's own way of writing them): each part a word, the
 * engine unsure of the first two it misheard and sure of the third, which Proofread puts right all the same.
 */
const HEARD_WORDS = ((misheard) =>
  EXAMPLE_TRANSCRIPT.map((line) =>
    line.map((part) => {
      if (typeof part === "string") return { text: part, hand: false, unsure: false };
      misheard += 1;
      return { text: part.heard, hand: false, unsure: misheard <= 2 };
    }),
  ))(0);
/** What the made-up Proofread answers: every line, each corrected whole, with why (`ProofreadShape`). */
const PROOFREAD_LINES: readonly ProofreadLineAnswer[] = EXAMPLE_TRANSCRIPT.map((line, i) => ({
  line: i + 1,
  text: proofreadOf(line),
  reason: line.flatMap((part) => (typeof part === "string" ? [] : [part.reason])).join(" "),
}));
/** The made-up video's length, all of it transcribed, as the menu's first line says it. */
const VIDEO_SECONDS = 18 * 60 + 40;

/**
 * Proofread: the Panki panel under a video, its Transcription menu opened (Transcribed), Proofread the entire video
 * pressed in its Panki AI part, the rows dimmed while the spark turns in each one's pencil, the head Thinking then
 * Answered, the misheard words put right in place, each lit with a small spark, and the rows read on their own.
 */
function ProofreadScene({ ai, defaults, showCostOver }: SceneProps) {
  const { settings, own, languages } = standing(ai);
  const template = defaultTemplateOf("transcript", defaults, own);
  const pieces: PromptPieces = { ...proofreadPieces(HEARD_WORDS), source: `${WATCHED.title} · ${WATCHED.channel}`, ...languages };
  const call = madeUpCall("transcript", template, settings, pieces, { verdicts: proofreadVerdicts(PROOFREAD_LINES), raw: JSON.stringify({ lines: PROOFREAD_LINES }) });
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<readonly AiCall[]>([]);
  const [thinking, setThinking] = useState(false);
  const [burst, setBurst] = useState(0);
  const strip = useRef<HTMLDivElement | null>(null);
  const find = (selector: string) => strip.current?.querySelector(selector) ?? null;
  const script = async (t: Tools) => {
    setOpen(false);
    setCalls([]);
    setThinking(false);
    setBurst(0);
    t.frame(strip.current);
    await t.wait(400);
    await t.move(find(".ex-under-status"), 650);
    await t.click();
    setOpen(true);
    await t.wait(60);
    t.frame(strip.current, find(".ex-under-menu"));
    await t.wait(800);
    await t.move(find(".ex-under-proofread"), 600);
    await t.click();
    setBurst(1);
    setThinking(true);
    setCalls([call.started]);
    await t.wait(THINKING_MS);
    setThinking(false);
    setCalls([call.answered()]);
    await t.wait(1300);
    // A press outside the menu closes it, and the rows read on their own.
    await t.move(find(".ex-under-name"), 600);
    await t.click();
    setOpen(false);
    t.frame(strip.current);
    await t.wait(300);
    await t.move(find(".ex-under-ai"), 650);
    await t.wait(2400);
    if (t.still) return;
    t.frame();
    await t.wait(500);
  };
  const proofread = calls.length > 0 && !thinking;
  const upTo = MESSAGE_WORDS.upTo(call.started.ceilingMicros, showCostOver);
  const rows = EXAMPLE_TRANSCRIPT.map((line, i) => {
    const words = (
      <span className="ex-under-line" lang="ja">
        {line.map((part, j) =>
          typeof part === "string" ? (
            part
          ) : proofread ? (
            <span key={j} className="ex-under-ai">
              {part.proofread}
              <AiSpark className="ex-under-spark" />
            </span>
          ) : (
            part.heard
          ),
        )}
      </span>
    );
    return (
      <div key={heardOf(line)} className="ex-under-row">
        {thinking ? <AiWaiting label="Panki AI is proofreading">{words}</AiWaiting> : words}
        {thinking ? (
          <span className="ex-under-pencil">
            <AiSpark working />
          </span>
        ) : (
          <Button className="btn-icon ex-under-pencil" aria-label={`Edit line ${i + 1}`}>
            <Icon name="edit" />
          </Button>
        )}
      </div>
    );
  });
  return (
    <Stage site={WATCH} script={script}>
      <WatchPage
        under={
          <div ref={strip} className="ex-under">
            <div className="ex-under-head">
              <span className="ex-under-name">Panki</span>
              <div className="ex-under-tools">
                <Button className="ai-status-button is-ready ex-under-status" aria-expanded={open}>
                  <i className="ai-status-dot" aria-hidden="true" />
                  Transcribed
                  <Icon name="down" />
                </Button>
                {open ? (
                  <div className="menu ex-under-menu" role="dialog" aria-label="Transcription">
                    <p className="ex-under-covered">
                      {hmsWords(VIDEO_SECONDS)} transcribed <span className="is-all">(100%)</span>
                    </p>
                    <div className="ex-under-part">
                      {calls.length > 0 ? (
                        <AiStatus calls={calls} />
                      ) : (
                        <span className="ai-status-name">
                          <AiSpark />
                          Panki AI
                        </span>
                      )}
                      <Button variant="item" className="ex-under-proofread" disabled={thinking}>
                        <AiSpark working={thinking} burst={burst} />
                        Proofread the entire video
                        {upTo ? <span className="dropdown-note">{upTo}</span> : null}
                      </Button>
                      <Button variant="item">
                        <AiSpark />
                        Proofread a part…
                      </Button>
                    </div>
                    <div className="ex-under-part">
                      <span className="menu-title">Transcript</span>
                      <Button variant="item">
                        <Icon name="edit" />
                        Edit the transcript
                      </Button>
                      <Button variant="item">
                        <Icon name="again" />
                        Re-transcribe a part…
                      </Button>
                      <Button variant="item" className="is-danger">
                        <Icon name="trash" />
                        Forget the transcript…
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <Button className="btn-icon ex-under-more" aria-label="Panel settings">
                <Icon name="menu" />
              </Button>
            </div>
            <div className="ex-under-rows">{rows}</div>
          </div>
        }
      />
    </Stage>
  );
}

/** Each place's explainer, one entry each: a new place is a scene here. */
const AI_SCENES: Record<AiPlaceId, (props: SceneProps) => ReactElement> = { word: ExplainScene, card: TouchUpScene, transcript: ProofreadScene };

/** What a place's (?) on Settings → Panki AI plays. */
export function AiScene({ place, ...props }: SceneProps & { place: AiPlaceId }) {
  const Scene = AI_SCENES[place];
  return <Scene {...props} />;
}
