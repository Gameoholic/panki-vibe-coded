import { useEffect, useId, useState, type ReactNode } from "react";
import { AI_PROVIDERS, PIECE_GAPS, PIECE_SOURCES, SOURCE_WORDS, modelWords, verdictLine, type AiCall, type AiRunWhy, type AiVerdict, type PieceUse } from "@panki/contracts";
import { count, estimateWords, langOf } from "../words";
import { AiSpark } from "./AiWaiting";
import { Button } from "./Button";
import { Fold } from "./Fold";
import { Icon } from "./Icon";

/**
 * The AI's status, the one head over everything Panki AI does on a page (the owner, 2026-10-30, of the transcribing
 * status they like on a video's page: "small or unnoticeable enough that a normal user never feels it's redundant
 * information"). The spark and "Panki AI", and at the right the status as a button, a dot and a word lightly tinted
 * (the strip menu's look, smaller), with the cost beside it; pressed, it unfolds Details under it (the owner: "remove
 * the details, make the answered… button the dropdown"): how the call stands, why it ran, the model, the tokens and the
 * cost always open, then two alike folds, closed to begin with (the owner, 2026-10-31): Prompt context, every piece the
 * template asked for with what it held or why it held nothing (the one place the owner sees what a piece really was),
 * and the Log, every message as sent and every answer as it came, one that couldn't be used among them; and Copy. Never
 * open by itself; closed again whenever what holds it is drawn afresh (a pop-up opened on another word). Drawn once a
 * call exists; before that the action's own button, and what it says beside it, is the status.
 */

/** How a call stands on the button: its word, and the look that tints it (the strip menu's `LOOKS`, by name). */
const STATUS = {
  thinking: { words: "Thinking", look: "going" },
  answered: { words: "Answered", look: "ready" },
  failed: { words: "Failed", look: "trouble" },
} as const;

/** What Details say, one home. */
const WORDS = {
  cut: "cut short at the answer limit",
  unknown: "not a Prompt context name, sent as typed",
  noTokens: "None came back",
  counting: "Counted once it answers",
  nothingMetered: "Nothing metered: no answer came back",
  copied: "Copied",
  couldNotCopy: "Couldn't copy",
};

/** How often Details are drawn afresh while a call they show is on its way, for its seconds, in ms. */
const TICK_MS = 250;

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const n = (count: number) => count.toLocaleString("en");

function whyWords(why: AiRunWhy): string {
  switch (why.kind) {
    case "pressed":
      return `You pressed ${why.action}`;
    case "followUp":
      return why.field ? `You asked a follow-up on ${why.field}` : "You asked a follow-up";
    case "retry":
      return "You pressed Try again";
  }
}

/**
 * What went, in the owner's terms: the prompt, the answers sent back with it and the follow-ups ("Prompt, 2 answers and
 * 2 follow-ups"). Counted as "messages" it read wrong to them, and as the prompt and follow-ups alone it left the
 * answers out (the owner, 2026-10-30).
 */
function sentWords(call: AiCall): string {
  const answers = call.said.filter((m) => m.role === "assistant").length;
  const asked = call.said.filter((m) => m.role === "user").length;
  if (asked === 0) return "Prompt";
  return `Prompt, ${count(answers, "answer", "answers")} and ${count(asked, "follow-up", "follow-ups")}`;
}

/**
 * The Log, the whole exchange of a call: every message in order, each in a box of its own under who said it (Panki's
 * prompt, Panki AI's answer, Your follow-up), ending with this call's own answer once it's in, or, for one that came
 * back and couldn't be used, that answer as it came (the owner, 2026-10-31: "it shows what Panki AI answered even when
 * the answer failed"). Every answer that read is drawn the same way, its own call's or an earlier one sent back with
 * it, whichever shape it answered in: the list, Raw folded under it (`AnswerView`; the owner, 2026-10-31). A failure is
 * never a turn: it's Panki's own note after them (`failureOf`, `LogFailure`). Full prompt until the owner, 2026-10-30,
 * asked for all of it; Conversation until 2026-10-31. A call is a list of messages, not one text.
 */
const SAID_BY = { prompt: "Panki's prompt", assistant: "Panki AI's answer", user: "Your follow-up" } as const;
/**
 * A message of the Log: who said it, its text exactly as it went or came, and, for an answer that read, its parts as
 * the list draws them (null for what isn't one: the prompt, a question, an answer that couldn't be used, as it came).
 */
/** `json`: an answer that couldn't be used, drawn indented as Raw is when it parses (`pretty`; the owner, 2026-10-31), as it came when it doesn't. */
type Said = { by: string; text: string; verdicts: readonly AiVerdict[] | null; json?: boolean };
/**
 * An earlier answer's parts: the call it was the answer of tells them, found by its text (a follow-up sends each answer
 * back as it came); one no call of these holds is read off its JSON, a row a key.
 */
