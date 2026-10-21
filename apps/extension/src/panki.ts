import {
  ApiErrorBody,
  BearerLogin,
  CalledCards,
  CardResponse,
  CardTypeList,
  DeckList,
  ForvoTakeResponse,
  ForvoVoicesResponse,
  MediaResponse,
  PIECE_MIME,
  PieceResponse,
  RedoResponse,
  RedoStretchResponse,
  ServerDictionaryList,
  SettingsResponse,
  SrsTypeList,
  TranscriptResponse,
  TranscriptionResponse,
  VideoCards,
  WatchedVideoResponse,
  GlanceResponse,
  SavedResponse,
  StatsResponse,
  type SaveVideo,
  type SavedVideo,
  type SettingsUpdate,
  type CalledCard,
  type Settings,
  type Stats,
  type VideoGlance,
  type WatchBatch,
  type WatchMarkKind,
  type WatchedVideo,
  type CardType,
  type Deck,
  type ForvoTake,
  type ForvoVoice,
  type NewCard,
  type MediaCues,
  type RedoAsk,
  type Stretch,
  type ServerDictionary,
  type SrsType,
  type SubtitleStyle,
  type Transcript,
  type TranscriptFix,
  type TranscriptForget,
  type TranscriptLineFix,
  type TranscriptionStatus,
  type VideoCard,
} from "@panki/contracts";
import { CLIENT } from "./client";

export class PankiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Where Panki is and the sign-in to it. */
export type Door = { address: string; token: string };

type Init = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; headers?: Record<string, string>; body?: string | Blob };

/**
 * The only place the extension calls the network, and only ever Panki's own address: the one the owner typed on the
 * options page and gave the browser's OK for. No cookie goes along; the sign-in is the bearer secret. Every answer is
 * parsed through the contracts. (Word audio from Forvo comes this way too: Panki's server is what calls Forvo.)
 */
