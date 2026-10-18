import { youtubeLinkOf, youtubeMetaValue } from "@panki/contracts";
import type { Capture } from "../ui/Panel";

/**
 * Where something taken from a page came from: its title and its address, kept beside the card. Only a web address is
 * kept as a source (a file opened from the disk has none worth keeping). A page that is a video's own is a link to
 * that video as well, for the field that takes one.
 */
export function pageSource(): Pick<Capture, "source" | "sourceLink" | "video"> {
  const url = location.href;
  const title = document.title.trim();
  const onTheWeb = /^https?:\/\//i.test(url) && url.length <= 2000;
  const video = youtubeLinkOf(url);
  return {
    source: onTheWeb ? { url, title: title.slice(0, 300) } : null,
    // A video's own page gives the title and the channel too (`content/youtube.tsx` → `videoSource`); from any other page only the link is known.
    sourceLink: video ? youtubeMetaValue({ link: video, title: "", channel: null }) : "",
    video: video ? { id: video.videoId, avatar: null } : null,
  };
}
