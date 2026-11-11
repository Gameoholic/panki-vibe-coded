/** @panki Whether the card on screen is blurred, by its showing: Unblur and Blur, and a showing put on screen clear (`useBlur`). */
import { useState } from "react";

/** A card put on screen: a review's turn, or the card a Layout tab shows. */
type Showing = string | number;

/**
 * Whether the card on screen is to be blurred, while the account's Start cards blurred is on (`on`): every showing opens
 * blurred until it's unblurred by hand (Unblur, its key) or turned to its back, which leaves its front clear for Step
 * back. Off, nothing is blurred, at once; switched on, blurring starts with the next showing, the one on screen staying
 * as it is. Whether the card has anything to blur is its type's to say (`blursFront`), never this.
 */
export function useBlur(on: boolean, showing: Showing) {
  /** The showing that's clear; any other opens blurred. */
  const [clear, setClear] = useState<Showing | null>(null);
  const [wasOn, setWasOn] = useState(on);
  if (wasOn !== on) {
    setWasOn(on);
    if (on) setClear(showing);
  }
  const blurred = on && clear !== showing;
  return {
    blurred,
    /** Unblur while blurred, Blur while clear. */
    toggle: () => setClear(blurred ? showing : null),
    /** A showing clear: the one on screen, turned to its back, or the one Undo is about to put there (`at`). */
    unblur: (at: Showing = showing) => setClear(at),
  };
}
