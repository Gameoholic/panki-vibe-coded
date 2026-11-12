import { useEffect, useState } from "react";
import { STAGE_RAMP, type Stretch, type VideoCard } from "@panki/contracts";
import { NumberField } from "@web/components/NumberField";
import { Segmented } from "@web/components/Segmented";
import { Setting } from "@web/components/Setting";
import { Swatches } from "@web/components/Swatches";
import { Toggle } from "@web/components/Toggle";
import { OFFER_AWAY_MS, OFFER_MS, RESUME_BACK_MAX, RESUME_HOW, RESUME_HOW_IDS, RESUME_TIMED, RESUME_TIMED_IDS, resumeTo, type ResumeHow } from "../modules";
import { ResumeOffer } from "../ui/ResumeOffer";
import {
  CARD_CLICKS,
  CARD_CLICK_IDS,
  MARK_SIZES,
  MARK_SIZE_IDS,
  MARK_SWATCHES,
  PIN_ENTRANCES,
  PIN_ENTRANCE_IDS,
  paintCss,
  paintOf,
  type CardWords,
  type MarkLook,
  type SeekLook,
  type SeekMarkId,
  type WordsLook,
  type WordsMarkId,
} from "../seekLook";
import type { KnownMoment } from "../capture/known";
import { seekLookOf, writeStore, type Stored } from "../storage";
import { SeekMark, type ClipMark } from "../ui/SeekMark";
import { ColourByStage } from "./ColourByStage";
import { SceneTitle } from "./explainerScenes";

const SIZE_OPTIONS = MARK_SIZE_IDS.map((id) => ({ id, label: MARK_SIZES[id].name }));
const ENTRANCE_OPTIONS = PIN_ENTRANCE_IDS.map((id) => ({ id, label: PIN_ENTRANCES[id] }));
const CLICK_OPTIONS = CARD_CLICK_IDS.map((id) => ({ id, label: CARD_CLICKS[id] }));
const RESUME_OPTIONS = RESUME_HOW_IDS.map((id) => ({ id, label: RESUME_HOW[id] }));
const TIMED_OPTIONS = RESUME_TIMED_IDS.map((id) => ({ id, label: RESUME_TIMED[id] }));
const WORDS_OPTIONS = [
  { id: "hover", label: "On hover" },
  { id: "always", label: "Always" },
  { id: "off", label: "Hidden" },
] as const satisfies readonly { id: CardWords; label: string }[];

/**
 * Each mark under its own heading, in the bar's order of what it says: what's transcribed, the cards, the suspended ones, the flagged ones, the clip, then where the words that are in the decks are said.
 * `ownColour`: set here, the YouTube-only marks' alone; the rest are coloured wherever the words are marked, on every
 * site, so their colours are the highlight's (Word pop-up → Highlight words that are in your decks; `storage.ts` → `seekLookOf`).
 */
const MARKS: readonly { id: SeekMarkId; name: string; ownColour: boolean }[] = [
  { id: "transcript", name: "Transcript", ownColour: true },
  { id: "cards", name: "Cards made from this video", ownColour: true },
  { id: "suspended", name: "Suspended cards", ownColour: false },
  { id: "flagged", name: "Flagged cards", ownColour: false },
  { id: "clip", name: "Clip", ownColour: true },
  { id: "known", name: "Words that are in your decks", ownColour: false },
];
/** Where the made-up video says words that are in the decks, for the preview: a few ticks across what's transcribed, each with its word. */
const PREVIEW_IN_DECKS: readonly KnownMoment[] = (
  [
    [20, "今日"],
    [41, "食べる"],
    [95, "言葉"],
    [118, "友達"],
    [152, "景色"],
    [203, "電車"],
    [236, "勉強"],
    [271, "大丈夫"],
    [298, "例えば"],
  ] as const
).map(([at, words], i) => ({ startMs: at * 1000, endMs: at * 1000 + 600, words, lineMs: (at - 2) * 1000, suspended: false, flagged: false, colour: STAGE_RAMP[i % STAGE_RAMP.length] ?? STAGE_RAMP[0] }));

