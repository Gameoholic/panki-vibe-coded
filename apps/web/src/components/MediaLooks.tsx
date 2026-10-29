import { useEffect, useId, useState, type MouseEvent, type PointerEvent } from "react";
import type { MediaKind } from "@panki/contracts";
import { usePlayback } from "../hooks/usePlayback";
import { sameKey, type Heard, type Shortcut } from "../keys";
import { AS_SAID, SPEEDS, type Speed } from "../playback";
import { clock, keyWords } from "../words";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Icon, type IconName } from "./Icon";

/**
 * The looks a sound or a clip can have on a card besides the player and the chip (`MediaView` picks among them):
 * a voice note, a round button, a tile, a speaker. Each plays through `usePlayback`, and a clip plays its sound alone.
 * The owner's four, from the audio player page of 2026-10-15 (https://claude.ai/artifact/2WEFUoj7rsgbJUp3KQB8yi).
 */

/** What each kind of file is drawn with, so a sound and a clip are told apart before they're pressed. */
export const MEDIA_ICON: Record<MediaKind, IconName> = { audio: "sound", video: "film", image: "picture" };
/** What a sound or a clip is called where its name isn't shown. */
const KIND_WORD: Record<"audio" | "video", string> = { audio: "Sound", video: "Clip" };

/** Its presses are its own: on the review card a press anywhere else flips the card. */
export const ownPress = (e: MouseEvent) => e.stopPropagation();

/** The shape of a file's sound in so many bars, each 0 to 1; null when it can't be read. Drawn by the voice note. */
export type Wave = (src: string, bars: number) => Promise<readonly number[] | null>;

/** What every look of a sound or a clip is handed. `shortcut` is the key that plays it (and its hold), drawn on it as a keycap; null for none. `restart`, the keys that play it again from its start. */
export type LookProps = { kind: "audio" | "video"; src: string; label: string; named: boolean; cue: boolean; onCueEnd: (() => void) | undefined; shortcut: Shortcut | null; restart: readonly Heard[] };

/**
 * The key that plays it, drawn as the answers' keys are (`.key`, a keycap; a clock face as it's held, when it's held),
 * and the keys that play it again from its start (`restart`): one on the same key fills the same cap as it's held (1
 * pressed plays it, 1 held restarts it: the owner, 2026-10-29, "why doesn't the hold animation show for 1"), and one on
 * a key of its own has a cap of its own, the again sign in it. Nothing when it has none.
 */
export function MediaKey({ shortcut, restart = NO_RESTART, className = "" }: { shortcut: Shortcut | null; restart?: readonly Heard[]; className?: string }) {
  const sameHeld = shortcut !== null && restart.some((key) => key.holdMs > 0 && sameKey(key.key, shortcut.key));
  const own = restart.filter((key) => shortcut === null || !sameKey(key.key, shortcut.key));
  if (!shortcut && own.length === 0) return null;
  return (
    <>
      {shortcut ? (
        <span className={`key media-key ${shortcut.holdMs > 0 || sameHeld ? "is-hold" : ""} ${className}`.replace(/\s+/g, " ").trim()} aria-hidden="true">
          {keyWords(shortcut.key)}
        </span>
      ) : null}
      {own.map((key) => (
        <span key={key.key} className={`key media-key media-restart-key ${key.holdMs > 0 ? "is-hold" : ""} ${className}`.replace(/\s+/g, " ").trim()} aria-hidden="true">
          <Icon name="again" />
          {keyWords(key.key)}
        </span>
      ))}
    </>
  );
}
const NO_RESTART: readonly Heard[] = [];

const SPEED_OPTIONS = SPEEDS.map((speed) => ({ id: speed, label: `${speed}×` }));

/**
 * How fast every player plays (`playback.ts`): the app's dropdown, small, lit while it isn't as said. Set on one card,
 * it's the speed of every card after. The player's bar and the voice note carry it; the looks with no room for it
 * play at it all the same.
 */
export function SpeedControl({ speed, onSpeed, label }: { speed: Speed; onSpeed: (speed: Speed) => void; label: string }) {
  const id = useId();
  return (
    <span className={`media-speed ${speed === AS_SAID ? "" : "is-changed"}`.trim()}>
      <Dropdown id={id} label={`How fast ${label} plays`} options={SPEED_OPTIONS} value={speed} onChange={onSpeed} />
    </span>
  );
}

const shareOf = (at: number, length: number | null) => (length ? Math.min(1, at / length) : 0);
const pressWord = (playing: boolean, label: string) => `${playing ? "Pause" : "Play"} ${label}`;

/** How many bars a voice note's waveform has. */
const BARS = 36;
/** A waveform before its sound is read, or when it can't be: level, saying nothing about the sound. */
const LEVEL: readonly number[] = Array.from({ length: BARS }, () => 0.4);

/**
 * A voice note, as a chat app has them: a round play button, the sound's own waveform filling as it plays (pressed
 * somewhere, it goes there), the time, and how fast every player plays, the voice's pitch kept.
 */
