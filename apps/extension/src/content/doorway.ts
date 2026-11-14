import type { DoorwayNote, DoorwayPiece } from "../download/download";
import { KEEP_PARAM, NOTE_WORD, PIECE_WORD } from "../download/mark";

/**
 * The one script of Panki's that runs in YouTube's own page, in every frame of the site, before the site's own scripts:
 * and it does nothing at all unless the frame's address carries Panki's download mark, which only the hidden frame
 * Panki opens to download a video does (`transcribe/silent.ts`, `download/runner.ts`). There it stands at the media
 * doorway, the browser's one standard way for a page to play streamed video (Media Source Extensions), and copies:
 * every piece the site's player appends to a stream is passed on to the browser untouched, and a copy of it is sent to
 * the page that opened the frame, with what the stream says of itself (its kind of file, its length, what it holds
 * before and after the piece), once the browser has taken the piece in. Nothing of the site's is changed, none of its
 * code called, and nothing the player asks of the browser is answered otherwise: told it can't play a kind of video,
 * the player can decide it can play none and load nothing.
 *
 * It also says, to the same page, that it woke in the frame and each time the player makes a stream, so a download
 * that copies nothing can say where it stopped.
 *
 * It imports nothing but words and a type, so nothing else of Panki's is carried into the site's page.
 */

const mark = new URL(location.href).searchParams.get(KEEP_PARAM);
if (mark !== null && /^[0-9a-f-]{8,64}$/i.test(mark) && window.parent !== window) keep(mark);

/** A number the browser may give as NaN or Infinity, as a number or nothing. */
const finite = (n: number): number | null => (Number.isFinite(n) ? n : null);

/** A stream's buffered stretches, seconds; none once the stream is gone from its source. */
function rangesOf(buffer: SourceBuffer): [number, number][] {
  try {
    const ranges = buffer.buffered;
    const out: [number, number][] = [];
    for (let i = 0; i < ranges.length && i < 64; i++) out.push([ranges.start(i), ranges.end(i)]);
    return out;
  } catch {
    return [];
  }
}

/** A copy of what's appended, taken at once: the player may reuse its own bytes once the call returns. */
function copyOf(data: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  return new Uint8Array(data.slice(0));
}

/** Bytes as text, for a message the extension's worker can take (a message there carries no bytes). */
function base64Of(bytes: Uint8Array): string {
  let text = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) text += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(text);
}

function keep(mark: string) {
  const origin = location.origin;
  /** Said to the page that opened the frame, so a run that copies nothing can say where it stopped. */
  const say = (note: DoorwayNote["note"], type: string | null = null) => {
    const said: DoorwayNote = { kind: NOTE_WORD, mark, note, type };
    window.parent.postMessage(said, origin);
  };
  say("awake");
  /** Each source the page makes, counted in the order it's first given a stream. */
  const sources = new WeakMap<MediaSource, number>();
  let made = 0;
  /** Each stream's source and its kind of file, as the player named it. */
  const streams = new WeakMap<SourceBuffer, { source: MediaSource; stream: number; type: string }>();

  const add = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function (this: MediaSource, type: string) {
    const buffer = add.call(this, type);
    let stream = sources.get(this);
    if (stream === undefined) {
      stream = made++;
      sources.set(this, stream);
    }
    streams.set(buffer, { source: this, stream, type });
    say("stream", type);
    return buffer;
  };

  const change = SourceBuffer.prototype.changeType;
  SourceBuffer.prototype.changeType = function (this: SourceBuffer, type: string) {
    change.call(this, type);
    const facts = streams.get(this);
    if (facts) facts.type = type;
  };

  const append = SourceBuffer.prototype.appendBuffer;
  SourceBuffer.prototype.appendBuffer = function (this: SourceBuffer, data: BufferSource) {
    const facts = streams.get(this);
    if (!facts) {
      append.call(this, data);
      return;
    }
    const copy = copyOf(data);
    const before = rangesOf(this);
    const offset = this.timestampOffset;
    const windowed: [number, number | null] = [this.appendWindowStart, finite(this.appendWindowEnd)];
    const type = facts.type;
    // A call that throws throws for the player as it always would, and nothing is sent.
    append.call(this, data);
    // Sent once the browser has taken it in: `update` says it did, `updateend` comes either way (an error, an abort).
    let taken = false;
    const onUpdate = () => {
      taken = true;
    };
    const onEnd = () => {
      this.removeEventListener("update", onUpdate);
      this.removeEventListener("updateend", onEnd);
      if (!taken) return;
      const piece: DoorwayPiece = {
        kind: PIECE_WORD,
        mark,
        stream: facts.stream,
        duration: finite(facts.source.duration),
        type,
        offset,
        window: windowed,
        before,
        after: rangesOf(this),
        base64: base64Of(copy),
      };
      window.parent.postMessage(piece, origin);
    };
    this.addEventListener("update", onUpdate);
    this.addEventListener("updateend", onEnd);
  };
}
