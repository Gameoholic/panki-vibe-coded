import type { Transcript } from "@panki/contracts";
import type { Captions, Line } from "../capture/captions";
import { coveredAt, linesOf, widestOf, type TranscriptLine } from "./lines";
import type { Transcriber } from "./transcriber";

/**
 * What the line under the player reads, by this browser's pick (`subtitles.ts`): an engine's transcript where it
 * covers this moment of the video and nothing where it doesn't yet (never the site's captions in its place: the
 * owner, 2026-10-17, "not even as a fallback"), the site's own captions when they're the pick and the site has shown
 * any, nothing for "None". Both come in the same shape (`captions.ts` → `Line`), and the screen asks this one source,
 * so a pick, a sentence and a clip never know which they're reading. A transcript line's id is negative, a caption's
 * positive, so a line is found by its id whichever source it came from, and a drawer open on one keeps it while the
 * source under the player changes.
 */

export type LineMode = "transcript" | "captions" | "nothing";

/** What the screen draws from, as one value: the lines, the one being said, the one being written, and where they're from. */
export type LinesView = {
  mode: LineMode;
  lines: readonly Line[];
  /** The line being said or the one last said; null when nothing has been yet. */
  current: Line | null;
  /** The id of the line on screen being written or said this moment; null between lines. */
  writing: number | null;
  /** The transcript's line to show on the picture: the one being said, kept `HOLD` after its last word as a subtitle is, unless the next begins sooner; null otherwise, and always for the captions. */
  saying: Line | null;
  /** The widest line, in full-width characters, so the rows are cut to fit it. */
  widest: number;
};

/** A line said stays on the picture this long after its last word, as a subtitle lingers (a one-word line flashed by otherwise), unless the next line begins sooner. Seconds. */
const HOLD = 2;
const EMPTY: readonly Line[] = [];

export function createLineSource(captions: Captions, transcriber: Transcriber, now: () => number | null) {
  let forTranscript: Transcript | null = null;
  let transcriptLines: TranscriptLine[] = [];
  let widest = 0;
  const followers = new Set<() => void>();
  let view: LinesView = { mode: "captions", lines: EMPTY, current: null, writing: null, saying: null, widest: 0 };

  /** The transcript's lines, made once per transcript. */
  function ofTranscript(): TranscriptLine[] {
    const transcript = transcriber.state().transcript;
    if (transcript !== forTranscript) {
      forTranscript = transcript;
      transcriptLines = transcript ? linesOf(transcript.words) : [];
      widest = widestOf(transcriptLines);
    }
    return transcriptLines;
  }

  function modeNow(): LineMode {
    const { transcript, source } = transcriber.state();
    if (source === "none") return "nothing";
    if (source === "youtube") return captions.latest() !== null ? "captions" : "nothing";
    const time = now();
    return time !== null && transcript && coveredAt(transcript, time) && ofTranscript().length > 0 ? "transcript" : "nothing";
  }

  /** The transcript line the video is inside: the one being said or last said, whether it's being said this moment, and whether it's still to show on the picture. */
  function transcriptNow(): { current: TranscriptLine | null; writing: number | null; saying: TranscriptLine | null } {
    const time = now();
    const lines = ofTranscript();
    if (time === null) return { current: null, writing: null, saying: null };
    let current: TranscriptLine | null = null;
    let next: TranscriptLine | null = null;
    for (const line of lines) {
      if (line.start <= time) current = line;
      else {
        next = line;
        break;
      }
    }
    const end = current?.end ?? null;
    const writing = current !== null && end !== null && time < end ? current.id : null;
    const until = end === null ? null : Math.min(end + HOLD, next?.start ?? Infinity);
    const saying = current !== null && until !== null && time < until ? current : null;
    return { current, writing, saying };
  }

  function compute(): LinesView {
    const mode = modeNow();
    if (mode === "transcript") {
      const { current, writing, saying } = transcriptNow();
      return { mode, lines: ofTranscript(), current, writing, saying, widest };
    }
    if (mode === "nothing") return { mode, lines: EMPTY, current: null, writing: null, saying: null, widest: 0 };
    return { mode, lines: captions.snapshot(), current: captions.latest(), writing: captions.writing(), saying: null, widest: 0 };
  }
  const same = (a: LinesView, b: LinesView) =>
    a.mode === b.mode && a.lines === b.lines && a.current?.id === b.current?.id && a.current === b.current && a.writing === b.writing && a.saying === b.saying && a.widest === b.widest;

  /** Looks again, and tells whoever follows when anything changed. Called when either source changes, and a few times a second for the video's own time. */
  function refresh() {
    const next = compute();
    if (same(view, next)) return;
    view = next;
    for (const follower of followers) follower();
  }
  captions.subscribe(refresh);
  transcriber.subscribe(refresh);

  return {
    get: () => view,
    refresh,
    subscribe(follower: () => void) {
      followers.add(follower);
      return () => {
        followers.delete(follower);
      };
    },
    /** The lines of what's read right now. */
    snapshot: (): readonly Line[] => view.lines,
    /** A line by its id, from either source. */
    byId(id: number | null): Line | null {
      if (id === null) return null;
      return id < 0 ? (ofTranscript().find((line) => line.id === id) ?? null) : captions.byId(id);
    },
    latest: (): Line | null => view.current,
    writing: (): number | null => view.writing,
    /** A caption still being written has no end yet; a transcript line always has one. */
    unfinished: (): number | null => (view.mode === "captions" ? captions.unfinished() : null),
    /** The transcript's word at a letter of one of its lines, for fixing it; null for a caption's line or a gap. */
    wordAt(lineId: number, offset: number): { id: number; text: string } | null {
      const line = ofTranscript().find((l) => l.id === lineId);
      const placed = line?.words.find((word) => offset >= word.from && offset < word.to);
      return line && placed ? { id: placed.id, text: line.text.slice(placed.from, placed.to) } : null;
    },
  };
}
export type LineSource = ReturnType<typeof createLineSource>;
