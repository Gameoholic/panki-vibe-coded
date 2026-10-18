import { z } from "zod";
import { DeckId, type SubtitleStyle } from "@panki/contracts";
import { LookKey, LookWhere } from "./lookSettings";
import { OptionsTab } from "./messages";
import { PopupLayout } from "./popupLayout";
import { FieldMap } from "./roles";
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
  /**
   * Whether an end of a clip snaps to the edges of words as it's pulled. Off unless it's switched on (the owner,
   * 2026-10-11: "don't do anchoring… make it a setting"): an end then goes exactly where it's put.
   */
  clipToWords: z.boolean().catch(false),
  /** The key held to look a word up by pointing at it. */
  lookKey: LookKey.catch("shift"),
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
  // `subtitleStyle` was a key here for a day (2026-10-17): how the transcript looks over the video. It's the account's
  // since 2026-10-18 (the contracts' `Settings.subtitleStyle`), so the app's cards share it; a browser that still has it keeps it unread.
  /** Whether the word being said carries its mark, on the line under the player and on the subtitles over the video (`transcribe/prefs.ts`). */
  markUnder: z.boolean().catch(DEFAULT_PREFS.markUnder),
  markOver: z.boolean().catch(DEFAULT_PREFS.markOver),
  // `meaningPick` was a key here (2026-10-14): which meanings a card got. The owner had it taken out the next day, the
  // ones ticked in the drawer being enough; a browser that still has it keeps it unread.
});
export type Stored = z.infer<typeof Stored>;

/** The viewer's transcribing preferences as one value, as the page gets them with the transcript. */
export const prefsOf = (store: Stored, style: SubtitleStyle): TranscribePrefs => ({ trigger: store.transcribeTrigger, paused: store.transcribePaused, overVideo: store.transcribeOverVideo, style, markUnder: store.markUnder, markOver: store.markOver });

export async function readStore(): Promise<Stored> {
  return Stored.parse(await chrome.storage.local.get(null));
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
