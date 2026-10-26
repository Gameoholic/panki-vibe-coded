/**
 * The shapes screens really had, remembered on this device so a skeleton fits exactly what comes a moment later (the
 * owner, 2026-10-26: "make it EXACTLY fit the UI that we will get a second later"): how many rows a list drew, how tall
 * a tile stood. Written as the real thing renders, read as its skeleton is drawn; only a screen never seen on this
 * device falls back to a guess. Kept in `localStorage` (`panki.skel`), one small number per name; a value that doesn't
 * read as one is dropped.
 */

const KEY = "panki.skel";
/** The most a remembered shape can be: rows of a list, or a tile's height in px. */
const SHAPE_MAX = 2000;

function readAll(): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    const out: Record<string, number> = {};
    for (const [name, value] of Object.entries(raw)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= SHAPE_MAX) out[name] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Writes a shape down for next time; nothing when it hasn't changed. */
export function rememberShape(name: string, value: number): void {
  const settled = Math.round(Math.min(Math.max(value, 1), SHAPE_MAX));
  const all = readAll();
  if (all[name] === settled) return;
  all[name] = settled;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Nothing kept (a private window): the skeleton guesses next time, as it did the first.
  }
}

/** The shape as last really drawn, or the guess for a screen never seen here. */
export function shapeOf(name: string, fallback: number): number {
  return readAll()[name] ?? fallback;
}
