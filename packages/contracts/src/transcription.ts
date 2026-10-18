import { z } from "zod";

/**
 * A video transcribed by an engine (the owner's decision of 2026-10-16 and 17, which set aside "nothing generated"
 * for this one thing: "YouTube's subtitles are kinda wack… AI is so good at transcribing"). The extension plays the
 * video silently ahead of the viewer, cuts its sound into pieces where nobody is speaking, and sends each piece to
 * Panki's server, which hands it to the engine and keeps the words it hears with their times. One transcript per
 * video, shared by every account; the settings that run it are shared too, and only an admin changes them.
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
  /** What an hour of sound costs, in US cents: only the display turns it into dollars. */
  centsPerHour: number;
};
export const ENGINES: Record<EngineId, Engine> = {
  elevenlabs: { name: "ElevenLabs Scribe v2", vendor: "ElevenLabs", centsPerHour: 22 },
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
 * The language every video is transcribed in, told to the engine with each piece (ISO 639-3, as ElevenLabs takes it),
 * one registry. Japanese to begin with, and seldom changed, so it's an admin's setting with the rest (the owner,
 * 2026-10-18: "treat it as Japanese… make it a setting"). Until then the engine was asked what it heard for a run's
 * first pieces, and a video it heard surely as another language stopped transcribing ("Not Japanese"); that check is
 * gone, and a video in another language is transcribed as this one.
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
 * The settings that run transcribing, for everyone; changed only by an admin: what it costs and what the engine hears.
 * It always starts from where the viewer is, the moment the video plays ("Starts after" and "Starts from" were
 * settings until the owner cut them, 2026-10-17: "if I open a video, it means I want to watch it", and "there's no
 * situation in which I'd want to start from the beginning"). What's the viewer's own is the extension's, kept in the
 * browser, not a setting here: where the words come from ("Until Panki catches up" was one, replaced the same day),
 * and, since later that day ("any option that's client side"), whether it starts by itself or at a press, what it does
 * while the video is paused, and whether the transcript replaces the site's captions on the picture. A stored value
 * for a setting that's gone reads as nothing; one for a setting that's new reads as its default.
 */
export const Transcription = z.object({
  speed: TranscribeSpeed,
  /** How far ahead of the viewer it goes before waiting for them, in minutes. */
  lead: z.number().int().min(1).max(180),
  engine: EngineId,
  /** What the engine is told every video is in (`TRANSCRIBE_LANGUAGES`): it's never asked. */
  language: TranscribeLanguage,
});
export type Transcription = z.infer<typeof Transcription>;
/**
 * It runs only three minutes ahead: whatever the silent player has run ahead over is paid for, and a video left early
 * stops it, so the lead is all a quit video costs (about a cent of sound, where ten minutes is about four). At 3× the
 * lead fills at two minutes of video a minute. How the sound is cut into pieces for the engine is the extension's own
 * (`transcribe/pieces.ts` → `CUT`, documented there), not a setting: the owner had its three lengths in Settings for an
 * hour (2026-10-17) and took them out, "invisible to the user, it's just a super smart algorithm from their perspective".
 */
export const DEFAULT_TRANSCRIPTION: Transcription = { speed: 3, lead: 3, engine: "elevenlabs", language: "jpn" };
export const TranscriptionUpdate = Transcription.partial();
export type TranscriptionUpdate = z.infer<typeof TranscriptionUpdate>;

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

/**
 * A video's transcript as Panki keeps it: every word still standing, in the video's order, and the stretches of the
 * video that have been transcribed (`covered`, merged), so the extension knows where to go on from. `language` is the
 * language it was last transcribed in, as the engine was told (ISO 639-3, "jpn"); null until a piece heard words. It
 * decides nothing (it once did, while the engine was asked; 2026-10-18). A video never transcribed is an empty
 * transcript, never an error.
 */
export const Transcript = z.object({
  videoId: VideoId,
  language: z.string().nullable(),
  words: z.array(TranscriptWord),
  covered: z.array(Stretch),
});
export type Transcript = z.infer<typeof Transcript>;
export const TranscriptResponse = z.object({ transcript: Transcript });

/** Minted by the extension, so a piece sent again is the same piece and never a second call to the engine. */
export const PieceId = z.uuid();
const MB = 1024 * 1024;
/** The longest piece's sound: the extension's forced cut at 75 seconds, with its overlap and some slack (it was 30 seconds while a piece was a sentence or so, until 2026-10-17). */
export const PIECE_MAX_MS = 90_000;
/** The most a piece's sound may weigh: 16-bit samples at the rate the engine listens at (16 kHz), for that long, with room. */
export const PIECE_MAX_BYTES = 4 * MB;
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
  })
  .transform((meta) => ({ ...meta, sound: meta.sound ?? meta.start }))
  .refine((meta) => meta.end > meta.start && meta.start <= meta.sound && meta.sound <= meta.end && meta.end - meta.sound <= PIECE_MAX_MS, {
    message: "A piece is a stretch of the video, its sound no longer than a minute and a half.",
  });
export type PieceMeta = z.infer<typeof PieceMeta>;

/** What the engine says of a piece's language as it answers: its code and how sure it was, 0 to 1. Kept with the piece; nothing is decided by it. */
export const HeardLanguage = z.object({ code: z.string(), probability: z.number().min(0).max(1) });
export type HeardLanguage = z.infer<typeof HeardLanguage>;

/** The transcript with the piece in it. */
export const PieceResponse = z.object({ transcript: Transcript });
export type PieceResponse = z.infer<typeof PieceResponse>;

/**
 * A transcript forgotten, "to start from scratch" (the owner, 2026-10-17): a stretch of the video, in ms, or the whole
 * of it ({}). What's there stands aside, never deleted, and the stretch is transcribed afresh when a run passes it.
 */
export const TranscriptForget = z.union([Stretch.refine((stretch) => stretch.endMs > stretch.startMs, { message: "A stretch ends after it begins." }), z.object({}).strict()]);
export type TranscriptForget = z.infer<typeof TranscriptForget>;

/** The longest a word can be made by a fix. */
export const FIX_MAX = 100;
/** A word of the transcript changed by hand: which, and what it says now. Kept beside the engine's word, never over it. */
export const TranscriptFix = z.object({ wordId: z.number().int(), text: z.string().trim().min(1).max(FIX_MAX) });
export type TranscriptFix = z.infer<typeof TranscriptFix>;