function verdictsOf(text: string, calls: readonly AiCall[]): readonly AiVerdict[] {
  for (const each of calls) if (each.outcome.kind === "answered" && each.outcome.raw === text) return each.outcome.verdicts;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    return Object.entries(value).map(([name, part]) => ({ name, tag: null, value: typeof part === "string" ? part : JSON.stringify(part, null, 2), reason: "" }));
  } catch {
    return [];
  }
}
function logOf(call: AiCall, calls: readonly AiCall[]): Said[] {
  const { outcome } = call;
  return [
    { by: SAID_BY.prompt, text: call.prompt, verdicts: null },
    ...call.said.map((m) => ({ by: SAID_BY[m.role], text: m.text, verdicts: m.role === "assistant" ? verdictsOf(m.text, calls) : null })),
    ...(outcome.kind === "answered" && outcome.raw !== "" ? [{ by: SAID_BY.assistant, text: outcome.raw, verdicts: outcome.verdicts }] : []),
    ...(outcome.kind === "failed" && outcome.unread ? [{ by: SAID_BY.assistant, text: outcome.unread.raw, verdicts: null, json: true }] : []),
  ];
}

/**
 * A failed call's failure as the Log ends with it, whether an answer came back or none did (the key refused, too long
 * to answer): the plain message and, when there is one, the technical reason. One shape for every failure.
 */
function failureOf(call: AiCall): { message: string; detail: string } | null {
  const { outcome } = call;
  return outcome.kind === "failed" ? { message: outcome.message, detail: outcome.unread?.detail ?? "" } : null;
}
const LOG_ERROR = "Error";
/**
 * The failure in the Log (the owner, 2026-10-31: it "reads like a part of the conversation when it isn't"): Panki's own
 * note set apart from the turns, in the danger colours as the status's Failed, the `alert` sign and "Error" in place of
 * a speaker, the plain message and the technical reason under it in small type.
 */
function LogFailure({ message, detail }: { message: string; detail: string }) {
  return (
    <div className="ai-details-failure" role="note">
      <span className="ai-details-failure-tag">
        <Icon name="alert" />
        {LOG_ERROR}
      </span>
      <p>{message}</p>
      {detail !== "" ? <small className="ai-details-note">{detail}</small> : null}
    </div>
  );
}
/** An answer's JSON indented to be read (the owner, 2026-10-31); as it came when it isn't JSON. Copy keeps it as it came. */
function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * This call's own answer in the Log, the owner's pick (4 of https://claude.ai/artifact/1wEsGSSpJ24sAFmPgSgWck,
 * 2026-10-31): a row a part of its fixed shape, its name, Panki's verdict as a small tag, the value and the why under it,
 * then Raw, folded, the JSON as it came, indented. A dictionary meaning judged is drawn in its accuracy's look, as the
 * pop-up draws it (`.ai-accuracy`, the one home).
 */
