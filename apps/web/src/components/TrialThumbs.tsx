/** @panki The blind trial's rating under an answer: a quiet thumb up, Meh and thumb down, one press, again to take it back (`TrialThumbs`). Temporary. */
// Temporary: the prompt trial, removed whole once the owner picks (aiActions.ts → the key above TRIAL_ACTIONS).
import type { TrialRating } from "@panki/contracts";
import { QuietIconButton } from "./AiRun";

/** What the ratings say, one home, in the order they stand: their icons, labels and Tips, never which wording the answer went with. */
const RATINGS: readonly { rating: TrialRating; icon: "thumbUp" | "meh" | "thumbDown"; words: string }[] = [
  { rating: "up", icon: "thumbUp", words: "Good answer" },
  { rating: "meh", icon: "meh", words: "Meh" },
  { rating: "down", icon: "thumbDown", words: "Bad answer" },
];

/**
 * Under an answer that went with the blind trial's wordings (temporary: `aiActions.ts`, the key above `TRIAL_ACTIONS`):
 * a thumb up, Meh and a thumb down, quiet, alike, one press; the one given lit, pressed again to take it back, another
 * pressed to switch. Nothing else to fill in, and nothing of the trial named.
 */
export function TrialThumbs({ rating, onRate }: { rating: TrialRating | null; onRate: (rating: TrialRating | null) => void }) {
  return (
    <span className="trial-thumbs" role="group" aria-label="Rate this answer">
      {RATINGS.map((each) => (
        <QuietIconButton
          key={each.rating}
          className={`trial-thumb${rating === each.rating ? " is-on" : ""}`}
          icon={each.icon}
          words={each.words}
          open={false}
          pressed={rating === each.rating}
          onClick={() => onRate(rating === each.rating ? null : each.rating)}
        />
      ))}
    </span>
  );
}
