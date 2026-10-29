import { useMemo, useSyncExternalStore } from "react";
import { isJapanese } from "@web/words";
import type { Lattice } from "../dictionary/found";
import { wordsOf } from "../dictionary/split";
import { LATTICE_MAX, askKnown, askLattice } from "../messages";
import { paintCss, type MarkPaint } from "../seekLook";
import { literalOf } from "../ui/styles";
import type { Token } from "./words";

/**
 * Words already in the account's cards, marked where they stand (the owner, 2026-10-25: "highlights words that are
 * already in my cards… both subtitles and everywhere… so they can be separate… make colour customizable"). What's
 * known is the words every card is called by, from Panki through the worker (`askKnown`), with the two switches and
 * the colour (`storage.ts` → `knownSubtitles`, `knownPages`, `knownColour`). A word in a line is one of them by the
 * pop-up's own check (the owner, 2026-10-29: "the same function, same shared logic so that they can't drift apart"):
 * the word the dictionary takes it as, chosen by the pop-up's own choice (`lookup.ts` → `wordsFound`: 食べました is
 * 食べる, あえて is 敢えて), is exactly a word a card is called by (the API's `wordsInCards`, what its `cardsCalled`
 * matches against). Lines are split into words the one way (`split.ts` → `wordsOf`): Panki's own lines under and over a video mark their word buttons (`ui/Line.tsx`'s
 * `known`), by the subtitles switch (Highlight in Panki subtitles); any other text, the site's own captions among it,
 * is marked on the browser's own highlight layer (the CSS Custom Highlight API), which draws over the page's text
 * without changing a node of it, by the pages switch (Highlight globally). A word whose every card is suspended is
 * marked in a colour of its own (`suspended`, `knownSuspendedColour`; the owner, 2026-10-30: it "appears green!! in
 * both subtitles and seekbar, why is that?!").
 */

/** `suspended`: those of `words` whose every card is suspended. */
export type KnownNow = { words: ReadonlySet<string>; suspended: ReadonlySet<string>; subtitles: boolean; pages: boolean; colour: MarkPaint; suspendedColour: MarkPaint };
const NOTHING: KnownNow = { words: new Set(), suspended: new Set(), subtitles: false, pages: false, colour: "green", suspendedColour: "red" };
const sameSet = (list: readonly string[], set: ReadonlySet<string>) => list.length === set.size && list.every((item) => set.has(item));

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
  const same =
    answer.subtitles === now.subtitles &&
    answer.pages === now.pages &&
    answer.colour === now.colour &&
    answer.suspendedColour === now.suspendedColour &&
    sameSet(answer.words, now.words) &&
    sameSet(answer.suspended, now.suspended);
  if (same) return;
  now = { words: new Set(answer.words), suspended: new Set(answer.suspended), subtitles: answer.subtitles, pages: answer.pages, colour: answer.colour, suspendedColour: answer.suspendedColour };
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

/** How a word that's in the decks is marked: as any card's, or as one whose every card is suspended. */
export type KnownAs = "known" | "suspended";

/**
 * Whether a word of a split line is one a card is called by, exactly as the pop-up asks it (`Lookup.tsx` → `InCards`,
 * its word's `term`): the word the dictionary takes it as (`Token.term`); and if it is, whether only suspended cards
 * are (`KnownAs`). Nothing before the dictionary's answer is in, as the pop-up has nothing to say without one. The tint
 * on Panki's lines, the page's highlight and the seek bar's marks are all this.
 */
export function knownAs({ words, suspended }: Pick<KnownNow, "words" | "suspended">, token: Pick<Token, "term">): KnownAs | null {
  if (token.term === undefined || !words.has(token.term)) return null;
  return suspended.has(token.term) ? "suspended" : "known";
}

/** The names the page's highlight layer knows Panki's marks by: a word that's in the decks, and one only suspended cards are. */
const HIGHLIGHT: Record<KnownAs, string> = { known: "panki-known", suspended: "panki-known-suspended" };
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
 * The lines split by the dictionary for marking, a cache of their own (the line under the player's, `useWords`, keeps
 * 400 and clears, which a page's or a video's thousands of lines would turn into a loop of asking): each line asked
 * of the worker once, `IN_FLIGHT` at a time. Followers hear which line came in; the seek bar hears in batches.
 */
const lattices = new Map<string, Lattice>();
const asked = new Set<string>();
const queue: string[] = [];
let flying = 0;
const latticeFollowers = new Set<(text: string) => void>();
function pump() {
  while (flying < IN_FLIGHT && queue.length > 0) {
    const text = queue.shift();
    if (text === undefined) break;
    flying++;
    void askLattice(text).then((answer) => {
      flying--;
      if (answer.ok) {
        lattices.set(text, answer.lattice);
        for (const follower of latticeFollowers) follower(text);
      }
      pump();
    });
  }
}
/** A line's lattice when it's in; asked for when it isn't (once), the browser's split standing in meanwhile. */
function latticeFor(text: string): Lattice | null {
  const known = lattices.get(text);
  if (known) return known;
  if (!asked.has(text) && text.length <= LATTICE_MAX) {
    asked.add(text);
    queue.push(text);
    pump();
  }
  return null;
}

