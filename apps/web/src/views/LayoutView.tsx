import { useEffect, useMemo, useRef, useState } from "react";
import {
  CardLayout,
  NEW_PLACE,
  holdsLink,
  holdsWords,
  isTyped,
  movePart,
  partsOn,
  type Card,
  type CardField,
  type CardSide,
  type CardType,
  type Deck,
  type LayoutPart,
  type SrsType,
  type StageTag,
  type SubtitleStyle,
} from "@panki/contracts";
import { api } from "../api";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { Icon } from "../components/Icon";
import { ReviewCard } from "../components/ReviewCard";
import { Segmented } from "../components/Segmented";
import { Setting } from "../components/Setting";
import { Toggle } from "../components/Toggle";
import { FIELD_KINDS } from "../fieldKinds";
import { useDragOrder } from "../hooks/useDragOrder";
import { useUndoable } from "../hooks/useUndoable";
import { shortcutOf, useKeyBinds } from "../keys";
import { LOOK_OPTIONS, PLAY_OPTIONS, SHOW_OPTIONS, SIZE_OPTIONS, TONE_OPTIONS } from "../layoutKinds";
import type { UnsavedGuard } from "../unsaved";
import { waveOf } from "../waveform";
import type { SaveStatus } from "./SrsTypeView";

const SIDES: readonly { id: CardSide; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
];
/** Laying the card out, or using it as a review would. */
const MODES: readonly { id: "edit" | "preview"; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "preview", label: "Preview" },
];
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

/** What's laid out here: every field's part, and the stage tag. */
type Laid = { parts: LayoutPart[]; tag: StageTag };

type Props = {
  /** The card type as it's saved. */
  type: CardType;
  /** Every deck: the ones of this type lend their newest cards to show on it. */
  decks: readonly Deck[];
  srsTypes: readonly SrsType[];
  onSave: (layout: CardLayout, tag: StageTag) => Promise<CardType>;
  onStatus: (status: SaveStatus) => void;
  /** Says whether there's unsaved work here, so leaving the screen can ask first (null when there's none). */
  onGuard: (guard: UnsavedGuard | null) => void;
  /** How a clip's subtitles look: the account's. */
  subtitleStyle: SubtitleStyle;
};

/**
 * How a card type's cards look in a review, laid out on the card itself (the owner's pick, B of the card layout page,
 * 2026-10-15): the card as a review shows it, front or back, with one of the type's own cards on it; a part pressed
 * on it is picked and its choices stand beside it (under it on a phone); a part is moved by its grip; what isn't on
 * the side shown waits under the card. (A list of every field under it all was taken out at the owner's word the same
 * day: "useless".) "Preview" makes it a review card for a moment: pressed to turn, spoilers to open, sounds that play
 * by themselves. Saved by the header's Save, as the SRS editor is; leaving unsaved asks first, and Ctrl+Z undoes.
 */
