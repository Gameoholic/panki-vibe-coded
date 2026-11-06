import { BAR_CONTROLS, BAR_SIDES, BAR_SIDE_IDS, barReordered, isPankiBar, type BarControl, type BarLayout, type PankiBarControl } from "../modules";
import { makePlace, type Place } from "../ui/mount";
import { BAR_HELD } from "../ui/SpeedControl";

/**
 * The player's control bar laid out as the options page says (`modules.ts` → `BAR_CONTROLS`),
 * done the gentlest way each part allows, so the site's player keeps working whatever it does with its own controls:
 *
 * - **Hidden**: by a stylesheet of Panki's on the page, one rule per control hidden; no node of the site's is touched,
 *   and a player the site builds afresh is hidden the same way the moment it's there.
 * - **Ordered**: only once the viewer has put YouTube's own controls in another order than YouTube's (`barReordered`);
 *   then each is moved among its own siblings, never into another box, and put back as it stood when the order is
 *   YouTube's again or the bar is the site's. Never while an ad plays.
 * - **Panki's own** (the speed button, when the video will end): each a place of Panki's, put right after
 *   the control before it in the layout (the first of its side at the start of the side's box), and taken off when
 *   it's hidden, has nothing to show this moment, or the bar is the site's.
 *
 * Looked at with the rest of the page every second, so a control the site redraws comes back as it was laid out.
 */
const PLAYER = "#movie_player";
/** Where a YouTube control is looked for: its side's box in the player. */
const findOf = (id: BarControl): string | null => {
  const control = BAR_CONTROLS[id];
  return control.from === "youtube" ? `${PLAYER} ${BAR_SIDES[control.side].find} ${control.find}` : null;
};
/**
 * The bar kept on the video as it plays (`Modules.barKept`): the site marks its player `ytp-autohide` a few seconds after
 * the pointer rests and fades its bottom (the bar and the shade under it) by its opacity; this holds them shown. The
 * pointer still hides over the picture as the site does, which is the player's own and nothing of the bar's.
 */
const KEEP_SHOWN = `${PLAYER}.ytp-autohide :is(.ytp-chrome-bottom, .ytp-gradient-bottom) { opacity: 1 !important; }`;
/** The same, only while Panki's speed panel is open (`SpeedControl` → `BAR_HELD`), as the site holds its bar while its gear menu is. */
const HOLD_SHOWN = `${PLAYER}.${BAR_HELD}.ytp-autohide :is(.ytp-chrome-bottom, .ytp-gradient-bottom) { opacity: 1 !important; }`;
/** How a Panki control stands among the player's own: as tall as they are, its panel (the speed's) opening above it. */
const AMONG_CONTROLS = "display: inline-flex; align-items: center; height: 100%; vertical-align: top; position: relative;";

export type BarNow = {
  /** The bar laid out by Panki: off, it's the site's own. */
  on: boolean;
  layout: BarLayout;
  /** The bar kept on the video as it plays, rather than fading once the pointer rests. */
  kept: boolean;
  /** Whether a Panki control has anything to show this moment (a video, no ad). */
  shows: (id: PankiBarControl) => boolean;
  adPlaying: boolean;
  theme: "light" | "dark";
};

/** A place for one of Panki's controls among the player's own. */
function barPlace(): Place {
  const place = makePlace("dark");
  place.host.style.cssText = AMONG_CONTROLS;
  return place;
}

