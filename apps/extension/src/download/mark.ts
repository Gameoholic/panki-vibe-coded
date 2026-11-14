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
