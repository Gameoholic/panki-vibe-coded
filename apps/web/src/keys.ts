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
 * exactly 2"), each with a press or a hold of its own, so Space tapped can play the clip while Space held shows the
 * back of the card (Space tapped was the first sound or clip's to begin with from 2026-10-28 until the owner,
 * 2026-11-01: "remove it, I can just add it manually"). Kept in
 * `localStorage`, as the theme and a deck's order are: a keyboard is the device's, and the phone has none. One home:
 * the review, its card and Settings → Keybinds all read it here.
 */

/**
 * A key and how it's pressed before it does its thing (`holdMs`, one of `PRESS_KINDS`): 0 a press, `DOUBLE_PRESS` a
 * double press, else how long it's held, in milliseconds; no key, nothing does it from the keyboard. The key is as
 * `keyOf` writes it: the key itself, after Ctrl and Alt when they're held with it ("Ctrl+z").
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
  /** Shows the card's back (Show back of card; Show answer until the owner, 2026-11-01). */
  reveal: Bind;
  /**
   * Shows a card's front out of its Listen phase, as Done listening does (the owner, 2026-11-01: a key of its own, the same as
   * Show back of card's to begin with). It, Show back of card and Hide back of card are each on a different face of the
   * card, so they may share a key and a hold.
   */
  showCard: Bind;
  /**
   * Turns the card back to its front once it's shown, Hide back of card (Hide answer until 2026-11-01; the owner,
   * 2026-10-29: Show answer's own key used to do it at a tap, until Space tapped became the clip's and it did nothing;
   * "make it its own keybind", Space held 0.25 s to begin with). It and Show back of card never stand together, one on
   * each side of the card, so they may share a key and a hold.
   */
  hide: Bind;
  answers: readonly Bind[];
  media: readonly Bind[];
  /** Plays each sound or clip again from its start, in the same order as `media` (the owner, 2026-10-29; the first held 1 for 0.5 s to begin with, the rest none). */
  restart: readonly Bind[];
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
  /** How much longer an answer that requires confirmation is held, on top of its own key's hold. */
  confirmMs: number;
  /**
   * The Hold button's keys (the owner, 2026-11-02, A of https://claude.ai/artifact/4pgpAtQJRkEAfV1iWmm9NA): held, it
   * carries the card through every stage. Its hold is `holdChain`'s, never its own: each key here is only which key.
   */
  holdButton: Bind;
  /** Back to start while the Hold button is on: the card on its start again, nothing answered (Space pressed twice to begin with, the owner, 2026-11-02). */
  holdReset: Bind;
  /** The Hold button on or off on this device, and how long each of its stages is held (`HoldChain`). */
  holdChain: HoldChain;
};
/**
 * The Hold button's own: on or off (off to begin with), and each stage's own hold, counted from where the stage before
 * it landed, or from the press when it's the first that applies (the owner, 2026-11-02): `listenMs` Done listening's,
 * a stage only a card that listens first has (its time unused otherwise); `backMs` Show back of card's; `answerMs` Pick
 * the answer's, the answer the deck's Hold button answers with (`DeckSettings.holdAnswer`), an answer that requires
 * confirmation `confirmMs` more. A hold let go stays at the stage it reached; a new one goes on with the next stage's
 * own time.
 */
export type HoldChain = { on: boolean; listenMs: number; backMs: number; answerMs: number };
/** How long a hold can be, and how much longer for confirmation; none at all is a press. */
export const HOLD_TIMES = [0, 250, 500, 1000, 1500, 2000] as const;
/** A key pressed twice in quick succession (`useHold.ts` → `DOUBLE_MS`) as a kind of press of its own, kept where a hold's time is (the owner, 2026-11-02). */
export const DOUBLE_PRESS = -1;
/** Every way a key can be pressed, the one registry: a press, a double press, or held for one of `HOLD_TIMES`. */
export const PRESS_KINDS: readonly number[] = [0, DOUBLE_PRESS, ...HOLD_TIMES.slice(1)];
/** What kind of press a key is: a press, a double press, or a hold. */
export const pressKind = (key: Key): "press" | "double" | "hold" => (key.holdMs === DOUBLE_PRESS ? "double" : key.holdMs > 0 ? "hold" : "press");

