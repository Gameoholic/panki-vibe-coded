import { z } from "zod";

/**
 * A video transcribed by an engine (the owner's decision of 2026-10-16 and 17, which set aside "nothing generated"
 * for this one thing: "YouTube's subtitles are kinda wack… AI is so good at transcribing"). Two ways, which the modes
 * below combine: the extension plays the video silently ahead of the viewer, cuts its sound into chunks where nobody is
 * speaking, and sends each chunk ("piece", in the shapes and the tables) to Panki's server, which hands it to the
 * engine and keeps the words it hears with their times; or Panki's server asks the engine to fetch the whole video
 * itself and transcribe it in one call (2026-10-20). One transcript per video, shared by every account; the settings
 * that run it are shared too, and only an admin changes them.
 */

/** A YouTube video's id as its address carries it: eleven letters, digits, dashes and underscores. */
export const VideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
export type VideoId = z.infer<typeof VideoId>;

/** The engines that can transcribe, one entry each. A new engine is one entry here and one in the API's registry. */
export const EngineId = z.enum(["elevenlabs"]);
export type EngineId = z.infer<typeof EngineId>;
export const ENGINE_IDS = EngineId.options;
export type Engine = {
  name: string;
  /** Who runs it, and gives the key for it. */
  vendor: string;
  /**
   * What it costs, as its vendor lists it, never measured (the owner, 2026-10-20: "the cost estimation should come from
   * the pricing of the model… only the time estimation comes from our data"): an hour of sound in US cents (its API,
   * paid in dollars; only the display turns it into dollars), and a minute of sound in the credits of a plan.
   */
  centsPerHour: number;
  creditsPerMinute: number;
};
export const ENGINES: Record<EngineId, Engine> = {
  // elevenlabs.io/pricing/api, "Scribe v2… Price per hour $0.22"; elevenlabs.io/pricing, "Speech to Text 330 credits per minute" (read 2026-10-20).
  elevenlabs: { name: "ElevenLabs Scribe v2", vendor: "ElevenLabs", centsPerHour: 22, creditsPerMinute: 330 },
};

/**
 * How fast the silent player runs. The sound it makes comes out at the sound card's rate whatever the speed, so speed
 * N keeps only what the voice said below the card's top note divided by N: at 3× that's exactly what the engine
 * listens to, 4× loses a little of the s and sh sounds, and anything beyond is a phone call or worse. One home.
 */
export const TRANSCRIBE_SPEEDS = [1, 1.5, 2, 2.5, 3, 3.5, 4] as const;
export const TranscribeSpeed = z.literal([...TRANSCRIBE_SPEEDS]);
export type TranscribeSpeed = z.infer<typeof TranscribeSpeed>;

/**
 * The language a video is transcribed in, told to the engine with each piece (ISO 639-3, as ElevenLabs takes it), one
 * registry. Each account's own (`Settings.language`, English to begin with): it was an admin's setting for everyone
 * from 2026-10-18 ("treat it as Japanese… make it a setting") until the owner made it each account's alone on
 * 2026-10-21. Before the 18th the engine was asked what it heard for a run's first pieces, and a video it heard surely
 * as another language stopped transcribing ("Not Japanese"); that check is gone, and a video is transcribed in the
 * language of whoever asks.
 */
export const TranscribeLanguage = z.enum(["jpn", "eng", "cmn", "kor", "spa", "fra", "deu", "por", "ita", "rus"]);
export type TranscribeLanguage = z.infer<typeof TranscribeLanguage>;
export const TRANSCRIBE_LANGUAGE_IDS = TranscribeLanguage.options;
export const TRANSCRIBE_LANGUAGES: Record<TranscribeLanguage, string> = {
  jpn: "Japanese",
  eng: "English",
  cmn: "Chinese (Mandarin)",
  kor: "Korean",
  spa: "Spanish",
  fra: "French",
  deu: "German",
  por: "Portuguese",
  ita: "Italian",
  rus: "Russian",
};

/**
 * How a video is transcribed (the owner, 2026-10-19 and 20, on the plan page https://claude.ai/artifact/Ewy5PU1JTWAgPFABVGwt2V,
 * after a 16-minute video came back whole in 41 s): the engine fetching the whole video itself, in one call (Full);
 * chunks heard by a hidden player running ahead of the viewer, as it was done until then (Live); or chunks while the
 * whole video is transcribed in the background, whose transcript then replaces them (Hybrid). One registry; the names
 * are the owner's (they were All at once, As you watch and Head start for a day). An admin sets the mode everyone starts
 * on and can switch the others off; a viewer picks among those left, in the strip's menu. (Auto, Hybrid within the
 * length limit and Live past it, went the same day at the owner's word, Hybrid asking over the limit making it
 * redundant: "remove auto completely"; a stored "auto" reads as nothing.)
 */
