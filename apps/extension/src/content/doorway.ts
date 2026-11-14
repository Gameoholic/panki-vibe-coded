import type { DoorwayNote, DoorwayPiece, FeedAnswer, FeedAsk, FeedStream } from "../download/download";
import { base64Of, bytesOf, startPiece } from "../download/bytes";
import { FED_WORD, FEED_WORD, KEEP_PARAM, NOTE_WORD, PIECE_WORD } from "../download/mark";

/**
 * The one script of Panki's that runs in YouTube's own page, in every frame of the site, before the site's own scripts.
 * It stands at the media doorway, the browser's one standard way for a page to play streamed video (Media Source
 * Extensions), for two jobs, and changes nothing of the site's and calls none of its code:
 *
 * - **Copying** (`keep`), only in a frame whose address carries Panki's download mark, which only the hidden frame Panki
 *   opens to download a video does (`transcribe/silent.ts`, `download/runner.ts`): every piece the site's player
 *   appends to a stream is passed on to the browser untouched, and a copy of it is sent to the page that opened the
 *   frame, with what the stream says of itself (its kind of file, its length, what it holds before and after the
 *   piece), once the browser has taken the piece in. It also says it woke, and each time the player makes a stream, so
 *   a download that copies nothing can say where it stopped. Nothing the player asks of the browser is answered
 *   otherwise: told it can't play a kind of video, the player can decide it can play none and load nothing.
 * - **Playing from the copy** (`feed`), in the page's own frame: it notes each stream the player makes and the
 *   player's own start piece in it, passing everything on untouched, and does nothing more until Panki asks
 *   (`download/playback.ts`, on a downloaded video's page). Then it puts kept pieces into the player's stream ahead of
 *   where it plays, out of the player's sight: while they go in, the player's own calls on that stream wait their turn
 *   and are made right after, its settings on it read as it left them, and the stream's events for Panki's pieces never
 *   reach it; and after them the player's own start piece goes back in, so the next piece it puts in reads as before.
 *
 * It imports nothing but words, the bytes' text and types, so nothing else of Panki's is carried into the site's page.
 */

const mark = new URL(location.href).searchParams.get(KEEP_PARAM);
if (mark !== null && /^[0-9a-f-]{8,64}$/i.test(mark) && window.parent !== window) keep(mark);
else if (window.parent === window) feed();

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
function copyOf(data: BufferSource): Uint8Array<ArrayBuffer> {
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  return new Uint8Array(data.slice(0));
}

/** The first bytes of what's appended, without copying it: enough to tell a start piece. */
function headOf(data: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, Math.min(8, data.byteLength));
  return new Uint8Array(data, 0, Math.min(8, data.byteLength));
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

/** A stream's events, which the player never hears for Panki's own pieces. */
const HIDDEN_EVENTS = ["updatestart", "update", "updateend", "error", "abort"] as const;
/** The player's settings on a stream, read back as it left them while Panki's pieces go in. */
const SETTINGS = ["timestampOffset", "appendWindowStart", "appendWindowEnd"] as const;
type Setting = (typeof SETTINGS)[number];

/** One of the player's streams: its source, its kind of file, the player's own start piece in it, and Panki's pieces going in. */
type Fed = {
  source: MediaSource;
  stream: number;
  type: string;
  /** The player's latest start piece, and when it last put anything in (`performance.now()`). */
  init: Uint8Array<ArrayBuffer> | null;
  lastAt: number;
  /** While Panki's pieces go in: the player's settings as it left them, and its own calls, made right after. */
  ours: { saved: Record<Setting, number>; waiting: (() => void)[] } | null;
};

