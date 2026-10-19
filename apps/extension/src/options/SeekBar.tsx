import { useRef, useState, type CSSProperties } from "react";
import type { Stretch, VideoCard } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Segmented } from "@web/components/Segmented";
import { Setting } from "@web/components/Setting";
import { Toggle } from "@web/components/Toggle";
import { useDismiss } from "@web/hooks/useDismiss";
import {
  CARD_CLICKS,
  CARD_CLICK_IDS,
  MARK_COLOURS,
  MARK_COLOUR_IDS,
  MARK_SIZES,
  MARK_SIZE_IDS,
  MarkColour,
  PIN_ENTRANCES,
  PIN_ENTRANCE_IDS,
  paintCss,
  paintName,
  type CardWords,
  type MarkLook,
  type MarkPaint,
  type SeekLook,
  type SeekMarkId,
} from "../seekLook";
import { writeStore, type Stored } from "../storage";
import { SeekMark, type ClipMark } from "../ui/SeekMark";
import { ColourWheel } from "./ColourWheel";

const SIZE_OPTIONS = MARK_SIZE_IDS.map((id) => ({ id, label: MARK_SIZES[id].name }));
const ENTRANCE_OPTIONS = PIN_ENTRANCE_IDS.map((id) => ({ id, label: PIN_ENTRANCES[id] }));
const CLICK_OPTIONS = CARD_CLICK_IDS.map((id) => ({ id, label: CARD_CLICKS[id] }));
const WORDS_OPTIONS = [
  { id: "hover", label: "On hover" },
  { id: "always", label: "Always" },
  { id: "off", label: "Hidden" },
] as const satisfies readonly { id: CardWords; label: string }[];

/** Each mark under its own heading, in the bar's order of what it says: what's transcribed, the cards, the clip. */
const MARKS: readonly { id: SeekMarkId; name: string }[] = [
  { id: "transcript", name: "Transcript" },
  { id: "cards", name: "Cards" },
  { id: "clip", name: "Clip" },
];

/**
 * A made-up video for the preview, ten minutes long, never the owner's: most of it transcribed and a little more on
 * its way, a few cards taken from it (two close enough that their words stand in two lanes), a clip open, and where it
 * has played to. Its words are only there to be seen on the pins.
 */
const PREVIEW_LENGTH = 600;
const PREVIEW_COVERED: readonly Stretch[] = [{ startMs: 0, endMs: 330_000 }];
const PREVIEW_WORKING: Stretch = { startMs: 330_000, endMs: 346_000 };
const PREVIEW_CARDS: readonly VideoCard[] = [
  { cardId: "preview-1", startMs: 62_000, endMs: 66_000, words: "言葉" },
  { cardId: "preview-2", startMs: 148_000, endMs: 153_000, words: "景色" },
  { cardId: "preview-3", startMs: 166_000, endMs: 170_000, words: "例えば" },
  { cardId: "preview-4", startMs: 432_000, endMs: 437_000, words: "大丈夫" },
];
const PREVIEW_PLAYED = 150;

/** A palette colour as the page has it right now, as `#rrggbb`, for the wheel to start from; white when it can't be read. */
function hexOfPaint(paint: MarkPaint): string {
  const css = paintCss(paint);
  const token = /^var\((--[\w-]+)\)$/.exec(css)?.[1];
  const value = token ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : css;
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#ffffff";
}

/**
 * A mark's colour: a round swatch for each of the palette's, the one on ringed, and a last one for a colour of the
 * viewer's own (the owner, 2026-10-19: "a custom colour wheel in case I want custom colours"), rainbow until one is
 * picked, which opens the wheel under the row; its name after them.
 */
function Swatches({ id, value, disabled, onChange }: { id: string; value: MarkPaint; disabled: boolean; onChange: (colour: MarkPaint) => void }) {
  const [wheel, setWheel] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useDismiss(root, wheel, () => setWheel(false));
  const own = MarkColour.safeParse(value).success ? null : value;
  return (
    <span ref={root} className="mark-swatches">
      <span className="mark-swatch-row" role="group" aria-label="Colour">
        {MARK_COLOUR_IDS.map((colour) => (
          <Button
            key={colour}
            id={`${id}-${colour}`}
            className="mark-swatch"
            aria-label={MARK_COLOURS[colour].name}
            aria-pressed={colour === value}
            disabled={disabled}
            style={{ "--swatch": MARK_COLOURS[colour].css } as CSSProperties}
            onClick={() => onChange(colour)}
          />
        ))}
        <Button
          id={`${id}-own`}
          className={`mark-swatch is-own ${own ? "has-colour" : ""}`.trim()}
          aria-label="Your own colour"
          aria-pressed={own !== null}
          aria-expanded={wheel}
          disabled={disabled}
          style={own ? ({ "--swatch": own } as CSSProperties) : undefined}
          onClick={() => setWheel((open) => !open)}
        />
      </span>
      <span className="mark-swatch-name">{paintName(value)}</span>
      {wheel && !disabled ? (
        <span className="colour-pop">
          <ColourWheel id={`${id}-wheel`} start={own ?? hexOfPaint(value)} onPick={onChange} />
        </span>
      ) : null}
    </span>
  );
}

