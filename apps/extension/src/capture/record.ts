/**
 * Records a stretch of a video off the player itself: the element's own picture and sound, nothing else in the tab,
 * no screen sharing and no asking. A browser can't hand back what has already played, so the stretch is played once
 * more while it's recorded, then the video is put back where it was. Written against the platform's own interfaces
 * (a media element's `captureStream`, `MediaRecorder`); nothing here comes from another tool's code.
 *
 * A protected video (a paid film) gives nothing this way, by the browser's own rule; the recording is then empty and
 * says so.
 */

export class RecordError extends Error {}
/** The player was paused, moved, sped up or given another video while it was being recorded: the clip would carry that, so none is made, and nothing is added until it's tried again. */
export class RecordTouched extends RecordError {
  constructor() {
    super("The video was paused or moved while it was being recorded.");
  }
}

/** What a player does when anything but the recording handles it: any of these while it's recorded would be in the clip. */
const TOUCHES = ["pause", "seeking", "ratechange", "emptied"] as const;

/** What is recorded, and until when. Seconds are the video's own. */
export type Stretch = {
  from: number;
  /** Asked many times a second with where the video is: true once the stretch is over. */
  until: (now: number) => boolean;
  /** Where it's expected to end, when that's known ahead, for showing how far along it is. */
  expectedEnd: number | null;
  soundOnly: boolean;
};

/**
 * How a recording came out, as the player and the recorder had it, so it can be recorded again later (the contracts'
 * `MediaRecording`): where the video stood when it stopped (its own seconds), the picture's size and rate as the player
 * played it (null where the browser doesn't say), and the bit rates the recorder was given (none for the picture when
 * only the sound was kept).
 */
export type RecordFacts = { stoppedAt: number; width: number | null; height: number | null; frameRate: number | null; videoBits: number | null; audioBits: number | null };
export type Recorded = { file: Blob; facts: RecordFacts };

/** The longest a clip can be, whatever `until` says. */
export const CLIP_MAX_SECONDS = 30;
/** How long the video may take to get going (a jump, a slow connection) before the recording gives up. */
const STALL_MS = 12_000;

/** What a browser may be able to write, best first. The API takes a .webm as a clip or as a sound. */
const FORMATS = {
  video: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
  sound: ["audio/webm;codecs=opus", "audio/webm"],
} as const;
const VIDEO_BITS = 1_200_000;
const SOUND_BITS = 96_000;

/** A media element as browsers really have it: Chrome's `captureStream`, and Firefox's own name for the same. */
type Capturable = HTMLMediaElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };

/** A player's picture and sound as a stream, for one recording, and what's done with it once that's over. */
type Captured = { stream: MediaStream; release: () => void };

/** Firefox's stream of a player, kept: taking it moves the element's sound into it, played back out through `out`. */
const kept = new WeakMap<HTMLMediaElement, { stream: MediaStream; out: AudioContext }>();

const isLive = (tracks: readonly MediaStreamTrack[]) => tracks.some((track) => track.readyState === "live");

/**
 * The player's picture and sound, for one recording. Chrome's is taken afresh each time and let go after: with one kept
 * for as long as the page lived, clips came out as a file's header with nothing in it while the sound cuts beside them
 * were whole (2026-10-18), most likely its picture having stopped while its sound went on (the site changes video
 * without loading a new page). Firefox's is kept while its picture is live, since taking it twice would split the sound.
 */
function capture(video: HTMLVideoElement): Captured {
  const el: Capturable = video;
  if (typeof el.captureStream === "function") {
    const stream = el.captureStream();
    return { stream, release: () => stream.getTracks().forEach((track) => track.stop()) };
  }
  if (typeof el.mozCaptureStream !== "function") throw new RecordError("This browser can't record a player.");
  const was = kept.get(video);
  if (was && isLive(was.stream.getVideoTracks())) return { stream: was.stream, release: () => undefined };
  if (was) {
    was.stream.getTracks().forEach((track) => track.stop());
    void was.out.close();
  }
  const stream = el.mozCaptureStream();
  // Firefox sends a captured element's sound into the stream and away from the speakers, for as long as the stream
  // lives. It is played back out from the stream, so the video is heard as before.
  const out = new AudioContext();
  out.createMediaStreamSource(stream).connect(out.destination);
  void out.resume();
  kept.set(video, { stream, out });
  return { stream, release: () => undefined };
}

/** WebM's Cluster element, which every picture and sound recorded sits in. */
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75] as const;

/** Whether a recording holds any picture or sound: one that got none is a WebM's header alone, with no Cluster in it (a hundred-odd bytes). */
async function holdsMedia(clip: Blob): Promise<boolean> {
  if (clip.size === 0) return false;
  if (!clip.type.includes("webm")) return true;
  const bytes = new Uint8Array(await clip.arrayBuffer());
  for (let i = 0; i + CLUSTER.length <= bytes.length; i++) {
    if (bytes[i] === CLUSTER[0] && bytes[i + 1] === CLUSTER[1] && bytes[i + 2] === CLUSTER[2] && bytes[i + 3] === CLUSTER[3]) return true;
  }
  return false;
}

function formatFor(soundOnly: boolean): string | undefined {
  return FORMATS[soundOnly ? "sound" : "video"].find((format) => MediaRecorder.isTypeSupported(format));
}