export const TranscribeMode = z.enum(["full", "live", "hybrid"]);
export type TranscribeMode = z.infer<typeof TranscribeMode>;
export const TRANSCRIBE_MODE_IDS = TranscribeMode.options;
export const TRANSCRIBE_MODES: Record<TranscribeMode, { name: string }> = {
  full: { name: "Full" },
  live: { name: "Live" },
  hybrid: { name: "Hybrid" },
};

/** What's done about a whole-video download for a video longer than the download limit: it goes ahead, it isn't done, or the viewer is asked first. */
export const OverLimit = z.enum(["allowed", "notAllowed", "warn"]);
export type OverLimit = z.infer<typeof OverLimit>;
export const OVER_LIMIT_IDS = OverLimit.options;
export const OVER_LIMIT_WORDS: Record<OverLimit, string> = { allowed: "Allowed", notAllowed: "Not allowed", warn: "Warn first" };

/** The longest a chunk's length and its wait for a pause may be set to, in seconds: together they're the longest sound a chunk can be (`PIECE_MAX_MS`). */
export const CHUNK_LENGTH_MAX = 60;
export const PAUSE_WAIT_MAX = 60;

/**
 * The settings that run transcribing, for everyone; changed only by an admin: what it costs and what the engine hears.
 * It always starts from where the viewer is, the moment the video plays ("Starts after" and "Starts from" were
 * settings until the owner cut them, 2026-10-17: "if I open a video, it means I want to watch it", and "there's no
 * situation in which I'd want to start from the beginning"). What's the viewer's own is the extension's, kept in the
 * browser, not a setting here: where the words come from ("Until Panki catches up" was one, replaced the same day),
 * and, since later that day ("any option that's client side"), whether it starts by itself or at a press, what it does
 * while the video is paused, whether the transcript replaces the site's captions on the picture, and which of the modes
 * left on they use. A stored value for a setting that's gone reads as nothing; one for a setting that's new reads as its
 * default.
 *
 * How the sound is cut into chunks became settings again on 2026-10-20, at the owner's word on the plan page (they had
 * three such lengths here for an hour on 2026-10-17 and took them out then: "invisible to the user"): the first chunk
 * short, so the first words come quickly, each next one longer up to the chunk length, a chunk closed at the first pause
 * past its length or cut where it stands after the wait, and long stretches with no speech skipped. The rest of the
 * cutter's tuning stays the extension's (`transcribe/pieces.ts` → `CUT`, documented there).
 */
export const Transcription = z.object({
  speed: TranscribeSpeed,
  /** How far ahead of the viewer the chunks go before waiting for them, in minutes. */
  lead: z.number().int().min(1).max(180),
  engine: EngineId,
  // The language every video was told in was here until 2026-10-21; it's each account's own now (`Settings.language`).
  /** The mode everyone starts on, until a viewer picks another. Never switched off (`modesOn`). */
  mode: TranscribeMode,
  /** The modes switched off for everyone; one that's gone since (Auto) read as nothing. */
  modesOff: z.preprocess((value) => (Array.isArray(value) ? value.filter((mode) => TRANSCRIBE_MODE_IDS.some((id) => id === mode)) : value), z.array(TranscribeMode).max(TRANSCRIBE_MODE_IDS.length)),
  /** Minutes: a video longer than this is over the download limit, for the whole-video download. */
  downloadLimit: z.number().int().min(1).max(600),
  overLimit: OverLimit,
  /** Seconds of video the first chunk is, on a new video or after a jump. */
  firstChunk: z.number().int().min(1).max(CHUNK_LENGTH_MAX),
  /** Each next chunk is this many times as long as the last, up to the chunk length. */
  chunkGrowth: z.number().min(1).max(4),
  /** Seconds of video a chunk is once it has grown. */
  chunkLength: z.number().int().min(5).max(CHUNK_LENGTH_MAX),
  /** Seconds a chunk past its length waits for a pause before it's cut where it stands. */
  pauseWait: z.number().int().min(1).max(PAUSE_WAIT_MAX),
  /** Long stretches with no speech aren't sent to the engine. */
  skipSilence: z.boolean(),
});
export type Transcription = z.infer<typeof Transcription>;
/**
 * The chunks run only three minutes ahead: whatever the hidden player has run ahead over is paid for, and a video left
 * early stops it, so the lead is all a quit video costs (about a cent of sound, where ten minutes is about four). At 4×
 * the lead fills at three minutes of video a minute. The chunks: 3 s, each next 1.5× the last (4.5, 7, 10, 15, 23, 34),
 * then 45, 45… seconds, each closed at the first pause past that or 30 s later at the latest (the owner's numbers,
 * 2026-10-20 and 21; it was 45 s for every piece, cut at 75 s, until the 20th's morning). A video over half an hour
 * asks before it's transcribed whole.
 */
