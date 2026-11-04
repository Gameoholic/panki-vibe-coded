import { useMemo } from "react";
import { Setting } from "@web/components/Setting";
import { Toggle } from "@web/components/Toggle";
import { BAR_CONTROLS, BAR_FROM, BAR_SIDES, BAR_SIDE_IDS, barSide, type BarLayout } from "../modules";
import { barOf, writeStore, type Stored } from "../storage";
import { BarControls, YOUTUBE_OWN } from "./BarControls";
import { SceneTitle } from "./explainerScenes";
import { PartRows } from "./PartRows";

/**
 * The player's control bar, laid out (the owner, 2026-11-04: "make it ONE switch to be able to play with that bar and
 * override the YouTube one, and if it's enabled then I can play around with it and add/remove stuff like an editor, and
 * there'll be a preview like the rest of the settings"): one switch, Panki's layout or YouTube's own; under it the bar as
 * it will stand, in the player's dark look at its own size, then each side's controls as rows, YouTube's and Panki's
 * alike, moved by their grips within their side and each shown or hidden. Off, the preview is YouTube's own bar, it
 * and the rows greyed. Kept the moment it's changed; a YouTube page reads it again as it gets the focus.
 */
export function PlayerBarPanel({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const layout = barOf(store);
  const keep = (next: BarLayout) => void writeStore({ playerBarLayout: next }).then(onChanged);
  return (
    // A panel of its own on the YouTube tab, after YouTube utilities (the owner, 2026-11-04: "a section just for the
    // thing I asked you for"); a group of that panel's for its first few hours.
    <section className="panel" aria-labelledby="player-bar-title">
      <SceneTitle id="playerBar" titleId="player-bar-title" store={store} />
      <Setting
        id="player-bar"
        label="Custom player bar"
        control={<Toggle id="player-bar-on" says={{ on: "On", off: "Off" }} on={store.playerBar} onChange={(playerBar) => void writeStore({ playerBar }).then(onChanged)} />}
      />
      {/* The owner, 2026-11-04: "the option to make it never disappear, default off". */}
      <Setting
        id="player-bar-kept"
        label="Keep the bar visible always"
        control={
          <Toggle id="player-bar-kept-on" says={{ on: "On", off: "Off" }} on={store.playerBarKept} disabled={!store.playerBar} onChange={(playerBarKept) => void writeStore({ playerBarKept }).then(onChanged)} />
        }
      />
      <BarPreview layout={store.playerBar ? layout : YOUTUBE_OWN} off={!store.playerBar} />
      {BAR_SIDE_IDS.map((side) => (
        <div key={side} className="bar-side">
          <h4 className="bar-side-title">{BAR_SIDES[side].name}</h4>
          <PartRows
            idPrefix="player-bar"
            parts={barSide(layout, side)}
            nameOf={(id) => BAR_CONTROLS[id].name}
            iconOf={(id) => BAR_CONTROLS[id].icon}
            noteOf={(id) => BAR_FROM[BAR_CONTROLS[id].from]}
            disabled={!store.playerBar}
            // Each side is kept in its own order, the left's first: a control never leaves its side.
            onChange={(next) => keep(BAR_SIDE_IDS.flatMap((s) => (s === side ? next : barSide(layout, s))))}
          />
        </div>
      ))}
    </section>
  );
}

/** The bar as it will stand along a video's foot, as the site's player draws it (`BarControls`). */
function BarPreview({ layout, off }: { layout: BarLayout; off: boolean }) {
  const video = useMemo(() => document.createElement("video"), []);
  return (
    <div className={`bar-preview ${off ? "is-off" : ""}`.trim()} aria-label="How the player bar looks" inert={off}>
      <BarControls layout={layout} video={video} />
    </div>
  );
}
