/** @panki Pointing at a word on a page to open its pop-up (`createListening`). Never a second listener for words on a page. */
import { createRoot } from "react-dom/client";
import { dictionariesAre } from "../dictionary/useWords";
import type { Found } from "../dictionary/found";
import { localNow, onLocal } from "../local";
import { askLookState, askLookup } from "../messages";
import { popupLayoutOf, type PopupLayout } from "../popupLayout";
import type { MorePieces } from "../ui/Explain";
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
  /** Whether a point on the page is on Panki subtitles drawn by the page itself (a card's clip in Panki), where what opens the pop-up is theirs. */
  subtitlesAt?: (target: EventTarget | null) => boolean;
  /** What the page adds to what Explain sends of a word pointed at (a video's metadata, the subtitles around it, its description); none anywhere else. */
  aiContext?: MorePieces;
  /** Told whenever the popup opens, moves to another word or closes (null): the video page's While the Word pop-up is open. */
  onView?: (view: View | null) => void;
};

export type Listening = ReturnType<typeof createListening>;

/** The popup's place: over the whole window, letting every press through but the ones on the popup. */
const OVER_ALL = "position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: block;";

/**
 * Pointing at words on a page, whole: the keys to hold, this browser's own (`local.ts`), what the worker says is
 * allowed here and how the popup is laid out (asked again whenever those settings change, and when the page gets the
 * focus back: the dictionaries live in the browser's database, which tells no page of a change), the page's listening,
 * and the popup in a place of Panki's own.
 * The video page and any other page both start one, once this browser's settings are in; the video page also points at
 * its own line's words through it.
 */
export function createListening(options: Options) {
  /** What the worker says of this page: nothing works here until it has. */
  let here: { on: boolean; subtitlesOn: boolean; layout: PopupLayout } = { on: false, subtitlesOn: false, layout: popupLayoutOf(null, []) };
  /** What opens the pop-up and the drawer and their Hover delays, globally and in Panki's subtitles, as this browser has them. */
  const keys = () => localNow().look;
  const place = makePlace(options.theme?.() ?? "light");
  place.host.style.cssText = OVER_ALL;
  const root = createRoot(place.ground);

  const looker = createLooker(
    (view) => draw(view),
    undefined,
    () => place.ground.querySelector(".look")?.getBoundingClientRect() ?? null,
  );
  function draw(view: View | null) {
    options.onView?.(view);
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
        layout={here.layout}
        split={split}
        explain={{ kind: "panki", more: options.aiContext ?? null }}
        onKeep={looker.lock}
        onClose={looker.close}
        onAdd={(found) => {
          looker.close();
          options.onAdd(found, view.pointed);
        }}
      />,
    );
  }

  /**
   * The Card drawer opened on a word of the page, as the popup's Add opens it: the word looked up first, so the drawer
   * has its dictionary form; a word that isn't found opens nothing.
   */
  function openDrawer(pointed: Pointed) {
    void askLookup(pointed.text).then((answer) => {
      const first = answer.ok ? answer.found[0] : undefined;
      if (first) options.onAdd(first, pointed);
    });
  }

  /** The page's listening, from `start` on: what opens what is this browser's settings, which aren't known before. */
  let page: ReturnType<typeof listenOnPage> | null = null;

  async function refresh() {
    const state = await askLookState();
    if (!state.ok) return;
    here = { on: state.on, subtitlesOn: state.subtitlesOn, layout: state.layout };
    dictionariesAre(state.signature);
    if (!here.on && !here.subtitlesOn) looker.close();
  }

  return {
    looker,
    /** Whether pointing at words works here right now and what opens what, and the same in Panki's subtitles. */
    settings: () => ({ ...here, ...keys() }),
    /** Panki's own line says where the pointer is when it's over one of its words, so the key pressed there opens what it's bound to. */
    pointedBy: (...args: Parameters<ReturnType<typeof listenOnPage>["pointedBy"]>) => page?.pointedBy(...args),
    /** Panki's own line drawn again under a still pointer says what's under it now, for a key pressed, never pointing at it. */
    standsOn: (...args: Parameters<ReturnType<typeof listenOnPage>["standsOn"]>) => page?.standsOn(...args),
    /** Started once this browser's settings are in (`loadLocal`). */
    start() {
      page = listenOnPage(looker, {
        popup: (target) => (options.subtitlesAt?.(target) ? keys().subtitlePopup : keys().popup),
        // A card's clip in a review: In Panki subtitles' drawer is the video page's line's alone, so a press there stays the review's.
        drawer: (target) => (options.subtitlesAt?.(target) ? "none" : keys().drawer),
        openDrawer,
        delay: (target) => (options.subtitlesAt?.(target) ? keys().subtitleDelay : keys().delay),
        on: (target) => (options.subtitlesAt?.(target) ? here.subtitlesOn : here.on),
        whereAt: options.whereAt,
        inPopup: (e) => e.composedPath().includes(place.host),
      });
      void refresh();
      onLocal(() => void refresh());
      window.addEventListener("focus", () => void refresh());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void refresh();
      });
    },
  };
}
