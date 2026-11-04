import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { realignLine, type LineMark } from "@panki/contracts";
import { AiSpark, AiWaiting } from "@web/components/AiWaiting";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { clock } from "@web/words";
import { stamp } from "../capture/words";
import { LineText, type EditedRange } from "./LineText";

/**
 * Editing Panki subtitles by hand (AI step 6, the owner's B and C of the editing preview, 2026-11-03: "I want editable
 * through subtitles and through panel"). One mechanism, two ways in: **the strip opens as the editor** (`StripEditor`:
 * the lines around the moment, each its own text with its time, click into one and type) and **the subtitle over the
 * video** (`OverLineEditor`: the line becomes text where it stands). Both type in a `LineText`; a line is kept as the
 * caret leaves it, laid back on its words by Panki (`realignLine`, the pencil's own: `actions.save`), no field and no
 * Save. Panki AI's words keep their spark, and with the caret in one, what was heard, why, and Undo. The strip's page
 * does every call (`EditorActions`); this file only edits.
 */

/** A word of a line, as it reads now. */
export type EditorWord = { id: number; text: string; startMs: number; endMs: number };
/** A word Panki AI edited last: what it reads, what the engine heard, and why. */
export type EditorAi = { wordId: number; text: string; heard: string; reason: string };
/** A line of the transcript, by its first word's id (`key`: it stays put while the lines are cut again around it), its line id as `linesOf` gave it, its times in seconds, its text and its words. */
export type EditorLine = { key: number; lineId: number; start: number; end: number; text: string; words: readonly EditorWord[]; ai: readonly EditorAi[] };
/** A line as it's being typed: its text and its two ends, seconds. */
export type Draft = { text: string; start: number; end: number };

export type EditorActions = {
  /** A line kept: its words laid out as typed and its ends where they're set. Why not, or null. */
  save: (line: EditorLine, draft: Draft) => Promise<string | null>;
  /** A line split ('break') or joined ('join') at a word. Why not, or null. */
  mark: (wordId: number, mark: LineMark) => Promise<string | null>;
  /** The line heard from its start to its end, as it's set. */
  play: (draft: Draft) => void;
  /** The video paused at a moment: the line being edited's. */
  goTo: (seconds: number) => void;
  /** Proofread this line: none while Panki AI is off or signed out. */
  proofread: { onPress: (line: EditorLine) => void; busy: (line: EditorLine) => boolean; why: string | null; costOf: (line: EditorLine) => string | null } | null;
  /** Panki AI's edit of a word taken back, one step. Why not, or null. */
  undoAi: (wordId: number, at: number) => Promise<string | null>;
};

const WORDS = {
  editing: "Editing the transcript",
  hint: "Click any line and type.",
  done: "Done",
  play: "Play line",
  split: "Split at the caret",
  merge: "Merge with next",
  proofread: "Proofread this line",
  remove: "Delete line",
  earlier: "Earlier",
  later: "Later",
  saved: (at: number) => `Saved the ${clock(at)} line`,
  noSplit: "A line of one word can't be split.",
  undo: "Undo Panki AI's edit",
  keep: "Save changes",
  leave: "Discard changes",
  around: "line before / after",
};

const draftOf = (line: EditorLine): Draft => ({ text: line.text, start: line.start, end: line.end });
const changed = (line: EditorLine, draft: Draft) => draft.text !== line.text || Math.abs(draft.start - line.start) > 0.004 || Math.abs(draft.end - line.end) > 0.004;
/** Panki AI's words where they stand in the text as it's typed: each found from where the one before ended; one typed over isn't there. */
function editedIn(line: EditorLine, text: string): (EditedRange & { ai: EditorAi })[] {
  const found: (EditedRange & { ai: EditorAi })[] = [];
  let from = 0;
  for (const ai of line.ai) {
    const at = ai.text === "" ? -1 : text.indexOf(ai.text, from);
    if (at < 0) continue;
    found.push({ from: at, to: at + ai.text.length, ai });
    from = at + ai.text.length;
  }
  return found;
}
/** The word a split at the caret starts the new line at: the boundary between two words nearest the caret, in the text as typed (`realignLine`). Null for a line of one word. */
function splitWordOf(line: EditorLine, draft: Draft, caret: number): number | null {
  const laid = draft.text === line.text ? line.words.map((w) => w.text) : realignLine(line.words, draft.text, Math.round(line.start * 1000), Math.round(line.end * 1000)).map((w) => w.text);
  let before = 0;
  let best: number | null = null;
  let distance = Infinity;
  laid.forEach((text, k) => {
    if (k > 0 && before > 0 && laid.slice(k).some((rest) => rest !== "") && Math.abs(before - caret) < distance) {
      distance = Math.abs(before - caret);
      best = k;
    }
    before += text.length;
  });
  return best === null ? null : (line.words[best]?.id ?? null);
}

