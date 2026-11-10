/** @panki Which of Panki's parts are on in this browser, the panel's views, the pill's parts, the player bar's controls (`Modules`, `PANEL_VIEWS`, `PILL_PARTS`, `BAR_CONTROLS`). */
import { z } from "zod";
import type { IconName } from "@web/components/Icon";

/**
 * Which of Panki's parts are on in this browser, each switched on the options page under the panel of what it's about,
 * the Panki panel, the Word pop-up and the seek bar marks each on to begin with; what happens, on a video watched
 * before, where it was stopped; and how Panki reshapes YouTube's own pages. The shapes live here, apart from
 * `storage.ts`, so a page's script carries no storage code; the page gets them with the rest of this browser's settings
 * (`messages.ts` → `Local`, `local.ts`). Video tracking isn't here: it's `Local`'s own `tracking`, `watch/tracking.ts`.
 */

/**
 * What opening a video watched before does with where it was stopped: offer it on a button for a few seconds; jump
 * there, but never over a time the link itself asked for (a `t=` the page was opened with, a card's moment); or jump
 * there always, even over that, the words saying plainly which one overrides the link. Named by what's seen. A browser
 * that kept the old third choice, only marked on the bar (the mark has its own switch), reads as the button.
 */
export const ResumeHow = z.enum(["offer", "continue", "always"]);
export type ResumeHow = z.infer<typeof ResumeHow>;
export const RESUME_HOW: Record<ResumeHow, string> = { offer: "Show a button", continue: 'Jump, unless the link contains a timestamp ("?t=")', always: 'Always jump, ignoring the link\'s timestamp ("?t=")' };
export const RESUME_HOW_IDS = ResumeHow.options;
/**
 * With "Jump, unless the link has a time", what a link with a time of its own does about where the video was stopped:
 * offer it on the button all the same, or nothing.
 */
export const ResumeTimed = z.enum(["offer", "nothing"]);
export type ResumeTimed = z.infer<typeof ResumeTimed>;
export const RESUME_TIMED: Record<ResumeTimed, string> = { offer: "Show a button", nothing: "Do nothing" };
export const RESUME_TIMED_IDS = ResumeTimed.options;
/**
 * How many seconds before where it was stopped a video goes back to: by a jump, the button or the stop's tag on the bar. 0, exactly there, to begin with.
 */
export const RESUME_BACK_MAX = 60;
export const ResumeBack = z.number().int().min(0).max(RESUME_BACK_MAX);
/** Where going back to a stop lands: that many seconds before it, never before the video's start. */
export const resumeTo = (stop: number, back: number): number => Math.max(0, stop - back);

/**
 * What the video does once a card from it is in: goes on as it was before the drawer held it, stays paused, or plays.
 * As before to begin with.
 */
export const AfterAdd = z.enum(["before", "pause", "play"]);
export type AfterAdd = z.infer<typeof AfterAdd>;
export const AFTER_ADD: Record<AfterAdd, string> = { before: "As before", pause: "Pause", play: "Play" };
export const AFTER_ADD_IDS = AfterAdd.options;

/**
 * How the Panki panel stands on a video's page, picked on the panel itself as a view of it: under the player, two rows
 * following the video; or beside the video, in the watch page's right column, the whole transcript listed with its
 * times. One registry. Beside the video to begin with (a browser that picked keeps its pick: only a pick is written). The site's own full screen (the Stage in the code) puts the panel
 * in a column beside the video whichever view is picked: a full screen has no "under". A browser that kept "stage" as a
 * view reads as beside the video (`storage.ts`).
 */
export const PanelView = z.enum(["under", "beside"]);
export type PanelView = z.infer<typeof PanelView>;
export const PANEL_VIEWS: Record<PanelView, { name: string; icon: "panelUnder" | "panelBeside" }> = {
  under: { name: "Under the player", icon: "panelUnder" },
  beside: { name: "Beside the video", icon: "panelBeside" },
};
export const PANEL_VIEW_IDS = PanelView.options;
/**
 * A key of one of the page's own actions (the panel toggled in full screen, the subtitles toggled), set by pressing it
 * (the web's `KeyField`) and kept as Panki's Settings → Keybinds keeps a key (`@web/keys` → `keyOf`: "p", "Ctrl+p",
 * "Shift"), heard by `pressed`. A browser that kept a letter as its physical key ("KeyP", when the panel's key was one
 * of a few letters picked from a list) reads as that letter.
 */
