import { createHash } from "node:crypto";
import { z } from "zod";
import { AI_PROVIDERS, type AiModel, type AiProviderId } from "@panki/contracts";
import { timedOut } from "../outbound";

/**
 * What every provider's client shares: the shapes of a call and its answer, the error said in the owner's words, and
 * the one way a provider is called, with its deadline. Only a provider's own host is ever called, with the key an admin
 * typed or the server's own; neither the key nor anything of the conversation is ever logged.
 */

/** One message of what's sent: Panki's prompt and the follow-up questions are the user's, the model's answers its own. */
export type AiMessage = { role: "user" | "assistant"; text: string };
/**
 * One call: the key, the model, the conversation so far, the most the answer may be in the provider's own tokens, and
 * who it's for as an opaque hash (`safetyIdOf`), so a provider tells one of Panki's accounts from another when it looks
 * for abuse rather than holding the owner's whole key to it.
 */
export type AiAsk = { key: string; model: AiModel; messages: readonly AiMessage[]; maxTokens: number; safetyId: string };

/**
 * An account as a provider is told of it (the owner, 2026-10-30, on Anthropic's own advice to developers whose users
 * reach Claude through them: "any IDs passed should be cryptographically hashed"): SHA-256 of Panki's account id, 64
 * hex letters, the same every call, never the name. Anthropic takes it as `metadata.user_id` (up to 512, "a uuid, hash
 * value, or other opaque identifier"), OpenAI as `safety_identifier` (up to 128, "hashing their username or email
 * address" recommended). Google's generateContent has no such field, and is told nothing.
 */
export const safetyIdOf = (userId: string): string => createHash("sha256").update(`panki-account:${userId}`).digest("hex");
/** What a provider answered: its words, whether it stopped at `maxTokens`, and its own count of the tokens, when it gave one. */
export type ProviderAnswer = { text: string; cut: boolean; tokens: { input: number; output: number } | null };
/** One provider: a call, in its own shape, and its answer read back into Panki's. */
export type ProviderClient = (ask: AiAsk) => Promise<ProviderAnswer>;

/** What went wrong with a provider, in the owner's words; always the provider's fault as the API answers it (502). */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** How long a provider may take to answer: a few paragraphs come back in seconds; under nginx's `proxy_read_timeout`, so the API answers first. */
const TIMEOUT_MS = 60_000;
/** How much of what a provider says about a refusal is passed on. */
const SAID_MAX = 200;
/** How all three say what's wrong: an `error` with a `message` (Anthropic's, OpenAI's and Google's alike, read 2026-10-30). */
const Refusal = z.object({ error: z.object({ message: z.string().min(1) }) });
/** A count of tokens as a provider gives it. */
export const Tokens = z.number().int().nonnegative();

/**
 * Sends a provider a call, within the deadline, and gives back its answer as it came, unread: each client reads its
 * own. A refusal is said in the owner's words, the provider's own sentence when it gave one. The body is read inside
 * the deadline too, so a provider that stalls part-way is said as slow.
 */
export async function postTo(fetcher: typeof fetch, provider: AiProviderId, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const { name } = AI_PROVIDERS[provider];
  let res: Response;
  let raw: string;
  try {
    res = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    raw = await res.text();
  } catch (e) {
    throw new AiError(timedOut(e) ? `${name} took too long to answer.` : `Couldn't reach ${name}.`);
  }
  let answer: unknown = null;
  try {
    answer = JSON.parse(raw);
  } catch {
    // Not JSON: read as nothing, and said below as an answer that couldn't be read.
  }
  if (res.ok) return answer;
  // Before the provider's own sentence: one about a wrong key can repeat part of it.
  if (res.status === 401 || res.status === 403) throw new AiError(`${name} refused the key. Check it in Admin → Panki AI.`);
  const refusal = Refusal.safeParse(answer);
  throw new AiError(refusal.success ? `${name}: ${refusal.data.error.message.slice(0, SAID_MAX)}` : `${name}'s answer couldn't be read.`);
}

/** An answer that came back but doesn't read as the provider's. */
export const unreadable = (provider: AiProviderId) => new AiError(`${AI_PROVIDERS[provider].name}'s answer couldn't be read.`);
