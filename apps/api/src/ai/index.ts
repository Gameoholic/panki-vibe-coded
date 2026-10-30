import { AI_PROVIDERS, tokensAbout, type AiProviderId } from "@panki/contracts";
import { createAnthropic } from "./anthropic";
import type { AiAsk, ProviderClient } from "./call";
import { createGoogle } from "./google";
import { createOpenAi } from "./openai";

export { AiError, safetyIdOf, type AiMessage } from "./call";

/**
 * Panki AI's providers (the owner's decision of 2026-10-30, which lifted "nothing generated"): one client per provider
 * in the contracts' `AI_PROVIDERS`, each its own host alone. One call, the same for all three: a conversation in, an
 * answer out, with the tokens it took as the provider counted them, which is what the usage ledger keeps.
 */

/** An answer: its words, whether it was cut short at the cap, its tokens, and whether those are the provider's own count (`counted`) or Panki's. */
export type AiAnswer = { text: string; cut: boolean; inputTokens: number; outputTokens: number; counted: boolean };
export type AiClient = ReturnType<typeof createAiClient>;

/** `fetcher` is passed in, like the API's clock, so a test can stand in for a provider. */
export function createAiClient(fetcher: typeof fetch = fetch) {
  const providers: Record<AiProviderId, ProviderClient> = {
    anthropic: createAnthropic(fetcher),
    openai: createOpenAi(fetcher),
    google: createGoogle(fetcher),
  };
  return {
    async answer({ provider, ...ask }: AiAsk & { provider: AiProviderId }): Promise<AiAnswer> {
      const { text, cut, tokens } = await providers[provider](ask);
      if (tokens) return { text, cut, inputTokens: tokens.input, outputTokens: tokens.output, counted: true };
      // A provider that leaves its count out (OpenAI marks `usage` optional) is metered by Panki's own, kept high.
      console.warn(`Panki AI: ${AI_PROVIDERS[provider].name} left its token counts out; Panki counted them itself.`);
      const sent = ask.messages.reduce((sum, m) => sum + tokensAbout(m.text), 0);
      return { text, cut, inputTokens: sent, outputTokens: tokensAbout(text), counted: false };
    },
  };
}
