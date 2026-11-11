/** @panki How loud and how fast each player plays, its own for each field it plays, and whether clips' subtitles show (`usePlaying`, `setVolume`, `setSpeed`, `SPEEDS`, `useSubtitlesShown`). */
import { useCallback, useSyncExternalStore } from "react";

/**
 * How the players on the page play. How loud and how fast are each player's own, by the card type's field it plays
 * (its id, the same on every card of that type): the word's sound turned down stays down from card to card while the
 * sentence's stays loud, and every player of one field (a review's, the card form's, a row's chip) plays alike.
 * Whether a clip's subtitles show is one switch for the whole page. Kept on this device by the app (`keepPlayback`,
 * called in `main.tsx`); held while the page is open in the extension, whose players stand on a site whose storage
 * isn't Panki's.
 */

/** How loud: a share of full (0 to 1), and whether it's muted. */
export type Volume = { level: number; muted: boolean };

/**
 * How fast, as a share of as it was said: slower to catch a fast sentence, or as said, which it starts at. Never
 * faster: a card's sentence has no reason to be sped up.
 */
export const SPEEDS = [0.5, 0.75, 1] as const;
export type Speed = (typeof SPEEDS)[number];
export const AS_SAID: Speed = 1;

/** How one player plays. */
export type Playing = { volume: Volume; speed: Speed };

const FULL: Volume = { level: 1, muted: false };

/** Whether what's set is kept on this device: the app's own pages only (`keepPlayback`). */
let kept = false;

const clamp = (level: number) => (Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1);

function volumeOf(raw: unknown): Volume {
  if (typeof raw !== "object" || raw === null) return FULL;
  const level = "level" in raw && typeof raw.level === "number" ? clamp(raw.level) : 1;
  const muted = "muted" in raw && raw.muted === true;
  return { level, muted };
}

/** One of the speeds, or none: what's kept, or what the browser's own controls set, is taken only when it's one of them. */
export const speedOf = (rate: unknown): Speed | null => SPEEDS.find((speed) => speed === rate) ?? null;

/** Reads what's kept under a key, nothing when it's missing or doesn't read. */
function readKept(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

/** Keeps a value under a key; storage refused (a private window) leaves it holding while the page is open. */
function writeKept(key: string, value: unknown) {
  if (!kept) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Held in memory all the same.
  }
}

/** Every player's own, by the field it plays: `{ [fieldId]: { volume, speed } }`. */
const PLAYERS_KEY = "panki.players";
/**
 * The one volume and the one speed every player shared before each had its own. Read, never written: a player that
 * hasn't been set on this device starts from them, so nothing changed loudness when each got its own.
 */
const SHARED_VOLUME_KEY = "panki.volume";
const SHARED_SPEED_KEY = "panki.speed";

/** Where a player not yet set here starts. */
let start: Playing = { volume: FULL, speed: AS_SAID };
const players = new Map<string, Playing>();
const listeners = new Map<string, Set<() => void>>();

function playingOf(player: string): Playing {
  return players.get(player) ?? start;
}

function loadPlayers() {
  start = { volume: volumeOf(readKept(SHARED_VOLUME_KEY)), speed: speedOf(readKept(SHARED_SPEED_KEY)) ?? AS_SAID };
  players.clear();
  const raw = readKept(PLAYERS_KEY);
  if (typeof raw !== "object" || raw === null) return;
  for (const [player, value] of Object.entries(raw)) {
    if (typeof value !== "object" || value === null) continue;
    players.set(player, {
      volume: "volume" in value ? volumeOf(value.volume) : start.volume,
      speed: ("speed" in value ? speedOf(value.speed) : null) ?? start.speed,
    });
  }
}

/** Changes one player's own; the same as it is changes nothing. */
function change(player: string, next: Partial<Playing>) {
  const was = playingOf(player);
  const volume = next.volume ?? was.volume;
  const speed = next.speed ?? was.speed;
  if (volume.level === was.volume.level && volume.muted === was.volume.muted && speed === was.speed) return;
  players.set(player, { volume, speed });
  writeKept(PLAYERS_KEY, Object.fromEntries(players));
  for (const listener of listeners.get(player) ?? []) listener();
}

function subscribe(player: string, listener: () => void) {
  let heard = listeners.get(player);
  if (!heard) {
    heard = new Set();
    listeners.set(player, heard);
  }
  heard.add(listener);
  return () => {
    heard.delete(listener);
    if (heard.size === 0) listeners.delete(player);
  };
}

/** Sets how loud one player plays, and every other player of the same field. */
export function setVolume(player: string, next: Volume) {
  change(player, { volume: { level: clamp(next.level), muted: next.muted } });
}

/** Sets how fast one player plays, and every other player of the same field. */
export function setSpeed(player: string, next: Speed) {
  change(player, { speed: next });
}

/** How loud and how fast a player plays, as it stands, drawn again whenever it changes. */
export function usePlaying(player: string): Playing {
  const heard = useCallback((listener: () => void) => subscribe(player, listener), [player]);
  return useSyncExternalStore(heard, () => playingOf(player));
}

/** Whether a clip's subtitles show over it, switched from the player's bar; shown to begin with. One for the page. */
const SUBTITLES_KEY = "panki.subtitles";
let subtitles = true;
const subtitleListeners = new Set<() => void>();

/**
 * Keeps how each player plays on this device from now on, starting from what was kept. Called by the app at its
 * start; the extension's players stand on someone else's page, whose storage isn't Panki's, so there they last while
 * the page is open.
 */
export function keepPlayback() {
  kept = true;
  loadPlayers();
  subtitles = readKept(SUBTITLES_KEY) !== false;
}

/** Shows or hides every clip's subtitles on the page. */
export function setSubtitlesShown(next: boolean) {
  if (next === subtitles) return;
  subtitles = next;
  writeKept(SUBTITLES_KEY, next);
  for (const listener of subtitleListeners) listener();
}

function subscribeSubtitles(listener: () => void) {
  subtitleListeners.add(listener);
  return () => {
    subtitleListeners.delete(listener);
  };
}

/** Whether clips' subtitles show, drawn again whenever it changes. */
export function useSubtitlesShown(): boolean {
  return useSyncExternalStore(subscribeSubtitles, () => subtitles);
}
