/** @panki Video tracking and Save for later as shapes: stretches watched, a video's marks and glance, saved videos (`WatchBatch`, `VideoGlance`, `SavedVideo`). */
import { z } from "zod";
import { VideoId } from "./transcription";

/**
 * Video tracking, for the stats, for where a video was stopped, for Continue watching and to count immersion: what's
 * kept of the videos an account watches, on that account's own Panki. While a video plays, the extension notes each
 * stretch of it watched (from where to where in the video, how long it took on the clock, at what speed) and sends them
 * in batches; the API stamps when. Where a video was stopped is the end of its latest stretch, never a number kept on
 * its own. Whether a browser sends at all is that browser's own Video tracking (once the account's,
 * `Settings.videoTracking`): the API keeps whatever arrives, from every browser, in the account's one pool. Forgetting the history hides every row
 * with the time it went, as a deleted card is.
 */

// An account's watching is its own alone: nothing of it is shown to other accounts.

// How close to its end a video counts as finished is each account's own, `Settings.finishedWithinSec`; a value an admin
// kept as `WatchingSettings`, when it was everyone's, is read by nothing.
/** Whether a moment of a video, in ms, is in its last `finishedWithinMs`: played into there, the video is finished. */
export const inEndZone = (atMs: number, lengthMs: number, finishedWithinMs: number) => atMs >= lengthMs - finishedWithinMs;

/** The magnitudes of watching, one home. */
export const WATCH = {
  // How near its end a video is finished is `Settings.finishedWithinSec`, not a magnitude here. A video counts the
  // moment it plays, with no shortest stop.
  /** How soon after a video starts playing its first stretch is sent, so it's in Continue watching and on its thumbnail at once. */
  firstMs: 2_000,
  /** How often the extension closes the stretch being watched and sends what it has while the video plays on (a pause, a jump, leaving or hiding the page send at once), so only a crash loses anything, and that much at most. Thirty seconds: a row a second would weigh on the stats for nothing. */
  flushMs: 30_000,
  /** The most videos Continue watching lists. */
  continueMax: 12,
  /** The most videos Recently watched lists, the latest finished first. */
  finishedMax: 50,
} as const;

/** A video as the page shows it, sent with its stretches: its name, its channel, how long it is. YouTube's words, not the account's. */
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

/**
 * What can be said of one video: leave it out of the count (it isn't study), count it again, put it away from Continue
 * watching, or say it's finished or not (a flag on the video, set when it's played into its end and changed only by
 * hand). Every mark is kept with when it was made, so which videos were finished, unfinished and finished again, and when, can
 * always be read back; what a video is now is its latest mark of each sort.
 */
export const WatchMarkKind = z.enum(["uncount", "count", "put-away", "finish", "unfinish"]);
export type WatchMarkKind = z.infer<typeof WatchMarkKind>;
/**
 * Who made a mark: the viewer, pressing something, or Panki, seeing the video played into its end (`end`). A third,
 * `history`, is the API's alone: a finish read back from what was watched before videos were marked finished
 * (migration 36).
 */
export const WatchMarkSource = z.enum(["viewer", "end"]);
export type WatchMarkSource = z.infer<typeof WatchMarkSource>;
export const WatchMark = z.object({ kind: WatchMarkKind, source: WatchMarkSource.optional() });
export type WatchMark = z.infer<typeof WatchMark>;

/**
 * One video as the extension asks of it when it opens: where it was stopped, whether it counts, whether it's finished.
 * Whether this browser's Video tracking is on is the extension's worker's to say (`messages.ts` → `Watched`).
 */
export const WatchedVideo = z.object({
  /** Where it was last stopped, in ms of the video; null when never, when forgotten, or when it's finished. */
  stoppedAtMs: z.number().int().nonnegative().nullable(),
  counted: z.boolean(),
  /** Finished: its latest finish or unfinish mark is a finish. False from an older server. */
  finished: z.boolean().default(false),
  /** How close to its end a video played counts as finished, the account's own (`Settings.finishedWithinSec`), in ms; 20 s from an older server. */
  finishedWithinMs: z.number().int().nonnegative().default(20_000),
});
export type WatchedVideo = z.infer<typeof WatchedVideo>;
export const WatchedVideoResponse = z.object({ video: WatchedVideo });
export type WatchedVideoResponse = z.infer<typeof WatchedVideoResponse>;

/** The most videos asked of in one glance: a page of YouTube shows a few dozen thumbnails at a time. */
export const GLANCE_MAX = 100;
/**
 * A video as Panki marks its thumbnail on YouTube's own pages: how far the account got in it (the end of its latest stretch; null while it never watched it),
 * how long it is as last seen, how many of its living cards came from it, and whether
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
  /** Finished (`WatchedVideo.finished`): its bar full. None from an older server. */
  finished: z.boolean().optional(),
});
export type VideoGlance = z.infer<typeof VideoGlance>;
export const GlanceAsk = z.object({ videoIds: z.array(VideoId).min(1).max(GLANCE_MAX) });
export type GlanceAsk = z.infer<typeof GlanceAsk>;
export const GlanceResponse = z.object({ videos: z.array(VideoGlance) });
export type GlanceResponse = z.infer<typeof GlanceResponse>;

/**
 * A video saved for later, from the save button on its thumbnail: the account's own, kept on Panki, never YouTube's
 * Watch later or a playlist. Its name and channel as the page showed them when it was saved; a save taken back is
 * hidden with the time, never deleted. Its length is the player's when it
 * was watched, else what its thumbnail said when it was saved; null when neither is known (one saved before lengths were kept).
 */
export const SavedVideo = z.object({
  videoId: VideoId,
  title: z.string().max(300),
  channel: z.string().max(100),
  savedAt: z.number().int().nonnegative(),
  lengthMs: z.number().int().nonnegative().nullable(),
});
export type SavedVideo = z.infer<typeof SavedVideo>;
/**
 * What's sent to save one: its name, channel and length as the page shows them (either name may be unknown, "" then; the
 * length null, or left out by an extension from before it was sent).
 */
export const SaveVideo = z.object({ title: z.string().max(300), channel: z.string().max(100), lengthMs: z.number().int().positive().max(86_400_000).nullable().optional() });
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

/**
 * What an extension says of its own Video tracking switch, as it starts signed in and whenever it's changed
 * (`PUT /api/watching/device`; Settings → Extension → Data tracking lists each extension and whether it sends). Kept on the sign-in it came on; nothing on Panki switches it.
 */
export const DeviceTracking = z.object({ videoTracking: z.boolean() });
export type DeviceTracking = z.infer<typeof DeviceTracking>;
/**
 * One extension's sign-in as Data tracking lists it: the device as the Account tab names it, and what it last said of
 * its Video tracking (null for an extension that hasn't said yet, shown as Off), and when a stretch watched last came
 * from it (null for never). The website's own sign-ins are never here.
 */
export const TrackingDevice = z.object({
  id: z.string().min(1),
  device: z.string(),
  createdAt: z.number().int().nonnegative(),
  videoTracking: z.boolean().nullable(),
  lastSentAt: z.number().int().nonnegative().nullable(),
});
export type TrackingDevice = z.infer<typeof TrackingDevice>;
export const TrackingDevicesResponse = z.object({ devices: z.array(TrackingDevice) });
export type TrackingDevicesResponse = z.infer<typeof TrackingDevicesResponse>;