/** With the caret in a word Panki AI edited: what the engine heard and why, and Undo, one step back. */
function AiNote({ ai, at, busy, onUndo }: { ai: EditorAi; at: number; busy: boolean; onUndo: (wordId: number, at: number) => void }) {
  return (
    <div className="editor-ai">
      <p className="editor-ai-head">
        <AiSpark />
        <b>Panki AI</b> wrote <b lang="ja">{ai.text}</b> <span className="editor-quiet">· heard <b lang="ja">{ai.heard}</b></span>
      </p>
      {ai.reason ? <p className="editor-quiet">{ai.reason}</p> : null}
      <Button className="editor-keep" disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={() => onUndo(ai.wordId, at)}>
        <Icon name="undo" />
        {WORDS.undo}
      </Button>
    </div>
  );
}

/** A tool under the line being edited: it never takes the caret from the line. */
function Tool({ onPress, disabled = false, danger = false, label, children }: { onPress: () => void; disabled?: boolean; danger?: boolean; label?: string; children: ReactNode }) {
  return (
    <Button className={`editor-tool ${danger ? "is-danger" : ""}`.trim()} aria-label={label} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onPress}>
      {children}
    </Button>
  );
}

type Focus = { key: number; place: { at: number; n: number } | null };

type StripProps = {
  /** Every line of the transcript, in order. */
  lines: readonly EditorLine[];
  /** The line the video is at, by its key: the lines shown are around it while none is being edited. */
  nowKey: number | null;
  /** Where to begin, a line by its key and the caret in it (a word double-clicked), once for each `n`. */
  start: { key: number; caret: number; n: number } | null;
  actions: EditorActions;
  /** Every line, scrolled inside the panel, in place of the few around the moment: the panel beside the video (`PanelView` "beside"). */
  whole?: boolean;
  onDone: () => void;
};

/** How many lines the strip shows while it's the editor: the one being edited (or said) third. */
const SHOWN = 6;

/** What a line of the editor does, the editor's own, read when it happens: a line drawn once is never stale. */
type RowControl = {
  setDraft: (line: EditorLine, next: Draft) => void;
  onKey: (line: EditorLine, i: number, e: KeyboardEvent<HTMLTextAreaElement>, at: number, collapsed: boolean) => void;
  setCaret: (at: number) => void;
  focusLine: (line: EditorLine) => void;
  leaveLine: (line: EditorLine, to: EventTarget | null) => void;
  moveTo: (line: EditorLine, at: number) => void;
  play: (draft: Draft) => void;
  split: (line: EditorLine, at: number) => void;
  joinNext: (line: EditorLine, i: number, typed: Draft) => void;
  nudge: (line: EditorLine, which: "start" | "end", by: number) => void;
  remove: (line: EditorLine, i: number) => void;
  undoAi: (wordId: number, at: number) => void;
  proofread: ((line: EditorLine) => void) | null;
};

type RowProps = {
  line: EditorLine;
  i: number;
  /** What's typed in it and not kept yet; none while it reads as its line. */
  draft: Draft | undefined;
  focused: boolean;
  /** Where the caret goes, once for each `n`: only the line being edited has one. */
  place: { at: number; n: number } | null;
  /** The caret's place, for the line being edited alone (where Panki AI's word under it is said). */
  caret: number;
  busy: boolean;
  waiting: boolean;
  isNow: boolean;
  hasNext: boolean;
  /** Proofread this line: why it can't run, or its "Up to", for the line being edited alone; null with Panki AI off. */
  proofread: { why: string | null; cost: string | null } | null;
  control: { current: RowControl };
};

