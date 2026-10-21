import type { CSSProperties } from "react";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { clock } from "@web/words";
import { OFFER_AWAY_MS, OFFER_MS } from "../modules";

/**
 * Going on from where a video was stopped, offered on the picture as Netflix offers to skip an intro (the owner,
 * 2026-10-21): "Continue from 12:34?", an × at its end, and along its foot a faint line filling over `OFFER_MS`; `away`
 * fades it for `OFFER_AWAY_MS` before whoever draws it takes it off. The video page draws it in the player's corner,
 * the options page over its preview of the seek bar. Never a second drawing of the offer.
 */
export function ResumeOffer({ at, away, onTake, onClose }: { at: number; away: boolean; onTake: () => void; onClose: () => void }) {
  return (
    <div className={`skip-resume ${away ? "is-away" : ""}`.trim()} style={{ "--offer-ms": `${OFFER_MS}ms`, "--offer-away-ms": `${OFFER_AWAY_MS}ms` } as CSSProperties}>
      <Button className="skip-resume-go" onClick={onTake}>
        Continue from {clock(at)}?
      </Button>
      <Button className="btn-icon skip-resume-x" aria-label="Not now" onClick={onClose}>
        <Icon name="close" />
      </Button>
      {/* The time it has left, filling from left to right; at the right edge it goes. */}
      <span className="skip-resume-bar" aria-hidden="true">
        <i />
      </span>
    </div>
  );
}
