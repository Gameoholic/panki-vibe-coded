import { useSyncExternalStore } from "react";
import { isJapanese } from "@web/words";
import { deinflect, isWordKind } from "../dictionary/deinflect";
import type { Lattice } from "../dictionary/found";
import { wordsOf } from "../dictionary/split";
import { LATTICE_MAX, askKnown, askLattice } from "../messages";
import { paintCss, type MarkPaint } from "../seekLook";
import { literalOf } from "../ui/styles";

/**
 * Words already in the account's cards, marked where they stand (the owner, 2026-10-25: "highlights words that are
 * already in my cards… both subtitles and everywhere… so they can be separate… make colour customizable"). What's
 * known is the words every card is called by, from Panki through the worker (`askKnown`), with the two switches and
 * the colour (`storage.ts` → `knownSubtitles`, `knownPages`, `knownColour`). A word in a line is one of them as it's
 * written, or once its endings are undone (`deinflect`: 食べました is 食べる's). Lines are split into words the one
 * way (`split.ts` → `wordsOf`): Panki's own lines under and over a video mark their word buttons (`ui/Line.tsx`'s
 * `known`); any other text, the site's own captions among it, is marked on the browser's own highlight layer (the CSS
 * Custom Highlight API), which draws over the page's text without changing a node of it.
 */

export type KnownNow = { words: ReadonlySet<string>; subtitles: boolean; pages: boolean; colour: MarkPaint };
const NOTHING: KnownNow = { words: new Set(), subtitles: false, pages: false, colour: "green" };

let now: KnownNow = NOTHING;
const followers = new Set<() => void>();
const subscribe = (follower: () => void) => {
  followers.add(follower);
  return () => {
    followers.delete(follower);
  };
};
const current = () => now;

/** What's known as it stands, asked of the worker again: as a page opens, gets the focus, and after a card is added. */
export async function refreshKnown(): Promise<void> {
  const answer = await askKnown();
  if (!answer.ok) return;
  // The same again (the usual answer when the page only got the focus back) changes nothing and reads nothing again.
  const same = answer.subtitles === now.subtitles && answer.pages === now.pages && answer.colour === now.colour && answer.words.length === now.words.size && answer.words.every((word) => now.words.has(word));
  if (same) return;
  now = { words: new Set(answer.words), subtitles: answer.subtitles, pages: answer.pages, colour: answer.colour };
  for (const follower of followers) follower();
}

/** Asked as the page opens and again whenever it gets the focus back (the options page may have changed a switch). Once per page. */
let started = false;
export function startKnown(): void {
  if (started) return;
  started = true;
  void refreshKnown();
  window.addEventListener("focus", () => void refreshKnown());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshKnown();
  });
}

/** What's known, drawn again whenever it changes. */
export function useKnown(): KnownNow {
  return useSyncExternalStore(subscribe, current);
}

/** Whether a word, as it stands in a line, is one a card is called by: as written, or a dictionary form its endings undo to (a する verb's noun too). */
export function knownIn(words: ReadonlySet<string>, text: string): boolean {
  const said = text.trim();
  if (said === "" || words.size === 0) return false;
  if (words.has(said)) return true;
  return deinflect(said).some(({ text: form, kind }) => isWordKind(kind) && (words.has(form) || (kind === "vs" && form.endsWith("する") && words.has(form.slice(0, -2)))));
}

/** The name the page's highlight layer knows Panki's marks by. */
const HIGHLIGHT = "panki-known";
/** How strongly a known word is tinted: its colour mixed with nothing, so the words stay readable on any page. */
const TINT = "38%";
/** Text that isn't read: readings over kanji, scripts, what's typed into. */
const SKIPPED = "rt, rp, script, style, noscript, textarea, input, select, [contenteditable='true'], [contenteditable='']";
/** How many lines are asked of the worker at once, so a long page doesn't hold up the popup. */
const IN_FLIGHT = 4;
/** How long the page must stay still after a change before it's read again: a page being built changes a lot at once. */
const SETTLE_MS = 300;

/** How a known word is tinted, in a colour as the page can have it. */
export const tintOf = (colour: string) => `color-mix(in srgb, ${colour} ${TINT}, transparent)`;

