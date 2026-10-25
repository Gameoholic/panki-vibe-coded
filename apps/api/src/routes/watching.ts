import { Router, type Response } from "express";
import { GlanceAsk, SaveVideo, VideoId, WatchBatch, WatchMark, WatchingSettingsUpdate, type GlanceResponse, type SavedResponse, type WatchedVideoResponse, type WatchHistoryResponse, type WatchingSettingsResponse } from "@panki/contracts";
import type { DbOf } from "../app";
import { requireAdmin, signedIn } from "../session";
import type { Shared } from "../shared";

/**
 * What the account watches (2026-10-21, `watching.ts` in the contracts): the extension sends the stretches watched in
 * batches, asks of a video as it opens it (where it was stopped, whether it counts) and says what the owner said of it;
 * Settings reads the history in brief and forgets it. The API stamps every time; nothing is kept while the account's
 * Video tracking is off.
 */
export function watchingRouter(dbOf: DbOf, shared: Shared, now: () => number) {
  const router = Router();

  /** The video the address names, or null after saying it isn't one. */
  function videoOf(raw: unknown, res: Response): string | null {
    const videoId = VideoId.safeParse(raw);
    if (videoId.success) return videoId.data;
    res.status(400).json({ error: { message: "That isn't a video id." } });
    return null;
  }

  // How watching is told, for everyone: read by anyone signed in, changed by an admin alone (Settings → Admin).
  router.get("/settings", (_req, res) => {
    const answer: WatchingSettingsResponse = { watching: shared.getWatching() };
    res.json(answer);
  });
  router.patch("/settings", requireAdmin, (req, res) => {
    const parsed = WatchingSettingsUpdate.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That setting isn't valid.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const answer: WatchingSettingsResponse = { watching: shared.updateWatching(parsed.data, now(), signedIn(res).user.id) };
    res.json(answer);
  });

  // A batch sent again keeps nothing twice: each stretch's id is the extension's. Answered alike whether or not it was
  // kept, since with Video tracking off the extension has nothing to do about it.
  router.post("/", (req, res) => {
    const parsed = WatchBatch.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't what was watched.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    dbOf(res).keepWatching(parsed.data, { device: signedIn(res).device }, now());
    res.status(204).end();
  });

  router.get("/", (_req, res) => {
    const answer: WatchHistoryResponse = { history: dbOf(res).watchHistory() };
    res.json(answer);
  });

  // Every stretch and mark hidden with the time it went, none deleted.
  router.post("/forget", (_req, res) => {
    const answer: WatchHistoryResponse = { history: dbOf(res).forgetWatching(now()) };
    res.json(answer);
  });

  // Many videos at once, as thumbnails on YouTube's own pages show them: the account's own (how far it got, its cards)
  // and everyone's (whether Panki has subtitles for it). A POST for the list's length, read alone.
  router.post("/glance", (req, res) => {
    const parsed = GlanceAsk.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "Those aren't videos.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const ids = [...new Set(parsed.data.videoIds)];
    const transcribed = shared.transcribedOf(ids);
    const answer: GlanceResponse = { videos: dbOf(res).glance(ids).map((video) => ({ ...video, transcribed: transcribed.has(video.videoId) })) };
    res.json(answer);
  });

  // Saved for later, the account's own (2026-10-21): the list, a video saved with its name and channel, a save taken
  // back (hidden, never deleted). Each answers with the list as it stands after.
  router.get("/saved", (_req, res) => {
    const answer: SavedResponse = { videos: dbOf(res).savedVideos() };
    res.json(answer);
  });

  router.put("/saved/:videoId", (req, res) => {
    const videoId = videoOf(req.params.videoId, res);
    if (videoId === null) return;
    const parsed = SaveVideo.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't a video to save.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const answer: SavedResponse = { videos: dbOf(res).saveVideo(videoId, parsed.data, now()) };
    res.json(answer);
  });

  router.delete("/saved/:videoId", (req, res) => {
    const videoId = videoOf(req.params.videoId, res);
    if (videoId === null) return;
    const answer: SavedResponse = { videos: dbOf(res).unsaveVideo(videoId, now()) };
    res.json(answer);
  });

  router.get("/videos/:videoId", (req, res) => {
    const videoId = videoOf(req.params.videoId, res);
    if (videoId === null) return;
    const answer: WatchedVideoResponse = { video: dbOf(res).watchedVideo(videoId) };
    res.json(answer);
  });

  router.post("/videos/:videoId/marks", (req, res) => {
    const videoId = videoOf(req.params.videoId, res);
    if (videoId === null) return;
    const parsed = WatchMark.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: "That isn't something to say of a video.", path: parsed.error.issues[0]?.path ?? [] } });
      return;
    }
    const answer: WatchedVideoResponse = { video: dbOf(res).markVideo(videoId, parsed.data.kind, parsed.data.source ?? "viewer", now()) };
    res.json(answer);
  });

  return router;
}
