/** @panki A finished video's recap as Panki works it out (`VideoRecap`, `RECAP`, `sessionsOf`, `watchedOf`): its cards, its watch sessions, its channel, what's next. */
import { z } from "zod";
import { CardId } from "./card";
import { DeckId } from "./deck";
import { ContinueVideo, Day } from "./history";
import { CardFieldId, VALUE_MAX } from "./type";
import { SavedVideo } from "./watching";

/**
 * The Video recap: what a video was to the account, said as it's finished. Everything in it is worked out on read from
 * what's kept already (the cards' sources, the stretches watched, the finish marks, Continue watching and Saved for
 * later); nothing is stored for it. It covers this viewing: what came after the video's finish before this one (all of
 * it, the first time it's finished).
 */

/** The magnitudes of a recap, one home. */
export const RECAP = {
  /** A pause longer than this between two stretches watched starts another watch session. */
  sessionGapMs: 30 * 60_000,
  /** Two stretches this close in the video are one stretch watched: a stretch picks up a moment after the last ended. */
  joinMs: 1_500,
  /** The most of Continue watching, and of Saved for later, a recap offers. */
  nextMax: 2,
  /** The most cards a recap names; how many were added is said whatever the count. */
  cardsMax: 60,
  /** The most watch sessions a recap draws: the latest. */
  sessionsMax: 12,
} as const;

const Count = z.number().int().nonnegative();

/**
 * A card added from the video in this viewing, deleted since or not (a card added is counted as added): where its clip
 * is in the video, in ms; the card in words (its type's main field, empty when none); and its values that are words, by
 * field id, so the extension can say its reading and meaning from the fields its own mapping fills with them.
 */
export const RecapCard = z.object({
  cardId: CardId,
  deckId: DeckId,
  startMs: Count,
  endMs: Count,
  words: z.string(),
  values: z.record(CardFieldId, z.string().max(VALUE_MAX)),
});
export type RecapCard = z.infer<typeof RecapCard>;

/**
 * One sitting with the video: the stretches watched with no pause longer than `RECAP.sessionGapMs` between them; when
 * it began and ended on the clock (the API's stamps), the account's day it began on, and the part of the video it ran
 * over (from the earliest moment watched to the latest), in ms.
 */
export const WatchSession = z.object({ day: Day, startedAt: Count, endedAt: Count, fromMs: Count, toMs: Count });
export type WatchSession = z.infer<typeof WatchSession>;

/** A part of the video watched, in ms. */
export const WatchedSpan = z.object({ fromMs: Count, toMs: Count });
export type WatchedSpan = z.infer<typeof WatchedSpan>;

export const VideoRecap = z.object({
  /** The account's day as it's asked, so a session's day is said as Today or Yesterday by the account's own days. */
  today: Day,
  /** The video's length as the player last told it; null when it never was. */
  lengthMs: Count.nullable(),
  /** How many cards were added from it in this viewing; `cards` names the first `RECAP.cardsMax` in the video's order. */
  added: Count,
  cards: z.array(RecapCard).max(RECAP.cardsMax),
  /** Its watch sessions in this viewing, oldest first. */
  sessions: z.array(WatchSession).max(RECAP.sessionsMax),
  /** The parts of it watched in this viewing, each once, in the video's order. */
  watched: z.array(WatchedSpan),
  /** Which of its channel's videos it is: how many of the channel's the account has finished, this one among them. Null when its channel isn't known. */
  channel: z.object({ name: z.string(), nth: z.number().int().positive() }).nullable(),
  /** What's next, as the home's shelves have it: the top of Continue watching and of Saved for later, this video left out. */
  continuing: z.array(ContinueVideo).max(RECAP.nextMax),
  saved: z.array(SavedVideo).max(RECAP.nextMax),
});
export type VideoRecap = z.infer<typeof VideoRecap>;
export const VideoRecapResponse = z.object({ recap: VideoRecap });
export type VideoRecapResponse = z.infer<typeof VideoRecapResponse>;

/** A stretch watched as a recap reads it: where in the video, in ms; how long it took; when it reached Panki. */
export type RecapStretch = { fromMs: number; toMs: number; spentMs: number; at: number };

/**
 * The watch sessions of some stretches (oldest first in, oldest first out): a stretch began its time taken before it
 * reached Panki; one beginning more than `gapMs` after the last ended starts another session. `day` reads the account's
 * day of a moment.
 */
export function sessionsOf(stretches: readonly RecapStretch[], day: (at: number) => Day, gapMs: number = RECAP.sessionGapMs): WatchSession[] {
  const sessions: WatchSession[] = [];
  for (const s of [...stretches].sort((a, b) => a.at - b.at)) {
    const began = Math.max(0, s.at - s.spentMs);
    const last = sessions.at(-1);
    if (last && began - last.endedAt <= gapMs) {
      last.endedAt = Math.max(last.endedAt, s.at);
      last.fromMs = Math.min(last.fromMs, s.fromMs);
      last.toMs = Math.max(last.toMs, s.toMs);
    } else {
      sessions.push({ day: day(began), startedAt: began, endedAt: s.at, fromMs: s.fromMs, toMs: s.toMs });
    }
  }
  return sessions;
}

/** The parts of a video some stretches cover, each once, in the video's order: stretches overlapping or `joinMs` apart are one. */
export function watchedOf(stretches: readonly Pick<RecapStretch, "fromMs" | "toMs">[], joinMs: number = RECAP.joinMs): WatchedSpan[] {
  const spans: WatchedSpan[] = [];
  for (const s of [...stretches].sort((a, b) => a.fromMs - b.fromMs)) {
    const last = spans.at(-1);
    if (last && s.fromMs <= last.toMs + joinMs) last.toMs = Math.max(last.toMs, s.toMs);
    else spans.push({ fromMs: s.fromMs, toMs: s.toMs });
  }
  return spans;
}
