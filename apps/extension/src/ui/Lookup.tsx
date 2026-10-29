import { Fragment, useState, type ReactNode } from "react";
import { AlreadyIn } from "@web/components/AlreadyIn";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { PitchAccent } from "@web/components/PitchAccent";
import { useCalled } from "@web/hooks/useCalled";
import type { CalledCard } from "@panki/contracts";
import type { useDragOrder } from "@web/hooks/useDragOrder";
import { count } from "@web/words";
import type { View } from "../capture/look";
import { wordKey, type Found, type Sense, type Tag } from "../dictionary/found";
import { askCalled, askOpenPanki } from "../messages";
import { PART_NAMES, bandOf } from "../popupKinds";
import { dictionaryOf, dictionaryPart, type BodyPart, type FrequencyWords, type PopupLayout, type ReadingAt, type TagWords } from "../popupLayout";
import { Glossary } from "./Glossary";

/** How wide the popup is, at most, and how far it keeps from the word and the window's edges. */
const WIDTH = 420;
const GAP = 6;
const EDGE = 8;

/** A reading with its pitch drawn over it, as the app draws one, small and quiet in the popup. */
export function Pitch({ reading, position }: { reading: string; position: number }) {
  return <PitchAccent reading={reading} position={position} className="look-pitch" />;
}

/**
 * The popup being laid out (the options page's editor): every part is something to pick, what's under the first word
 * is moved by its grip, and a part with nothing to show for this word stands as its name.
 */
export type PopupEdit = {
  picked: string | null;
  onPick: (part: string) => void;
  /** Moving what's under the word, by its place among the parts drawn there (the layout's `body` that isn't hidden). */
  order: ReturnType<typeof useDragOrder>;
  /** What a part is called, for the one that has nothing for this word. */
  nameOf: (part: string) => string;
  /** Whether a part shows data that no dictionary that's on provides: it's empty on every word, not just this one. */
  unprovided: (part: string) => boolean;
};

/** On Panki's own line: how long the word taken there is now, and taking another of the words that start at the same place. */
type Split = { length: number; onSplit: (length: number) => void };

/**
 * A part of the popup that stands in a line with others (the word, its pitch, Add): on the editor, something to pick.
 * What's in it does nothing there (`inert`), but a part inside that's picked on its own (the word's reading).
 */
function InlinePart({ id, edit, end = false, inert = true, children }: { id: string; edit: PopupEdit | undefined; end?: boolean; inert?: boolean; children: ReactNode }) {
  if (!edit) return <>{children}</>;
  return (
    <span className={`look-part is-inline ${end ? "is-end" : ""} ${edit.picked === id ? "is-picked" : ""}`.replace(/\s+/g, " ").trim()} onClick={() => edit.onPick(id)}>
      <span className="look-part-body" inert={inert}>
        {children}
      </span>
    </span>
  );
}

/** A part of the popup on a line of its own: on the editor, something to pick, and with `index`, to move by its grip. */
function BlockPart({ id, edit, index, children }: { id: string; edit: PopupEdit | undefined; index?: number; children: ReactNode }) {
  if (!edit) return <>{children}</>;
  const moves = index !== undefined;
  return (
    <div
      ref={moves ? edit.order.rowRef(index) : undefined}
      style={moves ? edit.order.rowStyle(index) : undefined}
      className={`look-part ${edit.picked === id ? "is-picked" : ""} ${moves && edit.order.dragging === index ? "is-dragging" : ""}`.replace(/\s+/g, " ").trim()}
      onClick={() => edit.onPick(id)}
    >
      {moves ? (
        <Button className="btn-icon look-grip" aria-label={`Move ${edit.nameOf(id)}`} {...edit.order.handleProps(index)}>
          <Icon name="grip" />
        </Button>
      ) : null}
      <div className="look-part-body" inert>
        {children}
      </div>
    </div>
  );
}

/**
 * A part with nothing to show for this word, as the editor shows it: its name where it stands, and when no dictionary
 * that's on provides its data at all, that.
 */