export const BoundKey = z
  .string()
  .min(1)
  .transform((key) => (/^Key[A-Z]$/.test(key) ? key.slice(3).toLowerCase() : key));
export type BoundKey = z.infer<typeof BoundKey>;
/**
 * How wide the panel's column stands at the page's right, beside the video and in the site's full screen, in pixels,
 * as its left edge was last dragged; null is the site's own width (`content/youtube.tsx` → `WIDTH_CSS`). A drag is
 * held between these two, and nearer still so the video keeps `PLAYER_MIN_WIDTH` of the room.
 */
export const PANEL_WIDTH_MIN = 300;
export const PANEL_WIDTH_MAX = 1600;
export const PanelWidth = z.number().int().min(PANEL_WIDTH_MIN).max(PANEL_WIDTH_MAX).nullable();
export type PanelWidth = z.infer<typeof PanelWidth>;
/** The least the video is left beside a dragged panel. */
export const PLAYER_MIN_WIDTH = 480;
/** A dragged width held inside its bounds: never narrower than a panel needs, never leaving the video less than `PLAYER_MIN_WIDTH` of the room (`room`: from the video's left edge to the panel's right). */
export const panelWidthOf = (dragged: number, room: number): number => Math.round(Math.max(PANEL_WIDTH_MIN, Math.min(dragged, PANEL_WIDTH_MAX, room - PLAYER_MIN_WIDTH)));

// A browser that kept `feedFilter` or `homeChips`, the chips that once sifted YouTube's home feed, keeps them unread.

/**
 * What Panki's pill in YouTube's header bar can say, one registry, every part of it chosen: each a number of the account's, drawn as its icon and value.
 * The pill is the mark, then the parts picked, in the order picked. A new part is one entry here and one value in
 * `ui/PankiPill.tsx` → `pillValue`.
 */
export const PillPart = z.enum(["watched", "due", "reviews", "reviewTime", "streak"]);
export type PillPart = z.infer<typeof PillPart>;
export const PILL_PARTS: Record<PillPart, string> = {
  watched: "Watched today",
  due: "Cards due",
  reviews: "Reviews today",
  reviewTime: "Time reviewing today",
  streak: "Review streak",
};
export const PILL_PART_IDS = PillPart.options;
/** The pill's parts as kept: every part once, in the order chosen, each shown or not. */
export const PillLayout = z.array(z.object({ id: PillPart, shown: z.boolean() })).max(PILL_PART_IDS.length);
export type PillLayout = z.infer<typeof PillLayout>;
/** A kept layout made whole: a part it doesn't name (one added since) is put at its end, hidden; one named twice counts once. */
export function pillLayoutOf(kept: PillLayout): PillLayout {
  const seen = new Set<PillPart>();
  const known = kept.filter((part) => !seen.has(part.id) && seen.add(part.id));
  return [...known, ...PILL_PART_IDS.filter((id) => !seen.has(id)).map((id) => ({ id, shown: false }))];
}
/** Minutes watched today alone, as the pill said until it could be laid out. */
export const DEFAULT_PILL: PillLayout = pillLayoutOf([{ id: "watched", shown: true }]);

/**
 * The player's control bar, every control of it one entry, shown, hidden and ordered as in an editor behind one
 * switch: YouTube's own and Panki's alike, each with its name, the
 * cluster it stands in (the bar's left or its right, two boxes of the site's own, so a control is moved only within
 * its own), whose it is, and how it's found: a YouTube control by its CSS selector inside its cluster (the site's own
 * class names, as they were when this was written: when the site renames one, this is where to look), a Panki control
 * by its place, drawn by the page (`content/youtube.tsx` → `barDrawn`) and on the options page (`options/PlayerBar.tsx`).
 * The order here is YouTube's own, Speed first among the right-hand controls and the end time after the time, as they
 * stood before they could be laid out, then Watching after the end time, Save for later after Speed and Subtitles before
 * Captions, where a kept layout from before them takes them in (`barLayoutOf`); `shown` is each one's to begin with. A
 * new control is one entry.
 *
 * Only the controls that always stand on YouTube's current player are entries (no Previous, Next, Chapter, Miniplayer
 * or Play on TV). A control a page adds now and then (a playlist's Previous and Next) is left exactly as the site draws
 * it; one kept in a layout reads as gone.
 */