export const DEFAULT_TRANSCRIPTION: Transcription = {
  speed: 4,
  lead: 3,
  engine: "elevenlabs",
  mode: "hybrid",
  modesOff: [],
  downloadLimit: 30,
  overLimit: "warn",
  firstChunk: 3,
  chunkGrowth: 1.5,
  chunkLength: 45,
  pauseWait: 30,
  skipSilence: true,
};
export const TranscriptionUpdate = Transcription.partial();
export type TranscriptionUpdate = z.infer<typeof TranscriptionUpdate>;

/** The modes a viewer can pick among: every one not switched off, and the default always. */
export const modesOn = (settings: Pick<Transcription, "mode" | "modesOff">): TranscribeMode[] =>
  TRANSCRIBE_MODE_IDS.filter((mode) => mode === settings.mode || !settings.modesOff.includes(mode));
/** The mode a viewer transcribes in: their own pick while it's on, the default otherwise. */
export const modeOf = (settings: Pick<Transcription, "mode" | "modesOff">, picked: TranscribeMode | null): TranscribeMode =>
  picked !== null && modesOn(settings).includes(picked) ? picked : settings.mode;
/** Whether a video of this many seconds is over the download limit. */
export const overDownloadLimit = (settings: Pick<Transcription, "downloadLimit">, seconds: number): boolean => seconds > settings.downloadLimit * 60;
/** The length of the chunk after one of `seconds`: grown by the growth, up to the chunk length. The first is the first chunk's. */
export const nextChunk = (settings: Pick<Transcription, "chunkGrowth" | "chunkLength">, seconds: number): number => Math.min(settings.chunkLength, seconds * settings.chunkGrowth);

/**
 * How long transcribing takes, as measured on this engine's own downloads and chunks of the last 30 days (the owner,
 * 2026-10-19: "based on previous data, so it's not just an estimation that you hard code"), each the middle of what was
 * measured; null where nothing has been yet. Time alone: what it costs, in dollars and in credits, is the engine's
 * listed price (`ENGINES`), never measured (the owner, 2026-10-20; the credits measured across a download read 0, the
 * engine's count moving a while after the call).
 */
export const TranscribeEstimate = z.object({
  /** The whole-video downloads it was read from. */
  jobs: z.number().int().nonnegative(),
  /** Seconds a whole-video download took per minute of video. */
  secondsPerMinute: z.number().nonnegative().nullable(),
  /** How long the videos downloaded whole were, in ms. */
  lengthMs: z.number().int().nonnegative().nullable(),
  /** Ms from a chunk run's start to its first words back. */
  firstWordsMs: z.number().int().nonnegative().nullable(),
});
export type TranscribeEstimate = z.infer<typeof TranscribeEstimate>;

/**
 * The settings as they stand, whose key the chosen engine has (typed in Settings, the server's own from its
 * environment, or none), that key as it is when it was typed in Settings and an admin is asking (`saved`; left out for
 * anyone else, and the server's own is never shown), and how many seconds of sound have been sent to engines so far,
 * every video and everyone counted.
 */
export const TranscriptionStatus = z.object({
  settings: Transcription,
  key: z.enum(["settings", "server"]).nullable(),
  saved: z.string().optional(),
  seconds: z.number().int().nonnegative(),
  estimate: TranscribeEstimate,
  /** The language the one asking has their videos transcribed in: their account's own (`Settings.language`). */
  own: TranscribeLanguage,
});
export type TranscriptionStatus = z.infer<typeof TranscriptionStatus>;
export const TranscriptionResponse = z.object({ transcription: TranscriptionStatus });

