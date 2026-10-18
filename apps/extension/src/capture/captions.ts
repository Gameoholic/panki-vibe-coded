import { CUES_MAX, type MediaCues } from "@panki/contracts";
import { isJapanese } from "@web/words";

/**
 * One line of a video's captions as it was shown: its words, and where in the video it began and ended, in the video's
 * own seconds. `end` is null while it's being written for the first time. Once it has one it keeps it, also while it's
 * on screen again later (a rewind, a clip played back); for a line the video jumped away from part-way, the end is
 * where the video was, and `unfinished()` says so while that line is being written again. A caption shown whole is one
 * line; captions made by the site's own listening come a row at a time and a word at a time, and there each row is a line.
 */
export type Line = {
  id: number;
  text: string;
  start: number;
  end: number | null;
  /** When each stretch of it appeared: the character it starts at, and the video's time then. One for a caption shown whole; one per word or so for a row written as it's spoken. */
  marks: readonly { at: number; time: number }[];
  /** The stretch of talk it belongs to (lines that follow one another without a silence), named by its first line's id, and its place in it, counted from 0. */
  run: number;
  seq: number;
};

/** How many lines are kept: enough for the two rows under the player, and the lines either side of a sentence for a longer clip. */
const KEEP = 24;
/** A line seen again within this of where it was (a rewind, the replay that records it) is the same line, not a new one. */
const SAME = 0.6;
/** A line follows another, in the same stretch of talk, when it began no longer after the other ended than this. A longer silence starts a new stretch. */
const NEAR = 4;

function clean(text: string): string {
  return text.replace(/[​‌﻿]/g, "").replace(/\s+/g, " ").trim();
}

/** What stands between two pieces read as one text: nothing in Japanese, a space in a language that has them. */
function joint(before: string, after: string): string {
  return before === "" || isJapanese(before.slice(-1)) || isJapanese(after.slice(0, 1)) ? "" : " ";
}
function joinRows(rows: readonly string[]): string {
  return rows.reduce((text, row) => text + joint(text, row) + row, "");
}

/** Lines read as one text, with where each begins in it. */
export type Parts = readonly { line: Line; at: number }[];
export function transcriptOf(lines: readonly Line[]): { text: string; parts: Parts } {
  let text = "";
  const parts: { line: Line; at: number }[] = [];
  for (const line of lines) {
    text += joint(text, line.text);
    parts.push({ line, at: text.length });
    text += line.text;
  }
  return { text, parts };
}

/** The line a character of such a text is in, and where in that line. */
export function lineAt(parts: Parts, offset: number): { line: Line; offset: number } | null {
  const part = parts.filter((p) => p.at <= offset).at(-1) ?? parts[0];
  return part ? { line: part.line, offset: Math.max(0, Math.min(offset - part.at, part.line.text.length)) } : null;
}

/** When the stretch of a line holding a character appeared. */
export function timeOf(line: Line, offset: number): number {
  let time = line.start;
  for (const mark of line.marks) if (mark.at <= offset) time = mark.time;
  return time;
}

/**
 * When the words from a character of a line on appeared: the moment the words before it were over. For the line's first
 * character that is when the line began; when nothing was written from there on by itself, the line's own end.
 */
export function timeAfter(line: Line, offset: number): number | null {
  return line.marks.find((mark) => mark.at >= offset)?.time ?? line.end;
}

/**
 * A stretch of such a text that appeared in one go: a word or so of the site's own captions, the whole of a caption
 * shown whole. Where it is in the text, when it appeared, and when what follows it did (null while it's the last of a
 * line still being written). These are the places a clip can begin and end without cutting a word in two.
 */
export type Beat = { from: number; to: number; start: number; end: number | null };

/**
 * What's said in a stretch of the video (a clip being recorded), from the lines being read (the transcript or the
 * site's captions, as `Line`s): each line that's said in it, from the stretch's own start, in ms, and when each piece of
 * it is said, so a card plays the clip with its words in sync (the contracts' `MediaCues`). A line that began before the
 * stretch shows from its start; one still being written ends with it. At most `CUES_MAX`.
 */
export function cuesOf(lines: readonly Line[], from: number, to: number): MediaCues {
  const ms = (seconds: number) => Math.max(0, Math.round((seconds - from) * 1000));
  const cues: MediaCues = [];
  for (const line of lines) {
    const end = line.end ?? to;
    if (line.text.trim() === "" || line.text.length > 500 || end <= from || line.start >= to) continue;
    const startMs = ms(line.start);
    const endMs = ms(Math.min(end, to));
    if (endMs <= startMs) continue;
    const marks = line.marks.filter((m) => m.at < line.text.length).map((m) => ({ at: m.at, ms: ms(m.time) }));
    cues.push({ text: line.text, startMs, endMs, marks: marks.slice(0, 200) });
  }
  return cues.sort((a, b) => a.startMs - b.startMs).slice(0, CUES_MAX);
}

