import { Fragment, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent, type SyntheticEvent } from "react";
import type { Stretch, VideoCard } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { clock } from "@web/words";
import type { KnownMoment } from "../capture/known";
import { stamp } from "../capture/words";
import { seekVars, type SeekLook, type WordsMarkId } from "../seekLook";
import type { ClipEnd, MoveBy } from "./Trim";

/** What a pin's words belong to: a card taken from the video (one that's suspended apart), or a word that's in the decks, said in it. */
export type Pinned = { of: "cards" | "suspended"; card: VideoCard } | { of: "known"; said: KnownMoment };

/** The open clip as it's marked on the bar: its two ends, and what pulling one does. */
export type ClipMark = {
  start: number;
  end: number;
  onMove: (which: ClipEnd, to: number, by: MoveBy) => void;
  /** An end has been let go where it is. */
  onSettle: (which: ClipEnd) => void;
};

type Props = {
  /** How long the video is, in seconds: how much of the bar a second is. */
  length: number;
  /** The stretches of the video the transcript covers, in milliseconds as the transcript keeps them: each a line along the bar's top edge. */
  covered: readonly Stretch[];
  /** What a run has heard that isn't back from the engine yet, in milliseconds: the same line, faint; null with no run. */
  working: Stretch | null;
  /** The account's cards taken from the video: each its clip, a mark on the same line, with its words on a pin over it. */
  cards: readonly VideoCard[];
  /** The open clip, with an end to pull at each side; null while no drawer is open. */
  clip: ClipMark | null;
  /** Where a word that's in the decks is said (`capture/known.ts` → `useKnownMoments`): each a tick on the same line, with its words on a pin over it as the cards have theirs. */
  inDecks?: readonly KnownMoment[];
  /** How each mark looks, the viewer's own (`seekLook.ts`). */
  look: SeekLook;
  /** The pointer is on the bar: the pins' words rise, when they're set to on hover. */
  hover: boolean;
  /** A pin pressed (unless pressing one is set to do nothing): where the video goes is the caller's (`look.cards.click`, `look.known.click`). */
  onGo: (pinned: Pinned) => void;
  /** Told how far above the bar, in pixels, the pointer is to count as on it (`REACH`), whenever that changes. */
  onReach?: (px: number) => void;
  /**
   * The pointer moving on a card's words: the page shows the player's own preview for where pressing them goes. Given,
   * the pointer's moves over the words are kept from the bar, so the player doesn't preview where the pointer is.
   */
  onPeek?: (pinned: Pinned) => void;
  /** Where the video was stopped the last time it was watched, in seconds: a white tag over the bar saying when (the owner, 2026-10-21: "not color but something more distinct and visible"); null for none. */
  stop?: number | null;
  /** The tag pressed: the video goes there. */
  onStop?: () => void;
};

const ENDS: Record<ClipEnd, string> = { start: "Where the clip starts", end: "Where the clip ends" };

/**
 * A card's words on a pin over its mark, a stem down to it. Pins that would touch stand one lane above another, a few
 * lanes at most; one that finds no room keeps its mark alone. How wide a pin is, is reckoned from its words, before
 * it's drawn: a full-width character is `wide`, anything else `narrow`, and a pin is never wider than `max` (its words
 * then cut short). One home for the pins' sizes; `extension.css` → `.seek-pin` draws them to match.
 */
const PIN = { lanes: 3, gap: 6, pad: 18, wide: 13, narrow: 7.5, max: 168 } as const;

/**
 * How far above the bar the pointer counts as on it, in pixels (the page reads where the pointer is against this:
 * `content/youtube.tsx` → `follow`): as tall as the words stand, and `above` more, the same coming in as going out (the
 * owner, 2026-10-19: "right now I basically have to hug the seekbar"); `bare` with no words to show. Nothing is laid
 * over the picture for it, so a press there still reaches the player.
 */
