import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MediaKind, MediaLook } from "@panki/contracts";
import { usePlayback } from "../hooks/usePlayback";
import type { Volume } from "../volume";
import { clock } from "../words";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { MEDIA_ICON, MediaKey, RoundLook, SpeakerLook, TileLook, VoiceLook, ownPress, type LookProps, type Wave } from "./MediaLooks";

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
  /** The key that plays or stops it from anywhere on the page, drawn on it as a keycap (a review's); none by default. */
  shortcut?: string | null;
};

/**
 * A file on a card, shown as what it is: a picture drawn in a frame; a sound or a clip in the look it's given (the
 * app's own player with its play button, line and time; a chip; a voice note; a round button; a tile; a speaker), in
 * its kind's colour. Every look plays through one hook (`usePlayback`). Never the browser's own controls, and nothing
 * plays until it's pressed or cued.
 */
export function MediaView({ kind, src, label, size = "card", look = "player", named, cue = false, onCueEnd, waveOf, over = null, shortcut = null }: Props) {
  if (kind === "image") return <img className={`media-frame ${size === "row" ? "media-thumb" : ""}`.trim()} src={src} alt={label} loading="lazy" draggable={false} />;
  const shown = size === "row" ? "button" : look;
  const common = { kind, src, label, cue, onCueEnd, shortcut };
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
  /** How loud it plays (`volume.ts`): the speaker that mutes it and the line it's turned up and down on. Panki's own player has it. */
  sound?: SoundProps | null;
  /** The key that plays it, as a keycap beside the play button; none by default. */
  shortcut?: string | null;
};

/**
 * The player's bar: play or pause, a line that fills as it runs, the time, how loud. `MediaView` draws it under a clip
 * and as the whole of a sound. It's also for whoever shows something that plays but isn't a file Panki holds yet (the
 * extension's clip before it's recorded), so that looks like the player by being the player's own bar. Never a second bar.
 */
export function MediaBar({ playing, at, length, label, onToggle, tag = null, screen = null, sound = null, shortcut = null }: BarProps) {
  return (
    <div className="media-bar">
      <Button className="btn-icon media-play" aria-label={`${playing ? "Pause" : "Play"} ${label}`} aria-keyshortcuts={shortcut ?? undefined} onClick={onToggle}>
        <Icon name={playing ? "pause" : "play"} />
      </Button>
      <MediaKey shortcut={shortcut} />
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
      {sound ? <SoundControl {...sound} label={label} /> : null}
      {screen ? (
        <Button className="btn-icon media-screen" aria-label={screen.full ? `Leave full screen` : `${label} full screen`} onClick={screen.onToggle}>
          <Icon name={screen.full ? "unfull" : "full"} />
        </Button>
      ) : null}
    </div>
  );
}

type SoundProps = {
  volume: Volume;
  /** How loud, from 0 to 1. */
  onLevel: (level: number) => void;
  onMute: () => void;
};

/** How far a press of an arrow key turns it up or down. */
const VOLUME_STEP = 0.1;
const VOLUME_KEYS: Readonly<Partial<Record<string, number>>> = { ArrowLeft: -VOLUME_STEP, ArrowDown: -VOLUME_STEP, ArrowRight: VOLUME_STEP, ArrowUp: VOLUME_STEP };

/**
 * How loud: a speaker that mutes it and unmutes it, and beside it a short line that's pressed, pulled or moved with the
 * arrow keys. On a phone the line gives way (its own buttons turn it up and down) and the speaker stays.
 */
function SoundControl({ volume, onLevel, onMute, label }: SoundProps & { label: string }) {
  const line = useRef<HTMLSpanElement>(null);
  const held = useRef(false);
  const shown = volume.muted ? 0 : volume.level;
  const percent = Math.round(shown * 100);
  function levelAt(x: number): number | null {
    const box = line.current?.getBoundingClientRect();
    return box && box.width > 0 ? Math.max(0, Math.min(1, (x - box.left) / box.width)) : null;
  }
  function pull(x: number) {
    const to = levelAt(x);
    if (to !== null) onLevel(to);
  }
  return (
    <span className="media-sound">
      <Button className="btn-icon media-mute" aria-label={`${shown === 0 ? "Unmute" : "Mute"} ${label}`} onClick={onMute}>
        <Icon name={shown === 0 ? "muted" : shown < 0.5 ? "quiet" : "sound"} />
      </Button>
      <span
        className="media-level"
        role="slider"
        tabIndex={0}
        aria-label={`${label} volume`}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          // It keeps following a pointer that strays off it.
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus({ preventScroll: true });
          held.current = true;
          pull(e.clientX);
        }}
        onPointerMove={(e) => {
          if (held.current) pull(e.clientX);
        }}
        onLostPointerCapture={() => {
          held.current = false;
        }}
        onKeyDown={(e) => {
          const to = VOLUME_KEYS[e.key];
          if (e.key === "Home" || e.key === "End") onLevel(e.key === "Home" ? 0 : 1);
          else if (to !== undefined) onLevel(Math.round((volume.level + to) * 10) / 10);
          else return;
          e.preventDefault();
        }}
      >
        <span ref={line} className="media-level-line">
          <i style={{ width: `${percent}%` }} />
        </span>
      </span>
    </span>
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
function PlayerLook({ kind, src, label, named, cue, onCueEnd, shortcut, over }: LookProps & { over: ReactNode }) {
  const play = usePlayback(cue, onCueEnd, shortcut);
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
          sound={{ volume: play.volume, onLevel: play.setLevel, onMute: play.toggleMute }}
          shortcut={shortcut}
        />
      )}
    </div>
  );
}

/**
 * Plain: the browser's own player and its controls (full screen, going anywhere in it, the sound, the speed), for
 * whoever wants it (the owner, 2026-10-15, had it kept as a style beside Panki's own). Its name over it when shown.
 */
function PlainLook({ kind, src, label, named, cue, onCueEnd, shortcut, over }: LookProps & { over: ReactNode }) {
  const play = usePlayback(cue, onCueEnd, shortcut);
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
          <video ref={play.hold} className="media-frame" src={src} preload="metadata" playsInline controls aria-label={label} aria-keyshortcuts={shortcut ?? undefined} {...play.events} />
          {over}
          {/* The browser's own controls are along its bottom: the key sits in a top corner, clear of them. */}
          <MediaKey shortcut={shortcut} />
        </div>
      ) : (
        <span className="media-plain-row">
          <audio ref={play.hold} className="media-plain-audio" src={src} preload="metadata" controls aria-label={label} aria-keyshortcuts={shortcut ?? undefined} {...play.events} />
          <MediaKey shortcut={shortcut} />
        </span>
      )}
    </div>
  );
}

/** A chip that plays it: the sound alone. On a card's row, and the card's Button look. Nothing is fetched until it's pressed or cued. */
function ChipLook({ kind, src, label, named, cue, onCueEnd, shortcut }: LookProps) {
  const play = usePlayback(cue, onCueEnd, shortcut);
  return (
    <span className={`media media-row media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="none" {...play.events} />
      <Button
        variant="chip"
        className="media-chip"
        aria-label={`${play.playing ? "Pause" : "Play"} ${label}`}
        aria-keyshortcuts={shortcut ?? undefined}
        disabled={play.failed}
        onClick={play.toggle}
      >
        <Icon name={play.playing ? "pause" : named ? "play" : MEDIA_ICON[kind]} />
        {named ? label : null}
        <MediaKey shortcut={shortcut} />
      </Button>
    </span>
  );
}
