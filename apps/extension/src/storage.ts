/** @panki What the extension keeps in the browser, and its profiles (`readStore`, `writeStore`, `forgetSignIn`, `Profile`, `activeProfile`). */
import { z } from "zod";
import { DEFAULT_SUBTITLE_STYLE, DeckId, SubtitleStyle, TranscribeMode } from "@panki/contracts";
import { HOVER_DELAY, HoverDelay, LookKey, LookWhere } from "./lookSettings";
import { OptionsTab, type Local } from "./messages";
import { AfterAdd, BoundKey, DEFAULT_BAR, DEFAULT_MODULES, KeptBar, PanelView, PanelWidth, PillLayout, ResumeBack, ResumeHow, ResumeTimed, SkipKey, SkipSeconds, pillLayoutOf, type BarLayout, type Modules } from "./modules";
import { PopupLayout } from "./popupLayout";
import { FieldMap } from "./roles";
import { DEFAULT_SEEK_LOOK, MarkPaint, SeekLook } from "./seekLook";
import { sourceOf, sourceShownOf } from "./subtitles";
import { DEFAULT_PREFS, TranscribeTrigger, type TranscribePrefs } from "./transcribe/prefs";

/**
 * What the extension keeps on this browser, in its own storage: where Panki is, the sign-in, what fills each deck's
 * fields, the deck the drawer opens on, how the drawer and looking a word up are set to behave, and how the popup is
 * laid out. (The dictionaries
 * themselves are in the browser's database: `dictionary/store.ts`.) Only the background and the options page
 * read it; a page's script never does, so the sign-in's secret never sits in someone else's page: it gets what it
 * draws by as one value from the worker (`localOf`, `local.ts`). Read defensively: a key that's missing or broken is
 * its empty value, never a crash.
 */
/**
 * One sign-in: who, at which Panki, with the session's secret. The one in use is `address` / `token` / `userName`
 * (kept apart, so the worker and every page read the sign-in as they always have); the others wait in `profiles`.
 */
const Profile = z.object({
  /** Panki's origin, "https://panki.example". */
  address: z.string(),
  /** The session's secret, from a bearer sign-in. Never logged, never sent anywhere but `address`. */
  token: z.string(),
  userName: z.string(),
  /** A name given to it ("Prod", "Dev"); empty is none, and it's shown by `userName` then (`profileWords`). */
  name: z.string().catch(""),
});
export type Profile = z.infer<typeof Profile>;
export const PROFILE_NAME_MAX = 40;

/** What a profile is called: its own name, or the account's. */
export const profileWords = (profile: Profile): string => profile.name || profile.userName;

