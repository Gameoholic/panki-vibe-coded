import type { ReactNode } from "react";
import { Bone } from "./Skeleton";
import { Icon } from "./Icon";

/**
 * Panki AI at work, the one look for every wait on a model (the owner's pick, 2026-10-30, A with Sparkles every other
 * sweep, https://claude.ai/artifact/66E2s4QyNZhuuAVvZddbsW). It is the app's skeleton, never a second way of loading:
 * the same blocks and the same sweep (`Bone`, `.skel`); what makes it the AI's is the spark where the work will appear,
 * two small sparks blinking at its corners as every other sweep sets off. Loading Panki's own data (the Admin panel's
 * settings) stays the plain `Skeleton`; only a wait on the model is this.
 */

/** Widths of an answer's lines while it's on its way: nearly full, every fourth short, as a paragraph ends. */
const LINE_WIDTHS = ["96%", "88%", "92%", "60%"];

/**
 * The spark, sparkling while `working`, still otherwise; the spark itself never moves, only the two small ones at its
 * corners. Sized as an icon is where it stands (16 px beside a button's words), `className` for its colour or a size
 * of its own. Its parts are the registry's own spark (`Icon` `ai`), never a second drawing of it.
 */
export function AiSpark({ working = false, className }: { working?: boolean; className?: string }) {
  return (
    <span className={["icon", "ai-spark", working ? "is-working" : "", className ?? ""].filter(Boolean).join(" ")} aria-hidden="true">
      <Icon name="ai" className="is-solid" />
      {working ? (
        <>
          <Icon name="ai" className="is-solid ai-spark-mini is-one" />
          <Icon name="ai" className="is-solid ai-spark-mini is-two" />
        </>
      ) : null}
    </span>
  );
}

/**
 * What stands while the AI works, under the skeleton's sweep. Without `children`, `lines` skeleton lines hold the room
 * of an answer that doesn't exist yet; given them, they are the words being reworked (a field touched up, a
 * transcript's row corrected), kept where they are, dimmed, answering no press. The spark is `AiSpark`, drawn by the
 * caller where its head or button is, so nothing moves when the answer takes this one's place.
 */
export function AiWaiting({ lines = 4, label = "Panki AI is answering", children }: { lines?: number; label?: string; children?: ReactNode }) {
  if (children !== undefined) {
    return (
      <div className="ai-waiting is-over" role="status" aria-label={label} aria-busy="true">
        <div className="ai-waiting-words" inert>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="ai-waiting skel-lines" role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} w={LINE_WIDTHS[i % LINE_WIDTHS.length] ?? "90%"} />
      ))}
    </div>
  );
}
