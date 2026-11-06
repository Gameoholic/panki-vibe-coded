import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  DEFAULT_SUBTITLE_STYLE,
  MediaId,
  aiOwns,
  byAi,
  holdsFile,
  holdsLink,
  holdsPitch,
  isTyped,
  metaOf,
  partsOn,
  pitchesOf,
  playsOn,
  wordsFieldOf,
  type CardField,
  type CardPlace,
  type CardSide,
  type CardType,
  type Column,
  type LayoutPart,
  type ListenFirst,
  type ListenShow,
  type MediaCues,
  type MediaKind,
  type SrsType,
  type StageTag,
  type SubtitleStyle,
  type TagCorner,
  type ValueSource,
} from "@panki/contracts";
import { AiSpark } from "./AiWaiting";
import { fileKindOf, kindClass } from "../fieldKinds";
import type { useDragOrder } from "../hooks/useDragOrder";
import type { Heard, Shortcut } from "../keys";
import { langOf } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { LinkView, type VideoPictures } from "./LinkView";
import type { Wave } from "./MediaLooks";
import { MediaView } from "./MediaView";
import { PitchAccents } from "./PitchAccent";
import { PlacePill } from "./PlacePill";
import { ClipSubtitles, type ClipTime } from "./ClipSubtitles";
import { ScrollEdges } from "./ScrollEdges";

/**
 * The card being laid out (a card type's Layout): its parts are picked and moved instead of the card being turned,
 * nothing on it plays or opens, and a field this card leaves empty shows where it would stand.
 */
export type CardEdit = {
  picked: string | null;
  onPick: (fieldId: string) => void;
  /** Moving the parts on the side that's showing, in each column, by their place among that side's parts in it (`partsOnIn`). */
  order: Readonly<Record<Column, ReturnType<typeof useDragOrder>>>;
  /** The stage tag: whether it's the one picked, picking it, and moving it to a corner (dragged there, or by the arrow keys on it). */
  tagPicked: boolean;
  onPickTag: () => void;
  onMoveTag: (corner: TagCorner) => void;
};

/** How far a press must move before it's a drag of the stage tag rather than a press that picks it. */
const TAG_DRAG_PX = 4;
/** A play begun this close to a sound's or clip's start, in seconds, is from its start: one played again, not one played on. */
const AT_START_S = 0.25;

/** A corner from which half of the card it's in, up or down and left or right. */
const cornerOf = (top: boolean, left: boolean): TagCorner => (top ? (left ? "top-left" : "top-right") : left ? "bottom-left" : "bottom-right");

/**
 * The stage tag in its corner of the card. On the card being laid out it's pressed to pick it, and dragged anywhere
 * on the card to settle in the corner nearest where it's let go (one of the four corners, never a free position); the arrow keys on it move it a corner over. Hidden, it's still there to pick while it's laid out,
 * faint; in a review it isn't drawn.
 */
