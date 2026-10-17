import type { EngineAccount, EngineId, HeardLanguage } from "@panki/contracts";
import { createElevenLabs } from "./elevenlabs";

/**
 * The transcription engines Panki can hand a piece of a video's sound to (the owner's decision of 2026-10-16 and 17,
 * which set aside "nothing generated" for this one thing). One registry: an engine is one entry in the contracts'
 * `ENGINES` and one client here; nothing else names one. Only an engine's own host is ever called, with the key an
 * admin typed or the server's own, and neither the key nor a request is ever logged.
 */

/** What went wrong with an engine, in the owner's words. The engine's fault (502) unless said otherwise. */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** What an engine heard in a piece: the language, and each word with its times from the piece's own start, in ms. */
export type Heard = { language: HeardLanguage; words: { text: string; startMs: number; endMs: number }[] };

/**
 * One engine: given a key and a piece's sound (a WAV), what it heard (told the language, or null to say what it hears);
 * and, given the key, the account behind it as the engine tells of it, for an admin's Settings.
 */
export type EngineClient = { transcribe(key: string, wav: Buffer, language: "jpn" | null): Promise<Heard>; account(key: string): Promise<EngineAccount> };
export type Engines = Record<EngineId, EngineClient>;

/** `fetcher` is passed in, like the API's clock, so a test can stand in for an engine. */
export function createEngines(fetcher: typeof fetch = fetch): Engines {
  return { elevenlabs: createElevenLabs(fetcher) };
}
