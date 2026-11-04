import { z } from "zod";
import { postTo, Tokens, unreadable, type ProviderClient } from "./call";

/**
 * Google's Gemini API, `generateContent` (its docs, read 2026-10-30): the key in `x-goog-api-key`, the model in the
 * address, the conversation as `contents` (the model's turns are "model"), the answer's cap as `maxOutputTokens`, and
 * the least thinking the model takes asked for (`AiModel.least`), since thinking is counted against it. The answer's
 * shape is asked for as JSON with its schema, `responseMimeType: "application/json"` and `responseJsonSchema` (the
 * JSON Schema field; `responseSchema` is the older OpenAPI subset). The answer's words are the first candidate's parts
 * that aren't its thoughts, cut short when it finished on `MAX_TOKENS`, declined on `SAFETY` and its kin; tokens in are
 * the prompt's, tokens out the answer's and its thoughts' (thinking is billed as output).
 */

const API = "https://generativelanguage.googleapis.com/v1beta/models";
/** The finish reasons that say Gemini declined rather than answered. */
const DECLINED = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);

const Answer = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.unknown()).optional() }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .min(1),
  usageMetadata: z
    .object({ promptTokenCount: Tokens, candidatesTokenCount: Tokens.optional(), thoughtsTokenCount: Tokens.optional() })
    .optional()
    .catch(undefined),
});
const Part = z.object({ text: z.string(), thought: z.boolean().optional() });

export function createGoogle(fetcher: typeof fetch): ProviderClient {
  return async ({ key, model, messages, maxTokens, format }) => {
    const body = await postTo(fetcher, "google", `${API}/${encodeURIComponent(model.id)}:generateContent`, { "x-goog-api-key": key }, {
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
        responseJsonSchema: format.schema,
        ...(model.least === "low" ? { thinkingConfig: { thinkingLevel: model.least } } : {}),
      },
    });
    const answer = Answer.safeParse(body);
    const candidate = answer.success ? answer.data.candidates[0] : undefined;
    if (!answer.success || !candidate) throw unreadable("google");
    const text = (candidate.content?.parts ?? []).flatMap((raw) => {
      const part = Part.safeParse(raw);
      return part.success && part.data.thought !== true ? [part.data.text] : [];
    });
    const usage = answer.data.usageMetadata;
    return {
      text: text.join(""),
      cut: candidate.finishReason === "MAX_TOKENS",
      refused: candidate.finishReason !== undefined && DECLINED.has(candidate.finishReason),
      // An answer cut before its first word leaves the answer's count out: none of it, then.
      tokens: usage ? { input: usage.promptTokenCount, output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) } : null,
    };
  };
}
