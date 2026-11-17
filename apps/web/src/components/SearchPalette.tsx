/** @panki Searching every deck's cards, a palette hanging from the top, opened by the bar's Search or its keys (`SearchPalette`, `useSearchKeys`). Never a second search of every deck. */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { searchWords, type AccountCards, type Card, type CardType, type Deck, type SrsType } from "@panki/contracts";
import { api } from "../api";
import { lightingOf, searchEvery } from "../cardSearch";
import { useDismiss } from "../hooks/useDismiss";
import { useHeardKeys } from "../hooks/useHeardKeys";
import { commandAsCtrl, keysOf, restartOf, sameKey, useKeyBinds, useKeybindsEnabled } from "../keys";
import { count, langOf } from "../words";
import { AiSpark } from "./AiWaiting";
import { Button } from "./Button";
import { aiOn, cardRowCells } from "./CardList";
import { Icon } from "./Icon";
import { PlacePill } from "./PlacePill";
import { ScrollEdges } from "./ScrollEdges";
import { Bone } from "./Skeleton";

/** The most results drawn at once: the best of them, a screenful and more; typing more narrows the rest. */
const SHOWN_MAX = 50;

/** A card with its deck and the deck's types, as searched and drawn. */
type Item = { card: Card; deck: Deck; type: CardType; srsType: SrsType | undefined };

type Props = {
  decks: readonly Deck[];
  types: readonly CardType[];
  srsTypes: readonly SrsType[];
  /** The bar's Search, which opened it: pressing it again closes it rather than closing and opening it at once. */
  opener: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** A card opened in its deck, open there. */
  onOpen: (deck: Deck, cardId: string) => void;
  /** No card matches: the Add screen, what's typed filled in as the card's words. */
  onAdd: (words: string) => void;
};

/** One card found: drawn as its deck's list draws it (`cardRowCells`), what was found lit, where it stands and its deck. */
function Hit({ item, words, id, active, onPick, onPoint }: { item: Item; words: ReturnType<typeof searchWords>; id: string; active: boolean; onPick: () => void; onPoint: () => void }) {
  const { card, deck, type, srsType } = item;
  const cells = cardRowCells(card, type, { lighting: lightingOf(card, words, { type, srsType }), still: true });
  return (
    <div id={id} role="option" aria-selected={active} className={`search-hit ${active ? "is-active" : ""}`.trim()} onClick={onPick} onPointerMove={active ? undefined : onPoint}>
      <div className="search-hit-main">
        <div className="card-row-ja">{cells.front}</div>
        <div className="card-meaning">{cells.back}</div>
        {cells.found}
      </div>
      <div className="search-hit-side">
        <span className="search-hit-top">
          {aiOn(card, type) ? <AiSpark className="card-ai" /> : null}
          {srsType ? <PlacePill type={srsType} place={card.place} /> : null}
        </span>
        <span className="search-deck">
          <Icon name="decks" />
          {deck.name}
        </span>
      </div>
    </div>
  );
}

/**
 * Search every deck: a palette hanging from the top of the screen, its field taking what's typed at once, every card of
 * every deck searched as it's typed (`cardSearch.ts` → `searchEvery`, the best first whichever deck they're in), each
 * drawn as its deck's list draws it with what was found lit, its deck named. ↑ and ↓ move, Enter or a press opens the
 * card in its deck; no card found offers to add what's typed as a new card. The cards are asked for once as it opens
 * and kept while it's open (`api.everyCard`). Esc or a press outside closes it. Not centred and over nothing dimmed:
 * that's the one pop-up (`Modal`).
 */
