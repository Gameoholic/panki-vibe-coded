// Temporary: the prompt trial, removed whole once the owner picks (aiActions.ts → the key above TRIAL_ACTIONS).
import type { DatabaseSync } from "node:sqlite";
import { TrialPick, TrialRating, trialUsesOf, type TrialRating as Rating } from "@panki/contracts";

/*
 * The blind trial of the Word pop-up's Explain and Context wordings, as an account keeps it: temporary, and kept where
 * it's simplest to take out whole (`aiActions.ts` → the key above `TRIAL_ACTIONS`). No table of its own, so no
 * migration: rows of the account's ledger (`events`, whose `kind` is free text and `data` JSON), of two kinds:
 * - `promptTrialUse`: an answer that went with the trial's wordings, `data` its pick (`TrialPick`); its id is the use a
 *   rating names;
 * - `promptTrialRating`: a thumb given under that answer, or taken back, `data` `{ use, rating }` (`rating` null once
 *   taken back); an answer's latest stands;
 * - `promptTrialClear`: Clear results pressed. Nothing is destroyed: every read counts only the rows after the latest
 *   clear (the results, the counts the next pick evens out, the uses that can still be rated), so an answer from before
 *   it takes no thumb any more (`rate` says no, and the page puts the thumb back as it was).
 * Taking it out: this file, its one use in `db.ts`, and the routes; the rows stay, read by nothing (or are deleted by
 * kind, the two kinds above being the trial's alone).
 */

const USE = "promptTrialUse";
const RATING = "promptTrialRating";
const CLEAR = "promptTrialClear";

/** Kept JSON read back, or null when it no longer reads. */
const parsed = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** The trial's rows of an account's database: each use, each rating, and how many times each wording went. */
export function promptTrialStore(db: DatabaseSync) {
  const insert = db.prepare("INSERT INTO events (at, client_at, kind, data) VALUES (?, ?, ?, ?)");
  // Every read is of the rows after the latest clear (0 before any).
  const after = `id > COALESCE((SELECT MAX(id) FROM events WHERE kind = '${CLEAR}'), 0)`;
  const selectKind = db.prepare(`SELECT id, data FROM events WHERE kind = ? AND ${after} ORDER BY id`);
  const selectUse = db.prepare(`SELECT 1 AS found FROM events WHERE id = ? AND kind = ? AND ${after}`);

  const uses = (): { id: number; pick: TrialPick }[] =>
    (selectKind.all(USE) as { id: number; data: string }[]).flatMap((row) => {
      const pick = TrialPick.safeParse(parsed(row.data));
      return pick.success ? [{ id: Number(row.id), pick: pick.data }] : [];
    });
  // A rating of a use from before the clear isn't one, even given after it (`rate` refuses those anyway).
  const ratings = (): { use: number; rating: Rating | null }[] =>
    (selectKind.all(RATING) as { id: number; data: string }[]).flatMap((row) => {
      const data = parsed(row.data) as { use?: unknown; rating?: unknown } | null;
      const rating = data?.rating === null ? null : TrialRating.safeParse(data?.rating).data;
      return typeof data?.use === "number" && rating !== undefined ? [{ use: data.use, rating }] : [];
    });

  return {
    uses,
    ratings,
    /** How many times each wording went so far, by its id: what the next pick evens out. */
    counts: (): Record<string, number> => trialUsesOf(uses()),
    /** An answer that went with the trial's wordings: kept, and its use's id, what a rating names. */
    keepUse(pick: TrialPick, now: number): number {
      return Number(insert.run(now, now, USE, JSON.stringify(pick)).lastInsertRowid);
    },
    /** A thumb given under an answer, or taken back (null); false when there's no such use since the latest clear. */
    rate(use: number, rating: Rating | null, now: number): boolean {
      if (!selectUse.get(use, USE)) return false;
      insert.run(now, now, RATING, JSON.stringify({ use, rating }));
      return true;
    },
    /** Clear results: from here on the trial starts over; what's kept before stays, read by nothing. */
    clear(now: number): void {
      insert.run(now, now, CLEAR, "{}");
    },
  };
}