async function call<T>(address: string, token: string | null, path: string, init: Init, parse: (body: unknown) => T): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${address}${path}`, {
      method: init.method ?? "GET",
      credentials: "omit",
      headers: { ...init.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(init.body === undefined ? {} : { body: init.body }),
    });
  } catch {
    throw new PankiError("Couldn't reach Panki.", 0);
  }
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const known = ApiErrorBody.safeParse(body);
    throw new PankiError(known.success ? known.data.error.message : "Something went wrong.", res.status);
  }
  return parse(body);
}

const json = (method: "POST" | "PATCH", body: unknown): Init => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const id = encodeURIComponent;

export const panki = {
  /** Signs in as one more device of the account; the answer carries the secret that every later call sends back. */
  signIn: (address: string, name: string, password: string) => call(address, null, "/api/login", json("POST", { name, password, bearer: true, client: CLIENT }), (b) => BearerLogin.parse(b)),
  signOut: ({ address, token }: Door): Promise<void> => call(address, token, "/api/logout", { method: "POST" }, () => undefined),
  decks: ({ address, token }: Door): Promise<Deck[]> => call(address, token, "/api/decks", {}, (b) => DeckList.parse(b).decks),
  types: ({ address, token }: Door): Promise<CardType[]> => call(address, token, "/api/types", {}, (b) => CardTypeList.parse(b).types),
  srsTypes: ({ address, token }: Door): Promise<SrsType[]> => call(address, token, "/api/srs", {}, (b) => SrsTypeList.parse(b).types),
  /** How the account's card clips show their subtitles: the card previewed in the drawer shows them so too. */
  subtitleStyle: ({ address, token }: Door): Promise<SubtitleStyle> => call(address, token, "/api/settings", {}, (b) => SettingsResponse.parse(b).settings.subtitleStyle),
  addCard: ({ address, token }: Door, deckId: string, card: NewCard): Promise<void> =>
    call(address, token, `/api/decks/${id(deckId)}/cards`, json("POST", card), (b) => {
      CardResponse.parse(b);
    }),
  /** A file kept on Panki under an id the sender minted, before the card that names it is made (a clip recorded for a card). */
  uploadMedia: ({ address, token }: Door, mediaId: string, mime: string, file: Blob): Promise<void> =>
    call(address, token, `/api/media/${id(mediaId)}`, { method: "PUT", headers: { "content-type": mime }, body: file }, (b) => {
      MediaResponse.parse(b);
    }),
  /** What's said in a clip just kept, as it was heard on the video, kept with it once. */
  putCues: ({ address, token }: Door, mediaId: string, cues: MediaCues): Promise<void> =>
    call(address, token, `/api/media/${id(mediaId)}/cues`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cues }) }, () => undefined),
  /** A word's recordings on Forvo, asked of Panki, which holds the key and calls Forvo. */
  forvoVoices: ({ address, token }: Door, word: string): Promise<ForvoVoice[]> =>
    call(address, token, `/api/forvo/voices?word=${encodeURIComponent(word)}`, {}, (b) => ForvoVoicesResponse.parse(b).voices),
  /** One of them, kept by Panki as the account's file: its id, to put in a card's field. */
  forvoTake: ({ address, token }: Door, take: ForvoTake): Promise<string> => call(address, token, "/api/forvo/recordings", json("POST", take), (b) => ForvoTakeResponse.parse(b).mediaId),
  /** A file the account holds, to hear before the card is made. */
  media: (door: Door, mediaId: string): Promise<Blob> => bytesAt(door, `/api/media/${id(mediaId)}`),
  /** The dictionaries kept on Panki, to be added here from. */
  dictionaries: ({ address, token }: Door): Promise<ServerDictionary[]> => call(address, token, "/api/dictionaries", {}, (b) => ServerDictionaryList.parse(b).dictionaries),
  /** One of them whole, the zip it was uploaded as, to be imported here. */
  dictionaryFile: (door: Door, dictionaryId: string): Promise<Blob> => bytesAt(door, `/api/dictionaries/${id(dictionaryId)}/file`),
  /** The settings that run transcribing, for everyone, and whether the chosen engine has a key. */
  transcription: ({ address, token }: Door): Promise<TranscriptionStatus> => call(address, token, "/api/transcription", {}, (b) => TranscriptionResponse.parse(b).transcription),
  /** A video's transcript as Panki keeps it; an empty one for a video nobody has transcribed. */
  transcript: ({ address, token }: Door, videoId: string): Promise<Transcript> => call(address, token, `/api/transcripts/${id(videoId)}`, {}, (b) => TranscriptResponse.parse(b).transcript),
  /**
   * A chunk of a video on its way to the engine through Panki, under an id minted here, so sending it again is the same
   * chunk and never a second call to the engine: the stretch it accounts for, where its sound begins, the sound (none
   * for a stretch of nothing), for a run's first chunk how long after the run began it was sent, and for a part being
   * transcribed again its id (kept out of the transcript until the part is done).
   */
  putPiece: (
    { address, token }: Door,
    videoId: string,
    pieceId: string,
    meta: { startMs: number; soundMs: number; endMs: number; since?: number | undefined; redo?: string | undefined },
    wav: Blob | null,
  ): Promise<PieceResponse> =>
    call(
      address,
      token,
      `/api/transcripts/${id(videoId)}/pieces/${id(pieceId)}?start=${meta.startMs}&sound=${meta.soundMs}&end=${meta.endMs}${meta.since === undefined ? "" : `&since=${meta.since}`}${meta.redo === undefined ? "" : `&redo=${id(meta.redo)}`}`,
      wav ? { method: "PUT", headers: { "content-type": PIECE_MIME }, body: wav } : { method: "PUT" },
      (b) => PieceResponse.parse(b),
    ),
  /** The whole video downloaded and transcribed by the engine, on Panki, in the background: the transcript with the download under way in it. */
  wholeVideo: ({ address, token }: Door, videoId: string, lengthMs: number): Promise<Transcript> =>
    call(address, token, `/api/transcripts/${id(videoId)}/whole`, json("POST", { lengthMs }), (b) => TranscriptResponse.parse(b).transcript),
  /** A word of a transcript changed by hand, for everyone. */
  fixWord: ({ address, token }: Door, videoId: string, fix: TranscriptFix): Promise<Transcript> =>
    call(address, token, `/api/transcripts/${id(videoId)}/fixes`, json("POST", fix), (b) => TranscriptResponse.parse(b).transcript),
  /** A line of a transcript changed by hand, for everyone: its words and where it starts and ends. */
  fixLine: ({ address, token }: Door, videoId: string, fix: TranscriptLineFix): Promise<Transcript> =>
    call(address, token, `/api/transcripts/${id(videoId)}/lines`, json("POST", fix), (b) => TranscriptResponse.parse(b).transcript),
  /** A transcript forgotten, a stretch of it or the whole, for everyone: transcribed afresh when a run passes it. */
  forgetTranscript: ({ address, token }: Door, videoId: string, forget: TranscriptForget): Promise<Transcript> =>
    call(address, token, `/api/transcripts/${id(videoId)}/forget`, json("POST", forget), (b) => TranscriptResponse.parse(b).transcript),
  /** What a part typed would widen to, said before it's asked for. */
  redoStretch: ({ address, token }: Door, videoId: string, startMs: number, endMs: number): Promise<Stretch> =>
    call(address, token, `/api/transcripts/${id(videoId)}/redos/stretch?start=${startMs}&end=${endMs}`, {}, (b) => RedoStretchResponse.parse(b).stretch),
  /** A part of a video to be transcribed again, for everyone: the stretch to record comes back widened to whole pieces. */
  startRedo: ({ address, token }: Door, videoId: string, redo: RedoAsk): Promise<RedoResponse> =>
    call(address, token, `/api/transcripts/${id(videoId)}/redos`, json("POST", redo), (b) => RedoResponse.parse(b)),
  /** A part transcribed again, done: its words stand in place of what stood there. */
  finishRedo: ({ address, token }: Door, videoId: string, redoId: string): Promise<Transcript> =>
    call(address, token, `/api/transcripts/${id(videoId)}/redos/${id(redoId)}/done`, { method: "POST" }, (b) => TranscriptResponse.parse(b).transcript),
  /** A part being transcribed again, given up: the transcript is as it was. */
  cancelRedo: ({ address, token }: Door, videoId: string, redoId: string): Promise<Transcript> =>
    call(address, token, `/api/transcripts/${id(videoId)}/redos/${id(redoId)}/cancel`, { method: "POST" }, (b) => TranscriptResponse.parse(b).transcript),
  /** A video's thumbnail as Panki keeps it for everyone: asked of YouTube by Panki's server the first time. */
  thumbnail: (door: Door, videoId: string): Promise<Blob> => bytesAt(door, `/api/videos/${id(videoId)}/thumbnail`),
  /** The video's channel's picture, kept by Panki from where the page shows it (the first time; what's kept stands after). */
  avatar: (door: Door, videoId: string, shown: string): Promise<Blob> =>
    bytesAt(door, `/api/videos/${id(videoId)}/avatar`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: shown }) }),
  /** The account's cards taken from a video: each its clip's stretch, in ms, and its words. */
  videoCards: ({ address, token }: Door, videoId: string): Promise<VideoCard[]> => call(address, token, `/api/videos/${id(videoId)}/cards`, {}, (b) => VideoCards.parse(b).cards),
  /** The account's stats for every deck, its watching and the others' as far as they share: YouTube's home draws Panki's tiles from them. */
  stats: ({ address, token }: Door): Promise<Stats> => call(address, token, "/api/stats", {}, (b) => StatsResponse.parse(b).stats),
  /** The account's settings, as the tiles read them. */
  /**
   * The account's settings. An account's zone is its own, the device's to begin with (the owner, 2026-10-21): the
   * first time it's read here with none, this browser's is written, as the app does when it's opened.
   */
  settings: async ({ address, token }: Door): Promise<Settings> => {
    const settings = await call(address, token, "/api/settings", {}, (b) => SettingsResponse.parse(b).settings);
    if (settings.timeZone !== "") return settings;
    const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return call(address, token, "/api/settings", json("PATCH", { timeZone }), (b) => SettingsResponse.parse(b).settings);
  },
  /** Some of the account's own settings changed (the options page's Video tracking, the same switch as Panki's Settings); the settings after. */
  updateSettings: ({ address, token }: Door, patch: SettingsUpdate): Promise<Settings> =>
    call(address, token, "/api/settings", json("PATCH", patch), (b) => SettingsResponse.parse(b).settings),
  /** Videos as their thumbnails on YouTube are marked: how far the account got, its cards from each, whether Panki has its subtitles. */
  glance: ({ address, token }: Door, videoIds: readonly string[]): Promise<VideoGlance[]> =>
    call(address, token, "/api/watching/glance", json("POST", { videoIds }), (b) => GlanceResponse.parse(b).videos),
  /** A video as the account's watching has it: whether it's kept at all, where it was stopped, whether it counts. */
  watched: ({ address, token }: Door, videoId: string): Promise<WatchedVideo> => call(address, token, `/api/watching/videos/${id(videoId)}`, {}, (b) => WatchedVideoResponse.parse(b).video),
  /** Stretches of videos watched, kept on the account's Panki (nothing, when its Video tracking is off). */
  watch: ({ address, token }: Door, batch: WatchBatch): Promise<void> => call(address, token, "/api/watching", json("POST", batch), () => undefined),
  /** A video left out of the count, counted again, or put away from Continue watching. */
  watchMark: ({ address, token }: Door, videoId: string, kind: WatchMarkKind): Promise<WatchedVideo> =>
    call(address, token, `/api/watching/videos/${id(videoId)}/marks`, json("POST", { kind }), (b) => WatchedVideoResponse.parse(b).video),
  /** The videos saved for later, newest first: the account's own, never YouTube's. */
  saved: ({ address, token }: Door): Promise<SavedVideo[]> => call(address, token, "/api/watching/saved", {}, (b) => SavedResponse.parse(b).videos),
  /** A video saved for later with its name and channel as the page shows them, or the save taken back; the saved videos after. */
  save: ({ address, token }: Door, videoId: string, about: SaveVideo | null): Promise<SavedVideo[]> =>
    call(
      address,
      token,
      `/api/watching/saved/${id(videoId)}`,
      about ? { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(about) } : { method: "DELETE" },
      (b) => SavedResponse.parse(b).videos,
    ),
  /** The account's cards, in any deck, already called by one of these words: the drawer says so before a card is added. */
  cardsCalled: ({ address, token }: Door, words: readonly string[]): Promise<CalledCard[]> =>
    call(address, token, `/api/cards/called?${words.map((word) => `word=${id(word)}`).join("&")}`, {}, (b) => CalledCards.parse(b).cards),
};

/** A file's bytes from Panki, as they are: no answer to parse, only the file. */
async function bytesAt({ address, token }: Door, path: string, init: Init = {}): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${address}${path}`, {
      method: init.method ?? "GET",
      credentials: "omit",
      headers: { ...init.headers, authorization: `Bearer ${token}` },
      ...(init.body === undefined ? {} : { body: init.body }),
    });
  } catch {
    throw new PankiError("Couldn't reach Panki.", 0);
  }
  if (!res.ok) throw new PankiError("Panki didn't send the file.", res.status);
  return res.blob();
}
