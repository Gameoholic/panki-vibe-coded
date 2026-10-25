import type { CSSProperties, PointerEvent } from "react";
import { Button } from "@web/components/Button";
import { langOf } from "@web/words";
import { pick, type Span, type Token } from "../capture/words";

/** Pointing at the line's words to look them up: the line says which word the pointer is on, and asks before a press picks. */
export type LineLook = {
  /** The pointer moved over the line: onto word `at` (its button), or off every word (null). */
  move: (at: number | null, button: HTMLElement | null, e: PointerEvent<HTMLElement>) => void;
  /** A press on word `at`: true when it was the popup's to take (it keeps the popup open), and isn't a pick. */
  press: (at: number) => boolean;
};

type Props = {
  tokens: readonly Token[];
  /** The words picked, as a run; none when the whole line is taken as it is. */
  picked: Span | null;
  onPick: (span: Span) => void;
  /** The words being said this moment, as a run: they carry a mark under them, like a ribbon in a book. None when the video is at none of these. */
  now?: Span | null;
  /** `small` is the one inside the panel; the other is the line under a player. */
  small?: boolean;
  look?: LineLook | null;
  /** A double-click on word `at`: the word is to be fixed (a transcript's word heard wrong). None where words can't be. */
  onFix?: ((at: number) => void) | null;
  /** Which words are already in the cards, and the tint they get (`capture/known.ts` → `tintOf`); none, and nothing is. */
  known?: { at: (at: number) => boolean; colour: string } | null;
};

/** A line as words to press: one press picks a word, a press on the word beside it widens the pick to both. */
export function Line({ tokens, picked, onPick, now = null, small = false, look = null, onFix = null, known = null }: Props) {
  const text = tokens.map((token) => token.text).join("");
  const within = (span: Span | null, i: number) => span !== null && i >= span[0] && i <= span[1];
  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (!look) return;
    const button = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-at]") : null;
    look.move(button ? Number(button.dataset.at) : null, button, e);
  };
  return (
    <div
      className={`line ${small ? "is-small" : ""}`.trim()}
      lang={langOf(text)}
      style={known ? ({ "--known": known.colour } as CSSProperties) : undefined}
      onPointerMove={onMove}
      onPointerLeave={(e) => look?.move(null, null, e)}
    >
      {tokens.map((token, i) =>
        token.word ? (
          <Button
            key={token.start}
            data-at={i}
            className={`tok ${within(now, i) ? "is-now" : ""} ${known?.at(i) ? "is-known" : ""}`.replace(/\s+/g, " ").trim()}
            aria-pressed={within(picked, i)}
            onClick={() => {
              if (look?.press(i)) return;
              onPick(pick(picked, i));
            }}
            onDoubleClick={onFix ? () => onFix(i) : undefined}
          >
            {token.text}
          </Button>
        ) : (
          <span key={token.start} className="tok-gap">
            {token.text}
          </span>
        ),
      )}
    </div>
  );
}
