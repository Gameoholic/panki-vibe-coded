/** @panki Playing a downloaded video from its copy on its own page, YouTube's player kept (`createPlayback`, `PLAYBACK`). Never a second player. */
import { clock } from "@web/words";
import { askDownloadBytes, askDownloadFacts } from "../messages";
import { FED_WORD, FEED_WORD } from "./mark";
import { DOWNLOAD, FeedAnswer, type FeedAsk, type FeedPiece, type FeedStream, type KeptPiece, type Track } from "./download";

/**
 * A downloaded video plays from its copy on its own watch page in YouTube's own player, which never knows: whenever
 * what the player holds ahead of where it plays runs short and the player has put nothing in for a moment (no signal),
 * the kept pieces that come next are put into its streams, out of its sight, by the doorway script in the page
 * (`content/doorway.ts` → `feed`), until it holds `aheadSeconds` again. The player's controls, its seek bar and full
 * screen stay its own, and everything of Panki's on the page follows the same player as ever. With signal the player
 * keeps itself ahead and nothing is put in.
 *
 * What it did is said in the page's console as `[Panki] playback: …`, and its latest words under the Downloaded row in
 * the panel's menu: what was put in, what the player refused, and the player's own error if it stops.
 */

/** Every number playing from a copy is tuned by, in one place. */
export const PLAYBACK = {
  /** How often the page looks at what the player holds ahead, ms. */
  lookMs: 1000,
  /** Held this little ahead, seconds, the copy tops it up... */
  lowSeconds: 20,
  /** ...to this much ahead, seconds. */
  aheadSeconds: 90,
  /** The most of the video one put-in carries, seconds, and bytes. */
  stepSeconds: 30,
  stepBytes: 24 * 1024 * 1024,
  /** Only once the player has put nothing into the stream for this long, ms: while it's putting pieces in, they're its to put. */
  quietMs: 3000,
  /** How long the doorway script has to answer, ms; a put-in of a step's bytes takes longer than a look. */
  lookAnswerMs: 3000,
  putAnswerMs: 30_000,
  /** Where the player holds a moment, it's taken as held from a little before, seconds: a frame's rounding. */
  heldSlack: 0.25,
} as const;

/** The two streams, as a sentence names them. */
const TRACK_WORDS: Record<Track, string> = { video: "picture", audio: "sound" };
/** A video element's error code, as the browser defines them. */
const MEDIA_ERRORS: Record<number, string> = { 1: "aborted", 2: "network", 3: "decode", 4: "not supported" };

/** A step of playing from the copy, said in the page's console as the transcriber's Log prints its own. */
const say = (words: string) => console.info(`[Panki] playback: ${words}`);

export type PlaybackDeps = {
  /** The video on the page, while it's a downloaded one (downloaded whole, its mark aside); null otherwise. */
  downloaded: () => string | null;
  video: () => HTMLVideoElement | null;
  adPlaying: () => boolean;
  /** The video's length, ms, as the player says it; null while it isn't known. */
  lengthMs: () => number | null;
};

export type Playback = {
  start(): void;
  /** What playing from the copy did last on this page, for the panel's menu; null until it has done anything. */
  get(): { videoId: string; words: string } | null;
  subscribe(follower: () => void): () => void;
};

/** A run of kept pieces for one stream: its start piece and the pieces after it, all read with that start piece. */
type Step = { track: Track; init: KeptPiece; pieces: KeptPiece[]; fromMs: number; toMs: number };

/** The pieces of one stream that can be put in from `atMs` on, the start piece each is read with, up to a step's worth. */
export function stepFrom(pieces: readonly KeptPiece[], track: Track, atMs: number): Step | null {
  const mine = pieces.filter((p) => p.track === track).sort((a, b) => a.seq - b.seq);
  // A piece is read with the latest start piece of its stream before it in the order they came in.
  const initOf = new Map<number, KeptPiece>();
  let init: KeptPiece | null = null;
  for (const p of mine) {
    if (p.init) init = p;
    else if (init) initOf.set(p.seq, init);
  }
  const frames = mine.filter((p): p is KeptPiece & { fromMs: number; toMs: number } => !p.init && p.fromMs !== null && p.toMs !== null && initOf.has(p.seq)).sort((a, b) => a.fromMs - b.fromMs || b.seq - a.seq);
  const first = frames.find((p) => p.fromMs <= atMs + DOWNLOAD.mergeGapMs && p.toMs > atMs);
  const firstInit = first ? initOf.get(first.seq) : undefined;
  if (!first || !firstInit) return null;
  const step: Step = { track, init: firstInit, pieces: [first], fromMs: first.fromMs, toMs: first.toMs };
  let bytes = firstInit.size + first.size;
  while (step.toMs - atMs < PLAYBACK.stepSeconds * 1000) {
    const next = frames.find((p) => initOf.get(p.seq) === firstInit && p.fromMs <= step.toMs + DOWNLOAD.mergeGapMs && p.toMs > step.toMs);
    if (!next || bytes + next.size > PLAYBACK.stepBytes) break;
    step.pieces.push(next);
    step.toMs = next.toMs;
    bytes += next.size;
  }
  return step;
}

