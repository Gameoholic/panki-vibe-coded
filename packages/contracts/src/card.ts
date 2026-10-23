import { z } from "zod";
import { ClientName } from "./auth";
import { DeckId } from "./deck";
import { MediaCues, MediaKind } from "./media";
import { CardPlace, HoldKind } from "./srs";
import { Stretch } from "./transcription";
import { CardFieldId, VALUE_MAX, holdsWords, wordsFieldOf, type CardType } from "./type";

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

/** A card put aside (`HoldKind`), while that lasts: buried or suspended, and when a bury ends (null for a suspend, which lasts until it's brought back). */
export const CardHold = z.object({ kind: HoldKind, until: z.number().int().nonnegative().nullable() });
export type CardHold = z.infer<typeof CardHold>;

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
  /** When it comes back: the last answer plus the wait its place has now; null when new or burned. Putting it aside doesn't change it. */
  dueAt: z.number().int().nonnegative().nullable(),
  /** Whether a review now would show it: its wait is up by the API's clock, and it isn't put aside. */
  due: z.boolean(),
  /**
   * Derived on every read: put aside, while that lasts (buried for its step's wait, suspended until it's brought back);
   * null when it's in play. A Panki from before holds sends none, and the extension, loaded by hand, may be talking to one.
   */
  hold: CardHold.nullable().default(null),
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

/** The most words asked about at once: what a card is being added as, and the dictionary's form of it. */
export const CALLED_MAX = 4;
/** The most cards told of in answer, the newest: what's there already is said, not listed. */
export const CALLED_CARDS_MAX = 5;
/**
 * Words a card is about to be added with (what it would be called by, `type.ts` → `wordsFieldOf`): the account's
 * living cards already called by one of them, in any deck, are asked for, so the card being added can say so.
 */
export const CardsCalled = z.object({ word: z.array(z.string().trim().min(1).max(VALUE_MAX)).min(1).max(CALLED_MAX) });
export type CardsCalled = z.infer<typeof CardsCalled>;
/**
 * What a card holds in a field that tells cards apart (`CardField.tellsApart`), by the field's name: so a card of
 * another type is told apart by its own field of the same name. Only what's filled in.
 */
export const ApartValue = z.object({ name: z.string(), value: z.string() });
export type ApartValue = z.infer<typeof ApartValue>;
/** A card's values in its type's fields that tell cards apart, those filled in (never the field it's called by). */
export function apartOf(type: Pick<CardType, "fields">, values: Readonly<Record<string, string>>): ApartValue[] {
  const called = wordsFieldOf(type)?.id;
  return type.fields.flatMap((f) => {
    const value = (values[f.id] ?? "").trim();
    return f.tellsApart && holdsWords(f.kind) && f.id !== called && value !== "" ? [{ name: f.name, value }] : [];
  });
}
/** Words as they're compared: spaces and capitals aside. */
const plain = (words: string) => words.trim().replace(/\s+/g, " ").toLowerCase();
/** Whether two cards called the same are told apart: a field of the same name filled in on both, holding different words. */
export function toldApart(a: readonly ApartValue[], b: readonly ApartValue[]): boolean {
  return a.some((mine) => b.some((theirs) => plain(theirs.name) === plain(mine.name) && plain(theirs.value) !== plain(mine.value)));
}

/**
 * A living card of the account's called by one of the words asked about: its words, exactly as it holds them, its
 * deck, by id and by name as it stands now, and what it holds that tells it apart (`apartOf`; none from an older server).
 */
export const CalledCard = z.object({ cardId: CardId, deckId: DeckId, deck: z.string(), words: z.string(), apart: z.array(ApartValue).default([]) });
export type CalledCard = z.infer<typeof CalledCard>;
/** The newest of them first. */
export const CalledCards = z.object({ cards: z.array(CalledCard).max(CALLED_CARDS_MAX) });
export type CalledCards = z.infer<typeof CalledCards>;
/**
 * A deck's duplicates: for each of its living cards called the same as another living card of the account's (in this
 * deck or any other), those others, the newest first and a few at most. A card called by nothing like another's isn't in it.
 */
export const DeckTwins = z.object({ twins: z.record(CardId, z.array(CalledCard).max(CALLED_CARDS_MAX)) });
export type DeckTwins = z.infer<typeof DeckTwins>;
