/** @panki Words already in the cards, marked where they stand, and each one's cards (`startKnown`, `useKnown`, `knownAs`, `knownCards`, `markKnownOnPage`). Never a second way of marking one. */
import { useMemo, useSyncExternalStore } from "react";
import type { CalledCard } from "@panki/contracts";
import { isJapanese } from "@web/words";
import type { Lattice } from "../dictionary/found";
import { wordsOf } from "../dictionary/split";
import { localNow, onLocal } from "../local";
import { LATTICE_MAX, askKnown, askLattice, type KnownLook } from "../messages";
import { paintCss } from "../seekLook";
import { literalOf } from "../ui/styles";
import type { Token } from "./words";

/**
 * Words already in the account's cards, marked where they stand: in subtitles and on pages, each switched apart, in
 * the colour of the highest stage any card of the word stands on (By stage; New in its type's New colour, else Panki
 * blue) or in one colour that's
 * chosen. What's known is the words every card is called by, from Panki through the worker (`askKnown`); the two switches and
 * the colours are this browser's settings (`local.ts`, `Local`'s `known`). A word in a line is one of them by the
 * pop-up's own check, the same function, so the two can't drift apart:
 * the word the dictionary takes it as, chosen by the pop-up's own choice (`lookup.ts` → `wordsFound`: 食べました is
 * 食べる, あえて is 敢えて), is exactly a word a card is called by (the API's `wordsInCards`, what its `cardsCalled`
 * matches against). Lines are split into words the one way (`split.ts` → `wordsOf`): Panki's own lines under and over a video mark their word buttons (`ui/Line.tsx`'s
 * `known`), by the subtitles switch (Highlight in Panki subtitles); any other text, the site's own captions among it,
 * is marked on the browser's own highlight layer (the CSS Custom Highlight API), which draws over the page's text
 * without changing a node of it, by the pages switch (Highlight globally). A word whose every card is suspended is
 * marked in a colour of its own (`suspended`, `knownSuspendedColour`), so it never reads as a word being learned; and a
 * word any of whose cards is flagged in a colour of its own again (`flagged`, `knownFlaggedColour`), over a suspended
 * one's, since a flag is there to be acted on where the word is met.
 */

/**
 * `suspended`: those of `words` whose every card is suspended; `flagged`: those with any card flagged; `colours`: each
 * word's highest card's stage's colour, a word whose every card is new in its type's New colour, or left out when that
 * type has none; `cards`: each word's cards, what the pop-up's In your decks says. How they're marked is this browser's
 * settings' (`KnownLook`).
 */
export type KnownNow = KnownLook & { words: ReadonlySet<string>; suspended: ReadonlySet<string>; flagged: ReadonlySet<string>; colours: ReadonlyMap<string, string>; cards: ReadonlyMap<string, readonly CalledCard[]> };
type Words = Pick<KnownNow, "words" | "suspended" | "flagged" | "colours" | "cards">;
const sameSet = (list: readonly string[], set: ReadonlySet<string>) => list.length === set.size && list.every((item) => set.has(item));
const sameMap = (record: Readonly<Record<string, string>>, map: ReadonlyMap<string, string>) => Object.keys(record).length === map.size && Object.entries(record).every(([key, value]) => map.get(key) === value);
const sameCards = (record: Readonly<Record<string, readonly CalledCard[]>>, map: ReadonlyMap<string, readonly CalledCard[]>) =>
  Object.keys(record).length === map.size && Object.entries(record).every(([key, value]) => JSON.stringify(map.get(key)) === JSON.stringify(value));

/** The words, none until the worker has said; how they're marked is read from this browser's settings as they stand. */
let words: Words = { words: new Set(), suspended: new Set(), flagged: new Set(), colours: new Map(), cards: new Map() };
let now: KnownNow | null = null;
const followers = new Set<() => void>();
const subscribe = (follower: () => void) => {
  followers.add(follower);
  return () => {
    followers.delete(follower);
  };
};
/** What's known as it stands: the words, and this browser's settings for them. Only once those are in (`loadLocal`). */
function current(): KnownNow {
  const look = localNow().known;
  if (
    now === null ||
    now.subtitles !== look.subtitles ||
    now.pages !== look.pages ||
    now.byStage !== look.byStage ||
    now.colour !== look.colour ||
    now.suspendedColour !== look.suspendedColour ||
    now.flaggedColour !== look.flaggedColour ||
    now.words !== words.words
  )
    now = { ...look, ...words };
  return now;
}
const tell = () => {
  for (const follower of followers) follower();
};

