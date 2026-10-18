import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MediaKind, MediaLook } from "@panki/contracts";
import { usePlayback } from "../hooks/usePlayback";
import { clock } from "../words";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { MEDIA_ICON, RoundLook, SpeakerLook, TileLook, VoiceLook, ownPress, type LookProps, type Wave } from "./MediaLooks";

export { MEDIA_ICON };

type Props = {
  kind: MediaKind;
  /** Where the bytes are: `api.mediaUrl(id)` for a file Panki holds, an object URL for one just picked. */
  src: string;
  /** What the file is, in the owner's words (its field's name): what a screen reader hears, and the word on a row's chip. */
  label: string;
  /** `row` is the small one on a card's row: a picture as a thumbnail, a sound or a clip as a chip that plays it. */
  size?: "card" | "row";
  /**
   * How a sound or a clip shows on a card (`size="card"`): the player (a clip with its picture), or one of the other
   * looks the card layout offers (`MediaLook`). A picture is a picture whatever's asked.
   */
  look?: MediaLook;
  /**
   * Whether its name is written on it. On the card's player it's off unless asked for (the bar then carries the
   * kind's icon and the name); on a chip it's on, and off leaves the kind's icon alone.
   */
  named?: boolean;
  /** Told to play from the start: a review playing what's set to play by itself as it comes into view, one at a time. */
  cue?: boolean;
  /** That play is over: it ended, was stopped, or couldn't start. */
  onCueEnd?: () => void;
  /** The shape of its sound, for the voice note's waveform; without it the waveform is level. */
  waveOf?: Wave;
  /** Laid over a clip's picture, in the looks that show it (the player and plain): its subtitles (`ClipSubtitles`), or nothing. */
  over?: ReactNode;
};

/**
 * A file on a card, shown as what it is: a picture drawn in a frame; a sound or a clip in the look it's given (the
 * app's own player with its play button, line and time; a chip; a voice note; a round button; a tile; a speaker), in
 * its kind's colour. Every look plays through one hook (`usePlayback`). Never the browser's own controls, and nothing
 * plays until it's pressed or cued.
 */
export function MediaView({ kind, src, label, size = "card", look = "player", named, cue = false, onCueEnd, waveOf, over = null }: Props) {
  if (kind === "image") return <img className={`media-frame ${size === "row" ? "media-thumb" : ""}`.trim()} src={src} alt={label} loading="lazy" draggable={false} />;
  const shown = size === "row" ? "button" : look;
  const common = { kind, src, label, cue, onCueEnd };
  switch (shown) {
    case "button":
      return <ChipLook {...common} named={named ?? true} />;
    case "plain":
      return <PlainLook {...common} named={named ?? false} over={over} />;
    case "voice":
      return <VoiceLook {...common} named={named ?? false} waveOf={waveOf} />;
    case "round":
      return <RoundLook {...common} named={named ?? false} />;
    case "tile":
      return <TileLook {...common} named={named ?? false} />;
    case "speaker":
      return <SpeakerLook {...common} named={named ?? false} />;
    default:
      return <PlayerLook {...common} named={named ?? false} over={over} />;
  }
}

type BarProps = {
  playing: boolean;
  /** How far in it is, and how long it runs, in seconds; `length` is null while that isn't known. */
  at: number;
  length: number | null;
  label: string;
  onToggle: () => void;
  /** Written on the bar beside the button: the kind's icon and the name. */
  tag?: { icon: IconName; label: string } | null;
  /** Filling the screen and back, at the bar's end: a clip's player has it. */
  screen?: { full: boolean; onToggle: () => void } | null;
};

/**
 * The player's bar: play or pause, a line that fills as it runs, the time. `MediaView` draws it under a clip and as the
 * whole of a sound. It's also for whoever shows something that plays but isn't a file Panki holds yet (the extension's
 * clip before it's recorded), so that looks like the player by being the player's own bar. Never a second bar.
 */
export function MediaBar({ playing, at, length, label, onToggle, tag = null, screen = null }: BarProps) {
  return (
    <div className={`media-bar ${tag ? "is-named" : ""} ${screen ? "has-screen" : ""}`.replace(/\s+/g, " ").trim()}>
      <Button className="btn-icon media-play" aria-label={`${playing ? "Pause" : "Play"} ${label}`} onClick={onToggle}>
        <Icon name={playing ? "pause" : "play"} />
      </Button>
      {tag ? (
        <span className="media-tag">
          <Icon name={tag.icon} />
          {tag.label}
        </span>
      ) : null}
      <span className="media-track" aria-hidden="true">
        <i style={{ width: `${length ? Math.min(1, at / length) * 100 : 0}%` }} />
      </span>
      <span className="media-time">{length === null ? clock(at) : `${clock(at)} / ${clock(length)}`}</span>
      {screen ? (
        <Button className="btn-icon media-screen" aria-label={screen.full ? `Leave full screen` : `${label} full screen`} onClick={screen.onToggle}>
          <Icon name={screen.full ? "unfull" : "full"} />
        </Button>
      ) : null}
    </div>
  );
}