export function beatsOf(parts: Parts): Beat[] {
  const beats: Beat[] = [];
  for (const { line, at } of parts) {
    line.marks.forEach((mark, i) => {
      const next = line.marks[i + 1];
      beats.push({ from: at + mark.at, to: at + (next ? next.at : line.text.length), start: mark.time, end: next ? next.time : line.end });
    });
  }
  return beats;
}

/**
 * The rows the player's caption area shows right now, top to bottom. Nothing is fetched and nothing of the player's is
 * called: this reads the words the player has already drawn on the page. The class names are the player's own and are
 * the one thing here that can go stale when the site changes; a missing one reads as no caption, never as a crash.
 * A caption shown whole comes back as one row, however many rows it's drawn on; the site's own listening captions
 * roll up a row at a time, and each of their rows comes back by itself. For an instant, as they roll, the player holds
 * one row more than it shows; that's only how many are read here, and never how many Panki draws.
 */
function readRows(area: Element): string[] {
  const shown: string[] = [];
  for (const box of area.querySelectorAll(".caption-window")) {
    const rowEls = box.querySelectorAll(".caption-visual-line");
    const rows = Array.from(rowEls.length > 0 ? rowEls : [box], (row) => clean(row.textContent ?? "")).filter((row) => row !== "");
    if (rows.length === 0) continue;
    if (box.classList.contains("ytp-caption-window-rollup")) shown.push(...rows);
    else shown.push(joinRows(rows));
  }
  return shown;
}

export type Captions = ReturnType<typeof createCaptions>;

/**
 * Watches one video's captions and keeps the last few lines with their times. `attach` is told, as often as wanted,
 * which video and which caption area are the player's now; `subscribe` / `snapshot` are for a screen that draws the
 * lines, and the rest answer questions about one line by its id. How the lines are laid out for reading is the
 * screen's own business: the player's rows are read here only to know what was said and when.
 */
