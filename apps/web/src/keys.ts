import { useSyncExternalStore } from "react";
import { ledger } from "./ledger";

/**
 * The review's keys, this device's own (the owner, 2026-10-21: "can you make it so I can customize keybinds"): the key
 * that shows the answer, one for each answer by its place in the row (the main answers, then those set apart), and one
 * for each sound and clip on the card in the layout's order, and one that fills the screen with a clip. Each key is held for a time of its own before it does its
 * thing, none being a press (the owner: "hold for all buttons, each keybind separately"); an answer that asks for
 * confirmation is held for `confirmMs` more on top of its own, that longer hold being its yes ("the extra ones for
 * confirmation is additive"). Space held shows the answer; a tap turns it back. Kept in `localStorage`, as the theme
 * and a deck's order are: a keyboard is the device's, and the phone has none. One home: the review, its card and
 * Settings → Keybinds all read it here.
 */

/** A key and how long it's held before it does its thing, in milliseconds (0, a press); no key, nothing does it from the keyboard. */
export type Bind = { key: string | null; holdMs: number };
/** A sound's or a clip's key, as the players are handed it (`usePlayback`): a key it has, and its hold. */
export type Shortcut = { key: string; holdMs: number };
/** How many answers and how many sounds and clips can each have a key. */
export const SLOTS = 9;
export type KeyBinds = {
  reveal: Bind;
  answers: readonly Bind[];
  media: readonly Bind[];
  /** Fills the screen with a card's clip, or leaves it (the owner, 2026-10-24: "keybind to toggle full screen for video player, f by default"). */
  fullScreen: Bind;
  /** How much longer an answer that asks for confirmation is held, on top of its own key's hold. */
  confirmMs: number;
};
/** How long a hold can be, and how much longer for confirmation; none at all is a press. */
export const HOLD_TIMES = [0, 250, 500, 1000, 1500, 2000] as const;

/**
 * Bound to begin with (the owner, 2026-10-21): Space, 1 to 6 for the answers, A and S for the first two sounds and
 * clips; everything else has no key until given one. Space and the answers held half a second, an answer that asks
 * for confirmation a second more (1.5 s in all, the owner's figure), a sound or a clip at a press. Full screen is F,
 * at a press (2026-10-24).
 */
const ANSWER_START = ["1", "2", "3", "4", "5", "6"];
const MEDIA_START = ["a", "s"];
const HOLD_START = 500;
export const DEFAULT_KEYS: KeyBinds = {
  reveal: { key: " ", holdMs: HOLD_START },
  answers: Array.from({ length: SLOTS }, (_, i) => ({ key: ANSWER_START[i] ?? null, holdMs: HOLD_START })),
  media: Array.from({ length: SLOTS }, (_, i) => ({ key: MEDIA_START[i] ?? null, holdMs: 0 })),
  fullScreen: { key: "f", holdMs: 0 },
  confirmMs: 1000,
};

/** Keys that are never bound: the modifiers, and the ones the page keeps for itself (Escape cancels, Tab moves on). */
const NEVER = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "CapsLock", "NumLock", "ScrollLock", "Escape", "Tab", "Dead", "Process", "Unidentified", "ContextMenu"]);
export const bindable = (key: string) => !NEVER.has(key);

/** One key the same as another, whatever its case: "a" and "A" are the one key. */
export const sameKey = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/** A sound's or a clip's key as its player takes it; none without a key. */
export const shortcutOf = (bind: Bind | undefined): Shortcut | null => (bind?.key ? { key: bind.key, holdMs: bind.holdMs } : null);

/**
 * Whether a key going down is a player's key (`Shortcut`) pressed anywhere on the page: not in something typed into,
 * with nothing held with it, and not the key held down repeating.
 */
export function heard(e: KeyboardEvent, key: string): boolean {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== key.toLowerCase()) return false;
  const at = e.target;
  return !(at instanceof HTMLElement && (at.isContentEditable || at.closest("input, textarea, select")));
}

const holdOf = (raw: unknown): number | undefined => HOLD_TIMES.find((t) => t === raw);

/**
 * A bind read from what was kept: a key that's a string and can be bound, and one of the hold times; anything else is
 * the fallback's. What was kept for a day as a held-or-not switch with one time for every key (`hold`, `holdMs` on the
 * whole) reads as that time, or a press.
 */