export function VoiceLook({ kind, src, label, named, cue, onCueEnd, shortcut, restart, waveOf }: LookProps & { waveOf: Wave | undefined }) {
  const play = usePlayback(cue, onCueEnd, shortcut, restart);
  const [bars, setBars] = useState<readonly number[]>(LEVEL);
  useEffect(() => {
    setBars(LEVEL);
    if (!waveOf) return;
    let alive = true;
    void waveOf(src, BARS).then((shape) => {
      if (alive && shape) setBars(shape);
    });
    return () => {
      alive = false;
    };
  }, [src, waveOf]);
  const share = shareOf(play.at, play.length);
  const goTo = (e: PointerEvent<HTMLSpanElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width > 0) play.seek((e.clientX - box.left) / box.width);
  };
  return (
    <div className={`media media-voice media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="metadata" {...play.events} />
      <Button className="btn-icon media-voice-play" aria-label={pressWord(play.playing, label)} aria-keyshortcuts={shortcut?.key} disabled={play.failed} onClick={play.toggle}>
        <Icon name={play.playing ? "pause" : "play"} />
      </Button>
      <MediaKey shortcut={shortcut} restart={restart} />
      <span className="media-wave" aria-hidden="true" onPointerDown={goTo}>
        {bars.map((height, i) => (
          <i key={i} className={i / bars.length < share ? "is-heard" : ""} style={{ height: `${Math.round(Math.max(0.12, height) * 100)}%` }} />
        ))}
      </span>
      <span className="media-voice-side">
        <span className="media-time">{clock(play.playing || play.at > 0 ? play.at : (play.length ?? 0))}</span>
        {named ? <span className="media-voice-name">{label}</span> : null}
      </span>
      <SpeedControl speed={play.speed} onSpeed={play.setSpeed} label={label} />
    </div>
  );
}

/** The ring's size, on a 60-unit square. */
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

/** A big round button, easy for a thumb, its ring filling as it plays; its name under it when it's shown. */
export function RoundLook({ kind, src, label, named, cue, onCueEnd, shortcut, restart }: LookProps) {
  const play = usePlayback(cue, onCueEnd, shortcut, restart);
  const share = shareOf(play.at, play.length);
  return (
    <span className={`media media-round media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="metadata" {...play.events} />
      <Button className="media-round-button" aria-label={pressWord(play.playing, label)} aria-keyshortcuts={shortcut?.key} disabled={play.failed} onClick={play.toggle}>
        <svg className="media-ring" viewBox="0 0 60 60" aria-hidden="true">
          <circle className="media-ring-base" cx="30" cy="30" r={RING_R} />
          <circle className="media-ring-heard" cx="30" cy="30" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - share)} />
        </svg>
        <span className="media-round-core">
          <Icon name={play.playing ? "pause" : "play"} />
        </span>
      </Button>
      {named ? <span className="media-round-name">{label}</span> : null}
      <MediaKey shortcut={shortcut} restart={restart} />
    </span>
  );
}

/** A tile: what it is (its name, or "Sound" or "Clip") and how long, the whole tile the button, filling as it plays. */
export function TileLook({ kind, src, label, named, cue, onCueEnd, shortcut, restart }: LookProps) {
  const play = usePlayback(cue, onCueEnd, shortcut, restart);
  const share = shareOf(play.at, play.length);
  const length = play.length === null ? "" : clock(play.length);
  return (
    <span className={`media media-tile media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="metadata" {...play.events} />
      <Button className="media-tile-button" aria-label={pressWord(play.playing, label)} aria-keyshortcuts={shortcut?.key} disabled={play.failed} onClick={play.toggle}>
        <span className="media-tile-fill" style={{ width: `${share * 100}%` }} aria-hidden="true" />
        <span className="media-tile-icon">
          <Icon name={play.playing ? "pause" : MEDIA_ICON[kind]} />
        </span>
        <span className="media-tile-words">
          <span className="media-tile-name">{named ? label : KIND_WORD[kind]}</span>
          <span className="media-time">{play.playing && length ? `${clock(play.at)} of ${length}` : length}</span>
        </span>
        <MediaKey shortcut={shortcut} restart={restart} />
      </Button>
    </span>
  );
}

/** A speaker, as a dictionary puts one beside a word: beside the words above it, it sits right after them. Its name beside it when it's shown. */
export function SpeakerLook({ kind, src, label, named, cue, onCueEnd, shortcut, restart }: LookProps) {
  const play = usePlayback(cue, onCueEnd, shortcut, restart);
  return (
    <span className={`media media-speaker media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="metadata" {...play.events} />
      <Button
        className={`media-speaker-button ${play.playing ? "is-playing" : ""}`.trim()}
        aria-label={pressWord(play.playing, label)}
        aria-keyshortcuts={shortcut?.key}
        disabled={play.failed}
        onClick={play.toggle}
      >
        <Icon name={MEDIA_ICON[kind]} />
        {named ? <span className="media-speaker-name">{label}</span> : null}
        <MediaKey shortcut={shortcut} restart={restart} />
      </Button>
    </span>
  );
}
