/** @panki Panki AI's one judgement, good, meh or bad, and a meaning's words for it (`JUDGEMENTS`, `Judgement`, `MEANING_JUDGEMENT_NAMES`). Never a second scale. */
import { z } from "zod";

/**
 * Panki AI's one judgement, one registry: good is right as it is, meh could be better (near, but not quite), bad is
 * wrong. A meaning judged and a field judged are the same scale, said in each one's own words: on a meaning Fits,
 * Close and Doesn't fit (`MEANING_JUDGEMENT_NAMES`), on a field the proposal's title (`touchUp.ts`). Its looks are
 * `app.css` → `.ai-judgement.is-good / is-meh / is-bad`: green, orange, red and struck through.
 */
export const JUDGEMENTS = ["good", "meh", "bad"] as const;
export const Judgement = z.enum(JUDGEMENTS);
export type Judgement = z.infer<typeof Judgement>;
/** A meaning's judgement as it's said on screen, beside its row. */
export const MEANING_JUDGEMENT_NAMES: Record<Judgement, string> = { good: "Fits", meh: "Close", bad: "Doesn't fit" };