function Blank({ id, edit }: { id: string; edit: PopupEdit }) {
  return (
    <span className="look-blank">
      {edit.nameOf(id)}
      {edit.unprovided(id) ? <small> · No dictionary that&apos;s on provides it</small> : null}
    </span>
  );
}

/**
 * The word as the dictionary writes it, with its reading over it or beside it when that's different. On the editor
 * the reading is a part of its own, picked by itself, as the word is.
 */
function Headword({ found, reading, edit }: { found: Found; reading: ReadingAt; edit: PopupEdit | undefined }) {
  const differs = found.reading !== "" && found.reading !== found.term;
  const said = edit ? (
    <span
      className={`look-part look-part-reading ${edit.picked === "reading" ? "is-picked" : ""}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        edit.onPick("reading");
      }}
    >
      {found.reading}
    </span>
  ) : (
    found.reading
  );
  return (
    <>
      <span className="look-term" lang="ja">
        {differs && reading === "over" ? (
          <ruby>
            {found.term}
            <rt>{said}</rt>
          </ruby>
        ) : (
          found.term
        )}
      </span>
      {differs && reading === "beside" ? (
        <span className="look-reading" lang="ja">
          {said}
        </span>
      ) : null}
    </>
  );
}

/**
 * A word's or a meaning's tags: the dictionary's short codes, one pressed to say what it means in the dictionary's own
 * words (when it has any), or those words in the code's place.
 */
function Tags({ tags, words, inline = false }: { tags: readonly Tag[]; words: TagWords; inline?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const said = tags.find((tag) => tag.name === open);
  const chips = tags.map((tag) => {
    if (words === "descriptions" || !tag.notes) {
      return (
        <span key={tag.name} className="look-tag">
          {words === "descriptions" ? tag.notes || tag.name : tag.name}
        </span>
      );
    }
    return (
      <Button key={tag.name} className="look-tag" aria-expanded={open === tag.name} onClick={() => setOpen((was) => (was === tag.name ? null : tag.name))}>
        {tag.name}
      </Button>
    );
  });
  const note = said ? (
    <span className="look-note">
      <strong>{said.name}</strong> {said.notes}
    </span>
  ) : null;
  if (inline) {
    return (
      <>
        <span className="look-tags">{chips}</span>
        {note}
      </>
    );
  }
  return (
    <div className="look-tagline">
      <div className="look-tags">{chips}</div>
      {note}
    </div>
  );
}

/** How common the word is: a band in words from its best rank, each frequency list's own number, or both. */
function Frequency({ found, words }: { found: Found; words: FrequencyWords }) {
  if (found.frequencies.length === 0) return null;
  const ranks = found.frequencies.flatMap((f) => (f.rank === null ? [] : [f.rank]));
  const band = ranks.length > 0 ? bandOf(Math.min(...ranks)) : null;
  // With no list that counts by rank, there's no band to say: the numbers say it instead.
  const numbers = words !== "band" || band === null;
  return (
    <div className="look-tags">
      {band !== null && words !== "number" ? <span className="look-tag is-frequency is-band">{band}</span> : null}
      {numbers
        ? found.frequencies.map((frequency, i) => (
            <span key={i} className="look-tag is-frequency">
              {frequency.dict} {frequency.display}
            </span>
          ))
        : null}
    </div>
  );
}

/** The endings undone, from the dictionary's form out to the one on the page. */
function Endings({ found }: { found: Found }) {
  if (found.steps.length === 0) return null;
  return (
    <p className="look-steps" lang="ja">
      <span>{found.term}</span>
      {found.steps.map((step, i) => (
        <Fragment key={i}>
          <span className="look-step">{step.name}</span>
          <span>{step.form}</span>
        </Fragment>
      ))}
    </p>
  );
}

/** One dictionary's meanings of a word: under its name, or folded to its name and how many there are; cut to `limit`, the rest behind "more". */
function Meanings({ senses, folded, limit, tagWords, tagsOn }: { senses: readonly Sense[]; folded: boolean; limit: number; tagWords: TagWords; tagsOn: boolean }) {
  const [open, setOpen] = useState(!folded);
  const [whole, setWhole] = useState(false);
  const name = senses[0]?.dict ?? "";
  if (folded && !open) {
    return (
      <Button className="look-fold" aria-expanded={false} onClick={() => setOpen(true)}>
        <span className="look-dict-name">{name}</span>
        <span className="look-fold-count">{count(senses.length, "meaning", "meanings")}</span>
        <Icon name="down" />
      </Button>
    );
  }
  const cut = limit > 0 && !whole ? senses.slice(0, limit) : senses;
  const left = senses.length - cut.length;
  return (
    <section className="look-dict">
      {folded ? (
        <Button className="look-fold is-open" aria-expanded onClick={() => setOpen(false)}>
          <span className="look-dict-name">{name}</span>
          <Icon name="down" />
        </Button>
      ) : (
        <span className="look-dict-name">{name}</span>
      )}
      <ol className="look-senses">
        {cut.map((sense, j) => (
          <li key={j}>
            {tagsOn && sense.tags.length > 0 ? <Tags tags={sense.tags} words={tagWords} inline /> : null}
            <Glossary items={sense.glossary} />
          </li>
        ))}
      </ol>
      {left > 0 ? (
        <Button className="look-more" onClick={() => setWhole(true)}>
          {count(left, "more meaning", "more meanings")}
          <Icon name="down" />
        </Button>
      ) : null}
    </section>
  );
}

/** What one part under the word draws for it; null when there's nothing. */
function bodyOf(part: BodyPart, found: Found, layout: PopupLayout): ReactNode {
  if (part.id === "tags") return found.tags.length > 0 ? <Tags tags={found.tags} words={layout.tagWords} /> : null;
  if (part.id === "frequency") return found.frequencies.length > 0 ? <Frequency found={found} words={layout.frequencyWords} /> : null;
  if (part.id === "endings") return found.steps.length > 0 ? <Endings found={found} /> : null;
  // Named as tags are, and written as they are: codes that say what they mean when pressed, or what they mean.
  if (part.id === "wordType") return found.wordTypes.length > 0 ? <Tags tags={found.wordTypes} words={layout.tagWords} /> : null;
  const dictionary = dictionaryOf(part.id);
  const senses = found.senses.filter((sense) => sense.dictId === dictionary);
  if (senses.length === 0) return null;
  const tagsOn = layout.body.find((p) => p.id === "tags")?.show !== "hidden";
  // A change of folded or not starts it afresh, as it would open.
  return <Meanings key={part.show} senses={senses} folded={part.show === "folded"} limit={part.meanings} tagWords={layout.tagWords} tagsOn={tagsOn} />;
}

/**
 * Where the popup learns which cards a word already is, and what Open in Panki does: Panki, through the worker; or, on
 * the layout editor, its example of a word that's in the decks (`options/PopupLayout.tsx`), which opens nothing.
 */
export type CardsSource = { ask: (words: readonly string[]) => Promise<readonly CalledCard[]>; open: (card: CalledCard) => void };
const PANKI_CARDS: CardsSource = { ask: askCalled, open: (card) => void askOpenPanki({ deckId: card.deckId, cardId: card.cardId }) };

/**
 * A word that's already a card, said under its head as the drawer says it (the owner, 2026-10-25: over any word, "in
 * case it's in a deck, it will show which deck it belongs to and I can click to see it in the deck"): which deck, and
 * Open in Panki, at that card in its deck's list. Asked by the word as the dictionary lists it; nothing while signed
 * out, and nothing at all for a word no card is called by. A part of the layout, In your decks, since 2026-10-28; on
 * the editor, a word in no deck shows the part's name in its place.
 */
function InCards({ found, cards, edit }: { found: Found; cards: CardsSource; edit: PopupEdit | undefined }) {
  const called = useCalled([found.term], cards.ask);
  if (called.length === 0) return edit ? <Blank id="cards" edit={edit} /> : null;
  return <AlreadyIn cards={called} compared={null} openWords="Open in Panki" onOpen={cards.open} />;
}

function Word({ found, layout, onAdd, cards, edit }: { found: Found; layout: PopupLayout; onAdd: (found: Found) => void; cards: CardsSource; edit?: PopupEdit }) {
  const pitch = found.pitches[0];
  const shown = layout.body.filter((part) => part.show !== "hidden");
  // Meanings of a dictionary the layout doesn't know yet (imported since it was handed over) come last, as they are.
  const placed = new Set(layout.body.map((part) => part.id));
  const strays = [...new Set(found.senses.map((sense) => sense.dictId))].filter((id) => !placed.has(dictionaryPart(id)));
  const tagsOn = layout.body.find((p) => p.id === "tags")?.show !== "hidden";
  return (
    <article className="look-word">
      <header className="look-head">
        {/* Nothing in the word to press but its reading, which is picked by itself. */}
        <InlinePart id="word" edit={edit} inert={false}>
          <Headword found={found} reading={layout.reading} edit={edit} />
        </InlinePart>
        {layout.pitch !== "hidden" && (pitch || edit) ? (
          <InlinePart id="pitch" edit={edit}>
            {pitch ? pitch.positions.map((position, i) => <Pitch key={i} reading={found.reading || found.term} position={position} />) : edit ? <Blank id="pitch" edit={edit} /> : null}
          </InlinePart>
        ) : null}
        {layout.add !== "hidden" ? (
          <InlinePart id="add" edit={edit} end>
            <Button className="look-add" onClick={() => onAdd(found)}>
              <Icon name="add" />
              Add
            </Button>
          </InlinePart>
        ) : null}
      </header>
      {layout.cards !== "hidden" ? (
        <BlockPart id="cards" edit={edit}>
          <InCards found={found} cards={cards} edit={edit} />
        </BlockPart>
      ) : null}
      {shown.map((part, i) => {
        const drawn = bodyOf(part, found, layout);
        if (drawn === null && !edit) return null;
        return (
          <BlockPart key={part.id} id={part.id} edit={edit} index={i}>
            {drawn ?? (edit ? <Blank id={part.id} edit={edit} /> : null)}
          </BlockPart>
        );
      })}
      {strays.map((id) => (
        <Meanings key={id} senses={found.senses.filter((sense) => sense.dictId === id)} folded={false} limit={0} tagWords={layout.tagWords} tagsOn={tagsOn} />
      ))}
    </article>
  );
}

type BodyProps = {
  /** Every word found, best first. */
  found: readonly Found[];
  layout: PopupLayout;
  onAdd: (found: Found) => void;
  split?: Split | null;
  /** Another word found was pressed and is shown now: what's lit on the page follows it. */
  onShow?: (found: Found) => void;
  /** Given, the popup is the layout editor's: nothing in it does anything but get picked. */
  edit?: PopupEdit;
  /** Where it learns which cards a word already is; Panki, unless the layout editor gives its example. */
  cards?: CardsSource;
};

/**
 * What's in the popup, as its layout says: at its top, when more than one word is found at that letter, every one of
 * them as a chip, the one shown lit and another pressed to show it (on Panki's line, the line is split around it too);
 * the word shown with its parts; then the other words, each in full, or not at all. One row of the words found, where
 * there were two: the words that start here by length at the top, and an "Also here" row of the rest at the bottom
 * (the owner, 2026-10-16: "why do we have both the top and the bottom?"). The popup on a page and the options page's
 * editor both draw this.
 */
export function LookupBody({ found, layout, onAdd, split = null, onShow, edit, cards = PANKI_CARDS }: BodyProps) {
  /** The word pressed among those found, by its place among them, once one is. */
  const [pressed, setPressed] = useState<number | null>(null);
  // Until one is pressed: on Panki's line, the word taken there; anywhere else, the best.
  const onLine = split ? found.findIndex((f) => f.source.length === split.length) : -1;
  const at = pressed ?? Math.max(onLine, 0);
  const shown = found[at];
  if (!shown) return null;
  const rest = found.filter((_, i) => i !== at);
  const show = (i: number) => {
    const word = found[i];
    if (!word) return;
    setPressed(i);
    onShow?.(word);
    split?.onSplit(word.source.length);
  };
  // The words written the same way are one box, the word once and each of its readings to press in it: 昨日 read
  // さくじつ or きのう is one word read two ways, where 昨 is another word (the owner, 2026-10-16).
  const byTerm = new Map<string, number[]>();
  found.forEach((word, i) => byTerm.set(word.term, [...(byTerm.get(word.term) ?? []), i]));
  const chips =
    found.length > 1 ? (
      <div className="look-split" role="group" aria-label={PART_NAMES.split}>
        {[...byTerm].map(([term, places]) => {
          const [only] = places;
          if (places.length === 1 && only !== undefined) {
            const word = found[only];
            return (
              <Button key={term} variant="chip" aria-pressed={only === at} onClick={() => show(only)}>
                <span lang="ja">{term}</span>
                {word && word.reading && word.reading !== term ? <small lang="ja">{word.reading}</small> : null}
              </Button>
            );
          }
          return (
            <span key={term} className={`look-split-group ${places.includes(at) ? "is-on" : ""}`.trim()} role="group" aria-label={term}>
              <span className="look-split-term" lang="ja">
                {term}
              </span>
              {places.map((i) => (
                <Button key={i} variant="chip" className="look-split-reading" lang="ja" aria-pressed={i === at} onClick={() => show(i)}>
                  {found[i]?.reading || term}
                </Button>
              ))}
            </span>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      {layout.split !== "hidden" && (chips || edit) ? (
        <BlockPart id="split" edit={edit}>
          {chips ?? (edit ? <Blank id="split" edit={edit} /> : null)}
        </BlockPart>
      ) : null}
      <Word found={shown} layout={layout} onAdd={onAdd} cards={cards} edit={edit} />
      {rest.length > 0 && layout.others === "shown" ? (
        <BlockPart id="others" edit={edit}>
          {rest.map((word) => (
            <Word key={wordKey(word)} found={word} layout={layout} onAdd={onAdd} cards={cards} />
          ))}
        </BlockPart>
      ) : null}
      {rest.length === 0 && edit && layout.others !== "hidden" ? (
        <BlockPart id="others" edit={edit}>
          <Blank id="others" edit={edit} />
        </BlockPart>
      ) : null}
    </>
  );
}

type Props = {
  view: View;
  layout: PopupLayout;
  /** A press inside the popup: it stays open. */
  onKeep: () => void;
  /** Add this word: the drawer opens on it. */
  onAdd: (found: Found) => void;
  /**
   * On Panki's own line: how long the word taken there is now, and taking another of the words that start at the same
   * place, which splits the line again around it.
   */
  split?: Split | null;
  /** Where it learns which cards a word already is; Panki, unless the layout editor gives its example. */
  cards?: CardsSource;
};

/**
 * The popup: every word found where the pointer is, laid out as the owner laid it out on the options page
 * (`LookupBody`). It stands under the word (over it, when there's more room there), inside the window, and the word
 * itself is lit. A press anywhere in it keeps it open.
 */
export function Lookup({ view, layout, onKeep, onAdd, split = null, cards }: Props) {
  /** What's lit on the page once another word found is pressed: that word's own stretch. The popup stays where it is. */
  const [lit, setLit] = useState<DOMRect | null>(null);
  const anchor = view.word;
  if (!anchor) return null;
  const mark = lit ?? anchor;
  const width = Math.min(WIDTH, window.innerWidth - EDGE * 2);
  const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - width - EDGE));
  const below = window.innerHeight - anchor.bottom - GAP - EDGE;
  const above = anchor.top - GAP - EDGE;
  const under = below >= 240 || below >= above;
  const place = under ? { top: anchor.bottom + GAP, maxHeight: below } : { bottom: window.innerHeight - anchor.top + GAP, maxHeight: above };
  return (
    <>
      <span className="look-lit" aria-hidden="true" style={{ left: mark.left - 2, top: mark.top - 1, width: mark.width + 4, height: mark.height + 2 }} />
      {/* Kept open or not, it looks the same (the owner had the border that marked it kept taken off, 2026-10-15). */}
      <div className="look" role="dialog" aria-label="Pop-up dictionary" style={{ left, width, ...place }} onPointerDown={onKeep}>
        <LookupBody found={view.found} layout={layout} onAdd={onAdd} split={split} {...(cards ? { cards } : {})} onShow={(word) => setLit(view.pointed.measure(word.source.length))} />
      </div>
    </>
  );
}
