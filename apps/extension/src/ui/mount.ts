import { createRoot, type Root } from "react-dom/client";
import { SHADOW_CSS } from "./styles";

/** A place of Panki's own on someone else's page: `host` is put where it belongs by whoever made it, and `ground` is what's drawn into. */
export type Place = { host: HTMLElement; ground: HTMLElement };
/** A place with a screen of its own in it. */
export type Mounted = Place & { root: Root };

/** The device's own choice of light or dark, for a page that says nothing about its own. */
export function deviceTheme(): "light" | "dark" {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Makes a place: an element with a closed shadow root. Closed, so the page's own scripts can't read what's in it
 * (the words being added, the names of the decks); a shadow root, so the page's styles don't reach in and the app's
 * don't leak out. The styles go in as text in the root itself: no file of the extension's is ever asked for by a
 * page, so no page can tell the extension is there by asking for one. A screen that stands in two parts of a page (the
 * line under a player, the drawer beside it) is one screen with a second place it draws part of itself into.
 */
/** Every place of Panki's on this page: what's in them is never looked up as the page's own words. */
const places = new WeakSet<Element>();

/** Whether an event happened in one of Panki's places (it reaches the page with the place as its target). */
export function inPanki(event: Event): boolean {
  return event.composedPath().some((node) => node instanceof Element && places.has(node));
}

export function makePlace(theme: "light" | "dark"): Place {
  const host = document.createElement("div");
  places.add(host);
  host.dataset.theme = theme;
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = SHADOW_CSS;
  const ground = document.createElement("div");
  ground.className = "panki-root";
  shadow.append(style, ground);
  // What's typed and pressed in here stays in here. A page listens for keys of its own (a player's k, f and m), and
  // from outside a shadow root a key typed into a field doesn't look typed into a field: every letter would be a
  // shortcut. A press would reach the page too: inside a player, one click pauses it and two fill the screen.
  for (const type of ["keydown", "keyup", "keypress", "click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "contextmenu", "wheel"] as const) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }
  return { host, ground };
}

/** A place with its own screen: what `root` renders is drawn in it. */
export function mount(theme: "light" | "dark"): Mounted {
  const place = makePlace(theme);
  return { ...place, root: createRoot(place.ground) };
}
