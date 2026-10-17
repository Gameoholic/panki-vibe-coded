import {
  ApiErrorBody,
  CardList,
  CardResponse,
  CardTypeList,
  CardTypeResponse,
  DeckList,
  DeckResponse,
  EngineAccountResponse,
  WordAudioResponse,
  MeResponse,
  MediaResponse,
  ReviewSessionResponse,
  ServerDictionaryList,
  ServerDictionaryResponse,
  SettingsResponse,
  SpaceResponse,
  SrsTypeList,
  StorageReportResponse,
  SrsTypeResponse,
  StatsResponse,
  TranscriptionResponse,
  type Card,
  type CardAnswer,
  type CardType,
  type CardTypeUpdate,
  type CardUpdate,
  type Deck,
  type DeckUpdate,
  type EngineId,
  type EngineAccount,
  type EventBatch,
  type WordAudioSourceId,
  type WordAudioStatus,
  type WordAudioUpdate,
  type Login,
  type Media,
  type NewCard,
  type NewCardType,
  type NewDeck,
  type NewReviewSession,
  type NewSrsType,
  type ReviewSession,
  type ReviewSessionEnd,
  type ServerDictionary,
  type Settings,
  type SettingsUpdate,
  type Space,
  type SrsType,
  type StorageReport,
  type SrsTypeUpdate,
  type Stats,
  type TranscriptionStatus,
  type TranscriptionUpdate,
} from "@panki/contracts";

/** Who is signed in and on which devices, as `GET /api/me` answers. */
export type Me = ReturnType<typeof MeResponse.parse>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Told once, by `App`, when any call finds the owner signed out; `App` then shows the sign-in screen. */
let signedOut: (() => void) | null = null;

type Options = {
  /** The request outlives the page: the review's "left" is sent while the screen goes away. */
  keepalive?: boolean;
  /** A 401 here is the call's own answer (a wrong password), not a lost sign-in. */
  ownsUnauthorized?: boolean;
};

/** The only place that calls fetch. Every response is parsed through the contracts. */
async function request<T>(path: string, init: RequestInit | undefined, parse: (body: unknown) => T, { keepalive = false, ownsUnauthorized = false }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, keepalive ? { ...init, keepalive } : init);
  } catch {
    throw new ApiError("Couldn't reach Panki.", 0);
  }
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !ownsUnauthorized) signedOut?.();
    const known = ApiErrorBody.safeParse(body);
    throw new ApiError(known.success ? known.data.error.message : "Something went wrong.", res.status);
  }
  return parse(body);
}

