import { useEffect, useMemo, useRef, useState } from "react";
import {
  CardLayout,
  NEW_PLACE,
  holdsLink,
  holdsWords,
  isTyped,
  mainAnswers,
  movePart,
  offered,
  partsOnIn,
  type Card,
  type CardField,
  type CardSide,
  type CardType,
  type Deck,
  type LayoutPart,
  type ListenFirst,
  type SrsType,
  type StageTag,
  type SubtitleStyle,
} from "@panki/contracts";
import { api } from "../api";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { FloatPanel } from "../components/FloatPanel";
import { Icon } from "../components/Icon";
import { ReviewCard, listensFirst } from "../components/ReviewCard";
import { ReviewButtons, ReviewCounts, ReviewScreen } from "../components/ReviewScreen";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { ShowButton } from "../components/ShowButton";
import { Toggle } from "../components/Toggle";
import { FIELD_KINDS } from "../fieldKinds";
import { useDragOrder } from "../hooks/useDragOrder";
import { keepDouble, useHold } from "../hooks/useHold";
import { useHoldButton, type HoldStage } from "../hooks/useHoldButton";
import { useScreenStage } from "../hooks/useScreenStage";
import { useUndoable } from "../hooks/useUndoable";
import { doubleKeys, keyIn, keyOf, pressedIn, restartOf, shortcutOf, useKeyBinds, useKeybindsEnabled } from "../keys";
import { COLUMN_OPTIONS, LISTEN_OPTIONS, LISTEN_SUBTITLE_OPTIONS, LOOK_OPTIONS, NEVER_BY_ITSELF, PLAY_OPTIONS, SHOW_ON_PLAY_OPTIONS, SHOW_OPTIONS, SIZE_OPTIONS, TONE_OPTIONS } from "../layoutKinds";
import { buildQueue, kindOf, startLine, togoOf } from "../reviewLine";
import { rememberShape } from "../skeletonMemory";
import type { UnsavedGuard } from "../unsaved";
import { waveOf } from "../waveform";
import type { SaveStatus } from "./SrsTypeView";

/** What's shown of the card: its Listen phase (while the type has Listen first on), its front, or its back. */
type Face = "listen" | CardSide;
const SIDES: readonly { id: CardSide; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
];
const FACES: readonly { id: Face; label: string }[] = [{ id: "listen", label: "Listen" }, ...SIDES];
/** How many of the type's newest cards can be shown on it while it's laid out. */
const SAMPLES_MAX = 30;
/** Shown with no card: each field's name where it stands. */
const NO_SAMPLE = "";
/** A part written over no other's words, or lighting none in its own. */
const NOT_OVER = "";
/** The pill's ladder when no deck's is to hand: a new card says "New" whatever its type is. */
const NO_LADDER: Pick<SrsType, "stages" | "after" | "burnedName"> = { stages: [], after: "burn", burnedName: "" };
/** What's picked when it's the stage tag: no field's id is this. */
const TAG_PICKED = "stage-tag";

/** What's laid out here: every field's part, the stage tag, and Listen first. */
type Laid = { parts: LayoutPart[]; tag: StageTag; listen: ListenFirst };

type Props = {
  /** The card type as it's saved. */
  type: CardType;
  /** Every deck: the ones of this type lend their newest cards to show on it, and their counts to the line over it. */
  decks: readonly Deck[];
  srsTypes: readonly SrsType[];
  onSave: (layout: CardLayout, tag: StageTag, listen: ListenFirst) => Promise<CardType>;
  onStatus: (status: SaveStatus) => void;
  /** Says whether there's unsaved work here, so leaving the screen can ask first (null when there's none). */
  onGuard: (guard: UnsavedGuard | null) => void;
  /** How a clip's subtitles look: the account's. */
  subtitleStyle: SubtitleStyle;
};

/**
 * How a card type's cards look in a review, laid out on the card itself in the review's own screen (`ReviewScreen`):
 * one of the type's own cards on it, its deck's counts over it, played, opened and turned as a review does (Done
 * listening, Show back of card, Hide back of card, the Hold button, their keys). A press on a part picks it, a press on
 * its player working the player as well; a part is moved by its grip. Its choices stand in a panel over the screen
 * (`FloatPanel`), with which side shows, Listen first and the card it's shown on. Saved by the header's Save, as the
 * SRS editor is; leaving unsaved asks first, and Ctrl+Z undoes.
 */
