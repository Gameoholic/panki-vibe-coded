import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@web/components/Button";
import { Dropdown } from "@web/components/Dropdown";
import { Icon } from "@web/components/Icon";
import { Segmented } from "@web/components/Segmented";
import { Setting } from "@web/components/Setting";
import { useDragOrder } from "@web/hooks/useDragOrder";
import { useUndoable } from "@web/hooks/useUndoable";
import { SAVE_WORDS, type SaveState } from "@web/unsaved";
import { listWords } from "@web/words";
import { createLooker, listenOnPage, type Looker, type View } from "../capture/look";
import type { DataKind } from "@panki/contracts";
import { DATA_KINDS, kindsIn } from "../dataKinds";
import { shownName, type DictionaryRecord } from "../dictionary/format";
import type { Found } from "../dictionary/found";
import { lookUp } from "../dictionary/lookup";
import { listDictionaries } from "../dictionary/store";
import type { LookKey } from "../lookSettings";
import { FREQUENCY_OPTIONS, MEANINGS_ABOUT, MEANINGS_NAME, MEANINGS_OPTIONS, PART_ABOUT, PART_NAMES, READING_OPTIONS, SHOWN_OR_HIDDEN, SHOW_OPTIONS, TAG_OPTIONS, isNamedPart } from "../popupKinds";
import { dictionaryOf, moveBodyPart, popupLayoutOf, withMeanings, type BodyPart, type PartShow, type PopupLayout } from "../popupLayout";
import { writeStore } from "../storage";
import { Lookup, LookupBody } from "../ui/Lookup";
import { tintOf } from "../capture/known";
import { paintCss, type MarkPaint } from "../seekLook";
import { KindChips } from "./DataKinds";
import { pointWords } from "./Dictionary";
import { EXAMPLE_CARDS, IN_DECKS } from "./examples";

/** What this says when something's wrong. One home. */
const MESSAGES = {
  unread: "The dictionaries couldn't be read.",
  unsaved: "The layout couldn't be saved.",
};
/**
 * Two sentences to hold the key over, as on any page, to try the popup as it's laid out right now (the owner,
 * 2026-10-16, in place of a field to type a word in): words with endings on them, words with shorter words inside, a
 * word read more than one way.
 */
const TRY_TEXT = "昨日、駅の近くで新しい喫茶店を見つけました。友達と一緒に入ってみたら、ケーキがとても美味しかったです。";
/** The sentences either side of the word that stands for one already in the decks (`examples.ts`), tinted as Highlight globally tints a page while it's on. */
const [tryBefore, tryAfter] = ((at) => [TRY_TEXT.slice(0, at), TRY_TEXT.slice(at + IN_DECKS.words.length)])(TRY_TEXT.indexOf(IN_DECKS.words));
/** On the popup being laid out until a word of those sentences is pointed at: one with endings on it first, so the endings have something to show. */
const SAMPLES = ["見つけました", "入ってみたら", "喫茶店", "昨日"];
/** Laying the popup out, or using it as a page would. */
const MODES: readonly { id: "edit" | "preview"; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "preview", label: "Preview" },
];
/** The parts that stand in places of their own, each shown or hidden by the layout's own key. */
type Fixed = "split" | "pitch" | "add" | "cards" | "others";
const FIXED: readonly Fixed[] = ["split", "pitch", "add", "cards", "others"];

function fixedPatch(part: Fixed, show: PartShow): Partial<PopupLayout> {
  switch (part) {
    case "split":
      return { split: show };
    case "pitch":
      return { pitch: show };
    case "add":
      return { add: show };
    case "cards":
      return { cards: show };
    case "others":
      return { others: show };
  }
}
const isFixed = (part: string): part is Fixed => (FIXED as readonly string[]).includes(part);

type Props = {
  /** The layout as it was last saved; null when it never was. */
  kept: PopupLayout | null;
  /** The key held to look a word up, as it's set above. */
  lookKey: LookKey;
  /** Changes whenever a dictionary is imported, removed, switched or moved on this page: they're read again. */
  dictionariesChanged: number;
  /** Words that are in your decks' Highlight globally and its colour, as set on this tab: the example word is tinted by them. */
  known: { on: boolean; colour: MarkPaint };
  onSaved: () => void;
};

/**
 * The popup's layout, laid out on the popup itself (the owner's pick, C of the popup page, 2026-10-16), as a card
 * type's Layout tab is on the card: a word looked up in the dictionaries here, drawn as the popup draws it; a part
 * pressed is picked and its choices stand beside it; what's under the word is moved by its grip; what's hidden waits
 * under the popup. Above it, two sentences to point at with the key held, which open the real popup as it's laid out
 * now, saved or not, and put the word pointed at on the one being laid out when it closes. Preview uses it as a page would. Saved by
 * Save, beside the words that say whether there's anything to save; leaving the page unsaved asks first, and Ctrl+Z
 * undoes.
 */
