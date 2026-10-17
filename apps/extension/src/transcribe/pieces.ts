/**
 * Cuts a video's sound into pieces for the engine, where nobody is speaking. The sound comes in as the silent player
 * plays it, a few thousand samples at a time; it's kept here as one unbroken recording, and a piece is closed after
 * the fact, in the middle of the first half-second with no voice in it once the piece is long enough. Nothing is lost
 * at a cut: what's after it is the start of the next piece. Only when nobody pauses for twenty seconds is a piece cut
 * where it stands, at the quietest moment of its last seconds, and then the next piece begins a second and a half
 * before that cut, so both hear the word at the edge whole and the server keeps the better one (its stitch).
 *
 * Quiet is heard too. What's listened through with nothing to send (the half-second between two sentences, a jingle,
 * music under nobody's voice) is still a stretch of the video that's been heard, with nothing said in it; it goes to
 * Panki with the next piece (`startMs` to `soundMs`, before the sound), or on its own as a piece with no sound once it's
 * long enough, at a flush, or when listening picks up somewhere else. Otherwise every quiet is a hole in what's
 * covered: the first day the line on the player's bar broke wherever nobody spoke, and the follower took each hole for
 * something still to transcribe.
 *
 * Time here is the video's own: the player runs faster than the video, so the sound it makes is taken at a lower
 * rate than the sound card's (`rate`: the card's rate divided by the speed), which is what makes the engine hear the
 * voice at its own pace. Nothing here knows about the page or the player; it's told the video's time at each anchor
 * and counts samples from there.
 */

/**
 * The cutter's tuning, one home. Seconds unless said. Nothing here is a setting: from the viewer's side it's one
 * mechanism that just works (the owner, 2026-10-17, after an hour with three of these numbers in Panki's Settings:
 * "it'll be invisible to the user, it's just a super smart algorithm from their perspective… but make sure it's
 * documented well in the code").
 *
 * How a piece is cut, start to finish:
 *
 * 1. The silent player's sound arrives a few thousand samples at a time and is measured in frames of `frame` (20 ms):
 *    a frame is a voice when its loudness is `ratio` times the noise under it, the noise being the quietest tenth
 *    (`noiseShare`) of the last `noiseWindow` seconds' frames, never below `floor`. So music under a voice raises the
 *    floor and the voice still stands out above it, and a quiet room keeps the floor low.
 *
 * 2. A piece closes in the middle of the first `silence` (half a second) with no voice in it, once the piece is long
 *    enough. Long enough is `minPiece` (45 s, about a minute of talk), so the engine hears a whole stretch and has
 *    its context: a sentence at a time (3 to 20 s, the first day) made it guess more (the owner: "it feels wrong that
 *    we only send chunks between pauses, the model gets less context"). Every piece is held to the same least, the
 *    first of a run too: for a day a run's first piece was 8 s and each next twice the last, so words showed within
 *    seconds of a start, until the owner had it taken out (2026-10-17, "I just have to wait a little when the video
 *    first starts, no worries… we'll get better consistency this way"). So a start or a jump shows nothing for about
 *    as long as a piece takes to be heard at speed, and every piece is heard with the same context.
 *
 * 3. Somebody who never pauses for `maxPiece` (75 s) is cut where they stand, at the quietest frame of the last
 *    `forceWindow` seconds (not within `forceKeep` of the very end), and the next piece hears the last `overlap`
 *    (1.5 s) again, so the word at the cut is whole in one of the two; the server keeps the better hearing of each
 *    moment (its stitch: a word's depth is its distance from its piece's nearer edge, and the deeper hearing wins).
 *    The server's `PIECE_MAX_MS` (90 s) is `maxPiece` with the overlap and room; raise both together.
 *
 * 4. A piece with less than `minVoice` (0.4 s) of voice isn't sent (a cough, a click). After `longQuiet` (6 s) of
 *    nothing, a real break in the talk, a piece shorter than its least is sent anyway, and one with no voice at all is
 *    let go. A flush sends what's open when it's `minFlush` long with voice in it.
 *
 * 5. Quiet is heard too (the file's head): what's let go is covered with the next piece, or on its own every
 *    `quietEvery` seconds while nobody speaks, so the transcript has no holes where there was nothing to say.
 *
 * 6. The WAV goes at `outRate` (16 kHz, what the engine listens to) when the sound was taken above it.
 *
 * Trade-offs, should the numbers be revisited: longer pieces give the engine more context and cost nothing extra
 * (the engine charges by the second of sound), but a piece's words come back only once the whole piece has been heard
 * and transcribed, so words arrive later and a start feels slower; shorter pieces show words sooner and guess more.
 * The ramp is what lets both be true. The language check rides on the pieces too: a run asks the engine what it hears
 * until it has heard Japanese for sure once (`transcriber.ts`), so the first short pieces also settle the language.
 */
