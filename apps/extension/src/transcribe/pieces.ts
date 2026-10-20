import { nextChunk, type Transcription } from "@panki/contracts";

/**
 * Cuts a video's sound into chunks for the engine ("pieces" here and in the shapes; chunks to the owner, 2026-10-20),
 * where nobody is speaking. The sound comes in as the silent player plays it, a few thousand samples at a time; it's
 * kept here as one unbroken recording, and a chunk is closed after the fact, in the middle of the first half-second
 * with no voice in it once the chunk is as long as it's to be. Nothing is lost at a cut: what's after it is the start
 * of the next chunk. Only when nobody pauses for the wait is a chunk cut where it stands, at the quietest moment of its
 * last seconds, and then the next chunk begins a second and a half before that cut, so both hear the word at the edge
 * whole and the server keeps the better one (its stitch).
 *
 * How long a chunk is to be ramps up (Panki's settings, `ChunkShape`): the first chunk of a run, and the first after a
 * jump, is short, so the first words come quickly; each next one is longer, up to the chunk length, so the engine hears
 * more at a time and guesses less.
 *
 * Quiet is heard too. What's listened through with nothing to send (the half-second between two sentences, a jingle,
 * music under nobody's voice) is still a stretch of the video that's been heard, with nothing said in it; it goes to
 * Panki with the next chunk (`startMs` to `soundMs`, before the sound), or on its own as a chunk with no sound once it's
 * long enough, at a flush, or when listening picks up somewhere else. Otherwise every quiet is a hole in what's
 * covered: the first day the line on the player's bar broke wherever nobody spoke, and the run took each hole for
 * something still to transcribe. With Skip silence off (Panki's settings), nothing is let go as quiet: every second
 * heard is sent, voice or not, for a video whose quiet speech the voice measure misses.
 *
 * Time here is the video's own: the player runs faster than the video, so the sound it makes is taken at a lower
 * rate than the sound card's (`rate`: the card's rate divided by the speed), which is what makes the engine hear the
 * voice at its own pace. Nothing here knows about the page or the player; it's told the video's time at each anchor
 * and counts samples from there, block by block: a piece's start and end are read off the block they fall in, so the
 * count's drift from the player's clock never runs on from one piece to the next (`blocks`).
 */

/**
 * The cutter's own tuning, one home. Seconds unless said. How long a chunk is to be, how long it waits for a pause and
 * whether silence is skipped are Panki's settings since 2026-10-20 (`ChunkShape`, at the owner's word on the plan page,
 * after they'd had three such lengths in Settings for an hour on 2026-10-17 and taken them out); the rest is one
 * mechanism that just works, "invisible to the user… but make sure it's documented well in the code".
 *
 * How a chunk is cut, start to finish:
 *
 * 1. The silent player's sound arrives a few thousand samples at a time and is measured in frames of `frame` (20 ms):
 *    a frame is a voice when its loudness is `ratio` times the noise under it, the noise being the quietest tenth
 *    (`noiseShare`) of the last `noiseWindow` seconds' frames, never below `floor`. So music under a voice raises the
 *    floor and the voice still stands out above it, and a quiet room keeps the floor low.
 *
 * 2. A chunk closes in the middle of the first `silence` (half a second) with no voice in it, once the chunk is as
 *    long as it's to be. That's the first chunk's length for a run's first chunk, and the first after a jump; each
 *    next one is the last times the growth, up to the chunk length (5, 10, 20, 40, 45, 45… to begin with). A sentence
 *    at a time (3 to 20 s, the first day) made the engine guess more (the owner: "the model gets less context"), so the
 *    chunks grow to most of a minute; the first is short so a start or a jump shows words within seconds. (A ramp like
 *    this ran for a day once, 8 s doubling, until the owner had it out on 2026-10-17 for consistency; they asked for it
 *    back on 2026-10-20, knowing that, with its numbers as settings.)
 *
 * 3. Somebody who never pauses for the wait past that length is cut where they stand, at the quietest frame of the last
 *    `forceWindow` seconds (not within `forceKeep` of the very end), and the next chunk hears the last `overlap`
 *    (1.5 s) again, so the word at the cut is whole in one of the two; the server keeps the better hearing of each
 *    moment (its stitch: a word's depth is its distance from its chunk's nearer edge, and the deeper hearing wins).
 *    The server's `PIECE_MAX_MS` is the longest chunk length with the longest wait, and room.
 *
 * 4. A chunk with less than `minVoice` (0.4 s) of voice isn't sent (a cough, a click). After `longQuiet` (6 s) of
 *    nothing, a real break in the talk, a chunk shorter than it's to be is sent anyway, and one with no voice at all is
 *    let go. A flush sends what's open when it's `minFlush` long with voice in it. (With Skip silence off, none of this
 *    lets anything go: every chunk is sent as it closes, voice or not.)
 *
 * 5. Quiet is heard too (the file's head): what's let go is covered with the next chunk, or on its own every
 *    `quietEvery` seconds while nobody speaks, so the transcript has no holes where there was nothing to say.
 *
 * 6. The WAV goes at `outRate` (16 kHz, what the engine listens to) when the sound was taken above it.
 *
 * Trade-offs, should the numbers be revisited: longer chunks give the engine more context and cost nothing extra
 * (the engine charges by the second of sound), but a chunk's words come back only once the whole chunk has been heard
 * and transcribed, so words arrive later and a start feels slower; shorter chunks show words sooner and guess more.
 * The ramp is what lets both be true.
 */
