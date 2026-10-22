import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { WATCH, youtubeLinkOf, youtubeUrl, type ContinueVideo, type Deck, type SaveVideo, type SavedVideo, type Settings, type Stats, type VideoGlance } from "@panki/contracts";
import { Mark } from "@web/brand/Mark";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { agoWords, clock, count, durationWords, langOf } from "@web/words";
import { askGlance, askHome, askOpenPanki, askOptions, askSave, askWatchMark } from "../messages";
import { SHELF_MAX, switchInPill, type Modules } from "../modules";
import { PankiPill, pillNumbersOf } from "../ui/PankiPill";
import { mount } from "../ui/mount";
import { tokensOn } from "../ui/styles";

/**
 * YouTube's own pages made Panki's (the owner, 2026-10-21: "redesign YouTube around our goals whilst still looking and
 * feeling like YouTube… make it feel like it's our own super deluxe premium YouTube, not just an extension that adds a
 * box"). Nothing of the site is replaced; Panki is laid into it, in the site's own shapes and colours (its tokens,
 * `--yt-spec-*`, reach into Panki's places as custom properties do, so what Panki draws is in the site's theme by
 * construction; Panki's accent is the one colour of its own):
 *
 * Of seven mock-ups (https://claude.ai/artifact/C8dW71YGUczUvp6CFh8sPG) the owner picked Shelves with the Continue
 * watching shelf alone, "and everything else", to be "customizable in settings": each part below is its own switch on
 * the options page's Modules tab, under the master one.
 *
 * - **In the header bar**, beside the site's own buttons: the mark and what the viewer picked for it, in their order
 *   (`ui/PankiPill.tsx`: minutes watched, cards due, reviews, time reviewing, the review streak). Pressed, Panki opens.
 * - **One line over the recommendations**, where the site puts a shelf's heading: the day, today's minutes, who else on
 *   this Panki watched today, and at its end Review with what's due.
 *
 * No goal and no streak (the owner, 2026-10-21: "I don't want a target goal for immersion nor streaks… it might change
 * in the future, we store the data"): a ring to the day's goal and the streak's flame stood in both until then.
 * - **Continue watching**, a shelf of the site's own kind of cards: the videos left part-way, each opening where it was
 *   stopped, with how much is left over its picture and Panki's bar along its foot; one row, two, or all.
 * - **Shorts** can be kept off every page (a YouTube utility). Chips sifting the feed stood here until 2026-10-21.
 * - **On every thumbnail**, wherever the site shows a video: how far you got with Panki, the cards made from it, and
 *   whether Panki has its subtitles.
 *
 * The site's names relied on are together here; when the site changes them, this is where to look.
 */
/** YouTube's home, while it's the page shown (the site keeps every page it has shown, hidden), and its grid of videos. */
const HOME_GRID = 'ytd-browse[page-subtype="home"]:not([hidden]) ytd-rich-grid-renderer';
/** Where the grid's videos begin: Panki's top goes just before. */
const GRID_CONTENTS = ":scope > #contents";
/** One recommendation in the grid, and a shelf of the site's own among them (Shorts, news). */
const GRID_ITEM = "ytd-rich-item-renderer";
const GRID_SECTION = "ytd-rich-section-renderer";
/** A shelf of Shorts anywhere (the watch page's column, a search). */
const REEL_SHELF = "ytd-reel-shelf-renderer";
/** The right end of the site's header bar, where its own buttons stand: Panki's goes first among them. */
const MASTHEAD_END = "ytd-masthead #end";
/** A video's thumbnail, as a link to the video: the older grid's and the newer one's. Shorts are left alone. */
const THUMB_LINKS = 'a#thumbnail[href*="/watch?v="], a.yt-lockup-view-model__content-image[href*="/watch?v="]';
/** The card a thumbnail stands in, old and new, and its video's name and channel in it: what a save keeps of the video. */
const VIDEO_CARD = "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, yt-lockup-view-model";
const CARD_TITLE = "#video-title, .yt-lockup-metadata-view-model__title, h3";
const CARD_CHANNEL = "ytd-channel-name #text, #channel-name #text, .yt-content-metadata-view-model__metadata-text";
/** The site's playing preview, laid over the card the pointer rests on, and the picture in it. */
const PREVIEW = "ytd-video-preview, #video-preview";
const PREVIEW_MEDIA = "#media-container, #player-container, ytd-player, video";
/** A thumbnail as the site serves it, from its own picture host, in the one size always there: letterboxed 4:3, cropped to 16:9 where it's drawn. */
const thumbnailAt = (videoId: string) => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
/** How long what's known of a video is taken as true before it's asked for again. */
const GLANCE_FRESH_MS = 60_000;
/** After a glance that failed (signed out, Panki unreachable), how long before trying again. */
const GLANCE_BACKOFF_MS = 60_000;
/** The class the thumbnails' marks carry on the page: the app's tokens are declared on it, once. */
const THUMB_CLASS = "panki-thumb";