/**
 * The engine's account as the engine tells of it, for an admin to see in Settings (the owner, 2026-10-17: "how many
 * credits I have left, how much top up, my plan"): the plan's name and standing, the credits used of the period's
 * limit and when they reset, and what pay-as-you-go use has come to so far this period, in the account's currency.
 * Read from ElevenLabs' `GET /v1/user/subscription` (`tier`, `status`, `character_count`, `character_limit`,
 * `next_character_count_reset_unix`, `current_overage`); another engine fills the same shape from its own.
 */
export const EngineAccount = z.object({
  plan: z.string(),
  status: z.string(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  /** Ms since epoch; null when the engine doesn't say. */
  resetsAt: z.number().int().nullable(),
  /** As the engine writes it ("0.46"), with its currency ("usd"); null when it says nothing of it. */
  overage: z.object({ amount: z.string(), currency: z.string() }).nullable(),
});
export type EngineAccount = z.infer<typeof EngineAccount>;
export const EngineAccountResponse = z.object({ account: EngineAccount });

/** The longest key taken for an engine. */
export const ENGINE_KEY_MAX = 200;
/** An engine's key typed in Settings, or null to forget it. */
export const EngineKeyUpdate = z.object({ key: z.string().trim().min(1).max(ENGINE_KEY_MAX).nullable() });
export type EngineKeyUpdate = z.infer<typeof EngineKeyUpdate>;

/** A stretch of a video, in its own milliseconds. */
export const Stretch = z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative() });
export type Stretch = z.infer<typeof Stretch>;

/** One word the engine heard, with when. `text` is what stands now; `heard` is the engine's own word when a fix changed it. */
export const TranscriptWord = z.object({
  id: z.number().int(),
  text: z.string(),
  heard: z.string().optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});
export type TranscriptWord = z.infer<typeof TranscriptWord>;

/** The longest video Panki believes it's told of, for a whole-video download: twelve hours. */
export const WHOLE_MAX_MS = 12 * 60 * 60 * 1000;

/**
 * A video downloaded whole by the engine and transcribed in one call (Full, and Hybrid behind its chunks): asked for
 * once, never cancelled (it's paid for as it starts), and when it's done its words replace everything the video had,
 * chunks and hand fixes alike (the owner, 2026-10-20: "the latest one overwrites"). `askedAt` and `endedAt` are Panki's
 * clock; `lengthMs` is the video's length as the extension read it off the player. Done, `words` is how many it heard
 * and `replaced` how many chunks stood aside for it; failed, `message` says why, in the owner's words.
 */
export const WholeJob = z.object({
  id: z.string(),
  state: z.enum(["running", "done", "failed"]),
  askedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  lengthMs: z.number().int().positive(),
  words: z.number().int().nonnegative().nullable(),
  replaced: z.number().int().nonnegative().nullable(),
  message: z.string().nullable(),
});
export type WholeJob = z.infer<typeof WholeJob>;
/** A whole-video download asked for: the video's length, as the player says it. */
export const WholeAsk = z.object({ lengthMs: z.number().int().positive().max(WHOLE_MAX_MS) });
export type WholeAsk = z.infer<typeof WholeAsk>;

/**
 * A video's transcript as Panki keeps it: every word still standing, in the video's order, and the stretches of the
 * video that have been transcribed (`covered`, merged), so the extension knows where to go on from. `language` is the
 * language it was last transcribed in, as the engine was told (ISO 639-3, "jpn"); null until a piece heard words. It
 * decides nothing (it once did, while the engine was asked; 2026-10-18). `job` is the video's latest whole-video
 * download, under way or ended; null when it was never downloaded whole. A video never transcribed is an empty
 * transcript, never an error.
 */
export const Transcript = z.object({
  videoId: VideoId,
  language: z.string().nullable(),
  words: z.array(TranscriptWord),
  covered: z.array(Stretch),
  job: WholeJob.nullable(),
});
export type Transcript = z.infer<typeof Transcript>;
export const TranscriptResponse = z.object({ transcript: Transcript });

/** Minted by the extension, so a piece sent again is the same piece and never a second call to the engine. */
export const PieceId = z.uuid();
const MB = 1024 * 1024;
/**
 * The longest piece's sound: the longest a chunk can be set to with the longest wait for a pause, and some slack. It
 * was 30 seconds while a piece was a sentence or so (until 2026-10-17), then 90 while every piece was cut at 75.
 */
