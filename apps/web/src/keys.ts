import { useSyncExternalStore } from "react";
import { ledger } from "./ledger";

/**
 * The review's keys, this device's own (the owner, 2026-10-21: "can you make it so I can customize keybinds"): the key
 * that shows the answer, one for each answer by its place in the row (the main answers, then those set apart), and one
 * for each sound and clip on the card in the layout's order, one that fills the screen with a clip, and one that takes
 * the last answer back (Undo, none to begin with: the owner, 2026-10-26). Each key is held for a time of its own before it does its
 * thing, none being a press (the owner: "hold for all buttons, each keybind separately"); an answer that asks for
 * confirmation is held for `confirmMs` more on top of its own, that longer hold being its yes ("the extra ones for
 * confirmation is additive"). Every action takes as many more keys as are added to it (`also`, the owner, 2026-10-28:
 * "add functionality to add multiple keybinds to an action"; one second key until 2026-10-29: "it's weird it has
 * exactly 2"), each with a press or a hold of its own: Space tapped is the first sound or clip's to begin with, so it
 * plays, pauses and replays the clip, while Space held shows the answer. Kept in
 * `localStorage`, as the theme and a deck's order are: a keyboard is the device's, and the phone has none. One home:
 * the review, its card and Settings → Keybinds all read it here.
 */

/**
 * A key and how long it's held before it does its thing, in milliseconds (0, a press); no key, nothing does it from the
 * keyboard. The key is as `keyOf` writes it: the key itself, after Ctrl and Alt when they're held with it ("Ctrl+z").
 */
export type Key = { key: string | null; holdMs: number };
/** An action's keys: its own, and any more added to it (`also`), each pressed or held for a time of its own. */
export type Bind = Key & { also: readonly Key[] };
/** Which of an action's keys: its own, or one of those added, by its place among them. */
export type Part = "main" | number;
const NO_KEY: Key = { key: null, holdMs: 0 };
/** How many keys can be added to an action besides its own: more is never needed, and it keeps what's kept small. */
export const ALSO_MAX = 8;
/**
 * A key as a listener hears it (a player's, the full screen's): a press, or a hold that long. `tapUnder`, for a press
 * whose key something else on the screen takes held (Space tapped plays the clip, Space held shows the answer): it acts
 * as the key is let go, only when let go sooner than that.
 */
export type Heard = { key: string; holdMs: number; tapUnder: number };
/** A sound's or a clip's keys, as the players are handed them (`usePlayback`): its key, and those added to it. */
export type Shortcut = Heard & { also: readonly Heard[] };
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
 * at a press (2026-10-24). The first sound or clip has Space, tapped, added to it (2026-10-28).
 */
const ANSWER_START = ["1", "2", "3", "4", "5", "6"];
const MEDIA_START = ["a", "s"];
const HOLD_START = 500;
const one = (key: string | null, holdMs: number): Bind => ({ key, holdMs, also: [] });
const MEDIA_ALSO_START: Key = { key: " ", holdMs: 0 };
export const DEFAULT_KEYS: KeyBinds = {
  reveal: one(" ", HOLD_START),
  answers: Array.from({ length: SLOTS }, (_, i) => one(ANSWER_START[i] ?? null, HOLD_START)),
  media: Array.from({ length: SLOTS }, (_, i) => ({ ...one(MEDIA_START[i] ?? null, 0), also: i === 0 ? [MEDIA_ALSO_START] : [] })),
  fullScreen: one("f", 0),
  undo: one(null, 0),
  examplePrev: one(null, 0),
  exampleNext: one(null, 0),
  start: one(" ", 250),
  homeReview: one(" ", 500),
  confirmMs: 1000,
};

/** Keys that are never bound: the modifiers, and the ones the page keeps for itself (Escape cancels, Tab moves on). */
const NEVER = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "CapsLock", "NumLock", "ScrollLock", "Escape", "Tab", "Dead", "Process", "Unidentified", "ContextMenu"]);
export const bindable = (key: string) => !NEVER.has(key);

/** One key the same as another, whatever its case: "a" and "A" are the one key. */
export const sameKey = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/** Every one of an action's keys, its own first. */
export const keysOf = (bind: Bind): readonly Key[] => [bind, ...bind.also];

/** Which of an action's keys a key is (its own first), with its hold; null for none. */
export function keyIn(bind: Bind | undefined, key: string): Key | null {
  if (!bind) return null;
  return keysOf(bind).find((own) => sameKey(own.key, key)) ?? null;
}

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
/** Which of an action's keys a press is, or null: `pressed` for either. */
export const pressedIn = (e: KeyboardEvent, bind: Bind): Key | null => (e.metaKey ? null : keyIn(bind, keyOf(e)));

