import { z } from "zod";
import { ClientName } from "./auth";
import { DeckId } from "./deck";
import { MediaKind } from "./media";
import { CardPlace } from "./srs";
import { CardFieldId, VALUE_MAX } from "./type";

/** Minted by the browser, so a retried POST returns the card that already exists instead of a second one. */
export const CardId = z.uuid();

/** A card's text, by field id. Which fields exist and which must be filled is the deck's card type's call (`cardProblems`). */
export const CardValues = z.record(CardFieldId, z.string().trim().max(VALUE_MAX));

/**
 * Where a card came from, when it was captured rather than typed: the page or the video, the line as it was shown,
 * and the stretch of the video it ran over. Kept beside the card as it was at that moment; nothing reads it back yet.
 * Only a web address is taken, so nothing kept here can ever be a link that runs a script.
 */
export const CardSource = z.object({
  url: z.string().trim().max(2000).regex(/^https?:\/\//i),
  title: z.string().trim().max(300).default(""),
  text: z.string().trim().max(VALUE_MAX).default(""),
  /** Where in the video the line began and ended, in ms of the video's own time. */
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional(),
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