export function SearchPalette({ decks, types, srsTypes, opener, onClose, onOpen, onAdd }: Props) {
  const ids = useId();
  const panel = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<AccountCards["decks"] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const keysOn = useKeybindsEnabled();
  useDismiss(panel, true, onClose, opener);

  // Asked for once, as it opens; what had the focus has it back as it closes.
  useEffect(() => {
    let alive = true;
    api.everyCard().then(
      (got) => {
        if (alive) setLoaded(got);
      },
      (e: unknown) => {
        if (alive) setFailure(e instanceof Error ? e.message : "Couldn't load your cards.");
      },
    );
    const had = document.activeElement;
    field.current?.focus();
    return () => {
      alive = false;
      if (had instanceof HTMLElement && had.isConnected) had.focus();
    };
  }, []);

  const items = useMemo<Item[]>(() => {
    if (!loaded) return [];
    return loaded.flatMap(({ deckId, cards }) => {
      const deck = decks.find((d) => d.id === deckId);
      const type = deck ? types.find((t) => t.id === deck.typeId) : undefined;
      if (!deck || !type) return [];
      const srsType = srsTypes.find((t) => t.id === deck.srsTypeId);
      return cards.map((card) => ({ card, deck, type, srsType }));
    });
  }, [loaded, decks, types, srsTypes]);
  const typed = query.trim();
  const words = useMemo(() => searchWords(query), [query]);
  const found = useMemo(() => searchEvery(items, query), [items, query]);
  const shown = found.slice(0, SHOWN_MAX);
  const deckCount = new Set(found.map((hit) => hit.deck.id)).size;
  /** Nothing matches what's typed: the one thing to pick is adding it. */
  const none = typed !== "" && loaded !== null && found.length === 0;
  const picks = none ? 1 : shown.length;
  const activeAt = Math.min(active, Math.max(0, picks - 1));
  const optionId = (i: number) => `${ids}-option-${i}`;

  // The one picked stays in view as ↑ and ↓ move it.
  useEffect(() => {
    document.getElementById(optionId(activeAt))?.scrollIntoView({ block: "nearest" });
  }, [activeAt]); // eslint-disable-line react-hooks/exhaustive-deps -- the id is the same for an index

  function pick(i: number) {
    if (none) return onAdd(typed);
    const hit = shown[i];
    if (hit) onOpen(hit.deck, hit.card.id);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    // An Enter or an arrow while a Japanese word is being composed is the IME's.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (picks > 0) setActive(Math.max(0, Math.min(picks - 1, activeAt + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (picks > 0) pick(activeAt);
    }
  }

  const totalCards = decks.reduce((sum, deck) => sum + deck.cardCount, 0);
  let body: ReactNode;
  if (failure) {
    body = (
      <p className="load-error" role="alert">
        {failure}
      </p>
    );
  } else if (typed === "") {
    body = <p className="search-quiet">{`${count(totalCards, "card", "cards")} in ${count(decks.length, "deck", "decks")}`}</p>;
  } else if (loaded === null) {
    // The shape of the rows coming, as the results draw them.
    body = (
      <div className="skel-in" role="status" aria-busy="true" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="search-hit">
            <div className="search-hit-main">
              <Bone w={i === 1 ? "34%" : "44%"} h="1.4em" />
              <Bone w={i === 1 ? "58%" : "70%"} />
            </div>
            <Bone w="5em" h="1.4em" />
          </div>
        ))}
      </div>
    );
  } else if (none) {
    body = (
      <div className="search-none">
        <p className="search-quiet">
          No cards match “<span lang={langOf(typed)}>{typed}</span>”.
        </p>
        <Button id={optionId(0)} role="option" aria-selected={activeAt === 0} className={`search-add ${activeAt === 0 ? "is-active" : ""}`.trim()} onClick={() => onAdd(typed)}>
          <Icon name="add" />
          <span>
            Add “<span lang={langOf(typed)}>{typed}</span>” as a new card
          </span>
        </Button>
      </div>
    );
  } else {
    body = (
      <>
        <p className="search-head">
          <span>{count(found.length, "card", "cards")}</span>
          <span>in {count(deckCount, "deck", "decks")}</span>
        </p>
        {shown.map((hit, i) => (
          <Hit key={hit.card.id} item={hit} words={words} id={optionId(i)} active={i === activeAt} onPick={() => pick(i)} onPoint={() => setActive(i)} />
        ))}
        {found.length > shown.length ? <p className="search-quiet">{`The first ${shown.length} shown.`}</p> : null}
      </>
    );
  }

  return (
    <div ref={panel} className="search-palette" role="dialog" aria-label="Search every deck">
      <div className="search-field">
        <Icon name="search" />
        <input
          ref={field}
          id={`${ids}-field`}
          className="search-input"
          type="search"
          role="combobox"
          aria-label="Search every deck"
          aria-expanded={picks > 0}
          aria-controls={`${ids}-results`}
          aria-activedescendant={picks > 0 ? optionId(activeAt) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search every deck"
          lang={langOf(query)}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
        />
        {keysOn ? <span className="key">Esc</span> : null}
      </div>
      <div ref={box} id={`${ids}-results`} className="search-results" role="listbox" aria-label="Cards found">
        {body}
      </div>
      <ScrollEdges of={box} />
      {keysOn ? (
        <p className="search-foot">
          <span>
            <span className="key">↑</span>
            <span className="key">↓</span> to move
          </span>
          <span>
            <span className="key">Enter</span> to open
          </span>
          <span>
            <span className="key">Esc</span> to close
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Open search's keys heard on every screen, while `on` (signed in, nothing asking first): each opens the palette, or closes
 * it. On a Mac a key kept with Ctrl is ⌘ too (`commandAsCtrl`), at a press, never in a field. Not while something
 * fills the screen (a review's clip): the palette would open outside it, unseen.
 */
export function useSearchKeys(on: boolean, toggle: () => void) {
  const binds = useKeyBinds();
  const latest = useRef(toggle);
  latest.current = () => {
    if (!document.fullscreenElement) toggle();
  };
  useHeardKeys(on ? restartOf(binds.search, binds) : [], () => null, () => latest.current());
  const signature = on ? JSON.stringify(keysOf(binds.search)) : null;
  useEffect(() => {
    if (signature === null) return;
    const keys = keysOf(binds.search).filter((key) => key.holdMs === 0);
    const onKey = (e: globalThis.KeyboardEvent) => {
      const key = commandAsCtrl(e);
      if (key === null || !keys.some((own) => sameKey(own.key, key))) return;
      const at = e.target;
      if (at instanceof HTMLElement && (at.isContentEditable || at.closest("input, textarea, select"))) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps -- the keys are what `signature` says
}
