/** @panki What a page's script asks the worker, each message a shape (`askLocal`, `askState`, `askDeck`, `askAdd`, `askUpload`). */
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
  ExplainAsk,
  ExplainProblem,
  Explained,
  AiUnread,
  PankiAiStatus,
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
  Proofread,
  ProofreadAsk,
  Redo,
  RedoAsk,
  SrsType,
  Stretch,
  SubtitleStyle,
  TouchUpAsk,
  TouchedUp,
  TranscribeEstimate,
  TranscribeLanguage,
  Transcript,
  TranscriptFix,
  TranscriptLineFix,
  TranscriptUndo,
  TranscriptLineMark,
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
import { HoverDelay, LookKey, LookWhere } from "./lookSettings";
import { Modules, PanelView, PanelWidth } from "./modules";
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

/** A tab of the options page the drawer sends the viewer to: the sign-in, or a deck's field mapping. */
export const OptionsTab = z.enum(["account", "decks", "youtube"]);
export type OptionsTab = z.infer<typeof OptionsTab>;

/**
 * Words that are in your decks, as this browser marks them: in Panki's subtitles, on every page, and in which colours:
 * each by its stage's (`byStage`), or all in one (`colour`).
 */
export const KnownLook = z.object({ subtitles: z.boolean(), pages: z.boolean(), byStage: z.boolean(), colour: MarkPaint, suspendedColour: MarkPaint, flaggedColour: MarkPaint });
export type KnownLook = z.infer<typeof KnownLook>;

/**
 * This browser's own settings, everything of them a page's script draws or behaves by, as one value (`storage.ts` →
 * `LOCAL`, one entry per part): asked of the worker once as a page starts (`askLocal`), answered from the browser's
 * storage alone with nothing asked of Panki, and sent to every page again the moment any of it changes
 * (`LocalChanged`). A page draws nothing of Panki's before it's in (`local.ts`), so nothing is ever drawn in a default
 * and then redrawn in the viewer's own. What the Word pop-up may do on a page stays its own ask (`lookState`):
 * it's answered for the page's address and from the dictionaries, which this storage doesn't hold.
 */
export const Local = z.object({
  /** How transcribing behaves and looks for this viewer: the seek bar's marks, the subtitles over the video, the mode. */
  prefs: TranscribePrefs,
  /** Where a video's words come from (`subtitles.ts`), read as `sourceOf` reads it. */
  source: z.string(),
  /** The pick last shown, Panki's or YouTube's, that the subtitles come back to when toggled on from None (`subtitles.ts` → `toggledSource`), read as `sourceOf` reads it. */
  sourceOn: z.string(),
  /** Which of Panki's parts are on, and how they behave (`modules.ts`). */
  modules: Modules,
  known: KnownLook,
  /**
   * The Word pop-up's own: the keys held, globally and in Panki's subtitles, where it works and how it's laid out
   * as kept. Whether it works on a page, and the layout filled out against the dictionaries, are `lookState`'s, asked
   * again whenever these change.
   */
  look: z.object({ key: LookKey, subtitleKey: LookKey, delay: HoverDelay, subtitleDelay: HoverDelay, where: LookWhere, sites: z.array(z.string()), layout: PopupLayout.nullable() }),
  /** This browser's Video tracking (`watch/tracking.ts`); off until it's settled. */
  tracking: z.boolean(),
  /** The drawer's own: what fills each deck's fields, which decks are switched on to be added to, the deck it opens on. */
  drawer: z.object({ maps: z.record(z.string(), FieldMap), mappingOn: z.record(z.string(), z.boolean()), defaultDeckId: DeckId.nullable() }),
});
export type Local = z.infer<typeof Local>;

/** The worker telling every page this browser's settings changed, with all of them as they stand now. */
export const LocalChanged = z.object({ kind: z.literal("local"), local: Local });
export type LocalChanged = z.infer<typeof LocalChanged>;

