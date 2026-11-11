import { useEffect, useMemo, useRef, useState } from "react";
import {
  CORNER_MARK_IDS,
  CardLayout,
  EXAMPLES_SLOT,
  NEW_PLACE,
  blursFront,
  columnOrder,
  examplesAt,
  examplesToColumn,
  holdsLink,
  holdsWords,
  isTyped,
  mainAnswers,
  moveInColumn,
  offered,
  sourcesWithExample,
  stagedOrder,
  valuesWithExample,
  type Card,
  type CardField,
  type CardSide,
  type CardType,
  type Column,
  type CornerMarkId,
  type Deck,
  type ExamplesPlace,
  type FlagMark,
  type LayoutPart,
  type ReviewSettings,
  type SparkMark,
  type SrsType,
  type StageTag,
  type SubtitleStyle,
} from "@panki/contracts";
import { api } from "../api";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { ExampleArrows } from "../components/ExampleArrows";
import { FloatPanel } from "../components/FloatPanel";
import { Icon } from "../components/Icon";
import { ReviewCard } from "../components/ReviewCard";
import { ReviewButtons, ReviewCounts, ReviewScreen } from "../components/ReviewScreen";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { ShowButton } from "../components/ShowButton";
import { Toggle } from "../components/Toggle";
import { FIELD_KINDS } from "../fieldKinds";
import { useBlur } from "../hooks/useBlur";
import { useDragOrder } from "../hooks/useDragOrder";
import { keepDouble, useHold } from "../hooks/useHold";
import { useScreenStage } from "../hooks/useScreenStage";
import { useUndoable } from "../hooks/useUndoable";
import { doubleKeys, keyIn, keyOf, pressedIn, restartOf, shortcutOf, useKeyBinds, useKeybindsEnabled } from "../keys";
import { BLUR_OPTIONS, BLUR_SUBTITLE_OPTIONS, COLUMN_OPTIONS, CORNER_MARK_NAMES, CORNER_OPTIONS, EXAMPLE_ARROWS, LOOK_OPTIONS, PLAY_OPTIONS, SHOW_OPTIONS, SIZE_OPTIONS, TONE_OPTIONS } from "../layoutKinds";
import { buildQueue, kindOf, startLine, togoOf } from "../reviewLine";
import { rememberShape } from "../skeletonMemory";
import type { UnsavedGuard } from "../unsaved";
import { waveOf } from "../waveform";
import type { SaveStatus } from "./SrsTypeView";

/** Which side of the card is shown. */
const SIDES: readonly { id: CardSide; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
];
/** How many of the type's newest cards can be shown on it while it's laid out. */
const SAMPLES_MAX = 30;
/** Shown with no card: each field's name where it stands. */
const NO_SAMPLE = "";
/** A part written over no other's words, or lighting none in its own. */
const NOT_OVER = "";
/** The pill's ladder when no deck's is to hand: a new card says "New" whatever its type is. */
const NO_LADDER: Pick<SrsType, "stages" | "after" | "burnedName"> = { stages: [], after: "burn", burnedName: "" };
/** What's picked when it's a corner mark (the stage tag, the AI spark, the flag): no field's id is this. */
const markPicked = (id: CornerMarkId) => `mark:${id}`;

/** What's laid out here: every field's part, the corner marks (the stage tag, the AI spark, the flag), and the example arrows. */
type Laid = { parts: LayoutPart[]; tag: StageTag; spark: SparkMark; flag: FlagMark; examples: ExamplesPlace | null };
/** What a Save sends: the layout as it reads, and everything else the tab lays out. */
export type LaidOut = { layout: CardLayout; tag: StageTag; spark: SparkMark; flag: FlagMark; examples: ExamplesPlace | null };

type Props = {
  /** The card type as it's saved. */
  type: CardType;
  /** Every deck: the ones of this type lend their newest cards to show on it, and their counts to the line over it. */
  decks: readonly Deck[];
  srsTypes: readonly SrsType[];
  onSave: (laid: LaidOut) => Promise<CardType>;
  onStatus: (status: SaveStatus) => void;
  /** Says whether there's unsaved work here, so leaving the screen can ask first (null when there's none). */
  onGuard: (guard: UnsavedGuard | null) => void;
  /** How a clip's subtitles look: the account's. */
  subtitleStyle: SubtitleStyle;
  /** How every review runs, the account's: the order the line over the card counts in, and whether the front blurs. */
  review: ReviewSettings;
};