function bindOf(raw: unknown, fallback: Bind, oldHold: number | undefined): Bind {
  if (typeof raw !== "object" || raw === null) return fallback;
  const key = "key" in raw && (raw.key === null || (typeof raw.key === "string" && raw.key.length > 0 && raw.key.length <= 20 && bindable(raw.key))) ? raw.key : fallback.key;
  const own = "holdMs" in raw ? holdOf(raw.holdMs) : undefined;
  const old = "hold" in raw && typeof raw.hold === "boolean" ? (raw.hold ? (oldHold ?? HOLD_START) : 0) : undefined;
  return { key, holdMs: own ?? old ?? fallback.holdMs };
}
function bindsOf(raw: unknown, fallback: readonly Bind[], oldHold: number | undefined): Bind[] {
  return fallback.map((bind, i) => bindOf(Array.isArray(raw) ? raw[i] : undefined, bind, oldHold));
}

const KEY = "panki.keys";
function read(): KeyBinds {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return DEFAULT_KEYS;
    const oldHold = "holdMs" in raw ? holdOf(raw.holdMs) : undefined;
    const oldAsk = "askMs" in raw ? holdOf(raw.askMs) : undefined;
    const confirmMs = ("confirmMs" in raw ? holdOf(raw.confirmMs) : undefined) ?? (oldAsk !== undefined ? Math.max(0, oldAsk - (oldHold ?? HOLD_START)) : undefined);
    const reveal = bindOf("reveal" in raw ? raw.reveal : undefined, DEFAULT_KEYS.reveal, oldHold);
    const answers = bindsOf("answers" in raw ? raw.answers : undefined, DEFAULT_KEYS.answers, oldHold);
    const media = bindsOf("media" in raw ? raw.media : undefined, DEFAULT_KEYS.media, oldHold);
    // Kept before there was a full screen key: it starts on F, unless F already does something else here.
    const taken = [reveal, ...answers, ...media].some((bind) => sameKey(bind.key, DEFAULT_KEYS.fullScreen.key));
    const fullScreen = "fullScreen" in raw ? bindOf(raw.fullScreen, DEFAULT_KEYS.fullScreen, undefined) : taken ? { ...DEFAULT_KEYS.fullScreen, key: null } : DEFAULT_KEYS.fullScreen;
    return { reveal, answers, media, fullScreen, confirmMs: holdOf(confirmMs) ?? DEFAULT_KEYS.confirmMs };
  } catch {
    return DEFAULT_KEYS;
  }
}

let now: KeyBinds | null = null;
const listeners = new Set<() => void>();
const get = () => (now ??= read());
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The keys as they stand, drawn again whenever they change. */
export function useKeyBinds(): KeyBinds {
  return useSyncExternalStore(subscribe, get);
}

/** Keeps them for next time; every change is a `keys` row in the ledger. */
export function setKeyBinds(next: KeyBinds) {
  now = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage refused (a private window): they hold while the page is open and are the defaults next time.
  }
  for (const listener of listeners) listener();
  ledger.record("keys", { data: { reveal: next.reveal, answers: next.answers, media: next.media, fullScreen: next.fullScreen, confirmMs: next.confirmMs } });
}

/** Where a key is bound: the answer's, full screen's, an answer's place, or a sound's or clip's place. */
export type Slot = { kind: "reveal" } | { kind: "fullScreen" } | { kind: "answers" | "media"; index: number };

/**
 * The keys with one slot's key set: the key taken from wherever else it was, so one key is never two things (what
 * loses it is left with none until it's given another).
 */
export function withKey(binds: KeyBinds, slot: Slot, key: string | null): KeyBinds {
  const clear = (bind: Bind): Bind => (sameKey(bind.key, key) ? { ...bind, key: null } : bind);
  const next: KeyBinds = { ...binds, reveal: clear(binds.reveal), answers: binds.answers.map(clear), media: binds.media.map(clear), fullScreen: clear(binds.fullScreen) };
  return withBind(next, slot, (bind) => ({ ...bind, key }));
}
/** The keys with one slot's bind changed. */
export function withBind(binds: KeyBinds, slot: Slot, change: (bind: Bind) => Bind): KeyBinds {
  if (slot.kind === "reveal") return { ...binds, reveal: change(binds.reveal) };
  if (slot.kind === "fullScreen") return { ...binds, fullScreen: change(binds.fullScreen) };
  const list = binds[slot.kind].map((bind, i) => (i === slot.index ? change(bind) : bind));
  return { ...binds, [slot.kind]: list };
}
