import { z } from "zod";

/**
 * The usage ledger (2026-10-30): one row for every paid call Panki makes, whoever it's for, kept in the shared store
 * (`usage`), so credits and billing can be built on it later without anything being reversed. Each kind is the
 * service family it's shown under in Settings → Admin, every family its own panel's Usage (the owner, 2026-10-30:
 * "it has nothing to do with Panki AI, it's separate").
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
});
export type UsageTotals = z.infer<typeof UsageTotals>;

/**
 * One kind's usage for an admin, from a moment on (null: all of it): every account's totals by name, then those from
 * before calls were counted per account (`name` null, Forvo's requests before 2026-10-30), and everyone's.
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
