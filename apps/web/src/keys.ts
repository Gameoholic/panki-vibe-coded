import { useSyncExternalStore } from "react";
import { ledger } from "./ledger";

/**
 * The review's keys, this device's own (the owner, 2026-10-21: "can you make it so I can customize keybinds"): the key
 * that shows the answer, one for each answer by its place in the row (the main answers, then those set apart), and one
 * for each sound and clip on the card in the layout's order, one that fills the screen with a clip, and one that takes
 * the last answer back (Undo, none to begin with: the owner, 2026-10-26). Each key is held for a time of its own before it does its
 * thing, none being a press (the owner: "hold for all buttons, each keybind separately"); an answer that asks for
 * confirmation is held for `confirmMs` more on top of its own, that longer hold being its yes ("the extra ones for
 * confirmation is additive"). Space held shows the answer; a tap turns it back. Kept in `localStorage`, as the theme
 * and a deck's order are: a keyboard is the device's, and the phone has none. One home: the review, its card and
 * Settings → Keybinds all read it here.
 */

/**
 * A key and how long it's held before it does its thing, in milliseconds (0, a press); no key, nothing does it from the
 * keyboard. The key is as `keyOf` writes it: the key itself, after Ctrl and Alt when they're held with it ("Ctrl+z").
 */
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
  /** Takes the review's last answer back, as its Undo button does (the owner, 2026-10-26: no key until one is set). */
  undo: Bind;
  /** Shows the card's previous or next example, as the arrows under its example do (2026-10-26, none to begin with, as Undo). */
  examplePrev: Bind;
  exampleNext: Bind;
  /** Starts the review from today's cards (the owner, 2026-10-27: its own key, not Show answer's; Space held 0.25 s to begin with). */
  start: Bind;
  /** The home's Review door (2026-10-27; Space held 0.5 s to begin with since 2026-10-28, none before). */
  homeReview: Bind;
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
  undo: { key: null, holdMs: 0 },
  examplePrev: { key: null, holdMs: 0 },
  exampleNext: { key: null, holdMs: 0 },
  start: { key: " ", holdMs: 250 },
  homeReview: { key: " ", holdMs: 500 },
  confirmMs: 1000,
};

/** Keys that are never bound: the modifiers, and the ones the page keeps for itself (Escape cancels, Tab moves on). */
const NEVER = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "CapsLock", "NumLock", "ScrollLock", "Escape", "Tab", "Dead", "Process", "Unidentified", "ContextMenu"]);
export const bindable = (key: string) => !NEVER.has(key);

/** One key the same as another, whatever its case: "a" and "A" are the one key. */
export const sameKey = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/**
 * The key a press is, as a bind keeps it: the key itself, after Ctrl and Alt when either is held with it ("Ctrl+z",
 * "Ctrl+Alt+z"). Shift isn't written: it only changes how the key reads ("A" for "a"), as it always has.
 */
export function keyOf(e: KeyboardEvent): string {
  const held = [e.ctrlKey ? "Ctrl" : null, e.altKey ? "Alt" : null].filter((name) => name !== null);
  return [...held, e.key.length === 1 ? e.key.toLowerCase() : e.key].join("+");
}

/** Whether a press is a bind's key: the same key with the same held with it. The Windows or Command key held, it's none. */
export const pressed = (e: KeyboardEvent, key: string | null) => !e.metaKey && sameKey(keyOf(e), key);

/** A sound's or a clip's key as its player takes it; none without a key. */
export const shortcutOf = (bind: Bind | undefined): Shortcut | null => (bind?.key ? { key: bind.key, holdMs: bind.holdMs } : null);

/**
 * Whether a key going down is a player's key (`Shortcut`) pressed anywhere on the page: not in something typed into,
 * with what's held with it as the key says, and not the key held down repeating.
 */
export function heard(e: KeyboardEvent, key: string): boolean {
  if (e.repeat || !pressed(e, key)) return false;
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
  const key = "key" in raw && (raw.key === null || (typeof raw.key === "string" && raw.key.length > 0 && raw.key.length <= 40 && bindable(raw.key))) ? raw.key : fallback.key;
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
    const undo = "undo" in raw ? bindOf(raw.undo, DEFAULT_KEYS.undo, undefined) : DEFAULT_KEYS.undo;
    const examplePrev = "examplePrev" in raw ? bindOf(raw.examplePrev, DEFAULT_KEYS.examplePrev, undefined) : DEFAULT_KEYS.examplePrev;
    const exampleNext = "exampleNext" in raw ? bindOf(raw.exampleNext, DEFAULT_KEYS.exampleNext, undefined) : DEFAULT_KEYS.exampleNext;
    const start = "start" in raw ? bindOf(raw.start, DEFAULT_KEYS.start, undefined) : DEFAULT_KEYS.start;
    const homeReview = "homeReview" in raw ? bindOf(raw.homeReview, DEFAULT_KEYS.homeReview, undefined) : DEFAULT_KEYS.homeReview;
    return { reveal, answers, media, fullScreen, undo, examplePrev, exampleNext, start, homeReview, confirmMs: holdOf(confirmMs) ?? DEFAULT_KEYS.confirmMs };
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
  ledger.record("keys", { data: { reveal: next.reveal, answers: next.answers, media: next.media, fullScreen: next.fullScreen, undo: next.undo, examplePrev: next.examplePrev, exampleNext: next.exampleNext, start: next.start, homeReview: next.homeReview, confirmMs: next.confirmMs } });
}

/** Where a key is bound: showing the answer, full screen's, Undo's, an example's either way, Start's, the home's Review door's, an answer's place, or a sound's or clip's place. */
export type Slot = { kind: "reveal" | "fullScreen" | "undo" | "examplePrev" | "exampleNext" | "start" | "homeReview" } | { kind: "answers" | "media"; index: number };

/** The screen a slot's key is heard on: a key is only ever one thing on one screen, and can be another elsewhere (Space starts the review, then shows the answer). */
const screenOf = (kind: Slot["kind"]): "home" | "today" | "review" => (kind === "homeReview" ? "home" : kind === "start" ? "today" : "review");

/**
 * The keys with one slot's key set: the key taken from wherever else it was on the same screen, so one key is never
 * two things there (what loses it is left with none until it's given another).
 */
export function withKey(binds: KeyBinds, slot: Slot, key: string | null): KeyBinds {
  const screen = screenOf(slot.kind);
  const clear =
    (kind: Slot["kind"]) =>
    (bind: Bind): Bind =>
      screenOf(kind) === screen && sameKey(bind.key, key) ? { ...bind, key: null } : bind;
  const next: KeyBinds = {
    ...binds,
    reveal: clear("reveal")(binds.reveal),
    answers: binds.answers.map(clear("answers")),
    media: binds.media.map(clear("media")),
    fullScreen: clear("fullScreen")(binds.fullScreen),
    undo: clear("undo")(binds.undo),
    examplePrev: clear("examplePrev")(binds.examplePrev),
    exampleNext: clear("exampleNext")(binds.exampleNext),
    start: clear("start")(binds.start),
    homeReview: clear("homeReview")(binds.homeReview),
  };
  return withBind(next, slot, (bind) => ({ ...bind, key }));
}
/** The keys with one slot's bind changed. */
export function withBind(binds: KeyBinds, slot: Slot, change: (bind: Bind) => Bind): KeyBinds {
  if (!("index" in slot)) return { ...binds, [slot.kind]: change(binds[slot.kind]) };
  const list = binds[slot.kind].map((bind, i) => (i === slot.index ? change(bind) : bind));
  return { ...binds, [slot.kind]: list };
}
