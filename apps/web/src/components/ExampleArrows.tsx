import type { Key } from "../keys";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { KeyCap } from "./KeyCap";

/**
 * The arrows that switch between a card's examples, ‹ 1 / 3 ›, each carrying its key when it has one: what a review
 * card holds as its `examplePager`, where its type lays them out. `at` is the one shown, from 0, of `count`; `onStep`
 * goes one back or on. The review and the Layout tab both draw these.
 */
export function ExampleArrows({ at, count, prev, next, onStep }: { at: number; count: number; prev: Key; next: Key; onStep: (by: 1 | -1) => void }) {
  return (
    <>
      <Button className="btn-icon review-example-step" data-hold="example-prev" aria-label="Previous example" onClick={() => onStep(-1)}>
        <Icon name="back" />
        <KeyCap bind={prev} />
      </Button>
      <span className="review-examples-at">
        {at + 1} / {count}
      </span>
      <Button className="btn-icon review-example-step" data-hold="example-next" aria-label="Next example" onClick={() => onStep(1)}>
        <KeyCap bind={next} />
        <Icon name="forward" />
      </Button>
    </>
  );
}
