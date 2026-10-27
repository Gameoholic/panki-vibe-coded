import { z } from "zod";

/**
 * Which of Panki's parts are on in this browser, each switched on the options page's Modules tab (the owner,
 * 2026-10-21: "the entire Panki panel toggleable, enabled by default… the [Shift] panel toggleable, enabled by default…
 * the seek bar marks, ON by default"); what happens, on a video watched before, where it was stopped; and how Panki
 * reshapes YouTube's own pages. The shapes live here, apart from `storage.ts`, so a page's script carries no storage
 * code; the worker hands them to the page (`askModules`). Video tracking isn't here: it's about what's kept of the
 * account, so it's the account's, in Panki's Settings.
 */

/**
 * Where a video was stopped, as it opens again: a button on the picture for a few seconds, or the video there by itself
 * (a third, only marked on the bar, went on 2026-10-21: the mark has its own switch). Named by what's seen, at the
 * owner's word the same day ("Offered and Continued are super abstract"); a browser that kept the third reads as the first.
 */
/**
 * What opening a video watched before does with where it was stopped: offer it on a button; jump there, but never over
 * a time the link itself asked for (a `t=` the page was opened with, a card's moment); or jump there always, even over
 * that (the owner, 2026-10-22: "another one which will ALWAYS jump, even override the t=, but it needs to be clear that
 * the other one doesn't override it").
 */
export const ResumeHow = z.enum(["offer", "continue", "always"]);
export type ResumeHow = z.infer<typeof ResumeHow>;
export const RESUME_HOW: Record<ResumeHow, string> = { offer: "Show a button", continue: 'Jump, unless the link contains a timestamp ("?t=")', always: 'Always jump, ignoring the link\'s timestamp ("?t=")' };
export const RESUME_HOW_IDS = ResumeHow.options;
/**
 * With "Jump, unless the link has a time", what a link with a time of its own does about where the video was stopped:
 * offer it on the button all the same, or nothing (the owner, 2026-10-22: "the settings need to be clear about it or
 * provide an option not to").
 */
export const ResumeTimed = z.enum(["offer", "nothing"]);
export type ResumeTimed = z.infer<typeof ResumeTimed>;
export const RESUME_TIMED: Record<ResumeTimed, string> = { offer: "Show a button", nothing: "Do nothing" };
export const RESUME_TIMED_IDS = ResumeTimed.options;
/**
 * How many seconds before where it was stopped a video goes back to (the owner, 2026-10-26: "optionally jump to X
 * seconds before"): by a jump, the button or the stop's tag on the bar. 0, exactly there, to begin with.
 */
export const RESUME_BACK_MAX = 60;
export const ResumeBack = z.number().int().min(0).max(RESUME_BACK_MAX);
/** Where going back to a stop lands: that many seconds before it, never before the video's start. */
export const resumeTo = (stop: number, back: number): number => Math.max(0, stop - back);

/**
 * What the video does once a card from it is in (the owner, 2026-10-27: "always pause, always unpause or depending"):
 * goes on as it was before the drawer held it, stays paused, or plays. As before to begin with, as it always did.
 */
export const AfterAdd = z.enum(["before", "pause", "play"]);
export type AfterAdd = z.infer<typeof AfterAdd>;
export const AFTER_ADD: Record<AfterAdd, string> = { before: "As before", pause: "Pause", play: "Play" };
export const AFTER_ADD_IDS = AfterAdd.options;

// Chips sifting YouTube's home feed (All, Japanese, Panki subtitles, Unwatched) stood here until the owner had them
// out, 2026-10-21 ("in the home page remove this line"); a browser that kept `feedFilter` or `homeChips` keeps them unread.