export type BarSide = "left" | "right";
type BarEntry = { name: string; side: BarSide; icon: IconName; shown: boolean } & ({ from: "youtube"; find: string } | { from: "panki" });
export const BAR_CONTROL_IDS = ["play", "volume", "time", "endTime", "watching", "speed", "save", "autoplay", "pankiSubtitles", "captions", "settings", "theater", "fullscreen"] as const;
export const BarControl = z.enum(BAR_CONTROL_IDS);
export type BarControl = z.infer<typeof BarControl>;
export const BAR_CONTROLS = {
  play: { name: "Play / pause", side: "left", icon: "play", shown: true, from: "youtube", find: ".ytp-play-button" },
  volume: { name: "Volume", side: "left", icon: "quiet", shown: true, from: "youtube", find: ".ytp-volume-area" },
  time: { name: "Time", side: "left", icon: "clock", shown: true, from: "youtube", find: ".ytp-time-display" },
  endTime: { name: "Video end time", side: "left", icon: "ends", shown: true, from: "panki" },
  // Finished or not, and saved for later: Panki's own, there only while Panki is on and signed in.
  watching: { name: "Watching", side: "left", icon: "clock", shown: true, from: "panki" },
  speed: { name: "Speed button", side: "right", icon: "speed", shown: true, from: "panki" },
  save: { name: "Save for later", side: "right", icon: "bookmark", shown: true, from: "panki" },
  // The autoplay switch is a button of the site's holding its own toggle: found by what it holds.
  autoplay: { name: "Autoplay", side: "right", icon: "autoplay", shown: true, from: "youtube", find: ".ytp-button:has(.ytp-autonav-toggle-button)" },
  // The subtitles off, or back to the pick last shown (`ui/SubtitlesControl.tsx`): Panki's own, there only while Panki and its
  // panel are on; it stands where the site's Captions does. Its id isn't "subtitles", which a layout kept in Captions' first
  // hour names Captions by (`KeptBar`).
  pankiSubtitles: { name: "Subtitles", side: "right", icon: "subtitles", shown: true, from: "panki" },
  // Hidden to begin with: Panki's own subtitles are picked in its panel.
  captions: { name: "Captions", side: "right", icon: "subtitles", shown: false, from: "youtube", find: ".ytp-subtitles-button" },
  settings: { name: "Settings", side: "right", icon: "gear", shown: true, from: "youtube", find: ".ytp-settings-button" },
  theater: { name: "Theatre mode", side: "right", icon: "theater", shown: true, from: "youtube", find: ".ytp-size-button" },
  fullscreen: { name: "Full screen", side: "right", icon: "expand", shown: true, from: "youtube", find: ".ytp-fullscreen-button" },
} as const satisfies Record<BarControl, BarEntry>;
/** Panki's own controls on the bar: each drawn by the page into a place of its own. */
export type PankiBarControl = { [Id in BarControl]: (typeof BAR_CONTROLS)[Id]["from"] extends "panki" ? Id : never }[BarControl];
export const isPankiBar = (id: BarControl): id is PankiBarControl => BAR_CONTROLS[id].from === "panki";
export const PANKI_BAR_IDS: readonly PankiBarControl[] = BAR_CONTROL_IDS.filter(isPankiBar);
/** Whose a control is, as its row on the options page says it. */
export const BAR_FROM: Record<BarEntry["from"], string> = { youtube: "YouTube", panki: "Panki" };
/** The player's own two boxes of controls, the bar's left and its right. */
export const BAR_SIDES: Record<BarSide, { name: string; find: string }> = {
  left: { name: "Left", find: ".ytp-left-controls" },
  right: { name: "Right", find: ".ytp-right-controls" },
};
export const BAR_SIDE_IDS: readonly BarSide[] = ["left", "right"];
/** The bar as kept: every control once, in the order chosen (each side's its own), each shown or not. */
export const BarLayout = z.array(z.object({ id: BarControl, shown: z.boolean() })).max(BAR_CONTROL_IDS.length);
export type BarLayout = z.infer<typeof BarLayout>;
/**
 * A bar as this browser kept it, read whatever it names: a control that's gone (Previous, Next, Chapter, Miniplayer,
 * Play on TV, and Panki's own Theatre mode, `pankiTheatre`, which the site's full screen took the place of) is let go, Captions kept as "subtitles" for its first hour is Captions, and the rest made whole.
 */
export const KeptBar = z
  .array(z.object({ id: z.string(), shown: z.boolean() }))
  .max(64)
  .transform((kept) =>
    barLayoutOf(
      kept.flatMap((control) => {
        const id = BarControl.safeParse(control.id === "subtitles" ? "captions" : control.id);
        return id.success ? [{ id: id.data, shown: control.shown }] : [];
      }),
    ),
  );