/** Every review key but the home's and today's Start: what's on the review's own screen (`screenOf`). */
function reviewBinds(binds: KeyBinds): Bind[] {
  return [binds.reveal, ...binds.answers, ...binds.media, binds.fullScreen, binds.undo, binds.examplePrev, binds.exampleNext];
}
/** How long something else on the review takes a key held: a press of it then acts only when let go sooner (`Heard.tapUnder`). */
function tapUnderOf(binds: KeyBinds | undefined, key: Key): number {
  if (!binds || key.holdMs > 0) return 0;
  const held = reviewBinds(binds).flatMap(keysOf).filter((other) => other.holdMs > 0 && sameKey(other.key, key.key));
  return Math.max(0, ...held.map((other) => other.holdMs));
}
const heardOf = (key: Key, binds: KeyBinds | undefined): Heard | null => (key.key ? { key: key.key, holdMs: key.holdMs, tapUnder: tapUnderOf(binds, key) } : null);

/** A sound's or a clip's keys as its player takes them (`binds`, for whether a press of one is something else's held); none without a key. */
export function shortcutOf(bind: Bind | undefined, binds?: KeyBinds): Shortcut | null {
  if (!bind) return null;
  const [first, ...rest] = keysOf(bind)
    .map((key) => heardOf(key, binds))
    .filter((heard): heard is Heard => heard !== null);
  return first ? { ...first, also: rest } : null;
}

/** Whether a press of a key is a tap of it, something else on the review taking it held (Show answer's Space): a press elsewhere, held elsewhere. */
export function tapped(binds: KeyBinds, key: string): boolean {
  return reviewBinds(binds).some((bind) => {
    const hit = keyIn(bind, key);
    return hit !== null && hit.holdMs === 0;
  });
}

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
 * A key read from what was kept: a key that's a string and can be bound, and one of the hold times; anything else is
 * the fallback's. What was kept for a day as a held-or-not switch with one time for every key (`hold`, `holdMs` on the
 * whole) reads as that time, or a press.
 */
function keyRead(raw: unknown, fallback: Key, oldHold: number | undefined): Key {
  if (typeof raw !== "object" || raw === null) return fallback;
  const key = "key" in raw && (raw.key === null || (typeof raw.key === "string" && raw.key.length > 0 && raw.key.length <= 40 && bindable(raw.key))) ? raw.key : fallback.key;
  const own = "holdMs" in raw ? holdOf(raw.holdMs) : undefined;
  const old = "hold" in raw && typeof raw.hold === "boolean" ? (raw.hold ? (oldHold ?? HOLD_START) : 0) : undefined;
  return { key, holdMs: own ?? old ?? fallback.holdMs };
}
/**
 * A bind read from what was kept: its key, and those added to it, each with a key (one added but never given one is
 * let go); a single second key, as one was kept until 2026-10-29, reads as the one added, and none at all, as from
 * before there were second keys, as none.
 */