export function LayoutView({ type, decks, srsTypes, onSave, onStatus, onGuard, subtitleStyle }: Props) {
  // The fields' parts, the stage tag and Listen first are laid out together, so one Undo steps back through all three.
  const history = useUndoable<Laid>({ parts: type.layout, tag: type.tag, listen: type.listen });
  const { undo, redo } = history;
  const draft = history.present.parts;
  const tag = history.present.tag;
  const listen = history.present.listen;
  const change = (parts: LayoutPart[]) => history.change({ ...history.present, parts });
  const changeTag = (patch: Partial<StageTag>) => history.change({ ...history.present, tag: { ...tag, ...patch } });
  const changeListen = (patch: Partial<ListenFirst>) => history.change({ ...history.present, listen: { ...listen, ...patch } });
  const [saved, setSaved] = useState<Laid>({ parts: type.layout, tag: type.tag, listen: type.listen });
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [chosenFace, setFace] = useState<Face>("front");
  // The Listen phase is there only while Listen first is on; switched off on it, the front shows.
  const face: Face = chosenFace === "listen" && !listen.on ? "front" : chosenFace;
  /** The side whose parts are shown and moved: the Listen phase is the front's, blurred. */
  const side: CardSide = face === "listen" ? "front" : face;
  const binds = useKeyBinds();
  const keysOn = useKeybindsEnabled();
  const hold = useHold();
  const [picked, setPicked] = useState<string | null>(null);
  const [samples, setSamples] = useState<{ card: Card; deck: Deck }[]>([]);
  /** Every card of each deck of this type, by the deck's id: what a review of it would count. */
  const [deckCards, setDeckCards] = useState<ReadonlyMap<string, readonly Card[]>>(new Map());
  const [sampleId, setSampleId] = useState<string>(NO_SAMPLE);
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
      const result = await onSave(parsed.data, tag, listen);
      setSaved({ parts: result.layout, tag: result.tag, listen: result.listen });
      // What the API keeps is the layout filled out against the fields; it takes the draft's place without a step.
      history.amend(() => ({ parts: result.layout, tag: result.tag, listen: result.listen }));
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
  // Moved on the card, among the parts on the side shown in the same column: one order for both sides. Which column a
  // part stands in is its own setting (Column), never a drag's.
  const inMain = partsOnIn(draft, side, "main");
  const inSide = partsOnIn(draft, side, "side");
  const moveWithin = (parts: readonly LayoutPart[]) => (from: number, to: number) => {
    const [a, b] = [parts[from], parts[to]];
    if (a && b) change(movePart(draft, a.fieldId, b.fieldId));
  };
  const mainOrder = useDragOrder(inMain.length, moveWithin(inMain));
  const sideOrder = useDragOrder(inSide.length, moveWithin(inSide));

  const sample = samples.find((s) => s.card.id === sampleId) ?? null;
  /** Where the card opens in a review, as laid out now: its Listen phase when there's something on it to hear, else its front. */
  const opening: Face = sample && listensFirst(type, sample.card.values, sample.card.files, listen, draft) ? "listen" : "front";
  /** The card on to its next: out of its Listen phase, or turned to its back. */
  const showNext = () => setFace(face === "listen" ? "front" : "back");
  /** The Hold button, while it's on (Settings → Keybinds): here it goes as far as the back, a card looked at giving no answer. */
  const chainOn = binds.holdChain.on;
  const holdStages: HoldStage[] = [
    ...(opening === "listen" ? [{ label: "Done listening", ms: binds.holdChain.listenMs, done: () => setFace("front") }] : []),
    { label: "Show back of card", ms: binds.holdChain.backMs, done: () => setFace("back") },
  ];
  const chain = useHoldButton({
    stages: holdStages,
    at: face === "listen" ? 0 : face === "front" ? holdStages.length - 1 : holdStages.length,
    rest: "Back to start",
    back: () => setFace(opening),
    showing: sampleId,
    bind: binds.holdButton,
    where: () => place.current?.querySelector<HTMLElement>("[data-hold='chain']") ?? null,
  });

  // The review's own keys turn the card here as they do there: Done listening's, Show back of card's and Hide back of
  // card's, held as long as each is set to be, Enter, and the Hold button's with Back to start. A key pressed in the
  // panel is the panel's.
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
      const resetting = chainOn ? keyIn(binds.holdReset, key) : null;
      let reset = false;
      if (resetting) {
        e.preventDefault();
        if (!e.repeat)
          hold.begin(e, button("chain"), resetting.holdMs, () => {
            reset = true;
            setFace(opening);
          });
      }
      if (chainOn && keyIn(binds.holdButton, key)) {
        e.preventDefault();
        if (!reset) chain.keyDown(e, key);
        return;
      }
      if (reset) return;
      if (keysOn && key === "Enter") {
        if (e.target instanceof HTMLButtonElement || face === "back") return;
        e.preventDefault();
        showNext();
        return;
      }
      const hiding = face === "back" ? keyIn(binds.hide, key) : null;
      if (hiding) {
        e.preventDefault();
        if (!e.repeat) hold.begin(e, button("hide"), hiding.holdMs, () => setFace("front"));
        return;
      }
      const showing = face === "back" ? null : keyIn(face === "listen" ? binds.showCard : binds.reveal, key);
      if (showing) {
        e.preventDefault();
        if (!e.repeat) hold.begin(e, button("reveal"), showing.holdMs, showNext);
      }
    }
    function onUp(e: KeyboardEvent) {
      hold.release(e.key);
      chain.keyUp(e);
      if (own(e)) return;
      const turning = [face === "listen" ? binds.showCard : binds.reveal, ...(chainOn ? [binds.holdButton] : [])];
      if (turning.some((bind) => pressedIn(e, bind))) e.preventDefault();
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
    const line = startLine(buildQueue(cards, countDeck), countDeck.settings.pool);
    const best = mainAnswers(by.answers).at(-1)?.id ?? "";
    return { settings: countDeck.settings, togo: togoOf([...line.active, ...line.waiting], new Map(cards.map((c) => [c.id, c])), by, best), line };
  }, [countDeck, deckCards, srsTypes]);

  /** What a card is called in the list of cards to show: its first words. */
  const nameField = type.fields.find((f) => holdsWords(f.kind));
  const sampleOptions = [
    { id: NO_SAMPLE, label: "Field names" },
    ...samples.map(({ card, deck }) => ({ id: card.id, label: (nameField && card.values[nameField.id]?.trim()) || "A card with no words", note: deck.name })),
  ];
  const away = draft.filter((p) => p[side] === "hide");
  // What this tab's skeleton draws next time on this device (`Skeleton`'s `layout`): the chips of what isn't on the
  // front in the panel, and whether the answers set apart hold a row under the card.
  const awayOnFront = side === "front" ? away.length : null;
  const asidesHeld = answersBy !== undefined && answersBy.answers.some((a) => a.aside && offered(answersBy, sample?.card.place ?? NEW_PLACE, a.id));
  useEffect(() => {
    if (awayOnFront !== null) rememberShape(`layout-away:${type.id}`, awayOnFront);
  }, [awayOnFront, type.id]);
  useEffect(() => rememberShape(`layout-asides:${type.id}`, asidesHeld ? 1 : 0), [asidesHeld, type.id]);

  const tagPicked = picked === TAG_PICKED;
  const part = tagPicked ? undefined : draft.find((p) => p.fieldId === picked);
  const field = part ? fields.get(part.fieldId) : undefined;
  /** The one sound or clip that shows the card by itself, if one does. */
  const shower = draft.find((p) => p.showOnPlay !== null);

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
        {/* What the Listen phase does with it: there with the type's Listen first, greyed while that's off. */}
        <Setting
          id="part-listen"
          label="While listening"
          control={<Segmented idPrefix="part-listen" label="While listening" options={LISTEN_OPTIONS} value={part.listen} disabled={!listen.on} onChange={(listening) => update(id, { listen: listening })} />}
        />
        {/*
          Which play of this sound or clip shows the card, one of them on a card at most: while
          another does, it's greyed here and says which. Greyed too while it's hidden in the Listen phase, which never plays it.
        */}
        {media ? (
          <Setting
            id="part-show-on-play"
            label="Ends listening"
            why={shower && shower.fieldId !== id ? `${fields.get(shower.fieldId)?.name ?? "Another field"} already ends listening.` : undefined}
            control={
              <Dropdown
                id="part-show-on-play-choice"
                label="Ends listening"
                anchored
                options={SHOW_ON_PLAY_OPTIONS}
                value={part.showOnPlay ?? NEVER_BY_ITSELF}
                disabled={!listen.on || part.listen === "hide" || (shower !== undefined && shower.fieldId !== id)}
                onChange={(play) => update(id, { showOnPlay: play === NEVER_BY_ITSELF ? null : play })}
              />
            }
          />
        ) : null}
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
        {/* The subtitles' own While listening, right under their switch so it reads as theirs, greyed while they're hidden or Listen first is off. */}
        {pictured ? (
          <Setting
            id="part-listen-subtitles"
            label="While listening"
            control={
              <Segmented
                idPrefix="part-listen-subtitles"
                label="Subtitles while listening"
                options={LISTEN_SUBTITLE_OPTIONS}
                value={part.listenSubtitles}
                disabled={!listen.on || !part.subtitles}
                wrap
                onChange={(listenSubtitles) => update(id, { listenSubtitles })}
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
      {/* The type's own: Listen first, the card it's shown on, and which side of it shows, in step with the card's own buttons. */}
      <section className="panel layout-panel" aria-label="Card type">
        <Setting id="listen-first" label="Listen first" control={<Toggle id="listen-first-on" says={{ on: "On", off: "Off" }} on={listen.on} onChange={(on) => changeListen({ on })} />} />
        <Setting id="layout-sample-row" label="Previewed for" control={<Dropdown id="layout-sample" label="Card previewed" anchored options={sampleOptions} value={sampleId} onChange={setSampleId} />} />
        <Setting id="layout-side-row" label="Side" control={<Segmented idPrefix="layout-side" label="Side of the card" options={listen.on ? FACES : SIDES} value={face} onChange={setFace} />} />
      </section>
      {tagPicked ? (
        // The stage tag isn't a field: its few choices are its own, the same on both sides, and its corner is where it's dragged.
        <section className="panel layout-panel" aria-labelledby="layout-part-title">
          {pickedHead("Stage tag")}
          <Setting id="tag-shown" label="Shown" control={<Toggle id="tag-shown-on" says={{ on: "Shown", off: "Hidden" }} on={tag.shown} onChange={(shown) => changeTag({ shown })} />} />
          <Setting id="tag-size" label="Size" control={<Segmented idPrefix="tag-size" label="Size" options={SIZE_OPTIONS} value={tag.size} onChange={(size) => changeTag({ size })} />} />
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
          <Setting id="tag-shown" label="Stage tag" control={<Toggle id="tag-shown-on" says={{ on: "Shown", off: "Hidden" }} on={tag.shown} onChange={(shown) => changeTag({ shown })} />} />
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
      counts={<ReviewCounts counts={counted ? { ...counted, now: sample ? kindOf(sample.card) : null } : null} />}
      revealed={face === "back"}
      busy={false}
      binds={binds}
      onHide={() => setFace("front")}
      canUndo={false}
      chart={{ open: false }}
      failure={null}
      hold={chainOn ? chain.view : null}
      card={
        <ReviewCard
          // A card shown afresh, as a review would: nothing opened, nothing played.
          key={sampleId}
          type={type}
          layout={draft}
          values={sample?.card.values ?? {}}
          // What Panki AI wrote on the card previewed, marked as a review marks it: its own example's values are these.
          sources={sample?.card.sources ?? {}}
          files={sample?.card.files}
          cues={sample?.card.cues}
          srsType={ladder}
          place={sample?.card.place ?? NEW_PLACE}
          revealed={face === "back"}
          listening={face === "listen"}
          // It goes on to its front as its sound or clip begins the play set to show it, as in a review.
          onListened={() => {
            if (face === "listen") setFace("front");
          }}
          srcOf={sample ? api.mediaUrl : undefined}
          waveOf={waveOf}
          subtitleStyle={subtitleStyle}
          picturesOf={api.videoPictures}
          tag={tag}
          autoplay
          shortcuts={binds.media.map((bind) => shortcutOf(bind, binds))}
          restarts={binds.restart.map((bind) => restartOf(bind, binds))}
          screenKey={shortcutOf(binds.fullScreen, binds)}
          hint={false}
          keys={false}
          edit={{
            picked: tagPicked ? null : (part?.fieldId ?? null),
            onPick: setPicked,
            order: { main: mainOrder, side: sideOrder },
            tagPicked,
            onPickTag: () => setPicked(TAG_PICKED),
            onMoveTag: (corner) => changeTag({ corner }),
          }}
        />
      }
      buttons={
        answersBy ? (
          <ReviewButtons srsType={answersBy} place={sample?.card.place ?? NEW_PLACE} revealed={face === "back"} listening={face === "listen"} binds={binds} busy={false} onShow={showNext} />
        ) : face === "back" ? null : (
          <div className="review-actions">
            <ShowButton listening={face === "listen"} bind={face === "listen" ? binds.showCard : binds.reveal} onPress={showNext} />
          </div>
        )
      }
    >
      {panel}
    </ReviewScreen>
  );
}
