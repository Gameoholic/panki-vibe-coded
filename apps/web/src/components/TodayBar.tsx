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
 * 2026-10-27): a name (a deck's when there's more than one; Extra study at a review's end), the counts, Show cards,
 * `tools` (extra study's how many), what's left for later (extra study: how many new cards it has), and Start at the
 * end (`children`). The review's today screen, its extra study and each deck on the picker are all this.
 */
export function TodayBar({ id, name, counts, shown, onShow, tools, left, children }: {
  id: string;
  name?: string;
  /** The counts in bold; none where the bar's number says them (extra study). */
  counts?: string;
  /** Whether the cards are shown under it; undefined where Show cards opens them elsewhere. */
  shown?: boolean;
  /** Show cards; none when there's nothing to show. */
  onShow?: () => void;
  /** What stands after Show cards: a control for what the counts say. */
  tools?: ReactNode;
  left?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="panel today-bar">
      {name ? <span className="today-name">{name}</span> : null}
      {counts ? <span className="today-counts">{counts}</span> : null}
      {onShow ? (
        <Button id={`${id}-show`} variant="ghost" className="today-show" aria-expanded={shown} onClick={onShow}>
          {shown ? "Hide cards" : "Show cards"}
          <Icon name={shown ? "up" : "down"} />
        </Button>
      ) : null}
      {tools}
      <span className="today-left">{left ?? null}</span>
      {children}
    </div>
  );
}
