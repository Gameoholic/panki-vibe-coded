import "../setup";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { beatsOf, createCaptions, cuesOf, lineAt, timeAfter, timeOf, transcriptOf, type Beat, type Line as CaptionLine, type Parts } from "../capture/captions";
import { createListening } from "../capture/listening";
import { held, type Pointed } from "../capture/look";
import { CLIP_MAX_SECONDS, RecordError, recordStretch } from "../capture/record";
import { createReplay } from "../capture/replay";
import { sentenceAround, takeSelection, type Taken } from "../capture/selection";
import { pageSource } from "../capture/source";
import { spanOver, type Span, type Token } from "../capture/words";
import type { Found } from "../dictionary/found";
import type { Forced } from "../dictionary/split";
import { useWords } from "../dictionary/useWords";
import { youtubeMetaValue, youtubeUrl } from "@panki/contracts";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { Dropdown } from "@web/components/Dropdown";
import { Form } from "@web/components/Form";
import { TextField } from "@web/components/TextField";
import { Trigger, askFix, askForget, askLine, askOpenPanki, askOptions, askPrefs, askSubtitles, askVideoCards } from "../messages";
import { SUBTITLE_BOUNDS, SUBTITLE_REF_HEIGHT, subtitleVars, withinBound, type SubtitleStyle, type TranscribeMode, type VideoCard } from "@panki/contracts";
import { SubtitleMenu } from "../ui/SubtitleMenu";
import type { Cut } from "../roles";
import { DEFAULT_SOURCE, SUBTITLE_SOURCES, SUBTITLE_SOURCE_IDS, type SubtitleSource } from "../subtitles";
import { createLineSource } from "../transcribe/lineSource";
import { createTranscriber } from "../transcribe/transcriber";
import { Line, type LineLook } from "../ui/Line";
import { makePlace, mount } from "../ui/mount";
import { Notice, Panel, type Capture, type Chars as SentenceChars, type ClipOffer } from "../ui/Panel";
import { SeekMark, type ClipMark } from "../ui/SeekMark";
import { Stamp } from "../ui/Stamp";
import { TranscribeMenu, type Seconds } from "../ui/TranscribeMenu";
import type { ClipEnd, MoveBy } from "../ui/Trim";

/**
 * Panki on a video page. What the video's captions say stands under the player as words to press; a press, the
 * menu or the toolbar button opens the capture drawer in the column beside the player, where the card is looked over, its
 * clip's two ends are put where they belong and heard, and the card is added with the clip recorded off the player.
 * Everything here reads what the page already shows: nothing is asked of the site, and nothing of the site's own
 * scripts is called. The few names of the page's own that are relied on (where its player, its captions, the room
 * under the player and the column beside it are) are together here and in `capture/captions.ts`; when the site
 * changes them, this is where to look.
 */
const PLAYER = "#movie_player";
const CAPTION_AREA = ".ytp-caption-window-container";
const UNDER_PLAYER = "ytd-watch-flexy #below";
/** The column beside the player, where the site lists what to watch next. */
const BESIDE_PLAYER = "ytd-watch-flexy #secondary";
/** That column is used only while it's there and at least this wide; a narrow window has none, and the drawer goes under the line instead. */
const BESIDE_MIN = 300;
/** The player's own seek bar: the whole video from its left end to its right. The clip is marked on it. */
const SEEK_BAR = "#movie_player .ytp-progress-bar";
/**
 * The links to the channel the video is on, under the player; the one with words is its name. The channel's picture
 * is a link to it too, and comes first, with no words: the first link found was taken, its words were none, and every
 * card lost its channel until the first with words was taken instead (2026-10-18).
 */
const CHANNEL_NAME = "ytd-watch-flexy #owner ytd-channel-name a[href], ytd-watch-flexy ytd-video-owner-renderer a[href]";
/** The channel's picture beside its name, under the player: Panki keeps it with the card's video (`askPictures`). */
const CHANNEL_PICTURE = "ytd-watch-flexy #owner #avatar img, ytd-watch-flexy ytd-video-owner-renderer #avatar img";

/** A clip starts a little before its words and ends a little after: a caption is drawn a touch late and taken down a touch early. */
const LEAD = 0.35;
const TAIL = 0.25;
/** A clip is never shorter than this, however its ends are pulled. */
const CLIP_MIN = 0.3;
/** After the end is moved, this much of the clip is played up to it, so the cut is heard. (After the start is moved the clip plays from there on: stopping a second in was tried first, and read as the video getting stuck.) */
const CUT = 0.9;
/** A clip taken off the video itself, with no words to go by, starts as this many seconds up to where the video stands: what was just heard. */
const STRETCH = 5;
/** How long a line still being written is waited for before its clip is cut where the video stands. */
const LINE_WAIT_MS = 15_000;

/**
 * The two rows under the player. The player's own rows are short, made for the middle of a video; Panki's have the
 * whole width, so each holds several of the player's, one after another. How many is worked out from the room there
 * is and from the longest row the player has written, so a row of Panki's never runs out of room part-way.
 */
const ROWS = 2;
/** A row of the player's is taken to be at least this long, in full-width characters, until a longer one is seen. */
const PLAYER_ROW = 21;
/** How much of the measured room is counted on: each word is drawn in a box a hair apart from the next, which the count of characters doesn't know. */
const ROOM_USED = 0.78;

/** Where the line stands: under the player. */
const UNDER = "display: block; margin: 12px 0 0;";
/**
 * Where the drawer stands: at the top of the column beside the player; under the line, no wider than a drawer, when
 * there's no such column; over a player that fills the screen. The room between it and its neighbours is handed to
 * the drawer rather than set here as a margin: it's part of what the drawer unfolds and folds away, so the page
 * doesn't jump by that much when the drawer is gone.
 */
const BESIDE = "display: block; --panki-gap-below: 16px;";
const BELOW = "display: block; --panki-gap-above: 12px; max-width: 460px;";
const FLOATING = "position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;";
/**
 * Where the clip's mark stands: laid over the player's seek bar, edge to edge. Over the bar's own colours and under
 * the dot that's dragged along it (the site's own layers, as they were when this was written). It lets every press
 * through but the ones on what it draws, so the bar seeks as it always did.
 */
const ON_SEEK_BAR = "display: block; position: absolute; inset: 0; z-index: 42; pointer-events: none;";
/**
 * Where the transcript stands over the video: across the player, a little up from its bottom edge, under the player's
 * own controls; only the words themselves take a press. Shown in place of the site's captions, which are faded while
 * it's there and still read for what they say.
 */
// Where it sits and how it looks are the viewer's subtitle style, as CSS variables on the host (`subtitleVars`); the line itself is laid out in `.over-ground`.
const OVER_VIDEO = "display: block; position: absolute; left: 0; right: 0; bottom: var(--sub-bottom, 9%); z-index: 40; pointer-events: none;";
/** How often the transcriber looks at the viewer's player, and the line at the video's time. */
const FOLLOW_MS = 250;

/** One value a screen can follow. */
function cell<T>(value: T) {
  const followers = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (next === value) return;
      value = next;
      for (const follower of followers) follower();
    },
    subscribe(follower: () => void) {
      followers.add(follower);
      return () => {
        followers.delete(follower);
      };
    },
  };
}

const siteTheme = () => (document.documentElement.hasAttribute("dark") ? "dark" : "light");
const videoId = () => new URL(location.href).searchParams.get("v");

/** How wide a text is drawn, in full-width characters: a kana or a kanji is one, a Latin letter or a digit a bit over half. */
function widthOf(text: string): number {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.6;
  return width;
}

const captions = createCaptions();
const replay = createReplay();
/** The line's place, with the screen itself in it. */
const strip = mount(siteTheme());
strip.host.style.cssText = UNDER;
/** The drawer's place: the same screen draws its panel in here, wherever on the page this is put. */
const drawer = makePlace(siteTheme());
/** The place of the clip's mark, on the player's seek bar. */
const seek = makePlace(siteTheme());
seek.host.style.cssText = ON_SEEK_BAR;
/** The transcript's place over the video. */
const over = makePlace(siteTheme());
over.host.style.cssText = OVER_VIDEO;
over.ground.classList.add("over-ground");
/** Transcribing the video, following the viewer; and what the line under the player reads: the transcript, or the site's captions. */
const transcriber = createTranscriber();
const lines = createLineSource(captions, transcriber, () => video?.currentTime ?? null);
/** Whether the transcript is over the video right now (the site's own captions give way to it). */
const showingOver = cell(false);
/** The account's cards taken from this video, each its clip's stretch in ms and its words: marked on the seek bar. */
const carded = cell<readonly VideoCard[]>([]);
/** Whether the pointer is on the player's seek bar, or on what Panki draws over it: the cards' words rise. */
const onBar = cell(false);
/** How far above the seek bar the pointer counts as on it, as the marks last said (`SeekMark` → `REACH`). */
const reachPx = cell(0);

/**
 * Whether the pointer is on the seek bar: read against where the bar is drawn, not from the bar's own events, so the
 * pointer counts as on it as far up as the cards' words stand (`reachPx`), coming in as much as going out, with
 * nothing laid over the picture to take its presses (the owner, 2026-10-19: "right now I basically have to hug the
 * seekbar"). A bar the player has hidden (it hides its controls when the pointer rests) is never on.
 */
function follow(x: number, y: number) {
  const box = document.querySelector(SEEK_BAR)?.getBoundingClientRect();
  const hidden = document.querySelector(PLAYER)?.classList.contains("ytp-autohide") ?? false;
  onBar.set(!!box && box.width > 0 && !hidden && x >= box.left && x <= box.right && y <= box.bottom + 6 && y >= box.top - reachPx.get());
}