/** The screen a player fills: its own document's, or its shadow root's on someone else's page (the extension's). */
function fullOf(el: HTMLElement): Element | null {
  const root = el.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root.fullscreenElement : null;
}

/**
 * Panki's own player: a clip's picture over the app's bar, or a sound's bar alone. A clip fills the screen from its
 * bar's end (the owner, 2026-10-15, who liked this look better than the browser's own, and wanted full screen too);
 * the picture and the bar fill it together, so the controls stay Panki's.
 */
function PlayerLook({ kind, src, label, named, cue, onCueEnd, over }: LookProps & { over: ReactNode }) {
  const play = usePlayback(cue, onCueEnd);
  const frame = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (kind !== "video") return;
    const follow = () => setFull(frame.current !== null && fullOf(frame.current) === frame.current);
    document.addEventListener("fullscreenchange", follow);
    return () => document.removeEventListener("fullscreenchange", follow);
  }, [kind]);
  function toggleFull() {
    const el = frame.current;
    if (!el) return;
    // A browser that won't (a phone that only lets a bare video fill the screen) leaves it as it is.
    if (fullOf(el) === el) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  }
  const canFill = kind === "video" && typeof document.documentElement.requestFullscreen === "function";
  return (
    <div ref={frame} className={`media media-player media-${kind}`} onClick={ownPress}>
      {kind === "video" ? (
        // The picture and what's laid over it (its subtitles) in one box, so they fill the screen together.
        <div className="media-picture">
          <video ref={play.hold} className="media-frame" src={src} preload="metadata" playsInline onClick={play.toggle} onDoubleClick={canFill ? toggleFull : undefined} {...play.events} />
          {over}
        </div>
      ) : (
        <audio ref={play.hold} src={src} preload="metadata" {...play.events} />
      )}
      {play.failed ? (
        <p className="media-failed" role="alert">
          This browser can't play this file.
        </p>
      ) : (
        <MediaBar
          playing={play.playing}
          at={play.at}
          length={play.length}
          label={label}
          onToggle={play.toggle}
          tag={named ? { icon: MEDIA_ICON[kind], label } : null}
          screen={canFill ? { full, onToggle: toggleFull } : null}
        />
      )}
    </div>
  );
}

/**
 * Plain: the browser's own player and its controls (full screen, going anywhere in it, the sound, the speed), for
 * whoever wants it (the owner, 2026-10-15, had it kept as a style beside Panki's own). Its name over it when shown.
 */
function PlainLook({ kind, src, label, named, cue, onCueEnd, over }: LookProps & { over: ReactNode }) {
  const play = usePlayback(cue, onCueEnd);
  return (
    <div className={`media media-plain media-${kind}`} onClick={ownPress}>
      {named ? (
        <span className="media-tag">
          <Icon name={MEDIA_ICON[kind]} />
          {label}
        </span>
      ) : null}
      {kind === "video" ? (
        <div className="media-picture">
          <video ref={play.hold} className="media-frame" src={src} preload="metadata" playsInline controls aria-label={label} {...play.events} />
          {over}
        </div>
      ) : (
        <audio ref={play.hold} className="media-plain-audio" src={src} preload="metadata" controls aria-label={label} {...play.events} />
      )}
    </div>
  );
}

/** A chip that plays it: the sound alone. On a card's row, and the card's Button look. Nothing is fetched until it's pressed or cued. */
function ChipLook({ kind, src, label, named, cue, onCueEnd }: LookProps) {
  const play = usePlayback(cue, onCueEnd);
  return (
    <span className={`media media-row media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="none" {...play.events} />
      <Button variant="chip" className="media-chip" aria-label={`${play.playing ? "Pause" : "Play"} ${label}`} disabled={play.failed} onClick={play.toggle}>
        <Icon name={play.playing ? "pause" : named ? "play" : MEDIA_ICON[kind]} />
        {named ? label : null}
      </Button>
    </span>
  );
}
