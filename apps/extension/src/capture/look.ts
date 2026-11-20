/** @panki Which word a pointer, held key or click points at, on a page or in Panki's lines (`createLooker`, `listenOnPage`, `createDrawerPointer`, `pointedOnPage`, `held`). */
import { isJapanese } from "@web/words";
import type { Found } from "../dictionary/found";
import { HELD_KEY, clickOf, isHeld, type Binding } from "../lookSettings";
import { askLookup } from "../messages";
import { inPanki } from "../ui/mount";
import { blockOf } from "./selection";

/**
 * Pointing at a word to look it up, by whatever opens the pop-up there (`lookSettings.ts` → `Binding`): a key held while
 * pointing opens the word's popup; moving off the word with the key still held closes it, or moves it to the next word pointed at. Letting the
 * key go while on the word, or a click on it, keeps it open, the pointer free to go anywhere (into the popup), until a
 * click somewhere else or Escape; the key held over another word then looks that one up instead. The same on any page,
 * on the video site's own captions and on Panki's line under the player; only how the word under the pointer is found
 * differs, and that's handed in.
 */

/** Something pointed at: the text from the letter under the pointer on, and where it is. */
export type Pointed = {
  /** Tells one place from another: pointing at the same place again changes nothing. */
  id: string;
  /** The text from the letter pointed at on (a word is looked for at its start). */
  text: string;
  /** Where on the screen the word of so many letters from there is: what's lit, and what the popup stands under. */
  measure: (length: number) => DOMRect | null;
  /** The text around it, and where in that it begins: the sentence a card gets, when the word is added. */
  context: { text: string; at: number } | null;
  /** Where it was pointed at, in the words of whoever found it: what adding the word means there. */
  where: Where;
  /**
   * Whether what was pointed at is still on the screen as it was: its element still there and its words the same. A
   * line under the pointer drawn again (subtitles moving on as the video plays) changes it with no pointer moving.
   */
  alive: () => boolean;
};
/**
 * Panki's own line under the player (the caption line and the letter of it the word begins at, how long the word
 * taken there is, and whether it's the Panki panel's list beside the video rather than Panki's subtitles), the video
 * site's own captions, or any other text on a page.
 */
export type Where = { of: "line"; lineId: number; offset: number; length: number; inPanel: boolean } | { of: "captions" } | { of: "page" };

/**
 * What's showing: the word found, where it is, whether it's kept open (the key let go on the word, or a click), and
 * whether it was opened by hover alone (where the pop-up opens on Hover, `Binding`), which neither
 * letting go nor a press on the word keeps open, and which closes once the pointer is well away from the word.
 */
export type View = { pointed: Pointed; found: Found[]; word: DOMRect | null; locked: boolean; hovered: boolean };

/** Where the popup stands on the screen, as drawn; null while there's none. */
type PopupRect = () => DOMRect | null;
/**
 * Whether the pointer is still on a hover popup's word: on the word's own box, or on the popup itself. The popup
 * stands flush against the word (`Lookup.tsx`), so the pointer goes from the word straight into it, however slowly,
 * and the line's own leave event, whose pointer is already in the popup, closes nothing; leaving the word any other
 * way closes the popup at once. No margin round the word (a 24 px one kept the popup open with the pointer well off
 * the word), and no gap to bridge: a gap was the next line's room, whose word was hovered, lit and clicked on the
 * way through it.
 */
function onWord(word: DOMRect, at: At, popup: DOMRect | null): boolean {
  return within(word, at.x, at.y) || (popup !== null && within(popup, at.x, at.y));
}
/**
 * How often a popup opened by hover looks again at its word, ms: the word gone or changed, or no longer under the
 * pointer (the line moved on under a pointer that stood still), it closes. Moves alone never see that: subtitles
 * change under a pointer that doesn't move.
 */
const HOVER_LOOK_MS = 150;
/** The key that keeps a popup opened by hover open, as `KeyboardEvent.key` names it and the options page says it. */
export const HOVER_KEEP = "Shift";