/**
 * Where a card's own words are said, in seconds: the first of the transcript's words in the card's stretch from where
 * they're written out together, as the card has them or, kept in their dictionary form, their stem (the kana that end
 * them taken off: 行く is found in 行って by 行); null when the transcript doesn't have them there (the site's
 * captions say nothing of when each word is said).
 */
function wordMoment(card: VideoCard): number | null {
  const transcript = transcriber.state().transcript;
  const words = card.words.trim();
  if (!transcript || !words) return null;
  const inside = transcript.words.filter((w) => w.startMs >= card.startMs - 500 && w.startMs <= card.endMs + 500);
  let text = "";
  const startOf: number[] = [];
  for (const w of inside) {
    for (let i = 0; i < w.text.length; i++) startOf.push(w.startMs);
    text += w.text;
  }
  for (const probe of [words, words.replace(/[぀-ゟ]+$/, "")]) {
    const at = probe ? text.indexOf(probe) : -1;
    const ms = at >= 0 ? startOf[at] : undefined;
    if (ms !== undefined) return ms / 1000;
  }
  return null;
}

/** Where pressing a card's words takes the video, in seconds: its sentence, or its own words when it's set to and they're found (else its sentence); null when pressing them does nothing. */
function cardTarget(card: VideoCard): number | null {
  const click = transcriber.state().prefs.seek.cards.click;
  if (click === "none") return null;
  return (click === "word" ? wordMoment(card) : null) ?? card.startMs / 1000;
}

function goToCard(card: VideoCard) {
  const at = cardTarget(card);
  if (video && at !== null) video.currentTime = at;
}

/**
 * The player's own preview over its bar (the frame and the time it would go to) shown, while the pointer is on a
 * card's words, for where pressing them goes rather than for where the pointer is (the owner, 2026-10-19: "display
 * the frame we will go to"). The pointer's own moves over the words are kept from the bar (`SeekMark` → `onPeek`), and
 * the bar is told of a move at that moment instead: the one place Panki stirs the player's own script, with nothing
 * but a pointer's move, as the pointer itself would make. Panki's own following of the pointer leaves made-up moves
 * alone (`isTrusted`).
 */
function peekCard(card: VideoCard) {
  const at = cardTarget(card);
  const player = video;
  const bar = document.querySelector(SEEK_BAR);
  if (at === null || !player || !bar || !Number.isFinite(player.duration) || player.duration <= 0) return;
  const box = bar.getBoundingClientRect();
  if (box.width === 0) return;
  const init = { bubbles: true, cancelable: true, composed: true, clientX: box.left + (at / player.duration) * box.width, clientY: box.top + box.height / 2 };
  bar.dispatchEvent(new PointerEvent("pointermove", init));
  bar.dispatchEvent(new MouseEvent("mousemove", init));
}
let pointerAt: { x: number; y: number } | null = null;
let following = false;
// Looked at once a frame at most, however fast the pointer moves.
document.addEventListener(
  "pointermove",
  (e) => {
    // A move Panki made up for the player's preview (`peekCard`) isn't where the pointer is.
    if (!e.isTrusted) return;
    pointerAt = { x: e.clientX, y: e.clientY };
    if (following) return;
    following = true;
    requestAnimationFrame(() => {
      following = false;
      if (pointerAt) follow(pointerAt.x, pointerAt.y);
    });
  },
  { passive: true },
);
document.documentElement.addEventListener("pointerleave", () => {
  pointerAt = null;
  onBar.set(false);
});
// Snapping to cards (a press on the bar let go near a card's mark landing on the card's moment) lived here for a day;
// the owner had it taken out on 2026-10-19, the cards' words doing the same job.

/** What reaches the screen from outside it: the menu or the toolbar button asked for a capture; the page moved on to another video. */
const asked = new EventTarget();
type Added = { found: Found; pointed: Pointed };
type Split = { lineId: number; offset: number; length: number };
/** What the popup asks of the screen: a word added, or Panki's line split differently. The screen sets these while it's there. */
const fromPopup: { add: ((added: Added) => void) | null; split: ((split: Split) => void) | null } = { add: null, split: null };
/** Pointing at words: on the line under the player, on the site's own captions, and anywhere else on the page. */
const listening = createListening({
  whereAt: (target) => (target instanceof Element && target.closest(CAPTION_AREA) ? { of: "captions" } : { of: "page" }),
  onAdd: (found, pointed) => fromPopup.add?.({ found, pointed }),
  splitFor: (pointed) => {
    const where = pointed.where;
    return where.of === "line" ? { length: where.length, onSplit: (length) => fromPopup.split?.({ lineId: where.lineId, offset: where.offset, length }) } : null;
  },
  theme: () => siteTheme(),
  parent: () => document.fullscreenElement ?? document.documentElement,
});
/** Whether the line has its place under the player. Without one (a page with no room there, a player filling the screen) only the drawer shows, floating, and only while it has something to show. */
const inPlace = cell(false);
const showing = cell(false);
/** Whether the player's video stands still: a line under it is fixed with the pencil only then. */
const stillNow = cell(true);
const noteStill = (e: Event) => {
  if (e.target instanceof HTMLVideoElement) stillNow.set(e.target.paused);
};

/** The player's video, as last found. */
let video: HTMLVideoElement | null = null;
let watching: string | null = null;
/** Whether the video was playing when the drawer opened: closing the drawer puts that back. */
let wasPlaying = false;
/** The line the video is to stop after: the sentence taken was still being written when it was taken. */
let pauseAfter: number | null = null;
/**
 * The open clip's end, where the video stops by itself when it's played up to it, once for each clip: played on from
 * there, it goes on past (the owner, 2026-10-15: "pause when it reaches… the end timestamp. But if I continue or try
 * again it will let me, not block me"). Null while no clip with an end is open.
 */
let stopAt: number | null = null;
/** The video has stopped at this clip's end already, by `watchEnd` or at the end of a sentence it was let finish. */
let stopSpent = false;
/** Where the video was a moment ago. Null after a jump: put past the end by hand isn't played up to it. */
let seenAt: number | null = null;
/** How often the video is looked at while a clip is open, in ms: often enough to stop within a word of the end. */
const STOP_WATCH_MS = 30;
/** The longest row this video's player has written. It only grows, so the rows under the player are never re-cut mid-video. */
let longestRow = PLAYER_ROW;

captions.onClose((line) => {
  longestRow = Math.max(longestRow, Math.ceil(widthOf(line.text)));
  if (pauseAfter !== line.id) return;
  pauseAfter = null;
  video?.pause();
  // That was its stop at the end: played on from here, it doesn't stop again a moment later at the clip's.
  stopSpent = true;
});

/** Asks Panki again where this video's cards were taken from. An answer for a video no longer playing is let go; one that fails leaves the marks as they were. */
async function readCarded() {
  const id = watching;
  if (!id) return;
  const answer = await askVideoCards(id);
  if (answer.ok && watching === id) carded.set(answer.cards);
}

/** Puts Panki's two places where they belong right now: the line under the player; the drawer beside it, or under the line, or floating over a player that fills the screen. */
let laidOut = "";
function place() {
  const theme = siteTheme();
  strip.host.dataset.theme = theme;
  drawer.host.dataset.theme = theme;
  seek.host.dataset.theme = theme;
  const full = document.fullscreenElement;
  const under = full || !video ? null : document.querySelector(UNDER_PLAYER);
  inPlace.set(under !== null);
  // Each is moved only when it isn't there already: moving it takes the cursor out of whatever is being typed in it.
  if (!under) strip.host.remove();
  else if (strip.host.parentElement !== under) under.prepend(strip.host);
  // Panki is on the player's seek bar while there's a clip to mark (a drawer is open), a transcript's reach, a run's work or a card to mark; the player keeps its bar when it fills the screen.
  const tx = transcriber.state();
  const marked = showing.get() || (tx.transcript?.covered.length ?? 0) > 0 || tx.working !== null || carded.get().length > 0;
  const bar = marked && video ? document.querySelector(SEEK_BAR) : null;
  if (!bar) seek.host.remove();
  else if (seek.host.parentElement !== bar) bar.append(seek.host);
  // The player hides its controls when the pointer rests: the cards' words go with them, and can't be pressed unseen.
  if (document.querySelector(PLAYER)?.classList.contains("ytp-autohide")) onBar.set(false);
  // The transcript over the video, inside the player (which keeps it when it fills the screen); the site's own captions fade while it's there.
  const player = video ? document.querySelector(PLAYER) : null;
  const overThere = showingOver.get() ? player : null;
  if (!overThere) over.host.remove();
  else if (over.host.parentElement !== overThere) overThere.append(over.host);
  // The words scale with the player, so they take the same share of the picture on the page and on the full screen.
  if (overThere instanceof HTMLElement && overThere.clientHeight > 0) over.host.style.setProperty("--sub-scale", String(overThere.clientHeight / SUBTITLE_REF_HEIGHT));
  const area = player?.querySelector(CAPTION_AREA);
  if (area instanceof HTMLElement) area.style.opacity = overThere ? "0" : "";

  if (!showing.get()) {
    drawer.host.remove();
    return;
  }
  const column = full || !video ? null : document.querySelector(BESIDE_PLAYER);
  const beside = column instanceof HTMLElement && column.offsetWidth >= BESIDE_MIN ? column : null;
  if (beside) {
    if (drawer.host.parentElement !== beside) beside.prepend(drawer.host);
  } else if (under) {
    if (drawer.host.previousElementSibling !== strip.host) strip.host.after(drawer.host);
  } else {
    const over = full ?? document.documentElement;
    if (drawer.host.parentElement !== over) over.append(drawer.host);
  }
  const layout = beside ? BESIDE : under ? BELOW : FLOATING;
  if (layout !== laidOut) {
    laidOut = layout;
    drawer.host.style.cssText = layout;
  }
}