const REACH = { bare: 16, above: 8 } as const;
/** From the bar up to the first lane's foot, a lane, and a pin's height, in pixels: `extension.css` → `.seek-pin`, `.seek-stem` draw them so. */
const LANE = { first: 12, step: 26, pin: 20 } as const;

/** How wide a pin with these words is drawn, in pixels. */
function pinWidth(words: string): number {
  let width = PIN.pad;
  for (const char of words) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? PIN.wide : PIN.narrow;
  return Math.min(PIN.max, Math.ceil(width));
}

/** A pin as laid out: what it's of, its words, where its stem stands and its box begins (in pixels from the bar's left), its lane. */
type Pin = { pinned: Pinned; key: string; words: string; x: number; left: number; lane: number };

/** Where a pin's mark is, in ms, and its words. */
const spanOf = (pinned: Pinned) => (pinned.of === "known" ? pinned.said : pinned.card);
const wordsOnPin = (pinned: Pinned) => (pinned.of === "known" ? pinned.said.words : pinned.card.words);

/**
 * The pins, each in the lowest lane where it touches none before it; one with no room in any is left out. The
 * suspended cards' come first, then the rest of the cards', so a word that's in the decks never takes a card's place;
 * all are laid together, so none touch.
 */
function layPins(all: readonly Pinned[], length: number, width: number): Pin[] {
  const ends: number[] = Array.from({ length: PIN.lanes }, () => -Infinity);
  const pins: Pin[] = [];
  for (const pinned of all) {
    const { startMs, endMs } = spanOf(pinned);
    const words = wordsOnPin(pinned).trim() || clock(startMs / 1000);
    const w = pinWidth(words);
    const x = (((startMs + endMs) / 2 / 1000) / length) * width;
    const left = Math.max(0, Math.min(width - w, x - w / 2));
    const lane = ends.findIndex((end) => end + PIN.gap <= left);
    if (lane < 0) continue;
    ends[lane] = left + w;
    const key = pinned.of === "known" ? `known-${startMs}` : `${pinned.card.cardId}-${startMs}`;
    pins.push({ pinned, key, words, x, left, lane });
  }
  return pins;
}

/**
 * Panki on the player's own seek bar: how far the transcript reaches, as a line along the bar's top edge (the bar's own
 * colours, how much has played and how much has loaded, stay seen under it), with what's being transcribed this moment
 * faint at its end; where cards were taken from, a mark each on that line with the card's words on a pin over it; and
 * the clip, the stretch it covers on the bar with an end to pull at each side. How each looks is the viewer's
 * (`look`). All are drawn in a place of Panki's that is laid over the whole bar, so a share of this is the same share
 * of the video. The bar is the whole video in a few hundred pixels, so an end pulled here goes roughly where it's
 * wanted (a pixel is a second or more); the drawer's own bar is for putting it exactly. An end is always put exactly
 * where the pointer is here: there's no telling words apart at this size.
 *
 * The cards' pins rise while the pointer is on the bar or over it as high as they stand (or stand whenever the bar
 * shows, or never); a pin is edged in the cards' colour only while the pointer is on it, and pressed it does what the
 * viewer set (`look.cards.click`: nothing, and then it isn't a thing to press at all, or the video to the card's
 * sentence or its word). The words that are in the decks have pins of their own the same way, with the same settings
 * of their own (`look.known`; the owner, 2026-10-25: "same settings as Cards"), laid in the same lanes after the cards'.
 * The suspended cards are a mark of their own while it's shown (`look.suspended`, its pins laid first; the owner,
 * 2026-10-29, to fix them from the video), the rest of the cards without them; hidden, they're cards like any. Nothing changes as the video plays through a card: the owner had the card it was at lit and
 * rising by itself taken out, 2026-10-19 ("no flash at all when it's being played"); and snapping, a press on the bar
 * near a card's mark landing on the card, the same day, the words doing that job. Only the pins and the clip's two
 * ends take a press. Everywhere else on the bar a press goes through to the player, which seeks as ever. (Panki's own
 * bar in the player's place, with these marks laid on it, lived a day before the owner had it taken out, 2026-10-19.)
 */