/**
 * A kept bar made whole: a control named twice counts once, and one it doesn't name (added since) goes where it stands
 * in YouTube's own order, after the last control that comes before it here, shown as it is to begin with.
 */
export function barLayoutOf(kept: BarLayout): BarLayout {
  const seen = new Set<BarControl>();
  const whole = kept.filter((control) => !seen.has(control.id) && seen.add(control.id));
  BAR_CONTROL_IDS.forEach((id, rank) => {
    if (seen.has(id)) return;
    let after = -1;
    whole.forEach((control, i) => {
      if (BAR_CONTROL_IDS.indexOf(control.id) < rank) after = i;
    });
    whole.splice(after + 1, 0, { id, shown: BAR_CONTROLS[id].shown });
    seen.add(id);
  });
  return whole;
}
/** The bar as it stood before it could be laid out: YouTube's own, Speed first on the right, the end time after the time. */
export const DEFAULT_BAR: BarLayout = barLayoutOf([]);
/** One side's controls, in the order chosen. */
export const barSide = (layout: BarLayout, side: BarSide): BarLayout => layout.filter((control) => BAR_CONTROLS[control.id].side === side);
/** Whether a control is on the bar as laid out: the bar laid out by Panki, and the control shown there. */
export const barShows = (on: boolean, layout: BarLayout, id: BarControl): boolean => on && layout.some((control) => control.id === id && control.shown);
/**
 * Whether YouTube's own controls stand in another order than YouTube's: only then are they moved on the page, so a
 * bar never reordered leaves every node of the site's exactly where the site put it.
 */
export const barReordered = (layout: BarLayout): boolean => {
  const youtubeOn = (ids: readonly BarControl[], side: BarSide) => ids.filter((id) => BAR_CONTROLS[id].from === "youtube" && BAR_CONTROLS[id].side === side);
  const ids = layout.map((control) => control.id);
  return BAR_SIDE_IDS.some((side) => {
    const own = youtubeOn(BAR_CONTROL_IDS, side);
    return youtubeOn(ids, side).some((id, i) => id !== own[i]);
  });
};

/**
 * How many videos the Continue watching shelf on YouTube's home carries: always 5. A browser that kept a `shelfMax`
 * from when it was a choice keeps it unread.
 */
export const SHELF_MAX = 5;

/** The key held with ← or → for a short skip (`Modules.shortSkip`): one, held alone. */
export const SKIP_KEYS = ["shift", "ctrl", "alt"] as const;
export const SkipKey = z.enum(SKIP_KEYS);
export type SkipKey = z.infer<typeof SkipKey>;
/** How far a short skip goes, in seconds, to a tenth. */
export const SKIP_SECONDS_MIN = 0.1;
export const SKIP_SECONDS_MAX = 60;
export const SkipSeconds = z.number().min(SKIP_SECONDS_MIN).max(SKIP_SECONDS_MAX);