/** The words as they stand, asked of the worker again: as a page opens, gets the focus, a setting changes, and after a card is added. */
export async function refreshKnown(): Promise<void> {
  const answer = await askKnown();
  if (!answer.ok) return;
  // The same again (the usual answer when the page only got the focus back) changes nothing and reads nothing again.
  if (sameSet(answer.words, words.words) && sameSet(answer.suspended, words.suspended) && sameSet(answer.flagged, words.flagged) && sameMap(answer.colours, words.colours) && sameCards(answer.cards, words.cards)) return;
  words = { words: new Set(answer.words), suspended: new Set(answer.suspended), flagged: new Set(answer.flagged), colours: new Map(Object.entries(answer.colours)), cards: new Map(Object.entries(answer.cards)) };
  tell();
}

const NO_CARDS: readonly CalledCard[] = [];
/**
 * A word's cards, as the pop-up's In your decks says them (`Lookup.tsx` → `InCards`): read from what the page already
 * holds, so the pop-up asks nothing and the box is there as the pop-up is. The same array while nothing changed, so a
 * drawing subscribed to `subscribeKnown` can read it as a snapshot.
 */
export const knownCards = (term: string): readonly CalledCard[] => words.cards.get(term) ?? NO_CARDS;
/** Told whenever what's known changes; returns how to stop. */
export const subscribeKnown = subscribe;

/**
 * Started once this browser's settings are in, once a page. The words are Panki's, asked again whenever the page gets
 * the focus back (a card added or deleted in Panki); a change of the settings is drawn at once, and asks for the words
 * again too, since the worker gives none while nothing marks them.
 */
let started = false;
export function startKnown(): void {
  if (started) return;
  started = true;
  void refreshKnown();
  onLocal((next, was) => {
    if (JSON.stringify(next.known) === JSON.stringify(was.known) && JSON.stringify(next.prefs.seek) === JSON.stringify(was.prefs.seek) && next.modules.on === was.modules.on) return;
    tell();
    void refreshKnown();
  });
  window.addEventListener("focus", () => void refreshKnown());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshKnown();
  });
}

/** What's known, drawn again whenever it changes. */
export function useKnown(): KnownNow {
  return useSyncExternalStore(subscribe, current);
}

/** How a word that's in the decks is marked: as any card's, as one whose every card is suspended, or as one a flagged card is. */
export type KnownAs = "known" | "suspended" | "flagged";

/**
 * Whether a word of a split line is one a card is called by, exactly as the pop-up asks it (`Lookup.tsx` → `InCards`,
 * its word's `term`): the word the dictionary takes it as (`Token.term`); and if it is, whether a card of it is flagged,
 * else whether only suspended cards are (`KnownAs`): a flag wins. Nothing before the dictionary's answer is in, as the
 * pop-up has nothing to say without one. The tint on Panki's lines, the page's highlight and the seek bar's marks are
 * all this.
 */
export function knownAs({ words, suspended, flagged }: Pick<KnownNow, "words" | "suspended" | "flagged">, token: Pick<Token, "term">): KnownAs | null {
  if (token.term === undefined || !words.has(token.term)) return null;
  return flagged.has(token.term) ? "flagged" : suspended.has(token.term) ? "suspended" : "known";
}

/** A word's stage's colour in CSS: its highest card's stage's, else (every card of it new, its type with no New colour) Panki blue. */
export const stageCssOf = (colours: ReadonlyMap<string, string>, term: string | undefined): string => (term !== undefined ? colours.get(term) : undefined) ?? paintCss("accent");

/** The colour a word that's in the decks (`knownAs` "known") is marked in, as CSS: its stage's under By stage, else the one chosen. */
export const knownCssOf = (known: Pick<KnownNow, "byStage" | "colour" | "colours">, token: Pick<Token, "term">): string => (known.byStage ? stageCssOf(known.colours, token.term) : paintCss(known.colour));

/** The names the page's highlight layer knows Panki's marks by: one only suspended cards are, one a flagged card is; a word that's in the decks is one per colour in use (`KNOWN_PREFIX`). */
const HIGHLIGHT: Record<Exclude<KnownAs, "known">, string> = { suspended: "panki-known-suspended", flagged: "panki-known-flagged" };
const KNOWN_PREFIX = "panki-known";
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

/**
 * A word that's in the decks, where it's said in a video, in ms: from its first letter to the next stretch, its words
 * as said, where its line starts (its sentence), and how it's marked (`knownAs`): whether only suspended cards are it,
 * whether a flagged card is (never both: a flag wins); and its stage's colour in CSS (`stageCssOf`), which the seek
 * bar's mark wears under By stage.
 */
