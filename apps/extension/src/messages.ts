import { z } from "zod";
import { TranscribePrefs } from "./transcribe/prefs";
import {
  CALLED_MAX,
  CalledCard,
  CardId,
  CardType,
  CardsCalled,
  Deck,
  DeckId,
  ExtensionBuild,
  ExtensionBuildFile,
  FORVO_WORD_MAX,
  ForvoVoice,
  MediaCues,
  MediaId,
  MediaKind,
  MediaRecording,
  NewCard,
  NewCardExample,
  PIECE_MAX_BYTES,
  PieceId,
  Redo,
  RedoAsk,
  SrsType,
  Stretch,
  SubtitleStyle,
  TranscribeEstimate,
  TranscribeLanguage,
  Transcript,
  TranscriptFix,
  TranscriptLineFix,
  Transcription,
  VideoCard,
  VideoId,
  WHOLE_MAX_MS,
  WatchBatch,
  WatchMarkKind,
  WatchMarkSource,
  WatchedVideo,
  GLANCE_MAX,
  GlanceAsk,
  SaveVideo,
  SavedVideo,
  Settings,
  Stats,
  VideoGlance,
} from "@panki/contracts";
import { Found, Lattice } from "./dictionary/found";
import { LookKey } from "./lookSettings";
import { Modules } from "./modules";
import { PopupLayout } from "./popupLayout";
import { FieldMap } from "./roles";
import { MarkPaint } from "./seekLook";

/**
 * What the pieces of the extension say to each other. A page's script (the line under a player, the capture panel)
 * holds no sign-in and calls nothing but the extension's own background, which is the only thing that talks to
 * Panki. Every message is a shape here and is parsed where it lands: the page is someone else's ground.
 */

/** The most a clip can be on the way to the background: 40 MB of video, as text. */
const BASE64_MAX = 56_000_000;
/** The most text a look-up is handed: a word is never longer than the stretch looked at. */
const LOOKUP_MAX = 64;
/** The most of a line that's split into words in one go. */
export const LATTICE_MAX = 600;
/** A recording of a word is a few dozen kilobytes; this is far more than any, as text. */
const RECORDING_MAX = 3_000_000;
/** A video's thumbnail or its channel's picture, as text: a few dozen kilobytes; Panki keeps none over a megabyte. */
const PICTURE_BASE64_MAX = 1_400_000;
/** A piece of a video's sound on its way to the background, as text: a third more than the file itself may weigh. */
const PIECE_BASE64_MAX = Math.ceil((PIECE_MAX_BYTES * 4) / 3) + 4;

/**
 * How this extension stands against the build the Panki it's signed in to carries (`updates.ts`, the contracts'
 * `extension.ts`): up to date, an update available (other files), an update needed (Panki speaks a newer protocol), or
 * not known (never asked, no build there, no Panki set). `own` is the running build's account of itself, `latest`
 * Panki's, as last asked; `checkedAt` when; `ready`, another build than the running one is in the extension's folder already, waiting for
 * Reload Panki.
 */
export const UpdateState = z.object({
  state: z.enum(["current", "available", "needed", "unknown"]),
  own: ExtensionBuildFile.nullable(),
  latest: ExtensionBuild.nullable(),
  checkedAt: z.number().nullable(),
  ready: z.boolean(),
});
export type UpdateState = z.infer<typeof UpdateState>;
export const NO_UPDATE: UpdateState = { state: "unknown", own: null, latest: null, checkedAt: null, ready: false };

/** How a recording was made off a video, as a page's script knows it: the contracts' `MediaRecording` less who made it, which the worker adds. */
export const RecordingAsk = MediaRecording.omit({ client: true, build: true });
export type RecordingAsk = z.infer<typeof RecordingAsk>;

/** A tab of the options page the drawer sends the owner to: the sign-in, or a deck's field mapping. */
export const OptionsTab = z.enum(["account", "decks", "youtube"]);
export type OptionsTab = z.infer<typeof OptionsTab>;

