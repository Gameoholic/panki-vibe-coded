import { z } from "zod";
import { postTo, Tokens, unreadable, type ProviderClient } from "./call";

/**
 * Anthropic's Messages API (its docs, read 2026-10-30): the key in `x-api-key`, the API's version in its own header, the
 * conversation as `messages`, the answer's cap as `max_tokens`. The 5.5 models think unless told otherwise, and their
 * thinking counts against `max_tokens`, so each is asked for the least it takes (`AiModel.least`): thinking off,
 * thinking only between tools (Sonnet 5.5's way of off), or the lowest effort (Opus 5.5, which always thinks). The
 * answer is a list of blocks; its words are the text blocks' (a thinking block is passed over), its tokens `usage`'s,
 * and it was cut short when it stopped at `max_tokens`.
 */
const LEAST = {
  off: { thinking: { type: "disabled" } },
  betweenTools: { thinking: { type: "between_tools" } },
  low: { output_config: { effort: "low" } },
} as const;

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

const Answer = z.object({
  content: z.array(z.unknown()),
  stop_reason: z.string().nullable().optional(),
  usage: z.object({ input_tokens: Tokens, output_tokens: Tokens }).optional().catch(undefined),
});
const TextBlock = z.object({ type: z.literal("text"), text: z.string() });

export function createAnthropic(fetcher: typeof fetch): ProviderClient {
  return async ({ key, model, messages, maxTokens, safetyId }) => {
    const body = await postTo(fetcher, "anthropic", API, { "x-api-key": key, "anthropic-version": VERSION }, {
      model: model.id,
      max_tokens: maxTokens,
      metadata: { user_id: safetyId },
      ...(model.least ? LEAST[model.least] : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
    });
    const answer = Answer.safeParse(body);
    if (!answer.success) throw unreadable("anthropic");
    const { content, stop_reason, usage } = answer.data;
    const text = content.flatMap((raw) => {
      const block = TextBlock.safeParse(raw);
      return block.success ? [block.data.text] : [];
    });
    return {
      text: text.join(""),
      cut: stop_reason === "max_tokens",
      tokens: usage ? { input: usage.input_tokens, output: usage.output_tokens } : null,
    };
  };
}
