import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { AiSpark } from "@web/components/AiWaiting";
import { Button } from "@web/components/Button";
import { langOf } from "@web/words";
import type { KnownAs } from "../capture/known";
import { pick, type Span, type Token } from "../capture/words";

/** Where the pointer is and which keys are held with it: a real pointer move, or the last one again (`lastPointer`). */
export type PointerAt = { pointerType: string; clientX: number; clientY: number; shiftKey: boolean; ctrlKey: boolean; altKey: boolean };

/**
 * The pointer's last known place and the keys held now, heard on the window (a press in a closed shadow root still
 * reaches it): what a line drawn again under a pointer that stood still points at (a pointer
 * resting on it is hovering it), On hover or a key held alike.
 */
let lastPointer: PointerAt | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (e) => {
    lastPointer = { pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey };
  }, { capture: true, passive: true });
  const keys = (e: KeyboardEvent) => {
    if (lastPointer) lastPointer = { ...lastPointer, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey };
  };
  window.addEventListener("keydown", keys, { capture: true });
  window.addEventListener("keyup", keys, { capture: true });
}

/** How far past a box that clips it a word may stand and still count as shown whole, px: a rounding, never a sliver. */
const CUT_SLACK = 1;
/** The overflow values of a box that scrolls. */
const SCROLLS = new Set(["auto", "scroll"]);

/**
 * Whether a word stands whole inside every box that clips it (the list beside the video, the column it scrolls in):
 * a word cut by a scroller's edge, its sliver under the edge's fade, isn't pointed at, since its pop-up would hang
 * from a word that can't be seen. Walks out through the shadow roots Panki's places are.
 */
export function shownWhole(word: Element): boolean {
  const box = word.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;
  for (let el: Element | null = parentOf(word); el; el = parentOf(el)) {
    // The page's own scroller is the window: its box runs with the page's scroll, so it's judged against the viewport.
    if (el === document.documentElement || el === document.body) {
      if (box.right < -CUT_SLACK || box.bottom < -CUT_SLACK || box.left > window.innerWidth + CUT_SLACK || box.top > window.innerHeight + CUT_SLACK) return false;
      continue;
    }
    // Only a box that scrolls cuts a word at its edge; one that merely hides its overflow (the site's own frames,
    // wrappers of no size of their own) is left alone, since what it hides isn't drawn at all.
    const { overflowX, overflowY } = getComputedStyle(el);
    if (!SCROLLS.has(overflowX) && !SCROLLS.has(overflowY)) continue;
    if (el.clientWidth === 0 || el.clientHeight === 0) continue;
    const outer = el.getBoundingClientRect();
    const left = outer.left + el.clientLeft;
    const top = outer.top + el.clientTop;
    if (box.left < left - CUT_SLACK || box.right > left + el.clientWidth + CUT_SLACK) return false;
    if (box.top < top - CUT_SLACK || box.bottom > top + el.clientHeight + CUT_SLACK) return false;
  }
  return true;
}
/** An element's parent, or the host of the shadow root it stands at the top of. */
function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const place = el.parentNode;
  return place instanceof ShadowRoot ? place.host : null;
}

/** Pointing at the line's words to look them up: the line says which word the pointer is on, and asks before a press picks. */
export type LineLook = {
  /** The pointer moved over the line, or the line was drawn again under it: onto word `at` (its button), or off every word (null). */
  move: (at: number | null, button: HTMLElement | null, e: PointerAt) => void;
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
  /**
   * Which words are already in the cards and how (`capture/known.ts` → `knownAs`), and the tints they get (`tintOf`): a
   * word that's in the decks its own (`tintAt`, its stage's or the one chosen), only suspended cards' or a flagged
   * card's one for the line; none, and nothing is.
   */
  known?: { at: (at: number) => KnownAs | null; tintAt: (at: number) => string; suspendedColour: string; flaggedColour: string } | null;
  /** Which words Panki AI's Proofread edited (AI step 6): lit in the accent with the spark after them, under the player and over the video. */
  edited?: ((at: number) => boolean) | null;
};

/** How a word already in the cards is marked on its button (`extension.css` → `.tok.is-known`), by how it's known. */
const KNOWN_CLASS: Record<KnownAs | "none", string> = { none: "", known: "is-known", suspended: "is-known is-suspended", flagged: "is-known is-flagged" };

/** A line as words to press: one press picks a word, a press on the word beside it widens the pick to both. */
export function Line({ tokens, picked, onPick, now = null, small = false, look = null, onFix = null, known = null, edited = null }: Props) {
  const text = tokens.map((token) => token.text).join("");
  const within = (span: Span | null, i: number) => span !== null && i >= span[0] && i <= span[1];
  const root = useRef<HTMLDivElement>(null);
  const onMove = (target: EventTarget | null, e: PointerAt) => {
    if (!look) return;
    const under = target instanceof Element ? target.closest<HTMLElement>("[data-at]") : null;
    const button = under && shownWhole(under) ? under : null;
    look.move(button ? Number(button.dataset.at) : null, button, e);
  };
  // Drawn again with other words (the subtitles moving on as the video plays) while the pointer stands over it: what
  // now stands under the pointer is pointed at, as if the pointer had just come onto it, through the same `move`.
  const lookRef = useRef(look);
  lookRef.current = look;
  useLayoutEffect(() => {
    const el = root.current;
    const at = lastPointer;
    if (!el || !at || !lookRef.current || at.pointerType !== "mouse") return;
    const place = el.getRootNode();
    const under = place instanceof Document || place instanceof ShadowRoot ? place.elementFromPoint(at.clientX, at.clientY) : null;
    if (!under || !el.contains(under)) return;
    onMove(under, at);
    // Each new text, or the same text split another way, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, tokens.map((token) => token.start).join(",")]);
  return (
    <div
      ref={root}
      className={`line ${small ? "is-small" : ""}`.trim()}
      lang={langOf(text)}
      style={known ? ({ "--known-suspended": known.suspendedColour, "--known-flagged": known.flaggedColour } as CSSProperties) : undefined}
      onPointerMove={(e) => onMove(e.target, e)}
      onPointerLeave={(e) => look?.move(null, null, e)}
    >
      {tokens.map((token, i) =>
        token.word ? (
          <Button
            key={token.start}
            data-at={i}
            className={`tok ${within(now, i) ? "is-now" : ""} ${KNOWN_CLASS[known?.at(i) ?? "none"]} ${edited?.(i) ? "is-ai" : ""}`.replace(/\s+/g, " ").trim()}
            aria-pressed={within(picked, i)}
            style={known?.at(i) === "known" ? ({ "--known": known.tintAt(i) } as CSSProperties) : undefined}
            onClick={() => {
              if (look?.press(i)) return;
              onPick(pick(picked, i));
            }}
            onDoubleClick={onFix ? () => onFix(i) : undefined}
          >
            {token.text}
            {edited?.(i) ? (
              <span className="tok-spark">
                <AiSpark />
              </span>
            ) : null}
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