/** One value a screen can follow (as `youtube.tsx` has it). */
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

type Home = { name: string; stats: Stats; decks: Deck[]; settings: Settings; saved: SavedVideo[] };
/** What Panki knows for the page: nothing yet, the account, or why not (signed out, or Panki unreachable). */
type Known = { kind: "loading" } | { kind: "home"; home: Home } | { kind: "failed"; message: string; signedOut: boolean };
/** How many cards of `--yh-small` fit one row of an element, as it's laid out now, followed as it changes width; one at least. */
function usePerRow(row: HTMLElement | null): number {
  const [n, setN] = useState(1);
  useEffect(() => {
    if (!row) return;
    const measure = () => {
      const style = getComputedStyle(row);
      const card = parseFloat(style.getPropertyValue("--yh-small")) || 216;
      const gap = parseFloat(style.columnGap) || 16;
      setN(Math.max(1, Math.floor((row.clientWidth + gap) / (card + gap))));
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(row);
    return () => seen.disconnect();
  }, [row]);
  return n;
}

/** Time spent, from ms. */
const spent = (ms: number) => durationWords(ms / 1000);
/** Time still wanted, from ms, to the whole minute up, so a few seconds short is never "0 min". */
const wanted = (ms: number) => durationWords(Math.ceil(Math.max(0, ms) / 60_000) * 60);
/** The day, as the line over the recommendations opens: "Tuesday". */
const dayWords = (at: Date) => at.toLocaleDateString("en", { weekday: "long" });
/** What a thumbnail's mark says of how far you got: all of it once within the last seconds of the end, as the site's own bar has it. */
function shareOf(g: VideoGlance): number {
  if (g.watchedToMs === null || !g.lengthMs) return 0;
  return g.watchedToMs >= g.lengthMs - WATCH.endMs ? 1 : Math.min(1, g.watchedToMs / g.lengthMs);
}

/**
 * Panki on YouTube's pages beyond a video's: `modules` says which parts are on (all off while Panki is switched off),
 * `raw` what each switch says itself (the pill and its switch stay with Panki off, to turn it back on), `onPower` turns
 * Panki on or off, `theme` how the site is drawn now.
 */
export function createFeed(deps: { modules: () => Modules; raw: () => Modules; onPower: (on: boolean) => void; theme: () => "light" | "dark"; update: () => "available" | "needed" | null }) {
  const top = mount(deps.theme());
  // Its left edge and width are set to the grid's as the page stands (`alignTop`): never centred in what holds it.
  top.host.style.cssText = "display: block; box-sizing: border-box; align-self: flex-start; max-width: none; margin: 4px 0 20px;";
  const mast = mount(deps.theme());
  mast.host.style.cssText = "display: flex; align-items: center; margin-right: 8px;";
  const known = cell<Known>({ kind: "loading" });
  /** Bumped whenever a save changes, so a save button shows a tick or a plus afresh. */
  const savedTick = cell(0);
  let asking = false;
  let asked = false;

  async function load() {
    if (asking) return;
    asking = true;
    asked = true;
    try {
      const answer = await askHome();
      if (answer.ok) known.set({ kind: "home", home: { name: answer.name, stats: answer.stats, decks: answer.decks, settings: answer.settings, saved: answer.saved } });
      else known.set({ kind: "failed", message: answer.message, signedOut: "signedOut" in answer && answer.signedOut === true });
    } finally {
      asking = false;
    }
  }

  // ---- The header bar: the mark, what the viewer picked for it, and Panki's own switch when it's picked.

  function MastPill() {
    const now = useSyncExternalStore(known.subscribe, known.get);
    const raw = deps.raw();
    // Panki's switch at the pill's end, its one place while the pill is on (`switchInPill`): off, the pill is the mark and the switch alone.
    const power = { on: raw.on, onChange: deps.onPower };
    // An update for the extension marks the mark whatever else the pill says (`ui/UpdateNotice.tsx`).
    const update = deps.update();
    if (!raw.on) return <PankiPill layout={raw.pill} numbers={null} power={power} update={update} onClick={() => void askOpenPanki()} />;
    if (now.kind === "loading") return null;
    if (now.kind === "failed") {
      return (
        <span className="ym-pill-wrap">
          <Button className="ym-pill" aria-label="Panki: sign in" onClick={() => void askOptions("account")}>
            <Mark size={18} />
            <span className="ym-words">{now.signedOut ? "Sign in" : "Panki"}</span>
          </Button>
        </span>
      );
    }
    // What it says is the viewer's own, picked and ordered on the options page (`modules.ts` → `PillLayout`).
    return <PankiPill layout={raw.pill} numbers={pillNumbersOf(now.home.stats, now.home.decks)} power={power} update={update} onClick={() => void askOpenPanki()} />;
  }

  // ---- The top of the home.

  /**
   * One line where the site puts a shelf's heading: the day and today's minutes; Review at its end. (Who else on this
   * Panki watched today stood in it until everything about other people was shelved, 2026-10-21.)
   */
  function Today({ home }: { home: Home }) {
    const { stats, decks } = home;
    const w = stats.watching;
    const due = decks.reduce((sum, d) => sum + d.dueCount + d.newCount, 0);
    const parts: ReactNode[] = [<span key="day">{dayWords(new Date())}</span>];
    parts.push(w.on ? <span key="today">{`${spent(w.today)} watched today`}</span> : <span key="off">Video tracking is off</span>);
    return (
      <section className="yh-bar" aria-label="Today in Panki">
        <p className="yh-bar-words">
          {parts.map((part, i) => (
            <span key={i} className="yh-part">
              {i > 0 ? <span className="yh-sep" aria-hidden="true" /> : null}
              {part}
            </span>
          ))}
        </p>
        <div className="yh-actions">
          <Button variant={due > 0 ? "primary" : "ghost"} className="yh-review" onClick={() => void askOpenPanki()}>
            {due > 0 ? `Review · ${count(due, "card", "cards")} due` : "Open Panki"}
          </Button>
        </div>
      </section>
    );
  }

  /**
   * One video as the site's own kind of card: its picture (with how much is left and Panki's bar along its foot, when
   * it was begun), its name, its channel, a line of Panki's; the whole card a link, × at its corner to take it off.
   */
  function VideoCard({ videoId, title, channel, href, sub, progress, removeLabel, onRemove, save = false }: {
    videoId: string;
    title: string;
    channel: string;
    href: string;
    sub: string;
    progress: { share: number; left: string } | null;
    removeLabel: string;
    onRemove: () => void;
    /** The save button at its picture's top left (`CardSave`): Continue watching's cards have it. */
    save?: boolean;
  }) {
    return (
      <div className="yc">
        <a className="yc-link" href={href}>
          <span className="yc-thumb">
            <img src={thumbnailAt(videoId)} alt="" loading="lazy" />
            {progress ? (
              <>
                <span className="yc-left">{progress.left}</span>
                <span className="yc-bar">
                  <i style={{ width: `${(progress.share * 100).toFixed(1)}%` }} />
                </span>
              </>
            ) : null}
          </span>
          <span className="yc-title" lang={langOf(title)}>
            {title || "YouTube video"}
          </span>
          {channel ? (
            <span className="yc-sub" lang={langOf(channel)}>
              {channel}
            </span>
          ) : null}
          {sub ? <span className="yc-sub">{sub}</span> : null}
        </a>
        {save ? <CardSave videoId={videoId} about={{ title: title.slice(0, 300), channel: channel.slice(0, 100) }} /> : null}
        <Button className="btn-icon yc-x" aria-label={removeLabel} onClick={onRemove}>
          <Icon name="close" />
        </Button>
      </div>
    );
  }

  /** Whether a video is saved for later: as its thumbnails last heard, or else as the home's Saved shelf has it. */
  function isSaved(videoId: string): boolean {
    const heard = glances.get(videoId)?.glance.saved;
    if (heard !== undefined) return heard;
    const now = known.get();
    return now.kind === "home" && now.home.saved.some((v) => v.videoId === videoId);
  }

  /**
   * The save button on a card of Panki's own (Continue watching; the owner, 2026-10-21), the floating one's look at the
   * picture's top left: the site's preview never covers Panki's cards, so it sits in them, seen under the pointer (and
   * always on a touch screen), and always once saved.
   */
  function CardSave({ videoId, about }: { videoId: string; about: SaveVideo }) {
    useSyncExternalStore(savedTick.subscribe, savedTick.get);
    const on = deps.modules();
    if (!on.thumbSave) return null;
    const saved = isSaved(videoId);
    return (
      <Button
        className={`btn-icon yt-save is-on-card ${saved ? "is-saved" : ""}`.trim()}
        aria-label={saved ? "Saved for later: take it out" : "Save for later"}
        aria-pressed={saved}
        onClick={() => void setSaved(videoId, saved ? null : about)}
      >
        <Icon name={saved ? "check" : "add"} />
      </Button>
    );
  }

  /** How far into a video it was stopped, and what's left, as its picture says it. */
  const progressOf = (v: ContinueVideo) => ({ share: v.lengthMs > 0 ? v.stoppedAtMs / v.lengthMs : 0, left: `${wanted(v.lengthMs - v.stoppedAtMs)} left` });
  /**
   * The address that opens a video to go on with: the video alone, no time in it, so "Where you stopped last" decides
   * (offered, or jumped to, from Panki's latest stop). It carried the stop as a time marked as Panki's own until
   * 2026-10-22, which read as a moment asked for, and Jump automatically then stood aside (the owner: "why does clicking
   * a video from Panki's lists add the t=?").
   */
  const resumeAt = (v: ContinueVideo) => youtubeUrl({ videoId: v.videoId, seconds: null });

  /**
   * The videos left part-way (the owner's pick of six, 2026-10-21: "Hero and the rest"): the one left last big, with
   * where it was stopped, what's left and Resume, the next ones under it as the site's own kind of card, each opening
   * where it was stopped; × puts one away until it's watched again.
   */
  function Shelf({ videos, max, onStale }: { videos: readonly ContinueVideo[]; max: number; onStale: () => void }) {
    const [gone, setGone] = useState<readonly string[]>([]);
    const [failure, setFailure] = useState<string | null>(null);
    const shown = videos.filter((v) => !gone.includes(v.videoId)).slice(0, max);
    const [first, ...rest] = shown;
    if (!first) return null;
    async function putAway(videoId: string) {
      setFailure(null);
      setGone((was) => [...was, videoId]);
      const answer = await askWatchMark(videoId, "put-away");
      if (answer.ok) onStale();
      else {
        setGone((was) => was.filter((id) => id !== videoId));
        setFailure(answer.message);
      }
    }
    const now = Date.now();
    const lead = progressOf(first);
    // How far each was watched, on its picture, is a thumbnail's mark like any other: the same switch shows it on Panki's
    // own cards as on the site's (the owner, 2026-10-22: "make it also apply to our own").
    const marked = deps.modules().thumbs;
    return (
      <section className="yh-shelf" aria-label="Continue watching">
        <h2 className="yh-h">
          Continue watching <span className="yh-h-n">{shown.length}</span>
        </h2>
        {/* As the owner picked it on the artifact: the picture half the shelf's width, its words beside it (the title,
            the channel and where it was stopped, what's left in the accent, Resume), the rest four across under it. */}
        <div className="yh-lead">
          <div className="yc yh-lead-pic-wrap">
            <a className="yh-lead-pic" href={resumeAt(first)} aria-label={`Resume ${first.title || "the video"}`}>
              <img src={thumbnailAt(first.videoId)} alt="" />
              {marked ? (
                <span className="yc-bar">
                  <i style={{ width: `${(lead.share * 100).toFixed(1)}%` }} />
                </span>
              ) : null}
            </a>
            <CardSave videoId={first.videoId} about={{ title: first.title.slice(0, 300), channel: first.channel.slice(0, 100) }} />
            <Button className="btn-icon yc-x" aria-label="Put away" onClick={() => void putAway(first.videoId)}>
              <Icon name="close" />
            </Button>
          </div>
          <div className="yh-lead-info">
            <span className="yh-lead-title" lang={langOf(first.title)}>
              {first.title || "YouTube video"}
            </span>
            <span className="yc-sub">
              {first.channel ? <span lang={langOf(first.channel)}>{first.channel} · </span> : null}
              Stopped at {clock(first.stoppedAtMs / 1000)} · {agoWords(first.lastAt, now)}
            </span>
            <span className="yh-lead-left">{lead.left}</span>
            <a className="yh-resume" href={resumeAt(first)}>
              <Icon name="play" />
              Resume
            </a>
          </div>
        </div>
        {rest.length > 0 ? (
          <div className="yh-cards">
            {rest.map((v) => (
              <VideoCard key={v.videoId} videoId={v.videoId} title={v.title} channel={v.channel} href={resumeAt(v)} sub="" progress={marked ? progressOf(v) : null} removeLabel="Put away" onRemove={() => void putAway(v.videoId)} save />
            ))}
          </div>
        ) : null}
        {failure ? (
          <p className="form-failure" role="alert">
            {failure}
          </p>
        ) : null}
      </section>
    );
  }

  /**
   * The videos saved for later with a thumbnail's save button, newest first (the owner, 2026-10-21: "I want to be able
   * to save videos for later… I don't want to use YouTube's Watch later or playlists"): each the site's own kind of
   * card opening the video, × taking the save back. Kept on the account's Panki, so every browser signed in sees them.
   */
  function SavedShelf({ videos }: { videos: readonly SavedVideo[] }) {
    const [failure, setFailure] = useState<string | null>(null);
    // As many as fit one row ("Fits the row" of the artifact, the owner's pick for it, 2026-10-21), Show more for the rest.
    const [open, setOpen] = useState(false);
    const [row, setRow] = useState<HTMLDivElement | null>(null);
    const perRow = usePerRow(row);
    const shown = open ? videos : videos.slice(0, perRow);
    const now = Date.now();
    return (
      <section className="yh-shelf" aria-label="Saved for later">
        <h2 className="yh-h">
          Saved for later {videos.length > 0 ? <span className="yh-h-n">{videos.length}</span> : null}
        </h2>
        {/* Empty, it says where saving is (the owner, 2026-10-21, before saving anything: "where can I see the videos I've marked to watch later? and how can I mark videos like that"). */}
        {videos.length === 0 ? <p className="yh-empty">Nothing saved yet. Point at any video and press + at its top left.</p> : null}
        <div ref={setRow} className="yh-cards is-wrap">
          {shown.map((v) => (
            <VideoCard
              key={v.videoId}
              videoId={v.videoId}
              title={v.title}
              channel={v.channel}
              href={youtubeUrl({ videoId: v.videoId, seconds: null })}
              sub={`Saved · ${agoWords(v.savedAt, now)}`}
              progress={null}
              removeLabel="Take out of Saved"
              onRemove={() => {
                setFailure(null);
                void setSaved(v.videoId, null).then((message) => setFailure(message));
              }}
            />
          ))}
        </div>
        {videos.length > perRow ? (
          <div className="yh-more">
            <Button className="yh-more-btn" aria-expanded={open} onClick={() => setOpen((was) => !was)}>
              {open ? "Show less" : `Show ${videos.length - perRow} more`}
              <Icon name={open ? "up" : "down"} />
            </Button>
          </div>
        ) : null}
        {failure ? (
          <p className="form-failure" role="alert">
            {failure}
          </p>
        ) : null}
      </section>
    );
  }

  // The chips sifting the site's feed (All, Japanese, Panki subtitles, Unwatched) stood here until the owner had them out, 2026-10-21.

  function Top() {
    const now = useSyncExternalStore(known.subscribe, known.get);
    const on = deps.modules();
    return (
      <div className="yt-home">
        {now.kind === "loading" ? null : now.kind === "failed" ? (
          on.homeLine || on.homeShelf || on.homeSaved ? (
            <section className="yh-bar is-off">
              <p className="yh-bar-words">
                <Mark size={18} />
                <span>{now.signedOut ? "Not signed in." : now.message}</span>
              </p>
              <div className="yh-actions">
                {now.signedOut ? (
                  <Button variant="primary" className="yh-review" onClick={() => void askOptions("account")}>
                    Sign in
                  </Button>
                ) : (
                  <Button className="yh-review" onClick={() => void load()}>
                    Try again
                  </Button>
                )}
              </div>
            </section>
          ) : null
        ) : (
          <>
            {on.homeLine ? <Today home={now.home} /> : null}
            {/* Continue watching and Saved for later side by side, half the row each (the owner, 2026-10-21: "it can appear in the same row… 50% 50%"); one alone takes the row. */}
            <div className="yh-shelves">
              {on.homeShelf && now.home.stats.watching.on ? <Shelf videos={now.home.stats.watching.continuing} max={SHELF_MAX} onStale={() => void load()} /> : null}
              {on.homeSaved ? <SavedShelf videos={now.home.saved} /> : null}
            </div>
          </>
        )}
      </div>
    );
  }

  top.root.render(<Top />);
  mast.root.render(<MastPill />);

  // ---- The thumbnails' marks, and Shorts taken off the feed.

  const glances = new Map<string, { glance: VideoGlance; at: number }>();
  const waiting = new Set<string>();
  let glancing = false;
  let restUntil = 0;
  /** Each thumbnail's mark: its host in the link, its root, and what it last drew (so it's drawn again only when that changes). */
  const marks = new WeakMap<HTMLAnchorElement, { host: HTMLElement; root: ShadowRoot; drawn: string }>();
  const placed = new Set<HTMLElement>();
  let tokensIn = false;
  /** What Panki has hidden of the site's own (Shorts), to show again when the switch changes. */
  const hidden = new Set<HTMLElement>();

  /** The app's tokens, once, on the class the marks carry: they reach into each mark's shadow root as custom properties. */
  function tokens() {
    if (tokensIn) return;
    tokensIn = true;
    const style = document.createElement("style");
    style.textContent = tokensOn(`.${THUMB_CLASS}`);
    document.head.append(style);
  }

  /** A video's name and channel as the card around its thumbnail shows them, old grid and new: what a save keeps of it. Either may be unknown. */
  function aboutCard(link: Element): SaveVideo {
    const card = link.closest(VIDEO_CARD);
    const title = card?.querySelector(CARD_TITLE)?.textContent?.trim() ?? "";
    const channel = card?.querySelector(CARD_CHANNEL)?.textContent?.trim() ?? "";
    return { title: title.slice(0, 300), channel: channel.slice(0, 100) };
  }

  /**
   * A video saved for later (`about`, as its card shows it) or its save taken back (null): its thumbnails say so at once,
   * and Panki is asked; the Saved shelf follows Panki's answer. A failure puts the thumbnails back, and is said.
   */
  async function setSaved(videoId: string, about: SaveVideo | null): Promise<string | null> {
    const saved = about !== null;
    const was = glances.get(videoId);
    const before = was?.glance ?? { videoId, watchedToMs: null, lengthMs: null, cards: 0, transcribed: false, saved: !saved };
    glances.set(videoId, { glance: { ...before, saved }, at: was?.at ?? Date.now() });
    redrawMarks(videoId);
    savedTick.set(savedTick.get() + 1);
    const answer = await askSave(videoId, about);
    if (!answer.ok) {
      glances.set(videoId, { glance: { ...before, saved: !saved }, at: was?.at ?? Date.now() });
      redrawMarks(videoId);
      savedTick.set(savedTick.get() + 1);
      return answer.message;
    }
    const now = known.get();
    if (now.kind === "home") known.set({ kind: "home", home: { ...now.home, saved: answer.videos } });
    return null;
  }

  /** Every thumbnail of one video drawn again: its save was just changed. */
  function redrawMarks(videoId: string) {
    const on = deps.modules();
    for (const link of document.querySelectorAll(THUMB_LINKS)) {
      if (link instanceof HTMLAnchorElement && youtubeLinkOf(link.href)?.videoId === videoId) draw(link, glances.get(videoId)?.glance ?? null, on);
    }
  }

  async function glance() {
    if (glancing || waiting.size === 0 || Date.now() < restUntil) return;
    glancing = true;
    const ids = [...waiting].slice(0, 100);
    try {
      const answer = await askGlance(ids);
      if (answer.ok) {
        const at = Date.now();
        for (const video of answer.videos) glances.set(video.videoId, { glance: video, at });
        for (const id of ids) waiting.delete(id);
      } else restUntil = Date.now() + GLANCE_BACKOFF_MS;
    } finally {
      glancing = false;
    }
  }

  /** What a thumbnail's mark says, as a key: nothing when there's nothing to say. A saved video's tick stands at its top right while saving is switched on. */
  function sayOf(g: VideoGlance | null, on: Modules): string {
    const share = g && on.thumbs ? shareOf(g) : 0;
    const cards = g && on.thumbs ? g.cards : 0;
    const transcribed = g !== null && on.thumbs && g.transcribed;
    const saved = g !== null && on.thumbSave && g.saved;
    if (share === 0 && cards === 0 && !transcribed && !saved) return "";
    return JSON.stringify([Math.round(share * 1000) / 1000, cards, transcribed, saved]);
  }

  function draw(link: HTMLAnchorElement, g: VideoGlance | null, on: Modules) {
    const said = sayOf(g, on);
    let mark = marks.get(link);
    if (said === "") {
      if (mark) {
        mark.host.remove();
        placed.delete(mark.host);
        marks.delete(link);
      }
      return;
    }
    if (!mark) {
      tokens();
      const host = document.createElement("span");
      host.className = THUMB_CLASS;
      host.style.cssText = "position: absolute; inset: 0; z-index: 3; pointer-events: none; display: block;";
      const root = host.attachShadow({ mode: "closed" });
      mark = { host, root, drawn: "" };
      marks.set(link, mark);
    }
    mark.host.dataset.theme = deps.theme();
    if (mark.host.parentElement !== link) {
      if (getComputedStyle(link).position === "static") link.style.position = "relative";
      link.append(mark.host);
      placed.add(mark.host);
    }
    if (mark.drawn === said) return;
    mark.drawn = said;
    const [share, cards, transcribed, saved] = JSON.parse(said) as [number, number, boolean, boolean];
    const chips = [transcribed ? `<span class="chip">${SUBTITLES_ICON}</span>` : "", cards > 0 ? `<span class="chip">${CARD_ICON}${cards}</span>` : ""].join("");
    const badge = share > 0 || cards > 0 || transcribed ? `<span class="badge"><b class="glyph">パ</b>${chips}</span>` : "";
    const bar = share > 0 ? `<span class="bar"><i style="width:${(share * 100).toFixed(1)}%"></i></span>` : "";
    // Saved: a tick at the top right, seen without pointing at it. Saving itself is the floating button (`SaveFloat`).
    const tick = saved ? `<span class="saved">${TICK_ICON}</span>` : "";
    mark.root.innerHTML = `<style>${THUMB_CSS}</style>${badge}${bar}${tick}`;
  }

  /**
   * The save button (the owner's pick of six, 2026-10-21; a button inside each thumbnail never showed: the site lays a
   * playing preview over the card the pointer rests on, covering whatever is in it). So there's one button, floating over
   * the page in a place of Panki's above everything of the site's, put at the top left of the video the pointer is on, a
   * card or the site's preview of it (whose top right has the site's own buttons). It follows the pointer as it moves and
   * goes as the page scrolls; a press saves the video, or takes its save back.
   */
  type Aim = { videoId: string; x: number; y: number; about: SaveVideo };
  const aim = cell<Aim | null>(null);
  /** The card last pointed at: the site's preview of it has no name or channel of its own to read. */
  let lastCard: { videoId: string; about: SaveVideo } | null = null;
  const floater = mount(deps.theme());
  floater.host.style.cssText = "position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2400; pointer-events: none; display: block;";

  function SaveFloat() {
    const at = useSyncExternalStore(aim.subscribe, aim.get);
    useSyncExternalStore(savedTick.subscribe, savedTick.get);
    if (!at) return null;
    const saved = glances.get(at.videoId)?.glance.saved === true;
    return (
      <Button
        className={`btn-icon yt-save ${saved ? "is-saved" : ""}`.trim()}
        style={{ left: at.x, top: at.y }}
        aria-label={saved ? "Saved for later: take it out" : "Save for later"}
        aria-pressed={saved}
        onClick={() => void setSaved(at.videoId, saved ? null : at.about)}
      >
        <Icon name={saved ? "check" : "add"} />
      </Button>
    );
  }

  /** Where the pointer is, as a video to save: the card it's on, or the site's preview over it. Null off any video. */
  function aimAt(target: Element): Aim | null {
    const preview = target.closest(PREVIEW);
    if (preview) {
      if (!lastCard) return null;
      const media = preview.querySelector(PREVIEW_MEDIA) ?? preview;
      const box = media.getBoundingClientRect();
      return { videoId: lastCard.videoId, x: box.left + 8, y: box.top + 8, about: lastCard.about };
    }
    const card = target.closest(VIDEO_CARD);
    const thumb = card?.querySelector<HTMLAnchorElement>(THUMB_LINKS) ?? card?.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]') ?? null;
    const videoId = thumb ? youtubeLinkOf(thumb.href)?.videoId : undefined;
    if (!thumb || !videoId) return null;
    const box = thumb.getBoundingClientRect();
    if (box.width <= 0) return null;
    const about = aboutCard(thumb);
    lastCard = { videoId, about };
    return { videoId, x: box.left + 8, y: box.top + 8, about };
  }

  let aiming = 0;
  document.addEventListener(
    "pointermove",
    (e) => {
      if (aiming) return;
      aiming = requestAnimationFrame(() => {
        aiming = 0;
        const on = deps.modules();
        const target = e.target;
        if (!on.thumbSave || !(target instanceof Element)) return aim.set(null);
        // On the button itself: it stays where it is.
        if (target === floater.host) return;
        const next = aimAt(target);
        const was = aim.get();
        if (next && was && next.videoId === was.videoId && Math.abs(next.x - was.x) < 1 && Math.abs(next.y - was.y) < 1) return;
        aim.set(next);
      });
    },
    { passive: true },
  );
  // Scrolled, it would stand where the video was: it goes until the pointer moves again.
  window.addEventListener("scroll", () => aim.set(null), { passive: true, capture: true });
  floater.root.render(<SaveFloat />);

  function clearMarks() {
    for (const host of placed) host.remove();
    placed.clear();
  }

  function hide(el: HTMLElement, yes: boolean) {
    if (yes) {
      if (!hidden.has(el)) {
        el.style.display = "none";
        hidden.add(el);
      }
    } else if (hidden.has(el)) {
      el.style.display = "";
      hidden.delete(el);
    }
  }
  /** A shelf of the site's own that is Shorts and nothing else. */
  const isShortsShelf = (el: Element) => el.querySelector('a[href^="/shorts/"]') !== null && el.querySelector('a[href*="/watch?v="]') === null;

  /** Shorts taken off the site's pages as the switch says, in place: on the home's grid, and their shelves anywhere. A utility of the site's own, whether or not Panki's home is on. */
  function sift(on: Modules) {
    const grid = document.querySelector(HOME_GRID);
    if (grid) {
      for (const item of grid.querySelectorAll<HTMLElement>(GRID_ITEM)) {
        const short = item.querySelector('a[href*="/watch?v="]') === null && item.querySelector('a[href^="/shorts/"]') !== null;
        if (short) hide(item, !on.shorts);
      }
      for (const section of grid.querySelectorAll<HTMLElement>(GRID_SECTION)) hide(section, !on.shorts && isShortsShelf(section));
    }
    // Shorts shelves anywhere else: beside a video, in a search.
    for (const shelf of document.querySelectorAll<HTMLElement>(REEL_SHELF)) hide(shelf, !on.shorts);
  }

  /**
   * The top of the home laid against the site's grid, never centred (the owner, 2026-10-21: "it shouldn't be centered,
   * it should be on the left like all YouTube"): its sides where the grid's row of videos runs, read off the page as it
   * stands, so it follows the window's width. The shelves inside lay themselves out in that width (`extension.css`).
   */
  function alignTop(contents: Element) {
    // The first video shown (a hidden Short has no box), and where the grid's row of videos runs, inset as it is.
    const item = [...contents.querySelectorAll<HTMLElement>(GRID_ITEM)].find((el) => el.getBoundingClientRect().width > 0);
    if (!item) return;
    const box = item.getBoundingClientRect();
    const row = contents.getBoundingClientRect();
    const inset = box.left - row.left;
    // Where the host would stand with no margin of its own, wherever its parent puts it (padded, or centred).
    const host = top.host;
    const natural = host.getBoundingClientRect().left - (parseFloat(host.style.marginLeft) || 0);
    host.style.marginLeft = `${Math.round(box.left - natural)}px`;
    host.style.width = `${Math.max(0, Math.round(row.width - 2 * inset))}px`;
  }

  return {
    /** Looked at every second or so, and whenever the site says it's shown another page. */
    look() {
      const on = deps.modules();
      const theme = deps.theme();
      // Panki in the header bar, first among the site's own buttons; with Panki off, still there, holding the switch to turn it back on.
      const raw = deps.raw();
      const end = switchInPill(raw) ? document.querySelector(MASTHEAD_END) : null;
      if (!end) mast.host.remove();
      else if (mast.host.parentElement !== end) end.prepend(mast.host);
      mast.host.dataset.theme = theme;
      // The floating save button's place, over everything of the site's.
      if (floater.host.parentElement !== document.body) document.body.append(floater.host);
      floater.host.dataset.theme = theme;
      // The top of the home, over the recommendations, while that's the page shown and any part of it is on.
      const grid = on.home && (on.homeLine || on.homeShelf || on.homeSaved) ? document.querySelector(HOME_GRID) : null;
      const contents = grid?.querySelector(GRID_CONTENTS) ?? null;
      if (!contents) top.host.remove();
      else {
        if (top.host.nextElementSibling !== contents) contents.before(top.host);
        alignTop(contents);
      }
      top.host.dataset.theme = theme;
      if (on.home && !asked) void load();

      sift(on);

      // The marks on every thumbnail on the page, and its save button.
      if (!on.thumbs && !on.thumbSave) {
        clearMarks();
        return;
      }
      const now = Date.now();
      for (const link of document.querySelectorAll(THUMB_LINKS)) {
        if (!(link instanceof HTMLAnchorElement)) continue;
        const videoId = youtubeLinkOf(link.href)?.videoId;
        if (!videoId) continue;
        const kept = glances.get(videoId);
        if (!kept || now - kept.at > GLANCE_FRESH_MS) waiting.add(videoId);
        draw(link, kept?.glance ?? null, on);
      }
      void glance();
    },
    /** Read again: the page got the focus back, or another of the site's pages came up (a video watched since changes what's known of it, and the day's numbers). */
    refresh() {
      glances.clear();
      restUntil = 0;
      if (deps.modules().home) void load();
    },
    /** Drawn again: a part was switched, or the pill laid out afresh, on the options page. */
    redraw() {
      top.root.render(<Top />);
      mast.root.render(<MastPill />);
    },
  };
}