function bindOf(raw: unknown, fallback: Bind, oldHold: number | undefined): Bind {
  const main = keyRead(raw, fallback, oldHold);
  const kept: unknown = typeof raw === "object" && raw !== null && "also" in raw ? raw.also : [];
  const also = (Array.isArray(kept) ? kept : [kept])
    .slice(0, ALSO_MAX)
    .map((one) => keyRead(one, NO_KEY, undefined))
    .filter((key) => key.key !== null);
  return { ...main, also };
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
    const kept = bindsOf("media" in raw ? raw.media : undefined, DEFAULT_KEYS.media, oldHold);
    // Kept before there was a full screen key: it starts on F, unless F already does something else here.
    const taken = [reveal, ...answers, ...kept].some((bind) => sameKey(bind.key, DEFAULT_KEYS.fullScreen.key));
    const fullScreen = "fullScreen" in raw ? bindOf(raw.fullScreen, DEFAULT_KEYS.fullScreen, undefined) : taken ? { ...DEFAULT_KEYS.fullScreen, key: null } : DEFAULT_KEYS.fullScreen;
    // Kept before there were second keys: the first sound or clip gets Space tapped, unless a press of Space already does something here.
    const tapTaken = [reveal, ...answers, ...kept, fullScreen].some((bind) => sameKey(bind.key, MEDIA_ALSO_START.key) && bind.holdMs === 0);
    const media = kept.map((bind, i) => (i === 0 && !hasAlso(raw, "media") && !tapTaken ? { ...bind, also: [MEDIA_ALSO_START] } : bind));
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
/** Whether what was kept of the first of a list already had a second key: kept since there were. */
function hasAlso(raw: object, name: "media"): boolean {
  const list: unknown = name in raw ? (raw as Record<string, unknown>)[name] : undefined;
  const first: unknown = Array.isArray(list) ? list[0] : undefined;
  return typeof first === "object" && first !== null && "also" in first;
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
const NAMED = ["reveal", "fullScreen", "undo", "examplePrev", "exampleNext", "start", "homeReview"] as const;

/** The screen a slot's key is heard on: a key is only ever one thing on one screen, and can be another elsewhere (Space starts the review, then shows the answer). */
const screenOf = (kind: Slot["kind"]): "home" | "today" | "review" => (kind === "homeReview" ? "home" : kind === "start" ? "today" : "review");

function slotsOf(binds: KeyBinds): Slot[] {
  return [...NAMED.map((kind) => ({ kind })), ...binds.answers.map((_, index) => ({ kind: "answers" as const, index })), ...binds.media.map((_, index) => ({ kind: "media" as const, index }))];
}
const sameSlot = (a: Slot, b: Slot) => a.kind === b.kind && ("index" in a ? "index" in b && a.index === b.index : true);
/** A slot's bind as it stands. */
export function bindAt(binds: KeyBinds, slot: Slot): Bind {
  return "index" in slot ? (binds[slot.kind][slot.index] ?? one(null, 0)) : binds[slot.kind];
}
function setAt(binds: KeyBinds, slot: Slot, bind: Bind): KeyBinds {
  if (!("index" in slot)) return { ...binds, [slot.kind]: bind };
  return { ...binds, [slot.kind]: binds[slot.kind].map((b, i) => (i === slot.index ? bind : b)) };
}
const partOf = (bind: Bind, part: Part): Key => (part === "main" ? bind : (bind.also[part] ?? NO_KEY));
const withPartOf = (bind: Bind, part: Part, key: Key): Bind =>
  part === "main" ? { ...bind, key: key.key, holdMs: key.holdMs } : { ...bind, also: bind.also.map((own, i) => (i === part ? key : own)) };
/** Every one of a bind's parts: its own key, and each added. */
const partsOf = (bind: Bind): Part[] => ["main", ...bind.also.map((_, i) => i)];

/**
 * Two keys the same on one screen get in each other's way unless one is a press and the other a hold (the owner,
 * 2026-10-28: Space tapped plays the clip, Space held shows the answer): let go before the hold is done, it was the
 * press.
 */
const clash = (a: Key, b: Key) => sameKey(a.key, b.key) && (a.holdMs === 0) === (b.holdMs === 0);

/**
 * The keys with one of a slot's keys changed, that key taken from whatever else on the same screen it would clash with
 * there (`clash`), the slot's other keys too: an action's own key that loses it is left with none until it's given
 * another, and an added one is let go.
 */
export function withPart(binds: KeyBinds, slot: Slot, part: Part, change: (key: Key) => Key): KeyBinds {
  const mine = change(partOf(bindAt(binds, slot), part));
  const screen = screenOf(slot.kind);
  let next = binds;
  for (const other of slotsOf(binds)) {
    if (screenOf(other.kind) !== screen) continue;
    const bind = bindAt(next, other);
    let changed = bind;
    for (const p of partsOf(bind)) {
      if (sameSlot(other, slot) && p === part) continue;
      const key = partOf(bind, p);
      if (clash(key, mine)) changed = withPartOf(changed, p, { ...key, key: null });
    }
    if (changed !== bind) next = setAt(next, other, sameSlot(other, slot) ? changed : tidy(changed));
  }
  const ours = withPartOf(bindAt(next, slot), part, mine);
  // The slot's own added keys that lost theirs go too, but the one being set, which may be waiting for its key.
  return setAt(next, slot, { ...ours, also: ours.also.filter((key, i) => i === part || key.key !== null) });
}
/** A bind without the added keys that have none. */
const tidy = (bind: Bind): Bind => ({ ...bind, also: bind.also.filter((key) => key.key !== null) });

/** The keys with one of a slot's keys set (`withPart`). */
export function withKey(binds: KeyBinds, slot: Slot, key: string | null, part: Part = "main"): KeyBinds {
  return withPart(binds, slot, part, (k) => ({ ...k, key }));
}
/** The keys with one more key added to a slot, none yet (it's given one by pressing it), held as the slot's own is. */
export function withAdded(binds: KeyBinds, slot: Slot): KeyBinds {
  const bind = bindAt(binds, slot);
  if (bind.also.length >= ALSO_MAX) return binds;
  return setAt(binds, slot, { ...bind, also: [...bind.also, { key: null, holdMs: bind.holdMs }] });
}
/** The keys with one added key taken off a slot. */
export function withoutAdded(binds: KeyBinds, slot: Slot, index: number): KeyBinds {
  const bind = bindAt(binds, slot);
  return setAt(binds, slot, { ...bind, also: bind.also.filter((_, i) => i !== index) });
}