/**
 * Bound to begin with (the owner, 2026-10-21): Space, 1 to 6 for the answers, A and S for the first two sounds and
 * clips; everything else has no key until given one. Space and the answers held half a second, an answer that asks
 * for confirmation a second more (1.5 s in all, the owner's figure), a sound or a clip at a press. Full screen is F,
 * at a press (2026-10-24). The first sound or clip is played again from its start with 1 held half a second (2026-10-29: "only the first one has the default"). A card's examples are
 * ← and →, at a press (2026-10-31).
 */
const ANSWER_START = ["1", "2", "3", "4", "5", "6"];
const MEDIA_START = ["a", "s"];
const HOLD_START = 500;
const one = (key: string | null, holdMs: number): Bind => ({ key, holdMs, also: [] });
const RESTART_START: Key = { key: "1", holdMs: HOLD_START };
export const DEFAULT_KEYS: KeyBinds = {
  reveal: one(" ", HOLD_START),
  showCard: one(" ", HOLD_START),
  hide: one(" ", 250),
  answers: Array.from({ length: SLOTS }, (_, i) => one(ANSWER_START[i] ?? null, HOLD_START)),
  media: Array.from({ length: SLOTS }, (_, i) => one(MEDIA_START[i] ?? null, 0)),
  restart: Array.from({ length: SLOTS }, (_, i) => (i === 0 ? one(RESTART_START.key, RESTART_START.holdMs) : one(null, 0))),
  fullScreen: one("f", 0),
  undo: one(null, 0),
  // ← and → step through a card's examples, at a press (the owner, 2026-10-31; none before).
  examplePrev: one("ArrowLeft", 0),
  exampleNext: one("ArrowRight", 0),
  start: one(" ", 250),
  homeReview: one(" ", 500),
  confirmMs: 1000,
  // Shift held, so it never meets Space (the owner, 2026-11-02; Space until then). Its hold's time is its stages'
  // (`holdChain`); what's kept on the key is only its shape, a hold.
  holdButton: one("Shift", HOLD_START),
  holdReset: one(" ", DOUBLE_PRESS),
  holdChain: { on: false, listenMs: 500, backMs: 1000, answerMs: 2000 },
};

/**
 * Keys that are never bound: the Windows or Command key and the locks, and the ones the page keeps for itself (Escape
 * cancels, Tab moves on). Shift, Ctrl and Alt are keys by themselves too (the owner, 2026-11-02: the Hold button on
 * Shift), as `MODIFIERS` names them.
 */
const NEVER = new Set(["AltGraph", "Meta", "OS", "CapsLock", "NumLock", "ScrollLock", "Escape", "Tab", "Dead", "Process", "Unidentified", "ContextMenu"]);
export const bindable = (key: string) => !NEVER.has(key);
/**
 * Shift, Ctrl and Alt as keys by themselves: the browser's name for each (`KeyboardEvent.key`) and the one a bind keeps.
 * One is its own press only when nothing else was pressed while it was down (Ctrl+Z is Z's): a tap acts as it's let go,
 * a hold lets go the moment another key goes down (`useHold.ts`).
 */
const MODIFIERS: Readonly<Record<string, string>> = { Shift: "Shift", Control: "Ctrl", Alt: "Alt" };
/** Whether a key, as the browser names it or as a bind keeps it, is Shift, Ctrl or Alt by itself. */
export const isModifier = (key: string) => key in MODIFIERS || Object.values(MODIFIERS).includes(key);

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
 * "Ctrl+Alt+z"). Shift isn't written: it only changes how the key reads ("A" for "a"), as it always has. Shift, Ctrl
 * or Alt pressed is itself, alone ("Shift", "Ctrl", "Alt"), whatever else is held.
 */