/** One line of the editor: its time, its text, and while it's being edited, its tools. Drawn again only when something of its own changes, so a whole transcript stays quick to type in. */
const EditorRow = memo(function EditorRow({ line, i, draft, focused, place, caret, busy, waiting, isNow, hasNext, proofread, control }: RowProps) {
  const typed = draft ?? draftOf(line);
  const edited = editedIn(line, typed.text);
  const aiHere = focused ? edited.find((r) => caret >= r.from && caret <= r.to) : undefined;
  const c = control;
  const text = (
    <LineText
      id={`panki-edit-${line.key}`}
      label={`The ${clock(line.start)} line`}
      text={typed.text}
      edited={edited}
      focusAt={focused ? place : null}
      disabled={busy && !focused}
      onChange={(next) => c.current.setDraft(line, { ...typed, text: next })}
      onKey={(e, at, collapsed) => c.current.onKey(line, i, e, at, collapsed)}
      onCaret={(at) => c.current.setCaret(at)}
      onFocus={() => c.current.focusLine(line)}
      onBlur={(to) => c.current.leaveLine(line, to)}
    />
  );
  return (
    <div data-key={line.key} className={`strip-editor-line ${focused ? "is-focus" : ""} ${isNow ? "is-now" : ""}`.replace(/\s+/g, " ").trim()}>
      <button type="button" className="strip-editor-time" onClick={() => c.current.moveTo(line, 0)}>
        {clock(typed.start)}
        {line.ai.length > 0 ? <AiSpark /> : null}
      </button>
      {waiting ? <AiWaiting label="Panki AI is proofreading">{text}</AiWaiting> : text}
      {focused ? (
        <div className="strip-editor-tools">
          {aiHere ? <AiNote ai={aiHere.ai} at={line.start} busy={busy} onUndo={(wordId, at) => c.current.undoAi(wordId, at)} /> : null}
          <div className="strip-editor-row">
            <Tool onPress={() => c.current.play(typed)}>
              <Icon name="play" />
              {WORDS.play}
              <span className="editor-key">Ctrl+Enter</span>
            </Tool>
            <Tool disabled={busy} onPress={() => c.current.split(line, caret)}>
              {WORDS.split}
              <span className="editor-key">Shift+Enter</span>
            </Tool>
            <Tool disabled={busy || !hasNext} onPress={() => c.current.joinNext(line, i, typed)}>
              {WORDS.merge}
            </Tool>
            <span className="editor-times">
              {(["start", "end"] as const).map((which) => (
                <span key={which} className="editor-time">
                  <Tool label={`${WORDS.earlier}: ${which}`} onPress={() => c.current.nudge(line, which, -0.1)}>
                    −
                  </Tool>
                  <b>{stamp(typed[which])}</b>
                  <Tool label={`${WORDS.later}: ${which}`} onPress={() => c.current.nudge(line, which, 0.1)}>
                    +
                  </Tool>
                </span>
              ))}
            </span>
            {proofread ? (
              <Tool disabled={busy || waiting || proofread.why !== null} onPress={() => c.current.proofread?.(line)}>
                <AiSpark working={waiting} />
                {WORDS.proofread}
                {proofread.why ?? proofread.cost ? <span className="editor-quiet">{proofread.why ?? proofread.cost}</span> : null}
              </Tool>
            ) : null}
            <Tool danger disabled={busy} onPress={() => c.current.remove(line, i)}>
              <Icon name="trash" />
              {WORDS.remove}
            </Tool>
          </div>
        </div>
      ) : null}
    </div>
  );
});

/**
 * B: the strip opened as the editor. A bar says so, with Done; under it the lines around the moment, each its time and
 * its text; the one being edited has its tools under it: Play line, Split at the caret, Merge with next, its two ends
 * nudged, Proofread this line, Delete line. Enter goes to the next line, Shift+Enter splits, Backspace at a line's start
 * merges it with the one before, ↑ and ↓ the line before or after, Ctrl+Enter plays it, Esc or Done shuts the editor.
 * Focusing a line pauses the video at it.
 */
