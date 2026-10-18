import { z } from "zod";
import { TranscribePrefs } from "./transcribe/prefs";
import { CardType, Deck, DeckId, FORVO_WORD_MAX, ForvoVoice, MediaCues, MediaId, MediaKind, NewCard, PIECE_MAX_BYTES, PieceId, SrsType, Stretch, Transcript, TranscriptFix, Transcription, VideoId } from "@panki/contracts";
import { Found, Lattice } from "./dictionary/found";
import { LookKey } from "./lookSettings";
import { PopupLayout } from "./popupLayout";
import { FieldMap } from "./roles";

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
const LATTICE_MAX = 600;
/** A recording of a word is a few dozen kilobytes; this is far more than any, as text. */
const RECORDING_MAX = 3_000_000;
/** A piece of a video's sound on its way to the background, as text: a third more than the file itself may weigh. */
const PIECE_BASE64_MAX = Math.ceil((PIECE_MAX_BYTES * 4) / 3) + 4;

/** A tab of the options page the drawer sends the owner to: the sign-in, or a deck's field mapping. */
export const OptionsTab = z.enum(["account", "decks", "youtube"]);
export type OptionsTab = z.infer<typeof OptionsTab>;

export const Ask = z.discriminatedUnion("kind", [
  /** What the panel needs to open: the decks, their card types and SRS types (to show the card as a review will), what fills each deck's fields, the deck it opens on. */
  z.object({ kind: z.literal("state") }),
  /** A deck was chosen in the drawer: it's the one the drawer opens on from now. */
  z.object({ kind: z.literal("deck"), deckId: DeckId }),
  z.object({ kind: z.literal("add"), deckId: DeckId, card: NewCard }),
  /** A recorded clip, kept as a file on Panki before the card that names it is made. */
  z.object({ kind: z.literal("upload"), mediaKind: MediaKind, mediaId: MediaId, mime: z.string().max(100), base64: z.string().max(BASE64_MAX), cues: MediaCues.optional() }),
  /** Open the options page: to sign in, or to say what fills a deck's fields. */
  z.object({ kind: z.literal("options"), tab: OptionsTab.optional() }),
  /** Open Panki itself in a tab: the address of the profile in use. Nobody signed in, it opens the options page to sign in instead. */
  z.object({ kind: z.literal("open") }),
  /** Whether pointing at a word looks it up on the page asking, with which key held, and how the popup is laid out. Needs no sign-in: the dictionaries are this browser's own. */
  z.object({ kind: z.literal("lookState") }),
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
  /** A piece for the engine: the stretch of the video it accounts for, where in it its sound begins, and the WAV as text (none for a stretch of nothing). */
  z.object({
    kind: z.literal("piece"),
    videoId: VideoId,
    pieceId: PieceId,
    startMs: z.number().int().nonnegative(),
    soundMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    base64: z.string().max(PIECE_BASE64_MAX).nullable(),
  }),
  /** A word of a transcript changed by hand. */
  z.object({ kind: z.literal("fix"), videoId: VideoId, fix: TranscriptFix }),
  /** A transcript forgotten, a stretch of the video (ms) or the whole (null), for everyone: transcribed afresh when a run passes it. */
  z.object({ kind: z.literal("forget"), videoId: VideoId, stretch: Stretch.nullable() }),
  /** How transcribing behaves for this viewer, changed in the strip's menu: kept here, as the options page keeps it. */
  z.object({ kind: z.literal("prefs"), prefs: TranscribePrefs.partial() }),
  /** Where the words under a video come from, as picked in the line: kept for the next video. */
  z.object({ kind: z.literal("subtitles"), source: z.string().max(40) }),
]);
export type Ask = z.infer<typeof Ask>;

const LookState = z.union([
  z.object({
    ok: z.literal(true),
    /** Pointing at a word looks it up here: the site is one the setting allows, and there's a dictionary to look in. */
    on: z.boolean(),
    key: LookKey,
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
    /** The options page's setting: whether a clip's end snaps to the edges of words as it's pulled. */
    clipToWords: z.boolean(),
  }),
  Failed,
]);
export type State = z.infer<typeof State>;
export type Done = z.infer<typeof Done>;
/** A video's transcript with what runs transcribing: the shared settings, whether the chosen engine has a key, and this browser's order of sources. */
const Transcripted = z.union([z.object({ ok: z.literal(true), transcript: Transcript, settings: Transcription, key: z.boolean(), source: z.string(), prefs: TranscribePrefs }), Failed]);
export type Transcripted = z.infer<typeof Transcripted>;
/** A piece heard: the transcript with it in, what language the engine heard when asked, and what that came to. */
const Pieced = z.union([z.object({ ok: z.literal(true), transcript: Transcript }), Failed]);
export type Pieced = z.infer<typeof Pieced>;