function send(method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): RequestInit {
  return body === undefined ? { method } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

const deckPath = (deckId: string) => `/api/decks/${encodeURIComponent(deckId)}`;
const typePath = (typeId: string) => `/api/types/${encodeURIComponent(typeId)}`;
const srsPath = (typeId: string) => `/api/srs/${encodeURIComponent(typeId)}`;
const mediaPath = (mediaId: string) => `/api/media/${encodeURIComponent(mediaId)}`;
const dictionaryPath = (id: string) => `/api/dictionaries/${encodeURIComponent(id)}`;
const TRANSCRIPTION_PATH = "/api/transcription";
const WORD_AUDIO_PATH = "/api/word-audio";
const engineKeyPath = (engineId: EngineId) => `${TRANSCRIPTION_PATH}/keys/${encodeURIComponent(engineId)}`;
const EVENTS_PATH = "/api/events";

export const api = {
  /** `App` registers what happens when a call finds the owner signed out. */
  onSignedOut: (handler: (() => void) | null) => {
    signedOut = handler;
  },
  me: (): Promise<Me> => request("/api/me", undefined, (b) => MeResponse.parse(b)),
  /** A 401 is the wrong name or password, said in the error's message; a 429 is too many tries. */
  login: (login: Login): Promise<Me> => request("/api/login", send("POST", login), (b) => MeResponse.parse(b), { ownsUnauthorized: true }),
  logout: (): Promise<void> => request("/api/logout", send("POST"), () => undefined),
  /** Signs one device out; signing this one out is the same as `logout`. */
  removeSession: (sessionId: string): Promise<void> => request(`/api/sessions/${encodeURIComponent(sessionId)}`, send("DELETE"), () => undefined),
  /** Every device, this one included. */
  removeAllSessions: (): Promise<void> => request("/api/sessions", send("DELETE"), () => undefined),
  sendEvents: (batch: EventBatch): Promise<void> => request(EVENTS_PATH, send("POST", batch), () => undefined),
  /** The same batch as the page goes away: a beacon outlives the tab where a fetch may not. Says whether the browser took it. */
  beaconEvents: (batch: EventBatch): boolean => navigator.sendBeacon(EVENTS_PATH, new Blob([JSON.stringify(batch)], { type: "application/json" })),
  /** What's left on the disk Panki keeps its data on, and whether that's little enough to say so. */
  space: (): Promise<Space> => request("/api/space", undefined, (b) => SpaceResponse.parse(b).space),
  /** Everything Panki's data takes on that disk, account by account; an admin's to read. */
  storageReport: (): Promise<StorageReport> => request("/api/space/report", undefined, (b) => StorageReportResponse.parse(b).report),
  stats: (deckId: string | null): Promise<Stats> => request(deckId === null ? "/api/stats" : `/api/stats?deck=${encodeURIComponent(deckId)}`, undefined, (b) => StatsResponse.parse(b).stats),
  listTypes: (): Promise<CardType[]> => request("/api/types", undefined, (b) => CardTypeList.parse(b).types),
  addType: (type: NewCardType): Promise<CardType> => request("/api/types", send("POST", type), (b) => CardTypeResponse.parse(b).type),
  updateType: (typeId: string, update: CardTypeUpdate): Promise<CardType> => request(typePath(typeId), send("PATCH", update), (b) => CardTypeResponse.parse(b).type),
  /** Hides the type; refused while a deck uses it. */
  removeType: (typeId: string): Promise<void> => request(typePath(typeId), send("DELETE"), () => undefined),
  listSrs: (): Promise<SrsType[]> => request("/api/srs", undefined, (b) => SrsTypeList.parse(b).types),
  addSrs: (type: NewSrsType): Promise<SrsType> => request("/api/srs", send("POST", type), (b) => SrsTypeResponse.parse(b).type),
  updateSrs: (typeId: string, update: SrsTypeUpdate): Promise<SrsType> => request(srsPath(typeId), send("PATCH", update), (b) => SrsTypeResponse.parse(b).type),
  /** Hides the SRS type; refused while a deck uses it. */
  removeSrs: (typeId: string): Promise<void> => request(srsPath(typeId), send("DELETE"), () => undefined),
  getSettings: (): Promise<Settings> => request("/api/settings", undefined, (b) => SettingsResponse.parse(b).settings),
  updateSettings: (patch: SettingsUpdate): Promise<Settings> => request("/api/settings", send("PATCH", patch), (b) => SettingsResponse.parse(b).settings),
  /** A file's bytes from where it's played (an address of Panki's, or an object URL for one just picked): to draw its sound's shape. */
  fileBytes: async (src: string): Promise<ArrayBuffer> => {
    let res: Response;
    try {
      res = await fetch(src);
    } catch {
      throw new ApiError("Couldn't reach Panki.", 0);
    }
    if (!res.ok) throw new ApiError("That file couldn't be read.", res.status);
    return res.arrayBuffer();
  },
  /** Where word audio comes from, whose key the source has and, for an admin, the key and the day's requests. */
  getWordAudio: (): Promise<WordAudioStatus> => request(WORD_AUDIO_PATH, undefined, (b) => WordAudioResponse.parse(b).wordAudio),
  /** Where word audio comes from, for everyone; an admin's to change. */
  updateWordAudio: (patch: WordAudioUpdate): Promise<WordAudioStatus> => request(WORD_AUDIO_PATH, send("PATCH", patch), (b) => WordAudioResponse.parse(b).wordAudio),
  /** Keeps a source's key for everyone, or forgets it (null). An admin's to change. */
  setWordAudioKey: (sourceId: WordAudioSourceId, key: string | null): Promise<WordAudioStatus> =>
    request(`${WORD_AUDIO_PATH}/keys/${encodeURIComponent(sourceId)}`, send("PUT", { key }), (b) => WordAudioResponse.parse(b).wordAudio),
  /** The dictionaries kept on Panki, to be added to the extension from its options page. */
  listDictionaries: (): Promise<ServerDictionary[]> => request("/api/dictionaries", undefined, (b) => ServerDictionaryList.parse(b).dictionaries),
  /** Keeps a dictionary's zip on Panki under an id minted here, so sending it again is harmless. What it's called, Panki reads from the zip itself. */
  uploadDictionary: (id: string, file: Blob): Promise<ServerDictionary> =>
    request(dictionaryPath(id), { method: "PUT", headers: { "content-type": "application/zip" }, body: file }, (b) => ServerDictionaryResponse.parse(b).dictionary),
  /** Takes one off Panki, its zip deleted from the server; a copy already added to the extension stays there. */
  removeDictionary: (id: string): Promise<void> => request(dictionaryPath(id), send("DELETE"), () => undefined),
  /** How transcribing runs for everyone, whose key the engine has, and how much sound has gone to engines so far. */
  getTranscription: (): Promise<TranscriptionStatus> => request(TRANSCRIPTION_PATH, undefined, (b) => TranscriptionResponse.parse(b).transcription),
  /** Changes some of how transcribing runs; an admin's alone. */
  updateTranscription: (patch: TranscriptionUpdate): Promise<TranscriptionStatus> => request(TRANSCRIPTION_PATH, send("PATCH", patch), (b) => TranscriptionResponse.parse(b).transcription),
  /** Keeps an engine's key, or forgets it (null); an admin's alone. The key itself never comes back. */
  setEngineKey: (engineId: EngineId, key: string | null): Promise<TranscriptionStatus> => request(engineKeyPath(engineId), send("PUT", { key }), (b) => TranscriptionResponse.parse(b).transcription),
  /** The engine's account behind the key, as the engine tells of it: the plan, the credits, the pay-as-you-go so far. An admin's to read. */
  engineAccount: (): Promise<EngineAccount> => request(`${TRANSCRIPTION_PATH}/account`, undefined, (b) => EngineAccountResponse.parse(b).account),
  listDecks: (): Promise<Deck[]> => request("/api/decks", undefined, (b) => DeckList.parse(b).decks),
  addDeck: (deck: NewDeck): Promise<Deck> => request("/api/decks", send("POST", deck), (b) => DeckResponse.parse(b).deck),
  updateDeck: (deckId: string, update: DeckUpdate): Promise<Deck> => request(deckPath(deckId), send("PATCH", update), (b) => DeckResponse.parse(b).deck),
  /** Hides the deck and its cards; nothing is destroyed. */
  removeDeck: (deckId: string): Promise<void> => request(deckPath(deckId), send("DELETE"), () => undefined),
  listCards: (deckId: string): Promise<Card[]> => request(`${deckPath(deckId)}/cards`, undefined, (b) => CardList.parse(b).cards),
  addCard: (deckId: string, card: NewCard): Promise<Card> => request(`${deckPath(deckId)}/cards`, send("POST", card), (b) => CardResponse.parse(b).card),
  /** Changes some of a card's values; a field left out keeps what it has. Each change keeps what the value was. */
  updateCard: (deckId: string, cardId: string, update: CardUpdate): Promise<Card> =>
    request(`${deckPath(deckId)}/cards/${encodeURIComponent(cardId)}`, send("PATCH", update), (b) => CardResponse.parse(b).card),
  /** Hides the card from its deck; nothing is destroyed. */
  removeCard: (deckId: string, cardId: string): Promise<void> => request(`${deckPath(deckId)}/cards/${encodeURIComponent(cardId)}`, send("DELETE"), () => undefined),
  /**
   * Gives Panki a file (a sound, a clip, a picture) under an id minted here, so sending it again is harmless. `mime` is
   * what the contracts' `mediaMimeFor` makes of the file; the API checks it against the file's own first bytes.
   */
  uploadMedia: (mediaId: string, mime: string, file: Blob): Promise<Media> =>
    request(mediaPath(mediaId), { method: "PUT", headers: { "content-type": mime }, body: file }, (b) => MediaResponse.parse(b).media),
  /** Where a file's bytes are, for an `<img>`, an `<audio>` or a `<video>` to fetch by itself; the sign-in rides along. */
  mediaUrl: mediaPath,
  /** Answers a card in a review; the API decides where it goes and when it comes back. */
  answerCard: (deckId: string, cardId: string, answer: CardAnswer): Promise<Card> =>
    request(`${deckPath(deckId)}/cards/${encodeURIComponent(cardId)}/answers`, send("POST", answer), (b) => CardResponse.parse(b).card),
  /** A sitting with a deck begins; the browser mints its id, so a retry returns the one already started. */
  startSession: (deckId: string, session: NewReviewSession): Promise<ReviewSession> =>
    request(`${deckPath(deckId)}/sessions`, send("POST", session), (b) => ReviewSessionResponse.parse(b).session),
  /** How the sitting ended. `keepalive` for the one sent as the screen goes away. */
  endSession: (deckId: string, sessionId: string, end: ReviewSessionEnd, keepalive = false): Promise<ReviewSession> =>
    request(`${deckPath(deckId)}/sessions/${encodeURIComponent(sessionId)}`, send("PATCH", end), (b) => ReviewSessionResponse.parse(b).session, { keepalive }),
};
