import { Router } from "express";
import { UsageQuery, type UsageReport, type UsageTotals } from "@panki/contracts";
import type { AuthDb } from "../authDb";
import { requireAdmin } from "../session";
import type { Shared, UsageRow } from "../shared";

const NONE: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0, soundMs: 0, requests: 0, costMicros: null };

/** Two totals added; a cost stays null only while neither side has one. */
function plus(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    calls: a.calls + b.calls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    soundMs: a.soundMs + b.soundMs,
    requests: a.requests + b.requests,
    costMicros: a.costMicros === null && b.costMicros === null ? null : (a.costMicros ?? 0) + (b.costMicros ?? 0),
  };
}

const totalsOf = ({ userId: _userId, ...totals }: UsageRow): UsageTotals => totals;

/**
 * The usage ledger, for an admin (2026-10-30): one kind's calls from a moment on, every account by name (one with
 * nothing used shows nothing used), then the calls from before they were counted per account, then everyone's. The
 * moment is the browser's to pick (this month on its clock, the last 30 days); left out, all of it.
 */
export function usageRouter(shared: Shared, auth: AuthDb) {
  const router = Router();

  router.get("/", requireAdmin, (req, res) => {
    const parsed = UsageQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a kind of usage." } });
      return;
    }
    const { kind, since } = parsed.data;
    const rows = shared.usageOf(kind, since ?? 0);
    const byUser = new Map(rows.map((row) => [row.userId, totalsOf(row)]));
    const accounts: UsageReport["accounts"] = auth.listUsers().map((user) => ({ name: user.name, ...(byUser.get(user.id) ?? NONE) }));
    const unknown = byUser.get(null);
    if (unknown) accounts.push({ name: null, ...unknown });
    const report: UsageReport = { kind, since: since ?? null, accounts, all: rows.map(totalsOf).reduce(plus, NONE) };
    res.json({ usage: report });
  });

  return router;
}
