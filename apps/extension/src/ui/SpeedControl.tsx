import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { usePull } from "@web/components/MediaView";
import { useDismiss } from "@web/hooks/useDismiss";

/**
 * The player's speed, changed without opening the site's own settings (the owner, 2026-10-21, the first YouTube
 * utility after Hide Shorts). Among the player's own controls: − and + round the speed it plays at; the speed pressed
 * opens a slider and the common speeds above it, and pressed with Shift or Ctrl goes back to 1× (2 of
 * https://claude.ai/artifact/UcHcxBe1gPntswHVpDudGs with 3's stepper beside it, the owner's pick, 2026-10-29). From 0.1×
 * to 10× (the owner: "is it possible to have higher / slower ones?"); a browser may play some of that silent (Firefox,
 * outside 0.25× to 4×). It reads the player itself, so a speed set the site's way shows here too. A utility of the
 * site's own: there whether or not Panki is on.
 */
const MIN = 0.1;
const MAX = 10;
/** The common speeds, pressed in one go under the slider. */
const PRESETS = [0.5, 1, 1.25, 1.5, 2, 3] as const;
/** The site's player (its name, as it was when this was written). */
const PLAYER = ".html5-video-player";
/** The class Panki puts on the player while its speed panel is open: its bar held shown. */
export const BAR_HELD = "panki-bar-held";
/** The speed the site calls Standard, said under its preset as the site's own panel says it. */
const STANDARD = 1;
/** How far − and + move the speed from where it stands: fine near the speeds watched at, coarser far from them. */
const BANDS = [
  { below: 2, step: 0.05 },
  { below: 4, step: 0.25 },
  { below: Infinity, step: 0.5 },
] as const;
/** How close the slider has to come to a common speed (a share of its length) to rest on it. */
const SNAP = 0.015;

// The speed written as the site writes it (the owner, 2026-11-04): "1.1x" on the bar, "1.10x" over the panel's
// slider, its presets "1.0", "1.25", "2.0".
const speedWords = (rate: number) => `${Number(rate.toFixed(2))}x`;
const headWords = (rate: number) => `${rate.toFixed(2)}x`;
const presetWords = (rate: number) => (Number.isInteger(rate) ? rate.toFixed(1) : String(rate));
const stepAt = (rate: number) => (BANDS.find((band) => rate < band.below - 1e-9) ?? BANDS[2]).step;
/** A speed as one Panki plays at: within its bounds, on its band's step. */
const settled = (rate: number) => {
  const within = Math.min(MAX, Math.max(MIN, rate));
  const step = stepAt(within);
  return Math.min(MAX, Math.max(MIN, Number((Math.round(within / step) * step).toFixed(2))));
};
/** One press of − or + from a speed: down takes the step of the band below it, so 2× goes to 1.95×. */
const stepped = (rate: number, by: 1 | -1) => {
  const step = stepAt(by > 0 ? rate : rate - 1e-6);
  return Math.min(MAX, Math.max(MIN, Number((Math.round((rate + by * step) / step) * step).toFixed(2))));
};
// The slider is even in ratio, not in speed: 1× in its middle, halving and doubling the same distance either side.
const shareOf = (rate: number) => Math.log(rate / MIN) / Math.log(MAX / MIN);
const rateAt = (share: number) => {
  const near = PRESETS.find((speed) => Math.abs(shareOf(speed) - share) < SNAP);
  return near ?? settled(MIN * (MAX / MIN) ** share);
};
const same = (a: number, b: number) => Math.abs(a - b) < 0.001;