/** The background telling a page's script to capture what's there now (the menu, the toolbar button). */
export const Trigger = z.object({ kind: z.literal("capture") });
export type Trigger = z.infer<typeof Trigger>;

const GONE = "Panki was updated or switched off. Reload this page.";

/** One question to the background and its answer. A background that's gone (the extension was reloaded under this page) says so. */
async function ask(message: Ask): Promise<unknown> {
  try {
    const answer: unknown = await chrome.runtime.sendMessage(message);
    return answer;
  } catch {
    return { ok: false, message: GONE };
  }
}
const failed = (): { ok: false; message: string } => ({ ok: false, message: GONE });

export async function askState(): Promise<State> {
  const answer = State.safeParse(await ask({ kind: "state" }));
  return answer.success ? answer.data : failed();
}
export async function askDeck(deckId: string): Promise<void> {
  await ask({ kind: "deck", deckId });
}
export async function askAdd(add: Omit<Extract<Ask, { kind: "add" }>, "kind">): Promise<Done> {
  const answer = Done.safeParse(await ask({ kind: "add", ...add }));
  return answer.success ? answer.data : failed();
}
export async function askUpload(upload: Omit<Extract<Ask, { kind: "upload" }>, "kind">): Promise<Done> {
  const answer = Done.safeParse(await ask({ kind: "upload", ...upload }));
  return answer.success ? answer.data : failed();
}
/** Opens the options page, on the tab where what's needed is done. */
export async function askOptions(tab: OptionsTab): Promise<void> {
  await ask({ kind: "options", tab });
}
/** Opens Panki, the one the profile in use is signed in to, in a tab of its own. */
export async function askOpenPanki(): Promise<void> {
  await ask({ kind: "open" });
}
export async function askLookState(): Promise<LookState> {
  const answer = LookState.safeParse(await ask({ kind: "lookState" }));
  return answer.success ? answer.data : failed();
}
export async function askLookup(text: string): Promise<Looked> {
  const answer = Looked.safeParse(await ask({ kind: "lookup", text: text.slice(0, LOOKUP_MAX) }));
  return answer.success ? answer.data : failed();
}
export async function askLattice(text: string): Promise<Latticed> {
  const answer = Latticed.safeParse(await ask({ kind: "lattice", text: text.slice(0, LATTICE_MAX) }));
  return answer.success ? answer.data : failed();
}
export async function askVoices(word: string): Promise<Voiced> {
  const answer = Voiced.safeParse(await ask({ kind: "voices", word: word.slice(0, FORVO_WORD_MAX) }));
  return answer.success ? answer.data : failed();
}
export async function askVoice(word: string, id: number): Promise<Heard> {
  const answer = Heard.safeParse(await ask({ kind: "voice", word: word.slice(0, FORVO_WORD_MAX), id }));
  return answer.success ? answer.data : failed();
}
export async function askTranscript(videoId: string): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "transcript", videoId }));
  return answer.success ? answer.data : failed();
}
export async function askPiece(piece: Omit<Extract<Ask, { kind: "piece" }>, "kind">): Promise<Pieced> {
  const answer = Pieced.safeParse(await ask({ kind: "piece", ...piece }));
  return answer.success ? answer.data : failed();
}
export async function askFix(videoId: string, fix: TranscriptFix): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "fix", videoId, fix }));
  return answer.success ? answer.data : failed();
}
export async function askSubtitles(source: string): Promise<void> {
  await ask({ kind: "subtitles", source });
}
/** A stretch of the transcript, or all of it (null), forgotten for everyone; the transcript as it stands then comes back. */
export async function askForget(videoId: string, stretch: Stretch | null): Promise<Transcripted> {
  const answer = Transcripted.safeParse(await ask({ kind: "forget", videoId, stretch }));
  return answer.success ? answer.data : failed();
}
/** A preference of this viewer's changed in the strip's menu, kept for the next video. */
export async function askPrefs(prefs: Partial<TranscribePrefs>): Promise<void> {
  await ask({ kind: "prefs", prefs });
}
