import { z } from "zod";
import { DeckId } from "@panki/contracts";
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
const Stored = z.object({
  /** Panki's origin, "https://panki.example". */
  address: z.string().nullable().catch(null),
  /** The session's secret, from a bearer sign-in. Never logged, never sent anywhere but `address`. */
  token: z.string().nullable().catch(null),
  userName: z.string().nullable().catch(null),
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
  // `meaningPick` was a key here (2026-10-14): which meanings a card got. The owner had it taken out the next day, the
  // ones ticked in the drawer being enough; a browser that still has it keeps it unread.
});
export type Stored = z.infer<typeof Stored>;

/** The viewer's transcribing preferences as one value, as the page gets them with the transcript. */
export const prefsOf = (store: Stored): TranscribePrefs => ({ trigger: store.transcribeTrigger, paused: store.transcribePaused, overVideo: store.transcribeOverVideo });

export async function readStore(): Promise<Stored> {
  return Stored.parse(await chrome.storage.local.get(null));
}

export async function writeStore(patch: Partial<Stored>): Promise<void> {
  await chrome.storage.local.set(patch);
}

/** The sign-in forgotten, here only: what fills the decks' fields stays for the next one. */
export async function forgetSignIn(): Promise<void> {
  await chrome.storage.local.set({ token: null, userName: null } satisfies Partial<Stored>);
}
