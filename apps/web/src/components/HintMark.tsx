/** @panki A (?) after a label that opens words, not a scene (`HintMark`). */
import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Tip } from "./Tip";

type Props = {
  /** What the words are about, for a screen reader: "How Each run is worked out". */
  about: string;
  /** The words, a sentence or two. */
  words: ReactNode;
  /** Pressed: the words stand under what it's beside (the caller draws them there, `Setting`'s `hint`). */
  pressed: boolean;
  onPress: () => void;
};

/**
 * A (?) with words rather than a scene (Each run's, saying briefly how its number is worked out): the explainers' (?) mark (`.explain-q`), pointed at with a mouse showing the app's
 * one hint bubble (`Tip`), pressed putting the same words under the row it's beside, so a phone, which has no hover,
 * has them too (the extension's `KindChips` is the pattern). Never the browser's `title`.
 */
export function HintMark({ about, words, pressed, onPress }: Props) {
  const [over, setOver] = useState(false);
  return (
    <span className="hint-mark">
      <Button
        className="explain-q"
        aria-label={about}
        aria-expanded={pressed}
        onMouseEnter={() => setOver(true)}
        onMouseLeave={() => setOver(false)}
        onFocus={() => setOver(true)}
        onBlur={() => setOver(false)}
        onClick={onPress}
      >
        ?
      </Button>
      {over && !pressed ? (
        <Tip x={11} y={0}>
          {words}
        </Tip>
      ) : null}
    </span>
  );
}
