/** @panki The blind trial of the Word pop-up's Explain and Context wordings, temporary (`TRIAL_SETS`, `TrialPick`, `TrialRun`, `TrialResults`). */
// Temporary: the prompt trial, removed whole once the owner picks (aiActions.ts → the key above TRIAL_ACTIONS).
import { z } from "zod";

/*
 * The blind trial's shapes, apart from the actions' registry so the conversation's own shapes (`prompt.ts` →
 * `Explained`) can carry them without importing the registry. What each wording says, and how the trial is run and
 * taken out, is in `aiActions.ts`, in the key above `TRIAL_ACTIONS`. All of this file goes with it.
 */

/** The trial's wordings, Panki actions of the Word pop-up never listed or ticked, each set in its shuffled order. */
export const TRIAL_ACTION_IDS = [
  "explainPebble",
  "explainTeapot",
  "explainLantern",
  "explainWalrus",
  "explainLadder",
  "contextMitten",
  "contextAcorn",
  "contextKettle",
  "contextButton",
  "contextHarbor",
] as const;
export type TrialActionId = (typeof TRIAL_ACTION_IDS)[number];
/** Whether an id is one of the trial's wordings: never listed, never ticked, only picked in a message's stead. */
export const isTrialAction = (id: string): id is TrialActionId => (TRIAL_ACTION_IDS as readonly string[]).includes(id);
/** Each action on trial, by its id, and its set of wordings, the control among them, in the set's order. */
export const TRIAL_SETS: Readonly<Record<"explain" | "explainContext", readonly TrialActionId[]>> = {
  explain: ["explainPebble", "explainTeapot", "explainLantern", "explainWalrus", "explainLadder"],
  explainContext: ["contextMitten", "contextAcorn", "contextKettle", "contextButton", "contextHarbor"],
};
export type TrialBase = keyof typeof TRIAL_SETS;
export const TRIAL_BASES: readonly TrialBase[] = ["explain", "explainContext"];
const TrialVariant = z.enum(TRIAL_ACTION_IDS);
/**
 * The wordings a message went with, by the action each stands for: picked by Panki (`aiActions.ts` → `trialPickFor`) the
 * first time the message is sent, then sent with it again so a later message's prompt is rebuilt as it went. Each of
 * its own set.
 */
export const TrialPick = z.object({ explain: TrialVariant.optional(), explainContext: TrialVariant.optional() }).refine(
  (pick) =>
    TRIAL_BASES.every((base) => {
      const id = pick[base];
      return id === undefined || TRIAL_SETS[base].includes(id);
    }),
  { message: "A wording of another action." },
);
export type TrialPick = z.infer<typeof TrialPick>;
/** Whether a pick names any wording. */
export const trialPicked = (pick: TrialPick): boolean => TRIAL_BASES.some((base) => pick[base] !== undefined);
/** An answer that went with the trial's wordings: which, and the use kept of it (what its rating is given to). */
export const TrialRun = z.object({ pick: TrialPick, use: z.number().int().positive() });
export type TrialRun = z.infer<typeof TrialRun>;
/** A rating under an answer: thumbs up, Meh or thumbs down; none once it's taken back. */
export const TrialRating = z.enum(["up", "meh", "down"]);
export type TrialRating = z.infer<typeof TrialRating>;
export const TrialRate = z.object({ rating: TrialRating.nullable() });
export type TrialRate = z.infer<typeof TrialRate>;
const Count = z.number().int().nonnegative();
/** The trial so far, per set, each wording by its codename: how often it went, and its ratings (each answer's latest). */
export const TrialResults = z.object({
  sets: z.array(z.object({ name: z.string(), rows: z.array(z.object({ codename: z.string(), used: Count, up: Count, meh: Count, down: Count })) })),
});
export type TrialResults = z.infer<typeof TrialResults>;
export const TrialResultsResponse = z.object({ results: TrialResults });
/** How many times each wording went, by its id: what the next pick evens out. */
export function trialUsesOf(uses: readonly { pick: TrialPick }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const use of uses) {
    for (const base of TRIAL_BASES) {
      const id = use.pick[base];
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}
/** The results as plain text, for Copy results: a set a block, a wording a line. */
export const trialResultsText = (results: TrialResults): string =>
  results.sets.map((set) => [`${set.name}:`, ...set.rows.map((row) => `- ${row.codename}: used ${row.used}, 👍 ${row.up}, Meh ${row.meh}, 👎 ${row.down}`)].join("\n")).join("\n\n");