export function LayoutView({ type, decks, srsTypes, onSave, onStatus, onGuard, subtitleStyle }: Props) {
  // The fields' parts and the stage tag are laid out together, so one Undo steps back through both.
  const history = useUndoable<Laid>({ parts: type.layout, tag: type.tag });
  const { undo, redo } = history;
  const draft = history.present.parts;
  const tag = history.present.tag;
  const change = (parts: LayoutPart[]) => history.change({ ...history.present, parts });
  const changeTag = (patch: Partial<StageTag>) => history.change({ ...history.present, tag: { ...tag, ...patch } });
  const [saved, setSaved] = useState<Laid>({ parts: type.layout, tag: type.tag });
  const [saving, setSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [side, setSide] = useState<CardSide>("front");
  const [trying, setTrying] = useState(false);
  const mediaKeys = useKeyBinds().media.map(shortcutOf);
  const [picked, setPicked] = useState<string | null>(type.layout[0]?.fieldId ?? null);
  const [samples, setSamples] = useState<{ card: Card; deck: Deck }[]>([]);
  const [sampleId, setSampleId] = useState<string>(NO_SAMPLE);
  const fields = useMemo(() => new Map(type.fields.map((f) => [f.id, f])), [type.fields]);

  // The type's own newest cards, from every deck that uses it, to show on it; the newest is shown to begin with.
  const deckKey = decks
    .filter((d) => d.typeId === type.id)
    .map((d) => d.id)
    .join(" ");
  useEffect(() => {
    const using = decks.filter((d) => d.typeId === type.id);
    if (using.length === 0) return;
    let alive = true;
    void Promise.all(using.map((deck) => api.listCards(deck.id).then((cards) => cards.map((card) => ({ card, deck })))))
      .then((lists) => {
        if (!alive) return;
        const newest = lists
          .flat()
          .sort((a, b) => b.card.createdAt - a.card.createdAt)
          .slice(0, SAMPLES_MAX);
        setSamples(newest);
        setSampleId((was) => (was === NO_SAMPLE ? (newest[0]?.card.id ?? NO_SAMPLE) : was));
      })
      // Without its cards the card shows each field's name: nothing here needs them.
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
      const result = await onSave(parsed.data, tag);
      setSaved({ parts: result.layout, tag: result.tag });
      // What the API keeps is the layout filled out against the fields; it takes the draft's place without a step.
      history.amend(() => ({ parts: result.layout, tag: result.tag }));
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
  // Moved on the card, among the parts on the side shown: one order for both sides.
  const onSide = partsOn(draft, side);
  const cardOrder = useDragOrder(onSide.length, (from, to) => {
    const [a, b] = [onSide[from], onSide[to]];
    if (a && b) change(movePart(draft, a.fieldId, b.fieldId));
  });

  const sample = samples.find((s) => s.card.id === sampleId) ?? null;
  const ladder = (sample && srsTypes.find((t) => t.id === sample.deck.srsTypeId)) ?? srsTypes[0] ?? NO_LADDER;
  /** What a card is called in the list of cards to show: its first words. */
  const nameField = type.fields.find((f) => holdsWords(f.kind));
  const sampleOptions = [
    { id: NO_SAMPLE, label: "Field names" },
    ...samples.map(({ card, deck }) => ({ id: card.id, label: (nameField && card.values[nameField.id]?.trim()) || "A card with no words", note: deck.name })),
  ];
  const away = draft.filter((p) => p[side] === "hide");

  const tagPicked = picked === TAG_PICKED;
  const part = tagPicked ? undefined : (draft.find((p) => p.fieldId === picked) ?? draft[0]);
  const field = part ? fields.get(part.fieldId) : undefined;

  /** The picked part's choices: its two sides, then what its kind can change, then its place. */
  function choices(part: LayoutPart, field: CardField) {
    const id = part.fieldId;
    const first = draft[0]?.fieldId === id;
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
        control={<Dropdown id="part-mark-choice" label="Highlight" options={[{ id: NOT_OVER, label: "None" }, ...others]} value={part.mark ?? NOT_OVER} onChange={(mark) => update(id, { mark: mark === NOT_OVER ? null : mark })} />}
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
        {media ? (
          <Setting
            id="part-look"
            label="Player style"
            control={<Dropdown id="part-look-choice" label="Player style" options={LOOK_OPTIONS} value={part.look} onChange={(look) => update(id, { look })} />}
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
        {pictured && part.subtitles ? highlight : null}
        {media ? (
          <Setting
            id="part-auto"
            label="Plays by itself"
            control={<Dropdown id="part-auto-when" label="Plays by itself" options={PLAY_OPTIONS} value={part.plays} onChange={(plays) => update(id, { plays })} />}
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
                options={[{ id: NOT_OVER, label: "None" }, ...overable.map((f) => ({ id: f.id, label: f.name }))]}
                value={part.over ?? NOT_OVER}
                onChange={(over) => update(id, { over: over === NOT_OVER ? null : over })}
              />
            }
          />
        ) : null}
        {/* Written over another field's words, it has no place of its own: its position is off while it is. */}
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

  const problem = parsed.success ? null : (parsed.error.issues[0]?.message ?? null);
  return (
    <div className="layout-editor">
      <section className="layout-stage" aria-label="The card">
        <div className="layout-tools">
          {/* Previewing, the card starts on its front as a review does, and is turned by pressing it, not from here. */}
          <Segmented idPrefix="layout-side" label="Side of the card" options={SIDES} value={side} onChange={setSide} disabled={trying} />
          <Segmented
            idPrefix="layout-mode"
            label="Mode"
            options={MODES}
            value={trying ? "preview" : "edit"}
            onChange={(mode) => {
              setTrying(mode === "preview");
              if (mode === "preview") setSide("front");
            }}
          />
          <span className="layout-tools-end">
            <Button id="layout-undo" className="btn-icon" aria-label="Undo" disabled={!history.canUndo} onClick={undo}>
              <Icon name="undo" />
            </Button>
            <Button id="layout-redo" className="btn-icon" aria-label="Redo" disabled={!history.canRedo} onClick={redo}>
              <Icon name="redo" />
            </Button>
          </span>
        </div>
        <ReviewCard
          // A card shown afresh, as a review would: nothing opened, nothing played.
          key={`${sampleId}:${trying ? "try" : "edit"}`}
          type={type}
          layout={draft}
          values={sample?.card.values ?? {}}
          files={sample?.card.files}
          cues={sample?.card.cues}
          srsType={ladder}
          place={sample?.card.place ?? NEW_PLACE}
          revealed={side === "back"}
          onPress={() => {
            if (trying) setSide((now) => (now === "front" ? "back" : "front"));
          }}
          srcOf={sample ? api.mediaUrl : undefined}
          waveOf={waveOf}
          subtitleStyle={subtitleStyle}
          picturesOf={api.videoPictures}
          tag={tag}
          autoplay={trying}
          // Tried as a review, its sounds and clips answer to their keys as a review's do.
          shortcuts={trying ? mediaKeys : undefined}
          {...(trying
            ? {}
            : {
                edit: {
                  picked: tagPicked ? null : (part?.fieldId ?? null),
                  onPick: setPicked,
                  order: cardOrder,
                  tagPicked,
                  onPickTag: () => setPicked(TAG_PICKED),
                  onMoveTag: (corner) => changeTag({ corner }),
                },
              })}
        />
        {trying ? (
          <p className="layout-note">Press the card to turn it, a spoiler to open it.</p>
        ) : away.length > 0 ? (
          <div className="layout-away" aria-label={`Not on the ${side}`}>
            <span className="layout-note">Not on the {side}:</span>
            {away.map((p) => (
              <Button key={p.fieldId} variant="chip" className="layout-away-chip" aria-pressed={part?.fieldId === p.fieldId} onClick={() => setPicked(p.fieldId)}>
                {fields.get(p.fieldId)?.name}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="layout-sample">
          <span className="layout-note">Previewed for</span>
          <Dropdown id="layout-sample" label="Card previewed" options={sampleOptions} value={sampleId} onChange={setSampleId} />
        </div>
        {problem || saveFailure ? (
          <p className="form-failure" role="alert">
            {problem ?? saveFailure}
          </p>
        ) : null}
      </section>

      {tagPicked ? (
        // The stage tag isn't a field: its few choices are its own, the same on both sides, and its corner is where it's dragged.
        <aside className="panel layout-panel" aria-labelledby="layout-part-title">
          <h2 id="layout-part-title" className="layout-part-title">
            Stage tag
          </h2>
          <Setting id="tag-shown" label="Shown" control={<Toggle id="tag-shown-on" says={{ on: "Shown", off: "Hidden" }} on={tag.shown} onChange={(shown) => changeTag({ shown })} />} />
          <Setting id="tag-size" label="Size" control={<Segmented idPrefix="tag-size" label="Size" options={SIZE_OPTIONS} value={tag.size} onChange={(size) => changeTag({ size })} />} />
        </aside>
      ) : part && field ? (
        <aside className="panel layout-panel" aria-labelledby="layout-part-title">
          <h2 id="layout-part-title" className="layout-part-title">
            {field.name}
            <small>{FIELD_KINDS[field.kind].name}</small>
          </h2>
          {choices(part, field)}
        </aside>
      ) : null}
    </div>
  );
}