function AnswerView({ verdicts, raw }: { verdicts: readonly AiVerdict[]; raw: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ai-answer-view">
      {verdicts.length > 0 ? (
        <ul className="ai-answer-parts">
          {verdicts.map((v) => (
            <li key={v.name} className={v.accuracy ? `ai-answer-part ai-accuracy is-${v.accuracy}` : "ai-answer-part"}>
              <span className="ai-answer-name">{v.name}</span>
              <span className="ai-answer-value" lang={langOf(v.value)}>
                {v.tag ? <span className={v.accuracy ? "ai-answer-tag ai-accuracy-tag" : `ai-answer-tag is-${v.tag.look}`}>{v.tag.words}</span> : null}
                {v.accuracy ? <span className="ai-accuracy-words">{v.value}</span> : v.value}
              </span>
              {v.reason.trim() !== "" ? <span className="ai-answer-reason">{v.reason}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Button className={`ai-details-more ai-answer-raw${open ? " is-open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        Raw
        <Icon name="down" />
      </Button>
      <Fold open={open} arrives={false}>
        <pre className="ai-details-prompt">{pretty(raw)}</pre>
      </Fold>
    </div>
  );
}
function logText(call: AiCall): string {
  const failure = failureOf(call);
  return [
    // Copy keeps every message as it went or came: the parts are for the eye.
    ...logOf(call, []).map((part) => `${part.by}:\n${part.text}`),
    ...(failure ? [`${LOG_ERROR}:\n${[failure.message, failure.detail].filter((line) => line !== "").join("\n")}`] : []),
  ].join("\n\n");
}

/** What a call was metered for: an answer's, or one that came back and couldn't be used (paid for all the same); null for none. */
function meteredOf(call: AiCall): { inputTokens: number; outputTokens: number; costMicros: number } | null {
  const { outcome } = call;
  if (outcome.kind === "answered") return outcome;
  if (outcome.kind === "failed" && outcome.unread) return outcome.unread;
  return null;
}

/** One of Details' rows: its name, its words, and a technical note in small type under them (a failure's reason). */
type Row = { name: string; words: string; note?: string };
/** Details' rows for a call: the same on screen and in what Copy takes. */
function rowsOf(call: AiCall, now: number): Row[] {
  const provider = AI_PROVIDERS[call.provider].name;
  const { outcome } = call;
  const status =
    outcome.kind === "thinking"
      ? `Waiting for ${provider} · ${seconds(Math.max(0, now - call.sentAt))}`
      : outcome.kind === "answered"
        ? `Answered in ${seconds(outcome.ms)}${outcome.cut ? `, ${WORDS.cut}` : ""}`
        : `Failed after ${seconds(outcome.ms)}: ${outcome.message}`;
  // In and out a row each (the owner, 2026-10-30), as the provider counted them; out against Max answer length. An
  // answer that couldn't be used was metered too, and says so.
  const metered = meteredOf(call);
  const tokensIn = metered ? n(metered.inputTokens) : outcome.kind === "thinking" ? WORDS.counting : WORDS.noTokens;
  const tokensOut = metered ? `${n(metered.outputTokens)} of ${n(call.maxAnswerTokens)}` : outcome.kind === "thinking" ? `At most ${n(call.maxAnswerTokens)}` : WORDS.noTokens;
  const cost =
    // Once it's run, what it came to alone: the ceiling was the button's, before it ran (the owner, 2026-10-30).
    metered ? estimateWords(metered.costMicros) : outcome.kind === "thinking" ? `Up to ${estimateWords(call.ceilingMicros)}` : WORDS.nothingMetered;
  const note = outcome.kind === "failed" && outcome.unread && outcome.unread.detail !== "" ? outcome.unread.detail : undefined;
  return [
    { name: "Status", words: status, ...(note !== undefined ? { note } : {}) },
    { name: "Ran because", words: whyWords(call.why) },
    { name: "Template", words: call.templateName },
    { name: "Model", words: modelWords(call) },
    { name: "Sent", words: sentWords(call) },
    { name: "Tokens in", words: tokensIn },
    { name: "Tokens out", words: tokensOut },
    { name: "Cost", words: cost },
  ];
}

const sourceOf = (use: PieceUse) => (use.piece === null ? null : SOURCE_WORDS[PIECE_SOURCES[use.piece]]);
/** A piece as Copy writes it: its name, its Source, and its value whole or why it had none. */
function pieceText(use: PieceUse): string {
  const source = sourceOf(use);
  const said = use.piece === null ? WORDS.unknown : use.value !== null ? use.value : PIECE_GAPS[use.gap];
  return `{${use.name}}${source ? ` (Source: ${source})` : ""}: ${said}`;
}
/** All of a call's Details as text, every value whole, for Copy. */
function callText(call: AiCall, now: number): string {
  return [
    `Panki AI · ${call.label}`,
    ...rowsOf(call, now).map((row) => `${row.name}: ${row.words}${row.note ? ` (${row.note})` : ""}`),
    ...(call.outcome.kind === "answered" && call.outcome.verdicts.length > 0 ? ["", "Answer:", ...call.outcome.verdicts.map(verdictLine)] : []),
    "",
    "Prompt context:",
    ...call.pieces.map(pieceText),
    "",
    "Log:",
    logText(call),
  ].join("\n");
}

/** One variable of the template: its name as written, what it held (one line, whole once pressed) or why it held nothing, and its Source. */
function Piece({ use, open, onToggle }: { use: PieceUse; open: boolean; onToggle: () => void }) {
  const source = sourceOf(use);
  return (
    <li className="ai-piece">
      <span className={`ai-piece-name${use.piece === null || use.value === null ? " is-empty" : ""}`}>{`{${use.name}}`}</span>
      {use.piece !== null && use.value !== null ? (
        <Button className="ai-piece-value" aria-expanded={open} lang={langOf(use.value)} onClick={onToggle}>
          {use.value}
        </Button>
      ) : (
        <span className="ai-piece-gap">{use.piece === null ? WORDS.unknown : PIECE_GAPS[use.gap]}</span>
      )}
      {source ? <span className="ai-piece-source">Source: {source}</span> : null}
    </li>
  );
}

/**
 * One of Details' folds, closed to begin with: its name (and a quiet count) on a row with the chevron at its end, what
 * it holds unfolding under it. Prompt context and the Log are these, so Details read as a set of alike sections.
 */
function Section({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="ai-details-section">
      <Button className={`ai-details-fold${open ? " is-open" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="ai-details-fold-name">{title}</span>
        {count ? <span className="ai-details-fold-count">{count}</span> : null}
        <Icon name="down" />
      </Button>
      <Fold open={open} arrives={false}>
        {children}
      </Fold>
    </section>
  );
}

/** Everything about one call of a conversation, picked among them by its chip when there's more than one. */
function Details({ id, calls }: { id: string; calls: readonly AiCall[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  // A new call is the one shown: the latest is what the button says.
  useEffect(() => setPicked(null), [calls.length]);
  const at = picked ?? calls.length - 1;
  const call = calls[at];
  const thinking = call?.outcome.kind === "thinking";
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [thinking]);
  if (!call) return null;

  const failure = failureOf(call);
  const sent = call.pieces.filter((use) => use.piece !== null && use.value !== null).length;
  const asked = call.pieces.filter((use) => use.piece !== null).length;
  const toggle = (name: string) => {
    const next = new Set(expanded);
    if (!next.delete(name)) next.add(name);
    setExpanded(next);
  };
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(WORDS.copied);
    } catch {
      setCopied(WORDS.couldNotCopy);
    }
    setTimeout(() => setCopied(null), 1500);
  }
  return (
    <div id={id} className="ai-details">
      {calls.length > 1 ? (
        <div className="ai-details-calls">
          {calls.map((each, i) => (
            <Button key={i} variant="chip" aria-pressed={i === at} onClick={() => setPicked(i)}>
              {each.label}
            </Button>
          ))}
        </div>
      ) : null}
      <dl className="ai-details-rows">
        {rowsOf(call, now).map((row) => (
          <div key={row.name}>
            <dt>{row.name}</dt>
            <dd>
              {row.words}
              {row.note ? <small className="ai-details-note">{row.note}</small> : null}
            </dd>
          </div>
        ))}
      </dl>
      {call.pieces.length > 0 ? (
        <Section title="Prompt context" count={`${sent} of ${asked} sent`}>
          <ul className="ai-pieces">
            {call.pieces.map((use) => (
              <Piece key={use.name} use={use} open={expanded.has(use.name)} onToggle={() => toggle(use.name)} />
            ))}
          </ul>
        </Section>
      ) : null}
      <Section title="Log">
        <ol className="ai-details-sent">
          {logOf(call, calls).map((part, i) => (
            <li key={i}>
              <span className="ai-details-by">{part.by}</span>
              {/* Every answer that read as its parts, the JSON under Raw; anything else as it went or came. */}
              {part.verdicts ? (
                <AnswerView verdicts={part.verdicts} raw={part.text} />
              ) : (
                <pre className="ai-details-prompt" lang={langOf(part.text)}>
                  {part.json ? pretty(part.text) : part.text}
                </pre>
              )}
            </li>
          ))}
        </ol>
        {failure ? <LogFailure message={failure.message} detail={failure.detail} /> : null}
      </Section>
      <div className="ai-details-foot">
        {copied ? <span role="status">{copied}</span> : null}
        <Button className="ai-details-more" onClick={() => void copy(callText(call, now))}>
          <Icon name="copy" />
          Copy
        </Button>
      </div>
    </div>
  );
}

/**
 * The head over an AI action's answers, the status at its right; `calls` is this action's, oldest first, and it draws
 * nothing before the first. `burst` is the count of presses that made a call, for an action whose button gives way to
 * this head as it's pressed (Explain, a follow-up): its spark blinks once for each, where the button was (`AiSpark`).
 */
export function AiStatus({ calls, burst = 0 }: { calls: readonly AiCall[]; burst?: number }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const last = calls[calls.length - 1];
  if (!last) return null;
  const status = STATUS[last.outcome.kind];
  // Beside it: the most it can cost while it's on its way; then what the answers so far came to.
  const spent = calls.reduce((sum, call) => sum + (meteredOf(call)?.costMicros ?? 0), 0);
  const cost = last.outcome.kind === "thinking" ? `Up to ${estimateWords(last.ceilingMicros)}` : spent > 0 ? estimateWords(spent) : null;
  return (
    <div className="ai-status">
      <header className="ai-status-head">
        <span className="ai-status-name">
          <AiSpark working={last.outcome.kind === "thinking"} burst={burst} />
          Panki AI
        </span>
        <span className="ai-status-end">
          <Button
            className={`ai-status-button is-${status.look}`}
            aria-expanded={open}
            aria-controls={`${id}-details`}
            aria-label={`Panki AI: ${status.words}, details`}
            onClick={() => setOpen(!open)}
          >
            <i className="ai-status-dot" aria-hidden="true" />
            {status.words}
            <Icon name="down" />
          </Button>
          {cost ? <span className="ai-status-cost">{cost}</span> : null}
        </span>
      </header>
      <Fold open={open} arrives={false}>
        <Details id={`${id}-details`} calls={calls} />
      </Fold>
    </div>
  );
}
