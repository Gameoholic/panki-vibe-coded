import { POOL_MAX, againPlaceOf, type ReviewSettings } from "@panki/contracts";
import { NumberField } from "../components/NumberField";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { Toggle } from "../components/Toggle";
import { count } from "../words";

/** How many cards are in play when the limit is first switched on. */
const POOL_START = 10;

const NEW_PLACE_OPTIONS = [
  { id: "first", label: "Before reviews" },
  { id: "last", label: "After reviews" },
  { id: "scattered", label: "Scattered" },
] as const;
const NEW_ORDER_OPTIONS = [
  { id: "added", label: "Oldest added first" },
  { id: "shuffled", label: "Shuffled" },
] as const;
const REVIEW_ORDER_OPTIONS = [
  { id: "random", label: "Shuffled" },
  { id: "overdue", label: "Longest overdue" },
] as const;
/** Under a setting: what the choice made right now does, never a tour of the others. */
const REVIEW_ORDER_WORDS: Record<ReviewSettings["reviewOrder"], string> = {
  random: "The cards due come in a random order.",
  overdue: "The card that has been due the longest comes first.",
};
const AGAIN_PLACE_OPTIONS = [
  { id: "end", label: "At the end" },
  { id: "random", label: "Anywhere" },
] as const;
const AGAIN_PLACE_WORDS: Record<ReviewSettings["againPlace"], string> = {
  // A pile of its own, so it's plain that the cards that failed have a separate section.
  end: "Cards you're asked again collect in a separate pile at the end, after the rest of the review.",
  random: "A card you're asked again comes back at a random point in the rest of the review.",
};
/** With only so many cards in play, a card asked again lands anywhere among them (`againPlaceOf`). */
const againInPool = (pool: number) => `A card you're asked again comes back at a random point within the next ${count(pool, "card", "cards")}.`;
const EXAMPLE_SHOWN_OPTIONS = [
  { id: "rotate", label: "Rotate" },
  { id: "newest", label: "Newest" },
  { id: "random", label: "Random" },
] as const;

/**
 * Settings → General → Reviews: how every review runs, the same for every deck (`ReviewSettings`, the account's). What
 * each deck has of its own (new cards and reviews a day, the Hold button's answer) is in the deck's settings.
 */
export function ReviewsPanel({ current, patch }: { current: ReviewSettings; patch: (change: Partial<ReviewSettings>) => void }) {
  return (
    <section className="panel" aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="panel-title">
        Reviews
      </h2>
      <Setting
        id="todayFirst"
        label="Today's cards before a review"
        control={<Toggle id="setting-today-first" says={{ on: "Shown", off: "Skipped" }} on={current.todayFirst} onChange={(todayFirst) => patch({ todayFirst })} />}
      />
      <Setting
        id="newPlace"
        label="In a review, new cards come"
        control={<Segmented idPrefix="setting-new-place" label="In a review, new cards come" options={NEW_PLACE_OPTIONS} value={current.newPlace} onChange={(newPlace) => patch({ newPlace })} />}
      />
      <Setting
        id="newOrder"
        label="Which new cards first"
        control={<Segmented idPrefix="setting-new-order" label="Which new cards first" options={NEW_ORDER_OPTIONS} value={current.newOrder} onChange={(newOrder) => patch({ newOrder })} />}
      />
      <Setting
        id="reviewOrder"
        label="Which reviews first"
        control={<Segmented idPrefix="setting-review-order" label="Which reviews first" options={REVIEW_ORDER_OPTIONS} value={current.reviewOrder} onChange={(reviewOrder) => patch({ reviewOrder })} />}
        why={REVIEW_ORDER_WORDS[current.reviewOrder]}
      />
      <Setting
        id="againPlace"
        label="A card asked again comes back"
        control={
          <Segmented
            idPrefix="setting-again-place"
            label="A card asked again comes back"
            options={AGAIN_PLACE_OPTIONS}
            value={againPlaceOf(current)}
            disabled={current.pool !== null}
            onChange={(againPlace) => patch({ againPlace })}
          />
        }
        why={current.pool !== null ? againInPool(current.pool) : AGAIN_PLACE_WORDS[current.againPlace]}
      />
      <Setting
        id="pool"
        label="Cards at a time"
        control={
          <div className="setting-pair">
            <Toggle id="setting-pool-all" says={{ on: "All of them", off: "Only some" }} on={current.pool === null} onChange={(all) => patch({ pool: all ? null : POOL_START })} />
            {current.pool === null ? null : <NumberField id="setting-pool" label="Cards at a time" value={current.pool} min={1} max={POOL_MAX} onChange={(pool) => patch({ pool })} />}
          </div>
        }
        why={current.pool === null ? "Every card of a review is in play from the start." : `Up to ${count(current.pool, "card", "cards")} at a time. A new card is added once you're done with one.`}
      />
      <Setting
        id="exampleShown"
        label="Example shown"
        control={<Segmented idPrefix="setting-example-shown" label="Example shown" options={EXAMPLE_SHOWN_OPTIONS} value={current.exampleShown} onChange={(exampleShown) => patch({ exampleShown })} />}
      />
    </section>
  );
}
