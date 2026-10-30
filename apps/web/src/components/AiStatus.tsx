import { useEffect, useId, useState } from "react";
import { AI_PROVIDERS, PIECE_GAPS, PIECE_SOURCES, SOURCE_WORDS, modelWords, type AiCall, type AiRunWhy, type PieceUse } from "@panki/contracts";
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
 * cost, every piece of Prompt context the template asked for with what it held or why it held nothing (the one place
 * the owner sees what a piece really was), and the prompt exactly as sent, with Copy. Never open by itself; closed again
 * whenever what holds it is drawn afresh (a pop-up opened on another word). Drawn once a call exists; before that the
 * action's own button, and what it says beside it, is the status. No Log: one press is one call, and Details say all
 * of it; a Log comes with calls made without a press (AI.md, step 7).
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
      return "You asked a follow-up";
    case "retry":
      return "You pressed Try again";
    case "auto":
      return `${why.setting} is on`;
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
 * The full prompt as it went: the messages the provider is sent, in order, each in a box of its own under who said it
 * (Panki's prompt, Panki AI's answer, Your follow-up), since a call is a list of messages, not one text. The owner had
 * it one raw text for an hour, 2026-10-30, then back to this once they knew it's sent as messages.
 */
const SAID_BY = { prompt: "Panki's prompt", assistant: "Panki AI's answer", user: "Your follow-up" } as const;
const sentParts = (call: AiCall): { by: string; text: string }[] => [
  { by: SAID_BY.prompt, text: call.prompt },
  ...call.said.map((m) => ({ by: SAID_BY[m.role], text: m.text })),
];
const sentText = (call: AiCall): string => sentParts(call).map((part) => `${part.by}:\n${part.text}`).join("\n\n");

/** Details' rows for a call, as name and words: the same on screen and in what Copy takes. */
function rowsOf(call: AiCall, now: number): [string, string][] {
  const provider = AI_PROVIDERS[call.provider].name;
  const { outcome } = call;
  const status =
    outcome.kind === "thinking"
      ? `Waiting for ${provider} · ${seconds(Math.max(0, now - call.sentAt))}`
      : outcome.kind === "answered"
        ? `Answered in ${seconds(outcome.ms)}${outcome.cut ? `, ${WORDS.cut}` : ""}`
        : `Failed after ${seconds(outcome.ms)}: ${outcome.message}`;
  // In and out a row each (the owner, 2026-10-30), as the provider counted them; out against Max answer length.
  const tokensIn = outcome.kind === "answered" ? n(outcome.inputTokens) : outcome.kind === "thinking" ? WORDS.counting : WORDS.noTokens;
  const tokensOut = outcome.kind === "answered" ? `${n(outcome.outputTokens)} of ${n(call.maxAnswerTokens)}` : outcome.kind === "thinking" ? `At most ${n(call.maxAnswerTokens)}` : WORDS.noTokens;
  const cost =
    // Once it's run, what it came to alone: the ceiling was the button's, before it ran (the owner, 2026-10-30).
    outcome.kind === "answered"
      ? estimateWords(outcome.costMicros)
      : outcome.kind === "thinking"
        ? `Up to ${estimateWords(call.ceilingMicros)}`
        : WORDS.nothingMetered;
  return [
    ["Status", status],
    ["Ran because", whyWords(call.why)],
    ["Model", modelWords(call)],
    ["Sent", sentWords(call)],
    ["Tokens in", tokensIn],
    ["Tokens out", tokensOut],
    ["Cost", cost],
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
    ...rowsOf(call, now).map(([name, words]) => `${name}: ${words}`),
    "",
    "Prompt context:",
    ...call.pieces.map(pieceText),
    "",
    "Full prompt:",
    sentText(call),
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

/** Everything about one call of a conversation, picked among them by its chip when there's more than one. */
function Details({ id, calls }: { id: string; calls: readonly AiCall[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [prompt, setPrompt] = useState(false);
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
        {rowsOf(call, now).map(([name, words]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{words}</dd>
          </div>
        ))}
      </dl>
      {call.pieces.length > 0 ? (
        <>
          <p className="ai-details-title">
            Prompt context · {sent} of {asked} sent
          </p>
          <ul className="ai-pieces">
            {call.pieces.map((use) => (
              <Piece key={use.name} use={use} open={expanded.has(use.name)} onToggle={() => toggle(use.name)} />
            ))}
          </ul>
        </>
      ) : null}
      <Fold open={prompt} arrives={false}>
        <ol className="ai-details-sent">
          {sentParts(call).map((part, i) => (
            <li key={i}>
              <span className="ai-details-by">{part.by}</span>
              <pre className="ai-details-prompt" lang={langOf(part.text)}>
                {part.text}
              </pre>
            </li>
          ))}
        </ol>
      </Fold>
      <div className="ai-details-foot">
        {copied ? <span role="status">{copied}</span> : null}
        <Button className={`ai-details-more${prompt ? " is-open" : ""}`} aria-expanded={prompt} onClick={() => setPrompt(!prompt)}>
          Full prompt
          <Icon name="down" />
        </Button>
        <Button className="ai-details-more" onClick={() => void copy(callText(call, now))}>
          <Icon name="copy" />
          Copy
        </Button>
      </div>
    </div>
  );
}

/** The head over an AI action's answers, the status at its right; `calls` is this action's, oldest first, and it draws nothing before the first. */
export function AiStatus({ calls }: { calls: readonly AiCall[] }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const last = calls[calls.length - 1];
  if (!last) return null;
  const status = STATUS[last.outcome.kind];
  // Beside it: the most it can cost while it's on its way; then what the answers so far came to.
  const spent = calls.reduce((sum, call) => sum + (call.outcome.kind === "answered" ? call.outcome.costMicros : 0), 0);
  const cost = last.outcome.kind === "thinking" ? `Up to ${estimateWords(last.ceilingMicros)}` : spent > 0 ? estimateWords(spent) : null;
  return (
    <div className="ai-status">
      <header className="ai-status-head">
        <span className="ai-status-name">
          <AiSpark working={last.outcome.kind === "thinking"} />
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
