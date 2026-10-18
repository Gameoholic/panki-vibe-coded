import { useSyncExternalStore } from "react";

/** How loud the app's players play: a share of full (0 to 1), and whether they're muted. */
export type Volume = { level: number; muted: boolean };

const KEY = "panki.volume";
const FULL: Volume = { level: 1, muted: false };

/** One for every player on the page, so a clip turned down stays down for the next card. */
let now: Volume = FULL;
/** Whether it's kept on this device: the app's own pages only (`keepVolume`). */
let kept = false;
const listeners = new Set<() => void>();

const clamp = (level: number) => (Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1);

function read(): Volume {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return FULL;
    const level = "level" in raw && typeof raw.level === "number" ? clamp(raw.level) : 1;
    const muted = "muted" in raw && raw.muted === true;
    return { level, muted };
  } catch {
    return FULL;
  }
}

/**
 * Keeps the volume on this device from now on, starting from what was kept. Called by the app at its start; the
 * extension's players stand on someone else's page, whose storage isn't Panki's, so there it lasts while the page is open.
 */
export function keepVolume() {
  kept = true;
  now = read();
}

/** Sets it for every player on the page; the same as it is changes nothing. */
export function setVolume(next: Volume) {
  const level = clamp(next.level);
  if (level === now.level && next.muted === now.muted) return;
  now = { level, muted: next.muted };
  if (kept) {
    try {
      localStorage.setItem(KEY, JSON.stringify(now));
    } catch {
      // Storage refused (a private window): it still holds while the page is open.
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The volume as it stands, drawn again whenever it changes. */
export function useVolume(): Volume {
  return useSyncExternalStore(subscribe, () => now);
}