/** Where the pointer is on the screen. */
type At = { x: number; y: number };

export type Looker = ReturnType<typeof createLooker>;

/** Finding the words from a letter on. */
type Find = (text: string) => Promise<Found[]>;
/** A page's script asks the worker; the options page, which reads the dictionaries itself, hands in its own `lookUp`. */
const askWorker: Find = async (text) => {
  const answer = await askLookup(text);
  return answer.ok ? answer.found : [];
};

type Mods = { shiftKey: boolean; ctrlKey: boolean; altKey: boolean };
/** Whether an event has a held binding's key down; a click, hover or none has none to hold. */
export function held(binding: Binding, e: Mods): boolean {
  if (!isHeld(binding)) return false;
  return binding === "shift" ? e.shiftKey : binding === "ctrl" ? e.ctrlKey : e.altKey;
}
/** Whether a key pressed or let go is a held binding's key; for any other binding, none is. */
const isKey = (binding: Binding, name: string) => isHeld(binding) && HELD_KEY[binding] === name;

/**
 * The pointer moved over words, with `binding` what opens the pop-up there: with Hover, onto a word looks it up once the
 * pointer has rested on it for `delayMs` (Hover delay) and off the words lets the popup drift away (`hoverOver`); with
 * a held key, the key held looks up what's pointed at, and not held is letting go; with a click or none, a move opens
 * nothing (one a click opened is kept, and a move leaves it be). A page's text and Panki's own lines both go through
 * this, each with its own binding and delay.
 */
export function pointWith(looker: Looker, binding: Binding, delayMs: number, e: Mods, pointed: Pointed | null, at: At): void {
  if (binding === "hover") hoverOver(looker, pointed, at, delayMs);
  else if (held(binding, e)) looker.point(pointed, at);
  else looker.release(at);
}

/**
 * The Card drawer bound to a held key or to Hover: a word pointed at with the key held opens the drawer on it, as does
 * one the pointer rests on for the Hover delay. Once per word, so a move over the same word doesn't open it again; off
 * the words, the next word opens it afresh. A click bound to the drawer is the press's own (`listenOnPage`, `Line.tsx`).
 */
export function createDrawerPointer() {
  /** The word the drawer was opened on last, and the one a rest is under way on. */
  let opened: string | null = null;
  let resting: string | null = null;
  let rest: ReturnType<typeof setTimeout> | null = null;
  const stopRest = () => {
    if (rest !== null) clearTimeout(rest);
    rest = null;
    resting = null;
  };
  return {
    /** The pointer moved over words (`pointed` the word under it, null off every word), with `binding` what opens the drawer there. */
    move(binding: Binding, delayMs: number, e: Mods, pointed: Pointed | null, open: (pointed: Pointed) => void) {
      if (!pointed) {
        stopRest();
        opened = null;
        return;
      }
      if (pointed.id === opened) return;
      if (binding === "hover") {
        if (pointed.id === resting) return;
        stopRest();
        resting = pointed.id;
        rest = setTimeout(() => {
          opened = pointed.id;
          stopRest();
          open(pointed);
        }, delayMs);
        return;
      }
      stopRest();
      if (held(binding, e)) {
        opened = pointed.id;
        open(pointed);
      }
    },
    /** A key pressed with the pointer on `pointed`: the drawer's held key opens it there. */
    key(binding: Binding, name: string, pointed: Pointed | null, open: (pointed: Pointed) => void) {
      if (!pointed || !isKey(binding, name) || pointed.id === opened) return;
      opened = pointed.id;
      open(pointed);
    },
  };
}
export type DrawerPointer = ReturnType<typeof createDrawerPointer>;

/** Whether a click on what's pointed at is one Panki takes from the page: on a word it can look up, a Japanese letter. */
const lookable = (pointed: Pointed) => isJapanese(pointed.text.slice(0, 1));