export function PopupLayoutPanel({ kept, lookKey, dictionariesChanged, known, onSaved }: Props) {
  const [dictionaries, setDictionaries] = useState<DictionaryRecord[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    listDictionaries().then(
      (list) => {
        if (alive) setDictionaries(list);
      },
      () => {
        if (alive) setFailure(MESSAGES.unread);
      },
    );
    return () => {
      alive = false;
    };
  }, [dictionariesChanged]);

  return (
    <section className="panel popup-layout" aria-labelledby="popup-layout-title">
      {dictionaries ? (
        <Editor kept={kept} lookKey={lookKey} dictionaries={dictionaries} known={known} onSaved={onSaved} />
      ) : (
        <h2 id="popup-layout-title" className="panel-title">
          Pop-up dictionary layout
        </h2>
      )}
      {failure ? (
        <p className="form-failure" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}

function Editor({ kept, lookKey, dictionaries, known, onSaved }: { kept: PopupLayout | null; lookKey: LookKey; dictionaries: readonly DictionaryRecord[]; known: Props["known"]; onSaved: () => void }) {
  const parts = withMeanings(dictionaries);
  const history = useUndoable<PopupLayout>(popupLayoutOf(kept, parts));
  const { change, undo, redo } = history;
  // Filled out again on every draw: a dictionary imported since the editor opened has its place too.
  const layout = popupLayoutOf(history.present, parts);
  const [saved, setSaved] = useState<PopupLayout | null>(kept);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const dirty = JSON.stringify(layout) !== JSON.stringify(popupLayoutOf(saved, parts));
  const state: SaveState = saving ? "saving" : saveFailed ? "failed" : dirty ? "unsaved" : "saved";

  async function save() {
    setSaving(true);
    setSaveFailed(false);
    try {
      await writeStore({ popupLayout: layout });
      setSaved(layout);
      onSaved();
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  // A reload or a closed tab with unsaved changes gets the browser's own question; there's nowhere else to leave to.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  // The word on the popup being laid out: to begin with, the first of the samples the dictionaries know (looked again
  // when they change); then the last one pointed at in the sentences under it.
  const [shown, setShown] = useState<{ found: Found[]; text: string } | null>(null);
  const signature = dictionaries
    .filter((d) => d.on)
    .map((d) => d.id)
    .join(",");
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (const sample of SAMPLES) {
        const found = await lookUp(sample);
        if (found.length === 0) continue;
        if (alive) setShown({ found, text: sample });
        return;
      }
      if (alive) setShown(null);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [signature]);

  // The sentences to try it on: the page's own pointing and popup (`capture/look.ts`, `Lookup`), as on any page, looking
  // only in those sentences, with the layout as it stands on screen.
  const [live, setLive] = useState<View | null>(null);
  const tryText = useRef<HTMLParagraphElement>(null);
  const over = useRef<HTMLDivElement>(null);
  const keyNow = useRef(lookKey);
  keyNow.current = lookKey;
  const looker = useRef<Looker | null>(null);
  // The word pointed at goes on the popup being laid out once the popup it opened has closed. Changed while that one is
  // open, the popup being laid out would grow or shrink, the page would move under the pointer, and a page that moves
  // closes the popup as a scroll does: it would be gone as soon as it opened.
  const pointedLast = useRef<{ found: Found[]; text: string } | null>(null);
  useEffect(() => {
    // Looked up here, as the word on the popup being laid out is: this page reads the dictionaries itself.
    const made = createLooker((view) => {
      setLive(view);
      if (view) {
        pointedLast.current = { found: view.found, text: view.pointed.text };
        return;
      }
      if (pointedLast.current) setShown(pointedLast.current);
      pointedLast.current = null;
    }, lookUp);
    looker.current = made;
    const page = listenOnPage(made, {
      // The sentences to try it on are a page's, so they take the key everywhere else takes, On hover too.
      key: () => keyNow.current,
      // Tried here whatever the settings say: this page's own sentences.
      on: () => true,
      whereAt: (target) => (target instanceof Node && tryText.current?.contains(target) ? { of: "page" } : null),
      inPopup: (e) => over.current !== null && e.composedPath().includes(over.current),
    });
    return () => {
      page.stop();
      made.close();
    };
  }, []);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [picked, setPicked] = useState("word");
  const drawnBody = layout.body.filter((part) => part.show !== "hidden");
  const order = useDragOrder(drawnBody.length, (from, to) => {
    const [a, b] = [drawnBody[from], drawnBody[to]];
    if (a && b) change(moveBodyPart(layout, a.id, b.id));
  });

  /** What a part is called: its own name, or its dictionary's (with Off when it's switched off: it shows nothing then). */
  function nameOf(part: string): string {
    if (isNamedPart(part)) return PART_NAMES[part];
    const title = dictionaryTitleOf(part);
    return title ? `${MEANINGS_NAME} · ${title}` : "";
  }
  /** A dictionary's part's dictionary, by its name (with Off when it's switched off: it shows nothing then). */
  function dictionaryTitleOf(part: string): string {
    const dictionary = dictionaries.find((d) => d.id === dictionaryOf(part));
    if (!dictionary) return "";
    return dictionary.on ? shownName(dictionary) : `${shownName(dictionary)} · Off`;
  }
  const setLayout = (patch: Partial<PopupLayout>) => change({ ...layout, ...patch });
  const setBody = (id: string, patch: Partial<Omit<BodyPart, "id">>) => change({ ...layout, body: layout.body.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const hidden = [
    ...FIXED.filter((part) => layout[part] === "hidden"),
    ...(layout.reading === "hidden" ? ["reading"] : []),
    ...layout.body.filter((p) => p.show === "hidden").map((p) => p.id),
  ];

  function showSetting(options: readonly { id: PartShow; label: string }[], value: PartShow, onChange: (show: PartShow) => void) {
    return <Setting id="popup-show" label="Visibility" control={<Segmented idPrefix="popup-show" label="Visibility" options={options} value={value} onChange={onChange} />} />;
  }
  /** The dictionaries a part's data of a kind comes from: those that are on and provide it (a dictionary's own part, from that dictionary). */
  function sourcesOf(part: string, kind: DataKind): string[] {
    const own = dictionaryOf(part);
    return dictionaries.filter((d) => (own === null ? d.on : d.id === own) && (d.provides?.[kind] ?? 0) > 0).map(shownName);
  }
  /**
   * A part that shows data, of which no dictionary that's on provides any: in the editor it says so where it stands,
   * so a part left empty on every word isn't mistaken for one that's broken (the owner, 2026-10-16, with Pitch accent
   * shown and no pitch accent dictionary: "is this a bug?").
   */
  const unprovided = (part: string) => {
    const kinds = kindsIn(part);
    return kinds.length > 0 && kinds.every((kind) => sourcesOf(part, kind).length === 0);
  };

  /**
   * What the picked part shows, in the kinds of data Panki reads from a dictionary, each from the dictionaries that are
   * on and provide it (a dictionary's own part, from that dictionary); a part that's Panki's own says so. The owner,
   * 2026-10-16: where each part came from was a black box.
   */
  function shows(): ReactNode {
    const kinds = kindsIn(picked);
    if (kinds.length === 0) return <p className="layout-note">Panki&apos;s own: nothing in it comes from a dictionary.</p>;
    const own = dictionaryOf(picked);
    const items = kinds.map((kind) => ({ kind, from: sourcesOf(picked, kind) }));
    const sources = [...new Set(items.flatMap((item) => item.from))];
    const none = items.filter((item) => item.from.length === 0).map((item) => DATA_KINDS[item.kind].name);
    return (
      <>
        <KindChips key={picked} label="Shows" items={items} {...(own === null ? {} : { ownName: dictionaryTitleOf(picked) })} />
        <p className="layout-note">
          {sources.length > 0 ? `From ${listWords(sources)}.` : null}
          {sources.length > 0 && none.length > 0 ? " " : null}
          {none.length > 0 ? `No dictionary that's on provides ${listWords(none)}.` : null}
        </p>
      </>
    );
  }

  /** The picked part's choices: whether it's there (and folded), then how it's written. */
  function choices(): ReactNode {
    // The word is always there: it's what the word lookup is about.
    if (picked === "word") return null;
    if (picked === "reading") {
      return <Setting id="popup-reading" label="Position" control={<Segmented idPrefix="popup-reading" label="Reading" options={READING_OPTIONS} value={layout.reading} onChange={(reading) => setLayout({ reading })} />} />;
    }
    if (isFixed(picked)) {
      const part = picked;
      return showSetting(SHOWN_OR_HIDDEN, layout[part], (show) => setLayout(fixedPatch(part, show)));
    }
    const body = layout.body.find((p) => p.id === picked);
    if (!body) return null;
    const dictionary = dictionaryOf(body.id) !== null;
    return (
      <>
        {showSetting(dictionary ? SHOW_OPTIONS : SHOWN_OR_HIDDEN, body.show, (show) => setBody(body.id, { show }))}
        {body.id === "tags" ? (
          <Setting id="popup-tags" label="Shows" control={<Segmented idPrefix="popup-tags" label="Tags show" options={TAG_OPTIONS} value={layout.tagWords} onChange={(tagWords) => setLayout({ tagWords })} />} />
        ) : null}
        {body.id === "frequency" ? (
          <Setting id="popup-frequency" label="Shows" control={<Dropdown id="popup-frequency-choice" label="Frequency shows" options={FREQUENCY_OPTIONS} value={layout.frequencyWords} onChange={(frequencyWords) => setLayout({ frequencyWords })} />} />
        ) : null}
        {dictionary ? (
          <Setting id="popup-meanings" label="Meanings" control={<Dropdown id="popup-meanings-choice" label="Meanings" options={MEANINGS_OPTIONS} value={body.meanings} onChange={(meanings) => setBody(body.id, { meanings })} />} />
        ) : null}
      </>
    );
  }

  const editing = mode === "edit";
  const first = shown?.found[0];
  const pointAt = pointWords(lookKey);
  return (
    <>
      <div className="popup-head">
        <h2 id="popup-layout-title" className="panel-title">
          Pop-up dictionary layout
        </h2>
        <span id="popup-layout-saved" className={`saved is-${state}`} data-state={state} role="status">
          <Icon name="check" />
          {SAVE_WORDS[state]}
        </span>
        <Button id="popup-layout-save" variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
          <Icon name="save" />
          Save
        </Button>
      </div>
      <div className="layout-editor">
        <div className="layout-stage">
          {/* Above the popup being laid out, so the sentences stay where they are when it takes another word. */}
          <div className="popup-try">
            <span className="layout-note">{pointAt} a word to try it</span>
            <p ref={tryText} className="popup-try-text" lang="ja">
              {tryBefore}
              <span style={known.on ? { background: tintOf(paintCss(known.colour)) } : undefined}>
                {IN_DECKS.words}
              </span>
              {tryAfter}
            </p>
          </div>
          <div className="layout-tools">
            <Segmented idPrefix="popup-mode" label="Mode" options={MODES} value={mode} onChange={setMode} />
            <span className="layout-tools-end">
              <Button id="popup-undo" className="btn-icon" aria-label="Undo" disabled={!history.canUndo} onClick={undo}>
                <Icon name="undo" />
              </Button>
              <Button id="popup-redo" className="btn-icon" aria-label="Redo" disabled={!history.canRedo} onClick={redo}>
                <Icon name="redo" />
              </Button>
            </span>
          </div>
          <div className={`popup-stage ${editing ? "is-editing" : ""}`.trim()}>
            {shown && first ? (
              <div className="look is-here" role="group" aria-label="Pop-up dictionary">
                <LookupBody
                  // Shown afresh, as a page would open it: nothing unfolded.
                  key={`${mode}:${shown.text}`}
                  found={shown.found}
                  layout={layout}
                  onAdd={() => undefined}
                  cards={EXAMPLE_CARDS}
                  {...(editing ? { edit: { picked, onPick: setPicked, order, nameOf, unprovided } } : {})}
                />
              </div>
            ) : (
              <p className="empty">{pointAt} a word above to see the pop-up with it.</p>
            )}
          </div>
          {!editing ? (
            <p className="layout-note">Press a word at the top to see it, what&apos;s folded to open it, and a tag to see what it means.</p>
          ) : hidden.length > 0 ? (
            <div className="layout-away" aria-label="Hidden">
              <span className="layout-note">Hidden:</span>
              {hidden.map((part) => (
                <Button key={part} variant="chip" className="layout-away-chip" aria-pressed={picked === part} onClick={() => setPicked(part)}>
                  {nameOf(part)}
                </Button>
              ))}
            </div>
          ) : null}
          {/* The popup the sentences open, over the whole window as on a page, and there only while it's open (a page's
              place is taken away when it closes); only the popup itself takes presses. */}
          {live ? (
            <div ref={over} className="look-over">
              <Lookup key={live.pointed.id} view={live} layout={layout} cards={EXAMPLE_CARDS} onKeep={() => looker.current?.lock()} onAdd={() => looker.current?.close()} />
            </div>
          ) : null}
          {saveFailed ? (
            <p className="form-failure" role="alert">
              {MESSAGES.unsaved}
            </p>
          ) : null}
        </div>
        <aside className="layout-panel popup-choices" aria-labelledby="popup-part-title">
          <h3 id="popup-part-title" className="layout-part-title">
            {dictionaryOf(picked) !== null ? MEANINGS_NAME : nameOf(picked)}
            {dictionaryOf(picked) !== null ? <small>{dictionaryTitleOf(picked)}</small> : null}
          </h3>
          <p className="layout-note">{isNamedPart(picked) ? PART_ABOUT[picked] : MEANINGS_ABOUT}</p>
          {shows()}
          {choices()}
        </aside>
      </div>
    </>
  );
}