/** Looks at the page as it is now: which video, where its captions are drawn, where Panki goes. Cheap, and asked for every second, because the site redraws itself without ever loading a new page. */
function look() {
  const player = document.querySelector(PLAYER);
  const found = player?.querySelector("video") ?? null;
  const next = found instanceof HTMLVideoElement ? found : null;
  // Whether it stands still is heard from the video itself, so the pencil wakes the moment it's paused.
  if (next !== video) {
    for (const type of ["play", "playing", "pause", "ended"] as const) {
      video?.removeEventListener(type, noteStill);
      next?.addEventListener(type, noteStill);
    }
    stillNow.set(next?.paused ?? true);
  }
  video = next;
  const now = videoId();
  if (now !== watching) {
    watching = now;
    longestRow = PLAYER_ROW;
    captions.reset();
    transcriber.video(now);
    carded.set([]);
    void readCarded();
    asked.dispatchEvent(new Event("moved"));
  }
  captions.attach(video, player?.querySelector(CAPTION_AREA) ?? null);
  place();
}

/**
 * What's under the player right now: the stretch of talk being written (or the one just over), cut into rows of
 * `perRow` of the player's own rows each, the last `ROWS` of them. A line's row is its place in its stretch of talk,
 * which never changes, so words stay where they were put: a row fills from the left, and when it's full it moves up
 * whole and the next begins. Nothing later than the line being written is shown, so going back over a video doesn't
 * show what's still to come.
 */
function rowsUnder(lines: readonly CaptionLine[], current: CaptionLine, perRow: number): { key: string; lines: CaptionLine[] }[] {
  const rowOf = (line: CaptionLine) => Math.floor(line.seq / perRow);
  const lowest = rowOf(current);
  const talk = lines.filter((line) => line.run === current.run && line.seq <= current.seq && rowOf(line) > lowest - ROWS).sort((a, b) => a.seq - b.seq);
  return Array.from({ length: ROWS }, (_, i) => lowest - ROWS + 1 + i)
    .map((row) => ({ key: `${current.run}:${row}`, lines: talk.filter((line) => rowOf(line) === row) }))
    .filter((row) => row.lines.length > 0);
}

/** A stretch of characters in captions read as one text: the words picked. */
type Chars = { from: number; to: number };

/** The same stretch of characters in another reading of some of the same lines; null when a line it touches isn't in that one. */
function reread(chars: Chars, from: Parts, to: Parts): Chars | null {
  const first = lineAt(from, chars.from);
  const last = lineAt(from, Math.max(chars.from, chars.to - 1));
  const firstThere = first && to.find((part) => part.line.id === first.line.id);
  const lastThere = last && to.find((part) => part.line.id === last.line.id);
  return first && last && firstThere && lastThere ? { from: firstThere.at + first.offset, to: lastThere.at + last.offset + 1 } : null;
}

/** When the words from a place in such a text on appeared; null when that isn't known yet. */
function whenAfter(parts: Parts, at: number): number | null {
  const there = lineAt(parts, at);
  return there ? timeAfter(there.line, there.offset) : null;
}

/**
 * What is taken off the captions: the lines that were under the player, read as one text, and the sentence in it
 * around the words picked (or, with no word picked, the sentence being spoken: the last one). The player breaks its
 * rows wherever its screen is full, so a sentence is found by its full stops, across them. Worked out afresh every
 * time from the lines as they are now: a line still being written grows, and its end isn't known until it's over.
 */
function sentenceOf(lineIds: readonly number[], chars: Chars | null) {
  const taken = lineIds.flatMap((id) => lines.byId(id) ?? []);
  const last = taken.at(-1);
  if (!last) return null;
  const { text, parts } = transcriptOf(taken);
  const found = chars ? sentenceAround(text, chars.from, chars.to) : sentenceAround(text, Math.max(0, text.length - 1), text.length);
  const stop = found.at + found.sentence.length;
  const first = lineAt(parts, found.at);
  if (!first) return null;
  // A sentence that runs to the end of what's shown is over when the last line is; one that ends sooner was over the
  // moment the words after it appeared. A last line still being written out (for the first time, or again after the
  // video jumped away from it part-way) isn't over yet, whatever end it was given then.
  const toTheEnd = stop >= text.length;
  const lastOver = lines.unfinished() === last.id ? null : last.end;
  return {
    found,
    text,
    parts,
    start: timeOf(first.line, first.offset),
    end: toTheEnd ? lastOver : (whenAfter(parts, stop) ?? lastOver),
    /** The line to let finish before the video stops: the sentence is still being written. */
    waitsFor: toTheEnd && lastOver === null ? last.id : null,
  };
}

/**
 * Where a clip's two ends were put by hand, in the video's seconds. Until one is, both are null and the clip is the
 * sentence around the picked words, as it was said. The first time either is moved both are written down, and from
 * then on the clip is that stretch of the video whatever is picked inside it.
 */
type Trim = { start: number | null; end: number | null };
const AS_SAID: Trim = { start: null, end: null };

/** Where a clip that begins with these words begins, and where one that ends with them ends (not known while they're the last of a line still being written). */
const beginsAt = (beat: Beat) => Math.max(0, beat.start - LEAD);
const endsAt = (beat: Beat) => (beat.end === null ? null : beat.end + TAIL);

/**
 * A clip being made: its stretch of the video (`end` not known while its last words are being said), the words it
 * covers (`sentence`, from `from` to `to` in the text `parts` reads), the stretches of that text with their times,
 * and where the picked word is in it. `base` is the lines a pick is kept in.
 */
type Clip = { parts: Parts; base: Parts; beats: readonly Beat[]; pick: Chars | null; start: number; end: number | null; sentence: string; from: number; to: number };

/** The stretch of words whose moment is nearest a time; null when none has one. */
function nearest(beats: readonly Beat[], time: number, moment: (beat: Beat) => number | null): Beat | null {
  let best: Beat | null = null;
  let gap = Infinity;
  for (const beat of beats) {
    const at = moment(beat);
    if (at === null || Math.abs(at - time) >= gap) continue;
    gap = Math.abs(at - time);
    best = beat;
  }
  return best;
}

/**
 * The clip being made: its stretch of the video, and the words it covers. As it was said, that is the sentence and
 * the sentence's own time. Once its ends have been put somewhere by hand, the time is what was set, and the words
 * are the ones nearest to it: from the word that begins nearest the start to the word that ends nearest the end, so
 * the sentence on the card follows the clip a word at a time while an end can still sit a hair either side of one.
 *
 * An end can be put anywhere in the video, and the words follow as far as they're known: they're looked for in every
 * line that's kept and that the clip reaches into, before and after the ones that were taken. So a start pulled back
 * over what was said earlier takes those words in; an end pulled on past what's been heard gets its words once that
 * part has been played. `base` is the lines taken, which a pick is counted in; `pick` is the same pick counted in
 * the text here.
 */
function clipOf(lineIds: readonly number[], chars: Chars | null, trim: Trim): Clip | null {
  const said = sentenceOf(lineIds, chars);
  if (!said) return null;
  const { found } = said;
  const start = trim.start ?? Math.max(0, said.start - LEAD);
  const end = trim.end ?? (said.end === null ? null : said.end + TAIL);
  const taken = said.parts.map((part) => part.line);
  const first = taken[0];
  const last = taken.at(-1);
  const kept = trim.start !== null && trim.end !== null && first && last ? lines.snapshot() : [];
  const before = kept.filter((line) => first && line.start < first.start && (line.end ?? line.start) > start);
  const after = kept.filter((line) => last && end !== null && line.start > last.start && line.start < end);
  const { text, parts } = before.length + after.length > 0 ? transcriptOf([...before, ...taken, ...after]) : said;
  const beats = beatsOf(parts);
  const pick = chars ? reread(chars, said.parts, parts) : null;
  // The sentence as it was found, said in this text: the same place when no line was put before the ones taken.
  const sentenceAt = reread({ from: found.at, to: found.at + Math.max(1, found.sentence.length) }, said.parts, parts)?.from ?? found.at;
  let from = sentenceAt;
  let to = sentenceAt + found.sentence.length;
  if (trim.start !== null) from = nearest(beats, trim.start, beginsAt)?.from ?? from;
  if (trim.end !== null) to = nearest(beats, trim.end, endsAt)?.to ?? to;
  if (to <= from && end !== null) {
    // Both ends inside one stretch of words (a caption shown whole is one): the stretch most of the clip is in.
    const inIt = (beat: Beat) => Math.min(end, beat.end ?? beat.start) - Math.max(start, beat.start);
    const most = beats.reduce<Beat | null>((best, beat) => (best === null || inIt(beat) > inIt(best) ? beat : best), null);
    if (most) {
      from = most.from;
      to = most.to;
    }
  }
  const raw = text.slice(from, Math.max(from, to));
  const sentence = raw.trim();
  const at = from + (raw.length - raw.trimStart().length);
  return { parts, base: said.parts, beats, pick, start, end, sentence, from: at, to: at + sentence.length };
}

/**
 * A clip taken off the video itself, with no words picked: a stretch of time and nothing else. Words that were heard
 * inside it are its sentence all the same, so on a video with captions it comes with them; where there were none
 * (captions off, or missing just there) the sentence is empty and is typed by hand. The same shape as `clipOf` gives.
 */