export const CUT = {
  /** A stretch this long with no voice in it is where a chunk closes. */
  silence: 0.5,
  /** How much of a forced cut's end the next piece hears again. */
  overlap: 1.5,
  /** The last seconds of a piece a forced cut is looked for in, and how close to the very end it may not fall. */
  forceWindow: 6,
  forceKeep: 0.2,
  /** How long a frame is; the voice is measured frame by frame. */
  frame: 0.02,
  /** The quietest a frame can be and still count as a voice (the samples' RMS, between 0 and 1). */
  floor: 0.004,
  /** A voice is at least this many times the noise under it. */
  ratio: 3,
  /** The noise under the voice is the quietest tenth of the frames of the last few seconds. */
  noiseWindow: 4,
  noiseShare: 0.1,
  /** A piece with less voice than this in it isn't sent: a cough, a click. */
  minVoice: 0.4,
  /** With no voice for this long (a real break in the talk), a piece shorter than its least is sent anyway, and one with no voice at all is let go. */
  longQuiet: 6,
  /** A piece closed by a jump or a stop is sent only when it's at least this long. */
  minFlush: 1,
  /**
   * Listening picking up this far from where it left off, with a piece open, is a leap (the site's own seek, which
   * nothing flushed): the piece is closed where it was first, so no chunk spans it. Far above the clock's wobble at a
   * resume, so a hold at the lead never cuts a chunk short.
   */
  leap: 2,
  /** A stretch of nothing is told of on its own once it's this long, so what's covered grows through music too. */
  quietEvery: 20,
  /** The rate the engine listens at; sound taken at a higher rate is brought down to it. */
  outRate: 16000,
} as const;

/**
 * A piece closed and ready to send: the stretch of the video it accounts for, from `startMs` to `endMs`; where in it
 * the sound begins (`soundMs`; before that, quiet listened through), as a WAV file; or no sound at all (`wav` null,
 * `soundMs` at `endMs`), a stretch of nothing. `recordMs`: how long it took to record, by the clock, from its first
 * sample in to its cut (holds and stalls on the way included); 0 for a stretch of nothing.
 */
export type CutPiece = { startMs: number; soundMs: number; endMs: number; wav: Uint8Array<ArrayBuffer> | null; recordMs: number };

/** How the chunks are cut, as Panki's settings say (an admin's, for everyone): their lengths as they ramp up, the wait for a pause, whether silence is skipped. Seconds. */
export type ChunkShape = Pick<Transcription, "firstChunk" | "chunkGrowth" | "chunkLength" | "pauseWait" | "skipSilence">;

