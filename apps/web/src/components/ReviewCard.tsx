import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  DEFAULT_SUBTITLE_STYLE,
  MediaId,
  holdsFile,
  holdsLink,
  holdsPitch,
  isTyped,
  metaOf,
  partsOn,
  pitchesOf,
  playsOn,
  type CardField,
  type CardPlace,
  type CardSide,
  type CardType,
  type LayoutPart,
  type MediaCues,
  type MediaKind,
  type SrsType,
  type StageTag,
  type SubtitleStyle,
  type TagCorner,
} from "@panki/contracts";
import { fileKindOf, kindClass } from "../fieldKinds";
import type { useDragOrder } from "../hooks/useDragOrder";
import type { Shortcut } from "../keys";
import { langOf } from "../words";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { LinkView, type VideoPictures } from "./LinkView";
import type { Wave } from "./MediaLooks";
import { MediaView } from "./MediaView";
import { PitchAccents } from "./PitchAccent";
import { PlacePill } from "./PlacePill";
import { ClipSubtitles, type ClipTime } from "./ClipSubtitles";

/**
 * The card being laid out (a card type's Layout): its parts are picked and moved instead of the card being turned,
 * nothing on it plays or opens, and a field this card leaves empty shows where it would stand.
 */
export type CardEdit = {
  picked: string | null;
  onPick: (fieldId: string) => void;
  /** Moving the parts on the side that's showing, by their place among that side's parts (`partsOn`). */
  order: ReturnType<typeof useDragOrder>;
  /** The stage tag: whether it's the one picked, picking it, and moving it to a corner (dragged there, or by the arrow keys on it). */
  tagPicked: boolean;
  onPickTag: () => void;
  onMoveTag: (corner: TagCorner) => void;
};

/** How far a press must move before it's a drag of the stage tag rather than a press that picks it. */
const TAG_DRAG_PX = 4;

/** A corner from which half of the card it's in, up or down and left or right. */
const cornerOf = (top: boolean, left: boolean): TagCorner => (top ? (left ? "top-left" : "top-right") : left ? "bottom-left" : "bottom-right");

/**
 * The stage tag in its corner of the card. On the card being laid out it's pressed to pick it, and dragged anywhere
 * on the card to settle in the corner nearest where it's let go (the owner: "it sticks to either of the 4 corners, no
 * free position"); the arrow keys on it move it a corner over. Hidden, it's still there to pick while it's laid out,
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
  /** A press anywhere on the card but on a file's own player or a spoiler, or Enter or Space while the card has the focus. */
  onPress: () => void;
  /** Where a file's bytes are (`api.mediaUrl`). Left out where a card can't hold a file yet, because it isn't made. */
  srcOf?: (mediaId: string) => string;
  /** What's drawn in a field's place for something the card will hold but doesn't yet: a clip before it's recorded. */
  standIns?: Readonly<Record<string, ReactNode | StandIn>>;
  /** Plays what's set to play by itself as it comes into view, one after another: a review. Off where a card is only looked at. */
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
  /** The key that fills the screen with a clip or leaves it (`keys.ts` → `fullScreen`), given where `shortcuts` are; none by default. */
  screenKey?: Shortcut | null;
  /**
   * Whether the card takes the focus and turns at Enter and Space as a button does; off where the page's own keys turn
   * it (the review, whose Space is Show answer's key: the owner, 2026-10-24, "space should act as the space in the
   * keybind"). On by default.
   */
  keys?: boolean;
  /**
   * "Tap to reveal" under the parts, on the front; left out where a button under the card shows the answer (the review's
   * Show answer, which carries its key: the owner, 2026-10-21, "there's no reason for this since we already have the
   * big blue button").
   */
  hint?: boolean;
};

/**
 * A stand-in drawn as its part has it: handed the clip's subtitles as the part shows them (nothing when its part has
 * them off, or the clip has none), in the card's subtitle style, to lay over its picture as the card's own clip would.
 */
export type StandIn = (subtitles: (cues: MediaCues, time: ClipTime) => ReactNode) => ReactNode;

/** A part to draw on a side: its field, and whether it's only holding its place on the front for the back, unseen. */
type Drawn = { part: LayoutPart; field: CardField; held: boolean };

/**
 * The card as a review shows it, drawn from its type's layout: each field where the layout puts it, in its size and
 * colour, beside the one above when it's set to be; on the front what the front shows, and once it's turned what the
 * back does. A spoiler is covered until it's pressed, and stays open when the card is turned. What only the back shows
 * keeps its room on the front, unseen, so turning the card moves nothing. What a press does is the caller's: a review
 * turns it once, a look at a card being made turns it back and forth. Never a second drawing of a card's two sides.
 */
