import { z } from "zod";

/**
 * How looking a word up behaves, as the options page sets it: which key is held to point at a word, and where on the
 * web that works. The shapes are here, apart from `storage.ts`, because a page's script
 * is told them (by the worker) and must never carry the code that reads the extension's storage.
 */

/**
 * The key held while pointing at a word: Shift unless the owner picks another, or none at all, the word looked up as
 * the pointer goes onto it (`hover`; the owner, 2026-10-25: "add On hover to Key to hold"). One for everywhere, and
 * one of its own for Panki's subtitles under and over a video (`storage.ts` → `lookKey`, `lookKeySubtitles`).
 */
export const LookKey = z.enum(["shift", "ctrl", "alt", "hover"]);
export type LookKey = z.infer<typeof LookKey>;
/** The keys that can be held to look a word up, and what each is called: the options page's choices, and the keycap an explainer holds. */
export const LOOK_KEYS: readonly { id: LookKey; label: string }[] = [
  { id: "shift", label: "Shift" },
  { id: "ctrl", label: "Ctrl" },
  { id: "alt", label: "Alt" },
  { id: "hover", label: "On hover" },
];
export const keyWordOf = (key: LookKey) => LOOK_KEYS.find((k) => k.id === key)?.label ?? "Shift";

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