const Stored = z.object({
  address: z.string().nullable().catch(null),
  token: z.string().nullable().catch(null),
  userName: z.string().nullable().catch(null),
  /** The name given to the sign-in in use; a profile's `name`, kept apart as the rest of it is. */
  profileName: z.string().catch(""),
  /**
   * The sign-ins kept beside the one in use, to switch to on the options page (one Panki for real and one for trying
   * things, say). Each is a session of its own on its Panki; the one in use is never among them.
   */
  profiles: z.array(Profile).catch([]),
  /** Deck id → which field takes which piece. */
  maps: z.record(z.string(), FieldMap).catch({}),
  /**
   * Deck id → whether its field mapping is switched on: whether the extension adds cards to it at all. A deck that
   * isn't here has never been switched; what that means is `roles.ts` → `mappingOn`'s to say (off, but for a deck
   * that was mapped before there was a switch).
   */
  mappingOn: z.record(z.string(), z.boolean()).catch({}),
  /**
   * The deck the drawer opens on. None until one is chosen on purpose, in the drawer or on the options page, never
   * guessed; from then on it's that one until another is chosen.
   */
  defaultDeckId: DeckId.nullable().catch(null),
  // A browser that kept `drawerLayout` (a choice of the drawer's layout) keeps it unread.
  // A browser that kept `clipToWords` (whether a clip's end snapped to the edges of words as it was pulled) keeps it
  // unread: an end goes where it's put, Alt held snaps it.
  /** The key held to look a word up by pointing at it, everywhere but Panki's subtitles: Key to hold globally. */
  lookKey: LookKey.catch("shift"),
  /**
   * The key held to look a word up in Panki's subtitles, under the player and over the video, apart from everywhere
   * else's, so the two can be different keys, On hover among them (holding a key over subtitles while watching gets in
   * the way). Shift to begin with. (A browser that kept `lookHover`, the switch it once was, switched on reads as On
   * hover here, `readStore`.)
   */
  lookKeySubtitles: LookKey.catch("shift"),
  /** How long the pointer rests on a word before On hover opens its pop-up, ms: Hover delay globally, and in Panki subtitles. */
  lookDelayMs: HoverDelay.catch(HOVER_DELAY.default),
  lookDelayMsSubtitles: HoverDelay.catch(HOVER_DELAY.default),
  /**
   * Words already in the account's cards, marked where they stand, each place switched apart and the colour chosen: in
   * Panki's subtitles (its lines under and over the player: Highlight in Panki subtitles), on every page Panki is on,
   * the site's own captions among it (Highlight globally), and in which colour. Off to begin with. The site's captions
   * go by the global key, so by the global highlight too.
   */
  knownSubtitles: z.boolean().catch(false),
  knownPages: z.boolean().catch(false),
  /** Each word tinted in its highest card's stage's colour (New in its type's New colour, else white: `seekLook.ts` → `NEW_PAINT`), or all in `knownColour`. By stage to begin with. */
  knownByStage: z.boolean().catch(true),
  knownColour: MarkPaint.catch("green"),
  /** The words only suspended cards are, in a colour of their own; red to begin with, as their mark on the seek bar is. */
  knownSuspendedColour: MarkPaint.catch("red"),
  /** The words a flagged card is, in a colour of their own; a highlighter's yellow to begin with, as their mark on the seek bar is. */
  knownFlaggedColour: MarkPaint.catch("yellow"),
  /**
   * Where pointing at a word works. Every site, to begin with: on the video site at once (the extension is there
   * already), anywhere else once the browser has been asked and has allowed it, on the options page.
   */
  lookWhere: LookWhere.catch("everywhere"),
  /** The sites the setting above lists: the only ones, or the ones left out. Hosts, as `hostOf` reads them. */
  lookSites: z.array(z.string()).catch([]),
  /** How the popup is laid out, as the options page's editor saved it; none until it's saved once (`popupLayoutOf` fills it out). */
  popupLayout: PopupLayout.nullable().catch(null),
  // A browser that kept `explainOnOpen` (Explain as the pop-up opens) reads nothing of it.
  /** The tab the options page is to open on, when the drawer sent the viewer there to sign in or to switch a deck's field mapping on; the page takes it and clears it. */
  optionsTab: OptionsTab.nullable().catch(null),
  /**
   * Where the words under a video come from (`subtitles.ts` → `sourceOf` reads it): picked in the line under the
   * player; the same for the next video. Empty is the default. (A browser that kept `subtitleOrder`, an order the
   * sources were tried in, keeps it unread.)
   */
  subtitleSource: z.string().catch(""),
  /**
   * The pick last shown, Panki's or YouTube's, that the subtitles come back to when toggled on from None (`subtitles.ts`
   * → `comesBackTo`): written with every pick but None. Empty until one is kept since the subtitles could be toggled,
   * read until then from `subtitleSource`.
   */
  subtitleSourceOn: z.string().catch(""),
  /**
   * How transcribing behaves for this viewer (`transcribe/prefs.ts`): when it starts, whether the transcript replaces
   * the site's captions on the picture. Set on the options page (Videos → Transcribing): what's client-side is the
   * viewer's own, what costs Panki's settings, an admin's.
   */
  transcribeTrigger: TranscribeTrigger.catch(DEFAULT_PREFS.trigger),
  // A browser that kept `transcribePaused` keeps it unread: what happens while paused is Panki's settings, an admin's.
  transcribeOverVideo: z.boolean().catch(DEFAULT_PREFS.overVideo),
  /**
   * How the transcript looks over the video (the contracts' `subtitleStyle.ts`), set in the panel's menu, under Subtitle style.
   * This browser's own, apart from the app's style for a card's clip.
   */
  subtitleStyle: SubtitleStyle.catch(DEFAULT_SUBTITLE_STYLE),
  /** Whether the word being said carries its mark, on the line under the player and on the subtitles over the video (`transcribe/prefs.ts`). */
  markUnder: z.boolean().catch(DEFAULT_PREFS.markUnder),
  markOver: z.boolean().catch(DEFAULT_PREFS.markOver),
  // A browser that kept `transcriptEdit` (whether Panki subtitles could be fixed here) keeps it unread: that's an
  // admin's, Panki's `Transcription.fixes`.
  /** How Panki's marks on a video's seek bar look (`seekLook.ts`), set on the options page (Videos → Seek bar). */
  seekLook: SeekLook.catch(DEFAULT_SEEK_LOOK),
  /** The picked word's colour in Panki's subtitles (`transcribe/prefs.ts` → `pick`), set on the options page (Videos → Panki panel). */
  pickColour: MarkPaint.catch(DEFAULT_PREFS.pick),
  /** The transcription mode this viewer picked in the strip's menu (`transcribe/prefs.ts`); null, the one Panki's settings start everyone on. */
  transcribeMode: TranscribeMode.nullable().catch(DEFAULT_PREFS.mode),
  /** Which of Panki's parts are on, and what happens where a video was stopped (`modules.ts`), set on the options page; `pankiOn` in the strip's head too. */
  pankiOn: z.boolean().catch(DEFAULT_MODULES.on),
  modulePanel: z.boolean().catch(DEFAULT_MODULES.panel),
  /** Where the Panki panel stands on a video's page, picked on the panel itself. */
  // "stage" kept as a view of its own reads as beside the video, the view the site's full screen is closest to.
  panelView: z
    .string()
    .transform((view) => (view === "stage" ? "beside" : view))
    .pipe(PanelView)
    .catch(DEFAULT_MODULES.panelView),
  /** How wide the panel's column stands beside the video and in full screen, dragged by its left edge on the page; null, the site's own width. */
  panelWidth: PanelWidth.catch(DEFAULT_MODULES.panelWidth),
  /** In the site's full screen, the key that toggles the panel (options page, Videos → Panki panel). */
  panelKey: BoundKey.catch(DEFAULT_MODULES.panelKey),
  /** The key that toggles the subtitles off and back (options page, Videos → Panki panel). */
  subtitlesKey: BoundKey.catch(DEFAULT_MODULES.subtitlesKey),
  /** In the site's full screen, whether the panel stands or is folded away, as its key or its handle last left it; hidden to begin with. */
  fullPanel: z.boolean().catch(DEFAULT_MODULES.fullPanel),
  /** In the site's full screen, whether the button in the screen's corner that brings the folded panel back is shown (options page, Videos → Panki panel). */
  panelButton: z.boolean().catch(DEFAULT_MODULES.panelButton),
  // A browser that kept `stageFull` and `stageKey` (whether Panki's own Theatre mode took the browser's full screen,
  // and whether F opened it), `stageSide` (which side of the full screen the panel stood at) or `besideRecs` (whether
  // the panel beside the video took the recommendations' place) keeps them unread: the panel stands at the right in
  // full screen and above the recommendations beside the video.
  moduleLookup: z.boolean().catch(DEFAULT_MODULES.lookup),
  moduleSeek: z.boolean().catch(DEFAULT_MODULES.seek),
  resumeHow: ResumeHow.catch(DEFAULT_MODULES.resume),
  resumeTimed: ResumeTimed.catch(DEFAULT_MODULES.resumeTimed),
  resumeBack: ResumeBack.catch(DEFAULT_MODULES.resumeBack),
  markStop: z.boolean().catch(DEFAULT_MODULES.markStop),
  afterAdd: AfterAdd.catch(DEFAULT_MODULES.afterAdd),
  moduleHome: z.boolean().catch(DEFAULT_MODULES.home),
  /** The parts of YouTube's home, each its own under the master switch (`modules.ts`). */
  homePill: z.boolean().catch(DEFAULT_MODULES.homePill),
  /** What the pill in the header bar says, in what order (`modules.ts` → `PillLayout`), made whole as it's read. */
  pill: PillLayout.transform(pillLayoutOf).catch(DEFAULT_MODULES.pill),
  // A browser that kept `pillPower` keeps it unread: the switch is the pill's whenever the pill is on.
  homeShelf: z.boolean().catch(DEFAULT_MODULES.homeShelf),
  homeSaved: z.boolean().catch(DEFAULT_MODULES.homeSaved),
  homeRecent: z.boolean().catch(DEFAULT_MODULES.homeRecent),
  thumbSave: z.boolean().catch(DEFAULT_MODULES.thumbSave),
  moduleShorts: z.boolean().catch(DEFAULT_MODULES.shorts),
  // A browser that kept `homeChips` and `feedFilter` (chips over YouTube's home feed) keeps them unread.
  /**
   * The player's control bar laid out by Panki, or YouTube's own (`modules.ts` → `playerBar`, `BarLayout`): the switch,
   * and the layout made whole as it's read; null until it's first laid out on the options page, read until then from
   * the two switches the speed button and the end time had (`barOf`).
   */
  playerBar: z.boolean().catch(DEFAULT_MODULES.playerBar),
  playerBarLayout: KeptBar.nullable().catch(null),
  /**
   * Whether the bar stays on the video as it plays, in full screen and out of it (`modules.ts` → `barKept`), as its key
   * last left it on a YouTube page. A browser that kept `playerBarKeptFull` and `playerBarKeptNotFull` (a switch for
   * each screen) keeps them unread.
   */
  playerBarKept: z.boolean().catch(DEFAULT_MODULES.barKept),
  /** The key that keeps the bar visible or lets it fade (options page, YouTube → Player bar). */
  playerBarKey: BoundKey.catch(DEFAULT_MODULES.barKey),
  /** The speed button's and the end time's own switches, before they were rows of the player bar: read once into its layout, never written again. */
  speedControl: z.boolean().catch(true),
  endTime: z.boolean().catch(true),
  /** A short skip with ← or → and a key held (`modules.ts` → `shortSkip`). */
  shortSkip: z.boolean().catch(DEFAULT_MODULES.shortSkip),
  shortSkipKey: SkipKey.catch(DEFAULT_MODULES.shortSkipKey),
  shortSkipSeconds: SkipSeconds.catch(DEFAULT_MODULES.shortSkipSeconds),
  /**
   * Video tracking, this browser's own, so some devices can send while others don't: whether the videos watched here are noted and sent to Panki. Set on the options page
   * (Videos → Data tracking). Null until it's settled, once, by `watch/tracking.ts`: Off for a browser new to Panki,
   * the account's old switch for one that was already signed in.
   */
  videoTracking: z.boolean().nullable().catch(null),
  /** Reload Panki was pressed on the options page, which the reload closes: it's opened again as the extension comes back, and this cleared. */
  reopenOptions: z.boolean().catch(false),
  // A browser that kept `meaningPick` (which meanings a card got) keeps it unread: the ones ticked in the drawer are
  // enough.
});
export type Stored = z.infer<typeof Stored>;

