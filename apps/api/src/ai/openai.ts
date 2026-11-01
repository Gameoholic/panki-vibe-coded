import { z } from "zod";
import { postTo, Tokens, unreadable, type ProviderClient } from "./call";

/**
 * OpenAI's Chat Completions (its docs, read 2026-10-30): the key as a bearer token, the conversation as `messages`, the
 * answer's cap as `max_completion_tokens`, which its reasoning counts against too, so the least reasoning the model
 * takes is asked for (`AiModel.least`). The answer's shape is asked for as Structured Outputs, `response_format` of
 * `json_schema` with `strict: true` (every property required, every object closed: `schemaFor` makes them so). The
 * answer's words are the first choice's message, cut short when it finished on `length`, declined when the message
 * carries a `refusal` instead; its tokens `usage`'s, the reasoning among those out, and `usage` may be left out.
 */

const API = "https://api.openai.com/v1/chat/completions";

const Answer = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional(), refusal: z.string().nullable().optional() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: Tokens, completion_tokens: Tokens }).nullable().optional().catch(undefined),
});

export function createOpenAi(fetcher: typeof fetch): ProviderClient {
  return async ({ key, model, messages, maxTokens, safetyId, format }) => {
    const body = await postTo(fetcher, "openai", API, { authorization: `Bearer ${key}` }, {
      model: model.id,
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
      max_completion_tokens: maxTokens,
      safety_identifier: safetyId,
      response_format: { type: "json_schema", json_schema: { name: format.name, strict: true, schema: format.schema } },
      ...(model.least === "low" ? { reasoning_effort: model.least } : {}),
    });
    const answer = Answer.safeParse(body);
    const choice = answer.success ? answer.data.choices[0] : undefined;
    if (!answer.success || !choice) throw unreadable("openai");
    const { usage } = answer.data;
    return {
      text: choice.message.content ?? "",
      cut: choice.finish_reason === "length",
      refused: Boolean(choice.message.refusal),
      tokens: usage ? { input: usage.prompt_tokens, output: usage.completion_tokens } : null,
    };
  };
}