function stretchOf(start: number, end: number): Clip {
  const reached = lines.snapshot().filter((line) => (line.end ?? line.start) > start && line.start < end);
  const { text, parts } = transcriptOf(reached);
  const beats = beatsOf(parts);
  const first = nearest(beats, start, beginsAt);
  const last = nearest(beats, end, endsAt);
  const raw = first && last && last.to > first.from ? text.slice(first.from, last.to) : "";
  const sentence = raw.trim();
  const at = (first?.from ?? 0) + (raw.length - raw.trimStart().length);
  return { parts, base: parts, beats, pick: null, start, end, sentence, from: at, to: at + sentence.length };
}

/** How far a clip's ends can be taken: anywhere in the video. One that doesn't say how long it is (a live one) is taken to run an hour past where it stands. */
function limitOf(player: HTMLVideoElement): { from: number; to: number } {
  return { from: 0, to: Number.isFinite(player.duration) && player.duration > 0 ? player.duration : player.currentTime + 3600 };
}

/** Where an end comes to rest: on the stop nearest to where it was put, of those it may be on; exactly where it was put, to the hundredth, when there are none. */
function restAt(to: number, lowest: number, highest: number, stops: readonly number[]): number {
  const open = stops.filter((stop) => stop >= lowest && stop <= highest);
  if (open.length === 0) return Math.round(Math.min(highest, Math.max(lowest, to)) * 100) / 100;
  return open.reduce((best, stop) => (Math.abs(stop - to) < Math.abs(best - to) ? stop : best));
}

/** Where a sentence came from: the video, and the second it began, as an address that opens there. */
function videoSource(start: number, end: number | null): Pick<Capture, "source" | "sourceLink" | "video"> {
  const id = videoId();
  if (!id) return pageSource();
  const url = youtubeUrl({ videoId: id, seconds: Math.floor(start) });
  const title = document.title
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s*-\s*YouTube$/, "")
    .trim();
  // Whose the video is, read off the page as it's shown: the channel's name and where it links; none when the site has moved it.
  const owner = [...document.querySelectorAll(CHANNEL_NAME)].find((a) => a instanceof HTMLAnchorElement && (a.textContent?.trim() ?? "") !== "");
  const name = owner?.textContent?.trim().slice(0, 100) ?? "";
  const link = owner instanceof HTMLAnchorElement && /^https?:\/\//i.test(owner.href) ? owner.href.slice(0, 2000) : "";
  const channel = name && link ? { name, url: link } : null;
  const picture = document.querySelector(CHANNEL_PICTURE);
  const avatar = picture instanceof HTMLImageElement && /^https:\/\//i.test(picture.src) ? picture.src.slice(0, 2000) : null;
  return {
    source: { url, title: title.slice(0, 300), startMs: Math.round(start * 1000), ...(end === null ? {} : { endMs: Math.round(end * 1000) }), ...(channel ? { channel } : {}) },
    // The field that takes the video's metadata gets all of it as one value: the link at the clip's start, the title, the channel.
    sourceLink: youtubeMetaValue({ link: { videoId: id, seconds: Math.floor(start) }, title, channel }),
    video: { id, avatar },
  };
}

/** A clip's two ends as they are right now. */
type Ends = { start: number; end: number | null };

/**
 * The stretch of the video a picked word was said in, as far as the captions tell: from when its first piece appeared
 * to when what follows its last did, with the same margin either side as a sentence gets. Captions written a word at
 * a time give about the word; a caption shown whole gives only its whole line, and the ends are then put by hand.
 * Null with no word picked.
 */
function wordStretch(clip: Clip): Ends | null {
  const pick = clip.pick;
  if (!pick) return null;
  const said = clip.beats.filter((beat) => beat.to > pick.from && beat.from < pick.to);
  const first = said[0];
  const last = said.at(-1);
  if (!first || !last) return null;
  const start = beginsAt(first);
  const end = endsAt(last);
  return { start, end: end === null ? null : Math.max(end, start + CLIP_MIN) };
}

/**
 * A word's stretch kept inside its sentence's clip: the word is cut out of the clip, so neither of its ends is ever
 * outside the clip's own (the owner, 2026-10-11: the word's bar runs from the clip's start to the clip's end). While
 * the clip's end isn't known yet, only its start holds the word back.
 */
function inside(word: Ends, clip: Ends): Ends {
  if (clip.end === null) return { start: Math.max(word.start, clip.start), end: word.end };
  const start = Math.min(Math.max(word.start, clip.start), Math.max(clip.start, clip.end - CLIP_MIN));
  const end = word.end === null ? null : Math.max(Math.min(word.end, clip.end), Math.min(clip.end, start + CLIP_MIN));
  return { start, end };
}

/** A clip is being recorded right now: its ends are what they were when that began, and can't be pulled about under it. */
let recording = false;

/** Records the clip as it stands when it's asked for. `read` gives its ends afresh each time: they may still be settling. */
async function recordClip(read: () => Ends | null, soundOnly: boolean, onProgress: (seconds: number, of: number | null) => void): Promise<Blob> {
  const player = video;
  if (!player) throw new RecordError("The video is gone.");
  replay.stop();
  // Still being said: it's let run to its end first (the video stops there by itself), so the clip has all of it.
  const giveUp = performance.now() + LINE_WAIT_MS;
  while (read()?.end === null && performance.now() < giveUp) await new Promise((resolve) => setTimeout(resolve, 100));
  pauseAfter = null;
  const clip = read();
  if (!clip) throw new RecordError("That line is gone.");
  const end = clip.end ?? player.currentTime;
  recording = true;
  try {
    return await recordStretch(player, { from: clip.start, until: (now) => now >= end, expectedEnd: end, soundOnly }, onProgress);
  } finally {
    recording = false;
  }
}

/** Stops the video at the open clip's end, the first time it's played up to it (`stopAt`). */
function watchEnd() {
  const player = video;
  if (!player || stopAt === null) return;
  const before = seenAt;
  const now = player.currentTime;
  seenAt = now;
  // Playing the clip in the drawer and recording it stop where they stop by themselves.
  if (stopSpent || recording || replay.mode() !== null || player.paused) return;
  if (before !== null && before < stopAt && now >= stopAt) {
    player.pause();
    stopSpent = true;
  }
}
// Media events don't bubble, but they're seen on the way down.
document.addEventListener(
  "seeking",
  (e) => {
    if (e.target === video) seenAt = null;
  },
  true,
);

/**
 * What the drawer is open on: the captions that were under the player, with the words picked in them and where the
 * clip's ends were put; a stretch of the video taken by itself, with no words to go by; or words selected on the page.
 * `turn` tells one capture from the next, and `moved` counts the times a capture went to another sentence of the same
 * lines. `wordTrim` is where the ends of the picked word's own sound were put by hand (as it was said, until they are),
 * and `wordTurn` counts the times another word was picked: its sound starts over from that word.
 */
type Taking = (
  | { of: "caption"; turn: number; lineIds: readonly number[]; chars: Chars | null; trim: Trim; moved: number; wordTrim: Trim; wordTurn: number }
  | { of: "stretch"; turn: number; trim: { start: number; end: number } }
  | { of: "selection"; turn: number; taken: Taken; chars: SentenceChars | null }
  | { of: "nothing" }
) & {
  /** Whether the drawer was shut when this was taken: then it unfolds as it comes; one that takes another's place is simply there. */
  fresh: boolean;
  /** The dictionary's word to start the drawer on: the one whose Add was pressed in the popup. */
  prefer?: Found | null;
};

/** The picked word as letters of the clip's sentence; null when it isn't in the sentence (the clip's ends were pulled away from it). */
function inSentence(clip: Clip): SentenceChars | null {
  if (!clip.pick) return null;
  const from = Math.max(0, clip.pick.from - clip.from);
  const to = Math.min(clip.sentence.length, clip.pick.to - clip.from);
  return to > from ? { from, to } : null;
}

/** The characters a run of words covers. */
function charsOf(tokens: readonly Token[], span: Span): Chars | null {
  const first = tokens[span[0]];
  const last = tokens[span[1]];
  return first && last ? { from: first.start, to: last.end } : null;
}

/** The selection as a pick in its sentence; a selection that is the whole sentence picks no word. */
function pickOf(taken: Taken): SentenceChars | null {
  const whole = taken.from <= 0 && taken.to >= taken.sentence.length;
  return whole || taken.to <= taken.from ? null : { from: taken.from, to: taken.to };
}

const sameIds = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * One row under the player: a stretch of the captions' text, as words to press. `at` is where the row begins in
 * everything under the player read as one text, which is how a pick is said (a sentence runs across rows); `chars` is
 * the pick, wherever it is, and this row lights the part of it that is its own.
 */
type RowProps = {
  text: string;
  at: number;
  chars: Chars | null;
  now: Chars | null;
  /** The stretches taken as one word by hand (from the popup), in the row's own letters. */
  forced: readonly Forced[];
  onTake: (chars: Chars) => void;
  /** Which caption line, and which letter of it, a letter of what's under the player is: what a word pointed at is kept as. */
  placeOf: (at: number) => { lineId: number; offset: number } | null;
  /** A word double-clicked, to be fixed: only a transcript's words can be. */
  onFix?: ((chars: Chars) => void) | null;
  /** The pencil at the row's end, to fix the whole row by hand (a transcript's rows under the player only); `editable` is whether it can be pressed now. */
  onEdit?: (() => void) | null;
  editable?: boolean;
};

