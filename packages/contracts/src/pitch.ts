/**
 * A pitch accent, as a card's Pitch accent field holds it and as the popup and a card draw it (the owner, 2026-10-16:
 * a field kind of its own, drawn as the line over the reading rather than shown as text). Each accent is a reading and
 * the number dictionaries give it: after which mora the voice falls, 0 for never. A field keeps it written
 * "たべる 2", several split by commas; it's read leniently, so one typed "たべる [2]", or written with its fall marked
 * "たべꜜる [2]" (Panki's way before the kind existed), reads the same.
 */
export type PitchAccent = { reading: string; position: number };

/** Small kana that make one mora with the kana before them. */
const SMALL = "ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ";

/** A reading's morae: a small kana goes with the one before it (きょ is one). */
export function moraeOf(reading: string): string[] {
  const morae: string[] = [];
  for (const char of reading) {
    if (SMALL.includes(char) && morae.length > 0) morae[morae.length - 1] += char;
    else morae.push(char);
  }
  return morae;
}

/** One accent: its reading, then its number, maybe in brackets or after a colon. */
const ACCENT = /^(.+?)\s*[[(:：]?\s*(\d{1,2})\s*[\])]?$/;

/** The accents a field's value says; none when it says none that can be read (then it's shown as it was typed). */
export function pitchesOf(value: string): PitchAccent[] {
  return value.split(/[,、;；\n]/).flatMap((part) => {
    const match = ACCENT.exec(part.trim());
    const reading = match?.[1]?.replace(/ꜜ/g, "").trim();
    if (!match || !reading) return [];
    return [{ reading, position: Number(match[2]) }];
  });
}

/** Accents written as a field keeps them, each once: "たべる 2, たべる 0". */
export function pitchValue(accents: readonly PitchAccent[]): string {
  return [...new Set(accents.map((accent) => `${accent.reading} ${accent.position}`))].join(", ");
}

/** Whether the mora at `index` is said high, by the accent's number (0: all but the first; 1: only the first; n: the second to the nth). */
export function isHigh(position: number, index: number): boolean {
  return position === 0 ? index > 0 : position === 1 ? index === 0 : index > 0 && index < position;
}