export const Ask = z.discriminatedUnion("kind", [
  /** What the panel needs of Panki to open: the decks, their card types and SRS types (to show the card as a review will). What fills each deck's fields and the deck it opens on are this browser's (`Local`). */
  z.object({ kind: z.literal("state") }),
  /** This browser's own settings, all of them (`Local`). Needs no sign-in, and asks nothing of Panki. */
  z.object({ kind: z.literal("local") }),
  /** A deck was chosen in the drawer: it's the one the drawer opens on from now. */
  z.object({ kind: z.literal("deck"), deckId: DeckId }),  z.object({ kind: z.literal("add"), deckId: DeckId, card: NewCard }),
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
  /**
   * Open Panki itself in a tab: the address of the profile in use, at one of its cards when one is given (open in its
   * deck's list), never an address the page writes. Nobody signed in, it
   * opens the options page to sign in instead.
   */
  z.object({ kind: z.literal("open"), card: z.object({ deckId: DeckId, cardId: CardId }).optional() }),
  /** The account's cards already called by the words a card is about to be added with: the drawer says so. */
  z.object({ kind: z.literal("called"), words: CardsCalled.shape.word }),
  /** Whether pointing at a word looks it up on the page asking, and how the popup is laid out against the dictionaries there are. Needs no sign-in: the dictionaries are this browser's own. */
  z.object({ kind: z.literal("lookState") }),
  /** The words in the account's cards, when anything of this browser's marks them (how they're marked is `Local`'s `known`). */
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
  /** A video as it opens: where it was stopped, whether it counts, whether it's finished. */
  z.object({ kind: z.literal("watched"), videoId: VideoId }),
  /** Stretches of videos watched, with the videos they're of, kept on Panki. */
  z.object({ kind: z.literal("watch"), batch: WatchBatch }),
  /** A video left out of the count, counted again, put away from Continue watching, finished or not, and who said so. */
  z.object({ kind: z.literal("watchMark"), videoId: VideoId, mark: WatchMarkKind, source: WatchMarkSource }),
  /** What YouTube's home shows of Panki: who's signed in, the account's stats, its decks and settings. */
  z.object({ kind: z.literal("home") }),
  /** Panki switched on or off altogether, from the strip's head. */
  z.object({ kind: z.literal("pankiOn"), on: z.boolean() }),
  /** Where the Panki panel stands on a video's page, picked on the panel itself. */
  z.object({ kind: z.literal("panelView"), view: PanelView }),
  /** How wide the panel's column stands at the page's right, as its left edge was dragged; null, the site's own width. */
  z.object({ kind: z.literal("panelWidth"), width: PanelWidth }),
  /** In the site's full screen, the panel toggled by its key or its handle: shown or folded away. */
  z.object({ kind: z.literal("fullPanel"), shown: z.boolean() }),
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
  /**
   * Panki AI as it stands for everyone, as the worker keeps it: what the pop-up's Explain says it can cost, or why it
   * can't run. `fresh` asks Panki again first (a template menu opened: one made in Panki a moment ago is in it).
   */
  z.object({ kind: z.literal("aiState"), fresh: z.boolean().optional() }),
  /** A word pointed at explained by Panki AI, or a follow-up to its answer: the pieces it's asked with and the conversation so far. */
  z.object({ kind: z.literal("explain"), ask: ExplainAsk }),
  /** The card being added in the drawer touched up by Panki AI: its pieces, the dictionary's meanings and the keys it has fields for. */
  z.object({ kind: z.literal("touchUp"), ask: TouchUpAsk }),
  /** Lines of a video's Panki subtitles proofread by Panki AI (AI step 6): the lines by their words' ids, and the pieces only the page has. */
  z.object({ kind: z.literal("proofread"), ask: ProofreadAsk }),
  /** Panki AI's edits on a video's transcript taken back, a word's or a run's, one step each. */
  z.object({ kind: z.literal("undoFixes"), videoId: VideoId, undo: TranscriptUndo }),
  /** A line of a video's transcript split or joined by hand at a word. */
  z.object({ kind: z.literal("lineMark"), videoId: VideoId, mark: TranscriptLineMark }),
]);
export type Ask = z.infer<typeof Ask>;

/** Panki AI as a page is told it: its settings and whose key it has, never the key itself (`saved`, an admin's). */
export const AiShown = PankiAiStatus.omit({ saved: true });
export type AiShown = z.infer<typeof AiShown>;
/** Panki AI as it stands; null signed out. */
const AiState = z.union([z.object({ ok: z.literal(true), ai: AiShown.nullable() }), z.object({ ok: z.literal(false), message: z.string() })]);
export type AiState = z.infer<typeof AiState>;