/**
 * What's open and what's being asked about. `onView` is told every change; null is nothing showing. `popup` is where
 * the popup stands as drawn, so the pointer on it counts as on the word (`onWord`).
 */
export function createLooker(onView: (view: View | null) => void, find: Find = askWorker, popup: PopupRect = () => null) {
  let view: View | null = null;
  let pointedId: string | null = null;
  /** Counts the look-ups, so an answer that comes after the pointer has moved on is let go. */
  let asked = 0;
  /** Whether the look-up on its way was asked by hover: the pointer drifting off before it's answered lets it go. */
  let askedByHover = false;
  /** Where the pointer last was over words, and whether it's in the popup itself now (reading it: nothing under it is judged). */
  let lastAt: At | null = null;
  let inPopup = false;
  /** The look again at a popup opened by hover, while one is open and not kept (`HOVER_LOOK_MS`). */
  let watch: ReturnType<typeof setInterval> | null = null;
  const stopWatch = () => {
    if (watch !== null) clearInterval(watch);
    watch = null;
  };
  /** The pointer resting on a word before On hover looks it up (Hover delay); off it before then, nothing is asked. */
  let rest: ReturnType<typeof setTimeout> | null = null;
  const stopRest = () => {
    if (rest !== null) clearTimeout(rest);
    rest = null;
  };
  /** A popup opened by hover whose word is gone, changed, or no longer under the pointer: the screen moved under a still pointer. */
  const stale = (shown: View): boolean => {
    if (inPopup) return false;
    if (!shown.pointed.alive()) return true;
    const first = shown.found[0];
    const rect = first ? shown.pointed.measure(first.source.length) : null;
    return rect !== null && lastAt !== null && !onWord(rect, lastAt, popup());
  };
  const tell = (next: View | null) => {
    view = next;
    stopWatch();
    // Panki's own lines aren't watched: their words moving on or gone under a pointer that stood still leave the pop-up
    // open, and only a real move takes it away (`drift`).
    if (next?.hovered && !next.locked && next.pointed.where.of !== "line") {
      watch = setInterval(() => {
        // A word pointed at afresh is being looked up: its answer takes this one's place, so it isn't closed under it.
        if (view && view.hovered && !view.locked && pointedId === view.pointed.id && stale(view)) looker.close();
      }, HOVER_LOOK_MS);
    }
    onView(next);
  };
  /** The words from the letter pointed at, asked for; the answer shown unless the pointer has moved on since (`turn`). */
  const ask = (pointed: Pointed, turn: number, hover: boolean, locked = false) => {
    void find(pointed.text)
      .catch((): Found[] => [])
      .then((found) => {
        if (turn !== asked) return;
        // Kept open while a hover's look-up was on its way: the kept one stays.
        if (hover && view?.locked) return;
        const first = found[0];
        if (!first) {
          // Nothing there: a popup that's kept open stays.
          if (!view?.locked) tell(null);
          return;
        }
        tell({ pointed, found, word: pointed.measure(first.source.length), locked, hovered: hover });
      });
  };
  const looker = {
    view: () => view,
    /**
     * The key is held and the pointer is on this (or on nothing that's a word: null), at `at`; or, `hoverAfter` given,
     * the pointer is on a word where the pop-up opens on Hover, looked up once it has rested there that long (ms;
     * 0 at once). One that's kept open gives way only to another word with the key held: the pointer crossing
     * nothing, still on its own word, or only hovering, leaves it be, so one kept with Shift doesn't give way to the
     * next word merely hovered.
     */
    point(pointed: Pointed | null, at?: At, hoverAfter: number | null = null) {
      const hover = hoverAfter !== null;
      if (at) lastAt = at;
      if (view?.locked && (hover || pointed === null || (at && view.word && within(view.word, at.x, at.y)))) return;
      if (pointed === null) {
        looker.close();
        return;
      }
      if (pointed.id === pointedId) return;
      pointedId = pointed.id;
      askedByHover = hover;
      // A look-up on its way for the last word is let go now, and so is a rest begun on it.
      const turn = ++asked;
      stopRest();
      // A pop-up opened by hover goes the moment the pointer is on another word, as it goes off the words (`drift`):
      // with a delay, it would otherwise stand over the lines below while the pointer crossed them to the word wanted.
      if (hover && view?.hovered && !view.locked) tell(null);
      if (hover && hoverAfter > 0) {
        rest = setTimeout(() => {
          rest = null;
          ask(pointed, turn, hover);
        }, hoverAfter);
        return;
      }
      ask(pointed, turn, hover);
    },
    /**
     * The pointer moved off every word with no key held: a popup opened by hover closes once the pointer is well away
     * from its word (not crossing to the popup under it), and one still being looked up by hover is let go.
     */
    drift(at?: At) {
      if (at) lastAt = at;
      if (!view) {
        // A look-up asked by hover, or a rest begun towards one, is let go.
        if (askedByHover) looker.close();
        return;
      }
      if (view.locked || !view.hovered) return;
      if (at && view.word && onWord(view.word, at, popup())) return;
      looker.close();
    },
    /**
     * The key isn't held (let go, or the pointer moved without it). Let go on the word, the popup is kept open as a
     * click keeps it, so taking the mouse away after letting go on the word doesn't close it;
     * off the word, it closes, unless it's kept open already.
     */
    release(at?: At) {
      if (!view || view.locked) return;
      // Opened by hover, letting go of nothing keeps it: it goes as the pointer drifts away.
      if (view.hovered) {
        looker.drift(at);
        return;
      }
      if (at && view.word && within(view.word, at.x, at.y)) {
        looker.lock();
        return;
      }
      looker.close();
    },
    /** Whether the pointer is in the popup itself: there, what it was opened on isn't judged (it's being read). */
    inside(within: boolean) {
      inPopup = within;
    },
    /**
     * A click bound to the pop-up, on this: looked up at once and kept open, as a click keeps one open; the one open on
     * it already is kept.
     */
    press(pointed: Pointed, at?: At) {
      if (at) lastAt = at;
      if (view && view.pointed.id === pointed.id) {
        looker.lock();
        return;
      }
      pointedId = pointed.id;
      askedByHover = false;
      const turn = ++asked;
      stopRest();
      ask(pointed, turn, false, true);
    },
    /** A click: it stays open now until a click somewhere else. */
    lock() {
      if (view && !view.locked) tell({ ...view, locked: true });
    },
    close() {
      asked++;
      stopRest();
      pointedId = null;
      askedByHover = false;
      if (view !== null) tell(null);
    },
  };
  return looker;
}

