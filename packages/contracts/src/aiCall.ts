import { AI_PROVIDERS, aiModelOf, type AiProviderId, type AiRanOn, type AiTemplate, type PankiAi } from "./ai";
import type { PromptPieceId } from "./pieces";
import { aiSent, ceilingMicros, variablesIn, type AiUnread, type ExplainMessage, type MeaningAccuracyId, type PromptPieces } from "./prompt";

/**
 * One call to Panki AI as the page that made it tells of it (the AI's status, so nothing about a call is a black box,
 * least of all what data was sent): what it was, why it ran, the model, every piece of Prompt context
 * its template asked for with what it held or why it held nothing, the prompt exactly as sent, and how it came out.
 * Built where the call is made, from the settings it ran with (`startCall`), and finished from the answer (`answeredCall`,
 * `failedCall`); drawn by the web's `AiStatus`. Never sent and never kept: what was sent stays on the page (AI.md,
 * "nothing is stored"), and closing the page forgets it.
 */

/**
 * Why a piece the template asked for went empty, one registry, its words said after the piece's name in Details
 * ("Video description · not on a video"). The page that gathers the pieces knows why; a piece it gives no reason for
 * reads as `empty`. A new reason is one entry.
 */
export const PIECE_GAPS = {
  /** A video's piece, asked for on a page that isn't a video. */
  notVideo: "not on a video",
  /** The subtitles around the moment, with none showing (None picked, or Panki's not there yet). */
  noSubtitles: "no subtitles showing",
  /** A dictionary's piece, for a word none of the dictionaries that are on has it for. */
  notInDictionaries: "not in your dictionaries",
  /** Nothing there to send: a video with no description, a word pointed at with no sentence around it. */
  empty: "nothing there",
} as const;
export type PieceGap = keyof typeof PIECE_GAPS;
/** Why each piece the page couldn't fill is empty; one left out reads as `empty`. */
export type PromptGaps = Partial<Record<PromptPieceId, PieceGap>>;

/**
 * One variable of a template as a call filled it, each name once in the order it first stands: a piece of Prompt
 * context that was sent (its value as it went), one that went empty (and why), or a name Panki doesn't know, which
 * went as typed, braces and all.
 */
export type PieceUse =
  | { name: string; piece: PromptPieceId; value: string }
  | { name: string; piece: PromptPieceId; value: null; gap: PieceGap }
  | { name: string; piece: null };

/**
 * The pieces as Panki sends them: each cut to what the settings allow. The server cuts with this, and so does the page
 * telling of the call, so what Details say was sent is what was.
 */
export function piecesAsSent(pieces: PromptPieces, settings: Pick<PankiAi, "aiMaxDescriptionChars">): PromptPieces {
  const { description, ...rest } = pieces;
  return { ...rest, ...(description !== undefined ? { description: description.slice(0, settings.aiMaxDescriptionChars) } : {}) };
}

/** Every variable a template uses, once each, with what it took from the pieces (as sent) or why it took nothing. */
export function piecesUsed(template: string, pieces: PromptPieces, gaps: PromptGaps = {}): PieceUse[] {
  const seen = new Set<string>();
  return variablesIn(template).flatMap(({ name, piece }): PieceUse[] => {
    if (seen.has(name)) return [];
    seen.add(name);
    if (piece === null) return [{ name, piece }];
    const value = pieces[piece]?.trim() ?? "";
    return value !== "" ? [{ name, piece, value }] : [{ name, piece, value: null, gap: gaps[piece] ?? "empty" }];
  });
}

/**
 * Why a call ran: pressed (`action` is the button's word, "Explain"), a follow-up asked, or Try again after a failure.
 * Nothing runs by itself.
 */
export type AiRunWhy = { kind: "pressed"; action: string } | { kind: "followUp"; field?: string } | { kind: "retry" };

/**
 * One part of what an answer said, as Details' Conversation shows Panki AI's answer (a list, the
 * JSON folded under Raw): a key of the action's fixed shape by its name, its verdict as a small tag (Fits,
 * Proposed, Close, Set aside…, in a look), the value, and the reason. What the page shows anyway (Explain's paragraph, a
 * field's proposal) is there too, so Details say all the answer said, the parts that change nothing among them.
 */
export type AiVerdictLook = "good" | "accent" | "flag" | "danger" | "muted";
/**
 * `accuracy`, for a dictionary meaning judged (Explain's rows): the row drawn in that accuracy's look, the one home of
 * which is `app.css` → `.ai-accuracy.is-…`, in place of the tag's own.
 */
export type AiVerdict = { name: string; tag: { words: string; look: AiVerdictLook } | null; value: string; reason: string; accuracy?: MeaningAccuracyId };
/** A verdict as one line of text, for Copy. */
export const verdictLine = (v: AiVerdict): string => [v.name + ":", v.tag?.words ?? "", v.value, v.reason].filter((part) => part.trim() !== "").join(" · ");

