import { z } from "zod";
import { AI_PROVIDERS, UNREAD_REASONS, issueWords, tokensAbout, type AiProviderId } from "@panki/contracts";
import { createAnthropic } from "./anthropic";
import { AiError, type AiAsk, type ProviderClient } from "./call";
import { createGoogle } from "./google";
import { createOpenAi } from "./openai";

export { AiError, safetyIdOf, type AiMessage } from "./call";

/**
 * Panki AI's providers: one client per provider in the contracts' `AI_PROVIDERS`, each its own host alone, and **one
 * reader for every call**, so an answer in the wrong format or broken JSON is an error the same way everywhere. Each action
 * hands it the Zod shape of its answer; the reader asks the provider for that shape in its own way, reads what comes
 * back through it, and anything that doesn't read whole (cut short at the cap, declined, not JSON, a field missing or
 * of the wrong kind) is one kind of failure, said in plain words, never a part of an answer. The tokens it took,
 * as the provider counted them, come back either way, since they were paid for.
 */

/** An answer read whole: the shape's value, the text it came as (its JSON), its tokens, and whether those are the provider's own count (`counted`) or Panki's. */
export type AiAnswer<T> = { value: T; raw: string; inputTokens: number; outputTokens: number; counted: boolean };
export type AiClient = ReturnType<typeof createAiClient>;

/**
 * The words for an answer that couldn't be used, one home: plain, as anyone reads them; the technical reason
 * lives in Details' Log alone (`AiError.detail`). `limit` is where its cap is set.
 */
const UNREAD = {
  cut: (limit: string) => `Panki AI's answer reached ${limit} before it finished. Raise it in Admin → Panki AI → Limits.`,
  refused: "Panki AI declined to answer this one.",
  unusable: "Panki AI's answer couldn't be used. Try again.",
};

/**
 * What a JSON Schema can carry that isn't sent, one list. What a provider's structured output refuses (a 400) or
 * ignores, as Anthropic's docs list it, the strictest of the three (platform.claude.com/docs/en/build-with-claude/
 * structured-outputs → JSON Schema limitations: no numerical constraints, no string constraints, no
 * array constraints beyond `minItems` of 0 or 1, only some formats and regexes) and OpenAI's strict mode and Google's
 * leave out besides (`minContains`, `maxContains`, `minProperties`, `maxProperties`, `uniqueItems`): every bound and
 * format goes, and the shape's Zod holds to them on what comes back (a 201-item list fails as unreadable). Then the
 * draft's `$schema`, and each key's description, which is Admin's account of the answer in plain words, not an
 * instruction: what the model is told is the prompt's alone. A keyword left in that a provider refuses fails every call
 * of the action, as `maxItems` once did.
 */
export const UNSENT: ReadonlySet<string> = new Set([
  "$schema",
  // Numbers.
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  // Strings.
  "minLength",
  "maxLength",
  "pattern",
  "format",
  // Arrays.
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  // Objects.
  "minProperties",
  "maxProperties",
  // Admin's words.
  "description",
]);
/** A schema less every keyword in `UNSENT`, at any depth; a key's own name under `properties` is a name, never a keyword, and stays. */
function strip(node: unknown, names = false): unknown {
  if (Array.isArray(node)) return node.map((each) => strip(each));
  if (typeof node !== "object" || node === null) return node;
  return Object.fromEntries(Object.entries(node).flatMap(([key, value]) => (!names && UNSENT.has(key) ? [] : [[key, strip(value, !names && key === "properties")]])));
}
/**
 * A Zod shape as every provider takes it: its JSON Schema (every key required, every object closed, as Zod writes an
 * object of required keys), less the bounds none of them hold to. The bounds stay Zod's, checked on what comes back.
 */
export const schemaFor = (shape: z.ZodType): Record<string, unknown> => strip(z.toJSONSchema(shape, { io: "output" })) as Record<string, unknown>;

/** `fetcher` is passed in, like the API's clock, so a test can stand in for a provider. */
export function createAiClient(fetcher: typeof fetch = fetch) {
  const providers: Record<AiProviderId, ProviderClient> = {
    anthropic: createAnthropic(fetcher),
    openai: createOpenAi(fetcher),
    google: createGoogle(fetcher),
  };
  return {
    /**
     * One call, its answer read through `shape`. `name` is the shape's name as a provider is told it (OpenAI's
     * `json_schema.name`); `limit` is the setting its cap is, in plain words, for the failure that names it.
     */
    async answer<T>({ provider, shape, name, limit, ...ask }: AiAsk & { provider: AiProviderId; shape: z.ZodType<T>; name: string; limit: string }): Promise<AiAnswer<T>> {
      const said = await providers[provider]({ ...ask, format: { name, schema: schemaFor(shape) } });
      let tokens = said.tokens;
      if (!tokens) {
        // A provider that leaves its count out (OpenAI marks `usage` optional) is metered by Panki's own, kept high.
        console.warn(`Panki AI: ${AI_PROVIDERS[provider].name} left its token counts out; Panki counted them itself.`);
        tokens = { input: ask.messages.reduce((sum, m) => sum + tokensAbout(m.text), 0), output: tokensAbout(said.text) };
      }
      const counted = said.tokens !== null;
      const text = said.text;
      // What the Log says under the error is expected against got, worded in the contracts' one home (`unread.ts`).
      if (said.refused) throw new AiError(UNREAD.refused, { tokens, raw: text, detail: UNREAD_REASONS.refused });
      if (said.cut) throw new AiError(UNREAD.cut(limit), { tokens, raw: text, detail: UNREAD_REASONS.cut(ask.maxTokens) });
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new AiError(UNREAD.unusable, { tokens, raw: text, detail: UNREAD_REASONS.notJson });
      }
      const read = shape.safeParse(raw);
      if (!read.success) throw new AiError(UNREAD.unusable, { tokens, raw: text, detail: read.error.issues.map((issue) => issueWords(issue, raw)).join(" ") });
      return { value: read.data, raw: said.text, inputTokens: tokens.input, outputTokens: tokens.output, counted };
    },
  };
}