/**
 * Marks the known words in a page's own text, on the browser's highlight layer: what's in a video's subtitles
 * (`isSubtitles`, the site's own captions) by the subtitles switch, everything else by the pages switch. Each line is
 * split by the dictionary once its words are in (asked a few at a time, each line once); until then the browser's own
 * split stands in. The page is read again where it changes, after it settles. A browser without the highlight layer
 * marks nothing.
 */
export function markKnownOnPage(options: { isSubtitles?: (element: Element) => boolean } = {}): void {
  if (typeof Highlight === "undefined" || !("highlights" in CSS)) return;
  const highlight = new Highlight();
  CSS.highlights.set(HIGHLIGHT, highlight);
  const style = document.createElement("style");

  /** Every text node read so far that's in Japanese and where marks are wanted, with the marks on it. */
  const marked = new Map<Text, Range[]>();
  const lattices = new Map<string, Lattice>();
  const asked = new Set<string>();
  const queue: string[] = [];
  let flying = 0;
  /** Lines whose words came in since the last reading: the nodes holding them are marked again. */
  const answered = new Set<string>();
  /** What's changed since the last reading. */
  const changed = new Set<Node>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wanted = () => now.words.size > 0 && (now.subtitles || now.pages);

  function pump() {
    while (flying < IN_FLIGHT && queue.length > 0) {
      const text = queue.shift();
      if (text === undefined) break;
      flying++;
      void askLattice(text).then((answer) => {
        flying--;
        if (answer.ok) {
          lattices.set(text, answer.lattice);
          answered.add(text);
          soon();
        }
        pump();
      });
    }
  }
  function ask(text: string) {
    if (asked.has(text) || text.length > LATTICE_MAX) return;
    asked.add(text);
    queue.push(text);
    pump();
  }

  function unmark(node: Text) {
    for (const range of marked.get(node) ?? []) highlight.delete(range);
    marked.delete(node);
  }
  function mark(node: Text) {
    unmark(node);
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIPPED) || !isJapanese(node.data)) return;
    const inSubtitles = options.isSubtitles?.(parent) ?? false;
    if (!(inSubtitles ? now.subtitles : now.pages)) return;
    const text = node.data;
    const lattice = lattices.get(text) ?? null;
    if (!lattice) ask(text);
    const ranges: Range[] = [];
    for (const token of wordsOf(text, lattice)) {
      if (!token.word || !knownIn(now.words, token.text)) continue;
      const range = new Range();
      range.setStart(node, token.start);
      range.setEnd(node, token.end);
      highlight.add(range);
      ranges.push(range);
    }
    marked.set(node, ranges);
  }
  function read(root: Node) {
    if (root instanceof Text) {
      mark(root);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node instanceof Text) mark(node);
  }

  function settle() {
    timer = null;
    for (const node of [...marked.keys()]) if (!node.isConnected) unmark(node);
    if (!wanted()) {
      highlight.clear();
      marked.clear();
      changed.clear();
      answered.clear();
      return;
    }
    for (const root of changed) if (root.isConnected) read(root);
    changed.clear();
    if (answered.size > 0) {
      for (const node of [...marked.keys()]) if (answered.has(node.data)) mark(node);
      answered.clear();
    }
  }
  function soon() {
    if (timer === null) timer = setTimeout(settle, SETTLE_MS);
  }

  /** The colour, on the page's highlight layer, as the colour itself: the app's tokens don't reach the page. */
  function paint() {
    style.textContent = `::highlight(${HIGHLIGHT}) { background-color: ${tintOf(literalOf(paintCss(now.colour)))}; }`;
    if (!style.isConnected) (document.head ?? document.documentElement).append(style);
  }

  new MutationObserver((records) => {
    if (!wanted()) return;
    for (const record of records) {
      if (record.type === "characterData") changed.add(record.target);
      else for (const node of record.addedNodes) changed.add(node);
    }
    soon();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // Read whole again whenever what's known changes: the words, a switch, the colour.
  const again = () => {
    paint();
    for (const node of [...marked.keys()]) unmark(node);
    changed.add(document.body ?? document.documentElement);
    soon();
  };
  subscribe(again);
  again();
}
