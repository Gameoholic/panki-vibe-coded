/** @panki The Video recap as a video is finished: the words added over a strip of the watch sessions (`Recap`, `RecapFace`). Never a nag: nothing in it asks anything of the viewer. */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { daysBetween, youtubeUrl, type ContinueVideo, type Day, type RecapCard, type SavedVideo, type VideoRecap, type WatchSession } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { clock, count, dayWords, hourWords, langOf, ordinalWords } from "@web/words";
import { thumbnailAt } from "../content/feed";
import { DownloadedMark } from "./DownloadedMark";

/**
 * The Video recap: a short "well done" on the picture as a video is finished, saying what the video was to the
 * account in this viewing: the cards added from it over a strip of its watch sessions, the words in the decks heard in
 * it, which of its channel's videos it is, and under them what's next (Continue watching, Saved for later). It asks
 * nothing and offers no task; × or the next video takes it off. Laid out at a player's size and scaled to the player
 * it stands in, so it reads the same on the page and in full screen.
 */

/** The size the recap is laid out at: a player 960 wide, as the page of ways drew it; it's scaled to the player it stands in, within these. */
const REF_WIDTH = 960;
const SCALE_MIN = 0.7;
const SCALE_MAX = 1.4;
/** The words fly up out of their marks on the seek bar one after another: when the first sets off, in s, and how far apart. */
const FLY = { start: 0.5, step: 0.11 };
/** Confetti: how many pieces, how long they fall, and the colours they're cut from (the marks' own, the same whatever the theme). */
const CONFETTI = { pieces: 150, lastsMs: 3_500 };
const CONFETTI_TOKENS = ["--mark-yellow", "--mark-orange", "--mark-red", "--mark-pink", "--mark-violet", "--mark-blue", "--mark-cyan", "--mark-green", "--mark-white"] as const;
/**
 * What's next under the strip: how many of Saved for later stand beside Continue watching's, and the least height the
 * recap needs (its own px) for them to stand well above the seek bar, whose marks open as the pointer comes near it;
 * on a picture shorter than that they're left out, so the recap stays inside it.
 */
const NEXT = { saved: 1, room: 380 };
/** A session's start drawn as a break on the strip only this far (a share of the video, %) from its start: at the very start there's nothing before it to break from. */
const BREAK_FROM = 0.5;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A card as the recap shows it: its words, and its reading and meaning as this browser's field mapping for its deck says where they are (empty when it doesn't). */
export type RecapFace = { card: RecapCard; reading: string; meaning: string };

type Props = {
  recap: VideoRecap;
  faces: readonly RecapFace[];
  /** How many words in the decks were heard in the parts watched; null when there are no Panki subtitles to tell. */
  heard: number | null;
  /** The video's length, in ms, for where on it each card and session is: Panki's, else the player's. */
  lengthMs: number;
  confetti: boolean;
  /** Where you added a card's color, as CSS: the words and their cards wear it. */
  added: string;
  /** Takes the video to a moment, in s. */
  onGo: (seconds: number) => void;
  onClose: () => void;
  /** The videos that wear the downloaded mark in what's next: those downloaded whole, none while the mark is hidden. */
  downloaded: ReadonlySet<string>;
};

/** The recap's room, in its own px (the player's over the scale), and the scale. */
type Frame = { w: number; h: number; s: number };
/** Where confetti is thrown up from, in the recap's own px, which way it leans and how wide it spreads (radians). */
type Origin = { x: number; y: number; spread: number };
type Burst = { origins: Origin[]; delayMs: number };

export function Recap(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [burst, setBurst] = useState<Burst | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, width / REF_WIDTH));
      setFrame((was) => (was && Math.abs(was.w * was.s - width) < 0.5 && Math.abs(was.h * was.s - height) < 0.5 ? was : { w: width / s, h: height / s, s }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className="recap" style={{ "--recap-added": props.added } as CSSProperties}>
      {frame ? (
        <div className="recap-stage" style={{ width: frame.w, height: frame.h, transform: `scale(${frame.s})` }}>
          {props.confetti && !still() ? <Confetti frame={frame} burst={burst} /> : null}
          <Sheet {...props} frame={frame} onBurst={setBurst} />
        </div>
      ) : null}
    </div>
  );
}