export function keyOf(e: KeyboardEvent): string {
  const modifier = MODIFIERS[e.key];
  if (modifier) return modifier;
  const held = [e.ctrlKey ? "Ctrl" : null, e.altKey ? "Alt" : null].filter((name) => name !== null);
  return [...held, e.key.length === 1 ? e.key.toLowerCase() : e.key].join("+");
}

/** Whether a press is a bind's key: the same key with the same held with it. The Windows or Command key held, it's none. */
export const pressed = (e: KeyboardEvent, key: string | null) => !e.metaKey && sameKey(keyOf(e), key);
/** Which of an action's keys a press is, or null: `pressed` for either. */
export const pressedIn = (e: KeyboardEvent, bind: Bind): Key | null => (e.metaKey ? null : keyIn(bind, keyOf(e)));

/** Every review key but the home's and today's Start, and the Hold button's two: what's on the review's own screen (`screenOf`). */
function reviewBinds(binds: KeyBinds): Bind[] {
  return [binds.reveal, binds.showCard, binds.hide, ...binds.answers, ...binds.media, ...binds.restart, binds.fullScreen, binds.undo, binds.examplePrev, binds.exampleNext];
}
/**
 * The keys held on the review, each with how long: every review key that's a hold, and the Hold button's while it's on,
 * held as long as its quickest stage (its keys keep no hold of their own: `holdChain` holds them).
 */
