import { z } from "zod";
import { MediaId } from "./media";

/**
 * Word audio recorded by people, from Forvo (the owner's choice, 2026-10-15): Panki's server holds the key and calls
 * Forvo, and a recording it fetches is kept as one of the account's files, so a card plays it from Panki ever after.
 * Forvo is one source of word audio among those `wordAudio.ts` lists; what's here is Forvo's own: its answers and
 * what's asked of it.
 */

/** The longest word asked of Forvo. */
export const FORVO_WORD_MAX = 64;

/** One recording of a word: who said it, from where, how many liked it. Never its address on Forvo. */
export const ForvoVoice = z.object({
  id: z.number().int(),
  by: z.string(),
  sex: z.enum(["m", "f", ""]),
  country: z.string(),
  votes: z.number().int(),
});
export type ForvoVoice = z.infer<typeof ForvoVoice>;

export const ForvoVoicesResponse = z.object({ voices: z.array(ForvoVoice) });

/** A word's recording to keep: which word, and which of its recordings. */
export const ForvoTake = z.object({ word: z.string().trim().min(1).max(FORVO_WORD_MAX), id: z.number().int() });
export type ForvoTake = z.infer<typeof ForvoTake>;
/** The recording, kept: the account's file it now is. The same recording asked for again is the same file. */
export const ForvoTakeResponse = z.object({ mediaId: MediaId });

/**
 * Forvo's own answers, as far as Panki reads them. They aren't documented, so each is read defensively: a recording
 * that doesn't fit `ForvoItem` is dropped on its own, and what's wrong comes as a list of sentences (`ForvoSaid`).
 */
export const ForvoItem = z.object({
  id: z.number().int(),
  username: z.string().catch(""),
  sex: z.enum(["m", "f", ""]).catch(""),
  country: z.string().catch(""),
  pathmp3: z.string(),
  num_positive_votes: z.number().int().catch(0),
});
export type ForvoItem = z.infer<typeof ForvoItem>;
export const ForvoList = z.object({ items: z.array(z.unknown()) });
export const ForvoSaid = z.array(z.string());