function Row({ text, at, chars, now, forced, onTake, placeOf, onFix = null, onEdit = null, editable = false }: RowProps) {
  const tokens = useWords(text, forced);
  /** A word of the row as something pointed at: looked up from its first letter on, through the end of the row. */
  const pointedAt = (i: number, button: HTMLElement): Pointed | null => {
    const token = tokens[i];
    const place = token ? placeOf(at + token.start) : null;
    if (!token || !place) return null;
    return {
      id: `line:${place.lineId}:${place.offset}`,
      text: text.slice(token.start, token.start + 32),
      measure: () => button.getBoundingClientRect(),
      context: { text, at: token.start },
      where: { of: "line", lineId: place.lineId, offset: place.offset, length: token.end - token.start },
    };
  };
  const look: LineLook = {
    move(i, button, e) {
      if (e.pointerType !== "mouse" || !listening.settings().on) return;
      const pointed = i !== null && button ? pointedAt(i, button) : null;
      listening.pointedBy(() => pointed);
      if (!held(listening.settings().key, e)) listening.looker.release({ x: e.clientX, y: e.clientY });
      else listening.looker.point(pointed, { x: e.clientX, y: e.clientY });
    },
    press(i) {
      const view = listening.looker.view();
      if (!view) return false;
      const token = tokens[i];
      const place = token ? placeOf(at + token.start) : null;
      // A press on the word whose popup is open keeps the popup open; anywhere else it's a pick, and the popup goes.
      if (!view.locked && place && view.pointed.id === `line:${place.lineId}:${place.offset}`) {
        listening.looker.lock();
        return true;
      }
      listening.looker.close();
      return false;
    },
  };
  const line = (
    <Line
      tokens={tokens}
      picked={chars ? spanOver(tokens, chars.from - at, chars.to - at) : null}
      now={now ? spanOver(tokens, now.from - at, now.to - at) : null}
      look={look}
      onPick={(span) => {
        const own = charsOf(tokens, span);
        if (own) onTake({ from: at + own.from, to: at + own.to });
      }}
      onFix={
        onFix
          ? (i) => {
              const own = charsOf(tokens, [i, i]);
              if (own) onFix({ from: at + own.from, to: at + own.to });
            }
          : null
      }
    />
  );
  if (!onEdit) return line;
  // The pencil (the owner, 2026-10-19: "add a pencil icon somewhere to enter edit for that specific sentence, only works
  // while we're paused, as in the buttons disable otherwise"): at the row's end, dim and still while it can't be pressed.
  return (
    <div className="strip-row">
      {line}
      <Button className="btn-icon strip-row-edit" aria-label="Fix this line" disabled={!editable} onClick={onEdit}>
        <Icon name="edit" />
      </Button>
    </div>
  );
}

/**
 * Which of some words the video is saying right now: where they stand among the rest, or null when it's at none of
 * them. Looked at as often as the screen is drawn, and told only when it changes, so nothing is drawn again for a
 * video that's still inside the same word.
 */