export function createCaptions() {
  let video: HTMLVideoElement | null = null;
  let area: Element | null = null;
  let observer: MutationObserver | null = null;
  /** In the order they come in the video, whatever order they were seen in. */
  let lines: readonly Line[] = [];
  /** The line being written right now: the bottom row. */
  let openId: number | null = null;
  /** The line last written, for when none is: what was just said. */
  let lastId: number | null = null;
  /**
   * The lines that were heard out: over because the captions moved on, not because the video jumped away part-way
   * through them. A line cut short has an end too (where the video was), but it isn't known to be all of it.
   */
  const heardOut = new Set<number>();
  let nextId = 1;
  /** Where the video was the last time it said so: a line cut off by a jump ended there, not where the jump landed. */
  let lastTime = 0;
  const listeners = new Set<() => void>();
  const closers = new Set<(line: Line) => void>();

  const byId = (id: number | null) => lines.find((line) => line.id === id) ?? null;
  const put = (line: Line) => {
    lines = lines.map((other) => (other.id === line.id ? line : other));
  };
  /**
   * A line never seen before joins the others, in the stretch of talk of the line it follows or as the first of a new
   * one. The lines nearest in time are the ones kept, so a jump far back or ahead never pushes out what was just seen.
   */
  function add(text: string, start: number, end: number | null): Line {
    const before = lines.filter((line) => line.start <= start).at(-1);
    const follows = before !== undefined && (before.end === null || start - before.end <= NEAR);
    const id = nextId++;
    const line: Line = { id, text, start, end, marks: [{ at: 0, time: start }], run: follows ? before.run : id, seq: follows ? before.seq + 1 : 0 };
    const nearest = [...lines, line].sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start)).slice(0, KEEP);
    lines = nearest.sort((a, b) => a.start - b.start);
    return line;
  }
  function tell(closed: Line | null) {
    for (const listener of listeners) listener();
    if (closed) for (const closer of closers) closer(closed);
  }
  function onClose(closer: (line: Line) => void) {
    closers.add(closer);
    return () => {
      closers.delete(closer);
    };
  }
  /**
   * The line being written is over, heard out or cut short by a jump; null when none was. Nobody is told yet: whoever
   * closed it tells, once it has done the rest.
   */
  function closeOpen(at: number, wasHeardOut: boolean): Line | null {
    const open = byId(openId);
    openId = null;
    if (!open) return null;
    // A line that had an end already and came back on screen keeps it, when it's left early this time.
    const closed: Line = { ...open, end: Math.max(open.start + 0.2, at, open.end ?? 0) };
    if (wasHeardOut) heardOut.add(open.id);
    put(closed);
    return closed;
  }
  const longer = (line: Line, text: string, now: number): Line => ({ ...line, text, marks: [...line.marks, { at: line.text.length, time: now }] });

  function read() {
    if (!video || !area) return;
    const now = video.currentTime;
    const rows = readRows(area);
    // The bottom row is the one being written; the rows above it were, a moment ago.
    const bottom = rows.at(-1) ?? "";
    const open = byId(openId);
    // A line that had an end and is on screen again (a rewind, a clip played back) is written out afresh by the
    // player, a word at a time, so for a while its row holds only its beginning. It's the same line throughout.
    const again = open !== null && open.end !== null && bottom !== "" && open.text.startsWith(bottom) && now < open.end;
    // The same line, as it was or longer (the site's own captions come a word at a time); anything else and it's over.
    const goesOn = open !== null && (bottom.startsWith(open.text) || again);
    // Heard out, unless the row changed because the video is on its way somewhere else.
    const closed = goesOn ? null : closeOpen(now, !video.seeking);
    for (const row of rows.slice(0, -1)) {
      // A row above the bottom one is a line that was being written a moment ago: the same words, or, for the one
      // that has only just moved up, the same with a last word gained on the way.
      const others = lines.filter((line) => line.id !== openId);
      const justNow = others.at(-1);
      const known = others.filter((line) => line.text === row).at(-1) ?? (justNow && row.startsWith(justNow.text) ? justNow : undefined);
      if (known) {
        if (row !== known.text) put(longer(known, row, now));
      } else if (!open) {
        // Never seen written, and nothing was being followed: Panki arrived with it already there. It's kept from
        // now on, with no more known of its time than this moment. (A row that doesn't match while lines are being
        // followed is the player rewording one; what was read as it was written stands.)
        add(row, now, now);
      }
    }
    if (goesOn) {
      if (bottom.length > open.text.length) put(longer(open, bottom, now));
    } else if (bottom !== "") {
      // Known already and on screen again: the whole of it, about where it was; or only its beginning, inside its own
      // time (the player writing it out once more). Without the second, every time a clip was played back its lines
      // would be taken for new ones, and would crowd out the ones being added.
      const seen =
        lines.find((line) => line.text === bottom && now >= line.start - SAME && now <= (line.end ?? line.start) + SAME) ??
        lines.find((line) => line.end !== null && line.text.startsWith(bottom) && now >= line.start - SAME && now < line.end);
      if (seen) {
        // Put back as it is: nothing about it has changed, but whoever draws the lines is told it's the one being said.
        put({ ...seen });
        openId = lastId = seen.id;
      } else {
        openId = lastId = add(bottom, now, null).id;
      }
    }
    tell(closed);
  }
  const onTime = () => {
    if (video && !video.seeking) lastTime = video.currentTime;
  };
  const onSeeking = () => tell(closeOpen(lastTime, false));

  return {
    attach(nextVideo: HTMLVideoElement | null, nextArea: Element | null) {
      if (nextVideo !== video) {
        video?.removeEventListener("timeupdate", onTime);
        video?.removeEventListener("seeking", onSeeking);
        video = nextVideo;
        lastTime = video?.currentTime ?? 0;
        video?.addEventListener("timeupdate", onTime);
        video?.addEventListener("seeking", onSeeking);
      }
      if (nextArea !== area) {
        observer?.disconnect();
        area = nextArea;
        observer = area ? new MutationObserver(read) : null;
        if (area) observer?.observe(area, { childList: true, subtree: true, characterData: true });
        read();
      }
    },
    /** Another video: nothing of the last one's lines applies. */
    reset() {
      openId = lastId = null;
      lines = [];
      heardOut.clear();
      tell(null);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => lines,
    /** Told each time a line stops being written, with its end known. */
    onClose,
    byId,
    /** The line being written, or the one last written. */
    latest: (): Line | null => byId(openId) ?? byId(lastId),
    /** The id of the line on screen being written right now, for the first time or again; null when none is. */
    writing: (): number | null => openId,
    /**
     * The id of the line on screen being written that hasn't been heard out yet: one written for the first time, or
     * one cut short before and now back. Where it ends isn't known until it's over. Null when there's none.
     */
    unfinished: (): number | null => (openId !== null && !heardOut.has(openId) ? openId : null),
  };
}
