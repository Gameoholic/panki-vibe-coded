import { sniffMimes } from "./mediaFiles";
import { timedOut } from "./outbound";

/**
 * A YouTube video's pictures, fetched from YouTube's own image servers and only from there, then kept by Panki for
 * everyone (`shared.ts` → `video_pictures`), so a card's video shows them even once the video or the channel is gone
 * (the owner, 2026-10-18: "can we maybe actually save the thumbnail too?", then the channel's picture). The thumbnail
 * is the 16:9 one at 320 by 180, which every video has; the channel's picture is the one its page shows, asked for at
 * 88 pixels. A card shows both small, and each weighs a few kilobytes.
 */
const THUMBNAILS = "https://i.ytimg.com";
/** Where a channel's picture is served from: Google's image servers for YouTube, as the page names them. */
const AVATAR_HOST = /^yt\d\.(?:ggpht|googleusercontent)\.com$/;
/** How big a channel's picture is asked for, in pixels: twice what a card draws it at. */
const AVATAR_SIZE = 88;
/** Far more than either weighs. */
const FILE_MAX = 1_000_000;
/** How long a picture may take to come back. */
const TIMEOUT_MS = 15_000;
/** What's kept: a picture, as its first bytes say. */
const PICTURES = new Set(["image/jpeg", "image/webp", "image/png"]);

/** What went wrong, in the owner's words, with the answer it gets: YouTube's fault (502), no picture there (404), or an address that isn't YouTube's (400). */
export class PictureError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type Picture = { mime: string; bytes: Buffer };

/** The address a video's thumbnail is fetched from. */
export function thumbnailAddress(videoId: string): string {
  return `${THUMBNAILS}/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

/**
 * The address a channel's picture is fetched from, from the one the page shows: YouTube's image servers only, over
 * https, at the size a card wants (the page's own is small). Throws for any other address.
 */
export function avatarAddress(shown: string): string {
  let url: URL;
  try {
    url = new URL(shown);
  } catch {
    throw new PictureError("That isn't a channel's picture.", 400);
  }
  if (url.protocol !== "https:" || !AVATAR_HOST.test(url.hostname) || url.username || url.password || url.port) throw new PictureError("That isn't a channel's picture.", 400);
  url.pathname = url.pathname.replace(/=s\d+(?=-|$)/, `=s${AVATAR_SIZE}`);
  return url.toString();
}

/** A picture from one of those addresses. `fetcher` is passed in, like the API's clock, so a test can stand in for YouTube. */
export async function fetchPicture(address: string, fetcher: typeof fetch = fetch): Promise<Picture> {
  let res: Response;
  try {
    // Never followed elsewhere: the address is YouTube's, and so is what comes back, or nothing does.
    res = await fetcher(address, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  } catch (e) {
    throw new PictureError(timedOut(e) ? "YouTube took too long to answer." : "Couldn't reach YouTube.", 502);
  }
  if (res.status === 404) throw new PictureError("YouTube has no such picture.", 404);
  if (!res.ok) throw new PictureError("YouTube didn't give the picture.", 502);
  if (Number(res.headers.get("content-length") ?? "0") > FILE_MAX) throw new PictureError("YouTube's picture is too large.", 502);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > FILE_MAX) throw new PictureError("YouTube's picture is too large.", 502);
  const mime = sniffMimes(bytes).find((type) => PICTURES.has(type));
  if (!mime) throw new PictureError("YouTube's picture isn't a picture.", 502);
  return { mime, bytes };
}