/** How a call stands: on its way, answered (the provider's own counts, and what they came to), or failed (and why). */
export type AiOutcome =
  | { kind: "thinking" }
  | { kind: "answered"; inputTokens: number; outputTokens: number; costMicros: number; cut: boolean; ms: number; verdicts: readonly AiVerdict[]; raw: string }
  | { kind: "failed"; message: string; ms: number; unread: AiUnread | null };

export type AiCall = {
  /** What it is, as Details name it among a conversation's calls: "Explain", "Follow-up 1". */
  label: string;
  why: AiRunWhy;
  /** The template it ran, by name (AI step 5): Details' Template row. */
  templateName: string;
  provider: AiProviderId;
  /** The model's id: as the settings this page knew had it while the call was on its way, then the one the server says it ran on (`AiRanOn`, `answeredCall`, `failedCall`). */
  model: string;
  /** When it was sent, ms since the epoch (the page's clock: it's only ever the page's own count of how long). */
  sentAt: number;
  /** The most it could cost, said before it ran, in micro-dollars. */
  ceilingMicros: number;
  /** Max answer length as it stood, in the provider's tokens. */
  maxAnswerTokens: number;
  /** Every variable of the template, as filled. */
  pieces: readonly PieceUse[];
  /** The prompt exactly as sent: the template filled, a line whose pieces all went empty left out. */
  prompt: string;
  /** The conversation that went with it after the prompt, in order (the model's answers and the follow-ups, the last its question): none for the first call. A call sends all of it again. */
  said: readonly ExplainMessage[];
  outcome: AiOutcome;
};

type Start = {
  label: string;
  why: AiRunWhy;
  /** Panki AI's settings as this call runs with them. */
  settings: PankiAi;
  /** The template it runs (AI step 5): its prompt, its Follow-up prompt and its name. */
  template: Pick<AiTemplate, "name" | "prompt" | "followUp">;
  pieces: PromptPieces;
  gaps?: PromptGaps;
  /** The conversation going with it, after the prompt, as it was sent (`Said`): none for a first ask. */
  said: readonly ExplainMessage[];
  /** A follow-up's own pieces (`{Follow-up question}`, `{Follow-up field}`, Touch up's `{Card}` as it stands now), laid over `pieces` for its Follow-up prompt. */
  asking?: PromptPieces;
  now: number;
  /** The action's own Max answer length, when it isn't Explain's (Touch up's). */
  maxAnswerTokens?: number;
};

/**
 * A call as it's sent: everything said of it before an answer, thinking. A follow-up's `said` ends with its Follow-up
 * prompt as it'll be filled (the server's `asked` is the same text); its pieces are the Follow-up prompt's.
 */
export function startCall({ label, why, settings, template, pieces, gaps, said, asking = {}, now, maxAnswerTokens = settings.aiMaxAnswerTokens }: Start): AiCall {
  const sent = piecesAsSent(pieces, settings);
  const [prompt = "", ...rest] = aiSent(template, sent, said, piecesAsSent(asking, settings));
  const followUp = said.length > 0;
  const model = aiModelOf(settings);
  const asked = followUp ? rest[rest.length - 1] ?? "" : "";
  return {
    label,
    why,
    templateName: template.name,
    provider: settings.aiProvider,
    model: model.id,
    sentAt: now,
    ceilingMicros: ceilingMicros(model, [prompt, ...rest], maxAnswerTokens),
    maxAnswerTokens,
    pieces: followUp ? piecesUsed(template.followUp, { ...sent, ...piecesAsSent(asking, settings) }, gaps) : piecesUsed(template.prompt, sent, gaps),
    prompt,
    said: followUp ? [...said, { role: "user", text: asked }] : said,
    outcome: { kind: "thinking" },
  };
}
/** The call once its answer is in, with the provider's counts and what they came to at the listed price. */
export const answeredCall = (call: AiCall, answer: { inputTokens: number; outputTokens: number; costMicros: number; cut: boolean; raw?: string; ranOn?: AiRanOn }, now: number, verdicts: readonly AiVerdict[] = []): AiCall => ({
  ...call,
  ...(answer.ranOn ?? {}),
  outcome: { kind: "answered", inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, costMicros: answer.costMicros, cut: answer.cut, ms: now - call.sentAt, verdicts, raw: answer.raw ?? "" },
});
/**
 * The call once it failed, with why in Panki's words (the server's, or the worker's), and, when the provider did answer
 * but its answer couldn't be used, that answer as it came, the technical reason and what was metered (`unread`).
 */
export const failedCall = (call: AiCall, message: string, now: number, unread: AiUnread | null = null): AiCall => ({
  ...call,
  ...(unread?.ranOn ?? {}),
  outcome: { kind: "failed", message, ms: now - call.sentAt, unread },
});

/** The model a call ran on, by name, and its provider's: "Claude Haiku 5.5 · Anthropic". A model since taken out of the registry is said by its id. */
export function modelWords(call: Pick<AiCall, "provider" | "model">): string {
  const provider = AI_PROVIDERS[call.provider];
  return `${provider.models.find((m) => m.id === call.model)?.name ?? call.model} · ${provider.name}`;
}
