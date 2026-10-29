import type { CSSProperties } from "react";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { clock } from "@web/words";
import { OFFER_AWAY_MS, OFFER_MS } from "../modules";

/**
 * Going on from where a video was stopped, offered on the picture as Netflix offers to skip an intro (the owner,
 * 2026-10-21): "Continue from 12:34?", an × at its end, and along its foot a faint line filling over `OFFER_MS`; `away`
 * fades it for `OFFER_AWAY_MS` before whoever draws it takes it off. `jumped` is the same box after Panki has already
 * gone there by itself, "Jumped to 12:34" with nothing to press, so it's plain the jump was Panki's and not the site's
 * own place (the owner, 2026-10-27). The video page draws it in the player's corner, the options page over its preview
 * of the seek bar. Never a second drawing of the offer.
 */
export function ResumeOffer({ at, jumped = false, away, onTake, onClose }: { at: number; jumped?: boolean; away: boolean; onTake: () => void; onClose: () => void }) {
  return (
    <div className={`skip-resume ${away ? "is-away" : ""}`.trim()} style={{ "--offer-ms": `${OFFER_MS}ms`, "--offer-away-ms": `${OFFER_AWAY_MS}ms` } as CSSProperties}>
      {jumped ? (
        <span className="skip-resume-said" role="status">
          Jumped to {clock(at)}
        </span>
      ) : (
        <Button className="skip-resume-go" onClick={onTake}>
          <Icon name="play" />
          Continue from {clock(at)}?
        </Button>
      )}
      <Button className="btn-icon skip-resume-x" aria-label={jumped ? "Close" : "Not now"} onClick={onClose}>
        <Icon name="close" />
      </Button>
      {/* The time it has left, filling from left to right; at the right edge it goes. */}
      <span className="skip-resume-bar" aria-hidden="true">
        <i />
      </span>
    </div>
  );
}
