import { z } from "zod";
import { VideoId } from "./transcription";

/**
 * Video tracking (the owner's notes of 2026-10-21: "video tracking for stats is enabled by default", "remember last
 * played timestamp", "Netflix like 'continue watching'", "count immersion"): what's kept of the videos an account
 * watches, on that account's own Panki. While a video plays, the extension notes each stretch of it watched (from where
 * to where in the video, how long it took on the clock, at what speed) and sends them in batches; the API stamps when.
 * Where a video was stopped is the end of its latest stretch, never a number kept on its own. Nothing is sent while the
 * account's Video tracking is off. Forgetting the history hides every row with the time it went, as a deleted card is.
 */

// What other accounts saw of this one's watching (ShareWatching, for Together) went on 2026-10-21 with everything about
// other people, shelved for a later feature. An account's watching is its own alone.

// The daily goals offered (WATCH_GOALS) went with the watch streak, 2026-10-21: no goal and no streak for immersion, for now.

/** The magnitudes of watching, one home. */
export const WATCH = {
  /** A video stopped within this much of its end was watched to the end: it leaves Continue watching, and isn't offered to continue. */
  endMs: 30_000,
  // `minStopMs` (a stop under 15 s wasn't somewhere to continue from) went on 2026-10-21: a video counts the moment it
  // plays (the owner: "I want it to count as soon as I clicked the video").
  /** How soon after a video starts playing its first stretch is sent, so it's in Continue watching and on its thumbnail at once. */
  firstMs: 2_000,
  /** How often the extension closes the stretch being watched and sends what it has while the video plays on (a pause, a jump, leaving or hiding the page send at once), so only a crash loses anything, and that much at most. Thirty seconds at the owner's word, 2026-10-21: a row a second would weigh on the stats for nothing. */
  flushMs: 30_000,
  /** The most videos Continue watching lists. */
  continueMax: 15,
} as const;

/** A video as the page shows it, sent with its stretches: its name, its channel, how long it is. YouTube's words, not the owner's. */
export const WatchVideo = z.object({
  videoId: VideoId,
  title: z.string().max(300),
  channel: z.object({ name: z.string().min(1).max(100), url: z.string().max(2000) }).nullable(),
  lengthMs: z.number().int().positive().max(86_400_000),
});
export type WatchVideo = z.infer<typeof WatchVideo>;

/**
 * A stretch of a video watched without a pause or a jump: from where to where in it, in ms of the video; how long it took
 * on the viewer's clock (`spentMs`, a span the browser measured) and how fast it played. Minted by the extension, so
 * a batch sent again is the same stretches and never a second set.
 */
export const NewWatchStretch = z
  .object({
    id: z.uuid(),
    videoId: VideoId,
    fromMs: z.number().int().nonnegative().max(86_400_000),
    toMs: z.number().int().nonnegative().max(86_400_000),
    spentMs: z.number().int().nonnegative().max(3_600_000),
    rate: z.number().min(0.0625).max(16),
  })
  .refine((s) => s.toMs >= s.fromMs, { message: "A stretch ends after it starts." });
export type NewWatchStretch = z.infer<typeof NewWatchStretch>;
/** What the extension sends: the stretches, and the videos they're of. */
export const WatchBatch = z.object({ videos: z.array(WatchVideo).max(20), stretches: z.array(NewWatchStretch).min(1).max(100) });
export type WatchBatch = z.infer<typeof WatchBatch>;

/** What can be said of one video: leave it out of the count (it isn't study), count it again, or put it away from Continue watching. */
export const WatchMarkKind = z.enum(["uncount", "count", "put-away"]);
export type WatchMarkKind = z.infer<typeof WatchMarkKind>;
export const WatchMark = z.object({ kind: WatchMarkKind });
export type WatchMark = z.infer<typeof WatchMark>;

/** One video as the extension asks of it when it opens: whether the account keeps its watching at all, where it was stopped, whether it counts. */
export const WatchedVideo = z.object({
  /** The account's Video tracking: off, nothing is sent and nothing is offered. */
  on: z.boolean(),
  /** Where it was last stopped, in ms of the video; null when never, when forgotten, or when it was watched to the end. */
  stoppedAtMs: z.number().int().nonnegative().nullable(),
  counted: z.boolean(),
});
export type WatchedVideo = z.infer<typeof WatchedVideo>;
export const WatchedVideoResponse = z.object({ video: WatchedVideo });
export type WatchedVideoResponse = z.infer<typeof WatchedVideoResponse>;

/** The most videos asked of in one glance: a page of YouTube shows a few dozen thumbnails at a time. */
export const GLANCE_MAX = 100;
/**
 * A video as Panki marks its thumbnail on YouTube's own pages (the owner, 2026-10-21: "make my YouTube homepage
 * better for Panki"): how far the account got in it (the end of its latest stretch; null while it never watched it or
 * its Video tracking is off), how long it is as last seen, how many of its living cards came from it, and whether
 * Panki has subtitles for it (any of a transcript: everyone's).
 */
export const VideoGlance = z.object({
  videoId: VideoId,
  watchedToMs: z.number().int().nonnegative().nullable(),
  lengthMs: z.number().int().nonnegative().nullable(),
  cards: z.number().int().nonnegative(),
  transcribed: z.boolean(),
  /** Saved for later by the account (`SavedVideo`): its thumbnail's save button shows a tick. */
  saved: z.boolean(),
});
export type VideoGlance = z.infer<typeof VideoGlance>;
export const GlanceAsk = z.object({ videoIds: z.array(VideoId).min(1).max(GLANCE_MAX) });
export type GlanceAsk = z.infer<typeof GlanceAsk>;
export const GlanceResponse = z.object({ videos: z.array(VideoGlance) });
export type GlanceResponse = z.infer<typeof GlanceResponse>;

/**
 * A video saved for later (the owner, 2026-10-21, picking the save button on thumbnails of six ways: "I don't want to
 * use YouTube's default feature of Watch later or playlists"): the account's own, kept on Panki, never YouTube's. Its
 * name and channel as the page showed them when it was saved; a save taken back is hidden with the time, never deleted.
 */
export const SavedVideo = z.object({
  videoId: VideoId,
  title: z.string().max(300),
  channel: z.string().max(100),
  savedAt: z.number().int().nonnegative(),
});
export type SavedVideo = z.infer<typeof SavedVideo>;
/** What's sent to save one: its name and channel as the page shows them (either may be unknown, "" then). */
export const SaveVideo = z.object({ title: z.string().max(300), channel: z.string().max(100) });
export type SaveVideo = z.infer<typeof SaveVideo>;
/** The most videos the Saved shelf is sent: newest first. */
export const SAVED_MAX = 50;
export const SavedResponse = z.object({ videos: z.array(SavedVideo).max(SAVED_MAX) });
export type SavedResponse = z.infer<typeof SavedResponse>;

/** All that's kept, in brief, for Settings → Account: how many videos, how long, since when. */
export const WatchHistory = z.object({
  videos: z.number().int().nonnegative(),
  ms: z.number().int().nonnegative(),
  since: z.number().int().nonnegative().nullable(),
});
export type WatchHistory = z.infer<typeof WatchHistory>;
export const WatchHistoryResponse = z.object({ history: WatchHistory });
export type WatchHistoryResponse = z.infer<typeof WatchHistoryResponse>;
