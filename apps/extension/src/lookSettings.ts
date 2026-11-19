/** @panki What opens the Word pop-up and the Card drawer on a word, its sites, the hover delay, the permissions it needs (`Binding`, `clickOf`, `LookWhere`, `HOVER_DELAY`, `lookAllowed`). */
import { z } from "zod";

/**
 * How pointing at a word behaves, as the options page sets it: what opens the Word pop-up and the Card drawer on a word,
 * and where on the web that works. The shapes are here, apart from `storage.ts`, because a page's script is told them
 * (by the worker) and must never carry the code that reads the extension's storage.
 */

/**
 * The key once held to open the Word pop-up, the only choice there was: Shift, Ctrl, Alt or On hover. Read only from a
 * browser that kept `lookKey` or `lookKeySubtitles`, as what opens the pop-up there (`storage.ts` → `lookBy`).
 */
export const LookKey = z.enum(["shift", "ctrl", "alt", "hover"]);
export type LookKey = z.infer<typeof LookKey>;

/**
 * What a gesture on a word does, for each of the two things it can open (the Word pop-up and the Card drawer), once
 * globally and once in Panki subtitles (`storage.ts` → `lookBy`, `drawerBy`): nothing; a click, alone or with one key
 * held; a key held while pointing at the word (`shift`, `ctrl`, `alt`: the word under the pointer as it's pressed, and
 * each word the pointer goes onto while it's held); or the pointer resting on the word for the Hover delay (`hover`).
 * The held keys and hover share their ids with `LookKey`, so a kept key carries over as it is.
 */
export const BINDINGS = ["none", "click", "shift-click", "ctrl-click", "alt-click", "shift", "ctrl", "alt", "hover"] as const;
export const Binding = z.enum(BINDINGS);
export type Binding = z.infer<typeof Binding>;
/** Each binding as the options page names it, in its order. */
export const BINDING_NAMES: Record<Binding, string> = {
  none: "None",
  click: "Click",
  "shift-click": "Shift+click",
  "ctrl-click": "Ctrl+click",
  "alt-click": "Alt+click",
  shift: "Hold Shift",
  ctrl: "Hold Ctrl",
  alt: "Hold Alt",
  hover: "Hover",
};
/** A binding that's a key held while pointing. */
export type HeldBinding = "shift" | "ctrl" | "alt";
export const isHeld = (binding: Binding): binding is HeldBinding => binding === "shift" || binding === "ctrl" || binding === "alt";
/** The key a held binding holds, as `KeyboardEvent.key` names it. */
export const HELD_KEY: Record<HeldBinding, string> = { shift: "Shift", ctrl: "Control", alt: "Alt" };
/** The key a held binding holds, as the options page and an explainer's keycap name it. */
export const keyWordOf = (key: HeldBinding) => ({ shift: "Shift", ctrl: "Ctrl", alt: "Alt" })[key];

type Mods = { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey?: boolean };
/** The click a press is, by the keys held with it: a click alone, or with one of Shift, Ctrl or Alt; null with more than one, or with the Mac's Command. */
export function clickOf(e: Mods): Binding | null {
  if (e.metaKey) return null;
  const held = [e.shiftKey && "shift-click", e.ctrlKey && "ctrl-click", e.altKey && "alt-click"].filter((one): one is Binding => one !== false);
  if (held.length > 1) return null;
  return held[0] ?? "click";
}

/**
 * How long the pointer rests on a word before Hover opens what it's bound to, ms (Hover delay, one for each place):
 * sweeping across words on the way to one opens nothing, so the word wanted can be reached across a transcript's lines
 * without every word passed over taking its place. The bounds and the step the field moves by, one home; 0 opens at
 * once.
 */
export const HOVER_DELAY = { default: 300, max: 2000, step: 50 } as const;
export const HoverDelay = z.number().int().min(0).max(HOVER_DELAY.max);

/** Where pointing at a word works: every site, only the ones listed, every site but those, or nowhere. */
export const LookWhere = z.enum(["everywhere", "only", "except", "nowhere"]);
export type LookWhere = z.infer<typeof LookWhere>;

/** A site as it was typed ("example.com", "https://www.example.com/page"), as the host it names; null when it names none. */
export function hostOf(typed: string): string | null {
  const raw = typed.trim().toLowerCase();
  if (raw === "") return null;
  let host: string;
  try {
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** The sites as the browser matches them: the host itself and everything under it, either way of reaching it. */
export function patternsOf(hosts: readonly string[]): string[] {
  return hosts.flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`]);
}

/** Every site there is, as the browser says it. */
export const EVERY_SITE = ["http://*/*", "https://*/*"];

/** What the browser must allow for the setting to work: nothing for nowhere, the listed sites for only those, every site otherwise. */
export function permissionsFor(where: LookWhere, hosts: readonly string[]): string[] {
  if (where === "nowhere") return [];
  return where === "only" ? patternsOf(hosts) : EVERY_SITE;
}

/** Whether a page at this address is one where pointing at a word works. */
export function lookAllowed(where: LookWhere, hosts: readonly string[], url: string | undefined): boolean {
  if (where === "nowhere" || !url) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  const listed = hosts.some((site) => host === site || host.endsWith(`.${site}`));
  return where === "everywhere" || (where === "only" ? listed : !listed);
}
