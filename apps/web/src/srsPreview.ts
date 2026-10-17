import { NEW_PLACE, mainAnswers, resolve, stageIndex, type CardPlace, type Settings, type SrsType } from "@panki/contracts";

/**
 * What a type does to a card, worked out ahead of time for the live preview: one card answered with the best
 * answer every time, and what the type costs each day over three months with the Settings.
 */
const JOURNEY_MAX = 18;
const PAST_SHOWN = 3;
const REMEMBER_RATE = 0.88;

export type JourneyStep =
  | { kind: "step"; idx: number; wait: number; again: boolean }
  | { kind: "done"; reviews: number; total: number }
  | { kind: "forever"; wait: number }
  | { kind: "more" };

export function journey(type: SrsType): JourneyStep[] {
  const best = mainAnswers(type.answers).at(-1)?.id ?? "";
  const steps: JourneyStep[] = [];
  let place: CardPlace = NEW_PLACE;
  let total = 0;
  let past = 0;
  for (let i = 0; i < JOURNEY_MAX; i++) {
    const r = resolve(type, place, best);
    place = r.place;
    if (r.burned || r.wait === null) {
      steps.push({ kind: "done", reviews: i + 1, total });
      break;
    }
    total += r.wait;
    const idx = stageIndex(type, place);
    steps.push({ kind: "step", idx, wait: r.wait, again: r.again });
    if (!r.again && idx >= type.stages.length - 1 && type.after === "repeat") {
      steps.push({ kind: "forever", wait: r.wait });
      break;
    }
    if (idx >= type.stages.length) past++;
    if (past >= PAST_SHOWN) {
      steps.push({ kind: "more" });
      break;
    }
  }
  return steps;
}

/** How often the owner sits down to review, for the forecast: so many sittings a day, or `ASAP` for the moment anything is due. */
export const ASAP = 0;
/** A card is asked at most this many times in one sitting (or one day, with no sittings), so rules that loop can't hang the sum. */
const ASKS_MAX = 6;
/**
 * Reviews a day for `days` days, starting from nothing, with the given new cards a day and `sittings` reviews a day
 * (evenly through the day; a card that comes due between two waits for the next one, and its wait counts from when
 * it was answered). Deterministic, so the chart holds still.
 */
export function forecast(type: SrsType, settings: Pick<Settings, "fuzz"> & { newPerDay: number }, days: number, sittings: number): number[] {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const main = mainAnswers(type.answers);
  const first = main[0]?.id ?? "";
  const best = main.at(-1)?.id ?? "";
  const cards: { place: CardPlace; due: number }[] = [];
  const perDay: number[] = [];
  const spread = () => (settings.fuzz ? 0.9 + rnd() * 0.2 : 1);
  for (let day = 0; day < days; day++) {
    for (let k = 0; k < settings.newPerDay; k++) cards.push({ place: NEW_PLACE, due: day });
    let n = 0;
    /** Answers a card once; says whether it's still in play. */
    const ask = (card: { place: CardPlace; due: number }): number | null => {
      const r = resolve(type, card.place, rnd() < REMEMBER_RATE ? best : first);
      card.place = r.place;
      n++;
      return r.burned ? null : r.wait;
    };
    if (sittings === ASAP) {
      for (const card of cards) {
        for (let asks = 0; card.due < day + 1 && asks < ASKS_MAX; asks++) {
          const wait = ask(card);
          card.due = wait === null ? Infinity : card.due + (Math.max(wait, 1) / 1440) * spread();
        }
      }
    } else {
      for (let s = 0; s < sittings; s++) {
        const at = day + (s + 0.5) / sittings;
        for (const card of cards) {
          // A wait of nothing is asked again in the same sitting; anything else is for a later one.
          for (let asks = 0; card.due <= at && asks < ASKS_MAX; asks++) {
            const wait = ask(card);
            if (wait === null) card.due = Infinity;
            else if (wait > 0) card.due = at + (wait / 1440) * spread();
          }
        }
      }
    }
    perDay.push(n);
  }
  return perDay;
}