/** The viewer's transcribing preferences as one value. */
export const prefsOf = (store: Stored): TranscribePrefs => ({
  trigger: store.transcribeTrigger,
  overVideo: store.transcribeOverVideo,
  style: store.subtitleStyle,
  markUnder: store.markUnder,
  markOver: store.markOver,
  seek: store.seekLook,
  pick: store.pickColour,
  mode: store.transcribeMode,
});

/**
 * The player bar as laid out: as kept once it has been, and before that as it always stood, with the speed button and
 * the end time hidden where this browser had switched them off.
 */
export const barOf = (store: Stored): BarLayout =>
  store.playerBarLayout ??
  DEFAULT_BAR.map((control) => (control.id === "speed" ? { ...control, shown: store.speedControl } : control.id === "endTime" ? { ...control, shown: store.endTime } : control));

/** Which parts are on, as one value, as a page gets them. */
export const modulesOf = (store: Stored): Modules => ({
  on: store.pankiOn,
  panel: store.modulePanel,
  panelView: store.panelView,
  panelWidth: store.panelWidth,
  panelKey: store.panelKey,
  subtitlesKey: store.subtitlesKey,
  fullPanel: store.fullPanel,
  panelButton: store.panelButton,
  lookup: store.moduleLookup,
  seek: store.moduleSeek,
  resume: store.resumeHow,
  resumeTimed: store.resumeTimed,
  resumeBack: store.resumeBack,
  markStop: store.markStop,
  afterAdd: store.afterAdd,
  home: store.moduleHome,
  homePill: store.homePill,
  pill: store.pill,
  homeShelf: store.homeShelf,
  homeSaved: store.homeSaved,
  homeRecent: store.homeRecent,
  thumbSave: store.thumbSave,
  shorts: store.moduleShorts,
  playerBar: store.playerBar,
  bar: barOf(store),
  barKept: store.playerBarKept,
  barKey: store.playerBarKey,
  shortSkip: store.shortSkip,
  shortSkipKey: store.shortSkipKey,
  shortSkipSeconds: store.shortSkipSeconds,
});