const LookState = z.union([
  z.object({
    ok: z.literal(true),
    /** Pointing at a word looks it up here: the site is one the setting allows, and there's a dictionary to look in. The keys held are `Local`'s. */
    on: z.boolean(),
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
/**
 * The words every card is called by, those only suspended cards are, those a flagged card is, and each word's stage's
 * colour (`WordsInCards.colours`, a new word left out); none while nothing of this browser's marks them.
 */
const Known = z.union([
  z.object({ ok: z.literal(true), words: z.array(z.string()), suspended: z.array(z.string()), flagged: z.array(z.string()), colours: z.record(z.string(), z.string()).default({}) }),
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
/** This browser's own settings. */
const Localled = z.union([z.object({ ok: z.literal(true), local: Local }), Failed]);
export type Localled = z.infer<typeof Localled>;
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
/** A video as the account's watching has it. Whether this browser notes it is its own Video tracking (`Local`'s `tracking`). */
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
    /** How the account's card clips show their subtitles (Panki's Settings): the card previewed here shows them so too. */
    subtitleStyle: SubtitleStyle,
  }),
  Failed,
]);
export type State = z.infer<typeof State>;
export type Done = z.infer<typeof Done>;
/** A video's transcript with what runs transcribing, Panki's alone: the shared settings, whether the chosen engine has a key, what a whole-video download takes as measured so far. This browser's pick of source and its preferences are `Local`'s. */
const Transcripted = z.union([
  // `language` is the account's own, told to the engine: each account's, nothing Panki-wide.
  z.object({ ok: z.literal(true), transcript: Transcript, settings: Transcription, language: TranscribeLanguage, key: z.boolean(), estimate: TranscribeEstimate }),
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
/**
 * A Panki AI place refused by Panki with its reason (`problem`), and an answer that came back unusable, for Details'
 * Log (`unread`). Explain's and Touch up's alike: one family.
 */
const AiRefusal = z.object({ ok: z.literal(false), message: z.string(), problem: ExplainProblem, unread: AiUnread.nullable().default(null) });
/** Explain answered, refused by Panki, or failed as any ask can (signed out, Panki not reached). */
const ExplainAnswer = z.union([z.object({ ok: z.literal(true), explain: Explained }), AiRefusal, Failed]);
export type ExplainAnswer = z.input<typeof ExplainAnswer>;
/** A Panki AI place that didn't answer, as the page reads it: why, signed out among the reasons; null for a failure with no reason of Panki's. */
type AiFailed = { ok: false; message: string; problem: ExplainProblem | "signedOut" | null; unread: AiUnread | null };
/** Explain as the pop-up reads it: the answer, or why there's none. */
export type Explanation = { ok: true; explain: Explained } | AiFailed;
/** Touch up answered, refused by Panki, or failed as any ask can. */
const TouchUpAnswered = z.union([z.object({ ok: z.literal(true), touchUp: TouchedUp }), AiRefusal, Failed]);
export type TouchUpAnswered = z.input<typeof TouchUpAnswered>;
/** Touch up as the drawer reads it: the answer, or why there's none. */
export type TouchUpResult = { ok: true; touchUp: TouchedUp } | AiFailed;
/** Proofread answered (its edits and the transcript after), refused by Panki, or failed as any ask can. */
const ProofreadAnswered = z.union([z.object({ ok: z.literal(true), proofread: Proofread, transcript: Transcript }), AiRefusal, Failed]);
export type ProofreadAnswered = z.input<typeof ProofreadAnswered>;
/** Proofread as the strip reads it: the edits and the transcript after, or why there are none. */
export type ProofreadResult = { ok: true; proofread: Proofread; transcript: Transcript } | AiFailed;

/** The background telling a page's script to capture what's there now (the menu, the toolbar button). */
export const Trigger = z.object({ kind: z.literal("capture") });
export type Trigger = z.infer<typeof Trigger>;

const GONE = "Panki was updated or switched off. Reload this page.";
const NO_ANSWER = "Panki's background didn't answer.";
const UNREAD = "Panki's answer couldn't be read.";

/**
 * One question to the background and its answer. Each way it can go wrong says its own words, and why goes to the
 * page's console: the extension gone from under this page (reloaded), its background not answering, or an answer that
 * isn't of the shape asked for (`failed`). Said all as "updated or switched off", they'd send the viewer reloading
 * everything when that isn't it.
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
}export async function askAdd(add: Omit<Extract<Ask, { kind: "add" }>, "kind">): Promise<Done> {
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
/** This browser's own settings, all of them, from its storage alone. */
export async function askLocal(): Promise<Localled> {
  const answer = Localled.safeParse(await ask({ kind: "local" }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A video as it opens: whether this browser notes it, where it was stopped, whether it counts. */
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
/** The Panki panel's view, picked on the panel, kept for every video from now on. */
export async function askPanelView(view: PanelView): Promise<void> {
  await ask({ kind: "panelView", view });
}
/** The panel's column's width, as its left edge was dragged, kept for every video from now on. */
export async function askPanelWidth(width: PanelWidth): Promise<void> {
  await ask({ kind: "panelWidth", width });
}
/** The panel in full screen toggled, kept so the next full screen opens as this one was left. */
export async function askFullPanel(shown: boolean): Promise<void> {
  await ask({ kind: "fullPanel", shown });
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
/** Panki AI as the worker keeps it (null signed out), for the pop-up's Explain; `fresh`, asked of Panki again first. */
export async function askAiState(fresh = false): Promise<AiState> {
  const answer = AiState.safeParse(await ask({ kind: "aiState", fresh }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A word explained by Panki AI, or a follow-up asked: its answer, or why there's none. */
export async function askExplain(explain: ExplainAsk): Promise<Explanation> {
  const answer = ExplainAnswer.safeParse(await ask({ kind: "explain", ask: explain }));
  if (!answer.success) return { ...failed(answer.error), problem: null, unread: null };
  const got = answer.data;
  if (got.ok) return got;
  if ("problem" in got) return { ok: false, message: got.message, problem: got.problem, unread: got.unread };
  return { ok: false, message: got.message, problem: got.signedOut ? "signedOut" : null, unread: null };
}
/** The drawer's card touched up by Panki AI: its proposals, or why there are none. */
export async function askTouchUp(touchUp: TouchUpAsk): Promise<TouchUpResult> {
  const answer = TouchUpAnswered.safeParse(await ask({ kind: "touchUp", ask: touchUp }));
  if (!answer.success) return { ...failed(answer.error), problem: null, unread: null };
  const got = answer.data;
  if (got.ok) return got;
  if ("problem" in got) return { ok: false, message: got.message, problem: got.problem, unread: got.unread };
  return { ok: false, message: got.message, problem: got.signedOut ? "signedOut" : null, unread: null };
}
/** Lines of a video's transcript proofread by Panki AI: its edits and the transcript after, or why there are none. */
export async function askProofread(proofread: ProofreadAsk): Promise<ProofreadResult> {
  const answer = ProofreadAnswered.safeParse(await ask({ kind: "proofread", ask: proofread }));
  if (!answer.success) return { ...failed(answer.error), problem: null, unread: null };
  const got = answer.data;
  if (got.ok) return got;
  if ("problem" in got) return { ok: false, message: got.message, problem: got.problem, unread: got.unread };
  return { ok: false, message: got.message, problem: got.signedOut ? "signedOut" : null, unread: null };
}
/** Panki AI's edits taken back, a word's or a run's; the transcript as it stands then comes back. */
export async function askUndoFixes(videoId: string, undo: TranscriptUndo): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "undoFixes", videoId, undo }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A line split or joined by hand at a word, for everyone; the transcript as it stands then comes back. */
export async function askLineMark(videoId: string, mark: TranscriptLineMark): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "lineMark", videoId, mark }));
  return answer.success ? answer.data : failed(answer.error);
}
/** A video left out of the count, counted again, put away, finished or not (by the viewer unless said); the video as it stands then comes back. */
export async function askWatchMark(videoId: string, mark: WatchMarkKind, source: WatchMarkSource = "viewer"): Promise<Watched> {
  const answer = Watched.safeParse(await ask({ kind: "watchMark", videoId, mark, source }));
  return answer.success ? answer.data : failed(answer.error);
}