const SKIPPED = "rt, rp, script, style, noscript, textarea, input, select, [contenteditable='true'], [contenteditable='']";
/** How much of the text on either side of the word is read, for its sentence. */
const AROUND = 400;

/** The text node and letter at a point of the screen, as the browser reports the nearest place to put a cursor. */
function caretAt(x: number, y: number): { node: Text; offset: number } | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return position && position.offsetNode instanceof Text ? { node: position.offsetNode, offset: position.offset } : null;
  }
  // Chrome before 128 has only the older way.
  const range = typeof document.caretRangeFromPoint === "function" ? document.caretRangeFromPoint(x, y) : null;
  return range && range.startContainer instanceof Text ? { node: range.startContainer, offset: range.startOffset } : null;
}

function letterRect(node: Text, at: number): DOMRect {
  const range = document.createRange();
  range.setStart(node, at);
  range.setEnd(node, at + 1);
  return range.getBoundingClientRect();
}

const within = (rect: DOMRect, x: number, y: number, margin = 1) =>
  rect.width > 0 && x >= rect.left - margin && x <= rect.right + margin && y >= rect.top - margin && y <= rect.bottom + margin;

/** The text nodes of a block that are read as its words: the readings over kanji are left out. */
function wordNodes(block: Element): Text[] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text && !node.parentElement?.closest(SKIPPED)) nodes.push(node);
  }
  return nodes;
}