export type Cutter = {
  /** The next samples pushed begin at this moment of the video. Called as the player starts or resumes; the open piece goes on. */
  anchor(videoTime: number): void;
  /** Samples pushed from now until the next anchor are dropped: the player is paused, seeking, stalled or showing an ad. */
  suspend(): void;
  /** Sound as it comes, at `rate` samples per second of the video. */
  push(samples: Float32Array): void;
  /** Closes the open piece where it stands (a jump, a stop), sending it when it's worth sending. */
  flush(): void;
  /** The next chunk is a first one again, as short as a run's first: listening picks up somewhere the viewer wants words soon (a jump). */
  restart(): void;
  /** The moment the next sample pushed would stand at, by the count from the last anchor; null while suspended. */
  expected(): number | null;
  /** What's been listened to and not sent yet, in seconds of the video; null when nothing is. The strip's Details, as Recording. */
  recording(): { from: number; to: number } | null;
  /** How long the open chunk is to be before a pause closes it, in seconds of the video: where the ramp stands. */
  length(): number;
  /** Whether the open piece will be sent as a chunk when it closes: there's one, with voice enough in it (or Skip silence is off). */
  pending(): boolean;
  /** The open piece is to close at the next pause, however short it is: a part transcribed again, past its end. `closed` says once it has. */
  closeAtPause(): void;
  closed(): boolean;
};