type SheetProps = Props & { frame: Frame; onBurst: (burst: Burst) => void };

/**
 * "Nice! 6 cards · 2 examples added": the cards added, and apart from them the examples given to cards already there,
 * each left out at none; with neither, "Nice! Video finished".
 */
function headline(recap: VideoRecap): string {
  const added = [recap.added > 0 ? count(recap.added, "card", "cards") : null, recap.examples > 0 ? count(recap.examples, "example", "examples") : null].filter((part) => part !== null);
  return added.length > 0 ? `Nice! ${added.join(" · ")} added` : "Nice! Video finished";
}
/** The cards with words to show: one with no main field has nothing to be called by. */
const shown = (faces: readonly RecapFace[]) => faces.filter((face) => face.card.words.trim() !== "");
/** Where on the recap's foot a moment of the video stands: its mark on the seek bar just under it. */
const barAt = (frame: Frame, lengthMs: number, ms: number) => ({ x: lengthMs > 0 ? (frame.w * Math.min(ms, lengthMs)) / lengthMs : frame.w / 2, y: frame.h + 4 });
/** Confetti from each card's mark on the seek bar, or from the bar's middle when none was added. */
const fromMarks = ({ faces, frame, lengthMs }: SheetProps): Origin[] => (faces.length > 0 ? faces.map((f) => ({ ...barAt(frame, lengthMs, f.card.startMs), spread: 0.9 })) : [{ x: frame.w / 2, y: frame.h, spread: 1.6 }]);

/** The card's words with its reading over them, when it has one that isn't the words themselves. */
function Words({ face }: { face: RecapFace }) {
  const { words } = face.card;
  const reading = face.reading !== "" && face.reading !== words ? face.reading : "";
  return (
    <span lang={langOf(words)}>
      {reading ? (
        <ruby>
          {words}
          <rt>{reading}</rt>
        </ruby>
      ) : (
        words
      )}
    </span>
  );
}

/** A watch session's day as the account's days say it, and its hours on the clock: "Yesterday 15:00–15:15". */
function whenWords(session: WatchSession, today: Day): string {
  const days = daysBetween(session.day, today);
  const day = days <= 0 ? "Today" : days === 1 ? "Yesterday" : dayWords(session.day);
  return `${day} ${hourWords(session.startedAt)}–${hourWords(session.endedAt)}`;
}

