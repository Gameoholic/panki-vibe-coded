/** @panki A review's line of cards: today's queue, the line as it moves on, what's left by kind and of each card (`buildQueue`, `startLine`, `advance`, `togoOf`, `leftOf`, `KINDS`). */
import { againPlaceOf, isNew, resolve, type Card, type CardLeft, type Deck, type Outcome, type ReviewSettings, type SrsType } from "@panki/contracts";
import { shuffle } from "./shuffle";

/**
 * A review's line of cards, worked out the one way: which cards a review of a deck takes today and in what order, how
 * the line moves on as they're answered, and what's left of it by kind (the counts over the card). The review runs it;
 * the Layout tab, drawn as the review, counts a deck's review with it.
 */

/** The kinds of card a review counts down: never seen, inside an ask-again (it was forgotten, or is being learned), and a plain review. */
export const KINDS = ["new", "again", "review"] as const;
export type Kind = (typeof KINDS)[number];
export function kindOf(card: Card): Kind {
  if (card.place.node.length > 0) return "again";
  return isNew(card.place) ? "new" : "review";
}
/**
 * The counts left to right in the order their cards come: the new ones before or after the reviews as the account's
 * settings put them (scattered among them, first), and the ones asked again where they go back in: last at the end,
 * between them anywhere.
 */
export function countOrder(settings: ReviewSettings): readonly Kind[] {
  const [front, back]: [Kind, Kind] = settings.newPlace === "last" ? ["review", "new"] : ["new", "review"];
  if (againPlaceOf(settings) === "end") return [front, back, "again"];
  return [front, "again", back];
}

/**
 * Whether a card comes back in this same review after an answer: only an ask-again with no wait (or a retry) keeps
 * it in. Reaching an end of the chart (up, down, go to a stage, burned) is the end of the card for this session, even
 * where the stage it lands on has no wait: it's due again at once, but for the next review, as the home will say. So
 * a card sent "Down one → Lesson · no wait" isn't asked again in this review as if the chart went on; this holds for
 * every SRS type.
 */
export const comesBack = (outcome: Outcome) => outcome.again && outcome.wait === 0;

/** How many answers a card still takes to leave the review, each one the best answer; rules that loop are cut off at `STEPS_MAX`. */
const STEPS_MAX = 9;
function stepsLeft(srsType: SrsType, card: Card, best: string): number {
  let place = card.place;
  for (let steps = 1; steps < STEPS_MAX; steps++) {
    const outcome = resolve(srsType, place, best);
    if (!comesBack(outcome)) return steps;
    place = outcome.place;
  }
  return STEPS_MAX;
}

/**
 * What's left of a review, by kind: a new card and a review each count once; a card being asked again counts the
 * answers it still takes to leave the review if each one is the best answer (its steps left, not just itself).
 */
export function togoOf(ids: readonly string[], byId: ReadonlyMap<string, Card>, srsType: SrsType, best: string): Record<Kind, number> {
  const togo: Record<Kind, number> = { new: 0, again: 0, review: 0 };
  for (const id of ids) {
    const left = byId.get(id);
    if (!left) continue;
    const kind = kindOf(left);
    togo[kind] += kind === "again" ? stepsLeft(srsType, left, best) : 1;
  }
  return togo;
}

/**
 * What's left of each card, as the time left counts it (`timeLeftMs` in the contracts): a new card's day, a review's
 * day (its misses priced in), or a card being asked again's answers still to take, as `togoOf` counts them. A card
 * missed in this review stops being a review and costs its asked-again showings from then on: no double count, since
 * its review day, which priced the miss as a chance, leaves with it.
 */
export function leftOf(ids: readonly string[], byId: ReadonlyMap<string, Card>, srsType: SrsType, best: string): CardLeft[] {
  return ids.flatMap((id): CardLeft[] => {
    const card = byId.get(id);
    if (!card) return [];
    const kind = kindOf(card);
    return [kind === "again" ? { kind, steps: stepsLeft(srsType, card, best) } : { kind }];
  });
}

/** A card never started that a review can start: new, but not inside an ask-again (it has been started, and comes back as due), and not put aside. */
export const isUnseen = (card: Card) => isNew(card.place) && card.place.node.length === 0 && card.hold === null;

