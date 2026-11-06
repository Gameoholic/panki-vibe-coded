import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@web/components/Icon";
import { clock, hourWords } from "@web/words";
import { BAR_CONTROLS, DEFAULT_BAR, barSide, type BarControl, type BarLayout } from "../modules";
import { SaveControl } from "../ui/SaveControl";
import { SpeedControl } from "../ui/SpeedControl";
import { WatchingControl } from "../ui/WatchingControl";

/** YouTube's own bar, as it stands with the player bar switched off: its controls in its order, nothing of Panki's. */
export const YOUTUBE_OWN: BarLayout = DEFAULT_BAR.map((control) => ({ ...control, shown: BAR_CONTROLS[control.id].from === "youtube" }));

/** The made-up video the bar is drawn for: how long it is and how far it has played, in seconds. */
export const BAR_LENGTH = 11 * 60 + 37;
export const BAR_PLAYED = 2;
/** How wide the bar is drawn before it's scaled to where it stands: a player's on a computer's screen. */
const BAR_WIDTH = 960;
/** How tall it is at that width (its seek bar and its row of controls, `.ytb`'s own height). */
const BAR_HEIGHT = 80;

/**
 * The player's control bar drawn as laid out, as the site's 2025 player draws it:
 * the red line along its top; at its left each control a round glass pill of its own (play, the speaker) and the time
 * in a long one; at its right one glass strip holding every control as a bare icon. It's drawn at a player's real
 * width (`BAR_WIDTH`) and scaled to the room it has, so it looks the same in a narrow column. Each control stands in a
 * box that says which it is (`data-control`; `classOf` a class of the caller's, one coming in or going). YouTube's are
 * drawn in its shapes; Panki's are the real ones (the speed button on `video`, never shown; Watching and Save for later
 * on the made-up video, each pressed to say the other). The options page's
 * preview and the Player bar's explainer are both this.
 */
export function BarControls({ layout, video, classOf }: { layout: BarLayout; video: HTMLVideoElement; classOf?: (id: BarControl) => string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / BAR_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Watching and Save for later on the made-up video, pressed to say the other as they are on a real one.
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const glyph = (name: IconName, solid = false) => <Icon name={name} className={solid ? "is-solid" : ""} />;
  const drawn: Record<BarControl, ReactNode> = {
    play: <span className="ytb-round">{glyph("play", true)}</span>,
    volume: <span className="ytb-round ytb-speaker">{glyph("quiet")}</span>,
    time: (
      <span className="ytb-pill">
        {clock(BAR_PLAYED)} / {clock(BAR_LENGTH)}
      </span>
    ),
    endTime: <span className="yt-end">Ends {hourWords(Date.now() + (BAR_LENGTH - BAR_PLAYED) * 1000)}</span>,
    watching: <WatchingControl finished={finished} percent={Math.floor((BAR_PLAYED / BAR_LENGTH) * 100)} onToggle={() => setFinished((was) => !was)} />,
    speed: <SpeedControl video={video} />,
    save: <SaveControl saved={saved} onToggle={() => setSaved((was) => !was)} />,
    autoplay: (
      <span className="ytb-icon">
        <span className="ytb-autoplay">
          <i>{glyph("pause")}</i>
        </span>
      </span>
    ),
    captions: <span className="ytb-icon">{glyph("subtitles")}</span>,
    settings: <span className="ytb-icon">{glyph("gear")}</span>,
    theater: <span className="ytb-icon">{glyph("theater")}</span>,
    fullscreen: <span className="ytb-icon">{glyph("expand")}</span>,
  };
  const side = (of: "left" | "right") =>
    barSide(layout, of)
      .filter((control) => control.shown)
      .map((control) => (
        <span key={control.id} className={`ytb-control ${classOf?.(control.id) ?? ""}`.trim()} data-control={control.id}>
          {drawn[control.id]}
        </span>
      ));
  const right = side("right");
  return (
    <div ref={box} className="ytb-fit" style={{ height: BAR_HEIGHT * scale }}>
      <div className="ytb" style={{ width: BAR_WIDTH, height: BAR_HEIGHT, transform: `scale(${scale})` }}>
        <span className="ytb-progress">
          <i style={{ width: `${(BAR_PLAYED / BAR_LENGTH) * 100}%` }} />
          <b style={{ left: `${(BAR_PLAYED / BAR_LENGTH) * 100}%` }} />
        </span>
        <div className="ytb-row">
          <span className="ytb-left">{side("left")}</span>
          {right.length > 0 ? <span className="ytb-strip">{right}</span> : null}
        </div>
      </div>
    </div>
  );
}