function StageTagSpot({ tag, edit, card, children }: { tag: StageTag; edit: CardEdit | undefined; card: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const [held, setHeld] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const look = `review-place is-${tag.corner} size-${tag.size}`;
  if (!edit) return tag.shown ? <span className={look}>{children}</span> : null;
  const top = tag.corner.startsWith("top");
  const left = tag.corner.endsWith("left");
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
      className={`${look} is-editable ${edit.tagPicked ? "is-picked" : ""} ${tag.shown ? "" : "is-hidden"} ${held ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
      role="button"
      tabIndex={0}
      aria-label="Stage tag"
      aria-pressed={edit.tagPicked}
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
          if (to && to !== tag.corner) edit.onMoveTag(to);
        }
        edit.onPickTag();
        setHeld(null);
      }}
      onLostPointerCapture={() => setHeld(null)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          edit.onPickTag();
          return;
        }
        const to = keyed[e.key];
        if (!to) return;
        e.preventDefault();
        if (to !== tag.corner) edit.onMoveTag(to);
      }}
    >
      {children}
    </span>
  );
}

type Props = {
  /** The card's type: its fields, and how they're laid out on the card (`layout`). */
  type: CardType;
  values: Readonly<Record<string, string>>;
  /** What each file named in the values is, by its id (`Card.files`). Left out where a card holds no file yet, because it isn't made. */
  files?: Readonly<Record<string, MediaKind>>;
  /** Where the card stands, for the pill in its corner. */
  srsType: Pick<SrsType, "stages" | "after" | "burnedName">;
  place: CardPlace;
  /** Turned to its back. */
  revealed: boolean;
  /**
   * In its Listen phase, before its front (its type's Listen first): the front, each part shown, blurred or hidden as
   * its `listen` says, keeping its room so nothing moves as the front shows; its sounds and clips there to hear, but a
   * hidden one. What plays by itself when the card comes up plays now. Off by default.
   */
  listening?: boolean;
  /** While listening, the sound or clip that shows the card by itself has begun its play of that number (`LayoutPart.showOnPlay`): the card is to show its front. */
  onListened?: () => void;
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
   * What switches between the card's examples (the review's arrows): drawn right after the last part of the
   * example the front shows (a field that's One per example), or its last part at all, so it stands under the example
   * whatever the layout; at the card's end when none is drawn. None by default.
   */
  examplePager?: ReactNode;
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

/** The parts on a side that stand in a column, in the card's order: what a column's parts are moved among. */
export const partsOnIn = (layout: readonly LayoutPart[], side: CardSide, column: Column): LayoutPart[] => partsOn(layout, side).filter((p) => p.column === column);

/** Whether a field's value on a card is a sound or a clip to play. */
function playableOf(field: CardField, values: Readonly<Record<string, string>>, files: Readonly<Record<string, MediaKind>> | undefined): boolean {
  const kind = fileKindOf(field.kind, values[field.id] ?? "", files);
  return kind === "audio" || kind === "video";
}

/**
 * Whether a card opens on its Listen phase: its type has Listen first on, and its front shows a sound or a clip that
 * the Listen phase doesn't hide. A card with nothing to hear opens on its front.
 */
export function listensFirst(type: CardType, values: Readonly<Record<string, string>>, files: Readonly<Record<string, MediaKind>> | undefined, listen: ListenFirst = type.listen, layout: readonly LayoutPart[] = type.layout): boolean {
  if (!listen.on) return false;
  const fields = new Map(type.fields.map((f) => [f.id, f]));
  return layout.some((part) => {
    const field = fields.get(part.fieldId);
    return field !== undefined && part.front === "show" && part.listen !== "hide" && playableOf(field, values, files);
  });
}

/**
 * How the Listen phase draws a part (`app.css`, "Listen first"): blurred words or a picture are out of reach (`inert`),
 * a blurred sound or clip still plays, its picture blurred, and a hidden part keeps its room unseen.
 */
const VEIL_CLASS: Record<Exclude<ListenShow, "show">, { still: string; playing: string }> = {
  blur: { still: "listen-blur", playing: "listen-veil" },
  hide: { still: "listen-hide", playing: "listen-hide" },
};

/**
 * The card as a review shows it, drawn from its type's layout: each field where the layout puts it, in its column (the
 * side one at the card's left where it fits its frame and is wide enough, else above the main one), in its size and
 * colour, beside the one above when it's set to be; on the front what the front shows, and once it's turned what the
 * back does. A spoiler is covered until it's pressed, and stays open when the card is turned. What only the back shows
 * keeps its room on the front, unseen, so turning the card moves nothing. A type with Listen first opens a card with
 * something to hear on its Listen phase (`listening`), the front with each part shown, blurred or hidden. What a press
 * does is the caller's: a review turns it once, a look at a card being made turns it back and forth. Never a second
 * drawing of a card's two sides.
 */
export function ReviewCard({
  type,
  values,
  files,
  srsType,
  place,
  revealed,
  listening = false,
  onListened,
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
  shortcuts = [],
  restarts = [],
  screenKey = null,
  hint = true,
  keys = true,
  examplePager = null,
  sources,
}: Props) {
  const side: CardSide = revealed ? "back" : "front";
  const card = useRef<HTMLDivElement>(null);
  /** The main column: where the card's parts scroll, wherever they can (`.review-main`, app.css). */
  const scroller = useRef<HTMLDivElement>(null);
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
  // Turned back to its front (Hide back of card, an Undo), the main column's scroll goes back to the top before it's
  // drawn: the front can't be scrolled, so parts left scrolled out of view there could never be brought back. A new card
  // is a new ReviewCard (the review keys it), its column already at the top.
  useLayoutEffect(() => {
    if (!revealed && scroller.current) scroller.current.scrollTop = 0;
  }, [revealed]);
  /**
   * Whether the main column's front parts are taller than its room. Then holding the back's room keeps nothing still
   * (the column scrolls once turned whatever's done), so the front scrolls over its own parts alone (`is-front-tall`,
   * app.css): the back's runs take no room and its scroll ends at the front's last part. Only where the column is a box
   * of its own (a card that fits its frame, or a review filling the screen); everywhere else it's `display: contents`
   * and never scrolls.
   */
  const [frontTall, setFrontTall] = useState(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || revealed) {
      setFrontTall(false);
      return;
    }
    // Measured as the sum of the front's own blocks, not as where its last one ends: a run of the back's parts may stand
    // between two of them, and holds room there until the class takes it away. A part placed out of the column's flow (a
    // clip filling the screen) takes none of its room. A part that grows into what's left (a clip in the column)
    // measures as the room itself once it's grown, which still fits.
    const measure = () => {
      const style = getComputedStyle(el);
      if (style.display === "contents") return setFrontTall(false);
      const gap = parseFloat(style.rowGap) || 0;
      let need = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      let count = 0;
      for (const child of el.children) {
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
    for (const child of el.children) watch.observe(child);
    return () => watch.disconnect();
  }, [revealed, values, listening, given, type, opened]);

  /** In the Listen phase: on the front, never once it's turned. */
  const inListen = listening && !revealed;
  /** What the Listen phase does with a part: nothing outside it. */
  const veilOf = (part: LayoutPart): ListenShow => (inListen ? part.listen : "show");
  // The one sound or clip that shows the card by itself (its `showOnPlay`) does so the moment its play of that number
  // begins (as the second play starts, not as the first one ends). A play begins at its first start, and again from its start: after its end, or played again from it;
  // paused and played on is still the one. Heard on the card itself, in the capture phase, since a media element's
  // events don't bubble: every look of every player is heard alike.
  const plays = useRef({ count: 0, ended: false });
  const listened = useRef(onListened);
  listened.current = onListened;
  const shower = layout.find((p) => p.showOnPlay !== null);
  const showerId = shower?.fieldId ?? null;
  const showsOn = shower?.showOnPlay ?? null;
  useEffect(() => {
    plays.current = { count: 0, ended: false };
    const el = card.current;
    if (!el || !inListen || showerId === null || showsOn === null) return;
    const ours = (e: Event): HTMLMediaElement | null =>
      e.target instanceof HTMLMediaElement && e.target.closest("[data-part]")?.getAttribute("data-part") === showerId ? e.target : null;
    /** A play begun: counted, and the card shown once it's the one it waits for. */
    const begun = () => {
      plays.current = { count: plays.current.count + 1, ended: false };
      if (plays.current.count >= showsOn) listened.current?.();
    };
    const onPlay = (e: Event) => {
      const media = ours(e);
      if (media && (plays.current.count === 0 || plays.current.ended || media.currentTime < AT_START_S)) begun();
    };
    // Sent back to its start while it plays (its restart key): another play.
    const onSeeked = (e: Event) => {
      const media = ours(e);
      if (media && !media.paused && plays.current.count > 0 && media.currentTime < AT_START_S) begun();
    };
    const onEnded = (e: Event) => {
      if (ours(e)) plays.current = { ...plays.current, ended: true };
    };
    el.addEventListener("play", onPlay, true);
    el.addEventListener("seeked", onSeeked, true);
    el.addEventListener("ended", onEnded, true);
    return () => {
      el.removeEventListener("play", onPlay, true);
      el.removeEventListener("seeked", onSeeked, true);
      el.removeEventListener("ended", onEnded, true);
    };
  }, [inListen, showerId, showsOn]);

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
    // Its words in one box, the same size covered or not, so nothing moves when a spoiler opens.
    // A reading Panki AI wrote is in the AI's ink, as any of its words are.
    const said = <span className={`review-ruby-text ${text && byAi(sources, reading.field.id) ? "is-ai" : ""}`.trim()}>{text || reading.field.name}</span>;
    if (edit) {
      // A spoiler on the side shown looks it on the card being laid out, its words faint under the cover.
      const covering = reading.part[side] === "spoiler";
      return (
        <span
          className={`review-ruby-pick ${edit.picked === reading.field.id ? "is-picked" : ""} ${covering ? "is-covered" : ""} ${text ? "" : "review-blank"}`.replace(/\s+/g, " ").trim()}
          onClick={(e) => {
            e.stopPropagation();
            edit.onPick(reading.field.id);
          }}
        >
          {said}
        </span>
      );
    }
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
   * in the app's subtitle style, with its Highlight lit in each line it's in. In the Listen phase, as its part's
   * `listenSubtitles` says: shown, the card's word blurred (its Highlight, else the type's main field), the line
   * blurred, or none.
   */
  function subtitlesOf(part: LayoutPart, said: MediaCues | undefined, time?: ClipTime): ReactNode {
    if (!part.subtitles || !said || said.length === 0) return null;
    const veil = inListen ? part.listenSubtitles : "show";
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
  if (!edit) {
    let place = 0;
    for (const part of layout) {
      const field = fields.get(part.fieldId);
      if (!field || !playable(field)) continue;
      const key = shortcuts[place];
      const again = restarts[place];
      place++;
      if (key) keyOf.set(field.id, key);
      if (again && again.length > 0) restartOf.set(field.id, again);
    }
  }

  // What plays by itself: in the card's order, each once on a side, on the side its part says (`playsOn`: when the
  // card comes up, when it's turned, or both), a spoiler as it's opened; one that leaves the card while it plays is done.
  // The card comes up as its Listen phase starts; one the Listen phase hides plays as the front shows instead.
  const heardNow = (d: Drawn) => !d.held && veilOf(d.part) !== "hide";
  const due = autoplay && !edit && srcOf ? drawn.filter((d) => heardNow(d) && playsOn(d.part.plays, side) && !covered(d.part) && !played.has(d.field.id) && standIns?.[d.field.id] === undefined && playable(d.field)) : [];
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
  // Playing by itself switched off while the card is up (the Layout tab's Preview left): nothing goes on playing by itself.
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
  const switches = autoplay && !edit && srcOf !== undefined && examplePager !== null;
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

  /** How the Listen phase draws the reading over a part's words, by the reading's own part: blurred or unseen, or as it is. */
  function readingVeil(fieldId: string): string {
    const reading = readingFor.get(fieldId);
    const veil = reading ? veilOf(reading.part) : "show";
    return veil === "show" ? "" : VEIL_CLASS[veil].still;
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
            screenKey={live && !edit ? screenKey : null}
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
  function partView({ part, field, held }: Drawn): ReactNode {
    const hidden = covered(part);
    const veil = held ? "show" : veilOf(part);
    const inner = content(part, field, !edit && !held && !hidden && veil !== "hide");
    if (inner === null) return null;
    // In the Listen phase, blurred or unseen; out of reach unless it's a sound or a clip that's still there to hear.
    const veilClass = veil === "show" ? "" : VEIL_CLASS[veil][playable(field) ? "playing" : "still"];
    const away = !edit && veilClass !== "" && veilClass !== VEIL_CLASS.blur.playing;
    const look = `review-part size-${part.size} tone-${part.tone} ${part.bold ? "is-bold" : ""} ${veilClass}`.replace(/\s+/g, " ").trim();
    const reach = away ? { inert: true, "aria-hidden": true } : {};
    if (held) {
      return (
        <div key={field.id} className={`${look} is-later`} aria-hidden="true">
          {inner}
        </div>
      );
    }
    if (edit) {
      // Moved among the parts of its own column: which column it's in is its own choice, never a drag's.
      const order = edit.order[part.column];
      const i = partsOnIn(layout, side, part.column).findIndex((p) => p.fieldId === field.id);
      return (
        <div
          key={field.id}
          ref={order.rowRef(i)}
          style={order.rowStyle(i)}
          className={`${look} is-editable ${edit.picked === field.id ? "is-picked" : ""} ${hidden ? "is-covered" : ""} ${order.dragging === i ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
          onClick={() => edit.onPick(field.id)}
        >
          <Button className="btn-icon review-grip" aria-label={`Move ${field.name}`} {...order.handleProps(i)}>
            <Icon name="grip" />
          </Button>
          <div className="review-part-face">
            {/* What's in a part does nothing while it's laid out, but a reading over its words, which is picked by itself. */}
            <div className="review-part-body" inert={!readingFor.has(field.id)}>
              {inner}
            </div>
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
      <div key={field.id} className={look} data-part={field.id} {...reach}>
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
  const sideRows = rowsIn("side");
  const mainRows = rowsIn("main");
  // The examples' switch goes under the example: after the last row holding a part of it the front shows, else its
  // last, in whichever column that is (the side column's rows counted first, as it stands first where the two stack).
  const backOnly = (row: Drawn[]) => row.every((d) => d.part.front === "hide");
  const exampleRows = examplePager === null ? [] : [...sideRows, ...mainRows].filter((row) => row.some((d) => d.field.perExample));
  const pagerAfter = exampleRows.filter((row) => !backOnly(row)).at(-1) ?? exampleRows.at(-1) ?? null;
  const pager = examplePager === null ? null : (
    <div key="examples" className="review-examples">
      {examplePager}
    </div>
  );
  let pagerPlaced = false;
  /** A column's blocks: its rows, and its runs of the back's rows each in one block. */
  const blocksOf = (rows: Drawn[][]): ReactNode[] => {
    const blocks: ReactNode[] = [];
    let later: ReactNode[] = [];
    const flush = () => {
      if (later.length === 0) return;
      blocks.push(
        <div key={`later-${blocks.length}`} className="review-answer" aria-hidden={!revealed}>
          {later}
        </div>,
      );
      later = [];
    };
    for (const row of rows) {
      const parts = row.map(partView).filter((p) => p !== null);
      if (parts.length === 0) continue;
      const key = row[0]?.field.id ?? "";
      const view =
        parts.length === 1 ? (
          parts[0]
        ) : (
          <div key={`row-${key}`} className="review-row">
            {parts}
          </div>
        );
      const into = backOnly(row) ? later : (flush(), blocks);
      into.push(view);
      if (row === pagerAfter && pager) {
        into.push(pager);
        pagerPlaced = true;
      }
    }
    flush();
    return blocks;
  };
  const sideBlocks = blocksOf(sideRows);
  const mainBlocks = blocksOf(mainRows);
  if (pager && !pagerPlaced) mainBlocks.push(pager);

  // The card is pressed like a button, so it answers to a button's keys; a key on something inside it is that thing's.
  // Where the page's own keys turn it (`keys` off: the review), it's pressed with a pointer alone and never takes the
  // focus, so a press on it leaves Space to be the page's key, held as long as it's set to be.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onPress?.();
  }
  const pressable = edit || !onPress ? {} : keys ? { role: "button", tabIndex: 0, onClick: onPress, onKeyDown } : { onClick: onPress };

  // The spark once in the card's corner while the side shown holds anything Panki AI wrote (its
  // words in the AI's ink, the spark out of the text), in the top corner the stage tag leaves free; on a card being laid
  // out the tag stands in its corner even hidden, so the spark keeps clear of it there too, and follows it as it's moved.
  const aiShown = drawn.some((d) => !d.held && (values[d.field.id] ?? "") !== "" && byAi(sources, d.field.id));
  const sparkCorner = (tag.shown || edit) && tag.corner === "top-right" ? "top-left" : "top-right";

  return (
    <div ref={card} className={`review-card ${revealed ? "is-revealed" : ""} ${frontTall ? "is-front-tall" : ""} ${inListen ? "is-listening" : ""} ${edit ? "is-editing" : ""} ${onPress ? "" : "is-still"}`.replace(/\s+/g, " ").trim()} data-revealed={revealed} {...pressable}>
      <StageTagSpot tag={tag} edit={edit} card={card}>
        <PlacePill type={srsType} place={place} />
      </StageTagSpot>
      {aiShown ? <AiSpark className={`review-ai-corner is-${sparkCorner}`} /> : null}
      {/* The parts in their two columns (`.review-body`, app.css): the side one, only while something in it shows or
          holds its room, and the main one. Where the card fits its frame they stand side by side when there's room
          (else the side one above), and the main one scrolls its parts inside the card, with Panki's fades and thin bar
          over it; everywhere else neither box draws anything of its own, and runs over nothing, so neither do they. The
          front holds the back's room unseen and can't be scrolled, so it has no fades and no bar, unless its own parts
          don't fit: then it scrolls over them alone. */}
      <div className="review-body">
        {sideBlocks.length > 0 ? <div className="review-side">{sideBlocks}</div> : null}
        <div ref={scroller} className="review-main">
          {mainBlocks}
        </div>
      </div>
      {revealed || frontTall ? <ScrollEdges of={scroller} /> : null}
      {hint ? <div className="review-hint">Tap to reveal</div> : null}
    </div>
  );
}