export function createPlayerBar() {
  /** Each of Panki's controls' place (the type holds it to one per control of `BAR_CONTROLS` that's Panki's). */
  const places: Record<PankiBarControl, Place> = { endTime: barPlace(), speed: barPlace() };
  let style: HTMLStyleElement | null = null;
  /** The site's own order of each box Panki has moved controls in, to put back. */
  const before = new Map<Element, Element[]>();

  /** The rules hiding the controls hidden, and keeping the bar shown, on the page while there are any. */
  function hide(ids: readonly BarControl[], kept: boolean, held: boolean) {
    const rules = ids.flatMap((id) => {
      const find = findOf(id);
      return find ? [`${find} { display: none !important; }`] : [];
    });
    if (kept) rules.push(KEEP_SHOWN);
    if (held) rules.push(HOLD_SHOWN);
    const text = rules.join("\n");
    if (!text) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.dataset.panki = "player-bar";
    }
    if (style.textContent !== text) style.textContent = text;
    if (!style.isConnected) document.head.append(style);
  }

  /** The YouTube controls found on the page, in the order given. */
  function found(ids: readonly BarControl[]): Element[] {
    return ids.flatMap((id) => {
      const find = findOf(id);
      const element = find ? document.querySelector(find) : null;
      return element ? [element] : [];
    });
  }

  /** Puts a box's controls in the order given, each into the place among its siblings the first of them held: only what's out of order moves. */
  function order(box: Element, wanted: readonly Element[]) {
    for (let i = 0; i < wanted.length; i++) {
      const now = [...box.children].filter((child) => wanted.includes(child));
      const want = wanted[i];
      const there = now[i];
      if (want && there && want !== there) box.insertBefore(want, there);
    }
  }

  /** YouTube's own controls in the order laid out, each among its own siblings; or back as the site had them. */
  function arrange(layout: BarLayout | null) {
    const wanted = layout ? found(layout.map((control) => control.id)) : [];
    const boxes = new Map<Element, Element[]>();
    for (const element of wanted) {
      const box = element.parentElement;
      if (box) boxes.set(box, [...(boxes.get(box) ?? []), element]);
    }
    for (const [box, kept] of before) {
      if (!box.isConnected) before.delete(box);
      else if (!boxes.has(box)) {
        order(box, kept.filter((element) => element.parentElement === box));
        before.delete(box);
      }
    }
    for (const [box, elements] of boxes) {
      if (elements.length < 2) continue;
      const now = [...box.children].filter((child) => elements.includes(child));
      if (now.every((element, i) => element === elements[i])) continue;
      if (!before.has(box)) before.set(box, now);
      order(box, elements);
    }
  }

  /**
   * The player's own time's type (its family, size, weight and colour), read off the page as it stands and handed to
   * Panki's controls as `--yt-bar-*`, so the speed's words and the end time read as the time does whatever the site
   * sets them to. Panki's places don't inherit the
   * site's type: their shadow roots start from Panki's own.
   */
  function typeOfTime() {
    const time = document.querySelector(findOf("time") ?? "");
    if (!time) return;
    const look = getComputedStyle(time);
    const vars: Record<string, string> = { "--yt-bar-family": look.fontFamily, "--yt-bar-size": look.fontSize, "--yt-bar-weight": look.fontWeight, "--yt-bar-ink": look.color };
    for (const place of Object.values(places)) {
      for (const [name, value] of Object.entries(vars)) if (value && place.host.style.getPropertyValue(name) !== value) place.host.style.setProperty(name, value);
    }
  }

  /** Panki's controls where the layout puts them, each side walked in order: after the control before it, or first in its box. */
  function mount(now: BarNow) {
    for (const side of BAR_SIDE_IDS) {
      let after: Element | null = null;
      for (const control of now.layout) {
        const id = control.id;
        if (BAR_CONTROLS[id].side !== side) continue;
        if (!isPankiBar(id)) {
          after = found([id])[0] ?? after;
          continue;
        }
        const host = places[id].host;
        host.dataset.theme = now.theme;
        const box = document.querySelector(`${PLAYER} ${BAR_SIDES[side].find}`);
        if (!now.on || !control.shown || !now.shows(id) || !box) {
          host.remove();
          continue;
        }
        if (after) {
          if (after.nextElementSibling !== host) after.after(host);
        } else if (host.parentElement !== box || box.firstElementChild !== host) box.prepend(host);
        after = host;
      }
    }
  }

  return {
    places,
    /** The bar as it should stand this moment. */
    apply(now: BarNow) {
      hide(now.on ? now.layout.filter((control) => !control.shown).map((control) => control.id) : [], now.on && now.kept, now.on);
      if (!now.adPlaying) arrange(now.on && barReordered(now.layout) ? now.layout : null);
      mount(now);
      typeOfTime();
    },
  };
}
