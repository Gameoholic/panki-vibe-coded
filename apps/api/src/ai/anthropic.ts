import { z } from "zod";
import { postTo, Tokens, unreadable, type ProviderClient } from "./call";

/**
 * Anthropic's Messages API (its docs): the key in `x-api-key`, the API's version in its own header, the
 * conversation as `messages`, the answer's cap as `max_tokens`. The 5.5 models think unless told otherwise, and their
 * thinking counts against `max_tokens`, so each is asked for the least it takes (`AiModel.least`): thinking off,
 * thinking only between tools (Sonnet 5.5's way of off), or the lowest effort (Opus 5.5, which always thinks). The
 * answer's shape is asked for as structured output, `output_config.format` with its JSON Schema: not a forced tool
 * call, which Sonnet 5.5 and Opus 5.5 refuse (`tool_choice` `tool` / `any` is a 400 on both). The
 * answer is a list of blocks; its words are the text blocks' (a thinking block is passed over), its tokens `usage`'s;
 * it was cut short when it stopped at `max_tokens`, and declined when it stopped at `refusal`.
 */
const THINKING = {
  off: { thinking: { type: "disabled" } },
  betweenTools: { thinking: { type: "between_tools" } },
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
  return async ({ key, model, messages, maxTokens, safetyId, format }) => {
    const body = await postTo(fetcher, "anthropic", API, { "x-api-key": key, "anthropic-version": VERSION }, {
      model: model.id,
      max_tokens: maxTokens,
      metadata: { user_id: safetyId },
      ...(model.least === "off" || model.least === "betweenTools" ? THINKING[model.least] : {}),
      // Effort and the answer's shape are both `output_config`'s.
      output_config: { format: { type: "json_schema", schema: format.schema }, ...(model.least === "low" ? { effort: "low" } : {}) },
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
      refused: stop_reason === "refusal",
      tokens: usage ? { input: usage.input_tokens, output: usage.output_tokens } : null,
    };
  };
}
