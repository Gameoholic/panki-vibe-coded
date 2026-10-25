import { z } from "zod";
import { DEFAULT_SUBTITLE_STYLE, DeckId, SubtitleStyle, TranscribeMode } from "@panki/contracts";
import { LookKey, LookWhere } from "./lookSettings";
import { OptionsTab, UpdateState } from "./messages";
import { DEFAULT_MODULES, PillLayout, ResumeHow, ResumeTimed, pillLayoutOf, type Modules } from "./modules";
import { PopupLayout } from "./popupLayout";
import { FieldMap } from "./roles";
import { DEFAULT_SEEK_LOOK, MarkPaint, SeekLook } from "./seekLook";
import { DEFAULT_PREFS, TranscribePaused, TranscribeTrigger, type TranscribePrefs } from "./transcribe/prefs";

/**
 * What the extension keeps on this browser, in its own storage: where Panki is, the sign-in, what fills each deck's
 * fields, the deck the drawer opens on, how the drawer and looking a word up are set to behave, and how the popup is
 * laid out. (The dictionaries
 * themselves are in the browser's database: `dictionary/store.ts`.) Only the background and the options page
 * read it; a page's script never does, so the sign-in's secret never sits in someone else's page. Read defensively: a
 * key that's missing or broken is its empty value, never a crash.
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
  /** A name of the owner's own for it ("Prod", "Dev"); empty is none, and it's shown by `userName` then (`profileWords`). */
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
  /** The name of the owner's own for the sign-in in use; a profile's `name`, kept apart as the rest of it is. */
  profileName: z.string().catch(""),
  /**
   * The sign-ins kept beside the one in use, to switch to on the options page (the owner, 2026-10-17: one Panki for
   * real and one for trying things). Each is a session of its own on its Panki; the one in use is never among them.
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
   * The deck the drawer opens on. None until one is chosen on purpose, in the drawer or on the options page (the
   * owner, 2026-10-11: "we have to consciously select it"); from then on it's that one until another is chosen.
   */
  defaultDeckId: DeckId.nullable().catch(null),
  // `clipToWords` was a key here (2026-10-11): whether a clip's end snapped to the edges of words as it was pulled.
  // The owner had the setting taken out on 2026-10-19, never using it: an end goes where it's put, Alt held snaps it.
  // A browser that still has it keeps it unread.
  /** The key held to look a word up by pointing at it. */
  lookKey: LookKey.catch("shift"),
  /**
   * The key held to look a word up in Panki's subtitles, under the player and over the video, apart from everywhere
   * else's (the owner, 2026-10-25: "duplicate the setting, one for global and one for just Panki subtitles… we can even
   * have different buttons for the two"), On hover among them ("it's annoying to have to Shift over the subtitle when
   * I'm actively watching"). Shift to begin with. (For a few hours the same day it was `lookHover`, a switch: a browser
   * that switched it on reads as On hover here, `readStore`.)
   */
  lookKeySubtitles: LookKey.catch("shift"),
  /**
   * Words already in the account's cards, marked where they stand (the owner, 2026-10-25, "both subtitles and
   * everywhere… so they can be separate", "make colour customizable"): in a video's subtitles (Panki's lines under and
   * over the player, the site's own captions), on every other page Panki is on, and in which colour. Off to begin with.
   */
  knownSubtitles: z.boolean().catch(false),
  knownPages: z.boolean().catch(false),
  knownColour: MarkPaint.catch("green"),
  /**
   * Where pointing at a word works. Every site, to begin with: on the video site at once (the extension is there
   * already), anywhere else once the browser has been asked and has allowed it, on the options page.
   */
  lookWhere: LookWhere.catch("everywhere"),
  /** The sites the setting above lists: the only ones, or the ones left out. Hosts, as `hostOf` reads them. */
  lookSites: z.array(z.string()).catch([]),
  /** How the popup is laid out, as the options page's editor saved it; none until it's saved once (`popupLayoutOf` fills it out). */
  popupLayout: PopupLayout.nullable().catch(null),
  /** The tab the options page is to open on, when the drawer sent the owner there to sign in or to switch a deck's field mapping on; the page takes it and clears it. */
  optionsTab: OptionsTab.nullable().catch(null),
  /**
   * Where the words under a video come from (`subtitles.ts` → `sourceOf` reads it): picked in the line under the
   * player; the same for the next video. Empty is the default. (`subtitleOrder`, an order the sources were tried in,
   * was a key here for a day, 2026-10-17; a browser that still has it keeps it unread.)
   */
  subtitleSource: z.string().catch(""),
  /**
   * How transcribing behaves for this viewer (`transcribe/prefs.ts`): when it starts, what it does while the video is
   * paused, whether the transcript replaces the site's captions on the picture. Set on the options page (YouTube →
   * Transcribing); they were Panki's settings, an admin's, until the owner moved what's client-side here (2026-10-17).
   */
  transcribeTrigger: TranscribeTrigger.catch(DEFAULT_PREFS.trigger),
  transcribePaused: TranscribePaused.catch(DEFAULT_PREFS.paused),
  transcribeOverVideo: z.boolean().catch(DEFAULT_PREFS.overVideo),
  /**
   * How the transcript looks over the video (the contracts' `subtitleStyle.ts`), set in the strip's Subtitles menu.
   * This browser's own: it was the account's for a few hours on 2026-10-18, shared with the app's cards, until the
   * owner had the two kept apart.
   */
  subtitleStyle: SubtitleStyle.catch(DEFAULT_SUBTITLE_STYLE),
  /** Whether the word being said carries its mark, on the line under the player and on the subtitles over the video (`transcribe/prefs.ts`). */
  markUnder: z.boolean().catch(DEFAULT_PREFS.markUnder),
  markOver: z.boolean().catch(DEFAULT_PREFS.markOver),
  /** How Panki's marks on a video's seek bar look (`seekLook.ts`), set on the options page (YouTube → Seek bar). */
  seekLook: SeekLook.catch(DEFAULT_SEEK_LOOK),
  /** The transcription mode this viewer picked in the strip's menu (`transcribe/prefs.ts`); null, the one Panki's settings start everyone on. */
  transcribeMode: TranscribeMode.nullable().catch(DEFAULT_PREFS.mode),
  /** Which of Panki's parts are on, and what happens where a video was stopped (`modules.ts`), set on the options page; `pankiOn` in the strip's head too. */
  pankiOn: z.boolean().catch(DEFAULT_MODULES.on),
  modulePanel: z.boolean().catch(DEFAULT_MODULES.panel),
  moduleLookup: z.boolean().catch(DEFAULT_MODULES.lookup),
  moduleSeek: z.boolean().catch(DEFAULT_MODULES.seek),
  resumeHow: ResumeHow.catch(DEFAULT_MODULES.resume),
  resumeTimed: ResumeTimed.catch(DEFAULT_MODULES.resumeTimed),
  markStop: z.boolean().catch(DEFAULT_MODULES.markStop),
  moduleHome: z.boolean().catch(DEFAULT_MODULES.home),
  /** The parts of YouTube's home, each its own under the master switch (`modules.ts`). */
  homePill: z.boolean().catch(DEFAULT_MODULES.homePill),
  /** What the pill in the header bar says, in what order (`modules.ts` → `PillLayout`), made whole as it's read. */
  pill: PillLayout.transform(pillLayoutOf).catch(DEFAULT_MODULES.pill),
  // `pillPower` went on 2026-10-22 (the switch is the pill's whenever the pill is on); a browser that kept it keeps it unread.
  homeLine: z.boolean().catch(DEFAULT_MODULES.homeLine),
  homeShelf: z.boolean().catch(DEFAULT_MODULES.homeShelf),
  homeSaved: z.boolean().catch(DEFAULT_MODULES.homeSaved),
  thumbSave: z.boolean().catch(DEFAULT_MODULES.thumbSave),
  moduleShorts: z.boolean().catch(DEFAULT_MODULES.shorts),
  moduleThumbs: z.boolean().catch(DEFAULT_MODULES.thumbs),
  // `homeChips` and `feedFilter` (the chips over YouTube's home feed) went on 2026-10-21; a browser that kept them keeps them unread.
  /** The YouTube utilities beside Hide Shorts (`moduleShorts`): the player's speed from a button among its controls. */
  speedControl: z.boolean().catch(DEFAULT_MODULES.speedControl),
  /** How this extension stood against Panki's build when it last asked (`updates.ts`); null until it has. */
  update: UpdateState.nullable().catch(null),
  /** Reload Panki was pressed on the options page, which the reload closes: it's opened again as the extension comes back, and this cleared. */
  reopenOptions: z.boolean().catch(false),
  // `meaningPick` was a key here (2026-10-14): which meanings a card got. The owner had it taken out the next day, the
  // ones ticked in the drawer being enough; a browser that still has it keeps it unread.
});
export type Stored = z.infer<typeof Stored>;