/**
 * A made-up video for the preview, ten minutes long, never one of the account's: most of it transcribed and a little more on
 * its way, a few cards taken from it (two close enough that their words stand in two lanes), a clip open, and where it
 * has played to. Its words are only there to be seen on the pins.
 */
const PREVIEW_LENGTH = 600;
const PREVIEW_COVERED: readonly Stretch[] = [{ startMs: 0, endMs: 330_000 }];
const PREVIEW_WORKING: Stretch = { startMs: 330_000, endMs: 346_000 };
const PREVIEW_CARDS: readonly VideoCard[] = [
  { cardId: "preview-1", startMs: 62_000, endMs: 66_000, words: "言葉", suspended: false, flagged: false, colour: STAGE_RAMP[0] },
  { cardId: "preview-2", startMs: 148_000, endMs: 153_000, words: "景色", suspended: false, flagged: false, colour: STAGE_RAMP[1] },
  // A new card, its type with no New colour: Panki blue.
  { cardId: "preview-3", startMs: 166_000, endMs: 170_000, words: "例えば", suspended: false, flagged: false },
  { cardId: "preview-6", startMs: 268_000, endMs: 273_000, words: "喫茶店", suspended: false, flagged: true, colour: STAGE_RAMP[1] },
  { cardId: "preview-5", startMs: 372_000, endMs: 376_000, words: "敢えて", suspended: true, flagged: false, colour: STAGE_RAMP[0] },
  { cardId: "preview-4", startMs: 432_000, endMs: 437_000, words: "大丈夫", suspended: false, flagged: false, colour: STAGE_RAMP[2] },
];
const PREVIEW_PLAYED = 150;
/** Where the made-up video was stopped the time before, for the Where you stopped preview. */
const PREVIEW_STOP = 440;
/** How long the preview's offer stays gone before it comes back, so the little scene plays again. */
const PREVIEW_AGAIN_MS = 1800;

/**
 * The bar as it will look, live, one preview for everything on it: the pointer on it raises the cards' words as it would on the video, a pin pressed (or anywhere on
 * the bar) moves where it has played to, the clip's ends can be pulled; and where the made-up video was stopped last,
 * the white tag while its mark is on, with what opening the video does. With the button, the real offer over the
 * picture, its line filling; pressed, the video goes to the stop and the offer fades, as it does on a video; closed,
 * it only fades; over, it goes; a moment later the scene plays again. With the jump, the video stands at the stop as
 * it opens, the same box saying "Jumped to" with nothing to press (a press on the bar still moves it).
 */
