/**
 * How a frame Panki opens to download a video is told so, and how what it copies comes back: the two words in the
 * frame's address the doorway script reads (`content/doorway.ts`), and the word its messages carry. Nothing is imported
 * here, so the doorway script, which runs in the site's own page, carries nothing else of Panki's.
 */

/** In the frame's address: the run's own random mark, which every piece it sends back carries. */
export const KEEP_PARAM = "pankiKeep";
/** In the frame's address: the tallest picture to download, in lines (720 for 720p). */
export const HEIGHT_PARAM = "pankiHeight";
/** What a piece sent back from the frame says it is. */
export const PIECE_WORD = "panki-piece";