/** A box with two lines in it: subtitles. Drawn as the app's icons are, on a 24-unit grid. */
const SUBTITLES_ICON = `<svg viewBox="0 0 24 24"><path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M7 11h4M13 11h4M7 15h10"/></svg>`;
/** A card, as the decks' icon has it. */
const CARD_ICON = `<svg viewBox="0 0 24 24"><path d="M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><path d="M7 4h10"/></svg>`;
/** A saved video's tick. */
const TICK_ICON = `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/**
 * A thumbnail's mark, in its own shadow root: in the top left corner a small dark pill with Panki's パ, and what Panki
 * has of the video (its subtitles, the cards made from it); along the bottom edge how far you got, in the accent, as
 * the site draws its own red bar for what it watched. On the picture, so in the theater's colours whatever the theme.
 * The tokens come from the host (`tokensOn`).
 */
const THUMB_CSS = `
:host { all: initial; }
.badge {
  position: absolute; top: 6px; left: 6px;
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 6px 0 2px; border-radius: 7px;
  background: color-mix(in srgb, var(--theater) 72%, transparent);
  color: var(--theater-ink);
  font: 700 11px/1 "Roboto", "Arial", var(--font);
  backdrop-filter: blur(6px);
}
.glyph {
  display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 5px;
  background: var(--mark-tile); color: var(--mark-glyph);
  font: 800 10px/1 var(--font-ja);
}
.chip { display: inline-flex; align-items: center; gap: 2px; }
svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.bar {
  position: absolute; left: 0; right: 0; bottom: 0; height: 4px;
  background: color-mix(in srgb, var(--theater-ink) 30%, transparent);
}
.bar i { display: block; height: 100%; background: var(--accent); }
/* Saved for later: a tick in the accent at the top right. */
.saved {
  position: absolute; top: 6px; right: 6px;
  display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px;
  background: var(--accent); color: var(--accent-ink);
}
.saved svg { width: 14px; height: 14px; stroke-width: 2.6; }
`;