export function SeekMark({ length, covered, working, cards, clip, inDecks = [], look, hover, onGo, onReach, onPeek, stop = null, onStop }: Props) {
  const whole = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<ClipEnd | null>(null);
  const [width, setWidth] = useState(0);
  const known = Number.isFinite(length) && length > 0;
  // Measured afresh whenever the bar is drawn again: nothing is drawn while the video's length isn't known (a page
  // still loading its video, or moving to the next), and the bar drawn after it is a new element. Measured only once,
  // marks that came before the video's length never had their width, and the cards' words never stood (2026-10-19).
  useEffect(() => {
    const el = whole.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [known]);
  /** When a mark's words stand: never while the mark itself is hidden. */
  const wordsOf = (id: WordsMarkId) => (look[id].shown ? look[id].words : "off");
  // The suspended cards are their own mark while it's shown, and only then; hidden, they're cards like the rest.
  const apart = look.suspended.shown;
  const suspended = apart ? cards.filter((card) => card.suspended) : [];
  const others = apart ? cards.filter((card) => !card.suspended) : cards;
  const pinned: Pinned[] = [
    ...(wordsOf("suspended") === "off" ? [] : suspended.map((card): Pinned => ({ of: "suspended", card }))),
    ...(wordsOf("cards") === "off" ? [] : others.map((card): Pinned => ({ of: "cards", card }))),
    ...(wordsOf("known") === "off" ? [] : inDecks.map((said): Pinned => ({ of: "known", said }))),
  ];
  const pins = !known || pinned.length === 0 || width === 0 ? [] : layPins(pinned, length, width);
  const highest = pins.reduce((lane, pin) => Math.max(lane, pin.lane), -1);
  const reach = highest >= 0 ? LANE.first + highest * LANE.step + LANE.pin + REACH.above : REACH.bare;
  const tellReach = useRef(onReach);
  tellReach.current = onReach;
  useEffect(() => tellReach.current?.(reach), [reach]);
  // A video that doesn't say how long it is (a live one) has no bar anything could be marked on.
  if (!known) return null;

  const share = (time: number) => Math.max(0, Math.min(100, (time / length) * 100));
  /** Where a stretch of the video, in seconds, lies along the bar: its left edge and its width as shares of the whole. */
  function across(start: number, end: number) {
    const from = share(start);
    return { left: `${from}%`, width: `${Math.max(0, share(end) - from)}%` };
  }
  function timeAt(x: number): number | null {
    const box = whole.current?.getBoundingClientRect();
    return box && box.width > 0 ? Math.max(0, Math.min(1, (x - box.left) / box.width)) * length : null;
  }
  function grip(mark: ClipMark, which: ClipEnd): HTMLAttributes<HTMLSpanElement> {
    const end = mark[which];
    return {
      className: `seek-end is-${which}`,
      role: "slider",
      "aria-label": ENDS[which],
      "aria-orientation": "horizontal",
      "aria-valuemin": 0,
      "aria-valuemax": Math.round(length * 100) / 100,
      "aria-valuenow": Math.round(end * 100) / 100,
      "aria-valuetext": stamp(end),
      onPointerDown(e: PointerEvent<HTMLSpanElement>) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setHeld(which);
      },
      onPointerMove(e: PointerEvent<HTMLSpanElement>) {
        if (held !== which) return;
        const to = timeAt(e.clientX);
        if (to !== null) mark.onMove(which, to, "exact");
      },
      onLostPointerCapture() {
        if (held !== which) return;
        setHeld(null);
        mark.onSettle(which);
      },
    };
  }

  const upOf = (id: WordsMarkId) => wordsOf(id) === "always" || (wordsOf(id) === "hover" && hover);
  const inertOf = (id: WordsMarkId) => look[id].click === "none";
  /** The pointer on a pin's words: kept from the bar, and the page told, so the player previews where a press goes. */
  const peek = (pin: Pinned) => (e: SyntheticEvent) => {
    if (!onPeek || inertOf(pin.of)) return;
    e.stopPropagation();
    if (e.type !== "mousemove") onPeek(pin);
  };
  /** One mark's pins, in a layer of their own that brings them in as that mark's entrance says, edged in its colour. */
  function pinsOf(id: WordsMarkId) {
    const mine = pins.filter((pin) => pin.pinned.of === id);
    if (mine.length === 0) return null;
    const up = upOf(id);
    const inert = inertOf(id);
    return (
      <div className={`seek-pins is-${id} is-${look[id].entrance}`}>
        {mine.map((pin, i) => {
          const place = { "--x": `${pin.x - pin.left}px`, "--at": `${pin.x}px`, "--left": `${pin.left}px`, "--lane": pin.lane, "--i": i } as CSSProperties;
          return (
            <Fragment key={pin.key}>
              {/* The stem apart from its words, so each comes in its own way. */}
              <span className={`seek-stem ${up ? "is-up" : ""}`.trim()} style={place} aria-hidden="true" />
              <Button
                className={`seek-pin ${up ? "is-up" : ""}`.trim()}
                lang="ja"
                tabIndex={up && !inert ? 0 : -1}
                disabled={inert}
                aria-hidden={!up}
                aria-label={inert ? pin.words : `Go to ${pin.words}, ${clock(spanOf(pin.pinned).startMs / 1000)}`}
                style={place}
                onClick={() => onGo(pin.pinned)}
                onPointerEnter={peek(pin.pinned)}
                onPointerMove={peek(pin.pinned)}
                onMouseMove={peek(pin.pinned)}
              >
                <span className="seek-pin-words">{pin.words}</span>
              </Button>
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={whole} className="seek" style={seekVars(look) as CSSProperties}>
      {look.transcript.shown
        ? covered.map((stretch) => <div key={stretch.startMs} className="seek-covered" style={across(stretch.startMs / 1000, stretch.endMs / 1000)} />)
        : null}
      {look.transcript.shown && working ? <div className="seek-working" style={across(working.startMs / 1000, working.endMs / 1000)} /> : null}
      {look.known.shown ? inDecks.map((said) => <div key={said.startMs} className="seek-known" style={across(said.startMs / 1000, said.endMs / 1000)} />) : null}
      {look.cards.shown
        ? others.map((card) => <div key={`${card.cardId}-${card.startMs}`} className="seek-card" style={across(card.startMs / 1000, card.endMs / 1000)} />)
        : null}
      {suspended.map((card) => (
        <div key={`${card.cardId}-${card.startMs}`} className="seek-card is-suspended" style={across(card.startMs / 1000, card.endMs / 1000)} />
      ))}
      {pinsOf("known")}
      {pinsOf("cards")}
      {pinsOf("suspended")}
      {/* Where it was stopped: a white tick across the bar and a tag over it with the time, under the cards' words when they rise. */}
      {stop !== null && stop > 0 && stop < length ? (
        <>
          <span className="seek-stop-tick" style={{ left: `${share(stop)}%` }} aria-hidden="true" />
          <Button className="seek-stop" style={{ left: `${share(stop)}%` }} aria-label={`Go to where you stopped, ${clock(stop)}`} onClick={() => onStop?.()}>
            <Icon name="clock" />
            {clock(stop)}
          </Button>
        </>
      ) : null}
      {clip && look.clip.shown ? (
        <div className="seek-clip" style={across(clip.start, clip.end)}>
          <span {...grip(clip, "start")} />
          <span {...grip(clip, "end")} />
        </div>
      ) : null}
    </div>
  );
}
