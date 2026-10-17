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

/**
 * What a YouTube metadata field holds (the owner, 2026-10-18, in place of a field that held the link alone): the
 * video, where in it, what it's called, and whose it is. Its value on a card is `youtubeMetaValue`'s JSON; a value
 * that's a bare address (every card from before) reads as the link with nothing else known.
 */
export type YouTubeMeta = {
  link: YouTubeLink;
  title: string;
  channel: { name: string; url: string } | null;
};
const TITLE_MAX = 300;
const NAME_MAX = 100;
const URL_MAX = 2000;
const isWeb = (url: string) => /^https?:\/\//i.test(url) && url.length <= URL_MAX;

/** The metadata a value is: the JSON, or a bare address; null when it's neither. */
export function youtubeMetaOf(value: string): YouTubeMeta | null {
  const text = value.trim();
  if (!text.startsWith("{")) {
    const link = youtubeLinkOf(text);
    return link ? { link, title: "", channel: null } : null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { url?: unknown; title?: unknown; channel?: unknown };
  const link = typeof r.url === "string" ? youtubeLinkOf(r.url) : null;
  if (!link) return null;
  const title = typeof r.title === "string" ? r.title.trim().slice(0, TITLE_MAX) : "";
  const c = typeof r.channel === "object" && r.channel !== null ? (r.channel as { name?: unknown; url?: unknown }) : null;
  const channel = c && typeof c.name === "string" && c.name.trim() !== "" && typeof c.url === "string" && isWeb(c.url.trim()) ? { name: c.name.trim().slice(0, NAME_MAX), url: c.url.trim() } : null;
  return { link, title, channel };
}

/** The metadata as a field's value: the address written afresh from the link, the title and the channel beside it. */
export function youtubeMetaValue(meta: YouTubeMeta): string {
  return JSON.stringify({ url: youtubeUrl(meta.link), title: meta.title.trim().slice(0, TITLE_MAX), ...(meta.channel ? { channel: { name: meta.channel.name.trim().slice(0, NAME_MAX), url: meta.channel.url.trim() } } : {}) });
}