/** Ids for text nodes, so the same letter pointed at again is known without reading the page again. */
const nodeIds = new WeakMap<Text, number>();
let nextNodeId = 0;
const idOf = (node: Text) => {
  let id = nodeIds.get(node);
  if (id === undefined) {
    id = ++nextNodeId;
    nodeIds.set(node, id);
  }
  return id;
};

/** The words on the page under a point of the screen; null when the point isn't on a letter of the page's own text. */
export function pointedOnPage(x: number, y: number, where: Where): Pointed | null {
  const caret = caretAt(x, y);
  if (!caret || caret.node.parentElement?.closest(SKIPPED)) return null;
  const { node } = caret;
  // The browser gives the nearest place for a cursor, even past the end of a line: the letter must really be under the point.
  const at = [caret.offset, caret.offset - 1].find((i) => i >= 0 && i < node.data.length && within(letterRect(node, i), x, y));
  if (at === undefined) return null;
  const nodes = wordNodes(blockOf(node));
  const index = nodes.indexOf(node);
  if (index < 0) return null;
  // The block's words from a little before this node to a little after it: enough for the sentence, never the whole page.
  let before = "";
  for (let i = index - 1; i >= 0 && before.length < AROUND; i--) before = (nodes[i]?.data ?? "") + before;
  let after = "";
  for (let i = index + 1; i < nodes.length && after.length < AROUND; i++) after += nodes[i]?.data ?? "";
  const text = before + node.data + after;
  const start = before.length + at;
  const data = node.data;
  return {
    id: `${idOf(node)}:${at}`,
    text: text.slice(start, start + 32),
    context: { text, at: start },
    where,
    alive: () => node.isConnected && node.data === data,
    measure(length) {
      // From the letter on, across the nodes after it, as many letters as the word has.
      const range = document.createRange();
      range.setStart(node, at);
      let left = length;
      for (let i = index; i < nodes.length; i++) {
        const there = nodes[i];
        if (!there) break;
        const from = i === index ? at : 0;
        const room = there.data.length - from;
        if (left <= room) {
          range.setEnd(there, from + left);
          return range.getBoundingClientRect();
        }
        left -= room;
      }
      return null;
    },
  };
}

type PageLook = {
  /** What opens the pop-up over what the pointer is on (null: wherever it last was). */
  popup: (target: EventTarget | null) => Binding;
  /** What opens the Card drawer there; None where it can't open (the options page's sentences to try). */
  drawer: (target: EventTarget | null) => Binding;
  /** Opens the Card drawer on a word of the page, looked up first; none where it can't open. */
  openDrawer?: (pointed: Pointed) => void;
  /** How long the pointer rests on a word there before Hover opens it, ms (Hover delay). */
  delay: (target: EventTarget | null) => number;
  /** Whether looking up works over what the pointer is on right now (the settings, a dictionary to look in). */
  on: (target: EventTarget | null) => boolean;
  /** What a point on the page is: the site's captions or ordinary text; null where nothing is looked up (the options page looks only in its own lines to try). */
  whereAt: (target: EventTarget | null) => Where | null;
  /** Whether an event happened in the popup itself. */
  inPopup: (e: Event) => boolean;
};

/**
 * The pointer moving over words where the pop-up opens on Hover: onto a word opens its popup once the pointer has
 * rested on it for `delayMs` (or moves it there), off every word lets a popup opened so drift away.
 */
export function hoverOver(looker: Looker, pointed: Pointed | null, at: At, delayMs: number): void {
  if (pointed) looker.point(pointed, at, delayMs);
  else looker.drift(at);
}