/** How often the seek bar's marks are worked out again while a video's lines are coming in. */
const MOMENTS_EVERY_MS = 600;
let linesVersion = 0;
const linesFollowers = new Set<() => void>();
let linesTimer: ReturnType<typeof setTimeout> | null = null;
latticeFollowers.add(() => {
  if (linesTimer !== null) return;
  linesTimer = setTimeout(() => {
    linesTimer = null;
    linesVersion++;
    for (const follower of linesFollowers) follower();
  }, MOMENTS_EVERY_MS);
});
const subscribeLines = (follower: () => void) => {
  linesFollowers.add(follower);
  return () => {
    linesFollowers.delete(follower);
  };
};

/** A line as the seek bar reads it: its text, and when each stretch of it is said (the character it starts at, the video's time then, in seconds). */
type TimedLine = { text: string; end: number | null; marks: readonly { at: number; time: number }[] };

/** A word that's in the decks, where it's said in a video, in ms: from its first letter to the next stretch, its words as said, where its line starts (its sentence), and whether only suspended cards are it. */
export type KnownMoment = { startMs: number; endMs: number; words: string; lineMs: number; suspended: boolean };

/**
 * Where in a video the words that are in the decks are said, for the seek bar (`SeekMark`'s `inDecks`): every known
 * word of every line, from when its first letter is said to when the next stretch begins (or the line ends), in ms,
 * with its words for a pin over its tick. `lines` null asks nothing (the mark hidden, or no transcript).
 */
export function useKnownMoments(lines: readonly TimedLine[] | null): KnownMoment[] {
  const known = useKnown();
  const version = useSyncExternalStore(subscribeLines, () => linesVersion);
  return useMemo(() => {
    if (!lines || known.words.size === 0) return [];
    const moments: KnownMoment[] = [];
    for (const line of lines) {
      if (!isJapanese(line.text)) continue;
      const lineAt = line.marks[0]?.time;
      if (lineAt === undefined) continue;
      for (const token of wordsOf(line.text, latticeFor(line.text))) {
        const as = token.word ? knownAs(known, token) : null;
        if (as === null) continue;
        const from = line.marks.filter((mark) => mark.at <= token.start).at(-1)?.time;
        if (from === undefined) continue;
        const to = line.marks.find((mark) => mark.at >= token.end)?.time ?? line.end ?? from;
        moments.push({ startMs: Math.round(from * 1000), endMs: Math.round(Math.max(from, to) * 1000), words: token.text, lineMs: Math.round(lineAt * 1000), suspended: as === "suspended" });
      }
    }
    return moments;
    // `version` is what says more lines' words are in.
  }, [lines, known, version]);
}

/**
 * Marks the known words in a page's own text, on the browser's highlight layer, by the pages switch (Highlight
 * globally): a site's own captions are a page's text like any other, as they go by Key to hold globally (the subtitles
 * switch is Panki's own lines alone; the owner, 2026-10-25, the two panels' words made one). Each line is split by the
 * dictionary once its words are in (asked a few at a time, each line once); until then the browser's own split stands
 * in. The page is read again where it changes, after it settles. A browser without the highlight layer marks nothing.
 */
export function markKnownOnPage(): void {
  if (typeof Highlight === "undefined" || !("highlights" in CSS)) return;
  const highlights: Record<KnownAs, Highlight> = { known: new Highlight(), suspended: new Highlight() };
  CSS.highlights.set(HIGHLIGHT.known, highlights.known);
  CSS.highlights.set(HIGHLIGHT.suspended, highlights.suspended);
  const style = document.createElement("style");

  /** Every text node read so far that's in Japanese and where marks are wanted, with the marks on it and which layer each is on. */
  const marked = new Map<Text, { range: Range; as: KnownAs }[]>();
  /** Lines whose words came in since the last reading: the nodes holding them are marked again. */
  const answered = new Set<string>();
  /** What's changed since the last reading. */
  const changed = new Set<Node>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wanted = () => now.words.size > 0 && now.pages;
  latticeFollowers.add((text) => {
    if (!wanted()) return;
    answered.add(text);
    soon();
  });

  function unmark(node: Text) {
    for (const { range, as } of marked.get(node) ?? []) highlights[as].delete(range);
    marked.delete(node);
  }
  function mark(node: Text) {
    unmark(node);
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIPPED) || !isJapanese(node.data)) return;
    const text = node.data;
    const ranges: { range: Range; as: KnownAs }[] = [];
    for (const token of wordsOf(text, latticeFor(text))) {
      const as = token.word ? knownAs(now, token) : null;
      if (as === null) continue;
      const range = new Range();
      range.setStart(node, token.start);
      range.setEnd(node, token.end);
      highlights[as].add(range);
      ranges.push({ range, as });
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
      highlights.known.clear();
      highlights.suspended.clear();
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

  /** The colours, on the page's highlight layer, as the colours themselves: the app's tokens don't reach the page. */
  function paint() {
    style.textContent =
      `::highlight(${HIGHLIGHT.known}) { background-color: ${tintOf(literalOf(paintCss(now.colour)))}; }\n` +
      `::highlight(${HIGHLIGHT.suspended}) { background-color: ${tintOf(literalOf(paintCss(now.suspendedColour)))}; }`;
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
