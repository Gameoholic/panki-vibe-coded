import { useSyncExternalStore } from "react";

/**
 * How every player on the page plays: how loud, how fast, and whether a clip's subtitles show. One of each for the
 * whole page, so a clip turned down, slowed or without subtitles stays so for the next card. Kept on this device by the app (`keepPlayback`, called in `main.tsx`); held while
 * the page is open in the extension, whose players stand on a site whose storage isn't Panki's.
 */

/** How loud: a share of full (0 to 1), and whether it's muted. */
export type Volume = { level: number; muted: boolean };

/**
 * How fast, as a share of as it was said: slower to catch a fast sentence, or as said, which it starts at. Never
 * faster (the owner, 2026-10-16: "no reason to speed it up").
 */
export const SPEEDS = [0.5, 0.75, 1] as const;
export type Speed = (typeof SPEEDS)[number];
export const AS_SAID: Speed = 1;

const FULL: Volume = { level: 1, muted: false };

/** Whether what's set is kept on this device: the app's own pages only (`keepPlayback`). */
let kept = false;

/** One value every player on the page shares, under its own key on this device. */
function shared<T>(key: string, fallback: T, parse: (raw: unknown) => T, same: (a: T, b: T) => boolean) {
  let now = fallback;
  const listeners = new Set<() => void>();
  return {
    get: () => now,
    load() {
      try {
        now = parse(JSON.parse(localStorage.getItem(key) ?? "null"));
      } catch {
        now = fallback;
      }
    },
    /** The same as it is changes nothing. */
    set(next: T) {
      if (same(next, now)) return;
      now = next;
      if (kept) {
        try {
          localStorage.setItem(key, JSON.stringify(now));
        } catch {
          // Storage refused (a private window): it still holds while the page is open.
        }
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const clamp = (level: number) => (Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1);

const volume = shared<Volume>(
  "panki.volume",
  FULL,
  (raw) => {
    if (typeof raw !== "object" || raw === null) return FULL;
    const level = "level" in raw && typeof raw.level === "number" ? clamp(raw.level) : 1;
    const muted = "muted" in raw && raw.muted === true;
    return { level, muted };
  },
  (a, b) => a.level === b.level && a.muted === b.muted,
);

/** One of the speeds, or none: what's kept, or what the browser's own controls set, is taken only when it's one of them. */
export const speedOf = (rate: unknown): Speed | null => SPEEDS.find((speed) => speed === rate) ?? null;

const speed = shared<Speed>("panki.speed", AS_SAID, (raw) => speedOf(raw) ?? AS_SAID, (a, b) => a === b);

/** Whether a clip's subtitles show over it (the owner, 2026-10-29: "make subtitles on card clip be toggleable"); shown to begin with. */
const subtitles = shared<boolean>("panki.subtitles", true, (raw) => raw !== false, (a, b) => a === b);

/**
 * Keeps how loud and how fast on this device from now on, starting from what was kept. Called by the app at its start;
 * the extension's players stand on someone else's page, whose storage isn't Panki's, so there they last while the page
 * is open.
 */
export function keepPlayback() {
  kept = true;
  volume.load();
  speed.load();
  subtitles.load();
}

/** Sets how loud for every player on the page. */
export function setVolume(next: Volume) {
  volume.set({ level: clamp(next.level), muted: next.muted });
}

/** How loud, as it stands, drawn again whenever it changes. */
export function useVolume(): Volume {
  return useSyncExternalStore(volume.subscribe, volume.get);
}

/** Sets how fast for every player on the page. */
export function setSpeed(next: Speed) {
  speed.set(next);
}

/** How fast, as it stands, drawn again whenever it changes. */
export function useSpeed(): Speed {
  return useSyncExternalStore(speed.subscribe, speed.get);
}

/** Shows or hides every clip's subtitles on the page. */
export function setSubtitlesShown(next: boolean) {
  subtitles.set(next);
}

/** Whether clips' subtitles show, drawn again whenever it changes. */
export function useSubtitlesShown(): boolean {
  return useSyncExternalStore(subtitles.subscribe, subtitles.get);
}
