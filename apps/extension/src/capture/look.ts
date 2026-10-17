import type { Found } from "../dictionary/found";
import type { LookKey } from "../lookSettings";
import { askLookup } from "../messages";
import { inPanki } from "../ui/mount";
import { blockOf } from "./selection";

/**
 * Pointing at a word to look it up (the owner's way, 2026-10-14 and 15): the key held while pointing opens the word's
 * popup; moving off the word with the key still held closes it, or moves it to the next word pointed at. Letting the
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
};
/**
 * Panki's own line under the player (the caption line and the letter of it the word begins at, and how long the word
 * taken there is), the video site's own captions, or any other text on a page.
 */
export type Where = { of: "line"; lineId: number; offset: number; length: number } | { of: "captions" } | { of: "page" };

/** What's showing: the word found, where it is, and whether it's kept open (the key let go on the word, or a click). */
export type View = { pointed: Pointed; found: Found[]; word: DOMRect | null; locked: boolean };

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

/** Whether an event has the look-up key held. */
export function held(key: LookKey, e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return key === "shift" ? e.shiftKey : key === "ctrl" ? e.ctrlKey : e.altKey;
}
/** Whether a key pressed or let go is the look-up key. */
const isKey = (key: LookKey, name: string) => (key === "shift" ? name === "Shift" : key === "ctrl" ? name === "Control" : name === "Alt");

/** What's open and what's being asked about. `onView` is told every change; null is nothing showing. */
export function createLooker(onView: (view: View | null) => void, find: Find = askWorker) {
  let view: View | null = null;
  let pointedId: string | null = null;
  /** Counts the look-ups, so an answer that comes after the pointer has moved on is let go. */
  let asked = 0;
  const tell = (next: View | null) => {
    view = next;
    onView(next);
  };
  const looker = {
    view: () => view,
    /**
     * The key is held and the pointer is on this (or on nothing that's a word: null), at `at`. One that's kept open
     * gives way only to another word: the pointer crossing nothing, or still on its own word, leaves it be.
     */
    point(pointed: Pointed | null, at?: At) {
      if (view?.locked && (pointed === null || (at && view.word && within(view.word, at.x, at.y)))) return;
      if (pointed === null) {
        looker.close();
        return;
      }
      if (pointed.id === pointedId) return;
      pointedId = pointed.id;
      const turn = ++asked;
      void find(pointed.text)
        .catch((): Found[] => [])
        .then((found) => {
          if (turn !== asked) return;
          const first = found[0];
          if (!first) {
            // Nothing there: a popup that's kept open stays.
            if (!view?.locked) tell(null);
            return;
          }
          tell({ pointed, found, word: pointed.measure(first.source.length), locked: false });
        });
    },
    /**
     * The key isn't held (let go, or the pointer moved without it). Let go on the word, the popup is kept open as a
     * click keeps it (the owner, 2026-10-15: taking the mouse away after letting go on the word shouldn't close it);
     * off the word, it closes, unless it's kept open already.
     */
    release(at?: At) {
      if (!view || view.locked) return;
      if (at && view.word && within(view.word, at.x, at.y)) {
        looker.lock();
        return;
      }
      looker.close();
    },
    /** A click: it stays open now until a click somewhere else. */
    lock() {
      if (view && !view.locked) tell({ ...view, locked: true });
    },
    close() {
      asked++;
      pointedId = null;
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

const within = (rect: DOMRect, x: number, y: number) => rect.width > 0 && x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1;

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
  return {
    id: `${idOf(node)}:${at}`,
    text: text.slice(start, start + 32),
    context: { text, at: start },
    where,
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
  key: () => LookKey;
  /** Whether looking up works here right now (the setting, a dictionary to look in). */
  on: () => boolean;
  /** What a point on the page is: the site's captions or ordinary text; null where nothing is looked up (the options page looks only in its own lines to try). */
  whereAt: (target: EventTarget | null) => Where | null;
  /** Whether an event happened in the popup itself. */
  inPopup: (e: Event) => boolean;
};

/**
 * Listens on the page for pointing at its words: moves with the key held, the key pressed and let go, a click to keep
 * the popup open or to close it, a scroll. What's in Panki's own places is left to them (the line under the player
 * listens for itself). Gives back what stops listening, and `again`, which looks again where the pointer was last
 * (for Panki's line, whose own pointer moves set it).
 */
export function listenOnPage(looker: Looker, look: PageLook) {
  let x = -1;
  let y = -1;
  /** Where the pointer last was: on the page, or on one of Panki's own words (which says what it is). */
  let last: (() => Pointed | null) | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    // Where the pointer is, wherever it is: letting go of the key on the word keeps the popup, even on Panki's own line.
    x = e.clientX;
    y = e.clientY;
    // The popup's own room is the popup's, wherever it's drawn (on the options page it isn't in a place of Panki's).
    if (!look.on() || inPanki(e) || look.inPopup(e)) return;
    const where = look.whereAt(e.target);
    last = where === null ? null : () => pointedOnPage(x, y, where);
    if (!held(look.key(), e)) looker.release({ x, y });
    else looker.point(last ? last() : null, { x, y });
  };
  // Keys typed in Panki's own fields (the drawer's) are theirs: a capital letter isn't a look-up.
  const onDown = (e: KeyboardEvent) => {
    if (inPanki(e)) return;
    if (e.key === "Escape") looker.close();
    if (!e.repeat && look.on() && isKey(look.key(), e.key) && last) looker.point(last(), { x, y });
  };
  const onUp = (e: KeyboardEvent) => {
    if (!inPanki(e) && isKey(look.key(), e.key)) looker.release({ x, y });
  };
  // A click anywhere but the popup and its word closes it, however it was kept open: in Panki's own places too (the
  // line's empty room, the drawer).
  const onClick = (e: MouseEvent) => {
    const view = looker.view();
    if (!view || look.inPopup(e)) return;
    if (view.word && within(view.word, e.clientX, e.clientY)) {
      // A word of Panki's line takes its own press: it keeps the popup open, or picks the word.
      if (inPanki(e)) return;
      // The click that keeps the popup open is Panki's: it doesn't also press a link the word is in.
      e.preventDefault();
      e.stopPropagation();
      looker.lock();
      return;
    }
    looker.close();
  };
  const onScroll = () => looker.release();
  const onBlur = () => looker.release();
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("keydown", onDown, true);
  document.addEventListener("keyup", onUp, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("blur", onBlur);
  return {
    /** Panki's own line says where the pointer is when it's over one of its words. */
    pointedBy(pointed: () => Pointed | null) {
      last = pointed;
    },
    stop() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("keydown", onDown, true);
      document.removeEventListener("keyup", onUp, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", onBlur);
    },
  };
}