function useNow(beats: readonly Beat[]): Chars | null {
  const [at, setAt] = useState(-1);
  const heard = useRef(beats);
  useEffect(() => {
    heard.current = beats;
  });
  useEffect(() => {
    let frame = 0;
    const look = () => {
      frame = requestAnimationFrame(look);
      const time = video?.currentTime;
      const now = time === undefined ? -1 : heard.current.findIndex((beat) => time >= beat.start && (beat.end === null || time < beat.end));
      setAt((was) => (was === now ? was : now));
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, []);
  const beat = beats[at];
  return beat ? { from: beat.from, to: beat.to } : null;
}

/** The marks on the seek bar, following the pointer on it themselves, so the whole screen isn't drawn again as it comes and goes. */
function BarMarks(props: Omit<ComponentProps<typeof SeekMark>, "hover" | "onReach" | "onPeek">) {
  const hover = useSyncExternalStore(onBar.subscribe, onBar.get);
  return <SeekMark {...props} hover={hover} onReach={reachPx.set} onPeek={peekCard} />;
}

function App() {
  /** What the line reads right now (the transcript, or the site's captions), and how transcribing stands. */
  const view = useSyncExternalStore(lines.subscribe, lines.get);
  const tx = useSyncExternalStore(transcriber.subscribe, transcriber.state);
  /** Where the words come from: this browser's pick, kept for the next video; and whether that's the engine, the one case anything is transcribed. */
  const picked = tx.source;
  const engineOn = tx.settings !== null && picked === tx.settings.engine;
  const placed = useSyncExternalStore(inPlace.subscribe, inPlace.get);
  const replaying = useSyncExternalStore(replay.subscribe, replay.mode);
  const cards = useSyncExternalStore(carded.subscribe, carded.get);
  const [taking, setTaking] = useState<Taking | null>(null);
  const [turn, setTurn] = useState(0);
  /** Where the line was split by hand, from the popup: a word taken as longer or shorter than the dictionary would. Kept by caption line, so it stays put as the rows move on. */
  const [splits, setSplits] = useState<readonly Split[]>([]);

  // How many full-width characters fit across the rows, measured off the rows themselves and again whenever their
  // width changes (the window, the player's wide view). Unknown until first measured.
  const rowsEl = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    const el = rowsEl.current;
    if (!el) return;
    const measure = () => {
      const font = parseFloat(getComputedStyle(el).fontSize);
      if (font > 0) setRoom(Math.floor((el.clientWidth / font) * ROOM_USED));
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [placed]);

  // Under the player: the talk being written, in rows of Panki's own, as wide as there's room for. A pick is kept as
  // its place in all of it read as one text.
  // A transcript's lines are cut to a sentence or a clause each (`transcribe/lines.ts`), so the widest of them is the row's measure there.
  const rowWidth = view.mode === "transcript" ? Math.max(PLAYER_ROW, view.widest) : longestRow;
  const perRow = room === null ? 1 : Math.max(1, Math.floor(room / rowWidth));
  const current = view.current;
  const under = current ? rowsUnder(view.lines, current, perRow) : [];
  const underLines = under.flatMap((row) => row.lines);
  const underIds = underLines.map((line) => line.id);
  const underText = transcriptOf(underLines);
  /** Where the video is in what's under the player: the words being said this moment, wherever it was put or played back to. */
  const nowUnder = useNow(beatsOf(underText.parts));

  const clip = taking?.of === "caption" ? clipOf(taking.lineIds, taking.chars, taking.trim) : taking?.of === "stretch" ? stretchOf(taking.trim.start, taking.trim.end) : null;
  const sentence = clip?.sentence ?? "";
  /** Which caption line, and which letter of it, a letter of what's under the player is. */
  const placeOf = (at: number) => {
    const there = lineAt(underText.parts, at);
    return there ? { lineId: there.line.id, offset: there.offset } : null;
  };
  /** The splits made by hand that fall in a row, in the row's own letters. */
  const forcedIn = (rowAt: number, length: number): Forced[] =>
    splits.flatMap((split) => {
      const part = underText.parts.find((p) => p.line.id === split.lineId);
      if (!part) return [];
      const from = part.at + split.offset - rowAt;
      return from >= 0 && from + split.length <= length ? [{ from, to: from + split.length }] : [];
    });
  /** The pick, said in what's under the player now: its lines may have moved on since it was made. */
  const pickedUnder = taking?.of === "caption" && taking.chars && clip ? reread(taking.chars, clip.base, underText.parts) : null;
  /** Every word that's been heard and is still kept, with when: the ticks on the clip's bar, and where an end stops when it's set to stop at words. */
  const heard = clip ? beatsOf(transcriptOf(view.lines).parts) : [];

  /** A transcript's word being fixed by hand: which, what it says now as typed, and what it said. */
  const [fixing, setFixing] = useState<{ wordId: number; text: string; was: string } | null>(null);
  const [fixFailure, setFixFailure] = useState<string | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
  /** A word double-clicked under the player or over the video: the transcript's word there, opened to fix. */
  function fixAt(chars: Chars) {
    const there = lineAt(underText.parts, chars.from);
    const word = there && there.line.id < 0 ? lines.wordAt(there.line.id, there.offset) : null;
    if (!word) return;
    setFixing({ wordId: word.id, text: word.text, was: word.text });
    setFixFailure(null);
  }
  async function saveFix() {
    const id = videoId();
    if (!fixing || !id) return;
    const text = fixing.text.trim();
    if (text === "" || text === fixing.was) {
      setFixing(null);
      return;
    }
    setFixBusy(true);
    const answer = await askFix(id, { wordId: fixing.wordId, text });
    setFixBusy(false);
    if (!answer.ok) {
      setFixFailure(answer.message);
      return;
    }
    transcriber.take(answer.transcript);
    setFixing(null);
  }
  /**
   * A row of the transcript being fixed by hand with its pencil (the owner, 2026-10-19 and 20): its words, what it says
   * as typed, and where it starts and ends as set (seconds), each end a `Stamp`. Saved, the typed words are laid back
   * onto the row's own by Panki, each keeping its place in the row as the ends move. Only while the video stands still
   * and no whole video is on its way (whose words would replace it: "the latest one overwrites").
   */
  const [editing, setEditing] = useState<{ wordIds: number[]; text: string; start: number; end: number } | null>(null);
  const [editFailure, setEditFailure] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const still = useSyncExternalStore(stillNow.subscribe, stillNow.get);
  const editable = still && view.mode === "transcript" && tx.transcript?.job?.state !== "running";
  function editRow(lineIds: readonly number[]) {
    const row = lines.linesAsOne(lineIds);
    if (!row) return;
    setFixing(null);
    setEditing(row);
    setEditFailure(null);
  }
  /** An end of the row moved: kept inside the video and on its side of the other end. */
  function moveRowEnd(which: "start" | "end", to: number) {
    if (!editing) return;
    const limit = video && Number.isFinite(video.duration) ? video.duration : Infinity;
    if (which === "start") setEditing({ ...editing, start: Math.min(Math.max(0, to), editing.end - 0.1) });
    else setEditing({ ...editing, end: Math.max(Math.min(limit, to), editing.start + 0.1) });
  }
  async function saveRow() {
    const id = videoId();
    if (!editing || !id) return;
    setEditBusy(true);
    const answer = await askLine(id, { wordIds: editing.wordIds, text: editing.text.trim(), startMs: Math.round(editing.start * 1000), endMs: Math.round(editing.end * 1000) });
    setEditBusy(false);
    if (!answer.ok) {
      setEditFailure(answer.message);
      return;
    }
    transcriber.take(answer.transcript);
    setEditing(null);
  }
  // Another video, or the transcript gone from under the player: nothing to fix any more.
  useEffect(() => {
    if (view.mode !== "transcript") {
      setFixing(null);
      setEditing(null);
    }
  }, [view.mode]);
  // The whole video coming in replaces the words being fixed: the row's fixing gives way.
  const downloadingNow = tx.transcript?.job?.state === "running";
  useEffect(() => {
    if (downloadingNow) setEditing(null);
  }, [downloadingNow]);

  /**
   * Whether the transcript stands in for the site's captions on the picture: the engine is the pick, and the settings
   * want it there. The site's captions never stand in for it, not before it has caught up either (the owner,
   * 2026-10-17: "sometimes the old YouTube subtitles pop up").
   */
  const overVideo = engineOn && tx.prefs.overVideo;
  /** The transcript's line over the video: the one being said, kept a moment after its last word as a subtitle is. */
  const overLine = overVideo && view.mode === "transcript" ? view.saying : null;
  const overPart = overLine ? underText.parts.find((part) => part.line.id === overLine.id) : undefined;
  // The site's own captions give way for as long as the transcript stands in for them, between its lines too: faded
  // only while a line was being said, they came back in every gap (the owner, 2026-10-17).
  useEffect(() => {
    showingOver.set(overVideo);
  }, [overVideo]);
  // How the line over the video looks, the viewer's own: written on its place as variables (they inherit into the shadow root).
  const style = tx.prefs.style;
  useEffect(() => {
    for (const [name, value] of Object.entries(subtitleVars(style))) over.host.style.setProperty(name, value);
  }, [style]);

  /** The picked word's own stretch: where its ends were put, or else as the captions say it was said. */
  const wordTrim = taking?.of === "caption" ? taking.wordTrim : AS_SAID;
  const wordAsPut: Ends | null = !clip || !clip.pick ? null : wordTrim.start !== null && wordTrim.end !== null ? { start: wordTrim.start, end: wordTrim.end } : wordStretch(clip);
  const wordEnds = clip && wordAsPut ? inside(wordAsPut, { start: clip.start, end: clip.end }) : null;

  // Each cut's ends as they are this instant. What's asked of them in one go (an end moved, then the cut played)
  // can't wait for the screen to be drawn again, so each change is written here as it's made.
  const ends = useRef<Record<Cut, Ends | null>>({ clip: null, word: null });
  useEffect(() => {
    ends.current = { clip: clip ? { start: clip.start, end: clip.end } : null, word: wordEnds };
  });
  /** Which of the two was last played: the one the replay is of, while there is one. */
  const played = useRef<Cut>("clip");

  // The video stops by itself at the clip's end, once for each clip (`stopAt`): a new capture, or the clip taken to
  // another sentence, is a new clip; an end pulled elsewhere is the same clip, stopping at its new end if it hasn't yet.
  const clipEnd = clip?.end ?? null;
  const clipKey = taking?.of === "caption" ? `${taking.turn}:${taking.moved}` : taking?.of === "stretch" ? `${taking.turn}` : null;
  useEffect(() => {
    stopSpent = false;
  }, [clipKey]);
  useEffect(() => {
    stopAt = clipEnd;
    if (clipEnd === null) return;
    const timer = setInterval(watchEnd, STOP_WATCH_MS);
    return () => clearInterval(timer);
  }, [clipEnd]);

  const close = useCallback(() => {
    pauseAfter = null;
    const stood = replay.leave();
    // Put back where it stood before a clip was played, and going again if it was. A video that's playing by now was
    // started by hand, and is left be.
    if (video?.paused) {
      if (stood !== null && Math.abs(video.currentTime - stood) > 0.05) video.currentTime = stood;
      if (wasPlaying) void video.play().catch(() => undefined);
    }
    wasPlaying = false;
    setTaking(null);
  }, []);

  /** The video holds still while something of it is being added: at once, or at the end of a line still being written. */
  function hold(waitsFor: number | null) {
    if (!video) return;
    // What the video was doing is noted once, as the drawer first opens on something of it.
    if (taking === null || taking.of === "nothing") wasPlaying = !video.paused;
    replay.stop();
    if (waitsFor !== null) {
      pauseAfter = waitsFor;
      // Stopped by hand part-way through it: it's heard out, so that its clip has an end.
      if (video.paused) void video.play().catch(() => undefined);
    } else {
      pauseAfter = null;
      video.pause();
    }
  }
  /**
   * Takes some lines of the captions, with these words picked in them. Other lines are a new capture. In the lines
   * already open, a word inside the clip is only another word for the card; one outside it takes the clip to its own
   * sentence, as that was said.
   */
  function takeCaption(lineIds: readonly number[], chars: Chars | null) {
    const there = sentenceOf(lineIds, chars);
    if (!there) return;
    const open = taking?.of === "caption" && sameIds(taking.lineIds, lineIds) ? taking : null;
    // The clip's words are counted in its own text, which may begin sooner than the lines taken do.
    const inClip = open && chars && clip ? reread(chars, clip.base, clip.parts) : null;
    // Another word: its own sound is that word's, as it was said, whatever was done to the last one's. The same word
    // pressed again keeps what was done to it.
    const sameWord = open !== null && open.chars !== null && chars !== null && open.chars.from === chars.from && open.chars.to === chars.to;
    const word = open && sameWord ? { wordTrim: open.wordTrim, wordTurn: open.wordTurn } : { wordTrim: AS_SAID, wordTurn: (open?.wordTurn ?? -1) + 1 };
    if (open && clip && inClip && inClip.from >= clip.from && inClip.to <= clip.to) {
      if (!sameWord && played.current === "word") replay.stop();
      setTaking({ ...open, chars, ...word });
      return;
    }
    hold(there.waitsFor);
    if (open) {
      setTaking({ ...open, chars, trim: AS_SAID, moved: open.moved + 1, ...word });
    } else {
      setTurn(turn + 1);
      setTaking({ of: "caption", turn: turn + 1, lineIds, chars, trim: AS_SAID, moved: 0, ...word, fresh: taking === null });
    }
  }
  /** A word pressed under the player. While a capture is open on lines that are still there, it's another pick in that capture; otherwise it starts one on what's there now. */
  function takeUnder(chars: Chars) {
    const inOpen = taking?.of === "caption" && clip ? reread(chars, underText.parts, clip.base) : null;
    if (taking?.of === "caption" && inOpen) takeCaption(taking.lineIds, inOpen);
    else takeCaption(underIds, chars);
  }
  /** Words selected, or pointed at, somewhere else on the page: the drawer opens on them in their sentence. */
  function takeTaken(selected: Taken, prefer: Found | null) {
    hold(null);
    setTurn(turn + 1);
    setTaking({ of: "selection", turn: turn + 1, taken: selected, chars: pickOf(selected), fresh: taking === null, prefer });
  }
  /**
   * A word's Add pressed in the popup. On Panki's line, or on the site's own captions when what's there can be found
   * under the player, it's the same as pressing that word in the line; anywhere else on the page, it's the word in
   * its sentence, as a selection would be. Either way the drawer starts on the dictionary's word that was pressed.
   */
  function takeFound(found: Found, pointed: Pointed) {
    const length = found.source.length;
    let chars: Chars | null = null;
    if (pointed.where.of === "line") {
      const { lineId, offset } = pointed.where;
      const part = underText.parts.find((p) => p.line.id === lineId);
      chars = part ? { from: part.at + offset, to: part.at + offset + length } : null;
    } else if (pointed.where.of === "captions" && pointed.context) {
      // The word with what follows it on its row, looked for in what's under the player, latest first.
      const { text, at } = pointed.context;
      const there = underText.text.lastIndexOf(text.slice(at, at + length + 6));
      chars = there >= 0 ? { from: there, to: there + length } : null;
    }
    if (chars) {
      takeUnder(chars);
      setTaking((now) => (now ? { ...now, prefer: found } : now));
      return;
    }
    const context = pointed.context;
    takeTaken(context ? sentenceAround(context.text, context.at, context.at + length) : { sentence: found.source, from: 0, to: length }, found);
  }
  /**
   * Takes a stretch of the video by itself: the few seconds up to where it stands, which is what was just heard. For
   * when there are no words to press (captions off, or none just there), and for when pulling a clip into place is
   * simply handier than picking a word. Its ends are then put where they belong, on the drawer's bar or the player's.
   */
  function takeStretch() {
    if (!video) return;
    hold(null);
    const end = Math.min(limitOf(video).to, Math.max(video.currentTime, CLIP_MIN));
    setTurn(turn + 1);
    setTaking({ of: "stretch", turn: turn + 1, trim: { start: Math.max(0, end - STRETCH), end }, fresh: taking === null });
  }

  /** Writes down where a cut's ends are now. Both, always: from the first move on it's a stretch of the video, not a sentence or a word as it was said. */
  function setEnds(cut: Cut, next: { start: number; end: number }) {
    if (cut === "word") {
      if (taking?.of !== "caption") return;
      setTaking({ ...taking, wordTrim: next });
    } else {
      if (taking?.of !== "caption" && taking?.of !== "stretch") return;
      setTaking({ ...taking, trim: next });
    }
    ends.current = { ...ends.current, [cut]: next };
    if (played.current === cut) replay.retarget({ from: next.start, to: next.end });
  }
  /** An end is moved: exactly where it's put, or to the nearest word's edge. Never past the other end, nor out of the video (the word's: nor out of the clip), nor to a cut too long to keep. And not at all while something is being recorded. */
  function moveEnd(cut: Cut, which: ClipEnd, to: number, by: MoveBy) {
    const now = ends.current[cut];
    if (recording || !video || !clip || !now || now.end === null) return;
    const around = ends.current.clip;
    const limit = cut === "word" && around && around.end !== null ? { from: around.start, to: around.end } : limitOf(video);
    if (which === "start") {
      const stops = by === "word" ? heard.map(beginsAt) : [];
      setEnds(cut, { start: restAt(to, Math.max(limit.from, now.end - CLIP_MAX_SECONDS), now.end - CLIP_MIN, stops), end: now.end });
    } else {
      const stops = by === "word" ? heard.flatMap((beat) => endsAt(beat) ?? []) : [];
      setEnds(cut, { start: now.start, end: restAt(to, now.start + CLIP_MIN, Math.min(limit.to, now.start + CLIP_MAX_SECONDS), stops) });
    }
  }
  /**
   * An end was let go, so the cut is heard. The start: it plays from there, through to its end. The end: its last
   * second plays, up to there. Either way it stops where the cut does; one already going round carries on round from
   * that point instead.
   */
  function hearCut(cut: Cut, which: ClipEnd) {
    const now = ends.current[cut];
    if (recording || !video || !now || now.end === null) return;
    const from = which === "start" ? now.start : Math.max(now.start, now.end - CUT);
    const round = replay.mode() === "round" && played.current === cut;
    played.current = cut;
    replay.play(video, { from: now.start, to: now.end }, round ? "round" : "once", from);
  }
  /** Play a cut, round and round; or, while any of it is playing (round, or once after an end was moved), stop. Asked of one while the other plays, it takes over. */
  function toggleCut(cut: Cut) {
    const now = ends.current[cut];
    if (!video || !now || now.end === null) return;
    if (replay.mode() !== null && played.current === cut) {
      replay.stop();
      return;
    }
    // What's played is what will be recorded: from here on the cut is this stretch, and doesn't shift with the
    // captions as the player draws them again.
    const pinned = taking?.of === "caption" && (cut === "word" ? taking.wordTrim.end !== null : taking.trim.end !== null);
    if (taking?.of === "caption" && !pinned) setEnds(cut, { start: now.start, end: now.end });
    played.current = cut;
    replay.play(video, { from: now.start, to: now.end }, "round");
  }

  useEffect(() => {
    const onAsked = () => {
      const selected = takeSelection();
      if (selected) takeTaken(selected, null);
      else if (underIds.length > 0) takeCaption(underIds, null);
      // No words to go by (captions off, or nothing said yet): the last few seconds of the video itself.
      else if (video) takeStretch();
      else setTaking({ of: "nothing", fresh: taking === null });
    };
    // Another video: what was being added belonged to the last one, and the new one plays on by itself.
    const onMoved = () => {
      wasPlaying = false;
      pauseAfter = null;
      replay.forget();
      setTaking(null);
      setSplits([]);
      setEditing(null);
    };
    fromPopup.add = ({ found, pointed }) => takeFound(found, pointed);
    // A word taken as another length from the popup: any split made before over the same letters gives way to it.
    fromPopup.split = (split) => setSplits((was) => [...was.filter((s) => s.lineId !== split.lineId || s.offset + s.length <= split.offset || s.offset >= split.offset + split.length), split]);
    asked.addEventListener("capture", onAsked);
    asked.addEventListener("moved", onMoved);
    return () => {
      asked.removeEventListener("capture", onAsked);
      asked.removeEventListener("moved", onMoved);
      fromPopup.add = null;
      fromPopup.split = null;
    };
  });

  const open = taking !== null;
  useEffect(() => {
    showing.set(open);
  }, [open]);

  // The lines being added were pushed out of the few that are kept (a long jump): there's nothing left to add.
  const lost = taking?.of === "caption" && clip === null;
  useEffect(() => {
    if (lost) close();
  }, [lost, close]);

  function panel() {
    if (taking === null) return null;
    if (taking.of === "nothing") {
      return (
        <Notice arrives={taking.fresh} onClose={close}>
          Nothing to take yet. Turn on the video's captions, or select some words on the page.
        </Notice>
      );
    }
    if (taking.of === "selection") {
      const capture: Capture = { sentence: taking.taken.sentence, moved: 0, ...pageSource() };
      return (
        <Panel
          key={`selection-${taking.turn}`}
          capture={capture}
          picked={taking.chars}
          onPick={(chars) => setTaking({ ...taking, chars })}
          prefer={taking.prefer ?? null}
          clip={null}
          wordClip={null}
          arrives={taking.fresh}
          onClose={close}
        />
      );
    }
    if (!clip) return null;
    /** The lines a pick is kept in; a stretch taken off the video by itself has none. */
    const lineIds = taking.of === "caption" ? taking.lineIds : null;
    const moved = taking.of === "caption" ? taking.moved : 0;
    const capture: Capture = { sentence, moved, ...videoSource(clip.start, clip.end) };
    const player = video;
    /** A cut as the drawer is handed it: where it stands, and what can be asked of it. */
    const offerOf = (cut: Cut, now: Ends, anchor: number): ClipOffer | null =>
      player
        ? {
            video: player,
            start: now.start,
            end: now.end,
            limit: limitOf(player),
            // The word is cut out of the clip: its bar is the clip, end to end.
            within: cut === "word" && clip.end !== null ? { from: clip.start, to: clip.end } : null,
            ticks: heard.map((beat) => beat.start),
            playing: replaying !== null && played.current === cut,
            anchor,
            move: (which, to, by) => moveEnd(cut, which, to, by),
            settle: (which) => hearCut(cut, which),
            toggle: () => toggleCut(cut),
            record: (soundOnly, onProgress) => recordClip(() => ends.current[cut], soundOnly, onProgress),
            // What's said in it, from the lines being read right now (the transcript or the captions), at its ends as they stand.
            cues: () => {
              const at = ends.current[cut];
              return at && at.end !== null ? cuesOf(lines.get().lines, at.start, at.end) : [];
            },
          }
        : null;
    const offer = offerOf("clip", { start: clip.start, end: clip.end }, moved);
    const wordOffer = wordEnds && taking.of === "caption" ? offerOf("word", wordEnds, taking.wordTurn) : null;
    return (
      <Panel
        key={`${taking.of}-${taking.turn}`}
        capture={capture}
        picked={inSentence(clip)}
        onPick={(chars) => {
          // A pick made in the drawer is in the sentence's own letters; it's kept as its place in the lines that were
          // taken. A word from a line the clip only reached into later has no place there, and is the drawer's alone.
          const inTaken = reread({ from: clip.from + chars.from, to: clip.from + chars.to }, clip.parts, clip.base);
          if (lineIds && inTaken) takeCaption(lineIds, inTaken);
        }}
        prefer={taking.prefer ?? null}
        clip={offer}
        wordClip={wordOffer}
        arrives={taking.fresh}
        onClose={close}
        onAdded={() => void readCarded()}
      />
    );
  }

  /** Transcribing, in the strip's head: where the words come from and, with the engine picked, the menu that says how it stands and drives it. */
  const menuOn = engineOn && tx.status.kind !== "signedOut";
  /** The pick changed here: taken at once on the page, and kept by the worker for the next video. */
  function pickSource(id: SubtitleSource) {
    transcriber.setSource(id);
    void askSubtitles(id);
  }
  /** The video's length in seconds, when the player says it. */
  const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  /** Whether it starts by itself, changed in the menu: this viewer's own, taken at once on the page and kept by the worker. */
  function setAuto(on: boolean) {
    const trigger = on ? "auto" : "press";
    transcriber.setPrefs({ trigger });
    void askPrefs({ trigger });
  }
  /** The mode this viewer transcribes in, picked in the menu (or switched to Auto from the question before a long download): taken at once, kept by the worker. */
  function setMode(mode: TranscribeMode) {
    transcriber.setPrefs({ mode });
    void askPrefs({ mode });
  }
  /** How the transcript looks over the video, changed in the Subtitles menu: seen at once, kept by the worker. */
  function setStyle(style: SubtitleStyle) {
    transcriber.setPrefs({ style });
    void askPrefs({ style });
  }
  /** Whether the Subtitles menu is open: only then is the band on the video there to be dragged. */
  const [styling, setStyling] = useState(false);
  /**
   * The band dragged across the picture (the owner, 2026-10-17: "directly drag the subtitle bar to reposition it…
   * in % relative to the screen, but only while the subtitle settings are open"): its place follows the pointer as
   * shares of the player's own box, seen at once, and is kept when the pointer is let go. The words aren't pressed
   * while the band is for dragging.
   */
  function dragSubtitles(e: ReactPointerEvent<HTMLDivElement>) {
    const area = over.host.parentElement;
    if (!area || e.button !== 0) return;
    e.preventDefault();
    const band = e.currentTarget;
    const box = area.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const from = { x: e.clientX, y: e.clientY, style };
    let latest = style;
    const move = (ev: PointerEvent) => {
      latest = {
        ...from.style,
        x: withinBound(from.style.x + ((ev.clientX - from.x) / box.width) * 100, SUBTITLE_BOUNDS.x),
        bottom: withinBound(from.style.bottom - ((ev.clientY - from.y) / box.height) * 100, SUBTITLE_BOUNDS.bottom),
      };
      transcriber.setPrefs({ style: latest });
    };
    const done = () => {
      band.removeEventListener("pointermove", move);
      band.removeEventListener("pointerup", done);
      band.removeEventListener("pointercancel", done);
      void askPrefs({ style: latest });
    };
    band.setPointerCapture(e.pointerId);
    band.addEventListener("pointermove", move);
    band.addEventListener("pointerup", done);
    band.addEventListener("pointercancel", done);
  }
  /** A stretch of the transcript, or all of it, forgotten for everyone; the transcript as it stands then is taken. */
  async function forget(stretch: Seconds | null) {
    const id = videoId();
    if (!id) return;
    const answer = await askForget(id, stretch ? { startMs: Math.round(stretch.start * 1000), endMs: Math.round(stretch.end * 1000) } : null);
    if (answer.ok) transcriber.take(answer.transcript);
  }
  /** The clip as it's marked on the player's seek bar, once it has both ends. */
  const clipMark: ClipMark | null = clip && clip.end !== null ? { start: clip.start, end: clip.end, onMove: (which, to, by) => moveEnd("clip", which, to, by), onSettle: (which) => hearCut("clip", which) } : null;

  return (
    <>
      {placed ? (
        <div className="strip">
          <div className="strip-head">
            <span className="strip-name">Panki</span>
            {/* Where the words come from, picked here and kept for the next video; with the engine picked, the site's captions never stand in for it. */}
            {tx.settings ? (
              <span className="strip-pick">
                <Dropdown id="panki-subtitles" label="Subtitles" options={SUBTITLE_SOURCE_IDS.map((id) => ({ id, label: SUBTITLE_SOURCES[id].name }))} value={picked} onChange={pickSource} />
              </span>
            ) : null}
            {/* A sentence taken before it was all said: the video is let run to its end (and started, if it stood
                still), which would look like a fault if nothing said so. */}
            {taking?.of === "caption" && clip && clip.end === null ? (
              <span className="strip-live" role="status">
                <i className="live-dot" aria-hidden="true" />
                Letting the sentence finish. The video stops at its end.
              </span>
            ) : null}
            <div className="strip-tools">
              {/* Everything about transcribing this video, in one place; room beside it for what comes next (a "Clip the last 5 seconds" button stood here until the owner had it taken out, 2026-10-17; the toolbar's way in still cuts that clip). */}
              {menuOn ? (
                <TranscribeMenu
                  state={tx}
                  duration={duration}
                  at={video?.currentTime ?? null}
                  onStart={() => video && transcriber.start(video)}
                  onStop={() => transcriber.stop()}
                  onWhole={() => transcriber.startWhole(duration)}
                  onStretch={(stretch) => transcriber.startStretch(stretch.start, stretch.end)}
                  onForget={(stretch) => void forget(stretch)}
                  onAuto={setAuto}
                  onMode={setMode}
                  onAnswer={(yes) => transcriber.answer(yes, duration)}
                  detail={transcriber.detail}
                />
              ) : null}
              {/* How the transcript looks over the video, set right here (the owner, 2026-10-17: "edit the subtitles directly in YouTube"). */}
              {overVideo ? <SubtitleMenu style={tx.prefs.style} onChange={setStyle} onOpen={setStyling} /> : null}
              {/* Panki itself, the one the profile in use is signed in to, in a tab of its own (the owner, 2026-10-17). */}
              <Button className="capture-tool btn-icon" aria-label="Open Panki" onClick={() => void askOpenPanki()}>
                <Icon name="out" />
              </Button>
              {/* The extension's own settings, on their YouTube tab (the owner, 2026-10-17: "a button for the settings"). */}
              <Button className="capture-tool btn-icon" aria-label="Panki settings" onClick={() => void askOptions("youtube")}>
                <Icon name="settings" />
              </Button>
            </div>
          </div>
          {/* A row of the transcript fixed with its pencil stands in the rows' place while it's being fixed: the row become a field between its two ends. */}
          {editing ? (
            <Form onSubmit={() => void saveRow()} className="strip-edit">
              <Stamp id="panki-edit-start" name="Where the line starts" at={editing.start} disabled={editBusy} onSet={(to) => moveRowEnd("start", to)} />
              <TextField
                id="panki-edit-line"
                label="Line"
                lang="ja"
                autoFocus
                value={editing.text}
                onChange={(text) => setEditing({ ...editing, text })}
                error={editFailure ?? undefined}
              />
              <Stamp id="panki-edit-end" name="Where the line ends" at={editing.end} disabled={editBusy} onSet={(to) => moveRowEnd("end", to)} />
              <span className="strip-edit-actions">
                <Button type="submit" variant="primary" disabled={editBusy}>
                  {editBusy ? "Saving…" : "Save"}
                </Button>
                <Button disabled={editBusy} onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </span>
            </Form>
          ) : null}
          {/* A row is only let break in two when there's no room for even one of the player's own rows across. */}
          <div ref={rowsEl} className={`strip-rows ${room !== null && room < longestRow ? "is-narrow" : ""}`.trim()} hidden={editing !== null}>
            {under.length > 0 ? (
              under.map((row) => {
                const first = underText.parts.find((part) => part.line.id === row.lines[0]?.id);
                const last = underText.parts.find((part) => part.line.id === row.lines.at(-1)?.id);
                if (!first || !last) return null;
                const text = underText.text.slice(first.at, last.at + last.line.text.length);
                const transcribed = view.mode === "transcript";
                return (
                  <Row
                    key={row.key}
                    text={text}
                    at={first.at}
                    chars={pickedUnder}
                    now={tx.prefs.markUnder ? nowUnder : null}
                    forced={forcedIn(first.at, text.length)}
                    onTake={takeUnder}
                    placeOf={placeOf}
                    onFix={transcribed ? fixAt : null}
                    onEdit={transcribed ? () => editRow(row.lines.map((line) => line.id)) : null}
                    editable={editable}
                  />
                );
              })
            ) : tx.status.kind === "running" ? null : picked === "youtube" ? ( // The menu's button says it's transcribing; a word here too was one too many (the owner, 2026-10-17).
              <p className="empty">Turn on captions to enable.</p>
            ) : picked === "none" ? (
              // The owner, 2026-10-17, at an empty strip with None picked: "make sure this says to enable subtitles if they're disabled", then "what about showing 'turn on subtitles'": the press that does it.
              <p className="empty strip-empty">
                Subtitles are off.
                <Button className="capture-tool" onClick={() => pickSource(DEFAULT_SOURCE)}>
                  Turn on subtitles
                </Button>
              </p>
            ) : null}
          </div>
          {/* A transcript's word heard wrong, fixed by hand for everyone: double-clicked, typed over, saved. */}
          {fixing ? (
            <Form onSubmit={() => void saveFix()} className="strip-fix">
              <TextField id="panki-fix-word" label="Word" lang="ja" autoFocus value={fixing.text} onChange={(text) => setFixing({ ...fixing, text })} error={fixFailure ?? undefined} />
              <Button type="submit" variant="primary" disabled={fixBusy}>
                {fixBusy ? "Saving…" : "Save"}
              </Button>
              <Button disabled={fixBusy} onClick={() => setFixing(null)}>
                Cancel
              </Button>
            </Form>
          ) : null}
        </div>
      ) : null}
      {/* The transcript over the video, the line being said: the same words as under the player, to press and to fix. */}
      {createPortal(
        overLine && overPart ? (
          <div className={`sub-band over-line ${styling ? "is-dragging" : ""}`.trim()} lang="ja" onPointerDown={styling ? dragSubtitles : undefined}>
            <Row key={overLine.id} text={overLine.text} at={overPart.at} chars={pickedUnder} now={tx.prefs.markOver ? nowUnder : null} forced={forcedIn(overPart.at, overLine.text.length)} onTake={takeUnder} placeOf={placeOf} onFix={fixAt} />
          </div>
        ) : null,
        over.ground,
      )}
      {/* The drawer is drawn into its own place on the page; it's one screen with the line, so they share what's picked. */}
      {createPortal(panel(), drawer.ground)}
      {/* And on the player's own seek bar: how far the transcript reaches, where cards were taken from, and the clip, where its ends can be pulled too. */}
      {createPortal(
        video && (tx.transcript !== null || clipMark !== null || tx.working !== null || cards.length > 0) ? (
          <BarMarks length={video.duration} covered={tx.transcript?.covered ?? []} working={tx.working} cards={cards} clip={clipMark} look={tx.prefs.seek} onGo={goToCard} />
        ) : null,
        seek.ground,
      )}
    </>
  );
}

strip.root.render(<App />);
listening.start();
look();
setInterval(look, 1000);
// Transcribing follows the viewer's player, looked at a few times a second; the line follows the video's time the same way.
setInterval(() => {
  transcriber.tick(video);
  lines.refresh();
}, FOLLOW_MS);
// The settings are everyone's, changed in Panki, and the viewer's own are changed on the options page; a card may have
// been deleted in Panki: read again when this page gets the focus back, and when its tab is shown again (a switch of
// tabs doesn't always bring a focus event: a switch set on the options page was ignored until the window was clicked,
// 2026-10-18).
function readAgain() {
  transcriber.refresh();
  void readCarded();
}
window.addEventListener("focus", readAgain);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") readAgain();
});
// The site's own word for "another page of mine is now showing": it never loads a new page between videos.
document.addEventListener("yt-navigate-finish", look);
document.addEventListener("fullscreenchange", place);
// The player's size changes with the window (and the site's theatre view): the words over it keep their share of it.
window.addEventListener("resize", place);
showing.subscribe(place);
showingOver.subscribe(place);
carded.subscribe(place);
// Another video: whether the pointer is on the bar is known afresh.
asked.addEventListener("moved", () => onBar.set(false));
// The transcript's reach goes on the seek bar as soon as there is one to mark.
transcriber.subscribe(place);

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !Trigger.safeParse(message).success) return;
  asked.dispatchEvent(new Event("capture"));
  respond({ ok: true });
});