/** The viewer's transcribing preferences as one value, as the page gets them with the transcript. */
export const prefsOf = (store: Stored): TranscribePrefs => ({
  trigger: store.transcribeTrigger,
  paused: store.transcribePaused,
  overVideo: store.transcribeOverVideo,
  style: store.subtitleStyle,
  markUnder: store.markUnder,
  markOver: store.markOver,
  seek: store.seekLook,
  mode: store.transcribeMode,
});

/** Which parts are on, as one value, as a page gets them. */
export const modulesOf = (store: Stored): Modules => ({
  on: store.pankiOn,
  panel: store.modulePanel,
  lookup: store.moduleLookup,
  seek: store.moduleSeek,
  resume: store.resumeHow,
  resumeTimed: store.resumeTimed,
  markStop: store.markStop,
  home: store.moduleHome,
  homePill: store.homePill,
  pill: store.pill,
  homeLine: store.homeLine,
  homeShelf: store.homeShelf,
  homeSaved: store.homeSaved,
  thumbSave: store.thumbSave,
  shorts: store.moduleShorts,
  thumbs: store.moduleThumbs,
  speedControl: store.speedControl,
});

export async function readStore(): Promise<Stored> {
  const kept = await chrome.storage.local.get(null);
  const stored = Stored.parse(kept);
  // `lookHover`, the switch it was for a few hours (2026-10-25), switched on and never changed since: On hover.
  if (kept.lookKeySubtitles === undefined && kept.lookHover === true) return { ...stored, lookKeySubtitles: "hover" };
  return stored;
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

/** A profile given a name of the owner's own, or its name taken back (null or empty): the one in use or a kept one. */
export async function renameProfile(which: Profile, name: string | null): Promise<void> {
  const store = await readStore();
  const next = (name ?? "").trim().slice(0, PROFILE_NAME_MAX);
  const active = activeProfile(store);
  if (active && sameProfile(which, active)) await writeStore({ profileName: next });
  else await writeStore({ profiles: store.profiles.map((p) => (sameProfile(p, which) ? { ...p, name: next } : p)) });
}
