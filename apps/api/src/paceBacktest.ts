/**
 * The backtest of a review's time left (`pnpm pace:backtest`): each past session replayed answer by answer, its time
 * left worked out as the review would have before each answer, from the pace of the `PACE_DAYS` before the session,
 * and set against the time it really took. Pure: the answers come in oldest first, with the account's day reader.
 *
 * Besides the live way, it tries a card's clips as candidates not yet in the live estimate: a side's time as a fixed
 * part plus a share of a length on it (its clips' lengths summed, its longest clip, or where the picked word falls in
 * its clip), fitted per deck from the answers before the session, the front's span against the front's clips and the
 * back's against the back's. Lengths are as said (speed 1): how fast a field plays is a device's own, not kept.
 */
import { CARD_TIME_MAX_MS, NEW_SESSION_PACE, TODAY_EASE, cardLeftMs, countedMs, paceAfter, todaySpeed, type CardLeft, type DeckPace, type SessionPace } from "@panki/contracts";
import { PACE_DAYS, paceFor, pacesOf, type PaceAnswer } from "./pace";

/** What a side of a card shows of its clips, in ms: their lengths summed, the longest, and where the picked word starts in its clip; null where none is known. */
export type SideMedia = { sum: number | null; longest: number | null; word: number | null };
export type MediaMeasure = keyof SideMedia;
/** A file on a side as the backtest knows it: its length and where the picked word starts in it, each when kept. */
export type SideFile = { lengthMs: number | null; wordMs: number | null };

/** A side's clips as each measure reads them; a file with no length kept (a word's sound from a dictionary) counts for nothing. */
export function sideMediaOf(files: readonly SideFile[]): SideMedia {
  const lengths = files.flatMap((f) => (f.lengthMs === null ? [] : [f.lengthMs]));
  const word = files.find((f) => f.wordMs !== null)?.wordMs ?? null;
  return { sum: lengths.length === 0 ? null : lengths.reduce((s, l) => s + l, 0), longest: lengths.length === 0 ? null : Math.max(...lengths), word };
}

/**
 * An answer as the backtest replays it: a pace's, with its session, whether it was answered inside an ask-again and
 * left the card in one, and what each side showed of its clips.
 */
export type ReplayAnswer = PaceAnswer & { sessionId: string | null; fromAgain: boolean; toAgain: boolean; front: SideMedia; back: SideMedia };

/** A way of working out the time left: which of the pace it uses, how fast today's speed comes in, and which of a card's clips stretch it, if any. */
export type Variant = { name: string; pace: (pace: DeckPace) => DeckPace; ease: number; media?: MediaMeasure };

/** How far off a variant was: over the sessions, at their start and before every answer, in ms. */
export type VariantError = { name: string; sessions: number; startMs: number; startShare: number; throughMs: number };

/** A side's fit: how many ms of its span each ms of the measure adds, and the measure's mean over what it was fitted on. */
export type SideFit = { share: number; meanMs: number; points: number };
export type MediaFit = { front: SideFit | null; back: SideFit | null };

/** The fewest showings with a length a side's share is fitted from; with fewer, its clips stretch nothing. */
export const MEDIA_MIN = 10;

/** A line through the points by least squares: its slope, never below 0 (a longer clip never makes a card quicker); null with too few or no spread. */
function fitSide(points: readonly { x: number; y: number }[]): SideFit | null {
  if (points.length < MEDIA_MIN) return null;
  const meanX = points.reduce((s, p) => s + p.x, 0) / points.length;
  const meanY = points.reduce((s, p) => s + p.y, 0) / points.length;
  const spread = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  if (spread === 0) return null;
  const share = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0) / spread;
  return { share: Math.max(0, share), meanMs: meanX, points: points.length };
}

/** The front's span and the back's, as the stats split a showing under the cap. */
const spansOf = (a: PaceAnswer) => {
  const front = Math.min(a.thinkMs ?? 0, CARD_TIME_MAX_MS);
  return { front, back: Math.min(a.decideMs ?? 0, CARD_TIME_MAX_MS - front) };
};

