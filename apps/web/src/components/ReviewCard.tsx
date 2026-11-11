/** @panki A card as a review shows it, front and back, laid out by its type, its front blurred as the type marks it (`ReviewCard`). Never a second drawing of a card's two sides. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  CORNER_MARK_IDS,
  DEFAULT_SUBTITLE_STYLE,
  EXAMPLES_SLOT,
  MediaId,
  TagCorner,
  aiOwns,
  blursFront,
  byAi,
  columnOrder,
  examplesAt,
  examplesIndex,
  examplesOn,
  holdsFile,
  holdsLink,
  holdsPitch,
  isTyped,
  metaOf,
  partsOnIn,
  pitchesOf,
  playsOn,
  wordsFieldOf,
  type BlurShow,
  type CardField,
  type CardPlace,
  type CardSide,
  type CardType,
  type Column,
  type CornerMarkId,
  type ExamplesPlace,
  type FlagMark,
  type LayoutPart,
  type MediaCues,
  type MediaKind,
  type SparkMark,
  type SrsType,
  type StageTag,
  type SubtitleStyle,
  type ValueSource,
} from "@panki/contracts";
import { AiSpark } from "./AiWaiting";
import { fileKindOf, kindClass } from "../fieldKinds";
import type { useDragOrder } from "../hooks/useDragOrder";
import type { Heard, Key, Shortcut } from "../keys";
import { CORNER_MARK_NAMES, EXAMPLE_ARROWS } from "../layoutKinds";
import { langOf } from "../words";
import { BlurButton } from "./BlurButton";
import { Button } from "./Button";
import { FlagTag } from "./FlagTag";
import { Icon } from "./Icon";
import { LinkView, type VideoPictures } from "./LinkView";
import type { Wave } from "./MediaLooks";
import { MediaView } from "./MediaView";
import { PitchAccents } from "./PitchAccent";
import { PlacePill } from "./PlacePill";
import { ClipSubtitles, type ClipTime } from "./ClipSubtitles";
import { ScrollEdges } from "./ScrollEdges";

/**
 * The card being laid out (a card type's Layout), used as a review uses it all the while: a press on a part picks it
 * (a press on its player or its spoiler does what it does as well), each is moved by its grip, and a field this card
 * leaves empty shows where it would stand.
 */
export type CardEdit = {
  picked: string | null;
  onPick: (fieldId: string) => void;
  /** Moving the parts on the side that's showing, in each column, by their place among that side's items in it (`columnOrder`: its parts, and the example arrows where they stand). */
  order: Readonly<Record<Column, ReturnType<typeof useDragOrder>>>;
  /** The example arrows: whether they're picked, and picking them. */
  examplesPicked: boolean;
  onPickExamples: () => void;
  /** The corner marks (the stage tag, the AI spark): which is picked, picking one, and moving one to a corner (dragged there, or by the arrow keys on it). */
  markPicked: CornerMarkId | null;
  onPickMark: (id: CornerMarkId) => void;
  onMoveMark: (id: CornerMarkId, corner: TagCorner) => void;
};

/** A mark in a corner of the card, as the card has it now: its corner, whether it's laid out to show and has something to show here, its look and what it draws. */
type CornerMark = { id: CornerMarkId; corner: TagCorner; shown: boolean; here: boolean; look: string; label: string; node: ReactNode };

/**
 * The front's blur, while the account's Blur the front is on: whether it's blurred now, Blur's key, and Unblur and Blur.
 * The card blurs only its front, and only as its type marks it (`blursFront`); the rest is the caller's (`useBlur`).
 */
export type CardBlur = { blurred: boolean; bind: Key | undefined; onToggle: () => void };

/** How far a press must move before it's a drag of the stage tag rather than a press that picks it. */
const TAG_DRAG_PX = 4;
/** The corner Unblur and Blur stand in, after the marks there. */
const BLUR_CORNER: TagCorner = "top-right";

/** A corner from which half of the card it's in, up or down and left or right. */
const cornerOf = (top: boolean, left: boolean): TagCorner => (top ? (left ? "top-left" : "top-right") : left ? "bottom-left" : "bottom-right");

/**
 * A mark in its corner of the card (the stage tag, the AI spark). On the card being laid out it's pressed to pick it,
 * and dragged anywhere on the card to settle in the corner nearest where it's let go (one of the four corners, never a
 * free position); the arrow keys on it move it a corner over. Hidden, or with nothing to show on this card, it's still
 * there to pick while it's laid out, faint; in a review it isn't drawn (`CornerMarks` leaves it out).
 */