export const Ask = z.discriminatedUnion("kind", [
  /** What the panel needs to open: the decks, their card types and SRS types (to show the card as a review will), what fills each deck's fields, the deck it opens on. */
  z.object({ kind: z.literal("state") }),
  /** A deck was chosen in the drawer: it's the one the drawer opens on from now. */
  z.object({ kind: z.literal("deck"), deckId: DeckId }),
  z.object({ kind: z.literal("add"), deckId: DeckId, card: NewCard }),
  /** What the drawer holds, given as another example to a card that's already there, in its deck. */
  z.object({ kind: z.literal("addExample"), deckId: DeckId, cardId: CardId, example: NewCardExample }),
  /** A recorded clip, kept as a file on Panki before the card that names it is made, with what's said in it and how it was recorded. */
  z.object({
    kind: z.literal("upload"),
    mediaKind: MediaKind,
    mediaId: MediaId,
    mime: z.string().max(100),
    base64: z.string().max(BASE64_MAX),
    cues: MediaCues.optional(),
    recording: RecordingAsk.optional(),
  }),
  /** Open the options page: to sign in, or to say what fills a deck's fields. */
  z.object({ kind: z.literal("options"), tab: OptionsTab.optional() }),
  /** Open Panki itself in a tab: the address of the profile in use, at one of its cards when one is given (open in its deck's list). Nobody signed in, it opens the options page to sign in instead. */
  z.object({ kind: z.literal("open"), card: z.object({ deckId: DeckId, cardId: CardId }).optional() }),
  /** The account's cards already called by the words a card is about to be added with: the drawer says so. */
  z.object({ kind: z.literal("called"), words: CardsCalled.shape.word }),
  /** Whether pointing at a word looks it up on the page asking, with which key held, and how the popup is laid out. Needs no sign-in: the dictionaries are this browser's own. */
  z.object({ kind: z.literal("lookState") }),
  /** The words in the account's cards, and where and in what colour they're marked. */
  z.object({ kind: z.literal("known") }),
  /** Every word found from the first letter of this text on. */
  z.object({ kind: z.literal("lookup"), text: z.string().max(LOOKUP_MAX) }),
  /** Every word starting at each place of a line: what the line is split into words by. */
  z.object({ kind: z.literal("lattice"), text: z.string().max(LATTICE_MAX) }),
  /** The recordings of a word on Forvo, asked of Panki, whose server holds the key. */
  z.object({ kind: z.literal("voices"), word: z.string().min(1).max(FORVO_WORD_MAX) }),
  /** One of them, kept by Panki as a file, and its bytes to hear: picked by its id among the word's, never by an address. */
  z.object({ kind: z.literal("voice"), word: z.string().min(1).max(FORVO_WORD_MAX), id: z.number().int() }),
  /** A video's transcript as Panki keeps it, with the settings that run transcribing and whether there's a key to run it with. */
  z.object({ kind: z.literal("transcript"), videoId: VideoId }),
  /** A video's transcript alone, read again while its whole-video download is under way. */
  z.object({ kind: z.literal("poll"), videoId: VideoId }),
  /** The whole video downloaded and transcribed by the engine, in the background on Panki: its length, as the player says it. */
  z.object({ kind: z.literal("whole"), videoId: VideoId, lengthMs: z.number().int().positive().max(WHOLE_MAX_MS) }),
  /** A chunk for the engine: the stretch of the video it accounts for, where in it its sound begins, the WAV as text (none for a stretch of nothing), for a run's first chunk how long after the run began it was sent, and for a part being transcribed again its id. */
  z.object({
    kind: z.literal("piece"),
    videoId: VideoId,
    pieceId: PieceId,
    startMs: z.number().int().nonnegative(),
    soundMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    base64: z.string().max(PIECE_BASE64_MAX).nullable(),
    since: z.number().int().nonnegative().optional(),
    redo: PieceId.optional(),
  }),
  /** What a part typed would widen to (ms), said before it's asked for. */
  z.object({ kind: z.literal("redoStretch"), videoId: VideoId, stretch: Stretch }),
  /** A part of a video to be transcribed again, for everyone; the stretch to record comes back widened to whole pieces. */
  z.object({ kind: z.literal("redo"), videoId: VideoId, redo: RedoAsk }),
  /** A part transcribed again, done (its words stand in place of what stood there) or given up (the transcript is as it was). */
  z.object({ kind: z.literal("redoEnd"), videoId: VideoId, redoId: PieceId, done: z.boolean() }),
  /** A word of a transcript changed by hand. */
  z.object({ kind: z.literal("fix"), videoId: VideoId, fix: TranscriptFix }),
  /** A line of a transcript changed by hand, with the pencil: its words, what it says now, where it starts and ends. */
  z.object({ kind: z.literal("line"), videoId: VideoId, fix: TranscriptLineFix }),
  /** A transcript forgotten, a stretch of the video (ms) or the whole (null), for everyone: transcribed afresh when a run passes it. */
  z.object({ kind: z.literal("forget"), videoId: VideoId, stretch: Stretch.nullable() }),
  /** How transcribing behaves for this viewer, changed in the strip's menu: kept here, as the options page keeps it. */
  z.object({ kind: z.literal("prefs"), prefs: TranscribePrefs.partial() }),
  /** Where the words under a video come from, as picked in the line: kept for the next video. */
  z.object({ kind: z.literal("subtitles"), source: z.string().max(40) }),
  /** A video's pictures, kept by Panki for everyone as a card is made from it, and their bytes to show on the card here: its thumbnail, and its channel's picture from where the page shows it (null when it shows none). */
  z.object({ kind: z.literal("pictures"), videoId: VideoId, avatar: z.string().max(2000).nullable() }),
  /** Where in a video the account's cards were taken from: marked on the video's bar. */
  z.object({ kind: z.literal("videoCards"), videoId: VideoId }),
  /** Which of Panki's parts are on in this browser, and what happens where a video was stopped. Needs no sign-in: they're this browser's own. */
  z.object({ kind: z.literal("modules") }),
  /** A video as it opens: whether the account keeps its watching, where it was stopped, whether it counts. */
  z.object({ kind: z.literal("watched"), videoId: VideoId }),
  /** Stretches of videos watched, with the videos they're of, kept on Panki. */
  z.object({ kind: z.literal("watch"), batch: WatchBatch }),
  /** A video left out of the count, counted again, put away from Continue watching, finished or not, and who said so. */
  z.object({ kind: z.literal("watchMark"), videoId: VideoId, mark: WatchMarkKind, source: WatchMarkSource }),
  /** What YouTube's home shows of Panki: who's signed in, the account's stats, its decks and settings. */
  z.object({ kind: z.literal("home") }),
  /** Panki switched on or off altogether, from the strip's head. */
  z.object({ kind: z.literal("pankiOn"), on: z.boolean() }),
  /** Videos as their thumbnails are marked: how far the account got, its cards from each, whether Panki has its subtitles. */
  z.object({ kind: z.literal("glance"), videoIds: GlanceAsk.shape.videoIds }),
  /** A video saved for later with its name and channel as the page shows them (`about`), or its save taken back (null). */
  z.object({ kind: z.literal("save"), videoId: VideoId, about: SaveVideo.nullable() }),
  /** How this extension stands against Panki's build, as last asked. Needs no sign-in, and calls nothing. */
  z.object({ kind: z.literal("update") }),
  /** The same, asked of Panki afresh (Check now). */
  z.object({ kind: z.literal("checkUpdate") }),
  /** Panki's build downloaded as a zip, into the browser's downloads. */
  z.object({ kind: z.literal("downloadUpdate") }),
  /** Chrome's own page for this extension, which says which folder it's loaded from (where Update Panki is). */
  z.object({ kind: z.literal("showFolder") }),
  /** The extension reloaded from its folder, where Update Panki has put the new files; `reopen`, its own page opened again once it's back (asked from that page, which the reload closes). */
  z.object({ kind: z.literal("reloadPanki"), reopen: z.boolean().optional() }),
]);
export type Ask = z.infer<typeof Ask>;