export function StripEditor({ lines, nowKey, start, actions, whole = false, onDone }: StripProps) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const [drafts, setDrafts] = useState<ReadonlyMap<number, Draft>>(new Map());
  const [caret, setCaret] = useState(0);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ words: string; failed: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const n = useRef(0);
  const place = (at: number) => ({ at, n: ++n.current });
  // What's typed and not kept yet, read again as the editor shuts, so none of it is lost.
  const latest = useRef({ lines, drafts, actions });
  latest.current = { lines, drafts, actions };
  useEffect(
    () => () => {
      const { lines: now, drafts: typed, actions: act } = latest.current;
      for (const [key, draft] of typed) {
        const line = now.find((l) => l.key === key);
        if (line && changed(line, draft)) void act.save(line, draft);
      }
    },
    [],
  );
  useEffect(() => {
    if (!start) return;
    const line = lines.find((l) => l.key === start.key);
    if (!line) return;
    setFocus({ key: line.key, place: place(start.caret) });
    actions.goTo(line.start);
    // Once for each ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.n]);
  // A draft that now reads as its line, or whose line is gone, is let go.
  useEffect(() => {
    setDrafts((was) => {
      let next: Map<number, Draft> | null = null;
      for (const [key, draft] of was) {
        const line = lines.find((l) => l.key === key);
        if (!line || !changed(line, draft)) (next ??= new Map(was)).delete(key);
      }
      return next ?? was;
    });
  }, [lines]);

  const draft = (line: EditorLine) => drafts.get(line.key) ?? draftOf(line);
  const setDraft = (line: EditorLine, next: Draft) => setDrafts((was) => new Map(was).set(line.key, next));
  const tell = (failure: string | null, words: string) => setSaid(failure ? { words: failure, failed: true } : { words, failed: false });

  /** A line left: kept when it changed. */
  async function keep(line: EditorLine): Promise<boolean> {
    const typed = draft(line);
    if (!changed(line, typed)) return true;
    setBusy(true);
    const failure = await actions.save(line, typed);
    setBusy(false);
    tell(failure, WORDS.saved(line.start));
    return failure === null;
  }
  function moveTo(line: EditorLine | undefined, at: number) {
    if (!line) return;
    setFocus({ key: line.key, place: place(at) });
    actions.goTo(line.start);
  }
  async function split(line: EditorLine, at: number) {
    const typed = draft(line);
    const wordId = splitWordOf(line, typed, at);
    if (wordId === null) {
      tell(WORDS.noSplit, "");
      return;
    }
    if (!(await keep(line))) return;
    setBusy(true);
    const failure = await actions.mark(wordId, "break");
    setBusy(false);
    tell(failure, `Split the ${clock(line.start)} line`);
    if (!failure) setFocus({ key: wordId, place: place(0) });
  }
  async function join(into: EditorLine, line: EditorLine, caretAfter: number) {
    if (!(await keep(line)) || !(await keep(into))) return;
    const first = line.words[0];
    if (!first) return;
    setBusy(true);
    const failure = await actions.mark(first.id, "join");
    setBusy(false);
    tell(failure, `Merged into the ${clock(into.start)} line`);
    if (!failure) setFocus({ key: into.key, place: place(caretAfter) });
  }
  async function remove(line: EditorLine, next: EditorLine | undefined) {
    setBusy(true);
    const failure = await actions.save(line, { ...draft(line), text: "" });
    setBusy(false);
    tell(failure, `Deleted the ${clock(line.start)} line`);
    if (!failure) setFocus(next ? { key: next.key, place: place(0) } : null);
  }
  /**
   * An end moved a tenth of a second, never past the other end, and never into the line before or after (the owner,
   * 2026-11-03: lines never overlap; the clip bar's two ends stop against each other the same way): the start stops at
   * the previous line's end, the end at the next line's start, as they stand typed. An end that stood past one already
   * (a transcript from before) isn't pushed back by it, only kept from going further.
   */
  function nudge(line: EditorLine, which: "start" | "end", by: number) {
    const typed = draft(line);
    const at = lines.findIndex((l) => l.key === line.key);
    const before = at > 0 ? lines[at - 1] : undefined;
    const after = at >= 0 ? lines[at + 1] : undefined;
    const to = Math.max(0, Math.round((typed[which] + by) * 10) / 10);
    const floor = before ? Math.min(draft(before).end, typed.start) : 0;
    const ceiling = after ? Math.max(draft(after).start, typed.end) : Infinity;
    const next =
      which === "start" ? { ...typed, start: Math.max(floor, Math.min(to, typed.end - 0.1)) } : { ...typed, end: Math.min(ceiling, Math.max(to, typed.start + 0.1)) };
    setDraft(line, next);
    actions.goTo(next.start);
  }
  async function done() {
    const line = lines.find((l) => l.key === focus?.key);
    if (line) await keep(line);
    onDone();
  }

  const focusedAt = focus ? lines.findIndex((l) => l.key === focus.key) : -1;
  const centre = focusedAt >= 0 ? focusedAt : Math.max(0, lines.findIndex((l) => l.key === nowKey));
  const from = whole ? 0 : Math.max(0, Math.min(centre - 2, lines.length - SHOWN));
  const shown = whole ? lines : lines.slice(from, from + SHOWN);

  // Every line listed (beside the video): the line being edited kept in view as the caret moves from line to line,
  // and the line the video is at a third of the way down as the editor opens. Scrolled inside the panel, never the page.
  const listEl = useRef<HTMLDivElement>(null);
  const scrolledTo = useRef<number | null>(null);
  const aimKey = focus?.key ?? nowKey;
  useEffect(() => {
    const box = listEl.current;
    if (!whole || !box || aimKey === null || scrolledTo.current === aimKey) return;
    const row = box.querySelector(`[data-key="${aimKey}"]`);
    if (!(row instanceof HTMLElement)) return;
    const first = scrolledTo.current === null;
    scrolledTo.current = aimKey;
    const top = row.offsetTop;
    const inView = top >= box.scrollTop && top + row.offsetHeight <= box.scrollTop + box.clientHeight;
    if (first) box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3) });
    else if (!inView) box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: "smooth" });
  }, [whole, aimKey]);

  function onKey(line: EditorLine, i: number, e: KeyboardEvent<HTMLTextAreaElement>, at: number, collapsed: boolean) {
    const before = lines[i - 1];
    const after = lines[i + 1];
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      actions.play(draft(line));
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      void split(line, at);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (after) {
        void keep(line);
        moveTo(after, 0);
      } else void keep(line);
    } else if (e.key === "Backspace" && at === 0 && collapsed && before) {
      e.preventDefault();
      void join(before, line, draft(before).text.length);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.altKey && !e.shiftKey) {
      const to = e.key === "ArrowUp" ? before : after;
      if (!to) return;
      e.preventDefault();
      void keep(line);
      moveTo(to, Math.min(at, draft(to).text.length));
    } else if (e.key === "Escape") {
      e.preventDefault();
      void done();
    }
  }

  const handles: RowControl = {
    setDraft,
    onKey,
    setCaret,
    focusLine(line) {
      if (focus?.key === line.key) return;
      setFocus({ key: line.key, place: null });
      actions.goTo(line.start);
    },
    leaveLine(line, to) {
      // Another line of the editor takes it from here; anywhere else, the line is kept and let go.
      if (to instanceof Node && root.current?.contains(to)) return;
      void keep(line);
      setFocus((was) => (was?.key === line.key ? null : was));
    },
    moveTo,
    play: (typed) => actions.play(typed),
    split: (line, at) => void split(line, at),
    joinNext(line, i, typed) {
      const next = lines[i + 1];
      if (next) void join(line, next, typed.text.length);
    },
    nudge,
    remove: (line, i) => void remove(line, lines[i + 1]),
    undoAi: (wordId, at) => void actions.undoAi(wordId, at).then((failure) => tell(failure, "Undid Panki AI's edit")),
    proofread: actions.proofread ? (line) => actions.proofread?.onPress(line) : null,
  };
  const control = useRef(handles);
  control.current = handles;

  return (
    <div ref={root} className={`strip-editor ${whole ? "is-whole" : ""}`.trim()}>
      <div className="strip-editor-bar">
        <b>
          <Icon name="edit" />
          {WORDS.editing}
        </b>
        <span className="editor-quiet">{WORDS.hint}</span>
        <span className="strip-editor-end">
          {said ? <span className={`strip-editor-said ${said.failed ? "is-failed" : ""}`.trim()} role="status">{said.words}</span> : null}
          <Button variant="primary" disabled={busy} onClick={() => void done()}>
            <Icon name="check" />
            {WORDS.done}
          </Button>
        </span>
      </div>
      <div ref={listEl} className="strip-editor-lines">
        {shown.map((line, k) => {
          const i = from + k;
          const focused = focus?.key === line.key;
          const pr = actions.proofread;
          return (
            <EditorRow
              key={line.key}
              line={line}
              i={i}
              draft={drafts.get(line.key)}
              focused={focused}
              place={focused ? focus.place : null}
              caret={focused ? caret : 0}
              busy={busy}
              waiting={pr?.busy(line) ?? false}
              isNow={line.key === nowKey}
              hasNext={lines[i + 1] !== undefined}
              proofread={focused && pr ? { why: pr.why, cost: pr.costOf(line) } : null}
              control={control}
            />
          );
        })}
      </div>
    </div>
  );
}