function heldOnReview(binds: KeyBinds): Key[] {
  const chain = binds.holdChain;
  const quickest = Math.min(...[chain.listenMs, chain.backMs, chain.answerMs].filter((ms) => ms > 0), HOLD_START);
  const holdButton = chain.on ? keysOf(binds.holdButton).map((key) => ({ ...key, holdMs: quickest })) : [];
  return [...reviewBinds(binds).flatMap(keysOf).filter((key) => pressKind(key) === "hold"), ...holdButton];
}
/** How long something else on the review takes a key held: a press of it then acts only when let go sooner (`Heard.tapUnder`). */
function tapUnderOf(binds: KeyBinds | undefined, key: Key): number {
  if (!binds || pressKind(key) !== "press") return 0;
  const held = heldOnReview(binds).filter((other) => sameKey(other.key, key.key));
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

/** A sound's or a clip's keys that play it again from its start, as its player hears them; none without a key. */
export function restartOf(bind: Bind | undefined, binds?: KeyBinds): readonly Heard[] {
  if (!bind) return [];
  return keysOf(bind)
    .map((key) => heardOf(key, binds))
    .filter((heard): heard is Heard => heard !== null);
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
 * A key read from what was kept: a key that's a string and can be bound, and one of the kinds of press; anything else
 * is the fallback's. What was kept for a day as a held-or-not switch with one time for every key (`hold`, `holdMs` on
 * the whole) reads as that time, or a press.
 */
function keyRead(raw: unknown, fallback: Key, oldHold: number | undefined): Key {
  if (typeof raw !== "object" || raw === null) return fallback;
  const key = "key" in raw && (raw.key === null || (typeof raw.key === "string" && raw.key.length > 0 && raw.key.length <= 40 && bindable(raw.key))) ? raw.key : fallback.key;
  const own = "holdMs" in raw ? PRESS_KINDS.find((kind) => kind === raw.holdMs) : undefined;
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
/**
 * The Hold button's own as kept: each value that reads, the rest the default's. Kept on its first day as a first hold
 * and the back after listening (`firstMs`, `thenMs`), those read as Done listening's and Show back of card's.
 */
function holdChainOf(raw: unknown): HoldChain {
  const fallback = DEFAULT_KEYS.holdChain;
  if (typeof raw !== "object" || raw === null) return fallback;
  const kept = raw as Record<string, unknown>;
  const time = (name: string, was: string, own: number) => holdOf(kept[name]) ?? holdOf(kept[was]) ?? own;
  return {
    on: typeof kept.on === "boolean" ? kept.on : fallback.on,
    listenMs: time("listenMs", "firstMs", fallback.listenMs),
    backMs: time("backMs", "thenMs", fallback.backMs),
    answerMs: time("answerMs", "answerMs", fallback.answerMs),
  };
}

const KEY = "panki.keys";
/**
 * What's written beside the keys as `kept`: kept since the examples had ← and → to begin with. Kept without it, an
 * example's key left with none was never chosen, so it takes its arrow; kept with it, none is the owner's own.
 */
const ARROWS_KEPT = 1;
/** `kept` from when the Hold button was moved to Shift (2026-11-02): kept before it, a Hold button still on Space, its old default, takes Shift. */
const SHIFT_KEPT = 2;
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
    // Each key given to a device that kept its keys from before it existed is given only where nothing on its screen
    // already has that key in the same shape (`clash`: a press, a hold and a double press of one key are three things).
    const takenBy = (keys: readonly Bind[], wanted: Key) => keys.flatMap(keysOf).some((key) => clash(key, wanted));
    // Kept before there was a full screen key: it starts on F, unless F already does something else here.
    const taken = takenBy([reveal, ...answers, ...media], DEFAULT_KEYS.fullScreen);
    const fullScreen = "fullScreen" in raw ? bindOf(raw.fullScreen, DEFAULT_KEYS.fullScreen, undefined) : taken ? { ...DEFAULT_KEYS.fullScreen, key: null } : DEFAULT_KEYS.fullScreen;
    // Kept before there were restart keys: the first gets 1 held, unless 1 held already does something else here.
    const restartTaken = takenBy([reveal, ...answers, ...media, fullScreen], RESTART_START);
    const restart =
      "restart" in raw
        ? bindsOf(raw.restart, DEFAULT_KEYS.restart, undefined)
        : restartTaken
          ? DEFAULT_KEYS.restart.map(() => one(null, 0))
          : DEFAULT_KEYS.restart;
    // Kept before there was a key of its own to hide the answer: Space held, unless a hold of Space already does something
    // else on the review here (Show answer's doesn't count: they're never on the card's same side).
    const hideTaken = takenBy([...answers, ...media, ...restart, fullScreen], DEFAULT_KEYS.hide);
    const hide = "hide" in raw ? bindOf(raw.hide, DEFAULT_KEYS.hide, undefined) : hideTaken ? one(null, 0) : DEFAULT_KEYS.hide;
    // Kept before Done listening had a key of its own: Show back of card's, which was its until then.
    const showCard = "showCard" in raw ? bindOf(raw.showCard, DEFAULT_KEYS.showCard, undefined) : reveal;
    const undo = "undo" in raw ? bindOf(raw.undo, DEFAULT_KEYS.undo, undefined) : DEFAULT_KEYS.undo;
    // Kept before the examples had keys to begin with (`ARROWS_KEPT`): one left with none gets its arrow, unless that
    // arrow already does something else on the review here.
    const arrowed = "kept" in raw && typeof raw.kept === "number" && raw.kept >= ARROWS_KEPT;
    const rest = [reveal, hide, ...answers, ...media, ...restart, fullScreen, undo];
    const exampleOf = (name: "examplePrev" | "exampleNext"): Bind => {
      const fallback = DEFAULT_KEYS[name];
      const kept = name in raw ? bindOf((raw as Record<string, unknown>)[name], fallback, undefined) : fallback;
      if (arrowed || kept.key !== null || kept.also.length > 0) return kept;
      return takenBy(rest, fallback) ? kept : fallback;
    };
    const examplePrev = exampleOf("examplePrev");
    const exampleNext = exampleOf("exampleNext");
    const start = "start" in raw ? bindOf(raw.start, DEFAULT_KEYS.start, undefined) : DEFAULT_KEYS.start;
    const homeReview = "homeReview" in raw ? bindOf(raw.homeReview, DEFAULT_KEYS.homeReview, undefined) : DEFAULT_KEYS.homeReview;
    // The Hold button's keys are holds (kept as presses on its first day, when its hold wasn't kept on the key). Kept
    // before it moved to Shift and still on its old Space alone, it takes Shift, unless Shift is held for something else
    // on the review here.
    const keptHold = asHolds("holdButton" in raw ? bindOf(raw.holdButton, DEFAULT_KEYS.holdButton, undefined) : DEFAULT_KEYS.holdButton);
    const shifted = "kept" in raw && typeof raw.kept === "number" && raw.kept >= SHIFT_KEPT;
    const onOldSpace = keptHold.key === " " && keptHold.also.length === 0;
    const holdButton = shifted || !onOldSpace || takenBy([showCard, ...rest, examplePrev, exampleNext], DEFAULT_KEYS.holdButton) ? keptHold : DEFAULT_KEYS.holdButton;
    const holdReset = "holdReset" in raw ? bindOf(raw.holdReset, DEFAULT_KEYS.holdReset, undefined) : DEFAULT_KEYS.holdReset;
    const holdChain = holdChainOf("holdChain" in raw ? raw.holdChain : undefined);
    return { reveal, showCard, hide, answers, media, restart, fullScreen, undo, examplePrev, exampleNext, start, homeReview, confirmMs: holdOf(confirmMs) ?? DEFAULT_KEYS.confirmMs, holdButton, holdReset, holdChain };
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

/**
 * The keys as they're heard, drawn again whenever they change: as they're set while keybinds are Enabled on this device,
 * and every one without its key while they're off (`unbound`), so nothing anywhere hears a key or draws a keycap. The
 * one gate: every screen that hears a key reads them here. Settings → Keybinds alone reads them as set (`useKeyBindsSet`).
 */
export function useKeyBinds(): KeyBinds {
  return useSyncExternalStore(subscribeAll, heardNow);
}
/** The keys as they're set, whether or not keybinds are Enabled: what Settings → Keybinds shows and changes. */
export function useKeyBindsSet(): KeyBinds {
  return useSyncExternalStore(subscribe, get);
}

const isBind = (value: unknown): value is Bind => typeof value === "object" && value !== null && "key" in value && "also" in value;
const keyless = (bind: Bind): Bind => ({ ...bind, key: null, also: [] });
/**
 * The keys with every action left without a key, whatever kind of thing holds it (one bind, or a row of them), so an
 * action added later is covered without being named here. The Hold button stays as it's set: held by a finger or a mouse
 * it still works, with no key.
 */
function unbound(binds: KeyBinds): KeyBinds {
  const each = Object.entries(binds).map(([name, value]: [string, unknown]) => [name, Array.isArray(value) ? value.map((bind) => (isBind(bind) ? keyless(bind) : bind)) : isBind(value) ? keyless(value) : value]);
  return Object.fromEntries(each) as KeyBinds;
}
/** The unbound keys, worked out once for each set of keys, so the store hands back the same object until they change. */
let unboundOf: { from: KeyBinds; to: KeyBinds } | null = null;
function heardNow(): KeyBinds {
  const set = get();
  if (enabledNow()) return set;
  if (unboundOf?.from !== set) unboundOf = { from: set, to: unbound(set) };
  return unboundOf.to;
}

/** Keeps them for next time; every change is a `keys` row in the ledger. */
export function setKeyBinds(next: KeyBinds) {
  now = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, kept: SHIFT_KEPT }));
  } catch {
    // Storage refused (a private window): they hold while the page is open and are the defaults next time.
  }
  for (const listener of listeners) listener();
  ledger.record("keys", { data: { reveal: next.reveal, showCard: next.showCard, hide: next.hide, answers: next.answers, media: next.media, restart: next.restart, fullScreen: next.fullScreen, undo: next.undo, examplePrev: next.examplePrev, exampleNext: next.exampleNext, start: next.start, homeReview: next.homeReview, confirmMs: next.confirmMs, holdButton: next.holdButton, holdReset: next.holdReset, holdChain: next.holdChain } });
}