/** Each of `items` dropped somewhere at random among `among`, the items keeping their own order. */
function scatter(items: readonly string[], among: readonly string[]): string[] {
  const spots = items.map(() => Math.floor(Math.random() * (among.length + 1))).sort((a, b) => a - b);
  const line = [...among];
  spots.forEach((spot, i) => line.splice(spot + i, 0, items[i] ?? ""));
  return line;
}

/**
 * The session's cards, in order: what's due (soonest first) and what's new, as many as the deck's day allows, the new
 * ones where the account's review settings put them. A card still inside an ask-again (an earlier review was left with
 * it there) is due too, but stands where cards asked again go, as the count at the top has them: at the end, or
 * anywhere, never shuffled in among the reviews at random. Not `capped`,
 * every card given is in it: the ones picked on the Today screen, new cards past today's count among them.
 */
export function buildQueue(cards: readonly Card[], deck: Deck, review: ReviewSettings, capped = true): string[] {
  const { newOrder, newPlace, reviewOrder } = review;
  const overdue = cards.filter((c) => c.due).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  // The order decides which cards make it under the day's limit, as well as when they show.
  const allDue = (reviewOrder === "random" ? shuffle(overdue) : overdue).slice(0, capped ? deck.dueCount : undefined);
  const again = allDue.filter((c) => kindOf(c) === "again").map((c) => c.id);
  const due = allDue.filter((c) => kindOf(c) !== "again").map((c) => c.id);
  const unseen = cards.filter(isUnseen).sort((a, b) => a.createdAt - b.createdAt);
  const fresh = (newOrder === "shuffled" ? shuffle(unseen) : unseen).slice(0, capped ? deck.newCount : undefined).map((c) => c.id);
  // Scattered: each new card lands somewhere at random among the reviews, the new ones keeping their own order.
  const line = newPlace === "first" ? [...fresh, ...due] : newPlace === "last" ? [...due, ...fresh] : scatter(fresh, due);
  if (againPlaceOf(review) === "end") return [...line, ...again];
  return scatter(again, line);
}

/**
 * The line of a review: the cards in play, the first of them on screen, and the ones waiting to join. With no limit
 * on how many are in play, every card is in play from the start.
 */
export type Line = { active: string[]; waiting: string[] };
export function startLine(queue: string[], pool: number | null): Line {
  const size = pool ?? queue.length;
  return { active: queue.slice(0, size), waiting: queue.slice(size) };
}
/**
 * The line after the card on screen is answered. One asked again right away goes back in where the account's settings
 * say (never straight back on screen while another card is in play); one that's done for now leaves, and the next
 * waiting card takes its place at the end.
 */
export function advance(line: Line, cardId: string, comesBack: boolean, againPlace: ReviewSettings["againPlace"]): Line {
  const active = line.active.slice(1);
  if (!comesBack) return { active: [...active, ...line.waiting.slice(0, 1)], waiting: line.waiting.slice(1) };
  const spot = active.length === 0 ? 0 : againPlace === "end" ? active.length : 1 + Math.floor(Math.random() * active.length);
  active.splice(spot, 0, cardId);
  return { active, waiting: line.waiting };
}
/**
 * The next new card for today, when a new one put aside leaves its place (as the deck's own count gives it to the
 * next): the first never started that isn't in the line already, in the order Which new cards first says; none when
 * there's none left.
 */
export function nextFresh(cards: Iterable<Card>, line: Line, leaving: string, newOrder: ReviewSettings["newOrder"]): string | null {
  const taken = new Set([...line.active, ...line.waiting, leaving]);
  const left = [...cards].filter((c) => isUnseen(c) && !taken.has(c.id)).sort((a, b) => a.createdAt - b.createdAt);
  return (newOrder === "shuffled" ? shuffle(left) : left)[0]?.id ?? null;
}
/** A card joining the line: in play at the end when there's room, else the last to wait its turn. */
export function joinLine(line: Line, cardId: string, pool: number | null): Line {
  if (pool === null || line.active.length < pool) return { active: [...line.active, cardId], waiting: line.waiting };
  return { active: line.active, waiting: [...line.waiting, cardId] };
}