/**
 * What Panki's pill in YouTube's header bar can say, one registry (the owner, 2026-10-21: "make it so I can completely
 * customize this widget, including what to put there"): each a number of the account's, drawn as its icon and value.
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
 * How many videos the Continue watching shelf on YouTube's home carries: always 5 (the owner, 2026-10-22; it was a
 * choice, 4 / 8 / 12 and then 5 / 10 / 15, until the same day). A browser that kept `shelfMax` keeps it unread.
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
   * strip's head) and on the options page (the owner, 2026-10-21: "disabling it disables everything including
   * transcription, including for future videos, until I turn it back on, including the dictionary"). Off, every part
   * below reads as off, whatever its own switch says; the switch's place stays, with only the switch to turn it back on.
   */
  on: z.boolean(),
  /** The Panki panel on a video's page: the line under the player, the drawer, the transcript over the video, transcribing. */
  panel: z.boolean(),
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
   * YouTube's home made Panki's (the owner, 2026-10-21: "redesign YouTube around our goals whilst still looking and
   * feeling like YouTube… our own super deluxe premium YouTube"; of seven mock-ups they picked Shelves, with the
   * Continue watching shelf alone, "but make it customizable in settings"): the master switch, and each part its own
   * under it in the options page's YouTube home panel.
   */
  home: z.boolean(),
  /** Panki in the site's own header bar: the mark and the parts picked (`pill`). */
  homePill: z.boolean(),
  pill: PillLayout,
  // `pillPower` (Panki's switch at the pill's end, shown or not) went on 2026-10-22: the switch is the pill's whenever
  // the pill is on (`switchInPill`).
  /** The line over the recommendations: the day, today's minutes, who else watched today, and Review. */
  homeLine: z.boolean(),
  /** The Continue watching shelf: the one left last big, the rest as the site's own kind of card under it. */
  homeShelf: z.boolean(),
  /** The Saved for later shelf under it: the videos saved with a thumbnail's save button. */
  homeSaved: z.boolean(),
  /** The Recently watched shelf under them: the videos finished, the latest first (2026-10-25). */
  homeRecent: z.boolean(),
  /** The save button on every thumbnail (on hover with a mouse; always without one). */
  thumbSave: z.boolean(),
  /** Whether Shorts stay on YouTube's pages: their shelves and their videos among the rest. Shown to begin with: nothing of the site's is taken away unasked. A YouTube utility, the owner's word (2026-10-21): it holds whether or not Panki is on. */
  shorts: z.boolean(),
  /** On every video's thumbnail anywhere on YouTube: how far you got with Panki, the cards made from it, whether Panki has its subtitles. */
  thumbs: z.boolean(),
  /** The player's speed changed from a button among its own controls (a YouTube utility, 2026-10-21): there whether or not Panki is on. */
  speedControl: z.boolean(),
  /** When the video will end on this device's clock, after the player's own time (a YouTube utility, 2026-10-25): on to begin with, as the speed button is (the owner's word). */
  endTime: z.boolean(),
  /**
   * ← or → with `shortSkipKey` held goes back or on by `shortSkipSeconds` in place of the site's 5 s (a YouTube utility,
   * the owner, 2026-10-26: "holding shift/ctrl/alt… will instead do a (customizable) 1s back/after"): on, Shift, 1 s to begin with.
   */
  shortSkip: z.boolean(),
  shortSkipKey: SkipKey,
  shortSkipSeconds: SkipSeconds,
});
export type Modules = z.infer<typeof Modules>;
export const DEFAULT_MODULES: Modules = {
  on: true,
  panel: true,
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
  homeLine: true,
  homeShelf: true,
  homeSaved: true,
  homeRecent: true,
  thumbSave: true,
  shorts: true,
  thumbs: true,
  speedControl: true,
  endTime: true,
  shortSkip: true,
  shortSkipKey: "shift",
  shortSkipSeconds: 1,
};

/**
 * Where Panki's own on / off switch is, in one place only (the owner, 2026-10-22): at the end of the pill in YouTube's
 * header bar while that's on (YouTube home's master switch and its Header bar), the pill then staying while Panki is
 * off as the mark and the switch alone; otherwise in the strip under a video, as it was. Read on what's switched, not
 * on what's on while Panki is off.
 */
export const switchInPill = (raw: Pick<Modules, "home" | "homePill">): boolean => raw.home && raw.homePill;

/** How long the button offering to continue stays on the picture, in ms, before it goes by itself. */
export const OFFER_MS = 12_000;
/** How long it takes to fade as it goes, in ms; the same as its CSS. */
export const OFFER_AWAY_MS = 260;
