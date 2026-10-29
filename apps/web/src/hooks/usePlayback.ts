import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { Heard, Shortcut } from "../keys";
import { setSpeed, setVolume, speedOf, useSpeed, useVolume, type Speed, type Volume } from "../playback";
import { useHeardKeys } from "./useHeardKeys";

/**
 * A sound or a clip being played by one of the app's players (`MediaView`, in whichever look): whether it's playing,
 * where it is and how long it runs, whether it failed, and playing or stopping it. Spread `events` on the `<audio>`
 * or `<video>` and give it `hold` as its ref. `cue` plays it from the start (a review playing what plays by itself),
 * and `onCueEnd` is told when that play is over: it ended, was stopped, or couldn't start. Every look is this, so
 * they all play, stop and cue alike, and all at the one volume and the one speed (`playback.ts`), set on the player's
 * bar, a voice note or the browser's own controls. `shortcut` is a key that plays or stops it from anywhere on the page,
 * at a press or after its hold (a review's: the card gives each of its sounds and clips one, `ReviewCard`'s
 * `shortcuts`, this device's keys from `keys.ts`), and `restart` keys that play it again from its start (`ReviewCard`'s
 * `restarts`). Never a second way of playing a file.
 */
/** No keys: one list for every player without restart keys, so its listeners stand. */
const NO_KEYS: readonly Heard[] = [];

export function usePlayback(cue: boolean, onCueEnd?: () => void, shortcut: Shortcut | null = null, restart: readonly Heard[] = NO_KEYS) {
  const media = useRef<HTMLMediaElement | null>(null);
  const volume = useVolume();
  const speed = useSpeed();
  useEffect(() => {
    const el = media.current;
    if (el) loudness(el, volume);
  }, [volume]);
  useEffect(() => {
    const el = media.current;
    if (el) pace(el, speed);
  }, [speed]);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  /** How long it runs, once the file says; a clip recorded in a browser often doesn't, and then only the time so far shows. */
  const [length, setLength] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  /** It's playing because it was cued, so its end is told. */
  const cued = useRef(false);
  const cueEnd = useRef(onCueEnd);
  cueEnd.current = onCueEnd;
  const endCue = () => {
    if (!cued.current) return;
    cued.current = false;
    cueEnd.current?.();
  };

  useEffect(() => {
    const el = media.current;
    if (!cue || !el) return;
    cued.current = true;
    el.currentTime = 0;
    // A browser that won't play without a press first (or a file that can't be played) is the cue's end, not a fault.
    el.play().catch(endCue);
  }, [cue]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new cue starts it again

  function toggle() {
    const el = media.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    if (el.ended) el.currentTime = 0;
    // A file that can't be played says so through the element's own error; a play cut short by a pause is no failure.
    el.play().catch(() => undefined);
  }

  // Its keys, its own and its second, pressed anywhere on the page but in something typed into; one with a hold of its
  // own is held that long first, how far along drawn on its keycap (the player's `.media` carrying `--hold`), and let
  // go early does nothing. A tap of a key that's held for something else plays it as it's let go (`useHeardKeys`).
  useHeardKeys([shortcut, ...(shortcut?.also ?? [])], () => media.current?.closest<HTMLElement>(".media") ?? null, toggle);
  // Its restart keys, heard the same way: from the start, playing, wherever it was and whether it was playing or not.
  useHeardKeys(restart, () => media.current?.closest<HTMLElement>(".media") ?? null, () => {
    const el = media.current;
    if (!el) return;
    el.currentTime = 0;
    setAt(0);
    el.play().catch(() => undefined);
  });
  /** Moves to a share of the way through (0 to 1), playing or not. */
  function seek(share: number) {
    const el = media.current;
    if (!el || length === null) return;
    el.currentTime = Math.max(0, Math.min(1, share)) * length;
    setAt(el.currentTime);
  }
  const hold = (el: HTMLMediaElement | null) => {
    media.current = el;
    if (!el) return;
    loudness(el, volume);
    pace(el, speed);
  };
  /** The speaker on the bar: muted, or back to how loud it was (to full, when it had been turned all the way down). */
  function toggleMute() {
    const silent = volume.muted || volume.level === 0;
    setVolume(silent ? { level: volume.level === 0 ? 1 : volume.level, muted: false } : { ...volume, muted: true });
  }
  /** How loud, from 0 to 1; turning it up unmutes it. */
  function setLevel(level: number) {
    setVolume({ level, muted: level > 0 ? false : volume.muted });
  }
  const readLength = (e: SyntheticEvent<HTMLMediaElement>) => {
    const seconds = e.currentTarget.duration;
    setLength(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
  };
  const events = {
    onPlay: () => setPlaying(true),
    // Stopped, or over: a cued play is done either way (the end is a pause too).
    onPause: () => {
      setPlaying(false);
      endCue();
    },
    onEnded: () => {
      setPlaying(false);
      endCue();
    },
    onTimeUpdate: (e: SyntheticEvent<HTMLMediaElement>) => setAt(e.currentTarget.currentTime),
    onLoadedMetadata: readLength,
    onDurationChange: readLength,
    onError: () => {
      setFailed(true);
      endCue();
    },
    // The browser's own controls (the Plain look) turned it up or down: every player follows.
    onVolumeChange: (e: SyntheticEvent<HTMLMediaElement>) => setVolume({ level: e.currentTarget.volume, muted: e.currentTarget.muted }),
    // …or set how fast: every player follows when it's one of Panki's speeds; any other stays that player's own.
    onRateChange: (e: SyntheticEvent<HTMLMediaElement>) => {
      const picked = speedOf(e.currentTarget.playbackRate);
      if (picked !== null) setSpeed(picked);
    },
  };
  return { hold, events, playing, at, length, failed, toggle, seek, volume, setLevel, toggleMute, speed, setSpeed };
}

/** Puts the volume on the element, leaving it be where it's already so (each change it hears is told back to all). */
function loudness(el: HTMLMediaElement, volume: Volume) {
  if (el.volume !== volume.level) el.volume = volume.level;
  if (el.muted !== volume.muted) el.muted = volume.muted;
}

/** Puts the speed on the element: its default too, which a file loading puts it back to. The voice keeps its pitch. */
function pace(el: HTMLMediaElement, speed: Speed) {
  if (el.defaultPlaybackRate !== speed) el.defaultPlaybackRate = speed;
  if (el.playbackRate !== speed) el.playbackRate = speed;
}
