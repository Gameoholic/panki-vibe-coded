/** @panki Any wait on Panki AI (`AiWaiting`), and the AI's spark (`AiSpark`). Never a spinner, never a second spark. */
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Panki AI at work: the spark where the
 * work will appear, turning while it works, is the wait. An answer that doesn't exist yet holds no room (no skeleton
 * lines stand for it); words being reworked stay where they
 * are under the skeleton's own sweep (`.skel`'s). Loading Panki's own data stays the plain `Skeleton`.
 */

/**
 * The spark, turning while `working` (about once a second), still otherwise and
 * under reduced motion. `burst` is a count of presses: each time it goes up, two small sparks blink at its corners once,
 * a short burst and gone (once, at the moment the button is pressed), and
 * never otherwise; 0, none. Sized as an icon is where it stands (16 px beside a button's words), `className` for its
 * colour or a size of its own. Its parts are the registry's own spark (`Icon` `ai`), never a second drawing of it.
 */
export function AiSpark({ working = false, burst = 0, className }: { working?: boolean; burst?: number; className?: string }) {
  return (
    <span className={["icon", "ai-spark", working ? "is-working" : "", className ?? ""].filter(Boolean).join(" ")} aria-hidden="true">
      <Icon name="ai" className="is-solid" />
      {/* Keyed by the count, so each press plays it afresh from its start. */}
      {burst > 0 ? (
        <span key={burst} className="ai-spark-burst">
          <Icon name="ai" className="is-solid ai-spark-mini is-one" />
          <Icon name="ai" className="is-solid ai-spark-mini is-two" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Words being reworked while the AI works (a field touched up), kept where they are, dimmed, answering no press, under
 * the skeleton's sweep. The spark is `AiSpark`, drawn by the caller where its head or button is.
 */
export function AiWaiting({ label = "Panki AI is answering", children }: { label?: string; children: ReactNode }) {
  return (
    <div className="ai-waiting" role="status" aria-label={label} aria-busy="true">
      <div className="ai-waiting-words" inert>
        {children}
      </div>
    </div>
  );
}
