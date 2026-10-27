import type { ReactNode } from "react";
import { count } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** Today's reviews and new cards in words: "12 reviews · 5 new", either left out at none; null when both are. */
export function todayWords(reviews: number, fresh: number): string | null {
  const words = [reviews > 0 ? count(reviews, "review", "reviews") : "", fresh > 0 ? `${fresh} new` : ""].filter(Boolean).join(" · ");
  return words || null;
}

/**
 * Today's cards folded to their counts (the owner's pick, A of https://claude.ai/artifact/XVHRcYb8TKjrgrBdsUFtoG,
 * 2026-10-27): a deck's name when there's more than one, the counts, Show cards, what's left for later, and Start at
 * the end (`children`). The review's today screen and each deck on the picker are both this.
 */
export function TodayBar({ id, name, counts, shown, onShow, left, children }: {
  id: string;
  name?: string;
  counts: string;
  /** Whether the cards are shown under it; undefined where Show cards opens them elsewhere. */
  shown?: boolean;
  /** Show cards; none when there's nothing to show. */
  onShow?: () => void;
  left?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="panel today-bar">
      {name ? <span className="today-name">{name}</span> : null}
      <span className="today-counts">{counts}</span>
      {onShow ? (
        <Button id={`${id}-show`} variant="ghost" className="today-show" aria-expanded={shown} onClick={onShow}>
          {shown ? "Hide cards" : "Show cards"}
          <Icon name={shown ? "up" : "down"} />
        </Button>
      ) : null}
      <span className="today-left">{left ?? null}</span>
      {children}
    </div>
  );
}