/** Each side's fit over the measured answers whose side shows a length by the measure. */
export function mediaFitOf(answers: readonly ReplayAnswer[], measure: MediaMeasure): MediaFit {
  const measured = answers.filter((a) => a.thinkMs !== null && a.decideMs !== null);
  const pointsOf = (side: "front" | "back") =>
    measured.flatMap((a) => {
      const x = a[side][measure];
      return x === null ? [] : [{ x, y: spansOf(a)[side] }];
    });
  return { front: fitSide(pointsOf("front")), back: fitSide(pointsOf("back")) };
}

/** How much longer than the deck's usual a showing of this card is, in ms (shorter, below 0), by its clips; 0 where nothing is known. */
function stretchOf(answer: ReplayAnswer, fit: MediaFit, measure: MediaMeasure): number {
  const side = (s: "front" | "back") => {
    const x = answer[s][measure];
    const f = fit[s];
    return x === null || f === null ? 0 : f.share * (x - f.meanMs);
  };
  return side("front") + side("back");
}

/** How many showings what's left of a card takes, as the pace has it: a day's time over a showing's. */
function showingsOf(left: CardLeft, pace: DeckPace): number {
  if (left.kind === "again") return left.steps;
  const day = left.kind === "new" ? pace.newMs : pace.reviewMs;
  return day === null || pace.showingMs === null || pace.showingMs === 0 ? 1 : Math.max(1, day / pace.showingMs);
}

/** What's left of a card as the review counts it as it first comes up: an ask-again from before takes one showing, the fewest it can. */
const leftOf = (a: ReplayAnswer): CardLeft => (a.start ? { kind: "new" } : a.fromAgain ? { kind: "again", steps: 1 } : { kind: "review" });

/**
 * A session's time left before each of its answers, under one variant, beside the time really left; none when the
 * pace has nothing. `stretch` is how much longer a card's showing is than the deck's usual (0 for the live way).
 */
function replay(session: readonly ReplayAnswer[], pace: DeckPace, ease: number, stretch: (cardId: string) => number): { predicted: number; actual: number }[] | null {
  const firstOf = new Map<string, CardLeft>();
  for (const a of session) if (!firstOf.has(a.cardId)) firstOf.set(a.cardId, leftOf(a));
  const costOf = (cardId: string, left: CardLeft): number | null => {
    const ms = cardLeftMs(left, pace);
    return ms === null ? null : Math.max(0, ms + showingsOf(left, pace) * stretch(cardId));
  };
  const pending = new Set(firstOf.keys());
  const asked = new Set<string>();
  let state: SessionPace = NEW_SESSION_PACE;
  let actualLeft = session.reduce((sum, a) => sum + countedMs(a.thinkMs, a.decideMs), 0);
  const points: { predicted: number; actual: number }[] = [];
  for (const a of session) {
    let sum = 0;
    for (const id of pending) sum += costOf(id, firstOf.get(id) ?? { kind: "new" }) ?? Number.NaN;
    for (const id of asked) sum += costOf(id, { kind: "again", steps: 1 }) ?? Number.NaN;
    if (Number.isNaN(sum)) return null;
    points.push({ predicted: Math.round(sum * todaySpeed(state.done, ease)), actual: actualLeft });
    const shown = countedMs(a.thinkMs, a.decideMs);
    const now: CardLeft = pending.has(a.cardId) ? (firstOf.get(a.cardId) ?? { kind: "new" }) : { kind: "again", steps: 1 };
    state = paceAfter(state, a.cardId, costOf(a.cardId, now), shown, !a.toAgain);
    pending.delete(a.cardId);
    if (a.toAgain) asked.add(a.cardId);
    else asked.delete(a.cardId);
    actualLeft -= shown;
  }
  return points;
}

