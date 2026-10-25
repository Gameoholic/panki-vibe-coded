import { createRoot } from "react-dom/client";
import { dictionariesAre } from "../dictionary/useWords";
import type { Found } from "../dictionary/found";
import type { LookKey } from "../lookSettings";
import { askLookState } from "../messages";
import { popupLayoutOf, type PopupLayout } from "../popupLayout";
import { Lookup } from "../ui/Lookup";
import { makePlace } from "../ui/mount";
import { createLooker, listenOnPage, type Pointed, type View, type Where } from "./look";

type Options = {
  /** What a point on the page is: the site's captions, or ordinary text. */
  whereAt: (target: EventTarget | null) => Where;
  /** A word's Add was pressed in the popup. */
  onAdd: (found: Found, pointed: Pointed) => void;
  /** For a word on Panki's own line: how long the word taken there is, and taking another length instead. Null anywhere else. */
  splitFor?: (pointed: Pointed) => { length: number; onSplit: (length: number) => void } | null;
  /** The page's light or dark, for the popup. */
  theme?: () => "light" | "dark";
  /** What the popup's place goes in: the page, or what's filling the screen (a player gone full screen). */
  parent?: () => Element;
};

export type Listening = ReturnType<typeof createListening>;

/** The popup's place: over the whole window, letting every press through but the ones on the popup. */
const OVER_ALL = "position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: block;";

/**
 * Pointing at words on a page, whole: what the worker says is allowed here and how the popup is laid out (asked again
 * whenever the page gets the focus back, in case the options page changed it), the page's listening, and the popup in
 * a place of Panki's own.
 * The video page and any other page both start one; the video page also points at its own line's words through it.
 */
export function createListening(options: Options) {
  let settings: { on: boolean; key: LookKey; hover: boolean; layout: PopupLayout } = { on: false, key: "shift", hover: false, layout: popupLayoutOf(null, []) };
  const place = makePlace(options.theme?.() ?? "light");
  place.host.style.cssText = OVER_ALL;
  const root = createRoot(place.ground);

  const looker = createLooker((view) => draw(view));
  function draw(view: View | null) {
    if (view === null) {
      root.render(null);
      place.host.remove();
      return;
    }
    place.host.dataset.theme = options.theme?.() ?? "light";
    const parent = options.parent?.() ?? document.documentElement;
    if (place.host.parentElement !== parent) parent.append(place.host);
    const split = options.splitFor?.(view.pointed) ?? null;
    root.render(
      <Lookup
        key={view.pointed.id}
        view={view}
        layout={settings.layout}
        split={split}
        onKeep={looker.lock}
        onAdd={(found) => {
          looker.close();
          options.onAdd(found, view.pointed);
        }}
      />,
    );
  }

  const page = listenOnPage(looker, {
    key: () => settings.key,
    hover: () => settings.hover,
    on: () => settings.on,
    whereAt: options.whereAt,
    inPopup: (e) => e.composedPath().includes(place.host),
  });

  async function refresh() {
    const state = await askLookState();
    if (!state.ok) return;
    settings = { on: state.on, key: state.key, hover: state.hover, layout: state.layout };
    dictionariesAre(state.signature);
    if (!settings.on) looker.close();
  }

  return {
    looker,
    /** Whether pointing at words works here right now, with which key, and whether a video's subtitles take no key. */
    settings: () => settings,
    /** Panki's own line says where the pointer is when it's over one of its words, so the key pressed there looks it up. */
    pointedBy: page.pointedBy,
    start() {
      void refresh();
      window.addEventListener("focus", () => void refresh());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void refresh();
      });
    },
  };
}
