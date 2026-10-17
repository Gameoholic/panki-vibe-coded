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

/** What is recorded, and until when. Seconds are the video's own. */
export type Stretch = {
  from: number;
  /** Asked many times a second with where the video is: true once the stretch is over. */
  until: (now: number) => boolean;
  /** Where it's expected to end, when that's known ahead, for showing how far along it is. */
  expectedEnd: number | null;
  soundOnly: boolean;
};

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

/** One stream per player, kept for as long as the page lives: asking twice would split the sound again. */
const streams = new WeakMap<HTMLMediaElement, MediaStream>();

function streamOf(video: HTMLVideoElement): MediaStream {
  const kept = streams.get(video);
  if (kept?.active) return kept;
  const el: Capturable = video;
  let stream: MediaStream;
  if (typeof el.captureStream === "function") {
    stream = el.captureStream();
  } else if (typeof el.mozCaptureStream === "function") {
    stream = el.mozCaptureStream();
    // Firefox sends a captured element's sound into the stream and away from the speakers, for as long as the stream
    // lives. It is played back out from the stream, so the video is heard as before.
    const out = new AudioContext();
    out.createMediaStreamSource(stream).connect(out.destination);
    void out.resume();
  } else {
    throw new RecordError("This browser can't record a player.");
  }
  streams.set(video, stream);
  return stream;
}

function formatFor(soundOnly: boolean): string | undefined {
  return FORMATS[soundOnly ? "sound" : "video"].find((format) => MediaRecorder.isTypeSupported(format));
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
 * Plays `stretch` once and gives back what was recorded. The video is left paused where it was before; whoever asked
 * decides when it goes on. `onProgress` is told how many seconds are recorded so far, and of how many when that's known.
 */
export async function recordStretch(video: HTMLVideoElement, stretch: Stretch, onProgress: (seconds: number, of: number | null) => void): Promise<Blob> {
  if (typeof MediaRecorder !== "function") throw new RecordError("This browser can't record a player.");
  const stream = streamOf(video);
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
  try {
    video.pause();
    video.playbackRate = 1;
    await seek(video, stretch.from);
    recorder.start();
    await video.play();
    await new Promise<void>((resolve, reject) => {
      let moved = performance.now();
      let last = video.currentTime;
      const tick = () => {
        const now = video.currentTime;
        if (now !== last) {
          last = now;
          moved = performance.now();
        }
        onProgress(Math.max(0, now - stretch.from), stretch.expectedEnd === null ? null : stretch.expectedEnd - stretch.from);
        if (stretch.until(now) || now - stretch.from >= CLIP_MAX_SECONDS || video.ended) {
          resolve();
          return;
        }
        // Stopped by hand, or stuck loading: a clip of a still picture is no clip.
        if (performance.now() - moved > STALL_MS) {
          reject(new RecordError("The video stopped before the line was over."));
          return;
        }
        setTimeout(tick, 40);
      };
      tick();
    });
  } finally {
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    video.playbackRate = before.rate;
    await seek(video, before.time).catch(() => undefined);
  }
  await stopped;
  const clip = new Blob(pieces, { type: recorder.mimeType || format || (stretch.soundOnly ? "audio/webm" : "video/webm") });
  if (clip.size === 0) throw new RecordError("Nothing came out of the player. A protected video can't be recorded.");
  return clip;
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