type OverProps = {
  line: EditorLine;
  /** Where the caret goes as it opens, once for each `n`. */
  start: { caret: number; n: number };
  actions: EditorActions;
  /** It's over: kept and the video going on (`play`), kept and left paused (`stay`), or left as it was (`drop`). */
  onDone: (how: "play" | "stay" | "drop") => void;
  /** Kept, and on to the line before (-1) or after (1). */
  onMove: (by: -1 | 1) => void;
};

/**
 * C: the subtitle over the video, edited where it stands: the line becomes text, the video paused; Enter saves it and
 * plays on, Esc discards what was typed, ↑ / ↓ save it and go to the line before or after, as in the strip's editor
 * (the owner, 2026-11-03: Alt+↑↓ until then). A word Panki AI edited
 * says what was heard over the line, with Undo. Its hint stands over it, with Proofread this line.
 */
export function OverLineEditor({ line, start, actions, onDone, onMove }: OverProps) {
  const [typed, setTyped] = useState<Draft>(draftOf(line));
  const [caret, setCaret] = useState(start.caret);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setTyped(draftOf(line));
    // A line moved to is typed from as it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.key]);
  async function keep(): Promise<boolean> {
    if (!changed(line, typed)) return true;
    setBusy(true);
    const failed = await actions.save(line, typed);
    setBusy(false);
    setFailure(failed);
    return failed === null;
  }
  const edited = editedIn(line, typed.text);
  const aiHere = edited.find((r) => caret >= r.from && caret <= r.to);
  const waiting = actions.proofread?.busy(line) ?? false;
  return (
    <div className="over-editor">
      <div className="over-editor-hint">
        <span>Editing {clock(line.start)}</span>
        <span>
          <span className="editor-key">Enter</span> {WORDS.keep}
        </span>
        <span>
          <span className="editor-key">Esc</span> {WORDS.leave}
        </span>
        <span>
          <span className="editor-key">↑↓</span> {WORDS.around}
        </span>
        {actions.proofread ? (
          <Tool disabled={busy || waiting || actions.proofread.why !== null} onPress={() => actions.proofread?.onPress(line)}>
            <AiSpark working={waiting} />
            {WORDS.proofread}
          </Tool>
        ) : null}
      </div>
      {aiHere ? <AiNote ai={aiHere.ai} at={line.start} busy={busy} onUndo={(wordId, at) => void actions.undoAi(wordId, at).then(setFailure)} /> : null}
      {failure ? (
        <p className="over-editor-failure" role="alert">
          {failure}
        </p>
      ) : null}
      <LineText
        id={`panki-over-edit-${line.key}`}
        label={`The ${clock(line.start)} line`}
        className="is-over"
        text={typed.text}
        edited={edited}
        focusAt={{ at: start.caret, n: start.n }}
        disabled={busy}
        onChange={(text) => setTyped({ ...typed, text })}
        onKey={(e, at) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void keep().then((ok) => ok && onDone("play"));
          } else if (e.key === "Escape") {
            e.preventDefault();
            onDone("drop");
          } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.altKey && !e.shiftKey) {
            e.preventDefault();
            void keep().then((ok) => ok && onMove(e.key === "ArrowUp" ? -1 : 1));
          }
          void at;
        }}
        onCaret={setCaret}
        onFocus={() => undefined}
        onBlur={(to) => {
          // A press on its own hint or note keeps it open; anywhere else it's kept and shut.
          if (to instanceof Element && to.closest(".over-editor")) return;
          void keep().then((ok) => ok && onDone("stay"));
        }}
      />
    </div>
  );
}
