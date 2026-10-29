import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { youtubeLinkOf, youtubeUrl, type ContinueVideo, type Deck, type FinishedVideo, type SaveVideo, type SavedVideo, type Settings, type Stats, type VideoGlance } from "@panki/contracts";
import { Mark } from "@web/brand/Mark";
import { Ask } from "@web/components/Ask";
import { Button } from "@web/components/Button";
import { Icon } from "@web/components/Icon";
import { VIDEO_TRACKING_OFF, agoWords, clock, langOf, leftWords, sinceWords } from "@web/words";
import { parseStamp } from "../capture/words";
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

/** Taking a video off a shelf of the home's, asked first: the words for each shelf, as Panki's own tiles say them too (`widgets.tsx`). One home. */
const REMOVE_FROM = {
  continue: { label: "Remove from Continue watching", question: "Remove from Continue watching?" },
  saved: { label: "Remove from Saved for later", question: "Remove from Saved for later?" },
};
type RemoveFrom = keyof typeof REMOVE_FROM;

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
/** The badges on a card's thumbnail, old grid and new: one of them is the video's length, "12:34". */
const CARD_BADGES = "ytd-thumbnail-overlay-time-status-renderer, yt-thumbnail-overlay-badge-view-model, yt-thumbnail-badge-view-model, badge-shape";
/** A length as a thumbnail's badge writes it: "12:34", "1:02:03". */
const LENGTH_TEXT = /^(?:\d+:)?\d{1,2}:\d{2}$/;
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