function CornerMarkSpot({ mark, edit, card }: { mark: CornerMark; edit: CardEdit | undefined; card: RefObject<HTMLDivElement | null> }) {
  const [held, setHeld] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const look = `review-mark ${mark.look}`;
  if (!edit) return <span className={look}>{mark.node}</span>;
  const top = mark.corner.startsWith("top");
  const left = mark.corner.endsWith("left");
  /** The corner the tag's middle is nearest to, as it's let go. */
  function settled(el: HTMLElement): TagCorner | null {
    const frame = card.current?.getBoundingClientRect();
    if (!frame) return null;
    const box = el.getBoundingClientRect();
    return cornerOf(box.top + box.height / 2 < frame.top + frame.height / 2, box.left + box.width / 2 < frame.left + frame.width / 2);
  }
  const keyed: Partial<Record<string, TagCorner>> = { ArrowUp: cornerOf(true, left), ArrowDown: cornerOf(false, left), ArrowLeft: cornerOf(top, true), ArrowRight: cornerOf(top, false) };
  return (
    <span
      className={`${look} is-editable ${edit.markPicked === mark.id ? "is-picked" : ""} ${mark.shown && mark.here ? "" : "is-hidden"} ${held ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
      role="button"
      tabIndex={0}
      aria-label={mark.label}
      aria-pressed={edit.markPicked === mark.id}
      style={held ? { transform: `translate(${held.dx}px, ${held.dy}px)` } : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        // It keeps following a pointer that strays off it, and off the card.
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus({ preventScroll: true });
        setHeld({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
      }}
      onPointerMove={(e) => {
        if (held) setHeld({ ...held, dx: e.clientX - held.x, dy: e.clientY - held.y });
      }}
      onPointerUp={(e) => {
        if (!held) return;
        if (Math.abs(held.dx) + Math.abs(held.dy) > TAG_DRAG_PX) {
          const to = settled(e.currentTarget);
          if (to && to !== mark.corner) edit.onMoveMark(mark.id, to);
        }
        edit.onPickMark(mark.id);
        setHeld(null);
      }}
      onLostPointerCapture={() => setHeld(null)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          edit.onPickMark(mark.id);
          return;
        }
        const to = keyed[e.key];
        if (!to) return;
        e.preventDefault();
        if (to !== mark.corner) edit.onMoveMark(mark.id, to);
      }}
    >
      {mark.node}
    </span>
  );
}

/**
 * The card's corner marks, each corner a row of those standing in it in the registry's order (`CORNER_MARK_IDS`: the
 * stage tag first): in a review only those laid out to show that have something to show; on the card being laid out
 * every one, so each can be picked and moved. Unblur and Blur (`blur`) stand last in their corner's row, so they never
 * cover a mark there.
 */
function CornerMarks({ marks, edit, card, blur }: { marks: readonly CornerMark[]; edit: CardEdit | undefined; card: RefObject<HTMLDivElement | null>; blur: ReactNode }) {
  const order = (id: CornerMarkId) => CORNER_MARK_IDS.indexOf(id);
  const drawn = marks.filter((m) => edit || (m.shown && m.here)).sort((a, b) => order(a.id) - order(b.id));
  return TagCorner.options.map((corner) => {
    const here = drawn.filter((m) => m.corner === corner);
    const more = corner === BLUR_CORNER ? blur : null;
    if (here.length === 0 && more === null) return null;
    return (
      <span key={corner} className={`review-corner is-${corner}`}>
        {here.map((m) => (
          <CornerMarkSpot key={m.id} mark={m} edit={edit} card={card} />
        ))}
        {more}
      </span>
    );
  });
}

type Props = {
  /** The card's type: its fields, and how they're laid out on the card (`layout`). */
  type: CardType;
  values: Readonly<Record<string, string>>;
  /** What each file named in the values is, by its id (`Card.files`). Left out where a card holds no file yet, because it isn't made. */
  files?: Readonly<Record<string, MediaKind>>;
  /** Where the card stands, for the pill in its corner. */
  srsType: Pick<SrsType, "stages" | "after" | "burnedName" | "newColour">;
  place: CardPlace;
  /** Turned to its back. */
  revealed: boolean;
  /**
   * The front's blur while the account's Blur the front is on (a review, a card laid out): blurred, each part shown,
   * blurred or hidden as its `blur` says, keeping its room so nothing moves as it unblurs, its sounds and clips there to
   * hear but a hidden one; and Unblur and Blur in the card's corner, held unseen on the back and on a card whose type
   * marks nothing. Left out (the setting off, or a card only looked at), the front is clear and there's no Unblur.
   */
  blur?: CardBlur;
  /**
   * A press anywhere on the card but on a file's own player or a spoiler, or Enter or Space while the card has the focus.
   * Left out, a press on it does nothing: the review turns its card by its key and Show back of card alone.
   */
  onPress?: (() => void) | undefined;
  /** Where a file's bytes are (`api.mediaUrl`). Left out where a card can't hold a file yet, because it isn't made. */
  srcOf?: (mediaId: string) => string;
  /** What's drawn in a field's place for something the card will hold but doesn't yet: a clip before it's recorded. */
  standIns?: Readonly<Record<string, ReactNode | StandIn>>;
  /**
   * Plays what's set to play by itself as it comes into view, one after another: a review. Off where a card is only
   * looked at. With `examplePager`, a switch of examples also carries each One per example sound's and clip's playing:
   * playing or played to its end, the next example's starts.
   */
  autoplay?: boolean;
  /** A layout to draw in place of the type's own: one being edited. */
  layout?: readonly LayoutPart[];
  edit?: CardEdit;
  /** Reads a file's sound for a voice note's waveform (`waveform.ts`); left out, it's level. Never handed to a page's script, which reads nothing. */
  waveOf?: Wave;
  /** What's said in each clip the card holds, by the file's id (`Card.cues`): a clip's subtitles, where its part shows them. */
  cues?: Readonly<Record<string, MediaCues>>;
  /** How a clip's subtitles look (`LayoutPart.subtitles`): the app's own subtitle style; left out, the default. */
  subtitleStyle?: SubtitleStyle;
  /** Where a video's pictures are, for its metadata (`api.videoPictures`); left out, a video's metadata is words alone. */
  picturesOf?: (videoId: string) => VideoPictures | null;
  /** A stage tag to draw in place of the type's own: one being laid out. */
  tag?: StageTag;
  /** An AI spark to draw in place of the type's own: one being laid out. */
  spark?: SparkMark;
  /** A flag to draw in place of the type's own: one being laid out. */
  flag?: FlagMark;
  /** The card is flagged (`Card.flaggedAt`): its flag stands in its corner, as the type lays it out. Not by default. */
  flagged?: boolean;
  /**
   * The keys that play its sounds and clips, drawn on them, in the card's order (the layout's, both sides alike, so a
   * field keeps its key when the card is turned): a review, and a card tried as one, give this device's (`keys.ts`); a
   * place with no key leaves its sound without one. None by default.
   */
  shortcuts?: readonly (Shortcut | null)[];
  /** The keys that play each sound and clip again from its start, in the same order as `shortcuts` (`keys.ts` → `restart`); none by default. */
  restarts?: readonly (readonly Heard[])[];
  /** The key that fills the screen with a clip or leaves it (`keys.ts` → `fullScreen`), given where `shortcuts` are; none by default. */
  screenKey?: Shortcut | null;
  /**
   * Whether the card takes the focus and turns at Enter and Space as a button does; off where the page's own keys turn
   * it (the review, where Space does what Keybinds set it to). On by default.
   */
  keys?: boolean;
  /**
   * "Tap to reveal" under the parts, on the front; left out where a button under the card shows the answer (the review's
   * Show back of card, which carries its key, makes it needless).
   */
  hint?: boolean;
  /**
   * What switches between the card's examples (the review's arrows), drawn where the type lays them out (`examples`,
   * `cardLayout.ts` → `examplesAt`: right after the example to begin with), held for the back while no part of the
   * example shows on the front. None by default; a type with no field that's One per example draws none.
   */
  examplePager?: ReactNode;
  /** Where the example arrows stand in place of the type's own: one being laid out. */
  examples?: ExamplesPlace | null;
  /**
   * Where each value came from (`Card.sources`): a value Panki AI wrote is drawn in the AI's ink, its name (when the
   * layout shows it) carries the spark, and the spark stands once in the card's corner. None by default.
   */
  sources?: Readonly<Record<string, ValueSource>>;
};

/**
 * A stand-in drawn as its part has it: handed the clip's subtitles as the part shows them (nothing when its part has
 * them off, or the clip has none), in the card's subtitle style, to lay over its picture as the card's own clip would.
 */
export type StandIn = (subtitles: (cues: MediaCues, time: ClipTime) => ReactNode) => ReactNode;

/** A part to draw on a side: its field, and whether it's only holding its place on the front for the back, unseen. */
type Drawn = { part: LayoutPart; field: CardField; held: boolean };

/** Whether a field's value on a card is a sound or a clip to play. */
function playableOf(field: CardField, values: Readonly<Record<string, string>>, files: Readonly<Record<string, MediaKind>> | undefined): boolean {
  const kind = fileKindOf(field.kind, values[field.id] ?? "", files);
  return kind === "audio" || kind === "video";
}

/**
 * How the blurred front draws a part (`app.css`, "Blur"): blurred words or a picture are out of reach (`inert`), a
 * blurred sound or clip still plays, its picture blurred, and a hidden part keeps its room unseen.
 */
const BLUR_CLASS: Record<Exclude<BlurShow, "show">, { still: string; playing: string }> = {
  blur: { still: "blur-still", playing: "blur-playing" },
  hide: { still: "blur-hide", playing: "blur-hide" },
};

/**
 * The card as a review shows it, drawn from its type's layout: each field where the layout puts it, in its size and
 * colour, beside the one above when it's set to be; on the front what the front shows, and once it's turned what the
 * back does. A spoiler is covered until it's pressed, and stays open when the card is turned. What only the back shows
 * keeps its room on the front, unseen, so turning the card moves nothing. Blurred (`blur`), the front has each part
 * shown, blurred or hidden as its type marks it. What a press does is the caller's: a review turns it once, a look at a
 * card being made turns it back and forth. Never a second drawing of a card's two sides.
 */
export function ReviewCard({
  type,
  values,
  files,
  srsType,
  place,
  revealed,
  blur,
  onPress,
  srcOf,
  standIns,
  autoplay = false,
  layout: given,
  edit,
  waveOf,
  cues,
  subtitleStyle = DEFAULT_SUBTITLE_STYLE,
  picturesOf,
  tag = type.tag,
  spark = type.spark,
  flag = type.flag,
  flagged = false,
  shortcuts = [],
  restarts = [],
  screenKey = null,
  hint = true,
  keys = true,
  examplePager = null,
  examples = type.examples,
  sources,
}: Props) {
  const side: CardSide = revealed ? "back" : "front";
  const card = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  /**
   * Whether the two columns stand side by side right now (app.css says where: a review on a wide window, the main
   * column then a box of its own). Then the main column is what scrolls; anywhere else, the body.
   */
  const [split, setSplit] = useState(false);
  const scroller = split ? main : body;
  const checkSplit = useRef(() => setSplit(main.current !== null && getComputedStyle(main.current).display !== "contents"));
  // After every drawing (a side column come or gone with the card), and whenever the card's size changes (the window
  // crossing where the columns split).
  useLayoutEffect(() => checkSplit.current());
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const watch = new ResizeObserver(() => checkSplit.current());
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const fields = new Map(type.fields.map((f) => [f.id, f]));
  const layout = (given ?? type.layout).filter((part) => fields.has(part.fieldId));
  /**
   * The spoilers pressed open while the card is showing, which turned back to its front start over; and what has played
   * by itself on the side showing, which starts over each time the card turns, so a clip set to play when the card
   * comes up and when it's turned plays both times.
   */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [played, setPlayed] = useState<ReadonlySet<string>>(() => new Set());
  /** What's playing by itself right now. */
  const [cued, setCued] = useState<string | null>(null);
  /** What starts by itself because the example before it was playing, or had played to its end, as the examples were switched. */
  const [carried, setCarried] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setPlayed(new Set());
    setCued(null);
    setCarried(new Set());
    if (!revealed) setOpened(new Set());
  }, [revealed]);
  // Turned back to its front (Step back, an Undo), the scroll goes back to the top before it's drawn: the front
  // can't be scrolled, so parts left scrolled out of view there could never be brought back. A new card is a new
  // ReviewCard (the review keys it), already at the top.
  useLayoutEffect(() => {
    if (revealed) return;
    if (body.current) body.current.scrollTop = 0;
    if (main.current) main.current.scrollTop = 0;
  }, [revealed]);
  /**
   * Whether the front's own parts are taller than the room of what scrolls. Then holding the back's room keeps nothing
   * still (it scrolls once turned whatever's done), so the front scrolls over its own parts alone (`is-front-tall`,
   * app.css): the back's runs take no room and its scroll ends at the front's last part. Only where what scrolls is a
   * box of its own (a review that fits the window or fills the screen); everywhere else it's `display: contents` and
   * never scrolls.
   */
  const [frontTall, setFrontTall] = useState(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || revealed) {
      setFrontTall(false);
      return;
    }
    // Its blocks: the main column's alone where it scrolls by itself; both columns' where the body scrolls them as one.
    const blocks = () => (split ? [...el.children] : [...el.querySelectorAll(":scope > .review-side > *, :scope > .review-main > *")]);
    // Measured as the sum of the front's own blocks, not as where its last one ends: a run of the back's parts may stand
    // between two of them, and holds room there until the class takes it away. A part placed out of the flow (a clip
    // filling the screen) takes none of its room. A part that grows into what's left (a clip in the column) measures as
    // the room itself once it's grown, which still fits.
    const measure = () => {
      const style = getComputedStyle(el);
      if (style.display === "contents") return setFrontTall(false);
      const gap = parseFloat(style.rowGap) || 0;
      let need = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      let count = 0;
      for (const child of blocks()) {
        if (child.classList.contains("review-answer")) continue;
        const own = getComputedStyle(child);
        if (own.position === "absolute" || own.position === "fixed" || own.display === "none") continue;
        need += child.getBoundingClientRect().height + (parseFloat(own.marginTop) || 0) + (parseFloat(own.marginBottom) || 0);
        count += 1;
      }
      need += gap * Math.max(0, count - 1);
      // A pixel of slack, so a fractional height at a browser's zoom never flips it back and forth.
      setFrontTall(need > el.clientHeight + 1);
    };
    measure();
    // Its room changes with the window and the zoom; a part's height with a picture or a font arriving.
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    for (const child of blocks()) watch.observe(child);
    return () => watch.disconnect();
  }, [revealed, values, blur?.blurred, given, type, opened, split, scroller]);

  /** Whether the type marks anything on the front to blur: Unblur and Blur are live only then. */
  const blurrable = blursFront(layout);
  /** Blurred now: on the front, never once it's turned, and only with something to blur. */
  const inBlur = (blur?.blurred ?? false) && !revealed && blurrable;
  /** What the blurred front does with a part: nothing while it's clear. */
  const blurOf = (part: LayoutPart): BlurShow => (inBlur ? part.blur : "show");

  const drawn: Drawn[] = layout.flatMap((part) => {
    const field = fields.get(part.fieldId);
    if (!field) return [];
    const held = part[side] === "hide" && side === "front" && part.back !== "hide";
    return part[side] !== "hide" || held ? [{ part, field, held }] : [];
  });
  const covered = (part: LayoutPart) => part[side] === "spoiler" && !opened.has(part.fieldId);

  // A part set over another ("Reading above: Word") is written small over that one's words, as its reading, wherever
  // the two stand in the card's order, and has no place of its own while it is. Both are words of one line, both are
  // on this side (a reading only the back shows is held unseen on the front), one reading goes over one word, and a
  // reading has no reading of its own; a claim that doesn't hold leaves the part where it stands.
  const onSide = new Set(drawn.map((d) => d.field.id));
  const claims = drawn.filter((d) => d.part.over !== null && d.part.over !== d.field.id && d.field.kind === "text" && onSide.has(d.part.over) && fields.get(d.part.over)?.kind === "text");
  const readers = new Set(claims.map((d) => d.field.id));
  const readingFor = new Map<string, Drawn>();
  const attached = new Set<string>();
  for (const d of claims) {
    const word = d.part.over;
    if (word === null || readers.has(word) || readingFor.has(word)) continue;
    readingFor.set(word, d);
    attached.add(d.field.id);
  }
  /**
   * What's written over a part's words: nothing, or its reading as the reading's own part has it on this side (held
   * unseen when only the back shows it, so turning the card moves nothing; covered as a spoiler until pressed). On a
   * card being laid out it's pressed to pick it, and stands as its name while this card leaves it empty.
   */
  function readingOver(fieldId: string): ReactNode {
    const reading = readingFor.get(fieldId);
    if (!reading) return null;
    const text = values[reading.field.id] ?? "";
    if (!text && !edit) return null;
    if (reading.held) return <span className="is-later">{text}</span>;
    const drawn = readingDrawn(reading, text);
    if (!edit) return drawn;
    // Picked by a press, which reaches it after its word's part (picked by the same press), so the reading is the one
    // picked; a spoiler over it still opens.
    return (
      <span className={`review-ruby-pick ${edit.picked === reading.field.id ? "is-picked" : ""} ${text ? "" : "review-blank"}`.replace(/\s+/g, " ").trim()} onClickCapture={() => edit.onPick(reading.field.id)}>
        {drawn}
      </span>
    );
  }
  /** A reading's words as the side shows them: covered as a spoiler until pressed, or as they are (its name while the card leaves it empty). */
  function readingDrawn(reading: Drawn, text: string): ReactNode {
    // Its words in one box, the same size covered or not, so nothing moves when a spoiler opens.
    // A reading Panki AI wrote is in the AI's ink, as any of its words are.
    const said = <span className={`review-ruby-text ${text && byAi(sources, reading.field.id) ? "is-ai" : ""}`.trim()}>{text || reading.field.name}</span>;
    if (covered(reading.part)) {
      // The words keep their place, unseen, and the cover is laid exactly over them: a button can't sit in a line as
      // words do, so as the words' own box it made the card taller, and the card jumped as it opened.
      return (
        <span className="review-ruby-covered">
          {said}
          <Button
            variant="spoiler"
            className="review-ruby-spoiler"
            aria-label={`${reading.field.name}, covered: press to see it`}
            onClick={(e) => {
              e.stopPropagation();
              setOpened((was) => new Set(was).add(reading.field.id));
            }}
          />
        </span>
      );
    }
    return said;
  }
  /** The words a part's "Highlight" lights: what that field holds on this card; nothing when it's set to none. */
  const litOf = (part: LayoutPart) => (part.mark ? (values[part.mark] ?? "").trim() : "");
  /**
   * A part's words with another field's lit where they stand in them (its "Highlight"): the first time they appear,
   * and nothing lit when they don't. Exact, as the words were kept: the word picked in a sentence is that sentence's
   * own stretch.
   */
  function marked(text: string, part: LayoutPart | undefined): ReactNode {
    const term = part ? litOf(part) : "";
    const at = term ? text.indexOf(term) : -1;
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <mark className="review-mark">{term}</mark>
        {text.slice(at + term.length)}
      </>
    );
  }
  /**
   * A clip's subtitles, when its part has them on and the clip was recorded with its words: following it as it plays,
   * in the app's subtitle style, with its Highlight lit in each line it's in. On the blurred front, as its part's
   * `blurSubtitles` says: shown, the card's word blurred (its Highlight, else the type's main field), the line
   * blurred, or none.
   */
  function subtitlesOf(part: LayoutPart, said: MediaCues | undefined, time?: ClipTime): ReactNode {
    if (!part.subtitles || !said || said.length === 0) return null;
    const veil = inBlur ? part.blurSubtitles : "show";
    if (veil === "hide") return null;
    const main = wordsFieldOf(type);
    const word = veil === "word" ? litOf(part) || (main ? (values[main.id] ?? "").trim() : "") : litOf(part);
    return <ClipSubtitles cues={said} style={subtitleStyle} time={time} lit={word} blur={veil === "word" ? "word" : veil === "blur" ? "line" : null} />;
  }
  /** The file a field's value is, to be played: none for words, a link, a picture, or a file not there. */
  const playable = (field: CardField) => playableOf(field, values, files);
  /** Each sound and clip's key, and its restart keys, in the card's order across both sides, so turning the card changes none. */
  const keyOf = new Map<string, Shortcut>();
  const restartOf = new Map<string, readonly Heard[]>();
  let slot = 0;
  for (const part of layout) {
    const field = fields.get(part.fieldId);
    if (!field || !playable(field)) continue;
    const key = shortcuts[slot];
    const again = restarts[slot];
    slot++;
    if (key) keyOf.set(field.id, key);
    if (again && again.length > 0) restartOf.set(field.id, again);
  }

  // What plays by itself: in the card's order, each once on a side, on the side its part says (`playsOn`: when the
  // card comes up, when it's turned, or both), a spoiler as it's opened; one that leaves the card while it plays is done.
  // One the blurred front hides plays as the front unblurs instead.
  const heardNow = (d: Drawn) => !d.held && blurOf(d.part) !== "hide";
  const due = autoplay && srcOf ? drawn.filter((d) => heardNow(d) && playsOn(d.part.plays, side) && !covered(d.part) && !played.has(d.field.id) && standIns?.[d.field.id] === undefined && playable(d.field)) : [];
  const next = due[0]?.field.id ?? null;
  const liveKey = drawn.filter(heardNow).map((d) => d.field.id).join(" ");
  useEffect(() => {
    if (cued !== null && !liveKey.split(" ").includes(cued)) {
      setPlayed((was) => new Set(was).add(cued));
      setCued(null);
      return;
    }
    if (cued === null && next !== null) setCued(next);
  }, [cued, next, liveKey]);
  // Playing by itself switched off while the card is up: nothing goes on playing by itself.
  useEffect(() => {
    if (autoplay) return;
    setCued(null);
    setCarried(new Set());
  }, [autoplay]);
  function finishCue(fieldId: string) {
    setPlayed((was) => new Set(was).add(fieldId));
    setCued((now) => (now === fieldId ? null : now));
    setCarried((was) => {
      if (!was.has(fieldId)) return was;
      const next = new Set(was);
      next.delete(fieldId);
      return next;
    });
  }

  // The examples switched (the review's arrows): each sound and clip that's One per example carries how the one being
  // left stood. Playing, or played to its end, the next example's starts from its beginning by
  // itself; paused part-way, or never started, it stays still. Only where it stands on the side shown, ready to hear;
  // its "plays by itself" is for the card coming up and being turned, which a switch is neither. A part that's One per
  // card is the same file in every example, so its player is left exactly as it is. The element each field last played
  // in is heard on the card (a media element's events don't bubble) and read as the switch lands, before the one
  // leaving is paused by being taken off the page; one already off it by an earlier change (a part the turned card no
  // longer shows) is let go, so it never speaks for the fresh one.
  const playedIn = useRef(new Map<string, HTMLMediaElement>());
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const onPlay = (e: Event) => {
      const media = e.target;
      const id = media instanceof HTMLMediaElement ? media.closest("[data-part]")?.getAttribute("data-part") : null;
      if (media instanceof HTMLMediaElement && id) playedIn.current.set(id, media);
    };
    el.addEventListener("play", onPlay, true);
    return () => el.removeEventListener("play", onPlay, true);
  }, []);
  const shownBefore = useRef(values);
  const switches = autoplay && srcOf !== undefined && examplePager !== null;
  useLayoutEffect(() => {
    const was = shownBefore.current;
    shownBefore.current = values;
    const switched = switches ? type.fields.filter((f) => f.perExample && holdsFile(f.kind) && (was[f.id] ?? "") !== (values[f.id] ?? "")).map((f) => f.id) : [];
    if (switched.length > 0) {
      const ready = new Set(drawn.filter((d) => heardNow(d) && !covered(d.part) && standIns?.[d.field.id] === undefined && playable(d.field)).map((d) => d.field.id));
      const going = (id: string) => {
        const media = playedIn.current.get(id);
        return media !== undefined && (!media.paused || media.ended);
      };
      const starts = new Set(switched.filter((id) => ready.has(id) && going(id)));
      // Every switched one counts as played on this side, so none is queued to play by itself afterwards.
      setPlayed((now) => new Set([...now, ...switched]));
      setCarried((now) => new Set([...[...now].filter((id) => !switched.includes(id)), ...starts]));
      setCued((now) => (now !== null && switched.includes(now) && !starts.has(now) ? null : now));
      for (const id of switched) playedIn.current.delete(id);
    }
    for (const [id, media] of playedIn.current) if (!media.isConnected) playedIn.current.delete(id);
  });

  /** How the blurred front draws the reading over a part's words, by the reading's own part: blurred or unseen, or as it is. */
  function readingVeil(fieldId: string): string {
    const reading = readingFor.get(fieldId);
    const veil = reading ? blurOf(reading.part) : "show";
    return veil === "show" ? "" : BLUR_CLASS[veil].still;
  }
  /** Words as their part has them: their name over them when it's to be shown, and a reading over them when one is set to be. */
  function words(part: LayoutPart, field: CardField, value: ReactNode, blank = false, text = String(value)) {
    const reading = readingOver(field.id);
    // What Panki AI wrote is in the AI's ink, its own field or one it corrected; a field that's its own carries the spark
    // on its name, when the layout shows it; the spark itself stands once in the card's corner,
    // never in the words.
    const ai = !blank && byAi(sources, field.id);
    const own = ai && aiOwns(sources, field.id);
    return (
      <div className={`review-words ${kindClass(field.kind)} ${blank ? "review-blank" : ""} ${ai ? "is-ai" : ""}`.replace(/\s+/g, " ").trim()} lang={blank ? undefined : langOf(text)}>
        {part.label ? (
          <span className={`review-label ${own ? "is-ai" : ""}`.trim()}>
            {own ? <AiSpark className="review-label-ai" /> : null}
            {field.name}
          </span>
        ) : null}
        {reading === null ? (
          value
        ) : (
          // On a line of its own with room above it for the reading, clear of the field name over it; in the reading's own colour.
          <span className="review-ruby-line">
            <ruby className="review-ruby">
              {value}
              <rt className={`tone-${readingFor.get(field.id)?.part.tone ?? "quiet"} ${readingVeil(field.id)}`.trim()}>{reading}</rt>
            </ruby>
          </span>
        )}
      </div>
    );
  }
  /** Where a field this card leaves empty would stand, while the card is laid out. */
  function blank(part: LayoutPart, field: CardField) {
    if (isTyped(field.kind)) return words(part, field, field.name, true);
    return (
      <div className="review-blank-file">
        <Icon name={holdsLink(field.kind) ? "out" : field.kind === "image" ? "picture" : "play"} />
        {field.name}
      </div>
    );
  }
  /**
   * What a field draws: words, a file to look at or play (as the whole player or a button, as its part says), or a
   * link to open; nothing when it's empty, but where it would be while the card is laid out. A file is keyed by what it
   * is, so the next card's starts afresh instead of carrying on where this one stopped.
   */
  function content(part: LayoutPart, field: CardField, live: boolean): ReactNode {
    const standIn = standIns?.[field.id];
    if (typeof standIn === "function") return standIn((said, time) => subtitlesOf(part, said, time));
    if (standIn !== undefined) return standIn;
    const value = values[field.id] ?? "";
    if (value) {
      const file = fileKindOf(field.kind, value, files);
      if (file && srcOf) {
        return (
          <MediaView
            key={`${field.id}:${value}`}
            kind={file}
            src={srcOf(value)}
            label={field.name}
            look={part.look}
            named={part.label}
            cue={live && (cued === field.id || carried.has(field.id))}
            onCueEnd={() => finishCue(field.id)}
            waveOf={waveOf}
            over={file === "video" ? subtitlesOf(part, cues?.[value]) : null}
            // Only while it's there to play: not under a spoiler, nor held unseen for the back.
            shortcut={live ? (keyOf.get(field.id) ?? null) : null}
            {...(live && restartOf.has(field.id) ? { restart: restartOf.get(field.id) } : {})}
            screenKey={live ? screenKey : null}
          />
        );
      }
      // A file's id with no file behind it says nothing to anyone: it's left out rather than shown as words.
      const missingFile = file !== null || (holdsFile(field.kind) && MediaId.safeParse(value).success);
      if (!missingFile) {
        const meta = metaOf(field.kind, value);
        if (meta) {
          const view = <LinkView meta={meta} label={field.name} pictures={picturesOf?.(meta.link.videoId) ?? null} />;
          // Its name over it when the layout says so, as over any field's words.
          return part.label ? (
            <div className="review-words">
              <span className="review-label">{field.name}</span>
              {view}
            </div>
          ) : (
            view
          );
        }
        // A pitch accent drawn over its reading, in the part's size and colour; as it was typed when it doesn't read as one.
        if (holdsPitch(field.kind) && pitchesOf(value).length > 0) return words(part, field, <PitchAccents value={value} />, false, value);
        return words(part, field, marked(value, part), false, value);
      }
    }
    return edit ? blank(part, field) : null;
  }

  /** One part: covered as a spoiler, held unseen for the back, or as it is; on a card being laid out, something to pick and move. */
  function partView({ part, field, held }: Drawn, place?: CSSProperties): ReactNode {
    const hidden = covered(part);
    const veil = held ? "show" : blurOf(part);
    const inner = content(part, field, !held && !hidden && veil !== "hide");
    if (inner === null) return null;
    // On the blurred front, blurred or unseen; out of reach unless it's a sound or a clip that's still there to hear.
    const veilClass = veil === "show" ? "" : BLUR_CLASS[veil][playable(field) ? "playing" : "still"];
    const away = veilClass !== "" && veilClass !== BLUR_CLASS.blur.playing;
    const look = `review-part size-${part.size} tone-${part.tone} ${part.bold ? "is-bold" : ""} ${veilClass}`.replace(/\s+/g, " ").trim();
    const reach = away ? { inert: true, "aria-hidden": true } : {};
    if (held) {
      return (
        <div key={field.id} className={`${look} is-later`} style={place} data-part={field.id} aria-hidden="true">
          {inner}
        </div>
      );
    }
    if (edit) {
      // Moved among the items of its own column: which column it stands in is its own setting, never a drag's.
      const order = edit.order[part.column];
      const i = itemsIn(part.column).indexOf(field.id);
      return (
        <div
          key={field.id}
          ref={order.rowRef(i)}
          style={{ ...place, ...order.rowStyle(i) }}
          className={`${look} is-editable ${edit.picked === field.id ? "is-picked" : ""} ${order.dragging === i ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
          data-part={field.id}
          // Heard on the way down, so a press on its player or its spoiler picks it as well as doing what it does.
          onClickCapture={() => edit.onPick(field.id)}
        >
          <Button className="btn-icon review-grip" aria-label={`Move ${field.name}`} {...order.handleProps(i)}>
            <Icon name="grip" />
          </Button>
          <div className="review-part-face">
            {hidden ? (
              <Button
                variant="spoiler"
                className="review-part-cover"
                aria-label={`${field.name}, covered: press to see it`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpened((was) => new Set(was).add(field.id));
                }}
              >
                <span className="review-part-body" inert>
                  {inner}
                </span>
              </Button>
            ) : (
              <div className="review-part-body" {...reach}>
                {inner}
              </div>
            )}
          </div>
        </div>
      );
    }
    if (hidden) {
      return (
        <Button
          key={field.id}
          variant="spoiler"
          className={look}
          style={place}
          data-part={field.id}
          aria-label={`${field.name}, covered: press to see it`}
          onClick={(e) => {
            e.stopPropagation();
            setOpened((was) => new Set(was).add(field.id));
          }}
          {...reach}
        >
          <span className="review-part-body" inert>
            {inner}
          </span>
        </Button>
      );
    }
    return (
      <div key={field.id} className={look} style={place} data-part={field.id} {...reach}>
        {inner}
      </div>
    );
  }

  // Rows, in each column: a part set beside the one above it in its column joins its row. Runs of rows that only ever
  // show once the card is turned stand together, closer, as the back always has.
  const rowsIn = (column: Column): Drawn[][] => {
    const rows: Drawn[][] = [];
    for (const d of drawn) {
      // Written over another part's words as its reading, it has no place of its own.
      if (attached.has(d.field.id) || d.part.column !== column) continue;
      const last = rows[rows.length - 1];
      if (d.part.beside && last) last.push(d);
      else rows.push([d]);
    }
    return rows;
  };
  // Where the two columns stand as one (anywhere but a review split in two, app.css), every block takes its place in
  // the card's order by its first part, so the card reads as it would with one column: before anything else on the
  // card, hence below 0. Every other number, so the example arrows take the one right after the row they follow.
  const placeOf = new Map(layout.map((p, i) => [p.fieldId, 2 * (i - layout.length)]));
  const orderOf = (row: Drawn[]) => placeOf.get(row[0]?.field.id ?? "") ?? 0;
  const placed = (row: Drawn[]): CSSProperties => ({ order: orderOf(row) });
  const backOnly = (row: Drawn[]) => row.every((d) => d.part.front === "hide");
  /** Where the example arrows stand, as the type lays them out; none without arrows to draw. */
  const examplesPlace = examplePager === null ? null : examplesAt(layout, type.fields, examples);
  /** The arrows stand with the back's parts while no part of the example shows on the front: held there unseen, as they are. */
  const examplesBack = !examplesOn(layout, type.fields, "front");
  /** What's moved among in a column on the side shown: its parts, and the arrows where they stand while they show (as the Layout tab lists them). */
  const itemsIn = (column: Column): string[] =>
    examplePager === null ? partsOnIn(layout, side, column).map((p) => p.fieldId) : columnOrder(layout, type.fields, side, column, examples);
  /** A column's rows, with the example arrows where they stand among them, and the place in the card's order they take there. */
  const entriesIn = (column: Column): { entries: (Drawn[] | typeof EXAMPLES_SLOT)[]; examplesOrder: number } => {
    const rows = rowsIn(column);
    if (!examplesPlace || examplesPlace.column !== column) return { entries: rows, examplesOrder: 0 };
    const k = examplesIndex(layout, rows.map((row) => row[0]?.field.id ?? ""), examplesPlace);
    const before = rows[k - 1];
    const after = rows[k];
    const at = examplesPlace.after === null ? -1 : layout.findIndex((p) => p.fieldId === examplesPlace.after);
    const examplesOrder = before ? orderOf(before) + 1 : after ? orderOf(after) - 1 : 2 * (at - layout.length) + 1;
    return { entries: [...rows.slice(0, k), EXAMPLES_SLOT, ...rows.slice(k)], examplesOrder };
  };
  /** The example arrows as a block of the card; on the card being laid out, something to pick and move in its column while they show on the side shown. */
  function examplesView(column: Column, place: CSSProperties | undefined): ReactNode {
    const held = side === "front" && examplesBack;
    if (!edit || held) {
      return (
        <div key="examples" className="review-examples" style={place}>
          {examplePager}
        </div>
      );
    }
    const order = edit.order[column];
    const i = itemsIn(column).indexOf(EXAMPLES_SLOT);
    return (
      <div
        key="examples"
        ref={order.rowRef(i)}
        style={{ ...place, ...order.rowStyle(i) }}
        className={`review-part is-editable ${edit.examplesPicked ? "is-picked" : ""} ${order.dragging === i ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
        onClickCapture={edit.onPickExamples}
      >
        <Button className="btn-icon review-grip" aria-label={`Move ${EXAMPLE_ARROWS}`} {...order.handleProps(i)}>
          <Icon name="grip" />
        </Button>
        <div className="review-part-face">
          <div className="review-examples">{examplePager}</div>
        </div>
      </div>
    );
  }
  /** A column's blocks: its rows and the example arrows, and its runs of the back's each in one block. */
  const blocksOf = (column: Column): ReactNode[] => {
    const { entries, examplesOrder } = entriesIn(column);
    const blocks: ReactNode[] = [];
    let later: ReactNode[] = [];
    let laterAt: CSSProperties = {};
    const flush = () => {
      if (later.length === 0) return;
      blocks.push(
        <div key={`later-${blocks.length}`} className="review-answer" style={laterAt} aria-hidden={!revealed}>
          {later}
        </div>,
      );
      later = [];
    };
    for (const row of entries) {
      if (row === EXAMPLES_SLOT) {
        const place = { order: examplesOrder };
        if (examplesBack && later.length === 0) laterAt = place;
        const into = examplesBack ? later : (flush(), blocks);
        into.push(examplesView(column, examplesBack ? undefined : place));
        continue;
      }
      const back = backOnly(row);
      // A row of the back's stands where its run does. Any other is placed itself, and each part in it alike (one may be
      // all that's drawn of it), which leaves them in their order in the row.
      const place = back ? undefined : placed(row);
      const parts = row.map((d) => partView(d, place)).filter((p) => p !== null);
      if (parts.length === 0) continue;
      const key = row[0]?.field.id ?? "";
      const view =
        parts.length === 1 ? (
          parts[0]
        ) : (
          <div key={`row-${key}`} className="review-row" style={place}>
            {parts}
          </div>
        );
      if (back && later.length === 0) laterAt = placed(row);
      const into = back ? later : (flush(), blocks);
      into.push(view);
    }
    flush();
    return blocks;
  };
  const sideBlocks = blocksOf("side");
  const mainBlocks = blocksOf("main");

  // The card is pressed like a button, so it answers to a button's keys; a key on something inside it is that thing's.
  // Where the page's own keys turn it (`keys` off: the review), it's pressed with a pointer alone and never takes the
  // focus, so a press on it leaves Space to be the page's key, held as long as it's set to be.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onPress?.();
  }
  const pressable = edit || !onPress ? {} : keys ? { role: "button", tabIndex: 0, onClick: onPress, onKeyDown } : { onClick: onPress };

  // The spark once in its corner while the side shown holds anything Panki AI wrote (its words in the AI's ink, the
  // spark out of the text).
  const aiShown = drawn.some((d) => !d.held && (values[d.field.id] ?? "") !== "" && byAi(sources, d.field.id));
  const marks: CornerMark[] = [
    { id: "tag", corner: tag.corner, shown: tag.shown, here: true, look: `review-place size-${tag.size}`, label: "Stage tag", node: <PlacePill type={srsType} place={place} /> },
    { id: "spark", corner: spark.corner, shown: spark.shown, here: aiShown, look: "review-ai-mark", label: "AI spark", node: <AiSpark className="review-ai-corner" /> },
    { id: "flag", corner: flag.corner, shown: flag.shown, here: flagged, look: "review-flag-mark", label: CORNER_MARK_NAMES.flag, node: <FlagTag /> },
  ];

  // Unblur and Blur, while the setting is on: live on a front with something to blur, held unseen otherwise.
  const blurButton = blur ? <BlurButton blurred={inBlur} bind={blur.bind} held={revealed || !blurrable} onToggle={blur.onToggle} /> : null;

  return (
    <div ref={card} className={`review-card ${revealed ? "is-revealed" : ""} ${frontTall ? "is-front-tall" : ""} ${inBlur ? "is-blurred" : ""} ${edit ? "is-editing" : ""} ${onPress ? "" : "is-still"}`.replace(/\s+/g, " ").trim()} data-revealed={revealed} {...pressable}>
      <CornerMarks marks={marks} edit={edit} card={card} blur={blurButton} />
      {/* The parts in one box, in their two columns: the side one, only while something in it shows or holds its room,
          and the main one (`.review-body`, `.review-side`, `.review-main`, app.css). A review that fits the window or
          fills the screen scrolls them inside the card, with Panki's fades and thin bar over it: the body as a whole
          where the columns stand as one, the main column alone where they stand side by side. Everywhere else none of
          the boxes draws anything of its own, and runs over nothing, so neither do the parts. The front holds the
          back's room unseen and can't be scrolled, so it has no fades and no bar, unless its own parts don't fit: then
          it scrolls over them alone. */}
      <div ref={body} className="review-body">
        {sideBlocks.length > 0 ? <div className="review-side">{sideBlocks}</div> : null}
        <div ref={main} className="review-main">
          {mainBlocks}
        </div>
      </div>
      {revealed || frontTall ? <ScrollEdges of={scroller} /> : null}
      {hint ? <div className="review-hint">Tap to reveal</div> : null}
    </div>
  );
}
