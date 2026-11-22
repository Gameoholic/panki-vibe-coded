import { inPanki } from "../ui/mount";

/**
 * A trace of the arrow keys on a YouTube page, said in the console, for a fault not yet found: after the arrows are
 * used and the player's bar fades, the arrows do nothing (the owner, 2026-11-22). Off unless switched on from the
 * page's console, kept in this browser until switched off:
 *
 *     localStorage.panki_key_trace = "1"      (then reload the page)
 *     delete localStorage.panki_key_trace     (off again)
 *
 * Each arrow going down is said with where the focus is and what the key went to, and a moment later whether the
 * site took it and the video moved; with it, each time the focus moves and each time the bar fades or comes back, so
 * the moment the arrows stop can be read against what changed just before. Taken out once the fault is found.
 */
const SWITCH = "panki_key_trace";
const PLAYER = "#movie_player";

function on(): boolean {
  try {
    return localStorage.getItem(SWITCH) === "1";
  } catch {
    return false;
  }
}

/** An element in a few words: its tag, id, first classes, and whether it's one of Panki's places. */
function named(node: EventTarget | Element | null | undefined): string {
  if (!(node instanceof Element)) return node === window ? "window" : node === document ? "document" : String(node);
  const id = node.id ? `#${node.id}` : "";
  const classes = [...node.classList].slice(0, 3).map((c) => `.${c}`).join("");
  const panki = node instanceof HTMLElement && node.dataset.panki ? `[panki=${node.dataset.panki}]` : "";
  return `${node.tagName.toLowerCase()}${id}${classes}${panki}`;
}

const stamp = () => new Date().toISOString().slice(11, 23);
const say = (words: string) => console.info(`[Panki] keys ${stamp()} ${words}`);

/** The trace, listened for from the start when it's switched on; nothing at all when it isn't. */
export function traceKeys(video: () => HTMLVideoElement | null) {
  if (!on()) return;
  say("trace on: arrows, focus, the bar fading");
  window.addEventListener(
    "keydown",
    (e) => {
      if (!e.key.startsWith("Arrow")) return;
      const held = [e.shiftKey && "Shift", e.ctrlKey && "Ctrl", e.altKey && "Alt", e.metaKey && "Meta"].filter(Boolean).join("+");
      const player = document.querySelector(PLAYER);
      const v = video();
      const before = v?.currentTime ?? null;
      const fullScreen = document.fullscreenElement ? named(document.fullscreenElement) : "no";
      say(
        `${held ? `${held}+` : ""}${e.key}${e.repeat ? " (held)" : ""} · target ${named(e.target)} · focus ${named(document.activeElement)} · in Panki ${inPanki(e)} · bar ${player?.classList.contains("ytp-autohide") ? "faded" : "shown"} · full screen ${fullScreen} · window focused ${document.hasFocus()}`,
      );
      setTimeout(() => {
        const after = v?.currentTime ?? null;
        const moved = before !== null && after !== null ? (after - before).toFixed(2) : "no video";
        say(`  → ${e.key}: taken by the page ${e.defaultPrevented} · video moved ${moved} s`);
      }, 50);
    },
    true,
  );
  document.addEventListener("focusin", (e) => say(`focus → ${named(e.target)} (from ${named(e.relatedTarget)})`), true);
  document.addEventListener("focusout", (e) => say(`focus left ${named(e.target)} (to ${named(e.relatedTarget)})`), true);
  window.addEventListener("blur", () => say("window lost focus"));
  window.addEventListener("focus", () => say("window got focus"));
  // The bar fading and coming back: the site's mark on its player, watched on whichever player is there.
  let watched: Element | null = null;
  let faded: boolean | null = null;
  const marks = new MutationObserver(() => {
    const now = watched?.classList.contains("ytp-autohide") ?? false;
    if (now !== faded) say(`bar ${now ? "faded" : "shown"} · focus ${named(document.activeElement)}`);
    faded = now;
  });
  setInterval(() => {
    const player = document.querySelector(PLAYER);
    if (player === watched) return;
    marks.disconnect();
    watched = player;
    if (player) marks.observe(player, { attributes: true, attributeFilter: ["class"] });
  }, 1000);
}
