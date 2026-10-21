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
export const ResumeHow = z.enum(["offer", "continue"]);
export type ResumeHow = z.infer<typeof ResumeHow>;
export const RESUME_HOW: Record<ResumeHow, string> = { offer: "Show a button", continue: "Jump automatically" };
export const RESUME_HOW_IDS = ResumeHow.options;

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

/** How many videos the Continue watching shelf carries: one row of the site's grid, two, or all Panki keeps (`WATCH.continueMax`). */
export const ShelfMax = z.union([z.literal(4), z.literal(8), z.literal(12)]);
export type ShelfMax = z.infer<typeof ShelfMax>;
export const SHELF_SIZES: readonly ShelfMax[] = [4, 8, 12];

export const Modules = z.object({
  /**
   * Panki at all, in this browser: switched in the strip's head on a video's page and on the options page (the owner,
   * 2026-10-21: "disabling it disables everything including transcription, including for future videos, until I turn
   * it back on, including the dictionary"). Off, every part below reads as off, whatever its own switch says, and the
   * strip stays as its head alone, with the switch to turn it back on.
   */
  on: z.boolean(),
  /** The Panki panel on a video's page: the line under the player, the drawer, the transcript over the video, transcribing. */
  panel: z.boolean(),
  /** Looking a word up by pointing at it, on every site. */
  lookup: z.boolean(),
  /** Panki's marks on a video's seek bar, all of them (each mark's own Shown / Hidden is under Seek bar). */
  seek: z.boolean(),
  resume: ResumeHow,
  /** Where a video was stopped, marked on its seek bar (while the marks are on). */
  markStop: z.boolean(),
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
  /**
   * Panki's own on / off switch at the pill's end, the one the strip under a video has (the owner, 2026-10-21). While
   * it's shown the pill stays with Panki off, the mark and the switch alone, so Panki can be turned back on from there.
   */
  pillPower: z.boolean(),
  /** The line over the recommendations: the day, today's minutes, who else watched today, and Review. */
  homeLine: z.boolean(),
  /** The Continue watching shelf: the one left last big, the rest as the site's own kind of card under it. */
  homeShelf: z.boolean(),
  shelfMax: ShelfMax,
  /** The Saved for later shelf under it: the videos saved with a thumbnail's save button. */
  homeSaved: z.boolean(),
  /** The save button on every thumbnail (on hover with a mouse; always without one). */
  thumbSave: z.boolean(),
  /** Whether Shorts stay on YouTube's pages: their shelves and their videos among the rest. Shown to begin with: nothing of the site's is taken away unasked. A YouTube utility, the owner's word (2026-10-21): it holds whether or not Panki is on. */
  shorts: z.boolean(),
  /** On every video's thumbnail anywhere on YouTube: how far you got with Panki, the cards made from it, whether Panki has its subtitles. */
  thumbs: z.boolean(),
  /** The player's speed changed from a button among its own controls (a YouTube utility, 2026-10-21): there whether or not Panki is on. */
  speedControl: z.boolean(),
});
export type Modules = z.infer<typeof Modules>;
export const DEFAULT_MODULES: Modules = {
  on: true,
  panel: true,
  lookup: true,
  seek: true,
  resume: "offer",
  markStop: true,
  home: true,
  homePill: true,
  pill: DEFAULT_PILL,
  pillPower: false,
  homeLine: true,
  homeShelf: true,
  shelfMax: 4,
  homeSaved: true,
  thumbSave: true,
  shorts: true,
  thumbs: true,
  speedControl: true,
};

/** How long the button offering to continue stays on the picture, in ms, before it goes by itself. */
export const OFFER_MS = 12_000;
/** How long it takes to fade as it goes, in ms; the same as its CSS. */
export const OFFER_AWAY_MS = 260;