export function ReviewCard({
  type,
  values,
  files,
  srsType,
  place,
  revealed,
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
  screenKey = null,
  hint = true,
  keys = true,
}: Props) {
  const side: CardSide = revealed ? "back" : "front";
  const card = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    setPlayed(new Set());
    setCued(null);
    if (!revealed) setOpened(new Set());
  }, [revealed]);

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
    const said = <span className="review-ruby-text">{text || reading.field.name}</span>;
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
   * in the app's subtitle style, with its Highlight lit in each line it's in.
   */
  function subtitlesOf(part: LayoutPart, said: MediaCues | undefined, time?: ClipTime): ReactNode {
    if (!part.subtitles || !said || said.length === 0) return null;
    return <ClipSubtitles cues={said} style={subtitleStyle} time={time} lit={litOf(part)} />;
  }
  /** The file a field's value is, to be played: none for words, a link, a picture, or a file not there. */
  const playable = (field: CardField) => {
    const kind = fileKindOf(field.kind, values[field.id] ?? "", files);
    return kind === "audio" || kind === "video";
  };
  /** Each sound and clip's key, in the card's order across both sides, so turning the card changes none. */
  const keyOf = new Map<string, Shortcut>();
  if (!edit) {
    let place = 0;
    for (const part of layout) {
      const field = fields.get(part.fieldId);
      if (!field || !playable(field)) continue;
      const key = shortcuts[place++];
      if (key) keyOf.set(field.id, key);
    }
  }

  // What plays by itself: in the card's order, each once on a side, on the side its part says (`playsOn`: when the
  // card comes up, when it's turned, or both), a spoiler as it's opened; one that leaves the card while it plays is done.
  const due = autoplay && !edit && srcOf ? drawn.filter((d) => !d.held && playsOn(d.part.plays, side) && !covered(d.part) && !played.has(d.field.id) && standIns?.[d.field.id] === undefined && playable(d.field)) : [];
  const next = due[0]?.field.id ?? null;
  const liveKey = drawn.filter((d) => !d.held).map((d) => d.field.id).join(" ");
  useEffect(() => {
    if (cued !== null && !liveKey.split(" ").includes(cued)) {
      setPlayed((was) => new Set(was).add(cued));
      setCued(null);
      return;
    }
    if (cued === null && next !== null) setCued(next);
  }, [cued, next, liveKey]);
  function finishCue(fieldId: string) {
    setPlayed((was) => new Set(was).add(fieldId));
    setCued((now) => (now === fieldId ? null : now));
  }

  /** Words as their part has them: their name over them when it's to be shown, and a reading over them when one is set to be. */
  function words(part: LayoutPart, field: CardField, value: ReactNode, blank = false, text = String(value)) {
    const reading = readingOver(field.id);
    return (
      <div className={`review-words ${kindClass(field.kind)} ${blank ? "review-blank" : ""}`.trim()} lang={blank ? undefined : langOf(text)}>
        {part.label ? <span className="review-label">{field.name}</span> : null}
        {reading === null ? (
          value
        ) : (
          // On a line of its own with room above it for the reading, clear of the field name over it; in the reading's own colour.
          <span className="review-ruby-line">
            <ruby className="review-ruby">
              {value}
              <rt className={`tone-${readingFor.get(field.id)?.part.tone ?? "quiet"}`}>{reading}</rt>
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
            cue={live && cued === field.id}
            onCueEnd={() => finishCue(field.id)}
            waveOf={waveOf}
            over={file === "video" ? subtitlesOf(part, cues?.[value]) : null}
            // Only while it's there to play: not under a spoiler, nor held unseen for the back.
            shortcut={live ? (keyOf.get(field.id) ?? null) : null}
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
    const inner = content(part, field, !edit && !held && !hidden);
    if (inner === null) return null;
    const look = `review-part size-${part.size} tone-${part.tone} ${part.bold ? "is-bold" : ""}`.trim();
    if (held) {
      return (
        <div key={field.id} className={`${look} is-later`} aria-hidden="true">
          {inner}
        </div>
      );
    }
    if (edit) {
      const i = partsOn(layout, side).findIndex((p) => p.fieldId === field.id);
      return (
        <div
          key={field.id}
          ref={edit.order.rowRef(i)}
          style={edit.order.rowStyle(i)}
          className={`${look} is-editable ${edit.picked === field.id ? "is-picked" : ""} ${hidden ? "is-covered" : ""} ${edit.order.dragging === i ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
          onClick={() => edit.onPick(field.id)}
        >
          <Button className="btn-icon review-grip" aria-label={`Move ${field.name}`} {...edit.order.handleProps(i)}>
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
      );
    }
    return (
      <div key={field.id} className={look}>
        {inner}
      </div>
    );
  }

  // Rows: a part set beside the one above joins its row. Runs of rows that only ever show once the card is turned
  // stand together, closer, as the back always has.
  const rows: Drawn[][] = [];
  for (const d of drawn) {
    // Written over another part's words as its reading, it has no place of its own.
    if (attached.has(d.field.id)) continue;
    const last = rows[rows.length - 1];
    if (d.part.beside && last) last.push(d);
    else rows.push([d]);
  }
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
    if (row.every((d) => d.part.front === "hide")) later.push(view);
    else {
      flush();
      blocks.push(view);
    }
  }
  flush();

  // The card is pressed like a button, so it answers to a button's keys; a key on something inside it is that thing's.
  // Where the page's own keys turn it (`keys` off: the review), it's pressed with a pointer alone and never takes the
  // focus, so a press on it leaves Space to be the page's key, held as long as it's set to be.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onPress();
  }
  const pressable = edit ? {} : keys ? { role: "button", tabIndex: 0, onClick: onPress, onKeyDown } : { onClick: onPress };

  return (
    <div ref={card} className={`review-card ${revealed ? "is-revealed" : ""} ${edit ? "is-editing" : ""}`.replace(/\s+/g, " ").trim()} data-revealed={revealed} {...pressable}>
      <StageTagSpot tag={tag} edit={edit} card={card}>
        <PlacePill type={srsType} place={place} />
      </StageTagSpot>
      {blocks}
      {hint ? <div className="review-hint">Tap to reveal</div> : null}
    </div>
  );
}
