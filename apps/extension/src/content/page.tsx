import "../setup";
import { useState } from "react";
import { SUBTITLES_AREA } from "@web/components/ClipSubtitles";
import { markKnownOnPage, refreshKnown, startKnown } from "../capture/known";
import { createListening, type Listening } from "../capture/listening";
import type { Pointed } from "../capture/look";
import { selectionRect, sentenceAround, takeSelection, type Taken } from "../capture/selection";
import { pageSource } from "../capture/source";
import type { Found } from "../dictionary/found";
import { Trigger } from "../messages";
import { deviceTheme, mount, type Mounted } from "../ui/mount";
import { Notice, Panel, type Chars } from "../ui/Panel";

/**
 * Panki on any page. It's put on a page two ways: by the browser, into the one tab that was acted on (the right-click
 * menu, the toolbar button), and then it reads what's selected, with the sentence around it, and opens the capture
 * drawer down the side of the window; or on every page the owner has allowed (the options page's "Look up words"),
 * where pointing at a word with the key held looks it up, and the popup's Add opens the same drawer on that word.
 */

declare global {
  interface Window {
    /** Set once this script is on the page, so being put in twice (two quick presses) doesn't make two of it. */
    __pankiOnPage?: true;
  }
}

const WIDTH = 420;
const EDGE = 12;

/**
 * Where the drawer goes: down the right side of the window, as tall as it needs and no taller than the window (it
 * scrolls inside itself). It moves to the left side when what was selected would be under it and the left has the room,
 * so the words being added stay in sight.
 */
function layoutBy(rect: DOMRect | null): string {
  const width = Math.min(WIDTH, window.innerWidth - EDGE * 2);
  const taken = width + EDGE * 2;
  const side = rect !== null && rect.right > window.innerWidth - taken && rect.left >= taken ? "left" : "right";
  return `position: fixed; z-index: 2147483647; top: ${EDGE}px; ${side}: ${EDGE}px; width: ${width}px; max-height: calc(100vh - ${EDGE * 2}px); overflow: auto;`;
}

/**
 * What Panki's places go in: what's filling the screen (a Panki review gone full screen), where nothing else shows, or
 * the page. A video filling the screen by itself holds nothing but its picture, so then it's the page.
 */
function filling(): Element {
  const full = document.fullscreenElement;
  return full && !(full instanceof HTMLMediaElement) ? full : document.documentElement;
}

/** The selection as the word picked in its sentence; a selection that is the whole sentence picks no word: it's the sentence that's wanted. */
function charsOf(taken: Taken): Chars | null {
  const whole = taken.from <= 0 && taken.to >= taken.sentence.length;
  return whole || taken.to <= taken.from ? null : { from: taken.from, to: taken.to };
}

function OnPage({ taken, prefer, arrives, onClose }: { taken: Taken | null; prefer: Found | null; arrives: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<Chars | null>(() => (taken ? charsOf(taken) : null));
  if (!taken) {
    return (
      <Notice arrives={arrives} onClose={onClose}>
        Select a word or a sentence on the page first.
      </Notice>
    );
  }
  return (
    <Panel
      capture={{ sentence: taken.sentence, moved: 0, ...pageSource(), facts: { taken: "selection" } }}
      picked={picked}
      onPick={setPicked}
      prefer={prefer}
      clip={null}
      wordClip={null}
      arrives={arrives}
      onClose={onClose}
      // The new card's word is one of the cards' now.
      onAdded={() => void refreshKnown()}
    />
  );
}

function start() {
  let mounted: Mounted | null = null;
  const close = () => {
    mounted?.root.unmount();
    mounted?.host.remove();
    mounted = null;
  };
  const open = (taken: Taken | null, rect: DOMRect | null, prefer: Found | null) => {
    // Asked for again with a drawer already open: the new one takes its place, and is simply there.
    const arrives = mounted === null;
    close();
    mounted = mount(deviceTheme());
    mounted.host.style.cssText = layoutBy(rect);
    filling().append(mounted.host);
    mounted.root.render(<OnPage taken={taken} prefer={prefer} arrives={arrives} onClose={close} />);
  };
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !Trigger.safeParse(message).success) return;
    // Read before anything of Panki's is on the page: opening the panel must not be what changes the selection.
    open(takeSelection(), selectionRect(), null);
    respond({ ok: true });
  });

  // Pointing at words, where the owner allows it. The popup's Add opens the drawer on the word, in its sentence.
  const listening: Listening = createListening({
    whereAt: () => ({ of: "page" }),
    // A card's clip in a Panki review: its subtitles are Panki subtitles, with their own key to hold.
    subtitlesAt: (target) => target instanceof Element && target.closest(SUBTITLES_AREA) !== null,
    parent: filling,
    onAdd(found: Found, pointed: Pointed) {
      const context = pointed.context;
      const taken = context ? sentenceAround(context.text, context.at, context.at + found.source.length) : { sentence: found.source, from: 0, to: found.source.length };
      open(taken, pointed.measure(found.source.length), found);
    },
  });
  listening.start();
  // Words already in the cards, marked on the page's own highlight layer while the pages switch is on.
  startKnown();
  markKnownOnPage();
}

if (!window.__pankiOnPage) {
  window.__pankiOnPage = true;
  start();
}
