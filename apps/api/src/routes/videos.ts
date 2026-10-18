import { Router, type Response } from "express";
import { AvatarBody, VideoId, VideoPicture, type VideoCards } from "@panki/contracts";
import type { DbOf } from "../app";
import { PictureError, avatarAddress, fetchPicture, thumbnailAddress, type Picture } from "../pictures";
import { signedIn } from "../session";
import type { Shared } from "../shared";

/**
 * What Panki keeps of a video for everyone, beside its transcript: its pictures. The thumbnail is fetched from YouTube
 * the first time anyone's card asks for it; the channel's picture is fetched from the address the drawer read off the
 * video's page as a card was made (there's no other way to know it), and each is served from Panki every time after.
 * The drawer asks for both as a card is made, so they're kept while the video is still there. `fetcher` is passed in
 * so a test can stand in for YouTube. And, the account's own, where in the video its cards were taken from.
 */
export function videosRouter(dbOf: DbOf, shared: Shared, now: () => number, fetcher: typeof fetch = fetch) {
  const router = Router();

  /** Fetches and keeps a picture, then answers with what's kept (whatever was kept first); or says why there's none. */
  async function keep(res: Response, videoId: string, picture: VideoPicture, address: string): Promise<Picture | null> {
    try {
      const fetched = await fetchPicture(address, fetcher);
      shared.keepPicture(videoId, picture, fetched, address, now(), signedIn(res).user.id);
      return shared.picture(videoId, picture) ?? fetched;
    } catch (e) {
      if (!(e instanceof PictureError)) throw e;
      res.status(e.status).json({ error: { message: e.message } });
      return null;
    }
  }
  /** A picture, kept once and never changed: the browser may hold on to it. */
  function send(res: Response, picture: Picture) {
    res.set({ "Content-Type": picture.mime, "Content-Length": String(picture.bytes.length), "Cache-Control": "private, max-age=31536000, immutable" });
    res.end(picture.bytes);
  }
  /** The video the address names, or null after saying it isn't one. */
  function videoOf(raw: unknown, res: Response): string | null {
    const videoId = VideoId.safeParse(raw);
    if (videoId.success) return videoId.data;
    res.status(400).json({ error: { message: "That isn't a video id." } });
    return null;
  }

  // Where in the video this account's cards were taken from: the extension marks them on the video's bar. Before the
  // pictures' route, which would take "cards" for a picture.
  router.get("/:videoId/cards", (req, res) => {
    const videoId = videoOf(req.params.videoId, res);
    if (videoId === null) return;
    const answer: VideoCards = { stretches: dbOf(res).videoStretches(videoId) };
    res.json(answer);
  });

  router.get("/:videoId/:picture", async (req, res) => {
    const videoId = videoOf(req.params.videoId, res);
    if (videoId === null) return;
    const picture = VideoPicture.safeParse(req.params.picture);
    if (!picture.success) {
      res.status(404).json({ error: { message: "Not found" } });
      return;
    }
    const kept = shared.picture(videoId, picture.data);
    if (kept) {
      send(res, kept);
      return;
    }
    // The thumbnail's address is known from the video; the channel's picture only once the drawer has said where it is.
    if (picture.data === "avatar") {
      res.status(404).json({ error: { message: "The channel's picture wasn't kept." } });
      return;
    }
    const fetched = await keep(res, videoId, "thumbnail", thumbnailAddress(videoId));
    if (fetched) send(res, fetched);
  });

  // The channel's picture, from where the video's page shows it: fetched once, then what's kept stands.
  router.put("/:videoId/avatar", async (req, res) => {
    const videoId = videoOf(req.params.videoId, res);
    if (videoId === null) return;
    const body = AvatarBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: { message: "That isn't a channel's picture." } });
      return;
    }
    const kept = shared.picture(videoId, "avatar");
    if (kept) {
      send(res, kept);
      return;
    }
    let address: string;
    try {
      address = avatarAddress(body.data.url);
    } catch (e) {
      if (!(e instanceof PictureError)) throw e;
      res.status(e.status).json({ error: { message: e.message } });
      return;
    }
    const fetched = await keep(res, videoId, "avatar", address);
    if (fetched) send(res, fetched);
  });

  return router;
}
