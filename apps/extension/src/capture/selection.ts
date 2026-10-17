/** What was selected on a page, in its sentence: the sentence, and where in it (in characters) the selection sits. */
export type Taken = { sentence: string; from: number; to: number };
/** A sentence found inside a longer text: the same, with where in that text it begins. */
export type Found = Taken & { at: number };

/** How far either side of a selection a sentence is looked for, in characters, when nothing ends it sooner. */
const REACH = 200;
/** A block of text longer than this isn't read through; the selection alone is taken. */
const BLOCK_MAX = 200_000;
const CLOSERS = "」』）)】］]〉》\"'”’";

/** Whether the character at `i` ends a sentence: a full stop of either writing, a line break, or a Latin stop before a space. */
function endsSentence(text: string, i: number): boolean {
  const char = text[i];
  if (char === undefined) return false;
  if ("。！？!?\n".includes(char)) return true;
  return char === "." && /\s|^$/.test(text[i + 1] ?? "");
}

/** The nearest thing around a node that is laid out as a block: the paragraph, the list item, the cell it is in. */
export function blockOf(node: Node): Element {
  let el = node instanceof Element ? node : node.parentElement;
  while (el && el !== document.body) {
    const display = getComputedStyle(el).display;
    if (!display.startsWith("inline") && !display.startsWith("ruby") && display !== "contents") return el;
    el = el.parentElement;
  }
  return document.body;
}

/**
 * A block's text with the places the selection starts and ends in it. Read node by node rather than off the block,
 * because the small readings written over kanji (furigana) are text too, and a sentence must not carry them.
 */
function readBlock(block: Element, range: Range): { text: string; from: number; to: number } | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let text = "";
  let from = -1;
  let to = -1;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text) || node.parentElement?.closest("rt, rp, script, style, noscript")) continue;
    if (node === range.startContainer) from = text.length + range.startOffset;
    if (node === range.endContainer) to = text.length + range.endOffset;
    text += node.data;
    if (text.length > BLOCK_MAX) return null;
  }
  return from >= 0 && to > from ? { text, from, to } : null;
}

/**
 * The sentence around a stretch of a text: back to the last sentence's end, on to this one's, its closing bracket with
 * it. A text with nothing in it that ends a sentence is one sentence, as far as is looked. A page's selection and a
 * video's captions are both read with this.
 */
export function sentenceAround(text: string, from: number, to: number): Found {
  let start = from;
  while (start > 0 && from - start < REACH && !endsSentence(text, start - 1)) start--;
  // What closes the sentence before (a bracket, a space) is left with it.
  while (start < from && (CLOSERS.includes(text[start] ?? "") || /\s/.test(text[start] ?? ""))) start++;
  let end = to;
  if (!endsSentence(text, to - 1)) {
    while (end < text.length && end - to < REACH) {
      end++;
      if (endsSentence(text, end - 1)) break;
    }
  }
  while (end < text.length && CLOSERS.includes(text[end] ?? "")) end++;
  // Line breaks and tabs become spaces one for one, so the selection's place holds; then the ends are trimmed.
  const raw = text.slice(start, end).replace(/[\t\r\n ]/g, " ");
  const lead = raw.length - raw.trimStart().length;
  const sentence = raw.trim();
  const clamp = (n: number) => Math.max(0, Math.min(sentence.length, n));
  return { sentence, from: clamp(from - start - lead), to: clamp(to - start - lead), at: start + lead };
}

/**
 * What's selected on the page right now, with the sentence it sits in; null when nothing is. Words selected inside a
 * box being typed into are taken with the whole of what's typed there as their surroundings.
 */
export function takeSelection(): Taken | null {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && active.type === "text")) {
    const from = active.selectionStart ?? 0;
    const to = active.selectionEnd ?? 0;
    if (to > from) return sentenceAround(active.value, from, to);
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const picked = selection.toString().replace(/\s+/g, " ").trim();
  if (!picked) return null;
  const range = selection.getRangeAt(0);
  const read = readBlock(blockOf(range.commonAncestorContainer), range);
  // The selection's ends sit somewhere that isn't plain text (an image, a reading over a kanji): the words alone, then.
  if (!read) return { sentence: picked, from: 0, to: picked.length };
  return sentenceAround(read.text, read.from, read.to);
}

/** Where on the screen the selection is, to open the panel beside it; null when there's nothing to point at. */
export function selectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}
