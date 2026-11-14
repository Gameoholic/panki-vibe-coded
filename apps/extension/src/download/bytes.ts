/**
 * Bytes written as text and read back (a message to or from the extension's worker, or between the site's world and
 * Panki's, carries text, never bytes: a downloaded piece, a clip, a sound), and a downloaded piece told as a start
 * piece. Nothing is imported here, so the doorway script, which runs in the site's own page, carries nothing else of
 * Panki's.
 */

/**
 * A stream's start piece, by its first bytes: a WebM's EBML header, or an MP4's `ftyp` box. The rest of a stream's
 * pieces are its frames, which can't be played without the start piece before them.
 */
export function startPiece(bytes: Uint8Array): boolean {
  const webm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const mp4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  return webm || mp4;
}

/** Bytes as text. */
export function base64Of(bytes: Uint8Array): string {
  let text = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) text += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(text);
}

/** Text back as bytes; throws on text that isn't base64. */
export function bytesOf(base64: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