/**
 * This browser's settings as a page's script gets them (`messages.ts` → `Local`), one entry per part, each worked out
 * from the store: the worker's answer to `local`, and what it sends every page when one of them changes. A new setting a
 * page reads is a key of the store and a line in one of these, never an ask of its own.
 */
const LOCAL: { [Part in keyof Local]: (store: Stored) => Local[Part] } = {
  prefs: prefsOf,
  source: (store) => sourceOf(store.subtitleSource),
  sourceOn: (store) => sourceShownOf(store.subtitleSourceOn !== "" ? store.subtitleSourceOn : store.subtitleSource),
  modules: modulesOf,
  known: (store) => ({ subtitles: store.knownSubtitles, pages: store.knownPages, byStage: store.knownByStage, colour: store.knownColour, suspendedColour: store.knownSuspendedColour, flaggedColour: store.knownFlaggedColour }),
  look: (store) => ({
    key: store.lookKey,
    subtitleKey: store.lookKeySubtitles,
    delay: store.lookDelayMs,
    subtitleDelay: store.lookDelayMsSubtitles,
    where: store.lookWhere,
    sites: store.lookSites,
    layout: store.popupLayout,
  }),
  // Unsettled is off: it's settled as the worker starts (`watch/tracking.ts`), and every page told then.
  tracking: (store) => store.videoTracking === true,
  drawer: (store) => ({ maps: store.maps, mappingOn: store.mappingOn, defaultDeckId: store.defaultDeckId }),
};

