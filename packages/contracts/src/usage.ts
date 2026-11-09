/** @panki The usage ledger as shapes: a paid call's kinds, costs and totals (`UsageKind`, `UsageTotals`, `UsageReport`, `soundCostMicros`). Writing a row is the API's alone. */
import { z } from "zod";

/**
 * The usage ledger: one row for every paid call Panki makes, whoever it's for, kept in the shared store
 * (`usage`), so credits and billing can be built on it later without anything being reversed. Each kind is the
 * service family it's shown under in Settings → Admin, every family its own panel's Usage, apart from Panki
 * AI's.
 */
export const UsageKind = z.enum(["ai", "transcription", "wordAudio"]);
export type UsageKind = z.infer<typeof UsageKind>;
export const USAGE_KIND_IDS = UsageKind.options;

/** A millionth of a dollar is a hundredth of a cent: costs are kept whole in these. */
export const MICROS_PER_CENT = 10_000;

/** What some sound cost at an engine's listed price per hour, in whole micro-dollars, rounded once. */
export const soundCostMicros = (centsPerHour: number, soundMs: number): number => Math.round((soundMs * centsPerHour * MICROS_PER_CENT) / 3_600_000);

const amount = z.number().int().nonnegative();
/**
 * What was used, added up: how many calls (a row each), the tokens in and out (Panki AI), the sound sent (an engine),
 * the requests made (a source of word audio), and what it all cost at the listed prices, in micro-dollars; null when
 * nothing of it is priced (Forvo, a flat plan).
 */
export const UsageTotals = z.object({
  calls: amount,
  inputTokens: amount,
  outputTokens: amount,
  soundMs: amount,
  requests: amount,
  costMicros: amount.nullable(),
  /** How many of the calls were each thing done (the ledger's `what`: an AI place's id, a chunk, a whole video…), so Panki AI's Usage says Explain, Touch up and Proofread apart (AI step 6). */
  byWhat: z.record(z.string(), amount).default({}),
});
export type UsageTotals = z.infer<typeof UsageTotals>;

/**
 * One kind's usage for an admin, from a moment on (null: all of it): every account's totals by name, then those from
 * before calls were counted per account (`name` null, Forvo's requests from before the ledger), and everyone's.
 */
export const UsageReport = z.object({
  kind: UsageKind,
  since: z.number().int().nullable(),
  accounts: z.array(UsageTotals.extend({ name: z.string().nullable() })),
  all: UsageTotals,
});
export type UsageReport = z.infer<typeof UsageReport>;
export const UsageResponse = z.object({ usage: UsageReport });

/** What's asked: a kind, and from when (ms since the epoch; left out, all of it). */
export const UsageQuery = z.object({ kind: UsageKind, since: z.coerce.number().int().nonnegative().optional() });
export type UsageQuery = z.infer<typeof UsageQuery>;
