/**
 * How a frame Panki opens to download a video is told so, and how what it copies comes back: the word in the frame's
 * address the doorway script reads (`content/doorway.ts`), and the words its messages carry. Nothing is imported here,
 * so the doorway script, which runs in the site's own page, carries nothing else of Panki's.
 */

/** In the frame's address: the run's own random mark, which every piece it sends back carries. */
export const KEEP_PARAM = "pankiKeep";
/** What a piece sent back from the frame says it is. */
export const PIECE_WORD = "panki-piece";
/** What the doorway script says of itself as it goes: awake in the frame, a stream made. */
export const NOTE_WORD = "panki-doorway";
/** What Panki asks the doorway script on a video's own page, to play it from its copy: the streams, or pieces put in. */
export const FEED_WORD = "panki-feed";
/** What the doorway script answers it. */
export const FED_WORD = "panki-fed";