export const localOf = (store: Stored): Local => ({
  prefs: LOCAL.prefs(store),
  source: LOCAL.source(store),
  sourceOn: LOCAL.sourceOn(store),
  modules: LOCAL.modules(store),
  known: LOCAL.known(store),
  look: LOCAL.look(store),
  tracking: LOCAL.tracking(store),
  drawer: LOCAL.drawer(store),
});

/** What the browser keeps, read as the store: everything kept, or what's given in its place (`kept`, the store as it stood before a change). */
function storeOf(kept: Record<string, unknown>): Stored {
  const stored = Stored.parse(kept);
  // `lookHover`, the switch it once was, switched on and never changed since: On hover.
  if (kept.lookKeySubtitles === undefined && kept.lookHover === true) return { ...stored, lookKeySubtitles: "hover" };
  return stored;
}

export async function readStore(): Promise<Stored> {
  return storeOf(await chrome.storage.local.get(null));
}

/**
 * This browser's settings before and after a change to its storage, as `chrome.storage.onChanged` tells of it: the store
 * now, and the store with each changed key put back as it was. Whether a page needs telling is then worked out from
 * the settings themselves, never from a list of keys that could fall behind them.
 */
export async function localChange(changes: Record<string, chrome.storage.StorageChange>): Promise<{ next: Local; was: Local }> {
  const kept = await chrome.storage.local.get(null);
  const before: Record<string, unknown> = { ...kept };
  for (const [key, change] of Object.entries(changes)) {
    if (change.oldValue === undefined) delete before[key];
    else before[key] = change.oldValue;
  }
  return { next: localOf(storeOf(kept)), was: localOf(storeOf(before)) };
}

export async function writeStore(patch: Partial<Stored>): Promise<void> {
  await chrome.storage.local.set(patch);
}

/** The sign-in in use forgotten, here only: what fills the decks' fields stays for the next one, and the kept profiles stay to switch to. */
export async function forgetSignIn(): Promise<void> {
  await chrome.storage.local.set({ token: null, userName: null } satisfies Partial<Stored>);
}

/** The same account at the same Panki: one profile, whatever its session. */
export const sameProfile = (a: Profile, b: Profile): boolean => a.address === b.address && a.userName === b.userName;

/** The sign-in in use as a profile, or null while no one is signed in. */
export const activeProfile = (store: Stored): Profile | null => (store.address && store.token && store.userName ? { address: store.address, token: store.token, userName: store.userName, name: store.profileName } : null);

/**
 * A profile made the one in use. The one in use so far, if any, goes among the kept ones; a kept profile of the same
 * account is replaced, so signing in afresh never leaves an old session listed twice.
 */
export async function useProfile(next: Profile): Promise<void> {
  const store = await readStore();
  const active = activeProfile(store);
  const profiles = [...store.profiles.filter((p) => !sameProfile(p, next)), ...(active && !sameProfile(active, next) ? [active] : [])];
  await writeStore({ address: next.address, token: next.token, userName: next.userName, profileName: next.name, profiles });
}

/** A kept profile dropped, here only. */
export async function forgetProfile(gone: Profile): Promise<void> {
  const store = await readStore();
  await writeStore({ profiles: store.profiles.filter((p) => !sameProfile(p, gone)) });
}

/** A profile given a name of its own, or its name taken back (null or empty): the one in use or a kept one. */
export async function renameProfile(which: Profile, name: string | null): Promise<void> {
  const store = await readStore();
  const next = (name ?? "").trim().slice(0, PROFILE_NAME_MAX);
  const active = activeProfile(store);
  if (active && sameProfile(which, active)) await writeStore({ profileName: next });
  else await writeStore({ profiles: store.profiles.map((p) => (sameProfile(p, which) ? { ...p, name: next } : p)) });
}
