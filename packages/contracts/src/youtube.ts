/**
 * A link to a YouTube video, as a field of that kind holds it: which video, and how far in it opens. Read out of an
 * address and written back as one, here, so a card never carries an address that was only pasted and trusted: what's
 * opened is always the address `youtubeUrl` writes from the two.
 */
export type YouTubeLink = {
  videoId: string;
  /** Whole seconds in, where it opens; null when the address doesn't say. */
  seconds: number | null;
};

/** A video's id as YouTube writes it. */
const VIDEO_ID = "[A-Za-z0-9_-]{11}";
/** A watch page, the video named in its `v`. */
const WATCH = new RegExp(`^https?://(?:www\\.|m\\.|music\\.)?youtube\\.com/watch\\?(?:[^#]*&)?v=(${VIDEO_ID})(?:[&#]|$)`, "i");
/** The other addresses a video opens at, the video named in the path: the short link, a short, a live one, an embedded one. */
const IN_PATH = new RegExp(`^https?://(?:youtu\\.be|(?:www\\.|m\\.)?youtube\\.com/(?:shorts|live|embed))/(${VIDEO_ID})(?:[?&#/]|$)`, "i");
/** How far in: `t=83`, `t=83s`, `t=1m23s`, `t=1h2m3s`, or an embedded one's `start=83`. */
const AT = /[?&#](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?(?:[&#]|$)/i;

/** The video an address opens, and where in it; null when it isn't a YouTube video's address. */
export function youtubeLinkOf(text: string): YouTubeLink | null {
  const address = text.trim();
  // An address has no gaps in it: a line of words that only begins with one is words.
  if (/\s/.test(address)) return null;
  const videoId = (WATCH.exec(address) ?? IN_PATH.exec(address))?.[1];
  if (!videoId) return null;
  const at = AT.exec(address);
  const said = at !== null && (at[1] ?? at[2] ?? at[3]) !== undefined;
  return { videoId, seconds: said ? Number(at[1] ?? 0) * 3600 + Number(at[2] ?? 0) * 60 + Number(at[3] ?? 0) : null };
}

/** The address that opens a video, at its moment when it has one. */
export function youtubeUrl(link: YouTubeLink): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(link.videoId)}${link.seconds === null ? "" : `&t=${Math.max(0, Math.floor(link.seconds))}s`}`;
}