const LookState = z.union([
  z.object({
    ok: z.literal(true),
    /** Pointing at a word looks it up here: the site is one the setting allows, and there's a dictionary to look in. */
    on: z.boolean(),
    key: LookKey,
    /** The key held in Panki's subtitles, under and over a video and on a card's clip (`storage.ts` → `lookKeySubtitles`). */
    subtitleKey: LookKey.catch("shift"),
    /** Pointing at a word in Panki's subtitles looks it up: Word lookup is on and there's a dictionary, whatever Where says (`on`). */
    subtitlesOn: z.boolean(),
    /** How many dictionaries are switched on: none means the line is split the browser's way. */
    dictionaries: z.number(),
    /** Changes whenever the dictionaries do: what was found before is found again. */
    signature: z.string(),
    /** How the popup is laid out, filled out against the dictionaries there are. */
    layout: PopupLayout,
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type LookState = z.infer<typeof LookState>;
/** The words every card is called by, and whether they're marked in a video's subtitles, on pages, and in what colour. */
const Known = z.union([
  z.object({ ok: z.literal(true), words: z.array(z.string()), subtitles: z.boolean(), pages: z.boolean(), colour: MarkPaint }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type Known = z.infer<typeof Known>;
const Looked = z.union([z.object({ ok: z.literal(true), found: z.array(Found) }), z.object({ ok: z.literal(false), message: z.string() })]);
const Latticed = z.union([z.object({ ok: z.literal(true), lattice: Lattice }), z.object({ ok: z.literal(false), message: z.string() })]);
export type Looked = z.infer<typeof Looked>;
export type Latticed = z.infer<typeof Latticed>;

/** `status` is Panki's own answer when it refused (a 409 with no key to transcribe with); none for a fault of the extension's. */
const Failed = z.object({ ok: z.literal(false), message: z.string(), signedOut: z.boolean().optional(), status: z.number().optional() });
const Done = z.union([z.object({ ok: z.literal(true) }), Failed]);
const Voiced = z.union([z.object({ ok: z.literal(true), voices: z.array(ForvoVoice) }), Failed]);
/** The recording as Panki keeps it: the file's id, which goes in the card's field, and its bytes, to hear it here. */
const Heard = z.union([z.object({ ok: z.literal(true), mediaId: MediaId, mime: z.string().max(100), base64: z.string().max(RECORDING_MAX) }), Failed]);
export type Voiced = z.infer<typeof Voiced>;
export type Heard = z.infer<typeof Heard>;
/** A picture's bytes, as text, and what it is. */
const Pic = z.object({ mime: z.string().max(100), base64: z.string().max(PICTURE_BASE64_MAX) });
/** A video's pictures as Panki keeps them; each null when there's none. */
const Pictured = z.union([z.object({ ok: z.literal(true), thumbnail: Pic.nullable(), avatar: Pic.nullable() }), Failed]);
export type Pictured = z.infer<typeof Pictured>;
/** The account's cards taken from the video: each its clip, in ms, and its words. */
const Carded = z.union([z.object({ ok: z.literal(true), cards: z.array(VideoCard) }), Failed]);
export type Carded = z.infer<typeof Carded>;
/** Which of Panki's parts are on in this browser. */
const Moduled = z.union([z.object({ ok: z.literal(true), modules: Modules }), Failed]);
export type Moduled = z.infer<typeof Moduled>;
/** A video as the account's watching has it. */
const Watched = z.union([z.object({ ok: z.literal(true), video: WatchedVideo }), Failed]);
export type Watched = z.infer<typeof Watched>;
/** Panki for YouTube's home: who's signed in (the account, and what the profile in use is called), the account's stats, its decks (what's due) and its settings. */
const Homed = z.union([z.object({ ok: z.literal(true), name: z.string(), profile: z.string(), stats: Stats, decks: z.array(Deck), settings: Settings, saved: z.array(SavedVideo) }), Failed]);
export type Homed = z.infer<typeof Homed>;
/** The videos saved for later, as they stand after a save or a save taken back. */
const Saved = z.union([z.object({ ok: z.literal(true), videos: z.array(SavedVideo) }), Failed]);
export type Saved = z.infer<typeof Saved>;
/** Videos as their thumbnails are marked. */
const Glanced = z.union([z.object({ ok: z.literal(true), videos: z.array(VideoGlance) }), Failed]);
export type Glanced = z.infer<typeof Glanced>;
/** How this extension stands against Panki's build. */
const Updated = z.union([z.object({ ok: z.literal(true), update: UpdateState }), Failed]);
export type Updated = z.infer<typeof Updated>;
/** The account's cards already called by some words: each its words, and its deck. */
const Called = z.union([z.object({ ok: z.literal(true), cards: z.array(CalledCard) }), Failed]);
export type Called = z.infer<typeof Called>;
const State = z.union([
  z.object({
    ok: z.literal(true),
    decks: z.array(Deck),
    types: z.array(CardType),
    srsTypes: z.array(SrsType),
    maps: z.record(z.string(), FieldMap),
    /** The decks whose field mapping is switched on: the only ones a card can be added to from here. */
    decksOn: z.array(z.string()),
    /** The deck the drawer opens on; null until one has been chosen. */
    defaultDeckId: DeckId.nullable(),
    /** How the account's card clips show their subtitles (Panki's Settings): the card previewed here shows them so too. */
    subtitleStyle: SubtitleStyle,
  }),
  Failed,
]);
export type State = z.infer<typeof State>;
export type Done = z.infer<typeof Done>;
/** A video's transcript with what runs transcribing: the shared settings, whether the chosen engine has a key, what a whole-video download takes as measured so far, this browser's pick of source, and this viewer's preferences. */
const Transcripted = z.union([
  // `language` is the account's own, told to the engine: each account's since 2026-10-21, nothing Panki-wide.
  z.object({ ok: z.literal(true), transcript: Transcript, settings: Transcription, language: TranscribeLanguage, key: z.boolean(), estimate: TranscribeEstimate, source: z.string(), prefs: TranscribePrefs }),
  Failed,
]);
export type Transcripted = z.infer<typeof Transcripted>;
/** A chunk heard, a whole-video download asked for, or the transcript read again: the transcript as it stands, and how long the engine took over the chunk (null when it wasn't asked). */
const Pieced = z.union([z.object({ ok: z.literal(true), transcript: Transcript, engineMs: z.number().int().nonnegative().nullable() }), Failed]);
export type Pieced = z.infer<typeof Pieced>;
/** A part to be transcribed again, taken: the transcript as it stands, and the stretch to record. */
const Redone = z.union([z.object({ ok: z.literal(true), transcript: Transcript, redo: Redo }), Failed]);
export type Redone = z.infer<typeof Redone>;
/** What a part typed would widen to. */
const Stretched = z.union([z.object({ ok: z.literal(true), stretch: Stretch }), Failed]);
export type Stretched = z.infer<typeof Stretched>;

/** The background telling a page's script to capture what's there now (the menu, the toolbar button). */
export const Trigger = z.object({ kind: z.literal("capture") });
export type Trigger = z.infer<typeof Trigger>;

const GONE = "Panki was updated or switched off. Reload this page.";
const NO_ANSWER = "Panki's background didn't answer.";
const UNREAD = "Panki's answer couldn't be read.";

/**
 * One question to the background and its answer. Each way it can go wrong says its own words, and why goes to the
 * page's console: the extension gone from under this page (reloaded), its background not answering, or an answer that
 * isn't of the shape asked for (`failed`). All three said "updated or switched off" until 2026-10-20, which sent the
 * owner reloading everything when that wasn't it.
 */
async function ask(message: Ask): Promise<unknown> {
  try {
    const answer: unknown = await chrome.runtime.sendMessage(message);
    return answer;
  } catch (e) {
    // An extension reloaded under the page leaves its scripts here without an id.
    if (!chrome.runtime?.id) return { ok: false, message: GONE };
    console.warn(`[Panki] no answer to "${message.kind}":`, e instanceof Error ? e.message : String(e));
    return { ok: false, message: NO_ANSWER };
  }
}
const failed = (error: z.ZodError): { ok: false; message: string } => {
  console.warn("[Panki] an answer it can't read:", error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  return { ok: false, message: UNREAD };
};

export async function askState(): Promise<State> {
  const answer = State.safeParse(await ask({ kind: "state" }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askDeck(deckId: string): Promise<void> {
  await ask({ kind: "deck", deckId });
}
export async function askAdd(add: Omit<Extract<Ask, { kind: "add" }>, "kind">): Promise<Done> {
  const answer = Done.safeParse(await ask({ kind: "add", ...add }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askAddExample(add: Omit<Extract<Ask, { kind: "addExample" }>, "kind">): Promise<Done> {
  const answer = Done.safeParse(await ask({ kind: "addExample", ...add }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askUpload(upload: Omit<Extract<Ask, { kind: "upload" }>, "kind">): Promise<Done> {
  const answer = Done.safeParse(await ask({ kind: "upload", ...upload }));
  return answer.success ? answer.data : failed(answer.error);
}
/** Opens the options page, on the tab where what's needed is done. */
export async function askOptions(tab: OptionsTab): Promise<void> {
  await ask({ kind: "options", tab });
}
/** Opens Panki, the one the profile in use is signed in to, in a tab of its own: at one of its cards, when one is given. */
export async function askOpenPanki(card?: { deckId: string; cardId: string }): Promise<void> {
  await ask(card ? { kind: "open", card } : { kind: "open" });
}
/** The account's cards already called by one of these words; none when it can't be asked (the card can be added all the same). */
export async function askCalled(words: readonly string[]): Promise<readonly CalledCard[]> {
  const sent = words.filter((word) => word.trim() !== "").slice(0, CALLED_MAX);
  if (sent.length === 0) return [];
  const answer = Called.safeParse(await ask({ kind: "called", words: sent }));
  if (!answer.success) {
    failed(answer.error);
    return [];
  }
  return answer.data.ok ? answer.data.cards : [];
}
export async function askKnown(): Promise<Known> {
  const answer = Known.safeParse(await ask({ kind: "known" }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askLookState(): Promise<LookState> {
  const answer = LookState.safeParse(await ask({ kind: "lookState" }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askLookup(text: string): Promise<Looked> {
  const answer = Looked.safeParse(await ask({ kind: "lookup", text: text.slice(0, LOOKUP_MAX) }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askLattice(text: string): Promise<Latticed> {
  const answer = Latticed.safeParse(await ask({ kind: "lattice", text: text.slice(0, LATTICE_MAX) }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askVoices(word: string): Promise<Voiced> {
  const answer = Voiced.safeParse(await ask({ kind: "voices", word: word.slice(0, FORVO_WORD_MAX) }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askVoice(word: string, id: number): Promise<Heard> {
  const answer = Heard.safeParse(await ask({ kind: "voice", word: word.slice(0, FORVO_WORD_MAX), id }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A video's pictures, kept by Panki as a card is made from it, to show on the card in the drawer. */
export async function askPictures(videoId: string, avatar: string | null): Promise<Pictured> {
  const answer = Pictured.safeParse(await ask({ kind: "pictures", videoId, avatar: avatar === null ? null : avatar.slice(0, 2000) }));
  return answer.success ? answer.data : failed(answer.error);
}
/** Where in a video the account's cards were taken from, to mark on its bar. */
export async function askVideoCards(videoId: string): Promise<Carded> {
  const answer = Carded.safeParse(await ask({ kind: "videoCards", videoId }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askTranscript(videoId: string): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "transcript", videoId }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askPiece(piece: Omit<Extract<Ask, { kind: "piece" }>, "kind">): Promise<Pieced> {
  const answer = Pieced.safeParse(await ask({ kind: "piece", ...piece }));
  return answer.success ? answer.data : failed(answer.error);
}
/** What a part typed would widen to, said before it's asked for. */
export async function askRedoStretch(videoId: string, stretch: Stretch): Promise<Stretched> {
  const answer = Stretched.safeParse(await ask({ kind: "redoStretch", videoId, stretch }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A part of the video to be transcribed again, for everyone: the stretch to record, widened to whole pieces. */
export async function askRedo(videoId: string, redo: RedoAsk): Promise<Redone> {
  const answer = Redone.safeParse(await ask({ kind: "redo", videoId, redo }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A part transcribed again, done (its words stand now) or given up; the transcript as it stands then comes back. */
export async function askRedoEnd(videoId: string, redoId: string, done: boolean): Promise<Pieced> {
  const answer = Pieced.safeParse(await ask({ kind: "redoEnd", videoId, redoId, done }));
  return answer.success ? answer.data : failed(answer.error);
}
/** The transcript alone, read again while a whole-video download is under way. */
export async function askPoll(videoId: string): Promise<Pieced> {
  const answer = Pieced.safeParse(await ask({ kind: "poll", videoId }));
  return answer.success ? answer.data : failed(answer.error);
}
/** The whole video, downloaded and transcribed by the engine in the background: the transcript with the download under way in it. */
export async function askWhole(videoId: string, lengthMs: number): Promise<Pieced> {
  const answer = Pieced.safeParse(await ask({ kind: "whole", videoId, lengthMs: Math.min(WHOLE_MAX_MS, Math.max(1, Math.round(lengthMs))) }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askFix(videoId: string, fix: TranscriptFix): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "fix", videoId, fix }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A line of the transcript fixed by hand, for everyone; the transcript as it stands then comes back. */
export async function askLine(videoId: string, fix: TranscriptLineFix): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "line", videoId, fix }));
  return answer.success ? answer.data : failed(answer.error);
}
export async function askSubtitles(source: string): Promise<void> {
  await ask({ kind: "subtitles", source });
}
/** A stretch of the transcript, or all of it (null), forgotten for everyone; the transcript as it stands then comes back. */
export async function askForget(videoId: string, stretch: Stretch | null): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "forget", videoId, stretch }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A preference of this viewer's changed in the strip's menu, kept for the next video. */
export async function askPrefs(prefs: Partial<TranscribePrefs>): Promise<void> {
  await ask({ kind: "prefs", prefs });
}
/** Which of Panki's parts are on in this browser. */
export async function askModules(): Promise<Moduled> {
  const answer = Moduled.safeParse(await ask({ kind: "modules" }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A video as it opens: whether its watching is kept, where it was stopped, whether it counts. */
export async function askWatched(videoId: string): Promise<Watched> {
  const answer = Watched.safeParse(await ask({ kind: "watched", videoId }));
  return answer.success ? answer.data : failed(answer.error);
}
/** Stretches watched, sent to Panki. */
export async function askWatch(batch: WatchBatch): Promise<Done> {
  const answer = Done.safeParse(await ask({ kind: "watch", batch }));
  return answer.success ? answer.data : failed(answer.error);
}
/** Panki's stats and what its tiles draw them with, for YouTube's home page. */
export async function askHome(): Promise<Homed> {
  const answer = Homed.safeParse(await ask({ kind: "home" }));
  return answer.success ? answer.data : failed(answer.error);
}
/** Panki switched on or off altogether, kept for every page from now on. */
export async function askPankiOn(on: boolean): Promise<void> {
  await ask({ kind: "pankiOn", on });
}
/** Videos as their thumbnails are marked; none of them when it can't be asked. */
export async function askGlance(videoIds: readonly string[]): Promise<Glanced> {
  const answer = Glanced.safeParse(await ask({ kind: "glance", videoIds: videoIds.slice(0, GLANCE_MAX) }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A video saved for later (`about`: its name and channel as the page shows them), or its save taken back (null). */
export async function askSave(videoId: string, about: SaveVideo | null): Promise<Saved> {
  const answer = Saved.safeParse(await ask({ kind: "save", videoId, about }));
  return answer.success ? answer.data : failed(answer.error);
}
/** How this extension stands against Panki's build, as last asked: not known when it can't be said. */
export async function askUpdate(): Promise<UpdateState> {
  const answer = Updated.safeParse(await ask({ kind: "update" }));
  if (!answer.success) {
    failed(answer.error);
    return NO_UPDATE;
  }
  return answer.data.ok ? answer.data.update : NO_UPDATE;
}
/** The same, asked of Panki afresh. */
export async function askCheckUpdate(): Promise<Updated> {
  const answer = Updated.safeParse(await ask({ kind: "checkUpdate" }));
  return answer.success ? answer.data : failed(answer.error);
}
/** Panki's build downloaded as a zip, into the browser's downloads. */
export async function askDownloadUpdate(): Promise<Done> {
  const answer = Done.safeParse(await ask({ kind: "downloadUpdate" }));
  return answer.success ? answer.data : failed(answer.error);
}
/** Chrome's page for this extension, where the folder it's loaded from is said. */
export async function askShowFolder(): Promise<void> {
  await ask({ kind: "showFolder" });
}
/** The extension reloaded from its folder, and with `reopen` its own page opened again after. Nothing comes back: everything of this extension's on the page stops with it. */
export async function askReloadPanki(reopen = false): Promise<void> {
  await ask({ kind: "reloadPanki", reopen });
}
/** A video left out of the count, counted again, put away, finished or not (by the viewer unless said); the video as it stands then comes back. */
export async function askWatchMark(videoId: string, mark: WatchMarkKind, source: WatchMarkSource = "viewer"): Promise<Watched> {
  const answer = Watched.safeParse(await ask({ kind: "watchMark", videoId, mark, source }));
  return answer.success ? answer.data : failed(answer.error);
}