/** Where a key is bound: showing the back, showing the card out of its Listen phase, hiding the back, full screen's, Undo's, an example's either way, Start's, the home's Review door's, the Hold button's and its Back to start's, an answer's place, or a sound's or clip's place (playing it, or playing it again from its start). */
export type Slot = { kind: "reveal" | "showCard" | "hide" | "fullScreen" | "undo" | "examplePrev" | "exampleNext" | "start" | "homeReview" | "holdButton" | "holdReset" } | { kind: "answers" | "media" | "restart"; index: number };
const NAMED = ["reveal", "showCard", "hide", "fullScreen", "undo", "examplePrev", "exampleNext", "start", "homeReview", "holdButton", "holdReset"] as const;
/** The Hold button's two, heard only while it's on. */
const HOLD_KINDS: readonly Slot["kind"][] = ["holdButton", "holdReset"];
/**
 * Done listening, Show back of card and Hide back of card are each heard on a face of its own (Listen, front, back): none
 * takes another's key. The Hold button and its Back to start are heard beside them, on every face, so they share keys
 * with them only by the shape rule (`clash`), as every other action does (the owner, 2026-11-02).
 */
const FACE_KEYS: readonly Slot["kind"][] = ["showCard", "reveal", "hide"];
const apart = (a: Slot, b: Slot) => a.kind !== b.kind && FACE_KEYS.includes(a.kind) && FACE_KEYS.includes(b.kind);

