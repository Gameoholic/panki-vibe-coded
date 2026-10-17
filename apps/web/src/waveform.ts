import { api } from "./api";
import type { Wave } from "./components/MediaLooks";

/**
 * The shape of a file's sound, for a voice note's waveform: the file read once, its sound decoded by the browser, and
 * the loudest moment of each stretch as a bar, the loudest of all as the full height. Read from the file itself, never
 * made up: a file that can't be read or decoded gets no shape, and the voice note stays level. What's been read is kept
 * while the app is open, so a card seen again doesn't read its file again.
 */
const shapes = new Map<string, Promise<readonly number[] | null>>();
/** How many files' shapes are kept at once. */
const SHAPES_MAX = 80;

export const waveOf: Wave = (src, bars) => {
  const key = `${bars} ${src}`;
  let shape = shapes.get(key);
  if (!shape) {
    shape = read(src, bars);
    shapes.set(key, shape);
    const oldest = shapes.keys().next().value;
    if (shapes.size > SHAPES_MAX && oldest !== undefined) shapes.delete(oldest);
  }
  return shape;
};

async function read(src: string, bars: number): Promise<readonly number[] | null> {
  try {
    const bytes = await api.fileBytes(src);
    // Decoding needs a context, not a speaker: an offline one plays nothing.
    const sound = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
    const samples = sound.getChannelData(0);
    const step = Math.max(1, Math.floor(samples.length / bars));
    const peaks: number[] = [];
    for (let bar = 0; bar < bars; bar++) {
      let peak = 0;
      const end = Math.min(samples.length, (bar + 1) * step);
      for (let i = bar * step; i < end; i++) {
        const level = Math.abs(samples[i] ?? 0);
        if (level > peak) peak = level;
      }
      peaks.push(peak);
    }
    const loudest = Math.max(...peaks);
    return loudest > 0 ? peaks.map((peak) => peak / loudest) : null;
  } catch {
    return null;
  }
}