export const PIECE_MAX_MS = (CHUNK_LENGTH_MAX + PAUSE_WAIT_MAX + 5) * 1000;
/** The most a piece's sound may weigh: 16-bit samples at the rate the engine listens at (16 kHz), for that long, with room. */
export const PIECE_MAX_BYTES = 5 * MB;
/** The sound of a piece: 16-bit PCM, one channel, in a WAV container, at whatever rate the extension says in its header. */
export const PIECE_MIME = "audio/wav";

/**
 * What's said of a piece beside its sound, in the address of its PUT: the stretch of the video it accounts for
 * (`start` to `end`); and where in it the sound sent begins (`sound`, `start` when left out: the quiet before it was
 * listened through and had nothing to send, so it counts as heard; `sound` at `end` is a stretch of nothing at all,
 * sent with no sound). (`check`, whether the engine was to say what language it heard, went with the check, 2026-10-18.)
 */
export const PieceMeta = z
  .object({
    start: z.coerce.number().int().nonnegative(),
    sound: z.coerce.number().int().nonnegative().optional(),
    end: z.coerce.number().int().positive(),
    /** A run's first piece with sound: the ms from the run's start until it was sent, so Panki can tell how soon the first words come (`TranscribeEstimate`). */
    since: z.coerce.number().int().nonnegative().optional(),
    /** A piece of a part being transcribed again (`RedoAsk`): kept out of the transcript until the part is done. */
    redo: z.uuid().optional(),
  })
  .transform((meta) => ({ ...meta, sound: meta.sound ?? meta.start }))
  .refine((meta) => meta.end > meta.start && meta.start <= meta.sound && meta.sound <= meta.end && meta.end - meta.sound <= PIECE_MAX_MS, {
    message: "A chunk is a stretch of the video, its sound no longer than two minutes.",
  });
export type PieceMeta = z.infer<typeof PieceMeta>;

/** What the engine says of a piece's language as it answers: its code and how sure it was, 0 to 1. Kept with the piece; nothing is decided by it. */
export const HeardLanguage = z.object({ code: z.string(), probability: z.number().min(0).max(1) });
export type HeardLanguage = z.infer<typeof HeardLanguage>;

/** The transcript with the piece in it, and how long the engine took over it (null when it wasn't asked: a stretch of nothing, a piece sent again, or one the whole video covers already). */
export const PieceResponse = z.object({ transcript: Transcript, engineMs: z.number().int().nonnegative().nullable() });
export type PieceResponse = z.infer<typeof PieceResponse>;

/**
 * A transcript forgotten, "to start from scratch" (the owner, 2026-10-17): a stretch of the video, in ms, or the whole
 * of it ({}). What's there stands aside, never deleted, and the stretch is transcribed afresh when a run passes it.
 */
export const TranscriptForget = z.union([Stretch.refine((stretch) => stretch.endMs > stretch.startMs, { message: "A stretch ends after it begins." }), z.object({}).strict()]);
export type TranscriptForget = z.infer<typeof TranscriptForget>;

/**
 * A part of a video transcribed again, in chunks (the owner, 2026-10-20: "Re-transcribe a part", in place of forgetting
 * one): its id, minted by the extension, and the stretch asked for, in ms. Its pieces are kept out of the transcript as
 * they come (`PieceMeta.redo`), and the transcript doesn't change until the whole part is in; then, at once, what
 * stood over the stretch stands aside and the new pieces stand in its place. Nothing is deleted.
 */
