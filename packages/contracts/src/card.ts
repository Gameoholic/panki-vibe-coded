import { z } from "zod";
import { ClientName } from "./auth";
import { DeckId } from "./deck";
import { MediaCues, MediaKind } from "./media";
import { CardPlace } from "./srs";
import { Stretch } from "./transcription";
import { CardFieldId, VALUE_MAX } from "./type";

/** Minted by the browser, so a retried POST returns the card that already exists instead of a second one. */
export const CardId = z.uuid();

/** A card's text, by field id. Which fields exist and which must be filled is the deck's card type's call (`cardProblems`). */
export const CardValues = z.record(CardFieldId, z.string().trim().max(VALUE_MAX));

/**
 * Where a card came from, when it was captured rather than typed: the page or the video, the line as it was shown,
 * and the stretch of the video it ran over. Kept beside the card as it was at that moment; the stretch is read back
 * to mark the video's bar (`VideoCards`), the rest nowhere yet.
 * Only a web address is taken, so nothing kept here can ever be a link that runs a script.
 */
export const CardSource = z.object({
  url: z.string().trim().max(2000).regex(/^https?:\/\//i),
  title: z.string().trim().max(300).default(""),
  text: z.string().trim().max(VALUE_MAX).default(""),
  /** Where in the video the line began and ended, in ms of the video's own time. */
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
  /** Whose the video is, as the page showed it: the channel's name and its address (the owner, 2026-10-17: the source is the video's link and name, and the channel's). */
  channel: z.object({ name: z.string().trim().max(100), url: z.string().trim().max(2000).regex(/^https?:\/\//i) }).optional(),
  client: ClientName,
});
export type CardSource = z.infer<typeof CardSource>;

/** What the browser sends. The deck comes from the URL, the time from the API. */
export const NewCard = z.object({
  id: CardId,
  values: CardValues,
  source: CardSource.optional(),
});

export const Card = NewCard.omit({ source: true }).extend({
  deckId: DeckId,
  /**
   * Derived by the API on every read: what each file named in the card's values is, by the file's id. A field of
   * media takes a clip or a sound, so the value alone (an id) doesn't say which to draw; this does.
   */
  files: z.record(z.string(), MediaKind),
  /** Derived on every read: what's said in each clip the card holds that was recorded with its words, by the file's id (`media.ts` → `MediaCues`). */
  cues: z.record(z.string(), MediaCues),
  /** Stamped by the API, ms since epoch. The server is the authority on time. */
  createdAt: z.number().int().nonnegative(),
  /** Where it stands on its deck's ladder: its last answer's outcome, read live, never stored on the card. */
  place: CardPlace,
  /** How many times it has been answered. */
  seen: z.number().int().nonnegative(),
  /** When it was last answered, ms since epoch; null before the first. */
  lastAt: z.number().int().nonnegative().nullable(),
  /** When it comes back: the last answer plus the wait its place has now; null when new or burned. */
  dueAt: z.number().int().nonnegative().nullable(),
  /** Whether a review now would show it: its wait is up by the API's clock. */
  due: z.boolean(),
});

/**
 * What changing a card can change: any of its values, by field id. A field left out keeps what it has. The rules are
 * the type's (`cardProblems`), weighed over the card as it would then stand.
 */
export const CardUpdate = z.object({ values: CardValues });

export type CardValues = z.infer<typeof CardValues>;
export type NewCard = z.infer<typeof NewCard>;
export type CardUpdate = z.infer<typeof CardUpdate>;
export type Card = z.infer<typeof Card>;

export const CardList = z.object({ cards: z.array(Card) });
export const CardResponse = z.object({ card: Card });

/**
 * A living card of the account's taken from a video: where in it, its clip as its source keeps it, in ms of the
 * video's own time (a clip kept without an end is its start alone), and the card in words (its first Front field that
 * holds text; empty when it has none). The extension marks it on the video's bar, its words over the mark.
 */
export const VideoCard = Stretch.extend({ cardId: CardId, words: z.string() });
export type VideoCard = z.infer<typeof VideoCard>;
/** Every one of a video's, in the video's order. Read live from every card's source, so a card made before this was asked for is there too, and a deleted one is gone. */
export const VideoCards = z.object({ cards: z.array(VideoCard) });
export type VideoCards = z.infer<typeof VideoCards>;
