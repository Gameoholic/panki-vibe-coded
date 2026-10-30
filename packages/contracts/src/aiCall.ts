import { AI_PROVIDERS, aiModelOf, type AiProviderId, type PankiAi } from "./ai";
import type { PromptPieceId } from "./pieces";
import { ceilingMicros, fillTemplate, variablesIn, type ExplainMessage, type PromptPieces } from "./prompt";

/**
 * One call to Panki AI as the page that made it tells of it (the AI's status, the owner, 2026-10-30: "kind of a black
 * box… I want to know exactly what data was sent"): what it was, why it ran, the model, every piece of Prompt context
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
 * Why a call ran: pressed (`action` is the button's word, "Explain"), a follow-up asked, Try again after a failure, or
 * by itself because a setting says so (`setting`, its name on screen, "Explain as the pop-up opens").
 */
export type AiRunWhy = { kind: "pressed"; action: string } | { kind: "followUp" } | { kind: "retry" } | { kind: "auto"; setting: string };

/** How a call stands: on its way, answered (the provider's own counts, and what they came to), or failed (and why). */
export type AiOutcome =
  | { kind: "thinking" }
  | { kind: "answered"; inputTokens: number; outputTokens: number; costMicros: number; cut: boolean; ms: number }
  | { kind: "failed"; message: string; ms: number };

export type AiCall = {
  /** What it is, as Details name it among a conversation's calls: "Explain", "Follow-up 1". */
  label: string;
  why: AiRunWhy;
  provider: AiProviderId;
  /** The model's id, as the settings had it for this call. */
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
  template: string;
  pieces: PromptPieces;
  gaps?: PromptGaps;
  /** The conversation going with it, after the prompt. */
  said: readonly ExplainMessage[];
  now: number;
};

/** A call as it's sent: everything said of it before an answer, thinking. */
export function startCall({ label, why, settings, template, pieces, gaps, said, now }: Start): AiCall {
  const sent = piecesAsSent(pieces, settings);
  const prompt = fillTemplate(template, sent);
  const model = aiModelOf(settings);
  return {
    label,
    why,
    provider: settings.aiProvider,
    model: model.id,
    sentAt: now,
    ceilingMicros: ceilingMicros(model, [prompt, ...said.map((m) => m.text)], settings.aiMaxAnswerTokens),
    maxAnswerTokens: settings.aiMaxAnswerTokens,
    pieces: piecesUsed(template, sent, gaps),
    prompt,
    said,
    outcome: { kind: "thinking" },
  };
}
/** The call once its answer is in, with the provider's counts and what they came to at the listed price. */
export const answeredCall = (call: AiCall, answer: { inputTokens: number; outputTokens: number; costMicros: number; cut: boolean }, now: number): AiCall => ({
  ...call,
  outcome: { kind: "answered", inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, costMicros: answer.costMicros, cut: answer.cut, ms: now - call.sentAt },
});
/** The call once it failed, with why in Panki's words (the server's, or the worker's). */
export const failedCall = (call: AiCall, message: string, now: number): AiCall => ({ ...call, outcome: { kind: "failed", message, ms: now - call.sentAt } });

/** The model a call ran on, by name, and its provider's: "Claude Haiku 5.5 · Anthropic". A model since taken out of the registry is said by its id. */
export function modelWords(call: Pick<AiCall, "provider" | "model">): string {
  const provider = AI_PROVIDERS[call.provider];
  return `${provider.models.find((m) => m.id === call.model)?.name ?? call.model} · ${provider.name}`;
}