export const RedoAsk = z
  .object({ id: z.uuid(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() })
  .refine((ask) => ask.endMs > ask.startMs, { message: "A stretch ends after it begins." });
export type RedoAsk = z.infer<typeof RedoAsk>;
/**
 * A part being transcribed again, as Panki takes it: the stretch to record, widened from the one asked for to the
 * edges of every piece reaching into it, so what stands aside when it's done is heard again whole and leaves no hole.
 */
export const Redo = z.object({ id: z.uuid(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() });
export type Redo = z.infer<typeof Redo>;
export const RedoResponse = z.object({ transcript: Transcript, redo: Redo });
export type RedoResponse = z.infer<typeof RedoResponse>;
/** A part as typed, in the address (ms): what it would widen to is said before it's asked for, so the times typed are the times done. */
export const RedoQuery = z
  .object({ start: z.coerce.number().int().nonnegative(), end: z.coerce.number().int().positive() })
  .refine((query) => query.end > query.start, { message: "A stretch ends after it begins." });
export type RedoQuery = z.infer<typeof RedoQuery>;
export const RedoStretchResponse = z.object({ stretch: Stretch });
export type RedoStretchResponse = z.infer<typeof RedoStretchResponse>;

/** The longest a word can be made by a fix. */
export const FIX_MAX = 100;
/** A word of the transcript changed by hand: which, and what it says now. Kept beside the engine's word, never over it. */
export const TranscriptFix = z.object({ wordId: z.number().int(), text: z.string().trim().min(1).max(FIX_MAX) });
export type TranscriptFix = z.infer<typeof TranscriptFix>;

/** The most words a line fixed by hand can hold, and the most it can be typed as. */
export const LINE_FIX_WORDS_MAX = 400;
export const LINE_FIX_TEXT_MAX = 2000;
/**
 * A line of the transcript fixed by hand, with the pencil at the end of its row (the owner, 2026-10-19, on finding a
 * word could be fixed only by double-clicking it: "maybe add a pencil icon somewhere to enter edit for that specific
 * sentence"): its words, in order, what the line says now, and where it now starts and ends, in ms (the owner, the
 * next day: "I should be able to also change the timestamps"). The typed words are laid back onto the line's own
 * (`realignLine`), each keeping its place in the line as the ends move; every word changed is a fix kept beside the
 * engine's, never over it.
 */
export const TranscriptLineFix = z
  .object({
    wordIds: z.array(z.number().int()).min(1).max(LINE_FIX_WORDS_MAX),
    text: z.string().trim().max(LINE_FIX_TEXT_MAX),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .refine((fix) => fix.endMs > fix.startMs, { message: "The line ends before it starts." });
export type TranscriptLineFix = z.infer<typeof TranscriptLineFix>;

/** A word of a line as it stands, or as it's to stand once the line is fixed: empty text is a word taken out by hand. */
export type LineWord = { id: number; text: string; startMs: number; endMs: number };

/**
 * A line typed over, laid back onto its words. The text: the old and the new are matched letter by letter (their
 * longest common run of letters, in order), and each word takes the new letters from where its first letter landed to
 * where the next word's did; letters added between two words go with the one before (the first word takes what's added
 * before it), and a word all of whose letters went, with nothing added, is taken out (empty). The times: each word
 * keeps its place in the line, stretched or shrunk with it as its ends are moved. Pure, so the API and a test can run it.
 */
export function realignLine(words: readonly LineWord[], text: string, startMs: number, endMs: number): LineWord[] {
  const was = words.flatMap((w) => [...w.text]);
  const next = [...text];
  // Longest common run of letters of the two, in order (a line is a sentence or two: a few hundred letters at most).
  const n = was.length;
  const m = next.length;
  const table = new Int32Array((n + 1) * (m + 1));
  const common = (i: number, j: number) => table[i * (m + 1) + j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * (m + 1) + j] = was[i] === next[j] ? common(i + 1, j + 1) + 1 : Math.max(common(i + 1, j), common(i, j + 1));
    }
  }
  // Where each old letter's place lands in the new text, walking both from the start. Where either would do, a letter
  // is dropped before what's typed in its place is taken, so a word typed over keeps what replaced it; letters only
  // added at the edge between two words land before the next word's first letter, so they go with the one before.
  const landed = new Array<number>(n + 1).fill(m);
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && was[i] === next[j]) {
      landed[i] = j;
      i++;
      j++;
    } else if (j < m && common(i, j + 1) > common(i + 1, j)) {
      j++;
    } else {
      landed[i] = j;
      i++;
    }
  }
  // A word's letters in the new text: from where its first letter landed (the first word from the start) to where the next word's did.
  const firsts: number[] = [];
  let count = 0;
  for (const word of words) {
    firsts.push(count);
    count += [...word.text].length;
  }
  const landedAt = (letter: number | undefined) => (letter === undefined ? m : (landed[letter] ?? m));
  const from = (k: number) => (k === 0 ? 0 : landedAt(firsts[k]));
  const to = (k: number) => (k === words.length - 1 ? m : landedAt(firsts[k + 1]));
  const lineStart = Math.min(...words.map((w) => w.startMs));
  const lineEnd = Math.max(...words.map((w) => w.endMs));
  const span = lineEnd - lineStart;
  const scale = span > 0 ? (endMs - startMs) / span : 0;
  const moved = (t: number) => Math.max(0, Math.round(startMs + (t - lineStart) * scale));
  return words.map((w, k) => ({
    id: w.id,
    text: next.slice(from(k), Math.max(from(k), to(k))).join("").trim(),
    startMs: moved(w.startMs),
    endMs: Math.max(moved(w.startMs), moved(w.endMs)),
  }));
}