/**
 * Listens on the page for pointing at its words: moves with a key held or resting, the key pressed and let go, a click
 * bound to the pop-up or the drawer, or keeping the popup open or closing it, a scroll. What's in Panki's own places is
 * left to them (the line under the player listens for itself, and hands in where the pointer is on it: `pointedBy`).
 * Gives back what stops listening.
 */
export function listenOnPage(looker: Looker, look: PageLook) {
  let x = -1;
  let y = -1;
  /** Where the pointer last was: on the page, or on one of Panki's own words (which says what it is). */
  let last: (() => Pointed | null) | null = null;
  /**
   * What opens the pop-up and the drawer where the pointer last was, and its Hover delay: the page's, or Panki's
   * subtitles' own (`pointedBy`); and how the drawer opens there.
   */
  let lastPopup: Binding | null = null;
  let lastDrawer: Binding | null = null;
  let lastDelay: number | null = null;
  let lastOpen: ((pointed: Pointed) => void) | null = null;
  const drawer = createDrawerPointer();
  const openOnPage = (pointed: Pointed) => look.openDrawer?.(pointed);
  /** The keys held, as the last move or key said; whether the pointer is on the page's own text (not Panki's, not the popup); and what it pointed at last there. */
  let mods = { shiftKey: false, ctrlKey: false, altKey: false };
  let onPage = false;
  let lastId: string | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    // A move the browser sends with the pointer where it was (what's under it changed: Panki's line gone) isn't one:
    // the page's own text changing under a still pointer is the look again's (`relook`), and Panki's lines' a real move's.
    if (e.clientX === x && e.clientY === y) return;
    // Where the pointer is, wherever it is: letting go of the key on the word keeps the popup, even on Panki's own line.
    x = e.clientX;
    y = e.clientY;
    mods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey };
    // The popup's own room is the popup's, wherever it's drawn (on the options page it isn't in a place of Panki's).
    const inPopup = look.inPopup(e);
    looker.inside(inPopup);
    onPage = false;
    if (inPanki(e) || inPopup) return;
    const where = look.on(e.target) ? look.whereAt(e.target) : null;
    last = where === null ? null : () => pointedOnPage(x, y, where);
    lastPopup = look.popup(e.target);
    lastDrawer = look.drawer(e.target);
    lastDelay = look.delay(e.target);
    lastOpen = openOnPage;
    onPage = last !== null;
    const pointed = last ? last() : null;
    lastId = pointed?.id ?? null;
    pointWith(looker, lastPopup, lastDelay, e, pointed, { x, y });
    drawer.move(lastDrawer, lastDelay, e, pointed, openOnPage);
  };
  // The page's own text changing under a pointer that stood still (the site's captions as the video plays): what now
  // stands there is pointed at as a move onto it would, through the same `pointWith`: a word that comes under the
  // pointer is hovered whether the pointer moved or the word did. Panki's own lines don't: there only a real move points
  // (`Line.tsx` → `LineLook.under`).
  const relook = setInterval(() => {
    if (!onPage || !last) return;
    const pointed = last();
    if ((pointed?.id ?? null) === lastId) return;
    lastId = pointed?.id ?? null;
    pointWith(looker, lastPopup ?? look.popup(null), lastDelay ?? look.delay(null), mods, pointed, { x, y });
    drawer.move(lastDrawer ?? look.drawer(null), lastDelay ?? look.delay(null), mods, pointed, openOnPage);
  }, HOVER_LOOK_MS);
  // Keys typed in Panki's own fields (the drawer's) are theirs: a capital letter isn't a look-up.
  const onDown = (e: KeyboardEvent) => {
    mods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey };
    if (inPanki(e)) return;
    if (e.key === "Escape") looker.close();
    // A pop-up opened by hover is kept open by Shift, wherever it is: on Panki's line a click is a pick, which opens
    // the drawer, so a click can't be what keeps it there.
    const view = looker.view();
    if (!e.repeat && e.key === HOVER_KEEP && view?.hovered && !view.locked) {
      looker.lock();
      return;
    }
    // Where looking up is off, the pointer's last place is none (`onMove`); Panki's line sets its own only while it's on.
    if (e.repeat || !last) return;
    // The word under the pointer now: one gone with its line (the pointer stood still as it went) is none.
    const there = last();
    const now = there && there.alive() ? there : null;
    if (isKey(lastPopup ?? look.popup(null), e.key)) looker.point(now, { x, y });
    drawer.key(lastDrawer ?? look.drawer(null), e.key, now, lastOpen ?? openOnPage);
  };
  const onUp = (e: KeyboardEvent) => {
    mods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey };
    if (!inPanki(e) && isKey(lastPopup ?? look.popup(null), e.key)) looker.release({ x, y });
  };
  // A click on the page's text bound to the pop-up or the drawer opens it, taken from the page only on a word Panki can
  // look up; on the popup's own word, it keeps the popup open. A click anywhere else but the popup closes it, however it
  // was kept open: in Panki's own places too (the line's empty room, the drawer).
  const onClick = (e: MouseEvent) => {
    if (look.inPopup(e)) return;
    const view = looker.view();
    const onItsWord = view?.word ? within(view.word, e.clientX, e.clientY) : false;
    // A word of Panki's line takes its own press (`Line.tsx` → `LineLook.press`).
    if (inPanki(e)) {
      if (view && !onItsWord) looker.close();
      return;
    }
    // Panki's, not the page's: it doesn't also press a link the word is in.
    const take = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    const gesture = clickOf(e);
    const drawerBy = look.drawer(e.target);
    if (view && onItsWord) {
      take();
      // Bound to the drawer, a click opens it from a pop-up that's kept or opened by hover; one held open, it keeps.
      if (gesture !== null && gesture === drawerBy && look.openDrawer && (view.hovered || view.locked)) {
        looker.close();
        look.openDrawer(view.pointed);
        return;
      }
      looker.lock();
      return;
    }
    const where = look.on(e.target) ? look.whereAt(e.target) : null;
    const pointed = where && gesture !== null ? pointedOnPage(e.clientX, e.clientY, where) : null;
    if (pointed && lookable(pointed)) {
      if (gesture === look.popup(e.target)) {
        take();
        looker.press(pointed, { x: e.clientX, y: e.clientY });
        return;
      }
      if (gesture === drawerBy && look.openDrawer) {
        take();
        looker.close();
        look.openDrawer(pointed);
        return;
      }
    }
    if (view) looker.close();
  };
  /** Panki's own line drawn again under a pointer that stood still: what's under it now, known for a key pressed, never pointed at. */
  function standsOn(pointed: () => Pointed | null, popup: Binding, drawerBy: Binding, delay: number, open: (pointed: Pointed) => void) {
    last = pointed;
    lastPopup = popup;
    lastDrawer = drawerBy;
    lastDelay = delay;
    lastOpen = open;
    onPage = false;
  }
  const onScroll = () => looker.release();
  const onBlur = () => looker.release();
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("keydown", onDown, true);
  document.addEventListener("keyup", onUp, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("blur", onBlur);
  return {
    /**
     * Panki's own line says where the pointer is when it's over one of its words, what opens the pop-up and the drawer
     * there and its Hover delay (its own: `lookBySubtitles`, `drawerBySubtitles`, `lookDelayMsSubtitles`), and how the
     * drawer opens on its words; and hands its moves to the drawer's pointing, so a key held or a rest opens it there.
     */
    pointedBy(pointed: () => Pointed | null, popup: Binding, drawerBy: Binding, delay: number, open: (pointed: Pointed) => void, e: Mods) {
      standsOn(pointed, popup, drawerBy, delay, open);
      drawer.move(drawerBy, delay, e, pointed(), open);
    },
    standsOn,
    stop() {
      clearInterval(relook);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("keydown", onDown, true);
      document.removeEventListener("keyup", onUp, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", onBlur);
    },
  };
}
