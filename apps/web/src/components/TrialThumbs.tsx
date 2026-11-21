/** @panki The blind trial's rating under an answer: a quiet thumb up and thumb down, one press, again to take it back (`TrialThumbs`). Temporary. */
// Temporary: the prompt trial, removed whole once the owner picks (aiActions.ts → the key above TRIAL_ACTIONS).
import type { TrialRating } from "@panki/contracts";
import { QuietIconButton } from "./AiRun";

/** What the thumbs say, one home: their labels and Tips, never which wording the answer went with. */
const THUMB_WORDS: Record<TrialRating, string> = { up: "Good answer", down: "Bad answer" };

/**
 * Under an answer that went with the blind trial's wordings (temporary: `aiActions.ts`, the key above `TRIAL_ACTIONS`):
 * a thumb up and a thumb down, quiet, one press; the one given lit, pressed again to take it back, the other pressed to
 * switch. Nothing else to fill in, and nothing of the trial named.
 */
export function TrialThumbs({ rating, onRate }: { rating: TrialRating | null; onRate: (rating: TrialRating | null) => void }) {
  return (
    <span className="trial-thumbs" role="group" aria-label="Rate this answer">
      {(["up", "down"] as const).map((each) => (
        <QuietIconButton
          key={each}
          className={`trial-thumb${rating === each ? " is-on" : ""}`}
          icon={each === "up" ? "thumbUp" : "thumbDown"}
          words={THUMB_WORDS[each]}
          open={false}
          pressed={rating === each}
          onClick={() => onRate(rating === each ? null : each)}
        />
      ))}
    </span>
  );
}
