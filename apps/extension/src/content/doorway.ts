import type { DoorwayPiece } from "../download/download";
import { HEIGHT_PARAM, KEEP_PARAM, PIECE_WORD } from "../download/mark";

/**
 * The one script of Panki's that runs in YouTube's own page, in every frame of the site, before the site's own scripts:
 * and it does nothing at all unless the frame's address carries Panki's download mark, which only the hidden frame
 * Panki opens to download a video does (`transcribe/silent.ts`, `download/runner.ts`). There it stands at the media
 * doorway, the browser's one standard way for a page to play streamed video (Media Source Extensions), and does two
 * things, nothing of the site's changed and none of its code called:
 *
 * - Every piece the site's player appends to a stream is passed on to the browser untouched, and a copy of it is sent to
 *   the page that opened the frame, with what the stream says of itself (its kind of file, its length, what it holds
 *   before and after the piece), once the browser has taken the piece in.
 * - Asked whether it can play a kind of video taller than the quality asked for, it says no, so the site's player picks
 *   among the rest.
 *
 * It imports nothing but words and a type, so nothing else of Panki's is carried into the site's page.
 */

const params = new URL(location.href).searchParams;
const mark = params.get(KEEP_PARAM);
const height = Number(params.get(HEIGHT_PARAM));
if (mark !== null && /^[0-9a-f-]{8,64}$/i.test(mark) && window.parent !== window) keep(mark, Number.isFinite(height) && height > 0 ? height : null);

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

/**
 * Whether a kind of video is taller than `most` lines: its picture's shorter side, as the asker gives its size in the
 * type's own parameters (`video/webm; codecs="vp9"; width=1920; height=1080`). Sound, and video with no size given, never are.
 */
function tooTall(type: string, most: number): boolean {
  if (!/^\s*video\//i.test(type)) return false;
  const side = (name: string) => {
    const found = new RegExp(`;\\s*${name}\\s*=\\s*"?(\\d+)`, "i").exec(type)?.[1];
    return found === undefined ? null : Number(found);
  };
  const width = side("width");
  const tall = side("height");
  if (width !== null && tall !== null) return Math.min(width, tall) > most;
  if (tall !== null) return tall > most;
  return width !== null && width > Math.ceil((most * 16) / 9);
}

function keep(mark: string, height: number | null) {
  const origin = location.origin;
  /** Each source the page makes, counted in the order it's first given a stream. */
  const sources = new WeakMap<MediaSource, number>();
  let made = 0;
  /** Each stream's source and its kind of file, as the player named it. */
  const streams = new WeakMap<SourceBuffer, { source: MediaSource; stream: number; type: string }>();

  if (height !== null) {
    const supported = MediaSource.isTypeSupported.bind(MediaSource);
    MediaSource.isTypeSupported = (type: string) => !tooTall(type, height) && supported(type);
    if ("MediaCapabilities" in window) {
      const decodingInfo = MediaCapabilities.prototype.decodingInfo;
      MediaCapabilities.prototype.decodingInfo = function (this: MediaCapabilities, config: MediaDecodingConfiguration) {
        const video = config.video;
        if (video && tooTall(`video/x; width=${video.width}; height=${video.height}`, height)) return Promise.resolve({ supported: false, smooth: false, powerEfficient: false, configuration: config, keySystemAccess: null });
        return decodingInfo.call(this, config);
      };
    }
  }

  const add = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function (this: MediaSource, type: string) {
    const buffer = add.call(this, type);
    let stream = sources.get(this);
    if (stream === undefined) {
      stream = made++;
      sources.set(this, stream);
    }
    streams.set(buffer, { source: this, stream, type });
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