/**
 * The marks as they'd stand on a video's bar, live: the pointer on it raises the cards' words as it would on the
 * video, a pin pressed (or anywhere on the bar) moves where it has played to, and the clip's ends can be pulled.
 */
function SeekPreview({ look }: { look: SeekLook }) {
  const [hover, setHover] = useState(false);
  const [at, setAt] = useState(PREVIEW_PLAYED);
  const [clip, setClip] = useState({ start: 240, end: 252 });
  const mark: ClipMark = {
    start: clip.start,
    end: clip.end,
    onMove: (which, to) => setClip((was) => (which === "start" ? { ...was, start: Math.min(to, was.end - 1) } : { ...was, end: Math.max(to, was.start + 1) })),
    onSettle: () => undefined,
  };
  return (
    <div className="seek-preview" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <div
        className="seek-preview-bar"
        onPointerDown={(e) => {
          // A pin and the clip's ends do their own thing.
          if (e.target instanceof Element && e.target.closest(".seek-pin, .seek-end")) return;
          const box = e.currentTarget.getBoundingClientRect();
          if (box.width > 0) setAt(Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * PREVIEW_LENGTH);
        }}
      >
        <span className="seek-preview-played" style={{ width: `${(at / PREVIEW_LENGTH) * 100}%` }} aria-hidden="true" />
        <SeekMark
          length={PREVIEW_LENGTH}
          covered={PREVIEW_COVERED}
          working={PREVIEW_WORKING}
          cards={PREVIEW_CARDS}
          clip={mark}
          look={look}
          hover={hover}
          // The made-up cards have no transcript to find their words in: a press goes to the sentence, as it does on a video without one.
          onGo={(card) => setAt(card.startMs / 1000)}
        />
      </div>
    </div>
  );
}

/**
 * How Panki's marks on a video's seek bar look (the owner, 2026-10-19: "make the segments customizable, both for colour
 * and other stuff"), each its own: shown or not, its colour, how thick; and for the cards, when their words stand over
 * them, how they come in and what pressing one does. The preview at the top is the real thing, with a made-up video.
 * Kept the moment it's changed; a video page reads it again as it gets the focus.
 */
export function SeekBarPanel({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const look = store.seekLook;
  function change<K extends SeekMarkId>(id: K, patch: Partial<SeekLook[K]>) {
    const next: SeekLook = { ...look };
    next[id] = { ...look[id], ...patch };
    void writeStore({ seekLook: next }).then(onChanged);
  }
  return (
    <section className="panel" aria-labelledby="seek-bar-title">
      <h2 id="seek-bar-title" className="panel-title">
        Seek bar
      </h2>
      <SeekPreview look={look} />
      {MARKS.map(({ id, name }) => {
        const mark: MarkLook = look[id];
        return (
          // Each mark a block of its own, its name led by a stroke of the mark as it's drawn (the owner, 2026-10-19: "they're all clumped together").
          <div key={id} className="seek-group">
            <h3 className="seek-group-title">
              <span
                className={`seek-group-sample ${mark.shown ? "" : "is-off"}`.trim()}
                style={{ background: paintCss(mark.colour), height: `${MARK_SIZES[mark.size].px}px` }}
                aria-hidden="true"
              />
              {name}
            </h3>
            <Setting id={`seek-${id}-shown`} label="Visibility" control={<Toggle id={`seek-${id}-shown-on`} says={{ on: "Shown", off: "Hidden" }} on={mark.shown} onChange={(shown) => change(id, { shown })} />} />
            <Setting id={`seek-${id}-colour`} label="Colour" control={<Swatches id={`seek-${id}-colour`} value={mark.colour} disabled={!mark.shown} onChange={(colour) => change(id, { colour })} />} />
            <Setting
              id={`seek-${id}-size`}
              label="Thickness"
              control={<Segmented idPrefix={`seek-${id}-size`} label={`${name} thickness`} options={SIZE_OPTIONS} value={mark.size} disabled={!mark.shown} onChange={(size) => change(id, { size })} />}
            />
            {id === "cards" ? (
              <>
                <Setting
                  id="seek-cards-words"
                  label="Card words"
                  control={<Segmented idPrefix="seek-cards-words" label="Card words" options={WORDS_OPTIONS} value={look.cards.words} disabled={!look.cards.shown} onChange={(words) => change("cards", { words })} />}
                />
                <Setting
                  id="seek-cards-entrance"
                  label="Word animation"
                  control={
                    <Segmented
                      idPrefix="seek-cards-entrance"
                      label="Word animation"
                      options={ENTRANCE_OPTIONS}
                      value={look.cards.entrance}
                      disabled={!look.cards.shown || look.cards.words === "off"}
                      onChange={(entrance) => change("cards", { entrance })}
                    />
                  }
                />
                <Setting
                  id="seek-cards-click"
                  label="Clicking a word"
                  control={
                    <Segmented
                      idPrefix="seek-cards-click"
                      label="Clicking a word"
                      options={CLICK_OPTIONS}
                      value={look.cards.click}
                      disabled={!look.cards.shown || look.cards.words === "off"}
                      onChange={(click) => change("cards", { click })}
                    />
                  }
                />
              </>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