/** `profile` is what the profile in use is called (its own name, or the account's): the pill always says it. */
type Home = { name: string; profile: string; stats: Stats; decks: Deck[]; settings: Settings; saved: SavedVideo[] };
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
  /** Bumped whenever a save changes, so a save button shows itself saved or not afresh. */
  const savedTick = cell(0);
  let asking = false;
  let asked = false;

  async function load() {
    if (asking) return;
    asking = true;
    asked = true;
    try {
      const answer = await askHome();
      if (answer.ok) known.set({ kind: "home", home: { name: answer.name, profile: answer.profile, stats: answer.stats, decks: answer.decks, settings: answer.settings, saved: answer.saved } });
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
    return <PankiPill layout={raw.pill} numbers={pillNumbersOf(now.home.stats, now.home.decks)} profile={now.home.profile} power={power} update={update} onClick={() => void askOpenPanki()} />;
  }

  // ---- The top of the home.

  // The Today line (the day, today's minutes watched, Review) stood here until the owner had it out, 2026-10-28: "I don't need it".

  /**
   * One video as the site's own kind of card: its picture (with how much is left and Panki's bar along its foot, when
   * it was begun, or its length, as the site's own cards have it), its name, its channel, a line of Panki's; the whole
   * card a link, and, on a shelf a video can be taken off, a trash at its corner that asks first, under the card's
   * words (`Ask`), as everything that takes something away does (the owner, 2026-10-29: Continue watching's box "isn't
   * clear that it deletes"). Recently watched's have none: it's a history.
   */
  function VideoCard({ videoId, title, channel, href, sub, progress, lengthMs = null, remove = null, save }: {
    videoId: string;
    title: string;
    channel: string;
    href: string;
    sub: string;
    progress: { share: number; left: string } | null;
    /** The video's length, in its picture's corner where `progress` has none: Saved for later's cards have it. */
    lengthMs?: number | null;
    /** Taking it off its shelf (`REMOVE_FROM`), asked first; none on a shelf nothing is taken off. */
    remove?: { shelf: RemoveFrom; onRemove: () => void } | null;
    /** The save button at its picture's top left (`CardSave`), saving the video as this: Continue watching's cards have it. */
    save?: SaveVideo;
  }) {
    return (
      <div className="yc">
        <a className="yc-link" href={href}>
          <span className="yc-thumb">
            <img src={thumbnailAt(videoId)} alt="" loading="lazy" />
            {progress ? (
              <>
                <span className="yc-time">{progress.left}</span>
                <span className="yc-bar">
                  <i style={{ width: `${(progress.share * 100).toFixed(1)}%` }} />
                </span>
              </>
            ) : lengthMs ? (
              <span className="yc-time">{clock(lengthMs / 1000)}</span>
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
        {save ? <CardSave videoId={videoId} about={save} /> : null}
        {remove ? <RemoveVideo videoId={videoId} shelf={remove.shelf} onRemove={remove.onRemove} /> : null}
      </div>
    );
  }

  /**
   * A video's trash at its card's corner, and the question it asks first under the card's words; the card it stands in
   * (`.yc`, Continue watching's lead too) is tinted while it asks.
   */
  function RemoveVideo({ videoId, shelf, onRemove }: { videoId: string; shelf: RemoveFrom; onRemove: () => void }) {
    const [asking, setAsking] = useState(false);
    const words = REMOVE_FROM[shelf];
    return (
      <>
        <Button className="btn-icon is-danger yc-x" aria-label={words.label} aria-pressed={asking} onClick={() => setAsking((was) => !was)}>
          <Icon name="trash" />
        </Button>
        {asking ? (
          <div className="yc-ask panel-alarm">
            <Ask
              idPrefix={`yc-${videoId}-remove`}
              question={words.question}
              go={{ words: "Remove", busy: "Removing…" }}
              busy={false}
              failure={null}
              onKeep={() => setAsking(false)}
              onGo={() => {
                setAsking(false);
                onRemove();
              }}
            />
          </div>
        ) : null}
      </>
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
        <Icon name="bookmark" />
      </Button>
    );
  }

  /** How far into a video it was stopped, and what's left, as its picture says it. */
  const progressOf = (v: ContinueVideo) => ({ share: v.lengthMs > 0 ? v.stoppedAtMs / v.lengthMs : 0, left: leftWords(v.stoppedAtMs, v.lengthMs) });
  /**
   * The address that opens a video to go on with: the video alone, no time in it, so "Where you stopped last" decides
   * (offered, or jumped to, from Panki's latest stop). It carried the stop as a time marked as Panki's own until
   * 2026-10-22, which read as a moment asked for, and Jump automatically then stood aside (the owner: "why does clicking
   * a video from Panki's lists add the t=?").
   */
  const resumeAt = (v: ContinueVideo) => youtubeUrl({ videoId: v.videoId, seconds: null });
  /** A video left part-way as a save keeps it: its name, its channel, its length. */
  const aboutContinue = (v: ContinueVideo): SaveVideo => ({ title: v.title.slice(0, 300), channel: v.channel.slice(0, 100), lengthMs: v.lengthMs > 0 ? Math.min(86_400_000, v.lengthMs) : null });

  /**
   * The videos left part-way (the owner's pick of six, 2026-10-21: "Hero and the rest"): the one left last big, with
   * where it was stopped, what's left and Resume, the next ones under it as the site's own kind of card, each opening
   * where it was stopped; × puts one away until it's watched again.
   */
  function Shelf({ videos, max, tracking, onStale }: { videos: readonly ContinueVideo[]; max: number; tracking: boolean; onStale: () => void }) {
    const [gone, setGone] = useState<readonly string[]>([]);
    const [failure, setFailure] = useState<string | null>(null);
    const shown = videos.filter((v) => !gone.includes(v.videoId)).slice(0, max);
    const [first, ...rest] = shown;
    if (!first) return <EmptyShelf title="Continue watching" words={tracking ? "Nothing to continue." : `${VIDEO_TRACKING_OFF}.`} lead />;
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
              <span className="yc-bar">
                <i style={{ width: `${(lead.share * 100).toFixed(1)}%` }} />
              </span>
            </a>
            <CardSave videoId={first.videoId} about={aboutContinue(first)} />
            <RemoveVideo videoId={first.videoId} shelf="continue" onRemove={() => void putAway(first.videoId)} />
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
              <VideoCard key={v.videoId} videoId={v.videoId} title={v.title} channel={v.channel} href={resumeAt(v)} sub="" progress={progressOf(v)} remove={{ shelf: "continue", onRemove: () => void putAway(v.videoId) }} save={aboutContinue(v)} />
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
   * A shelf with nothing on it, as big as it is with videos, so nothing around it moves (the owner, 2026-10-29: an empty
   * shelf mustn't collapse and resize the others): `lead`, Continue watching's big picture and its words beside it as
   * quiet room; otherwise a row of cards' room. What's empty is said in it.
   */
  function EmptyShelf({ title, words, lead = false }: { title: string; words: string; lead?: boolean }) {
    return (
      <section className="yh-shelf" aria-label={title}>
        <h2 className="yh-h">{title}</h2>
        {lead ? (
          <div className="yh-lead">
            <div className="yh-lead-pic is-empty" />
            <p className="yh-empty">{words}</p>
          </div>
        ) : (
          <p className="yh-empty is-slot">{words}</p>
        )}
      </section>
    );
  }

  /**
   * A shelf of the site's own kind of card, as many as fit its row and Show more for the rest ("Fits the row" of the
   * artifact, the owner's pick for Saved for later, 2026-10-21). Saved for later and Recently watched are both this.
   */
  function RowShelf<T>({ title, items, empty, failure, card }: { title: string; items: readonly T[]; empty: string | null; failure: string | null; card: (item: T) => ReactNode }) {
    const [open, setOpen] = useState(false);
    const [row, setRow] = useState<HTMLDivElement | null>(null);
    const perRow = usePerRow(row);
    const shown = open ? items : items.slice(0, perRow);
    return (
      <section className="yh-shelf" aria-label={title}>
        <h2 className="yh-h">
          {title} {items.length > 0 ? <span className="yh-h-n">{items.length}</span> : null}
        </h2>
        {items.length === 0 && empty ? <p className="yh-empty is-slot">{empty}</p> : null}
        <div ref={setRow} className="yh-cards is-wrap">
          {shown.map(card)}
        </div>
        {items.length > perRow ? (
          <div className="yh-more">
            <Button className="yh-more-btn" aria-expanded={open} onClick={() => setOpen((was) => !was)}>
              {open ? "Show less" : `Show ${items.length - perRow} more`}
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

  /**
   * The videos saved for later with a thumbnail's save button, newest first (the owner, 2026-10-21: "I want to be able
   * to save videos for later… I don't want to use YouTube's Watch later or playlists"): each the site's own kind of
   * card opening the video, × taking the save back. Kept on the account's Panki, so every browser signed in sees them.
   */
  function SavedShelf({ videos }: { videos: readonly SavedVideo[] }) {
    const [failure, setFailure] = useState<string | null>(null);
    const now = Date.now();
    return (
      <RowShelf
        title="Saved for later"
        items={videos}
        // Empty, it says where saving is (the owner, 2026-10-21, before saving anything: "where can I see the videos I've marked to watch later? and how can I mark videos like that").
        empty="Nothing saved yet. Point at any video and press the bookmark at its top left."
        failure={failure}
        card={(v) => (
          <VideoCard
            key={v.videoId}
            videoId={v.videoId}
            title={v.title}
            channel={v.channel}
            href={youtubeUrl({ videoId: v.videoId, seconds: null })}
            sub={`Saved · ${agoWords(v.savedAt, now)}`}
            progress={null}
            lengthMs={v.lengthMs}
            remove={{
              shelf: "saved",
              onRemove: () => {
                setFailure(null);
                void setSaved(v.videoId, null).then((message) => setFailure(message));
              },
            }}
          />
        )}
      />
    );
  }

  /**
   * The videos finished, the latest first (the owner, 2026-10-25: "a 'recently watched'… for videos we FINISHED
   * watching", beside Continue watching and Saved for later): each the site's own kind of card opening the video from
   * its start, its length in its picture's corner and when it was finished under it. Nothing takes one out: it's a
   * history, like the site's own (the owner, 2026-10-29); the Finished chip under a video says it isn't finished.
   */
  function RecentShelf({ videos, tracking }: { videos: readonly FinishedVideo[]; tracking: boolean }) {
    const now = Date.now();
    if (!tracking) return <EmptyShelf title="Recently watched" words={`${VIDEO_TRACKING_OFF}.`} />;
    return (
      <RowShelf
        title="Recently watched"
        items={videos}
        empty="Nothing finished yet."
        failure={null}
        card={(v) => (
          <VideoCard
            key={v.videoId}
            videoId={v.videoId}
            title={v.title}
            channel={v.channel}
            href={youtubeUrl({ videoId: v.videoId, seconds: null })}
            sub={`Finished ${sinceWords(v.finishedAt, now)}`}
            progress={null}
            lengthMs={v.lengthMs > 0 ? v.lengthMs : null}
          />
        )}
      />
    );
  }

  // The chips sifting the site's feed (All, Japanese, Panki subtitles, Unwatched) stood here until the owner had them out, 2026-10-21.

  function Top() {
    const now = useSyncExternalStore(known.subscribe, known.get);
    const on = deps.modules();
    return (
      <div className="yt-home">
        {now.kind === "loading" ? null : now.kind === "failed" ? (
          on.homeShelf || on.homeSaved || on.homeRecent ? (
            <section className="yh-bar is-off">
              <p className="yh-bar-words">
                <Mark size={18} />
                <span>{now.signedOut ? "Not signed in." : now.message}</span>
              </p>
              <div className="yh-actions">
                {now.signedOut ? (
                  <Button variant="primary" className="yh-review" onClick={() => void askOptions("account")}>
                    <Icon name="signIn" />
                    Sign in
                  </Button>
                ) : (
                  <Button className="yh-review" onClick={() => void load()}>
                    <Icon name="refresh" />
                    Try again
                  </Button>
                )}
              </div>
            </section>
          ) : null
        ) : (
          <>
            {/* Continue watching and Saved for later side by side, half the row each (the owner, 2026-10-21: "it can appear in the same row… 50% 50%"); one switched off leaves the other the row. Empty, each still stands (2026-10-29). */}
            <div className="yh-shelves">
              {on.homeShelf ? <Shelf videos={now.home.stats.watching.continuing} max={SHELF_MAX} tracking={now.home.stats.watching.on} onStale={() => void load()} /> : null}
              {on.homeSaved ? <SavedShelf videos={now.home.saved} /> : null}
            </div>
            {/* Under them, the row of its own: the videos finished. */}
            {on.homeRecent ? <RecentShelf videos={now.home.stats.watching.finished} tracking={now.home.stats.watching.on} /> : null}
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

  /** A video's name, channel and length as the card around its thumbnail shows them, old grid and new: what a save keeps of it. Any may be unknown. */
  function aboutCard(link: Element): SaveVideo {
    const card = link.closest(VIDEO_CARD);
    const title = card?.querySelector(CARD_TITLE)?.textContent?.trim() ?? "";
    const channel = card?.querySelector(CARD_CHANNEL)?.textContent?.trim() ?? "";
    return { title: title.slice(0, 300), channel: channel.slice(0, 100), lengthMs: card ? lengthOn(card) : null };
  }

  /** The video's length, as its thumbnail's badge says it; null for one with none (a live stream, a badge not drawn yet). */
  function lengthOn(card: Element): number | null {
    for (const badge of card.querySelectorAll(CARD_BADGES)) {
      const text = badge.textContent?.trim() ?? "";
      const seconds = LENGTH_TEXT.test(text) ? parseStamp(text) : null;
      if (seconds !== null && seconds > 0) return Math.min(86_400_000, seconds * 1000);
    }
    return null;
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

  /**
   * What a thumbnail's mark says, as a key: a saved video's tick at its top right while saving is switched on, nothing
   * otherwise. How far you got, the cards made from it and whether Panki had its subtitles were marked on it too until
   * the owner had them out, 2026-10-28 ("I don't need it").
   */
  function sayOf(g: VideoGlance | null, on: Modules): string {
    return g !== null && on.thumbSave && g.saved ? "saved" : "";
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
    // Saved: a tick at the top right, seen without pointing at it. Saving itself is the floating button (`SaveFloat`).
    mark.root.innerHTML = `<style>${THUMB_CSS}</style><span class="saved">${TICK_ICON}</span>`;
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
        <Icon name="bookmark" />
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
      const grid = on.home && (on.homeShelf || on.homeSaved || on.homeRecent) ? document.querySelector(HOME_GRID) : null;
      const contents = grid?.querySelector(GRID_CONTENTS) ?? null;
      if (!contents) top.host.remove();
      else {
        if (top.host.nextElementSibling !== contents) contents.before(top.host);
        alignTop(contents);
      }
      top.host.dataset.theme = theme;
      if (on.home && !asked) void load();

      sift(on);

      // A saved video's tick on every thumbnail on the page.
      if (!on.thumbSave) {
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

/** A saved video's tick. Drawn as the app's icons are, on a 24-unit grid. */
const TICK_ICON = `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/** A thumbnail's mark, in its own shadow root: a saved video's tick. The tokens come from the host (`tokensOn`). */
const THUMB_CSS = `
:host { all: initial; }
svg { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }
/* Saved for later: a tick in the accent at the top right. */
.saved {
  position: absolute; top: 6px; right: 6px;
  display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px;
  background: var(--accent); color: var(--accent-ink);
}
.saved svg { width: 14px; height: 14px; stroke-width: 2.6; }
`;
