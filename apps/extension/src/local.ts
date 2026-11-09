/** @panki This browser's own settings on a page, read and changed (`loadLocal`, `localNow`, `useLocal`, `onLocal`, `amendLocal`). Never a default drawn then replaced. */
import { useSyncExternalStore } from "react";
import { LocalChanged, askLocal, type Local } from "./messages";

/**
 * This browser's own settings as a page's script holds them (`messages.ts` → `Local`): asked of the worker once as the
 * page starts, and taken again whenever the worker says they changed (the options page, the panel's menu, another tab),
 * so every open page follows a setting at once, with no reload and no wait for the focus. Nothing here reads the
 * browser's storage: the worker does (`storage.ts` → `localOf`), so a page's script carries no storage code.
 *
 * A page draws nothing of Panki's before they're in: `loadLocal` is what it waits on, and `localNow` read any sooner
 * throws, so a draw that came too early is a fault that shows, never a draw in default settings redrawn a moment later.
 */

let now: Local | null = null;
type Follower = (next: Local, was: Local) => void;
const followers = new Set<Follower>();
const drawers = new Set<() => void>();

/** The settings as they stand; read before they're in, it throws (`loadLocal`). */
export function localNow(): Local {
  if (now === null) throw new Error("Panki: this browser's settings were read before they came.");
  return now;
}

function take(next: Local) {
  const was = now;
  // The same again (the usual answer to a change of something else) changes nothing.
  if (was !== null && JSON.stringify(was) === JSON.stringify(next)) return;
  now = next;
  if (was === null) return;
  for (const follower of followers) follower(next, was);
  for (const drawer of drawers) drawer();
}

let loading: Promise<Local> | null = null;
/**
 * The settings, asked of the worker once a page; the worker's word of each change is heard from then on. A failure (the
 * worker not answering, the extension reloaded under the page) is asked again a moment later: nothing of Panki's is on
 * the page until it's in.
 */
export function loadLocal(): Promise<Local> {
  if (loading) return loading;
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== chrome.runtime.id) return;
    const changed = LocalChanged.safeParse(message);
    if (changed.success) take(changed.data.local);
  });
  loading = (async () => {
    for (let wait = 200; ; wait = Math.min(wait * 2, 5000)) {
      const answer = await askLocal();
      if (answer.ok) {
        // A change heard while this was on its way is newer than this answer.
        if (now === null) now = answer.local;
        return now;
      }
      // The extension reloaded under this page: nothing will ever answer, and nothing of Panki's starts here.
      if (!chrome.runtime?.id) return new Promise<Local>(() => undefined);
      await new Promise((done) => setTimeout(done, wait));
    }
  })();
  return loading;
}

/**
 * A change the page made itself, on the page at once, before the worker has kept it and said so (Panki switched on or
 * off, the panel's view, a preference in the panel's menu); the worker's word then confirms it.
 */
export function amendLocal(change: (was: Local) => Local): void {
  take(change(localNow()));
}

/** Told of each change, with what the settings were; returns how to stop. */
export function onLocal(follower: Follower): () => void {
  followers.add(follower);
  return () => {
    followers.delete(follower);
  };
}

const subscribe = (drawer: () => void) => {
  drawers.add(drawer);
  return () => {
    drawers.delete(drawer);
  };
};

/** The settings, drawn again whenever they change. Only under a page that waited on `loadLocal`. */
export function useLocal(): Local {
  return useSyncExternalStore(subscribe, localNow);
}