function SeekPreview({ look, how, back, marked }: { look: SeekLook; how: ResumeHow; back: number; marked: boolean }) {
  const [hover, setHover] = useState(false);
  const jump = how !== "offer";
  /** Where going back to the stop lands, as many seconds before it as set. */
  const landing = resumeTo(PREVIEW_STOP, back);
  const [at, setAt] = useState(jump ? landing : PREVIEW_PLAYED);
  const [clip, setClip] = useState({ start: 240, end: 252 });
  const [offer, setOffer] = useState<"up" | "away" | "gone">("up");
  const mark: ClipMark = {
    start: clip.start,
    end: clip.end,
    onMove: (which, to) => setClip((was) => (which === "start" ? { ...was, start: Math.min(to, was.end - 1) } : { ...was, end: Math.max(to, was.start + 1) })),
    onSettle: () => undefined,
  };
  // The way picked changes: the video opens afresh, where that way puts it, and the offer comes back.
  useEffect(() => {
    setAt(jump ? landing : PREVIEW_PLAYED);
    setOffer("up");
  }, [jump, landing]);
  // The offer on its way: fading, then gone for a moment, then back with the video from the start again.
  useEffect(() => {
    if (offer === "up") return;
    const timer = setTimeout(
      () => {
        if (offer === "away") setOffer("gone");
        else {
          setAt(jump ? landing : PREVIEW_PLAYED);
          setOffer("up");
        }
      },
      offer === "away" ? OFFER_AWAY_MS : PREVIEW_AGAIN_MS,
    );
    return () => clearTimeout(timer);
  }, [jump, landing, offer]);
  // Its line reaches the right edge: it goes by itself, as on a video.
  useEffect(() => {
    if (offer !== "up") return;
    const timer = setTimeout(() => setOffer("away"), OFFER_MS);
    return () => clearTimeout(timer);
  }, [offer]);
  function take() {
    if (offer !== "up") return;
    setAt(landing);
    setOffer("away");
  }
  function close() {
    if (offer === "up") setOffer("away");
  }
  return (
    <div className="seek-preview" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      {offer !== "gone" ? <ResumeOffer at={jump ? landing : PREVIEW_STOP} jumped={jump} away={offer === "away"} onTake={take} onClose={close} /> : null}
      <div
        className="seek-preview-bar"
        onPointerDown={(e) => {
          // A pin, the clip's ends and the stop's tag do their own thing.
          if (e.target instanceof Element && e.target.closest(".seek-pin, .seek-end, .seek-stop")) return;
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
          inDecks={PREVIEW_IN_DECKS}
          look={look}
          hover={hover}
          stop={marked ? PREVIEW_STOP : null}
          onStop={() => setAt(landing)}
          // The made-up cards have no transcript to find their words in: a press goes to the sentence, as it does on a video without one.
          onGo={(pinned) => setAt((pinned.of !== "known" ? pinned.card.startMs : look.known.click === "word" ? pinned.said.startMs : pinned.said.lineMs) / 1000)}
        />
      </div>
    </div>
  );
}

/**
 * A mark's words on pins over it: when they stand, how they come in, what pressing one does. The cards' rows, and the
 * same for the words that are in the decks.
 */
function WordsRows({ id, look, off, onChange }: { id: WordsMarkId; look: WordsLook; off: boolean; onChange: (patch: Partial<WordsLook>) => void }) {
  // "Words" for both: the group's title already says whose.
  const label = "Words";
  const still = off || !look.shown || look.words === "off";
  return (
    <>
      <Setting id={`seek-${id}-words`} label={label} control={<Segmented idPrefix={`seek-${id}-words`} label={label} options={WORDS_OPTIONS} value={look.words} disabled={off || !look.shown} onChange={(words) => onChange({ words })} />} />
      <Setting
        id={`seek-${id}-entrance`}
        label="Word animation"
        control={<Segmented idPrefix={`seek-${id}-entrance`} label="Word animation" options={ENTRANCE_OPTIONS} value={look.entrance} disabled={still} onChange={(entrance) => onChange({ entrance })} />}
      />
      <Setting
        id={`seek-${id}-click`}
        label="Clicking a word"
        control={<Segmented idPrefix={`seek-${id}-click`} label="Clicking a word" options={CLICK_OPTIONS} value={look.click} disabled={still} onChange={(click) => onChange({ click })} />}
      />
    </>
  );
}

/**
 * How Panki's marks on a video's seek bar look, each its own: shown or not, its colour, how thick; and for the cards, when their words stand over
 * them, how they come in and what pressing one does. The preview at the top is the real thing, with a made-up video.
 * Kept the moment it's changed; a video page reads it again as it gets the focus.
 */
export function SeekBarPanel({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const kept = store.seekLook;
  // As the marks are drawn: the colours shared with the highlight are the highlight's.
  const look = seekLookOf(store);
  // All of Panki's marks on the bar at once, the row that heads the panel; off, every mark's own rows are greyed.
  const off = !store.moduleSeek;
  function change<K extends SeekMarkId>(id: K, patch: Partial<SeekLook[K]>) {
    const next: SeekLook = { ...kept };
    next[id] = { ...kept[id], ...patch };
    void writeStore({ seekLook: next }).then(onChanged);
  }
  return (
    <section className="panel" aria-labelledby="seek-bar-title">
      <SceneTitle id="seek" titleId="seek-bar-title" store={store} />
      <SeekPreview look={look} how={store.resumeHow} back={store.resumeBack} marked={store.moduleSeek && store.markStop} />
      <Setting id="module-seek" label="Seek bar marks" control={<Toggle id="module-seek-on" says={{ on: "On", off: "Off" }} on={store.moduleSeek} onChange={(moduleSeek) => void writeStore({ moduleSeek }).then(onChanged)} />} />
      {MARKS.map(({ id, name, ownColour }) => {
        const mark: MarkLook = look[id];
        return (
          // Each mark a block of its own, its name led by a stroke of the mark as it's drawn, so they don't read as one clump.
          <div key={id} className="seek-group">
            <h3 className="seek-group-title">
              <span
                className={`seek-group-sample ${mark.shown ? "" : "is-off"}`.trim()}
                style={{ background: (id === "known" || id === "cards") && look[id].byStage ? `linear-gradient(90deg, ${STAGE_RAMP.join(", ")})` : paintCss(mark.colour), height: `${MARK_SIZES[mark.size].px}px` }}
                aria-hidden="true"
              />
              {name}
            </h3>
            <Setting id={`seek-${id}-shown`} label="Visibility" control={<Toggle id={`seek-${id}-shown-on`} says={{ on: "Shown", off: "Hidden" }} on={mark.shown} disabled={off} onChange={(shown) => change(id, { shown })} />} />
            {ownColour ? (
              <Setting
                id={`seek-${id}-colour`}
                label="Colour"
                control={
                  id === "cards" ? (
                    <ColourByStage
                      id={`seek-${id}-colour`}
                      byStage={look.cards.byStage}
                      colour={mark.colour}
                      disabled={off || !mark.shown}
                      onByStage={(byStage) => change("cards", { byStage })}
                      onColour={(colour) => change(id, { colour })}
                    />
                  ) : (
                    <Swatches
                      id={`seek-${id}-colour`}
                      swatches={MARK_SWATCHES}
                      value={mark.colour}
                      disabled={off || !mark.shown}
                      onChange={(value) => {
                        const colour = paintOf(value);
                        if (colour) change(id, { colour });
                      }}
                    />
                  )
                }
              />
            ) : null}
            <Setting
              id={`seek-${id}-size`}
              label="Thickness"
              control={<Segmented idPrefix={`seek-${id}-size`} label={`${name} thickness`} options={SIZE_OPTIONS} value={mark.size} disabled={off || !mark.shown} onChange={(size) => change(id, { size })} />}
            />
            {id === "cards" || id === "suspended" || id === "flagged" || id === "known" ? <WordsRows id={id} look={look[id]} off={off} onChange={(patch) => change(id, patch)} /> : null}
          </div>
        );
      })}
      {/* Where a video watched before was stopped: what happens as it opens again, and whether the bar marks it. Nothing while this browser's Video tracking is off. */}
      <div className="seek-group">
        <h3 className="seek-group-title">
          <span className={`seek-group-sample is-stop ${store.moduleSeek && store.markStop ? "" : "is-off"}`.trim()} aria-hidden="true" />
          Where you stopped last
        </h3>
        <Setting
          id="resume-how"
          label="As the video opens"
          control={<Segmented idPrefix="resume-how" label="As the video opens" options={RESUME_OPTIONS} value={store.resumeHow} disabled={off} onChange={(resumeHow) => void writeStore({ resumeHow }).then(onChanged)} />}
        />
        {store.resumeHow === "continue" ? (
          <Setting
            id="resume-timed"
            label='When the link contains a timestamp ("?t=")'
            control={<Segmented idPrefix="resume-timed" label='When the link contains a timestamp ("?t=")' options={TIMED_OPTIONS} value={store.resumeTimed} disabled={off} onChange={(resumeTimed) => void writeStore({ resumeTimed }).then(onChanged)} />}
          />
        ) : null}
        <Setting
          id="resume-back"
          label="Seconds before where you stopped"
          control={
            <NumberField
              id="resume-back-field"
              label="Seconds before where you stopped"
              value={store.resumeBack}
              min={0}
              max={RESUME_BACK_MAX}
              suffix=" s"
              disabled={off}
              onChange={(resumeBack) => void writeStore({ resumeBack }).then(onChanged)}
            />
          }
        />
        <Setting
          id="mark-stop"
          label="On the seek bar"
          control={<Toggle id="mark-stop-on" says={{ on: "Shown", off: "Hidden" }} on={store.markStop} disabled={!store.moduleSeek} onChange={(markStop) => void writeStore({ markStop }).then(onChanged)} />}
        />
      </div>
    </section>
  );
}
