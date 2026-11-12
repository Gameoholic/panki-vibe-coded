import { useMemo } from "react";
import { KeyField } from "@web/components/KeyField";
import { Setting } from "@web/components/Setting";
import { Toggle } from "@web/components/Toggle";
import { BAR_CONTROLS, BAR_FROM, BAR_SIDES, BAR_SIDE_IDS, barSide, type BarLayout } from "../modules";
import { barOf, writeStore, type Stored } from "../storage";
import { BarControls, YOUTUBE_OWN } from "./BarControls";
import { SceneTitle } from "./explainerScenes";
import { PartRows } from "./PartRows";

/**
 * The player's control bar, laid out, with a preview like the rest of the settings: one switch, Panki's layout or YouTube's own; under it the bar as
 * it will stand, in the player's dark look at its own size, then each side's controls as rows, YouTube's and Panki's
 * alike, moved by their grips within their side and each shown or hidden. Off, the preview is YouTube's own bar, it
 * and the rows greyed. Kept the moment it's changed; a YouTube page reads it again as it gets the focus.
 */
export function PlayerBarPanel({ store, onChanged }: { store: Stored; onChanged: () => void }) {
  const layout = barOf(store);
  const keep = (next: BarLayout) => void writeStore({ playerBarLayout: next }).then(onChanged);
  return (
    // A panel of its own on the YouTube tab, after YouTube utilities.
    <section className="panel" aria-labelledby="player-bar-title">
      <SceneTitle id="playerBar" titleId="player-bar-title" store={store} />
      <Setting
        id="player-bar"
        label="Custom player bar"
        control={<Toggle id="player-bar-on" says={{ on: "On", off: "Off" }} on={store.playerBar} onChange={(playerBar) => void writeStore({ playerBar }).then(onChanged)} />}
      />
      {/* The one way the bar is kept visible: the key flips it on the video's page, kept for every video after. */}
      <Setting
        id="player-bar-key"
        label="Keep player bar visible keybind"
        control={
          <KeyField
            id="player-bar-key-choice"
            label="Keep player bar visible keybind"
            value={store.playerBarKey}
            disabled={!store.playerBar}
            onChange={(playerBarKey) => void writeStore({ playerBarKey }).then(onChanged)}
          />
        }
        why="Keeps the player bar visible as the video plays, or lets it fade again."
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