/** The facts beside the headline: the words of the decks heard in it, which of its channel's videos it is. Each left out when it isn't known. */
function Facts({ recap, heard }: { recap: VideoRecap; heard: number | null }) {
  const parts: ReactNode[] = [];
  if (heard !== null) parts.push(`${count(heard, "word", "words")} in your decks heard`);
  if (recap.channel)
    parts.push(
      <>
        {ordinalWords(recap.channel.nth)} video from <span lang={langOf(recap.channel.name)}>{recap.channel.name}</span>
      </>,
    );
  if (parts.length === 0) return null;
  return (
    <div className="recap-ss-facts">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <i className="recap-sep">·</i> : null}
          {part}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * The words fly up out of their marks on the seek bar to where they're laid out, one after another (each chip marked
 * `data-fly` with its card's moment, in ms); nothing moves for a viewer who asked for less motion.
 */
function useFly(root: RefObject<HTMLElement | null>, { frame, lengthMs }: SheetProps) {
  useLayoutEffect(() => {
    const el = root.current;
    const stage = el?.closest<HTMLElement>(".recap-stage");
    if (!el || !stage || still()) return;
    const at = stage.getBoundingClientRect();
    const scale = stage.offsetWidth > 0 ? at.width / stage.offsetWidth : 1;
    el.querySelectorAll<HTMLElement>("[data-fly]").forEach((chip, i) => {
      const r = chip.getBoundingClientRect();
      const end = { x: (r.left - at.left + r.width / 2) / scale, y: (r.top - at.top + r.height / 2) / scale };
      const from = barAt(frame, lengthMs, Number(chip.dataset.fly));
      chip.style.transition = "none";
      chip.style.transform = `translate(${from.x - end.x}px, ${from.y - end.y}px) scale(0.15)`;
      chip.style.opacity = "0";
      chip.getBoundingClientRect();
      const delay = FLY.start + i * FLY.step;
      chip.style.transition = `transform 0.75s cubic-bezier(0.2, 1.25, 0.35, 1) ${delay}s, opacity 0.2s ${delay}s`;
      chip.style.transform = "";
      chip.style.opacity = "";
    });
    // Once, as the recap comes in: a resize afterwards moves nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Where a moment stands along the video, as a share of its length (%). */
const shareOn = (lengthMs: number) => (ms: number) => (lengthMs > 0 ? Math.min(100, (ms / lengthMs) * 100) : 0);
/** Whether a session's start is drawn as a session break: every one after the first, but one at the very start of the video. */
const breaks = (i: number, at: number) => i > 0 && at >= BREAK_FROM;

/**
 * Each session as the part of the video it ran over, on a track as long as the video; where one starts after another,
 * a session break: a tick in the picture's ink taller than the bar, edged in its dark so it reads on any color under it.
 */
function SessionBar({ sessions, lengthMs }: { sessions: readonly WatchSession[]; lengthMs: number }) {
  const share = shareOn(lengthMs);
  return (
    <div className="recap-ss-bar">
      {sessions.map((s, i) => (
        <i key={s.startedAt} className={`is-s${(i % 3) + 1}`} style={{ left: `${share(s.fromMs)}%`, width: `${Math.max(0.6, share(s.toMs) - share(s.fromMs))}%`, "--d": `${0.25 + i * 0.25}s` } as CSSProperties} />
      ))}
      {sessions.map((s, i) => (breaks(i, share(s.fromMs)) ? <b key={s.startedAt} className="recap-ss-break" style={{ left: `${share(s.fromMs)}%`, "--d": `${0.25 + i * 0.25}s` } as CSSProperties} /> : null))}
    </div>
  );
}

/**
 * The words over a strip of the video split into its watch sessions, each word over the moment it came from, each
 * session named under it; under the strip, what's next while the picture has the room.
 */
function Sheet(props: SheetProps) {
  const { recap, faces, heard, lengthMs, frame, onGo, onClose, onBurst } = props;
  const sheet = useRef<HTMLDivElement>(null);
  useFly(sheet, props);
  useLayoutEffect(() => {
    onBurst({ origins: fromMarks(props), delayMs: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const share = shareOn(lengthMs);
  return (
    <div ref={sheet} className="recap-sheet recap-glass">
      <div className="recap-ss-head">
        <b>{headline(recap)}</b>
        <Facts recap={recap} heard={heard} />
        <Button className="btn-icon recap-x" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      <div className="recap-ss-track">
        {shown(faces).map((face, i) => (
          <Fragment key={face.card.cardId}>
            <span className="recap-ss-chip" style={{ left: `${share(face.card.startMs)}%` }}>
              <Button className="recap-hchip recap-glass" data-fly={face.card.startMs} onClick={() => onGo(face.card.startMs / 1000)}>
                <Words face={face} />
              </Button>
            </span>
            <span className="recap-ss-stem" style={{ left: `${share(face.card.startMs)}%`, "--d": `${0.85 + i * 0.1}s` } as CSSProperties} />
          </Fragment>
        ))}
        <SessionBar sessions={recap.sessions} lengthMs={lengthMs} />
        <div className="recap-ss-labels">
          {recap.sessions.map((s, i) => (
            <span key={s.startedAt} className={breaks(i, share(s.fromMs)) ? "is-after-break" : undefined} style={{ left: `${share(s.fromMs)}%`, width: `${Math.max(0, share(s.toMs) - share(s.fromMs))}%`, "--d": `${0.2 + i * 0.25}s` } as CSSProperties}>
              {whenWords(s, recap.today)}
            </span>
          ))}
        </div>
      </div>
      {frame.h >= NEXT.room ? <NextRow continuing={recap.continuing} saved={recap.saved.slice(0, NEXT.saved)} downloaded={props.downloaded} /> : null}
    </div>
  );
}

/** What's next: the top of Continue watching and of Saved for later, each a link to it; a shelf with nothing in it left out. */
function NextRow({ continuing, saved, downloaded }: { continuing: readonly ContinueVideo[]; saved: readonly SavedVideo[]; downloaded: ReadonlySet<string> }) {
  if (continuing.length === 0 && saved.length === 0) return null;
  return (
    <div className="recap-nxrow">
      {continuing.length > 0 ? (
        <div className="recap-nxg">
          <span className="recap-nx-title">Continue watching</span>
          <div className="recap-nx-pair">
            {continuing.map((v) => (
              <NextVideo key={v.videoId} videoId={v.videoId} title={v.title} channel={v.channel} lengthMs={v.lengthMs} progress={v.lengthMs > 0 ? v.stoppedAtMs / v.lengthMs : null} downloaded={downloaded.has(v.videoId)} />
            ))}
          </div>
        </div>
      ) : null}
      {saved.length > 0 ? (
        <div className="recap-nxg">
          <span className="recap-nx-title">Saved for later</span>
          <div className="recap-nx-pair">
            {saved.map((v) => (
              <NextVideo key={v.videoId} videoId={v.videoId} title={v.title} channel={v.channel} lengthMs={v.lengthMs ?? 0} progress={null} downloaded={downloaded.has(v.videoId)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NextVideo({ videoId, title, channel, lengthMs, progress, downloaded }: { videoId: string; title: string; channel: string; lengthMs: number; progress: number | null; downloaded: boolean }) {
  return (
    <a className="recap-nx" href={youtubeUrl({ videoId, seconds: null })}>
      <span className="recap-nx-th">
        <img src={thumbnailAt(videoId)} alt="" />
        {downloaded ? <DownloadedMark /> : null}
        {lengthMs > 0 ? <span className="recap-nx-len">{clock(lengthMs / 1000)}</span> : null}
        {progress !== null ? (
          <span className="recap-nx-pb">
            <i style={{ width: `${Math.min(100, progress * 100).toFixed(1)}%` }} />
          </span>
        ) : null}
      </span>
      <span className="recap-nx-text">
        <b lang={langOf(title)}>{title}</b>
        <small lang={langOf(channel)}>{channel}</small>
      </span>
    </a>
  );
}

/** Confetti thrown up from the burst's places a moment after the recap comes in, gone in a few seconds; drawn on a canvas under the recap. */
function Confetti({ frame, burst }: { frame: Frame; burst: Burst | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const c = el?.getContext("2d");
    if (!el || !c || !burst || burst.origins.length === 0) return;
    let raf = 0;
    const timer = setTimeout(() => {
      const style = getComputedStyle(el);
      const colours = CONFETTI_TOKENS.map((token) => style.getPropertyValue(token).trim()).filter((colour) => colour !== "");
      const pieces = Array.from({ length: CONFETTI.pieces }, (_, i) => {
        const o = burst.origins[i % burst.origins.length] ?? { x: el.width / 2, y: el.height, spread: 1.5 };
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * o.spread;
        const speed = 6 + Math.random() * 9;
        return { x: o.x, y: o.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, colour: colours[i % colours.length] ?? "" };
      });
      const began = performance.now();
      const step = (now: number) => {
        const age = now - began;
        c.clearRect(0, 0, el.width, el.height);
        c.globalAlpha = Math.max(0, 1 - age / CONFETTI.lastsMs);
        for (const p of pieces) {
          p.vy += 0.3;
          p.vx *= 0.99;
          p.x += p.vx;
          p.y += p.vy;
          p.r += p.vr;
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.r);
          c.fillStyle = p.colour;
          c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          c.restore();
        }
        if (age < CONFETTI.lastsMs) raf = requestAnimationFrame(step);
        else c.clearRect(0, 0, el.width, el.height);
      };
      raf = requestAnimationFrame(step);
    }, burst.delayMs);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [burst]);
  return <canvas ref={canvas} className="recap-confetti" width={Math.round(frame.w)} height={Math.round(frame.h)} aria-hidden="true" />;
}