export function createPlayback(deps: PlaybackDeps): Playback {
  let now: { videoId: string; words: string } | null = null;
  const followers = new Set<() => void>();
  const tell = (videoId: string, words: string, log = true) => {
    if (log) say(words);
    if (now?.videoId === videoId && now.words === words) return;
    now = { videoId, words };
    for (const follower of followers) follower();
  };

  /** The downloaded video on the page and its pieces, all but their bytes; null while they're read. */
  let facts: { videoId: string; pieces: KeptPiece[] | null } | null = null;
  /** Each stream topping up until it holds `aheadSeconds`, once it ran short. */
  const filling = new Set<Track>();
  let busy = false;
  /** The stream of the site's player last fed, to say so when the player starts its streams again. */
  let fedStream: number | null = null;
  /** Where the copy last had nothing, said once. */
  let missing: string | null = null;
  const watched = new WeakSet<HTMLVideoElement>();

  let asked = 0;
  const waiting = new Map<number, (answer: FeedAnswer) => void>();
  function ask(question: FeedAsk, waitMs: number): Promise<FeedAnswer | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(question.id);
        resolve(null);
      }, waitMs);
      waiting.set(question.id, (answer) => {
        clearTimeout(timer);
        resolve(answer);
      });
      window.postMessage(JSON.stringify(question), location.origin);
    });
  }
  const hear = (e: MessageEvent<unknown>) => {
    if (e.origin !== location.origin || typeof e.data !== "string" || !e.data.startsWith(`{"kind":"${FED_WORD}"`)) return;
    let read: unknown;
    try {
      read = JSON.parse(e.data);
    } catch {
      return;
    }
    const answer = FeedAnswer.safeParse(read);
    if (answer.success) waiting.get(answer.data.id)?.(answer.data);
  };

  /** The player's own error, said as it happens: what playing from the copy is to find out. */
  function watch(video: HTMLVideoElement, videoId: string) {
    if (watched.has(video)) return;
    watched.add(video);
    video.addEventListener("error", () => {
      if (deps.downloaded() !== videoId) return;
      const error = video.error;
      tell(videoId, `YouTube's player stopped with an error: ${error ? `${MEDIA_ERRORS[error.code] ?? error.code}${error.message ? ` (${error.message})` : ""}` : "no detail"}.`);
    });
  }

  /** The stream to feed: the latest source the player made with both its streams started, the video's own length (an ad's is another). */
  function streamOf(streams: readonly FeedStream[], lengthMs: number | null): Map<Track, FeedStream> | null {
    const numbers = [...new Set(streams.map((s) => s.stream))].sort((a, b) => b - a);
    for (const n of numbers) {
      const of = streams.filter((s) => s.stream === n && s.open && s.started);
      const video = of.find((s) => s.track === "video");
      const audio = of.find((s) => s.track === "audio");
      if (!video || !audio) continue;
      const duration = video.duration;
      if (duration !== null && lengthMs !== null && Math.abs(duration * 1000 - lengthMs) > DOWNLOAD.durationSlackMs) continue;
      return new Map([
        ["video", video],
        ["audio", audio],
      ]);
    }
    return null;
  }

  /** How far ahead of `at` a stream holds, seconds: to the end of the stretch it's in, or none. */
  const heldUntil = (stream: FeedStream, at: number): number => stream.buffered.find(([from, to]) => from <= at + PLAYBACK.heldSlack && to > at)?.[1] ?? at;

  async function look() {
    if (busy) return;
    const videoId = deps.downloaded();
    const video = deps.video();
    if (!videoId || !video) {
      facts = null;
      filling.clear();
      fedStream = null;
      return;
    }
    watch(video, videoId);
    if (facts?.videoId !== videoId) {
      facts = { videoId, pieces: null };
      filling.clear();
      fedStream = null;
      missing = null;
      const answer = await askDownloadFacts(videoId);
      if (facts?.videoId !== videoId) return;
      if (!answer.ok) {
        facts = null;
        tell(videoId, `The download couldn't be read: ${answer.message}`);
        return;
      }
      facts.pieces = answer.pieces;
      say(`${answer.pieces.length} pieces of this video kept; played from them where YouTube's player runs short`);
    }
    const pieces = facts.pieces;
    if (!pieces || deps.adPlaying() || video.ended) return;
    busy = true;
    try {
      await feedNext(videoId, video, pieces);
    } finally {
      busy = false;
    }
  }

  async function feedNext(videoId: string, video: HTMLVideoElement, pieces: readonly KeptPiece[]) {
    asked++;
    const seen = await ask({ kind: FEED_WORD, id: asked, ask: "streams" }, PLAYBACK.lookAnswerMs);
    if (deps.downloaded() !== videoId) return;
    if (!seen) {
      tell(videoId, "The copy script didn't answer on the page: reload it.", now?.words !== "The copy script didn't answer on the page: reload it.");
      return;
    }
    const streams = streamOf(seen.streams, deps.lengthMs());
    if (!streams) return;
    const first = streams.get("video");
    if (first && fedStream !== null && first.stream !== fedStream) {
      say(`YouTube's player started its streams again (source ${fedStream} → ${first.stream}): what was put in went with the old ones`);
      filling.clear();
    }
    const at = video.currentTime;
    // Each stream: how far ahead it holds, and whether the copy is to top it up now.
    const short = [...streams.entries()]
      .map(([track, stream]) => ({ track, stream, until: heldUntil(stream, at) }))
      .filter(({ track, stream, until }) => {
        const ahead = until - at;
        if (ahead >= PLAYBACK.aheadSeconds) filling.delete(track);
        const end = stream.duration ?? Infinity;
        return until < end - 0.5 && ahead < (filling.has(track) ? PLAYBACK.aheadSeconds : PLAYBACK.lowSeconds) && stream.quietMs >= PLAYBACK.quietMs;
      })
      .sort((a, b) => a.until - b.until);
    const next = short[0];
    if (!next) return;
    filling.add(next.track);
    const atMs = Math.round(next.until * 1000);
    const step = stepFrom(pieces, next.track, atMs);
    if (!step) {
      const where = `The download has none of the ${TRACK_WORDS[next.track]} at ${clock(next.until)}.`;
      if (missing !== where) {
        missing = where;
        tell(videoId, where);
      }
      filling.delete(next.track);
      return;
    }
    // The bytes, read one after another; any gone, nothing is put in.
    const texts: string[] = [];
    for (const piece of [step.init, ...step.pieces]) {
      const bytes = await askDownloadBytes(videoId, piece.seq);
      if (!bytes.ok) {
        tell(videoId, `The download couldn't be read: ${bytes.message}`);
        return;
      }
      texts.push(bytes.base64);
    }
    const [init, ...frames] = texts;
    if (init === undefined || deps.downloaded() !== videoId) return;
    asked++;
    const fed: FeedAsk = {
      kind: FEED_WORD,
      id: asked,
      ask: "append",
      stream: next.stream.stream,
      track: next.track,
      type: step.init.type,
      init,
      pieces: step.pieces.map((piece, i): FeedPiece => ({ base64: frames[i] ?? "", offset: piece.offsetMs / 1000, window: [piece.windowMs[0] / 1000, piece.windowMs[1] === null ? null : piece.windowMs[1] / 1000] })),
    };
    const stretch = `the ${TRACK_WORDS[next.track]} from ${clock(step.fromMs / 1000)} to ${clock(step.toMs / 1000)}`;
    const answer = await ask(fed, PLAYBACK.putAnswerMs);
    if (!answer) {
      tell(videoId, `Put ${stretch} into YouTube's player; it didn't say how it went.`);
      return;
    }
    fedStream = next.stream.stream;
    if (answer.trouble !== null) {
      filling.delete(next.track);
      tell(videoId, `YouTube's player didn't take ${stretch} from the download: ${answer.trouble}.`);
      return;
    }
    const after = answer.streams.find((s) => s.stream === next.stream.stream && s.track === next.track);
    const holds = after ? heldUntil(after, video.currentTime) : null;
    tell(videoId, `Playing from the download: put in ${stretch}${holds !== null ? `, the player holds it to ${clock(holds)}` : ""}.`);
  }

  return {
    start() {
      window.addEventListener("message", hear);
      setInterval(() => void look(), PLAYBACK.lookMs);
    },
    get: () => now,
    subscribe(follower) {
      followers.add(follower);
      return () => {
        followers.delete(follower);
      };
    },
  };
}