export const CUT = {
  /** A stretch this long with no voice in it is where a piece closes. */
  silence: 0.5,
  /** A piece is at least this long before a silence closes it (the first of a run too)… */
  minPiece: 45,
  /** …and never longer than this: then it's cut where it stands. */
  maxPiece: 75,
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
  /** A stretch of nothing is told of on its own once it's this long, so what's covered grows through music too. */
  quietEvery: 20,
  /** The rate the engine listens at; sound taken at a higher rate is brought down to it. */
  outRate: 16000,
} as const;

/**
 * A piece closed and ready to send: the stretch of the video it accounts for, from `startMs` to `endMs`; where in it
 * the sound begins (`soundMs`; before that, quiet listened through), as a WAV file; or no sound at all (`wav` null,
 * `soundMs` at `endMs`), a stretch of nothing.
 */
export type CutPiece = { startMs: number; soundMs: number; endMs: number; wav: Uint8Array<ArrayBuffer> | null };

export type Cutter = {
  /** The next samples pushed begin at this moment of the video. Called as the player starts or resumes; the open piece goes on. */
  anchor(videoTime: number): void;
  /** Samples pushed from now until the next anchor are dropped: the player is paused, seeking, stalled or showing an ad. */
  suspend(): void;
  /** Sound as it comes, at `rate` samples per second of the video. */
  push(samples: Float32Array): void;
  /** Closes the open piece where it stands (a jump, a stop), sending it when it's worth sending. */
  flush(): void;
  /** The moment the next sample pushed would stand at, by the count from the last anchor; null while suspended. */
  expected(): number | null;
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

export function createCutter(rate: number, emit: (piece: CutPiece) => void): Cutter {
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
  /** The video's moment of the next sample pushed; null while suspended. */
  let next: number | null = null;
  /** The least a piece is before a silence closes it: the same for every piece. */
  const least = CUT.minPiece;
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
  /** Keeps only the samples from `fromSample` on (and the frames with them); the piece now begins there. */
  function keepFrom(fromSample: number) {
    const samples = all();
    const kept = samples.slice(Math.min(fromSample, samples.length));
    if (pieceStart !== null) pieceStart += Math.min(fromSample, samples.length) / rate;
    chunks = kept.length > 0 ? [kept] : [];
    length = kept.length;
    const fromFrame = Math.floor(fromSample / frameLen);
    loud = loud.slice(fromFrame);
    voice = voice.slice(fromFrame);
    if (length === 0) {
      pieceStart = null;
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
    emit({ startMs, soundMs, endMs: soundMs + Math.round((end / rate) * 1000), wav: pieceWav(samples.slice(0, end), rate) });
    keepFrom(Math.max(0, Math.min(keepFromSample, samples.length)));
    // What's kept on is heard from where it now begins; nothing before that is left untold of.
    heardFrom = pieceStart;
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
    emit({ startMs: Math.round(heardFrom * 1000), soundMs: endMs, endMs, wav: null });
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
      const voiceSeconds = voiced * CUT.frame;
      const half = Math.floor(silenceFrames / 2) * frameLen;
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
    if (seconds >= CUT.maxPiece) {
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

  return {
    anchor(videoTime) {
      // Listening picks up somewhere else than it left off, with nothing open (a jump that wasn't flushed): the quiet
      // heard up to there is told of first, so it isn't stretched across the jump.
      if (pieceStart === null && heardTo !== null && Math.abs(videoTime - heardTo) > CUT.silence) {
        tellQuiet(true);
        heardFrom = null;
      }
      next = videoTime;
    },
    suspend() {
      next = null;
    },
    push(samples) {
      if (next === null || samples.length === 0) return;
      if (pieceStart === null) {
        pieceStart = next;
        if (heardFrom === null) heardFrom = next;
        partialSum = 0;
        partialN = 0;
      }
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
    flush() {
      const seconds = length / rate;
      if (pieceStart !== null && voicedFrames() * CUT.frame >= CUT.minVoice && seconds >= CUT.minFlush) cut(length, length);
      else {
        // Nothing worth sending: what was listened through is told of as quiet, so it's covered all the same.
        keepFrom(length);
        tellQuiet(true);
      }
      heardFrom = null;
    },
    expected: () => next,
  };
}