export const Modules = z.object({
  /**
   * Panki at all, in this browser: switched on YouTube where `switchInPill` says (the pill in the header bar, or the
   * strip's head) and on the options page. Off, everything is off, transcribing and the dictionary included, on every
   * video until it's turned back on: every part below reads as off, whatever its own switch says; the switch's place
   * stays, with only the switch to turn it back on.
   */
  on: z.boolean(),
  /** The Panki panel on a video's page: the line under the player, the drawer, the transcript over the video, transcribing. */
  panel: z.boolean(),
  /** Where the panel stands on a video's page (`PanelView`); beside the video, always above the site's recommendations. */
  panelView: PanelView,
  /** How wide its column stands beside the video and in full screen, dragged by its left edge (`PanelWidth`); the site's own to begin with. */
  panelWidth: PanelWidth,
  /** In the site's full screen, the key that toggles the panel (`content/youtube.tsx` → `PAGE_KEYS`). P to begin with. */
  panelKey: BoundKey,
  /**
   * The key that turns the subtitles off, or back to the pick last shown, as the bar's Subtitles button does
   * (`content/youtube.tsx` → `PAGE_KEYS`, `subtitles.ts` → `toggledSource`). C to begin with, taking the site's own
   * captions key.
   */
  subtitlesKey: BoundKey,
  /**
   * In the site's full screen, whether the panel stands at the screen's right or is folded away, the video alone
   * filling the screen: flipped by its key and its handle and kept, so a full screen opens as the last was left.
   * Hidden to begin with.
   */
  fullPanel: z.boolean(),
  /** In the site's full screen, whether the button that brings the folded panel back stands in the screen's top-right corner (`ui/PanelButton.tsx`); shown to begin with. */
  panelButton: z.boolean(),
  /** Looking a word up by pointing at it, on every site. */
  lookup: z.boolean(),
  /** Panki's marks on a video's seek bar, all of them (each mark's own Shown / Hidden is under Seek bar). */
  seek: z.boolean(),
  resume: ResumeHow,
  resumeTimed: ResumeTimed,
  resumeBack: ResumeBack,
  /** Where a video was stopped, marked on its seek bar (while the marks are on). */
  markStop: z.boolean(),
  /** Whether the video plays once a card from it is in. */
  afterAdd: AfterAdd,
  /**
   * YouTube's home made Panki's, shaped around learning while still looking and feeling like YouTube: the master
   * switch, and each part its own under it in the options page's YouTube home panel.
   */
  home: z.boolean(),
  /** Panki in the site's own header bar: the mark and the parts picked (`pill`). */
  homePill: z.boolean(),
  pill: PillLayout,
  // No `pillPower`: the switch is at the pill's end whenever the pill is on (`switchInPill`).
  /** The Continue watching shelf: the one left last big, the rest as the site's own kind of card under it. */
  homeShelf: z.boolean(),
  /** The Saved for later shelf under it: the videos saved with a thumbnail's save button. */
  homeSaved: z.boolean(),
  /** The Recently watched shelf under them: the videos finished, the latest first. */
  homeRecent: z.boolean(),
  /** The save button on every thumbnail (on hover with a mouse; always without one). */
  thumbSave: z.boolean(),
  /** Whether Shorts stay on YouTube's pages: their shelves and their videos among the rest. Shown to begin with: nothing of the site's is taken away unasked. A YouTube utility: it holds whether or not Panki is on. */
  shorts: z.boolean(),
  /**
   * The player's control bar laid out by Panki (a YouTube utility: there whether or not Panki is on): its controls
   * shown, hidden and ordered as `bar` says, Panki's among them (the speed button, when the video will end, and with
   * Panki on, Watching and Save for later). Off,
   * the bar is YouTube's own, with nothing of Panki's in it. On to begin with, laid out as the site lays it out.
   */
  playerBar: z.boolean(),
  bar: BarLayout,
  /**
   * With the bar laid out by Panki, whether it stays on the video as it plays rather than fading a few seconds after
   * the pointer rests: in full screen (`barKeptFull`) and out of it (`barKeptNotFull`), each its own. In full screen On
   * to begin with, out of it Off.
   */
  barKeptFull: z.boolean(),
  barKeptNotFull: z.boolean(),
  /**
   * ← or → with `shortSkipKey` held goes back or on by `shortSkipSeconds` in place of the site's 5 s (a YouTube
   * utility): on, Shift, 2.5 s to begin with.
   */
  shortSkip: z.boolean(),
  shortSkipKey: SkipKey,
  shortSkipSeconds: SkipSeconds,
});
export type Modules = z.infer<typeof Modules>;
export const DEFAULT_MODULES: Modules = {
  on: true,
  panel: true,
  panelView: "beside",
  panelWidth: null,
  panelKey: "p",
  subtitlesKey: "c",
  fullPanel: false,
  panelButton: true,
  lookup: true,
  seek: true,
  resume: "offer",
  resumeTimed: "offer",
  resumeBack: 0,
  markStop: true,
  afterAdd: "before",
  home: true,
  homePill: true,
  pill: DEFAULT_PILL,
  homeShelf: true,
  homeSaved: true,
  homeRecent: true,
  thumbSave: true,
  shorts: true,
  playerBar: true,
  bar: DEFAULT_BAR,
  barKeptFull: true,
  barKeptNotFull: false,
  shortSkip: true,
  shortSkipKey: "shift",
  shortSkipSeconds: 2.5,
};

/**
 * Where Panki's own on / off switch is, in one place only: at the end of the pill in YouTube's header bar while that's
 * on (YouTube home's master switch and its Header bar), the pill then staying while Panki is off as the mark and the
 * switch alone; otherwise in the strip under a video. Read on what's switched, not
 * on what's on while Panki is off.
 */
export const switchInPill = (raw: Pick<Modules, "home" | "homePill">): boolean => raw.home && raw.homePill;

/** How long the button offering to continue stays on the picture, in ms, before it goes by itself. */
export const OFFER_MS = 6_000;
/** How long it takes to fade as it goes, in ms; the same as its CSS. */
export const OFFER_AWAY_MS = 260;