/** The picture's size and rate as the player plays it right now: what a recording of it holds. */
function pictureOf(video: HTMLVideoElement, stream: MediaStream): Pick<RecordFacts, "width" | "height" | "frameRate"> {
  const rate = stream.getVideoTracks()[0]?.getSettings().frameRate;
  return { width: video.videoWidth || null, height: video.videoHeight || null, frameRate: rate !== undefined && rate > 0 ? rate : null };
}

/** Moves the video to a moment and waits until it's there. */
function seek(video: HTMLVideoElement, to: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - to) < 0.02) {
      resolve();
      return;
    }
    const arrived = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      video.removeEventListener("seeked", arrived);
      reject(new RecordError("The video didn't go back to the line."));
    }, STALL_MS);
    video.addEventListener("seeked", arrived, { once: true });
    video.currentTime = to;
  });
}

/**
 * Plays `stretch` once and gives back what was recorded, and how. The video is left paused where it was before; whoever
 * asked decides when it goes on. `onProgress` is told how many seconds are recorded so far, and of how many when that's
 * known.
 */
export async function recordStretch(video: HTMLVideoElement, stretch: Stretch, onProgress: (seconds: number, of: number | null) => void): Promise<Recorded> {
  if (typeof MediaRecorder !== "function") throw new RecordError("This browser can't record a player.");
  const { stream, release } = capture(video);
  try {
    return await recordFrom(video, stream, stretch, onProgress);
  } finally {
    release();
  }
}

/** The recording itself, off a stream taken for it. */
async function recordFrom(video: HTMLVideoElement, stream: MediaStream, stretch: Stretch, onProgress: (seconds: number, of: number | null) => void): Promise<Recorded> {
  const sound = stream.getAudioTracks();
  if (stretch.soundOnly && sound.length === 0) throw new RecordError("This video has no sound to record.");
  const input = stretch.soundOnly ? new MediaStream(sound) : stream;
  const format = formatFor(stretch.soundOnly);
  const recorder = new MediaRecorder(input, { ...(format ? { mimeType: format } : {}), videoBitsPerSecond: VIDEO_BITS, audioBitsPerSecond: SOUND_BITS });
  const pieces: Blob[] = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data.size > 0) pieces.push(e.data);
  });
  const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));

  const before = { time: video.currentTime, rate: video.playbackRate };
  let stoppedAt = stretch.from;
  let picture = pictureOf(video, stream);
  try {
    video.pause();
    video.playbackRate = 1;
    await seek(video, stretch.from);
    recorder.start();
    await video.play();
    await new Promise<void>((resolve, reject) => {
      let moved = performance.now();
      let last = video.currentTime;
      let timer = 0;
      // Heard from here on, until the stretch is over; the recording's own pause, seek and speed came before.
      const settle = (error: RecordError | null) => {
        clearTimeout(timer);
        for (const type of TOUCHES) video.removeEventListener(type, touched);
        if (error) reject(error);
        else resolve();
      };
      function touched(e: Event) {
        // Played to the video's own end, the player pauses itself: that's the stretch over, not a touch.
        if (e.type === "pause" && video.ended) return;
        settle(new RecordTouched());
      }
      for (const type of TOUCHES) video.addEventListener(type, touched);
      const tick = () => {
        const now = video.currentTime;
        if (now !== last) {
          last = now;
          moved = performance.now();
        }
        onProgress(Math.max(0, now - stretch.from), stretch.expectedEnd === null ? null : stretch.expectedEnd - stretch.from);
        if (stretch.until(now) || now - stretch.from >= CLIP_MAX_SECONDS || video.ended) {
          settle(null);
          return;
        }
        // Stuck loading: a clip of a still picture is no clip.
        if (performance.now() - moved > STALL_MS) {
          settle(new RecordError("The video stopped before the line was over."));
          return;
        }
        timer = window.setTimeout(tick, 40);
      };
      tick();
    });
  } finally {
    // Where it really stopped, and the picture as it last was: what the recording ends on.
    stoppedAt = video.currentTime;
    picture = pictureOf(video, stream);
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    video.playbackRate = before.rate;
    await seek(video, before.time).catch(() => undefined);
  }
  await stopped;
  const clip = new Blob(pieces, { type: recorder.mimeType || format || (stretch.soundOnly ? "audio/webm" : "video/webm") });
  if (!(await holdsMedia(clip))) throw new RecordError("Nothing came out of the player. A protected video can't be recorded.");
  const bits = { videoBits: stretch.soundOnly ? null : recorder.videoBitsPerSecond || null, audioBits: recorder.audioBitsPerSecond || null };
  return { file: clip, facts: { stoppedAt, ...picture, ...bits } };
}

/** A file as the text a message can carry (the part of a data address after its comma). */
export function base64Of(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const address = typeof reader.result === "string" ? reader.result : "";
      // The last comma, never the first: the file's own type comes before the text and can hold one itself
      // ("video/webm;codecs=vp9,opus"), while the text after it never does.
      resolve(address.slice(address.lastIndexOf(",") + 1));
    });
    reader.addEventListener("error", () => reject(new RecordError("The clip couldn't be read back.")));
    reader.readAsDataURL(file);
  });
}