export function SpeedControl({ video }: { video: HTMLVideoElement }) {
  const [rate, setRate] = useState(video.playbackRate);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, () => setOpen(false));
  useEffect(() => {
    const read = () => setRate(video.playbackRate);
    read();
    video.addEventListener("ratechange", read);
    return () => video.removeEventListener("ratechange", read);
  }, [video]);
  // While the panel is open the player's bar stays shown whatever the pointer does, as it stays while the site's own gear
  // menu is open (the owner, 2026-11-04: "the settings panel of YouTube native makes the entire playback bar… stay open
  // even if I move my mouse away… same for our speed"): the player carries `BAR_HELD` while it's open, which the player
  // bar's stylesheet holds shown (`content/playerBar.ts` → `HOLD_SHOWN`). The panel closes by its ×, Esc, a press outside
  // it or the speed again. A video in no player (the options page's) has nothing to hold.
  useEffect(() => {
    const player = open ? video.closest(PLAYER) : null;
    if (!player) return;
    player.classList.add(BAR_HELD);
    return () => player.classList.remove(BAR_HELD);
  }, [open, video]);
  function play(at: number) {
    try {
      video.playbackRate = at;
    } catch {
      // A speed the browser won't play leaves the video as it was; the button goes on saying what it really plays at.
    }
  }
  function press(e: MouseEvent<HTMLButtonElement>) {
    if (e.shiftKey || e.ctrlKey) {
      play(1);
      setOpen(false);
    } else setOpen((was) => !was);
  }
  return (
    <div ref={root} className="yt-speed">
      <Button className="yt-speed-step" aria-label="Slower" disabled={rate <= MIN + 0.001} onClick={() => play(stepped(rate, -1))}>
        −
      </Button>
      <Button className="yt-speed-button" aria-label={`Playback speed, ${speedWords(rate)}`} aria-expanded={open} onClick={press}>
        {speedWords(rate)}
      </Button>
      <Button className="yt-speed-step" aria-label="Faster" disabled={rate >= MAX - 0.001} onClick={() => play(stepped(rate, 1))}>
        +
      </Button>
      {open ? (
        // The site's own Playback speed panel, piece for piece (the owner, 2026-11-04, its picture: "use the same look
        // that YouTube uses"): its head with its name and ×, the speed big, − the slider +, the presets as
        // its round pills with Standard under 1. Panki's wider range stays on the slider.
        <div className="yt-speed-pop" role="group" aria-label="Playback speed">
          {/* Its name at the head's left, × at its right closing it (the owner, 2026-11-04: in place of the site's way back, which here has nowhere to go back to). */}
          <div className="yt-speed-head">
            <span className="yt-speed-title">Playback speed</span>
            <Button className="yt-speed-close" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </Button>
          </div>
          <span className="yt-speed-read">{headWords(rate)}</span>
          <div className="yt-speed-row">
            <Button className="yt-speed-round" aria-label="Slower" disabled={rate <= MIN + 0.001} onClick={() => play(stepped(rate, -1))}>
              −
            </Button>
            <SpeedSlider rate={rate} onRate={play} />
            <Button className="yt-speed-round" aria-label="Faster" disabled={rate >= MAX - 0.001} onClick={() => play(stepped(rate, 1))}>
              +
            </Button>
          </div>
          <div className="yt-speed-presets">
            {PRESETS.map((speed) => (
              <span key={speed} className="yt-speed-preset">
                <Button variant="chip" className="yt-speed-chip" aria-pressed={same(rate, speed)} onClick={() => play(speed)}>
                  {presetWords(speed)}
                </Button>
                {speed === STANDARD ? <small>Standard</small> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The speed as a line pressed, pulled or moved with the arrow keys (− and +'s steps), as the site draws its own. */
function SpeedSlider({ rate, onRate }: { rate: number; onRate: (rate: number) => void }) {
  const { line, pulling, handlers } = usePull((share) => onRate(rateAt(share)));
  const share = Math.min(1, Math.max(0, shareOf(rate)));
  return (
    <div className="yt-speed-slider">
      <span
        className={`yt-speed-line ${pulling ? "is-pulling" : ""}`.trim()}
        role="slider"
        tabIndex={0}
        aria-label="Playback speed"
        aria-orientation="horizontal"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={rate}
        aria-valuetext={speedWords(rate)}
        {...handlers}
        onKeyDown={(e) => {
          if (e.key === "Home" || e.key === "End") onRate(e.key === "Home" ? MIN : MAX);
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onRate(stepped(rate, -1));
          else if (e.key === "ArrowRight" || e.key === "ArrowUp") onRate(stepped(rate, 1));
          else return;
          e.preventDefault();
        }}
      >
        <span ref={line} className="yt-speed-track">
          <i style={{ width: `${share * 100}%` }} />
          <b style={{ left: `${share * 100}%` }} />
        </span>
      </span>
    </div>
  );
}