/** Sound at one rate brought down to another by averaging the samples each new one covers: enough for a voice. */
function downTo(samples: Float32Array, from: number, to: number): Float32Array {
  if (from <= to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j] ?? 0;
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** Samples as a WAV file: 16-bit, one channel, at `rate` (a whole number). */
export function wavOf(samples: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const ascii = (at: number, word: string) => {
    for (let i = 0; i < word.length; i++) view.setUint8(at + i, word.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  }
  return new Uint8Array(bytes);
}

/** Sound at `rate` as the file the engine gets: at its own rate when the sound is above it, as it is otherwise. */
export function pieceWav(samples: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const out = Math.min(Math.round(rate), CUT.outRate);
  return wavOf(downTo(samples, rate, out), out);
}

/** `now`: the clock a chunk's recording is timed by, in ms. */
export function createCutter(rate: number, shape: ChunkShape, emit: (piece: CutPiece) => void, now: () => number): Cutter {
  const frameLen = Math.max(1, Math.round(rate * CUT.frame));
  const framesOf = (seconds: number) => Math.max(1, Math.round(seconds / CUT.frame));
  const silenceFrames = framesOf(CUT.silence);
  const longQuietFrames = framesOf(CUT.longQuiet);
  const noiseFrames = framesOf(CUT.noiseWindow);

  /** The open piece's sound, in the order it came. */
  let chunks: Float32Array[] = [];
  let length = 0;
  /** The video's moment of the open piece's first sample; null while the piece is empty. */
  let pieceStart: number | null = null;
  /**
   * Where each block pushed into the open piece begins (its first sample's place in the piece) and the video's moment
   * it was pushed at, as the last anchor put it. A moment in the piece is read off the block it falls in
   * (`timeOfSample`), never counted on from the piece's start: the count of samples drifts from the video's own clock
   * (a little, steadily, at speed), and the player's clock is what the anchors follow. Until 2026-10-19 a piece's start
   * and end were counted on from the one before, every piece of a run carrying the last one's error on, so the words
   * came ever earlier than they were said, by a second or two at the end of a twenty-minute video (the owner: "the
   * subtitles are ahead of the audio… this gap keeps growing throughout the video"). `wall` is when it came in, by
   * `now`, for how long a chunk took to record.
   */
  let blocks: { sample: number; time: number; wall: number }[] = [];
  /** The video's moment of a sample of the open piece, read off the block it falls in. */
  function timeOfSample(sample: number): number {
    let block = blocks[0];
    for (const b of blocks) {
      if (b.sample > sample) break;
      block = b;
    }
    return block ? block.time + (sample - block.sample) / rate : (pieceStart ?? 0) + sample / rate;
  }
  /** The video's moment of the next sample pushed; null while suspended. */
  let next: number | null = null;
  /** How long the open chunk is to be before a silence closes it: the first chunk's length, then each next grown from the last (`nextChunk`). */
  let least = shape.firstChunk;
  /** The video's moment from which listening has gone untold of: quiet let go, and the open piece; null when the last thing sent reached the present. */
  let heardFrom: number | null = null;
  /** The video's moment the last sample pushed reached: how far listening has gone. */
  let heardTo: number | null = null;
  /** Each whole frame of the open piece: how loud, and whether a voice was heard in it. */
  let loud: number[] = [];
  let voice: boolean[] = [];
  /** The frame being filled. */
  let partialSum = 0;
  let partialN = 0;
  /** How loud the last few seconds' frames were, the noise floor is read off them. */
  const recent: number[] = [];
  /** Asked to close at the next pause (`closeAtPause`), and whether it has since. */
  let closing = false;
  let closedAtPause = false;

  const noiseFloor = () => {
    if (recent.length === 0) return CUT.floor;
    const sorted = [...recent].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * CUT.noiseShare))] ?? CUT.floor;
  };
  const trailingQuiet = () => {
    let n = 0;
    for (let i = voice.length - 1; i >= 0 && !voice[i]; i--) n++;
    return n;
  };
  const voicedFrames = () => voice.reduce((n, v) => n + (v ? 1 : 0), 0);

  /** The open piece's samples as one array. */
  function all(): Float32Array {
    if (chunks.length === 1 && chunks[0]) return chunks[0];
    const joined = new Float32Array(length);
    let at = 0;
    for (const chunk of chunks) {
      joined.set(chunk, at);
      at += chunk.length;
    }
    chunks = [joined];
    return joined;
  }
  /** Keeps only the samples from `fromSample` on (and the frames with them); the piece now begins there, at the moment its block puts it. */
  function keepFrom(fromSample: number) {
    const samples = all();
    const from = Math.min(fromSample, samples.length);
    const kept = samples.slice(from);
    if (pieceStart !== null) pieceStart = timeOfSample(from);
    // The piece now begins inside a block that came in earlier: it was being recorded from then.
    const wall = blocks.filter((b) => b.sample <= from).at(-1)?.wall ?? now();
    blocks = [{ sample: 0, time: pieceStart ?? 0, wall }, ...blocks.filter((b) => b.sample > from).map((b) => ({ sample: b.sample - from, time: b.time, wall: b.wall }))];
    chunks = kept.length > 0 ? [kept] : [];
    length = kept.length;
    const fromFrame = Math.floor(fromSample / frameLen);
    loud = loud.slice(fromFrame);
    voice = voice.slice(fromFrame);
    if (length === 0) {
      pieceStart = null;
      blocks = [];
      partialSum = 0;
      partialN = 0;
    }
  }
  /** Sends the first `upToSample` samples as a piece (with the quiet let go before them), and keeps the rest from `keepFromSample` on. */
  function cut(upToSample: number, keepFromSample: number) {
    if (pieceStart === null) return;
    const samples = all();
    const end = Math.min(upToSample, samples.length);
    const soundMs = Math.round(pieceStart * 1000);
    const startMs = Math.min(soundMs, Math.round((heardFrom ?? pieceStart) * 1000));
    const recordMs = Math.max(0, Math.round(now() - (blocks[0]?.wall ?? now())));
    emit({ startMs, soundMs, endMs: Math.max(soundMs, Math.round(timeOfSample(end) * 1000)), wav: pieceWav(samples.slice(0, end), rate), recordMs });
    keepFrom(Math.max(0, Math.min(keepFromSample, samples.length)));
    // What's kept on is heard from where it now begins; nothing before that is left untold of.
    heardFrom = pieceStart;
    least = nextChunk(shape, least);
  }
  /**
   * Tells of the quiet listened through so far with nothing to send, up to where the open piece begins (or to all
   * that's been heard, when none is open): at once (`now`: a flush, listening picking up elsewhere), or once it's
   * `quietEvery` long. What's told of is covered from then on; the open piece stays as it is.
   */
  function tellQuiet(now: boolean) {
    if (heardFrom === null || heardTo === null) return;
    const to = pieceStart ?? heardTo;
    if (to - heardFrom < (now ? CUT.frame : CUT.quietEvery)) return;
    const endMs = Math.round(to * 1000);
    emit({ startMs: Math.round(heardFrom * 1000), soundMs: endMs, endMs, wav: null, recordMs: 0 });
    heardFrom = pieceStart;
  }

  /** A frame is full: measured, and the piece looked at. */
  function frameDone() {
    const rms = Math.sqrt(partialSum / Math.max(1, partialN));
    partialSum = 0;
    partialN = 0;
    recent.push(rms);
    if (recent.length > noiseFrames) recent.shift();
    const threshold = Math.max(CUT.floor, noiseFloor() * CUT.ratio);
    loud.push(rms);
    voice.push(rms > threshold);

    const quiet = trailingQuiet();
    const voiced = voicedFrames();
    const seconds = length / rate;
    if (quiet >= silenceFrames) {
      if (closing) {
        // The pause it was to close at: what's open is sent (or told of as quiet) through it.
        closing = false;
        closedAtPause = true;
        flush();
        return;
      }
      const voiceSeconds = voiced * CUT.frame;
      const half = Math.floor(silenceFrames / 2) * frameLen;
      if (!shape.skipSilence) {
        // Nothing is let go as quiet: the chunk closes at its first pause once it's long enough, voice or not.
        if (seconds >= least) cut(length - half, length - half);
        return;
      }
      if (voiceSeconds >= CUT.minVoice && (seconds >= least || quiet >= longQuietFrames)) {
        // Closed in the middle of the quiet: the rest of the quiet begins the next piece.
        cut(length - half, length - half);
      } else if (voiced === 0 || quiet >= longQuietFrames) {
        // Nothing said yet, or nothing worth sending before a long quiet: the piece begins again a little before now,
        // and the quiet let go is heard all the same, told of once there's enough of it.
        keepFrom(length - half);
        tellQuiet(false);
      }
      return;
    }
    if (seconds >= least + shape.pauseWait) {
      // Nobody paused: cut at the quietest frame of the last seconds, not right at the end, and let the next piece
      // hear the end of this one again.
      const from = Math.max(0, loud.length - framesOf(CUT.forceWindow));
      const to = Math.max(from + 1, loud.length - framesOf(CUT.forceKeep));
      let quietest = from;
      for (let i = from; i < to; i++) if ((loud[i] ?? Infinity) < (loud[quietest] ?? Infinity)) quietest = i;
      const at = quietest * frameLen;
      cut(at, at - Math.round(CUT.overlap * rate));
    }
  }

  /** Closes the open piece where it stands, sending it when it's worth sending, and tells of the quiet before it. */
  function flush() {
    const seconds = length / rate;
    const voiced = !shape.skipSilence || voicedFrames() * CUT.frame >= CUT.minVoice;
    if (pieceStart !== null && voiced && seconds >= CUT.minFlush) cut(length, length);
    else {
      // Nothing worth sending: what was listened through is told of as quiet, so it's covered all the same.
      keepFrom(length);
      tellQuiet(true);
    }
    heardFrom = null;
  }

  return {
    anchor(videoTime) {
      // Listening picks up somewhere else than it left off, a jump nothing flushed: with nothing open, the quiet heard
      // up to there is told of first, so it isn't stretched across the jump; with a piece open, it's closed where it
      // was (2026-10-20: the site's own seek from 0:00 to 3:39, under a piece begun at 0:00, made one chunk of both).
      if (heardTo !== null) {
        const away = Math.abs(videoTime - heardTo);
        if (pieceStart === null && away > CUT.silence) {
          tellQuiet(true);
          heardFrom = null;
        } else if (pieceStart !== null && away > CUT.leap) flush();
      }
      next = videoTime;
    },
    suspend() {
      next = null;
    },
    push(input) {
      if (next === null || input.length === 0) return;
      let samples = input;
      // Before the video's start: the silence of a player not yet there, never the video's. Left out, so nothing is
      // placed before 0:00 (2026-10-20: a run from 0:00 sent a chunk beginning at -0.1 s, and Panki turned it away).
      if (next < 0) {
        const skip = Math.min(samples.length, Math.ceil(-next * rate));
        samples = samples.subarray(skip);
        next = Math.max(0, next + skip / rate);
        if (samples.length === 0) return;
      }
      if (pieceStart === null) {
        pieceStart = next;
        blocks = [];
        if (heardFrom === null) heardFrom = next;
        partialSum = 0;
        partialN = 0;
      }
      blocks.push({ sample: length, time: next, wall: now() });
      next += samples.length / rate;
      heardTo = next;
      chunks.push(samples);
      length += samples.length;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i] ?? 0;
        partialSum += s * s;
        partialN++;
        if (partialN === frameLen) frameDone();
      }
    },
    flush,
    restart() {
      least = shape.firstChunk;
    },
    expected: () => next,
    recording() {
      const from = heardFrom ?? pieceStart;
      return from === null || heardTo === null || heardTo <= from ? null : { from, to: heardTo };
    },
    length: () => least,
    pending: () => pieceStart !== null && (!shape.skipSilence || voicedFrames() * CUT.frame >= CUT.minVoice),
    closeAtPause() {
      closing = true;
      closedAtPause = false;
    },
    closed: () => closedAtPause,
  };
}