/**
 * Each variant's error over the sessions that started from `since` with at least `minAnswers` answers, every one
 * measured: the mean miss at the start (and as a share of the time the sessions took) and the mean miss before every
 * answer. Each session is worked out from the pace of the `PACE_DAYS` before it, as the review then would have; a
 * variant with clips fits them on the deck's answers of those days, else the account's.
 */
export function backtest(answers: readonly ReplayAnswer[], dayOf: (at: number) => string, since: number, variants: readonly Variant[], minAnswers = 3): VariantError[] {
  const sessions = new Map<string, ReplayAnswer[]>();
  for (const a of answers) if (a.sessionId !== null) sessions.set(a.sessionId, [...(sessions.get(a.sessionId) ?? []), a]);
  const picked = [...sessions.values()].filter((s) => (s[0]?.at ?? 0) >= since && s.length >= minAnswers && s.every((a) => a.thinkMs !== null && a.decideMs !== null));
  const errors = variants.map((v) => ({ name: v.name, sessions: 0, start: 0, took: 0, through: 0, points: 0 }));
  for (const session of picked) {
    const startAt = session[0]?.at ?? 0;
    const deckId = session[0]?.deckId ?? "";
    const before = answers.filter((a) => a.at < startAt && a.at >= startAt - PACE_DAYS * 86_400_000);
    const pace = paceFor(pacesOf(before, dayOf), deckId);
    const firstAnswer = new Map<string, ReplayAnswer>();
    for (const a of session) if (!firstAnswer.has(a.cardId)) firstAnswer.set(a.cardId, a);
    variants.forEach((v, i) => {
      let stretch = (_cardId: string) => 0;
      const measure = v.media;
      if (measure) {
        const own = mediaFitOf(before.filter((a) => a.deckId === deckId), measure);
        const all = mediaFitOf(before, measure);
        const fit = { front: own.front ?? all.front, back: own.back ?? all.back };
        stretch = (cardId) => {
          const a = firstAnswer.get(cardId);
          return a ? stretchOf(a, fit, measure) : 0;
        };
      }
      const points = replay(session, v.pace(pace), v.ease, stretch);
      const e = errors[i];
      if (!points || !e || points.length === 0) return;
      const first = points[0] ?? { predicted: 0, actual: 0 };
      e.sessions += 1;
      e.start += Math.abs(first.predicted - first.actual);
      e.took += first.actual;
      e.through += points.reduce((sum, p) => sum + Math.abs(p.predicted - p.actual), 0);
      e.points += points.length;
    });
  }
  return errors.map((e) => ({
    name: e.name,
    sessions: e.sessions,
    startMs: e.sessions === 0 ? 0 : Math.round(e.start / e.sessions),
    startShare: e.took === 0 ? 0 : e.start / e.took,
    throughMs: e.points === 0 ? 0 : Math.round(e.through / e.points),
  }));
}

/** No today's speed at all: what an ease this large weighs is nothing. */
export const NO_TODAY = Number.POSITIVE_INFINITY;

/**
 * The variants the backtest sets side by side: the time left as it was worked out before, each part of the live way
 * alone, the live way, and the live way with a card's clips stretching it by each measure.
 */
export function variantsOf(eases: readonly number[]): Variant[] {
  const plain = (p: DeckPace): DeckPace => ({ ...p, againMs: null });
  const whole = (p: DeckPace): DeckPace => p;
  return [
    { name: "Before (deck means)", pace: plain, ease: NO_TODAY },
    { name: "+ asked-again showing", pace: whole, ease: NO_TODAY },
    ...eases.map((ease) => ({ name: `+ today's speed, ease ${ease}`, pace: plain, ease })),
    ...eases.map((ease) => ({ name: `Both, ease ${ease}`, pace: whole, ease })),
    { name: "Live + clip lengths summed", pace: whole, ease: TODAY_EASE, media: "sum" },
    { name: "Live + longest clip", pace: whole, ease: TODAY_EASE, media: "longest" },
    { name: "Live + word's place in clip", pace: whole, ease: TODAY_EASE, media: "word" },
  ];
}