export type KnownMoment = { startMs: number; endMs: number; words: string; lineMs: number; suspended: boolean; flagged: boolean; colour: string };

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
        moments.push({ startMs: Math.round(from * 1000), endMs: Math.round(Math.max(from, to) * 1000), words: token.text, lineMs: Math.round(lineAt * 1000), suspended: as === "suspended", flagged: as === "flagged", colour: stageCssOf(known.colours, token.term) });
      }
    }
    return moments;
    // `version` is what says more lines' words are in.
  }, [lines, known, version]);
}

/**
 * Marks the known words in a page's own text, on the browser's highlight layer, by the pages switch (Highlight
 * globally): a site's own captions are a page's text like any other, as they go by Key to hold globally (the subtitles
 * switch is Panki's own lines alone). Each line is split by the
 * dictionary once its words are in (asked a few at a time, each line once); until then the browser's own split stands
 * in. The page is read again where it changes, after it settles. A browser without the highlight layer marks nothing.
 * A highlight has one colour, so the words that are in the decks are one highlight per colour in use (by stage, a
 * colour per stage met), each made the first time its colour is.
 */
export function markKnownOnPage(): void {
  if (typeof Highlight === "undefined" || !("highlights" in CSS)) return;
  const apart: Record<Exclude<KnownAs, "known">, Highlight> = { suspended: new Highlight(), flagged: new Highlight() };
  for (const as of Object.keys(HIGHLIGHT) as Exclude<KnownAs, "known">[]) CSS.highlights.set(HIGHLIGHT[as], apart[as]);
  /** The words that are in the decks, a highlight per colour (as CSS), each under its own name. */
  const byColour = new Map<string, { name: string; highlight: Highlight }>();
  function layerOf(as: KnownAs, colour: string): Highlight {
    if (as !== "known") return apart[as];
    const had = byColour.get(colour);
    if (had) return had.highlight;
    const layer = { name: `${KNOWN_PREFIX}-${byColour.size}`, highlight: new Highlight() };
    byColour.set(colour, layer);
    CSS.highlights.set(layer.name, layer.highlight);
    paint();
    return layer.highlight;
  }
  const style = document.createElement("style");

  /** Every text node read so far that's in Japanese and where marks are wanted, with the marks on it and which layer each is on. */
  const marked = new Map<Text, { range: Range; layer: Highlight }[]>();
  /** Lines whose words came in since the last reading: the nodes holding them are marked again. */
  const answered = new Set<string>();
  /** What's changed since the last reading. */
  const changed = new Set<Node>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const wanted = () => current().words.size > 0 && current().pages;
  latticeFollowers.add((text) => {
    if (!wanted()) return;
    answered.add(text);
    soon();
  });

  function unmark(node: Text) {
    for (const { range, layer } of marked.get(node) ?? []) layer.delete(range);
    marked.delete(node);
  }
  function mark(node: Text) {
    unmark(node);
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIPPED) || !isJapanese(node.data)) return;
    const text = node.data;
    const ranges: { range: Range; layer: Highlight }[] = [];
    const known = current();
    for (const token of wordsOf(text, latticeFor(text))) {
      const as = token.word ? knownAs(known, token) : null;
      if (as === null) continue;
      const range = new Range();
      range.setStart(node, token.start);
      range.setEnd(node, token.end);
      const layer = layerOf(as, knownCssOf(known, token));
      layer.add(range);
      ranges.push({ range, layer });
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
      for (const highlight of Object.values(apart)) highlight.clear();
      for (const { highlight } of byColour.values()) highlight.clear();
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
    const { suspendedColour, flaggedColour } = current();
    style.textContent = [
      ...[...byColour.entries()].map(([colour, { name }]) => `::highlight(${name}) { background-color: ${tintOf(literalOf(colour))}; }`),
      `::highlight(${HIGHLIGHT.suspended}) { background-color: ${tintOf(literalOf(paintCss(suspendedColour)))}; }`,
      `::highlight(${HIGHLIGHT.flagged}) { background-color: ${tintOf(literalOf(paintCss(flaggedColour)))}; }`,
    ].join("\n");
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
    // Colours no longer in use are let go; each is made again the first time it's met.
    for (const { name } of byColour.values()) CSS.highlights.delete(name);
    byColour.clear();
    changed.add(document.body ?? document.documentElement);
    soon();
  };
  subscribe(again);
  again();
}