/**
 * How a card type's cards look in a review, laid out on the card itself in the review's own screen (`ReviewScreen`):
 * one of the type's own cards on it, its deck's counts over it, played, opened, blurred and turned as a review does
 * (Unblur and Blur, Show back of card, Step back, their keys). A press on a part picks it, a press on its player working
 * the player as well; a part is moved by its grip. Its choices stand in a panel over the screen (`FloatPanel`), with
 * which side shows and the card it's shown on. Saved by the header's Save, as the SRS editor is; leaving unsaved asks
 * first, and Ctrl+Z undoes.
 */
export function LayoutView({ type, decks, srsTypes, onSave, onStatus, onGuard, subtitleStyle, review }: Props) {
  // The fields' parts, the corner marks and the example arrows are laid out together, so one Undo steps back through them all.
  const laidOf = (t: CardType): Laid => ({ parts: t.layout, tag: t.tag, spark: t.spark, flag: t.flag, examples: t.examples });
  const history = useUndoable<Laid>(laidOf(type));
  const { undo, redo } = history;
  const draft = history.present.parts;
  const tag = history.present.tag;
  const spark = history.present.spark;
  const flag = history.present.flag;
  const examples = history.present.examples;
  const change = (parts: LayoutPart[]) => history.change({ ...history.present, parts });
  const changeTag = (patch: Partial<StageTag>) => history.change({ ...history.present, tag: { ...tag, ...patch } });
  /** A corner mark's own: whether it's shown, and its corner (the stage tag's size is its alone). */
  const changeMark = (id: CornerMarkId, patch: Partial<SparkMark>) => {
    if (id === "tag") changeTag(patch);
    else if (id === "spark") history.change({ ...history.present, spark: { ...spark, ...patch } });
    else history.change({ ...history.present, flag: { ...flag, ...patch } });
  };
  const [saved, setSaved] = useState<Laid>(laidOf(type));
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  /** The side whose parts are shown and moved. */
  const [side, setSide] = useState<CardSide>("front");
  const binds = useKeyBinds();
  const keysOn = useKeybindsEnabled();
  const hold = useHold();
  const [picked, setPicked] = useState<string | null>(null);
  const [samples, setSamples] = useState<{ card: Card; deck: Deck }[]>([]);
  /** Every card of each deck of this type, by the deck's id: what a review of it would count. */
  const [deckCards, setDeckCards] = useState<ReadonlyMap<string, readonly Card[]>>(new Map());
  const [sampleId, setSampleId] = useState<string>(NO_SAMPLE);
  /** The front's blur, as a review has it: the card shown opens blurred, turning it leaves its front clear. */
  const blur = useBlur(review.blurFront, sampleId);
  const fields = useMemo(() => new Map(type.fields.map((f) => [f.id, f])), [type.fields]);
  const place = useRef<HTMLElement | null>(null);
  /** Full screen as a review fills it, asked for here alone: never kept for the next review, nor filled by itself. */
  const stage = useScreenStage(place, true, false);

  // The type's own cards, from every deck that uses it: the newest to show on it (the newest of all to begin with), and
  // each deck's whole for its counts.
  const deckKey = decks
    .filter((d) => d.typeId === type.id)
    .map((d) => d.id)
    .join(" ");
  useEffect(() => {
    const using = decks.filter((d) => d.typeId === type.id);
    if (using.length === 0) return;
    let alive = true;
    void Promise.all(using.map((deck) => api.listCards(deck.id).then((cards) => ({ deck, cards }))))
      .then((lists) => {
        if (!alive) return;
        setDeckCards(new Map(lists.map(({ deck, cards }) => [deck.id, cards])));
        const newest = lists
          .flatMap(({ deck, cards }) => cards.map((card) => ({ card, deck })))
          .sort((a, b) => b.card.createdAt - a.card.createdAt)
          .slice(0, SAMPLES_MAX);
        setSamples(newest);
        setSampleId((was) => (was === NO_SAMPLE ? (newest[0]?.card.id ?? NO_SAMPLE) : was));
      })
      // Without its cards the card shows each field's name and the counts hold their room: nothing here needs them.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [deckKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the decks are read afresh only when which of them use the type changes

  const dirty = JSON.stringify(history.present) !== JSON.stringify(saved);
  const parsed = useMemo(() => CardLayout.safeParse(draft), [draft]);
  const status: SaveStatus["state"] = saving ? "saving" : saveFailure ? "failed" : dirty ? "unsaved" : "saved";

  // While there's unsaved work, leaving asks first: the app's own question for its screens, and the browser's for a
  // reload or a closed tab.
  const saveRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  useEffect(() => {
    onGuard(dirty ? { name: `${type.name}'s layout`, save: () => saveRef.current() } : null);
  }, [dirty, type.name, onGuard]);
  useEffect(() => () => onGuard(null), [onGuard]);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);
  useEffect(() => {
    onStatus({ name: type.name, state: status, canSave: dirty && parsed.success && !saving });
  }, [type.name, status, dirty, parsed.success, saving, onStatus]);

  /** Save: what's on the card becomes the type's layout. Says whether it did. */
  async function save(): Promise<boolean> {
    if (!parsed.success || saving) return false;
    setSaving(true);
    setSaveFailure(null);
    try {
      const result = await onSave({ layout: parsed.data, tag, spark, flag, examples });
      setSaved(laidOf(result));
      // What the API keeps is the layout filled out against the fields; it takes the draft's place without a step.
      history.amend(() => laidOf(result));
      return true;
    } catch (e) {
      setSaveFailure(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  const update = (fieldId: string, patch: Partial<Omit<LayoutPart, "fieldId">>) => change(draft.map((p) => (p.fieldId === fieldId ? { ...p, ...patch } : p)));
  // Moved on the card, among the parts on the side shown in the same column and the example arrows where they stand
  // there: one order for both sides. Which column a part or the arrows stand in is its own setting (Column), never a drag's.
  const itemsIn = (column: Column) => columnOrder(draft, type.fields, side, column, examples);
  const moveWithin = (column: Column) => (from: number, to: number) => {
    const moved = moveInColumn(draft, type.fields, side, column, examples, from, to);
    history.change({ ...history.present, parts: moved.layout, examples: moved.examples });
  };
  const mainOrder = useDragOrder(itemsIn("main").length, moveWithin("main"));
  const sideOrder = useDragOrder(itemsIn("side").length, moveWithin("side"));

  const sample = samples.find((s) => s.card.id === sampleId) ?? null;
  /** The previewed card's examples, its own first, and which is shown: switched by the example arrows as in a review. */
  const exampleIds: (string | null)[] = [null, ...(sample?.card.examples.map((e) => e.id) ?? [])];
  const [browsed, setBrowsed] = useState(0);
  useEffect(() => setBrowsed(0), [sampleId]);
  const exampleId = exampleIds[browsed % exampleIds.length] ?? null;
  /** Where the example arrows stand as laid out now; none for a type with no field that's One per example. */
  const examplesHere = examplesAt(draft, type.fields, examples);
  /** A side shown: turned to the back, the front is left clear, as a review leaves it. */
  const showSide = (to: CardSide) => {
    if (to === "back") blur.unblur();
    setSide(to);
  };
  /** Show back of card. */
  const showNext = () => showSide("back");
  /** Step back, as in a review: the back to the front. */
  const canStepBack = side === "back";
  const stepBack = () => {
    if (canStepBack) showSide("front");
  };
  /** Whether Blur's key does anything here: on the front, while Blur the front is on and something is marked to blur. */
  const blurrable = review.blurFront && side === "front" && blursFront(draft);

  // The review's own keys turn the card here as they do there: Blur's, Show back of card's and Step back's, held as long
  // as each is set to be, and Enter. A key pressed in the panel is the panel's.
  const doubles = doubleKeys(binds);
  useEffect(() => {
    const kept = doubles.map(keepDouble);
    return () => {
      for (const letGo of kept) letGo();
    };
  }, [doubles.join("\n")]); // eslint-disable-line react-hooks/exhaustive-deps -- the keys are what the joined list says
  useEffect(() => {
    const own = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof Element && e.target.closest(".float-panel") !== null);
    const button = (name: string) => place.current?.querySelector<HTMLElement>(`[data-hold='${name}']`) ?? null;
    function onKey(e: KeyboardEvent) {
      if (own(e) || e.metaKey) return;
      const key = keyOf(e);
      if (keysOn && key === "Enter") {
        if (e.target instanceof HTMLButtonElement || side === "back") return;
        e.preventDefault();
        showNext();
        return;
      }
      const blurring = blurrable ? keyIn(binds.blur, key) : null;
      if (blurring) {
        e.preventDefault();
        if (!e.repeat) hold.begin(e, button("blur"), blurring.holdMs, blur.toggle);
        return;
      }
      // A key that's both is Show back of card's on the front, Step back's on the back.
      const showing = side === "back" ? null : keyIn(binds.reveal, key);
      const stepping = canStepBack && !showing ? keyIn(binds.hide, key) : null;
      if (stepping) {
        e.preventDefault();
        if (!e.repeat) hold.begin(e, button("hide"), stepping.holdMs, stepBack);
        return;
      }
      if (showing) {
        e.preventDefault();
        if (!e.repeat) hold.begin(e, button("reveal"), showing.holdMs, showNext);
      }
    }
    function onUp(e: KeyboardEvent) {
      hold.release(e.key);
      if (own(e)) return;
      if (pressedIn(e, binds.reveal)) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  /** The SRS type the card is counted and answered by: its deck's, else the first deck of this type's, else any. */
  const countDeck = sample?.deck ?? decks.find((d) => d.typeId === type.id && deckCards.has(d.id)) ?? null;
  const answersBy = (countDeck && srsTypes.find((t) => t.id === countDeck.srsTypeId)) ?? srsTypes[0];
  const ladder = (sample && srsTypes.find((t) => t.id === sample.deck.srsTypeId)) ?? srsTypes[0] ?? NO_LADDER;
  /** What a review of the card's deck would count over it, as it would open now. */
  const counted = useMemo(() => {
    const cards = countDeck ? deckCards.get(countDeck.id) : undefined;
    const by = countDeck ? srsTypes.find((t) => t.id === countDeck.srsTypeId) : undefined;
    if (!countDeck || !cards || !by) return null;
    const line = startLine(buildQueue(cards, countDeck, review), review.pool);
    const best = mainAnswers(by.answers).at(-1)?.id ?? "";
    return { settings: review, togo: togoOf([...line.active, ...line.waiting], new Map(cards.map((c) => [c.id, c])), by, best), line };
  }, [countDeck, deckCards, srsTypes, review]);

  /** What a card is called in the list of cards to show: its first words. */
  const nameField = type.fields.find((f) => holdsWords(f.kind));
  const sampleOptions = [
    { id: NO_SAMPLE, label: "Field names" },
    ...samples.map(({ card, deck }) => ({ id: card.id, label: (nameField && card.values[nameField.id]?.trim()) || "A card with no words", note: deck.name })),
  ];
  const away = draft.filter((p) => p[side] === "hide");
  /** The fields whose clip the full screen can fill the screen with, the one it fills it with first (`stagedOrder`). */
  const staging = stagedOrder(draft, type.fields);
  // What this tab's skeleton draws next time on this device (`Skeleton`'s `layout`): the chips of what isn't on the
  // front in the panel, and whether the answers set apart hold a row under the answers (1) or not (0).
  const awayOnFront = side === "front" ? away.length : null;
  const asidesHeld = answersBy !== undefined && answersBy.answers.some((a) => a.aside && offered(answersBy, sample?.card.place ?? NEW_PLACE, a.id)) ? 1 : 0;
  useEffect(() => {
    if (awayOnFront !== null) rememberShape(`layout-away:${type.id}`, awayOnFront);
  }, [awayOnFront, type.id]);
  useEffect(() => rememberShape(`layout-asides:${type.id}`, asidesHeld), [asidesHeld, type.id]);

  /** The corner mark picked, if it's one: the stage tag, the AI spark or the flag. */
  const pickedMark = CORNER_MARK_IDS.find((id) => picked === markPicked(id)) ?? null;
  /** The example arrows picked, while the type has them. */
  const examplesPicked = picked === EXAMPLES_SLOT && examplesHere !== null;
  const part = pickedMark ? undefined : draft.find((p) => p.fieldId === picked);
  const marks: Record<CornerMarkId, SparkMark> = { tag, spark, flag };
  const field = part ? fields.get(part.fieldId) : undefined;

  /** The picked part's choices: its two sides, then what its kind can change, then its place. */
  function choices(part: LayoutPart, field: CardField) {
    const id = part.fieldId;
    // The first in its column has nothing above it to stand beside.
    const first = draft.find((p) => p.column === part.column)?.fieldId === id;
    // Typed: words, a paragraph or a pitch accent, which all take a size, a colour and a name over them.
    const words = isTyped(field.kind);
    const media = field.kind === "media";
    const sized = words || field.kind === "image" || (media && (part.look === "player" || part.look === "plain"));
    // Words of one line can be written small over another field's words of one line, as their reading.
    const oneLine = field.kind === "text";
    const overable = type.fields.filter((f) => f.id !== id && f.kind === "text");
    // Words (a line or a paragraph) can have another field's words lit in them.
    const wordy = (f: CardField) => f.kind === "text" || f.kind === "long";
    const others = type.fields.filter((f) => f.id !== id && wordy(f)).map((f) => ({ id: f.id, label: f.name }));
    const pictured = media && (part.look === "player" || part.look === "plain");
    /** Written above another field's words: its size, field name and position are the word's to say, and off. */
    const above = part.over !== null;
    /** Another field's words lit in this one's: in its words, or in a clip's subtitles while they're shown. */
    const highlight = (
      <Setting
        id="part-mark"
        label="Highlight"
        control={<Dropdown id="part-mark-choice" label="Highlight" anchored options={[{ id: NOT_OVER, label: "None" }, ...others]} value={part.mark ?? NOT_OVER} onChange={(mark) => update(id, { mark: mark === NOT_OVER ? null : mark })} />}
      />
    );
    return (
      <>
        <Setting
          id="part-front"
          label="On the front"
          control={<Segmented idPrefix="part-front" label="On the front" options={SHOW_OPTIONS} value={part.front} onChange={(front) => update(id, { front })} />}
        />
        <Setting
          id="part-back"
          label="On the back"
          control={<Segmented idPrefix="part-back" label="On the back" options={SHOW_OPTIONS} value={part.back} onChange={(back) => update(id, { back })} />}
        />
        {/* What the blurred front does with it: the type's own, live while the account's Blur the front is off too. */}
        <Setting
          id="part-blur"
          label="Blurred front"
          control={<Segmented idPrefix="part-blur" label="Blurred front" options={BLUR_OPTIONS} value={part.blur} onChange={(blur) => update(id, { blur })} />}
        />
        {media ? (
          <Setting
            id="part-look"
            label="Player style"
            control={<Dropdown id="part-look-choice" label="Player style" anchored options={LOOK_OPTIONS} value={part.look} onChange={(look) => update(id, { look })} />}
          />
        ) : null}
        {/* A reading above a word is the reading's size, under no field name: those are off while it is. */}
        {sized ? <Setting id="part-size" label="Size" control={<Segmented idPrefix="part-size" label="Size" options={SIZE_OPTIONS} value={part.size} disabled={above} onChange={(size) => update(id, { size })} />} /> : null}
        {words ? <Setting id="part-tone" label="Colour" control={<Segmented idPrefix="part-tone" label="Colour" options={TONE_OPTIONS} value={part.tone} onChange={(tone) => update(id, { tone })} />} /> : null}
        {/* A reading above a word is the reading's weight, as it's the reading's size: off while it is. */}
        {words ? <Setting id="part-bold" label="Weight" control={<Toggle id="part-bold-on" says={{ on: "Bold", off: "Regular" }} on={part.bold} disabled={above} onChange={(bold) => update(id, { bold })} />} /> : null}
        {words || media || holdsLink(field.kind) ? (
          <Setting id="part-label" label="Field name" control={<Toggle id="part-label-on" says={{ on: "Shown", off: "Hidden" }} on={part.label} disabled={above} onChange={(label) => update(id, { label })} />} />
        ) : null}
        {wordy(field) ? highlight : null}
        {/* What's said in the clip, as it was heard on the video when it was recorded, following it as it plays. */}
        {pictured ? (
          <Setting id="part-subtitles" label="Subtitles" control={<Toggle id="part-subtitles-on" says={{ on: "Shown", off: "Hidden" }} on={part.subtitles} onChange={(subtitles) => update(id, { subtitles })} />} />
        ) : null}
        {/* The subtitles' own Blurred front, right under their switch so it reads as theirs, greyed while they're hidden. */}
        {pictured ? (
          <Setting
            id="part-blur-subtitles"
            label="Blurred front"
            control={
              <Segmented
                idPrefix="part-blur-subtitles"
                label="Subtitles on the blurred front"
                options={BLUR_SUBTITLE_OPTIONS}
                value={part.blurSubtitles}
                disabled={!part.subtitles}
                wrap
                onChange={(blurSubtitles) => update(id, { blurSubtitles })}
              />
            }
          />
        ) : null}
        {pictured && part.subtitles ? highlight : null}
        {media ? (
          <Setting
            id="part-auto"
            label="Plays by itself"
            control={<Dropdown id="part-auto-when" label="Plays by itself" anchored options={PLAY_OPTIONS} value={part.plays} onChange={(plays) => update(id, { plays })} />}
          />
        ) : null}
        {oneLine ? (
          <Setting
            id="part-over"
            label="Reading above"
            control={
              <Dropdown
                id="part-over-choice"
                label="Reading above"
                anchored
                options={[{ id: NOT_OVER, label: "None" }, ...overable.map((f) => ({ id: f.id, label: f.name }))]}
                value={part.over ?? NOT_OVER}
                onChange={(over) => update(id, { over: over === NOT_OVER ? null : over })}
              />
            }
          />
        ) : null}
        {/* Its column: moved to the other one, it stands under whatever's above it there. Written over another field's
            words, it has no place of its own: its column and its position are off while it is. */}
        <Setting
          id="part-column"
          label="Column"
          control={<Segmented idPrefix="part-column" label="Column" options={COLUMN_OPTIONS} value={part.column} disabled={above} onChange={(column) => update(id, { column, beside: false })} />}
        />
        {first ? null : (
          <Setting
            id="part-beside"
            label="Position"
            control={<Toggle id="part-beside-on" says={{ on: "Beside the one above", off: "Under the one above" }} on={part.beside} disabled={above} onChange={(beside) => update(id, { beside })} />}
          />
        )}
      </>
    );
  }

  /** The head of the picked thing's panel: its name, what it is, and a way to let it go. */
  const pickedHead = (name: string, kind?: string) => (
    <div className="layout-part-head">
      <h2 id="layout-part-title" className="layout-part-title">
        {name}
        {kind ? <small>{kind}</small> : null}
      </h2>
      <Button id="layout-unpick" className="btn-icon" aria-label="Close" onClick={() => setPicked(null)}>
        <Icon name="close" />
      </Button>
    </div>
  );

  const problem = parsed.success ? null : (parsed.error.issues[0]?.message ?? null);
  const panel = (
    <FloatPanel
      id="layout-panel"
      label="Layout"
      title={
        <span className="layout-part-title">
          {type.name}
          <small>Card type</small>
        </span>
      }
      tools={
        <>
          <Button id="layout-undo" className="btn-icon" aria-label="Undo" disabled={!history.canUndo} onClick={undo}>
            <Icon name="undo" />
          </Button>
          <Button id="layout-redo" className="btn-icon" aria-label="Redo" disabled={!history.canRedo} onClick={redo}>
            <Icon name="redo" />
          </Button>
        </>
      }
    >
      {/* The type's own settings, saved with the layout. */}
      <section className="panel layout-panel" aria-label="Card type">
        {/* The clip a review's full screen fills the screen with (the Full screen key's): the one picked, else the first
            in the card's order; greyed while no part is a clip in the Player style. */}
        <Setting
          id="layout-staged"
          label="Full screen shows"
          why={staging.length === 0 ? "No clip in the Player style" : undefined}
          control={
            <Dropdown
              id="layout-staged-choice"
              label="Full screen shows"
              anchored
              options={staging.map((id) => ({ id, label: fields.get(id)?.name ?? "" }))}
              value={staging[0] ?? ""}
              placeholder="None"
              disabled={staging.length === 0}
              onChange={(id) => change(draft.map((p) => ({ ...p, staged: p.fieldId === id })))}
            />
          }
        />
      </section>
      {/* How the card is previewed here, nothing of the type's: the card it's shown on, and which side of it shows, in
          step with the card's own buttons. */}
      <section className="panel layout-panel" aria-labelledby="layout-preview-title">
        <h2 id="layout-preview-title" className="layout-part-title">
          Preview
        </h2>
        <Setting id="layout-sample-row" label="Previewed for" control={<Dropdown id="layout-sample" label="Card previewed" anchored options={sampleOptions} value={sampleId} onChange={setSampleId} />} />
        <Setting id="layout-side-row" label="Side" control={<Segmented idPrefix="layout-side" label="Side of the card" options={SIDES} value={side} onChange={showSide} />} />
      </section>
      {pickedMark ? (
        // A corner mark isn't a field: its few choices are its own, the same on both sides, its corner dragged to on the
        // card or picked here; the stage tag has a size too.
        <section className="panel layout-panel" aria-labelledby="layout-part-title">
          {pickedHead(CORNER_MARK_NAMES[pickedMark])}
          <Setting
            id={`${pickedMark}-shown`}
            label="Shown"
            control={<Toggle id={`${pickedMark}-shown-on`} says={{ on: "Shown", off: "Hidden" }} on={marks[pickedMark].shown} onChange={(shown) => changeMark(pickedMark, { shown })} />}
          />
          {pickedMark === "tag" ? (
            <Setting id="tag-size" label="Size" control={<Segmented idPrefix="tag-size" label="Size" options={SIZE_OPTIONS} value={tag.size} onChange={(size) => changeTag({ size })} />} />
          ) : null}
          <Setting
            id={`${pickedMark}-corner`}
            label="Corner"
            control={<Dropdown id={`${pickedMark}-corner-choice`} label="Corner" anchored options={CORNER_OPTIONS} value={marks[pickedMark].corner} onChange={(corner) => changeMark(pickedMark, { corner })} />}
          />
        </section>
      ) : examplesPicked && examplesHere ? (
        // The example arrows aren't a field: where they stand in their column is dragged on the card, their column picked
        // here; they show where the example does.
        <section className="panel layout-panel" aria-labelledby="layout-part-title">
          {pickedHead(EXAMPLE_ARROWS)}
          <Setting
            id="examples-column"
            label="Column"
            control={
              <Segmented
                idPrefix="examples-column"
                label="Column"
                options={COLUMN_OPTIONS}
                value={examplesHere.column}
                onChange={(column) => history.change({ ...history.present, examples: examplesToColumn(draft, type.fields, examples, column) })}
              />
            }
          />
        </section>
      ) : part && field ? (
        <section className="panel layout-panel" aria-labelledby="layout-part-title">
          {pickedHead(field.name, FIELD_KINDS[field.kind].name)}
          {choices(part, field)}
        </section>
      ) : (
        // Nothing picked: what isn't on the side shown, each brought onto it by a press, and the stage tag.
        <section className="panel layout-panel" aria-label={`Not on the ${side}`}>
          {away.length > 0 ? (
            <div className="layout-away">
              <span className="layout-note">Not on the {side}</span>
              {away.map((p) => (
                <Button
                  key={p.fieldId}
                  variant="chip"
                  className="layout-away-chip"
                  onClick={() => {
                    update(p.fieldId, side === "front" ? { front: "show" } : { back: "show" });
                    setPicked(p.fieldId);
                  }}
                >
                  <Icon name="add" />
                  {fields.get(p.fieldId)?.name}
                </Button>
              ))}
            </div>
          ) : null}
          {CORNER_MARK_IDS.map((id) => (
            <Setting
              key={id}
              id={`${id}-shown`}
              label={CORNER_MARK_NAMES[id]}
              control={<Toggle id={`${id}-shown-on`} says={{ on: "Shown", off: "Hidden" }} on={marks[id].shown} onChange={(shown) => changeMark(id, { shown })} />}
            />
          ))}
        </section>
      )}
      {problem || saveFailure ? (
        <p className="form-failure" role="alert">
          {problem ?? saveFailure}
        </p>
      ) : null}
    </FloatPanel>
  );

  return (
    <ReviewScreen
      place={place}
      stage={stage}
      staging={stagedOrder(draft, type.fields)}
      counts={<ReviewCounts counts={counted ? { ...counted, now: sample ? kindOf(sample.card) : null } : null} />}
      busy={false}
      binds={binds}
      onStepBack={stepBack}
      canStepBack={canStepBack}
      canUndo={false}
      chart={{ open: false }}
      // Greyed, as Undo and Chart are: a card looked at isn't flagged from here.
      flag={{ on: (sample?.card.flaggedAt ?? null) !== null, busy: false }}
      failure={null}
      card={
        <ReviewCard
          // A card shown afresh, as a review would: nothing opened, nothing played.
          key={sampleId}
          type={type}
          layout={draft}
          values={sample ? valuesWithExample(type, sample.card, exampleId) : {}}
          // What Panki AI wrote on the card previewed, marked as a review marks it, for the example shown.
          sources={sample ? sourcesWithExample(type, sample.card, exampleId) : {}}
          files={sample?.card.files}
          cues={sample?.card.cues}
          srsType={ladder}
          place={sample?.card.place ?? NEW_PLACE}
          revealed={side === "back"}
          blur={review.blurFront ? { blurred: blur.blurred, bind: binds.blur, onToggle: blur.toggle } : undefined}
          srcOf={sample ? api.mediaUrl : undefined}
          waveOf={waveOf}
          subtitleStyle={subtitleStyle}
          picturesOf={api.videoPictures}
          tag={tag}
          spark={spark}
          flag={flag}
          examples={examples}
          // The arrows wherever the type has them, so they can be placed whatever the card previewed holds.
          examplePager={
            examplesHere ? (
              <ExampleArrows
                at={browsed % exampleIds.length}
                count={exampleIds.length}
                prev={binds.examplePrev}
                next={binds.exampleNext}
                onStep={(by) => setBrowsed((at) => (at + by + exampleIds.length) % exampleIds.length)}
              />
            ) : null
          }
          flagged={(sample?.card.flaggedAt ?? null) !== null}
          autoplay
          shortcuts={binds.media.map((bind) => shortcutOf(bind, binds))}
          restarts={binds.restart.map((bind) => restartOf(bind, binds))}
          screenKey={shortcutOf(binds.fullScreen, binds)}
          hint={false}
          keys={false}
          edit={{
            picked: part?.fieldId ?? null,
            onPick: setPicked,
            order: { main: mainOrder, side: sideOrder },
            markPicked: pickedMark,
            onPickMark: (id) => setPicked(markPicked(id)),
            examplesPicked,
            onPickExamples: () => setPicked(EXAMPLES_SLOT),
            onMoveMark: (id, corner) => changeMark(id, { corner }),
          }}
        />
      }
      buttons={
        answersBy ? (
          <ReviewButtons
            srsType={answersBy}
            place={sample?.card.place ?? NEW_PLACE}
            revealed={side === "back"}
            binds={binds}
            busy={false}
            // Greyed: a card looked at gives no answer.
            onShow={showNext}
          />
        ) : side === "back" ? null : (
          <div className="review-actions">
            <ShowButton bind={binds.reveal} onPress={showNext} />
          </div>
        )
      }
    >
      {panel}
    </ReviewScreen>
  );
}