/** The screen a slot's key is heard on: a key is only ever one thing on one screen, and can be another elsewhere (Space starts the review, then shows the answer). */
const screenOf = (kind: Slot["kind"]): "home" | "today" | "review" => (kind === "homeReview" ? "home" : kind === "start" ? "today" : "review");

function slotsOf(binds: KeyBinds): Slot[] {
  return [...NAMED.map((kind) => ({ kind })), ...binds.answers.map((_, index) => ({ kind: "answers" as const, index })), ...binds.media.map((_, index) => ({ kind: "media" as const, index })), ...binds.restart.map((_, index) => ({ kind: "restart" as const, index }))];
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
 * Two keys the same on one screen get in each other's way when they're the same kind of press (`pressKind`): a press, a
 * double press and a hold of one key are three things (the owner, 2026-10-28: Space tapped plays the clip, Space held
 * shows the answer; 2026-11-02, a double press). Let go before the hold is done, it was the press; a press of a key
 * whose double press does something waits to see whether it's the double (`useHold.ts` → `keepDouble`).
 */
const clash = (a: Key, b: Key) => sameKey(a.key, b.key) && pressKind(a) === pressKind(b);
/**
 * A bind whose every key is a hold: the Hold button's, held through its stages (`holdChain` keeps the times), so by
 * `clash` it shares its key with a press of it (a clip's Space tapped) and a double press (Back to start), as Show back
 * of card's hold always did (the owner, 2026-11-02: kept as a press on its first day, it lost its Space to a clip's).
 */
function asHolds(bind: Bind): Bind {
  const hold = (key: Key): Key => (pressKind(key) === "hold" ? key : { ...key, holdMs: HOLD_START });
  return { ...hold(bind), also: bind.also.map(hold) };
}

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
    if (screenOf(other.kind) !== screen || apart(other, slot)) continue;
    // Switched off, the Hold button is heard nowhere: its keys are kept for when it's on again, and take nothing.
    if (HOLD_KINDS.includes(other.kind) && !binds.holdChain.on) continue;
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
/**
 * The keys with the Hold button switched on or off. On, its keys take theirs from whatever else on the review has them
 * the same way (another hold of Space, a double press of it), as setting them would; off, nothing else changes.
 */
export function withHoldChain(binds: KeyBinds, on: boolean): KeyBinds {
  let next: KeyBinds = { ...binds, holdChain: { ...binds.holdChain, on } };
  if (!on) return next;
  for (const kind of ["holdButton", "holdReset"] as const) {
    for (const part of partsOf(next[kind])) next = withPart(next, { kind }, part, (key) => key);
  }
  return next;
}
/**
 * Every key whose double press does something on the review just now (the Hold button's Back to start, kept only while
 * it's on, and any other action set to a double press): a press of one of them waits to see whether it's the double.
 */
export function doubleKeys(binds: KeyBinds): string[] {
  const held = binds.holdChain.on ? [binds.holdButton, binds.holdReset] : [];
  return [...reviewBinds(binds), ...held, binds.start]
    .flatMap(keysOf)
    .flatMap((key) => (pressKind(key) === "double" && key.key !== null ? [key.key] : []));
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

/**
 * Whether keybinds are Enabled on this device, the whole feature (the owner, 2026-11-02: "make it enable/disable keybinds
 * entirely, the entire feature. Call it Enabled."): off, no key is heard anywhere and no keycap is drawn, everything
 * still pressed by touch and click. Until it's set, the device's own: off on a phone, a screen with no hover as
 * `app.css` judges a touch screen (`@media (hover: none)`), on everywhere else. This device's own, beside its keys.
 */
const ENABLED_KEY = "panki.keybinds.enabled";
/**
 * Where the switch was kept before it was the whole feature's, carried over once: Keycaps On / Off (`panki.keycaps`,
 * the morning of 2026-11-02), and before it the phone's Keys on buttons (`panki.keycapsOnPhone`, "true" shown on a phone,
 * "false" being the phone's default).
 */
const KEYCAPS_KEY = "panki.keycaps";
const OLD_KEYCAPS_KEY = "panki.keycapsOnPhone";
const PHONE_QUERY = "(hover: none)";
function readEnabled(): boolean | null {
  try {
    const kept = localStorage.getItem(ENABLED_KEY);
    if (kept !== null) return kept === "true";
    const keycaps = localStorage.getItem(KEYCAPS_KEY);
    const phone = localStorage.getItem(OLD_KEYCAPS_KEY);
    localStorage.removeItem(KEYCAPS_KEY);
    localStorage.removeItem(OLD_KEYCAPS_KEY);
    const carried = keycaps !== null ? keycaps === "true" : phone === "true" ? true : null;
    if (carried !== null) localStorage.setItem(ENABLED_KEY, String(carried));
    return carried;
  } catch {
    return null;
  }
}
/** What's kept: on, off, or null for the device's own; undefined until it's read. */
let enabled: boolean | null | undefined;
const getEnabled = () => (enabled === undefined ? (enabled = readEnabled()) : enabled);
/** Keybinds Enabled or not on this device, set in Settings → Keybinds; a `keys` row in the ledger each change. */
export function setKeybindsEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(ENABLED_KEY, String(on));
  } catch {
    // Storage refused (a private window): it holds while the page is open.
  }
  for (const listener of listeners) listener();
  ledger.record("keys", { data: { enabled: on } });
}
function subscribePhone(listener: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function subscribeAll(listener: () => void) {
  const keys = subscribe(listener);
  const phone = subscribePhone(listener);
  return () => {
    keys();
    phone();
  };
}
const onPhone = () => window.matchMedia(PHONE_QUERY).matches;
const enabledNow = () => getEnabled() ?? !onPhone();
/** Whether keybinds are Enabled on this device now: as it's set, else off on a phone and on elsewhere (`KeyCap`, `MediaKey`, the review's Enter, the setting's own switch). */
export function useKeybindsEnabled(): boolean {
  return useSyncExternalStore(subscribeAll, enabledNow);
}
