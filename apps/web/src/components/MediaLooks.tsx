import { useEffect, useId, useState, type MouseEvent, type PointerEvent } from "react";
import type { MediaKind } from "@panki/contracts";
import { usePlayback } from "../hooks/usePlayback";
import { clock } from "../words";
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

/** What every look of a sound or a clip is handed. */
export type LookProps = { kind: "audio" | "video"; src: string; label: string; named: boolean; cue: boolean; onCueEnd: (() => void) | undefined };

const shareOf = (at: number, length: number | null) => (length ? Math.min(1, at / length) : 0);
const pressWord = (playing: boolean, label: string) => `${playing ? "Pause" : "Play"} ${label}`;

/** How many bars a voice note's waveform has. */
const BARS = 36;
/** A waveform before its sound is read, or when it can't be: level, saying nothing about the sound. */
const LEVEL: readonly number[] = Array.from({ length: BARS }, () => 0.4);
/**
 * How fast a voice note can play: slower to catch a fast sentence, or as it was said, which it starts at. Never faster
 * (the owner, 2026-10-16: "no reason to speed it up").
 */
const SPEEDS: readonly { id: number; label: string }[] = [0.5, 0.75, 1].map((rate) => ({ id: rate, label: `${rate}×` }));
const AS_SAID = 1;

/**
 * A voice note, as a chat app has them: a round play button, the sound's own waveform filling as it plays (pressed
 * somewhere, it goes there), the time, and how fast it plays, from a dropdown, the voice's pitch kept.
 */
export function VoiceLook({ kind, src, label, named, cue, onCueEnd, waveOf }: LookProps & { waveOf: Wave | undefined }) {
  const play = usePlayback(cue, onCueEnd);
  const [bars, setBars] = useState<readonly number[]>(LEVEL);
  const [rate, setRate] = useState(AS_SAID);
  const speedId = useId();
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
      <Button className="btn-icon media-voice-play" aria-label={pressWord(play.playing, label)} disabled={play.failed} onClick={play.toggle}>
        <Icon name={play.playing ? "pause" : "play"} />
      </Button>
      <span className="media-wave" aria-hidden="true" onPointerDown={goTo}>
        {bars.map((height, i) => (
          <i key={i} className={i / bars.length < share ? "is-heard" : ""} style={{ height: `${Math.round(Math.max(0.12, height) * 100)}%` }} />
        ))}
      </span>
      <span className="media-voice-side">
        <span className="media-time">{clock(play.playing || play.at > 0 ? play.at : (play.length ?? 0))}</span>
        {named ? <span className="media-voice-name">{label}</span> : null}
      </span>
      <span className={`media-speed ${rate === AS_SAID ? "" : "is-changed"}`.trim()}>
        <Dropdown
          id={speedId}
          label={`How fast ${label} plays`}
          options={SPEEDS}
          value={rate}
          onChange={(next) => {
            setRate(next);
            play.setRate(next);
          }}
        />
      </span>
    </div>
  );
}

/** The ring's size, on a 60-unit square. */
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

/** A big round button, easy for a thumb, its ring filling as it plays; its name under it when it's shown. */
export function RoundLook({ kind, src, label, named, cue, onCueEnd }: LookProps) {
  const play = usePlayback(cue, onCueEnd);
  const share = shareOf(play.at, play.length);
  return (
    <span className={`media media-round media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="metadata" {...play.events} />
      <Button className="media-round-button" aria-label={pressWord(play.playing, label)} disabled={play.failed} onClick={play.toggle}>
        <svg className="media-ring" viewBox="0 0 60 60" aria-hidden="true">
          <circle className="media-ring-base" cx="30" cy="30" r={RING_R} />
          <circle className="media-ring-heard" cx="30" cy="30" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - share)} />
        </svg>
        <span className="media-round-core">
          <Icon name={play.playing ? "pause" : "play"} />
        </span>
      </Button>
      {named ? <span className="media-round-name">{label}</span> : null}
    </span>
  );
}

/** A tile: what it is (its name, or "Sound" or "Clip") and how long, the whole tile the button, filling as it plays. */
export function TileLook({ kind, src, label, named, cue, onCueEnd }: LookProps) {
  const play = usePlayback(cue, onCueEnd);
  const share = shareOf(play.at, play.length);
  const length = play.length === null ? "" : clock(play.length);
  return (
    <span className={`media media-tile media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="metadata" {...play.events} />
      <Button className="media-tile-button" aria-label={pressWord(play.playing, label)} disabled={play.failed} onClick={play.toggle}>
        <span className="media-tile-fill" style={{ width: `${share * 100}%` }} aria-hidden="true" />
        <span className="media-tile-icon">
          <Icon name={play.playing ? "pause" : MEDIA_ICON[kind]} />
        </span>
        <span className="media-tile-words">
          <span className="media-tile-name">{named ? label : KIND_WORD[kind]}</span>
          <span className="media-time">{play.playing && length ? `${clock(play.at)} of ${length}` : length}</span>
        </span>
      </Button>
    </span>
  );
}

/** A speaker, as a dictionary puts one beside a word: beside the words above it, it sits right after them. Its name beside it when it's shown. */
export function SpeakerLook({ kind, src, label, named, cue, onCueEnd }: LookProps) {
  const play = usePlayback(cue, onCueEnd);
  return (
    <span className={`media media-speaker media-${kind}`} onClick={ownPress}>
      <audio ref={play.hold} src={src} preload="metadata" {...play.events} />
      <Button className={`media-speaker-button ${play.playing ? "is-playing" : ""}`.trim()} aria-label={pressWord(play.playing, label)} disabled={play.failed} onClick={play.toggle}>
        <Icon name={MEDIA_ICON[kind]} />
        {named ? <span className="media-speaker-name">{label}</span> : null}
      </Button>
    </span>
  );
}
