import { z } from "zod";
import type { EngineAccount } from "@panki/contracts";
import { EngineError, type EngineClient, type Heard } from "./engines";

/**
 * ElevenLabs Scribe v2 (the owner's pick, 2026-10-16: "$0.22 an hour, 4½ hours free"). One call per piece: the sound
 * as a file in a multipart form, the words back with their times. The key goes only in the `xi-api-key` header. And
 * the account behind the key, from `GET /v1/user/subscription` (its docs, read 2026-10-17: `tier`, `status`,
 * `character_count` of `character_limit` in the period, `next_character_count_reset_unix`, `current_overage`), for
 * an admin's Settings.
 *
 * Its answers are read defensively, as Forvo's are: the whole through one shape, each word on its own, one that doesn't
 * fit dropped rather than the piece refused.
 */

const HOST = "https://api.elevenlabs.io";
const API = `${HOST}/v1/speech-to-text`;
const SUBSCRIPTION = `${HOST}/v1/user/subscription`;
const MODEL = "scribe_v2";
/** How much of what ElevenLabs says about a refusal is passed on. */
const SAID_MAX = 200;

/** One row of the answer's `words`: a word, a space, or a sound that isn't speech; only the words are kept. */
const Row = z.object({ text: z.string(), start: z.number(), end: z.number(), type: z.string() });
const Answer = z.object({
  language_code: z.string(),
  language_probability: z.number(),
  text: z.string().catch(""),
  words: z.array(z.unknown()).catch([]),
});
/** How ElevenLabs says what's wrong: `detail` as a sentence, or as an object with a `message` or a `status`. */
const Refusal = z.object({ detail: z.union([z.string(), z.object({ message: z.string().optional(), status: z.string().optional() })]) });
/** The account, as far as it's shown: the plan and its standing, the credits of the period, the pay-as-you-go so far. */
const Subscription = z.object({
  tier: z.string(),
  status: z.string(),
  character_count: z.number().int().nonnegative(),
  character_limit: z.number().int().nonnegative(),
  next_character_count_reset_unix: z.number().int().nullable().optional(),
  current_overage: z.object({ amount: z.string(), currency: z.string() }).nullable().optional(),
});

const toMs = (seconds: number) => Math.round(seconds * 1000);

/** What ElevenLabs said about a refusal, when it said anything, cut short. */
function saidOf(body: unknown): string | null {
  const refusal = Refusal.safeParse(body);
  if (!refusal.success) return null;
  const { detail } = refusal.data;
  const said = typeof detail === "string" ? detail : (detail.message ?? detail.status);
  return said ? said.slice(0, SAID_MAX) : null;
}

/** What a refusal comes to, in the owner's words: ElevenLabs' own sentence when it gave one. */
function refused(status: number, body: unknown): EngineError {
  const said = saidOf(body);
  if (said !== null) return new EngineError(`ElevenLabs: ${said}`);
  return new EngineError(status === 401 || status === 403 ? "ElevenLabs refused. Check the key in Settings → Admin." : "ElevenLabs couldn't answer that.");
}

export function createElevenLabs(fetcher: typeof fetch): EngineClient {
  return {
    async account(key): Promise<EngineAccount> {
      let res: Response;
      try {
        res = await fetcher(SUBSCRIPTION, { headers: { "xi-api-key": key } });
      } catch {
        throw new EngineError("Couldn't reach ElevenLabs.");
      }
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) throw refused(res.status, body);
      const read = Subscription.safeParse(body);
      if (!read.success) throw new EngineError("ElevenLabs' answer couldn't be read.");
      const { tier, status, character_count, character_limit, next_character_count_reset_unix, current_overage } = read.data;
      // ElevenLabs counts in seconds since the epoch; Panki in milliseconds.
      return { plan: tier, status, used: character_count, limit: character_limit, resetsAt: next_character_count_reset_unix == null ? null : next_character_count_reset_unix * 1000, overage: current_overage ?? null };
    },
    async transcribe(key, wav, language) {
      const form = new FormData();
      form.set("model_id", MODEL);
      form.set("file", new Blob([wav], { type: "audio/wav" }), "piece.wav");
      form.set("timestamps_granularity", "word");
      form.set("tag_audio_events", "false");
      form.set("diarize", "false");
      if (language !== null) form.set("language_code", language);
      let res: Response;
      try {
        res = await fetcher(API, { method: "POST", headers: { "xi-api-key": key }, body: form });
      } catch {
        throw new EngineError("Couldn't reach ElevenLabs.");
      }
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) throw refused(res.status, body);
      const answer = Answer.safeParse(body);
      if (!answer.success) throw new EngineError("ElevenLabs' answer couldn't be read.");
      const words: Heard["words"] = answer.data.words.flatMap((raw) => {
        const row = Row.safeParse(raw);
        return row.success && row.data.type === "word" ? [{ text: row.data.text, startMs: toMs(row.data.start), endMs: toMs(row.data.end) }] : [];
      });
      // How sure it was is read as a share, whatever it sends: a number outside 0 to 1 would refuse the whole piece.
      const probability = Math.min(1, Math.max(0, answer.data.language_probability));
      return { language: { code: answer.data.language_code, probability }, words };
    },
  };
}