function feed() {
  const origin = location.origin;
  const buffer = SourceBuffer.prototype;
  const described = (name: string) => Object.getOwnPropertyDescriptor(buffer, name);
  const settings = Object.fromEntries(SETTINGS.map((name) => [name, described(name)])) as Record<Setting, PropertyDescriptor | undefined>;
  const updating = described("updating");
  // A browser whose streams aren't built as the standard has them is left exactly as it is.
  if (!updating?.get || SETTINGS.some((name) => !settings[name]?.get || !settings[name]?.set) || HIDDEN_EVENTS.some((type) => !described(`on${type}`)?.set)) return;
  const real = {
    add: MediaSource.prototype.addSourceBuffer,
    end: MediaSource.prototype.endOfStream,
    drop: MediaSource.prototype.removeSourceBuffer,
    duration: Object.getOwnPropertyDescriptor(MediaSource.prototype, "duration"),
    append: buffer.appendBuffer,
    remove: buffer.remove,
    abort: buffer.abort,
    change: buffer.changeType,
    listen: EventTarget.prototype.addEventListener,
    unlisten: EventTarget.prototype.removeEventListener,
    updating: (sb: SourceBuffer): boolean => updating.get?.call(sb) === true,
    get: (sb: SourceBuffer, name: Setting): number => Number(settings[name]?.get?.call(sb)),
    set: (sb: SourceBuffer, name: Setting, value: number) => settings[name]?.set?.call(sb, value),
  };
  const sources = new WeakMap<MediaSource, number>();
  let made = 0;
  const fed = new Map<SourceBuffer, Fed>();
  /** The stream of a source Panki's pieces are going into right now, if any: the source's own calls wait for it too. */
  const busyIn = (source: MediaSource): Fed | null => [...fed.values()].find((f) => f.source === source && f.ours !== null) ?? null;

  MediaSource.prototype.addSourceBuffer = function (this: MediaSource, type: string) {
    const sb = real.add.call(this, type);
    let stream = sources.get(this);
    if (stream === undefined) {
      stream = made++;
      sources.set(this, stream);
    }
    // Streams of sources the page has let go are forgotten.
    for (const [old, f] of fed) if (f.source.readyState === "closed") fed.delete(old);
    fed.set(sb, { source: this, stream, type, init: null, lastAt: performance.now(), ours: null });
    return sb;
  };

  /** A call of the player's on a stream: made now, or, while Panki's pieces go in, right after them. */
  const inTurn = (sb: SourceBuffer, call: () => void): void => {
    const f = fed.get(sb);
    if (f?.ours) f.ours.waiting.push(call);
    else call();
  };
  buffer.appendBuffer = function (this: SourceBuffer, data: BufferSource) {
    const f = fed.get(this);
    if (!f) return real.append.call(this, data);
    const put = (bytes: BufferSource) => {
      if (startPiece(headOf(bytes))) f.init = copyOf(bytes);
      f.lastAt = performance.now();
      real.append.call(this, bytes);
    };
    // Waiting, it's a copy: the player may reuse its bytes once the call returns.
    if (f.ours) f.ours.waiting.push(() => put(copyOf(data)));
    else put(data);
  };
  buffer.remove = function (this: SourceBuffer, start: number, end: number) {
    inTurn(this, () => real.remove.call(this, start, end));
  };
  buffer.abort = function (this: SourceBuffer) {
    inTurn(this, () => real.abort.call(this));
  };
  buffer.changeType = function (this: SourceBuffer, type: string) {
    inTurn(this, () => {
      real.change.call(this, type);
      const f = fed.get(this);
      if (f) f.type = type;
    });
  };
  for (const name of SETTINGS) {
    Object.defineProperty(buffer, name, {
      configurable: true,
      enumerable: settings[name]?.enumerable ?? true,
      get(this: SourceBuffer) {
        const ours = fed.get(this)?.ours;
        return ours ? ours.saved[name] : real.get(this, name);
      },
      set(this: SourceBuffer, value: number) {
        const ours = fed.get(this)?.ours;
        // Kept as the player's: put back before its own calls are made.
        if (ours) ours.saved[name] = value;
        else real.set(this, name, value);
      },
    });
  }
  Object.defineProperty(buffer, "updating", {
    configurable: true,
    enumerable: updating.enumerable ?? true,
    get(this: SourceBuffer) {
      // While Panki's pieces go in, busy only with a call of the player's own that's waiting its turn.
      const ours = fed.get(this)?.ours;
      return ours ? ours.waiting.length > 0 : real.updating(this);
    },
  });
  const sourceInTurn = (source: MediaSource, call: () => void) => {
    const busy = busyIn(source);
    if (busy?.ours) busy.ours.waiting.push(call);
    else call();
  };
  MediaSource.prototype.endOfStream = function (this: MediaSource, error?: EndOfStreamError) {
    sourceInTurn(this, () => real.end.call(this, error));
  };
  MediaSource.prototype.removeSourceBuffer = function (this: MediaSource, sb: SourceBuffer) {
    sourceInTurn(this, () => {
      real.drop.call(this, sb);
      fed.delete(sb);
    });
  };
  if (real.duration?.get && real.duration.set) {
    const { get, set } = real.duration;
    Object.defineProperty(MediaSource.prototype, "duration", {
      configurable: true,
      enumerable: real.duration.enumerable ?? true,
      get(this: MediaSource) {
        return get.call(this);
      },
      set(this: MediaSource, value: number) {
        sourceInTurn(this, () => set.call(this, value));
      },
    });
  }

  // The stream's events, as the player listens for them: never one of Panki's own pieces'.
  const hidden = new Set<string>(HIDDEN_EVENTS);
  const heard = (e: Event) => fed.get(e.target as SourceBuffer)?.ours == null;
  const wrapped = new WeakMap<object, Map<string, EventListener>>();
  const wrapperOf = (type: string, listener: EventListenerOrEventListenerObject): EventListener => {
    let byType = wrapped.get(listener);
    if (!byType) {
      byType = new Map();
      wrapped.set(listener, byType);
    }
    let w = byType.get(type);
    if (!w) {
      w = function (this: unknown, e: Event) {
        if (!heard(e)) return;
        if (typeof listener === "function") listener.call(this, e);
        else listener.handleEvent(e);
      };
      byType.set(type, w);
    }
    return w;
  };
  buffer.addEventListener = function (this: SourceBuffer, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    real.listen.call(this, type, listener && hidden.has(type) ? wrapperOf(type, listener) : listener, options);
  };
  buffer.removeEventListener = function (this: SourceBuffer, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    real.unlisten.call(this, type, listener && hidden.has(type) ? wrapperOf(type, listener) : listener, options);
  };
  const handlers = new WeakMap<SourceBuffer, Map<string, { handler: EventListener; wrapper: EventListener }>>();
  for (const type of HIDDEN_EVENTS) {
    Object.defineProperty(buffer, `on${type}`, {
      configurable: true,
      enumerable: true,
      get(this: SourceBuffer) {
        return handlers.get(this)?.get(type)?.handler ?? null;
      },
      set(this: SourceBuffer, handler: unknown) {
        let mine = handlers.get(this);
        if (!mine) {
          mine = new Map();
          handlers.set(this, mine);
        }
        const was = mine.get(type);
        if (was) real.unlisten.call(this, type, was.wrapper);
        mine.delete(type);
        if (typeof handler !== "function") return;
        const wrapper = wrapperOf(type, handler as EventListener);
        mine.set(type, { handler: handler as EventListener, wrapper });
        real.listen.call(this, type, wrapper);
      },
    });
  }

  /** Bytes put in by Panki, out of the player's sight; done once the browser has taken them in, or failed. */
  const put = (sb: SourceBuffer, bytes: Uint8Array<ArrayBuffer>): Promise<void> =>
    new Promise((resolve, reject) => {
      let failed = false;
      const onError = () => {
        failed = true;
      };
      const onEnd = () => {
        real.unlisten.call(sb, "error", onError);
        real.unlisten.call(sb, "updateend", onEnd);
        if (failed) reject(new Error("the browser couldn't read it"));
        else resolve();
      };
      real.listen.call(sb, "error", onError);
      real.listen.call(sb, "updateend", onEnd);
      try {
        real.append.call(sb, bytes);
      } catch (e) {
        onEnd();
        reject(e);
      }
    });
  /** Waits for a call of the player's already under way on a stream. */
  const settled = (sb: SourceBuffer): Promise<void> =>
    real.updating(sb)
      ? new Promise((resolve) => {
          const onEnd = () => {
            real.unlisten.call(sb, "updateend", onEnd);
            resolve();
          };
          real.listen.call(sb, "updateend", onEnd);
        })
      : Promise.resolve();
  /** A stream's window set, its two ends in an order the browser takes (its start must stay below its end). */
  const setWindow = (sb: SourceBuffer, start: number, end: number) => {
    if (start >= real.get(sb, "appendWindowEnd")) {
      real.set(sb, "appendWindowEnd", end);
      real.set(sb, "appendWindowStart", start);
    } else {
      real.set(sb, "appendWindowStart", start);
      real.set(sb, "appendWindowEnd", end);
    }
  };
  const wordsOf = (e: unknown): string => (e instanceof Error ? `${e.name === "Error" ? "" : `${e.name}: `}${e.message}` : String(e)).slice(0, 300);

  /** The player's own calls that waited, made in order, each once the one before has been taken in. */
  async function drain(sb: SourceBuffer, waiting: (() => void)[]) {
    for (const call of waiting) {
      await settled(sb);
      try {
        call();
      } catch {
        // A call of the player's that the browser refuses now would have been refused as it made it: nothing to tell it.
      }
    }
  }

  /** Kept pieces into one stream: its start piece, the pieces each with its own offset and window, then the player's own start piece and settings back. */
  async function append(ask: Extract<FeedAsk, { ask: "append" }>): Promise<string | null> {
    const entry = [...fed.entries()].find(([, f]) => f.stream === ask.stream && trackOfType(f.type) === ask.track && f.source.readyState === "open");
    if (!entry) return "the player's stream is gone";
    const [sb, f] = entry;
    if (f.init === null) return "the player hasn't started its stream";
    // The player may put its next piece in as its last is taken in: Panki's go in only between two of its own.
    while (real.updating(sb)) await settled(sb);
    if (f.ours || f.source.readyState !== "open") return "the player's stream is busy";
    const saved = { timestampOffset: real.get(sb, "timestampOffset"), appendWindowStart: real.get(sb, "appendWindowStart"), appendWindowEnd: real.get(sb, "appendWindowEnd") };
    const ours = { saved, waiting: [] as (() => void)[] };
    f.ours = ours;
    const playerType = f.type;
    let trouble: string | null = null;
    try {
      // Whatever the player had half put in is let go, so Panki's start piece reads as one.
      real.abort.call(sb);
      if (ask.type !== playerType) real.change.call(sb, ask.type);
      await put(sb, bytesOf(ask.init));
      for (const piece of ask.pieces) {
        setWindow(sb, piece.window[0], piece.window[1] ?? Infinity);
        real.set(sb, "timestampOffset", piece.offset);
        await put(sb, bytesOf(piece.base64));
      }
    } catch (e) {
      trouble = wordsOf(e);
    }
    try {
      if (f.source.readyState === "open") {
        if (ask.type !== playerType) real.change.call(sb, playerType);
        await put(sb, f.init);
        setWindow(sb, ours.saved.appendWindowStart, ours.saved.appendWindowEnd);
        real.set(sb, "timestampOffset", ours.saved.timestampOffset);
      }
    } catch (e) {
      trouble ??= `putting the player's own start back: ${wordsOf(e)}`;
    }
    f.ours = null;
    await drain(sb, ours.waiting);
    return trouble;
  }

  const trackOfType = (type: string): "video" | "audio" | null => (type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : null);
  /** Every stream of a source still open or ended, as Panki is told of it. */
  const streamsNow = (): FeedStream[] => {
    const now = performance.now();
    return [...fed.entries()].flatMap(([sb, f]) => {
      const track = trackOfType(f.type);
      if (!track || f.source.readyState === "closed") return [];
      return [{ stream: f.stream, track, type: f.type, duration: finite(f.source.duration), open: f.source.readyState === "open", started: f.init !== null, buffered: rangesOf(sb), quietMs: Math.max(0, Math.round(now - f.lastAt)) }];
    });
  };
  const answer = (id: number, trouble: string | null) => {
    const said: FeedAnswer = { kind: FED_WORD, id, streams: streamsNow(), trouble };
    window.postMessage(JSON.stringify(said), origin);
  };

  /** Read by hand: nothing else of Panki's comes into the site's page to read it with. */
  function askOf(data: unknown): FeedAsk | null {
    if (typeof data !== "string" || !data.startsWith(`{"kind":"${FEED_WORD}"`)) return null;
    let read: unknown;
    try {
      read = JSON.parse(data);
    } catch {
      return null;
    }
    if (typeof read !== "object" || read === null) return null;
    const ask = read as Partial<Record<string, unknown>>;
    if (ask.kind !== FEED_WORD || typeof ask.id !== "number") return null;
    if (ask.ask === "streams") return { kind: FEED_WORD, id: ask.id, ask: "streams" };
    const pieces = Array.isArray(ask.pieces) ? ask.pieces : null;
    const piecesRead = pieces?.every((p: unknown) => {
      const piece = p as Partial<Record<string, unknown>>;
      return typeof piece.base64 === "string" && typeof piece.offset === "number" && Array.isArray(piece.window) && typeof piece.window[0] === "number" && (piece.window[1] === null || typeof piece.window[1] === "number");
    });
    if (ask.ask !== "append" || typeof ask.stream !== "number" || (ask.track !== "video" && ask.track !== "audio") || typeof ask.type !== "string" || typeof ask.init !== "string" || !pieces || !piecesRead) return null;
    return { kind: FEED_WORD, id: ask.id, ask: "append", stream: ask.stream, track: ask.track, type: ask.type, init: ask.init, pieces: pieces as FeedPiece[] };
  }
  type FeedPiece = Extract<FeedAsk, { ask: "append" }>["pieces"][number];

  window.addEventListener("message", (e: MessageEvent<unknown>) => {
    if (e.origin !== origin) return;
    const ask = askOf(e.data);
    if (!ask) return;
    if (ask.ask === "streams") answer(ask.id, null);
    else void append(ask).then((trouble) => answer(ask.id, trouble), (e: unknown) => answer(ask.id, wordsOf(e)));
  });
}
