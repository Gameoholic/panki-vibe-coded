import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { againPlaceOf, branchAt, exampleFieldsOf, exampleShownOf, flowOf, holdsWords, isBurned, valuesWithExample, isNew, mainAnswers, offered, resolve, stageIndex, wordsFieldOf, type Card, type CardAnswer, type CardType, type Deck, type HoldKind, type Outcome, type ReviewSessionEnd, type SrsType, type Step, type SubtitleStyle } from "@panki/contracts";
import { ApiError, api } from "../api";
import { Button } from "../components/Button";
import { FlowCanvas } from "../components/FlowCanvas";
import { Icon, type IconName } from "../components/Icon";
import { KeyCap, holdFor } from "../components/KeyCap";
import { NumberField } from "../components/NumberField";
import { PlacePill } from "../components/PlacePill";
import { ReviewCard } from "../components/ReviewCard";
import { TodayBar, todayWords } from "../components/TodayBar";
import { useHold } from "../hooks/useHold";
import { ScreenStageContext, useScreenStage } from "../hooks/useScreenStage";
import { keyOf, pressed, sameKey, shortcutOf, useKeyBinds, type Bind } from "../keys";
import { ledger } from "../ledger";
import { shuffle } from "../shuffle";
import { rememberShape } from "../skeletonMemory";
import { LESSON_SCOPE } from "../srsFlow";
import { HOLD_KINDS, NEW_WORDS, againWords, answerClass, backWords, holdAsks, holdBack, isHold, placeName } from "../srsKinds";
import { waveOf } from "../waveform";
import { count, langOf } from "../words";

/** How a review opens from the deck picker: its Start, or its Show cards. */
export type ReviewBegin = "start" | "cards";

type Props = {
  deck: Deck;
  cards: Card[];
  /** The deck's card type: which values show before the flip, and which after. */
  type: CardType;
  /** The deck's SRS type: the answers, and where each sends the card. */
  srsType: SrsType;
  /** How a clip's subtitles look on the card: the account's. */
  subtitleStyle: SubtitleStyle;
  /** Picked on the deck picker: straight into the review, or today's cards shown open. Otherwise as the deck's `todayFirst` says, folded. */
  begin?: ReviewBegin;
  /** The answer with the sitting it happened in and how long the card was on screen before and after the flip. */
  onAnswer: (cardId: string, answer: CardAnswer) => Promise<Card>;
  /** An answer taken back, by the id it was given; the card as it stood before it. */
  onUndo: (cardId: string, givenId: string) => Promise<Card>;
  onGoAdd: () => void;
  onHome: () => void;
};

const DAY_MS = 86_400_000;
/** The longest span the silo takes (the contracts' `Ms`): a tab left open for a day sends that, not a refusal. */
const SPAN_MAX = DAY_MS;
/** A span between two of the browser's own moments, in whole ms. */
const span = (from: number, to: number) => Math.min(SPAN_MAX, Math.max(0, Math.round(to - from)));

/**
 * A sitting with the deck, as the API knows it. Started as the screen opens and ended once, as the screen or the page
 * goes (or extra study starts): as done when the line had run out, so an answer undone at the end stays in it, or as
 * left with a card still on screen. `ok` is null until the start is answered; a start that failed never blocks the
 * review, the answers just go without a sitting.
 */
type Sitting = { id: string; ready: Promise<boolean>; ok: boolean | null; ended: boolean };

/**
 * An answer this sitting gave, newest last, that Undo can take back: the id it was given, its card, and the review as
 * it stood just before it (the line, the tally), which taking it back puts on screen again.
 */
type Given = { givenId: string; cardId: string; line: Line; counts: Record<string, number>; answered: number };
/** How many more new cards the end screen offers when the deck's own daily count is none. */
const EXTRA_START = 10;
/** "Coming up" at the end: the days ahead each row covers. */
const COMING_UP: readonly { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "In 2 days", days: 2 },
  { label: "In 3 days", days: 3 },
  { label: "This week", days: 7 },
];

/** The kinds of card a review counts down: never seen, inside an ask-again (it was forgotten, or is being learned), and a plain review. */
const KINDS = ["new", "again", "review"] as const;
type Kind = (typeof KINDS)[number];
function kindOf(card: Card): Kind {
  if (card.place.node.length > 0) return "again";
  return isNew(card.place) ? "new" : "review";
}
/** Each kind as its count says it: "2 new", "0 again", "9 reviews". */
const KIND_WORDS: Record<Kind, (n: number) => string> = {
  new: () => "new",
  again: () => "again",
  review: (n) => (n === 1 ? "review" : "reviews"),
};
/**
 * The counts left to right in the order their cards come (the owner, 2026-10-21: "it should display from left to
 * right in the order"): the new ones before or after the reviews as the deck puts them (scattered among them, first),
 * and the ones asked again where they go back in: last at the end, between them anywhere.
 */
function countOrder(settings: Deck["settings"]): readonly Kind[] {
  const [front, back]: [Kind, Kind] = settings.newPlace === "last" ? ["review", "new"] : ["new", "review"];
  if (againPlaceOf(settings) === "end") return [front, back, "again"];
  return [front, "again", back];
}

/**
 * Whether a card comes back in this same review after an answer: only an ask-again with no wait (or a retry) keeps
 * it in. Reaching an end of the chart (up, down, go to a stage, burned) is the end of the card for this sitting, even
 * where the stage it lands on has no wait: it's due again at once, but for the next review, as the home will say
 * (the owner, 2026-10-17, after Forgot → Ok sent a card "Down one → Lesson · no wait" and the review asked it again as
 * if the chart went on: "the moment we hit one of those end nodes, that's it for the card this session… for ALL SRS
 * logic").
 */
const comesBack = (outcome: Outcome) => outcome.again && outcome.wait === 0;

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

/** A card never started that a review can start: new, but not inside an ask-again (it has been started, and comes back as due), and not put aside. */
const isUnseen = (card: Card) => isNew(card.place) && card.place.node.length === 0 && card.hold === null;

/** Each of `items` dropped somewhere at random among `among`, the items keeping their own order. */
function scatter(items: readonly string[], among: readonly string[]): string[] {
  const spots = items.map(() => Math.floor(Math.random() * (among.length + 1))).sort((a, b) => a - b);
  const line = [...among];
  spots.forEach((spot, i) => line.splice(spot + i, 0, items[i] ?? ""));
  return line;
}

/**
 * The session's cards, in order: what's due (soonest first) and what's new, as many as today allows, the new ones
 * where the deck's settings put them. A card still inside an ask-again (an earlier review was left with it there) is
 * due too, but stands where the deck puts cards asked again, as the count at the top has them: at the end, or
 * anywhere (the owner, 2026-10-21: it opened on one of those at random, shuffled in among the reviews). Not `capped`,
 * every card given is in it: the ones picked on the Today screen, new cards past today's count among them.
 */
function buildQueue(cards: Card[], deck: Deck, capped = true): string[] {
  const { newOrder, newPlace, reviewOrder } = deck.settings;
  const overdue = cards.filter((c) => c.due).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  // The order decides which cards make it under the day's limit, as well as when they show.
  const allDue = (reviewOrder === "random" ? shuffle(overdue) : overdue).slice(0, capped ? deck.dueCount : undefined);
  const again = allDue.filter((c) => kindOf(c) === "again").map((c) => c.id);
  const due = allDue.filter((c) => kindOf(c) !== "again").map((c) => c.id);
  const unseen = cards.filter(isUnseen).sort((a, b) => a.createdAt - b.createdAt);
  const fresh = (newOrder === "shuffled" ? shuffle(unseen) : unseen).slice(0, capped ? deck.newCount : undefined).map((c) => c.id);
  // Scattered: each new card lands somewhere at random among the reviews, the new ones keeping their own order.
  const line = newPlace === "first" ? [...fresh, ...due] : newPlace === "last" ? [...due, ...fresh] : scatter(fresh, due);
  if (againPlaceOf(deck.settings) === "end") return [...line, ...again];
  return scatter(again, line);
}

/**
 * The line of a review: the cards in play, the first of them on screen, and the ones waiting to join. With no limit
 * on how many are in play, every card is in play from the start.
 */
type Line = { active: string[]; waiting: string[] };
function startLine(queue: string[], pool: number | null): Line {
  const size = pool ?? queue.length;
  return { active: queue.slice(0, size), waiting: queue.slice(size) };
}
/**
 * The line after the card on screen is answered. One asked again right away goes back in where the deck's settings
 * say (never straight back on screen while another card is in play); one that's done for now leaves, and the next
 * waiting card takes its place at the end.
 */
function advance(line: Line, cardId: string, comesBack: boolean, againPlace: Deck["settings"]["againPlace"]): Line {
  const active = line.active.slice(1);
  if (!comesBack) return { active: [...active, ...line.waiting.slice(0, 1)], waiting: line.waiting.slice(1) };
  const spot = active.length === 0 ? 0 : againPlace === "end" ? active.length : 1 + Math.floor(Math.random() * active.length);
  active.splice(spot, 0, cardId);
  return { active, waiting: line.waiting };
}
/**
 * The next new card for today, when a new one put aside leaves its place (as the deck's own count gives it to the
 * next): the first never started that isn't in the line already, in the deck's order; none when there's none left.
 */
function nextFresh(cards: Iterable<Card>, line: Line, leaving: string, deck: Deck): string | null {
  const taken = new Set([...line.active, ...line.waiting, leaving]);
  const left = [...cards].filter((c) => isUnseen(c) && !taken.has(c.id)).sort((a, b) => a.createdAt - b.createdAt);
  return (deck.settings.newOrder === "shuffled" ? shuffle(left) : left)[0]?.id ?? null;
}
/** A card joining the line: in play at the end when there's room, else the last to wait its turn. */
function joinLine(line: Line, cardId: string, pool: number | null): Line {
  if (pool === null || line.active.length < pool) return { active: [...line.active, cardId], waiting: line.waiting };
  return { active: line.active, waiting: [...line.waiting, cardId] };
}

/**
 * Where an answer sends the card, under its name: which way it goes (the owner, 2026-10-17, "so it's more clear
 * whether we're upgrading or downgrading"), by how many stages, and the words, "Apprentice 3 · 1 d", "again
 * tomorrow", "Burned", or when a card put aside comes back, "back in 24 hours".
 */
type Lead = { dir: "up" | "down" | "same" | "again" | "burn" | HoldKind; steps: number; words: string };
/** The rule an answer follows for a card where it stands. */
function stepFor(srsType: SrsType, card: Card, answerId: string): Step | undefined {
  return branchAt(flowOf(srsType, stageIndex(srsType, card.place)), card.place.node)[answerId];
}
function answerLead(srsType: SrsType, card: Card, answerId: string): Lead {
  const step = stepFor(srsType, card, answerId);
  if (isHold(step)) return { dir: step.kind, steps: 0, words: holdBack(step) };
  const r = resolve(srsType, card.place, answerId);
  const by = stageIndex(srsType, r.place) - stageIndex(srsType, card.place);
  // New again there's no wait to say: it waits for a day's new cards.
  if (!r.burned && isNew(r.place) && !r.again) return { dir: by < 0 ? "down" : "same", steps: Math.abs(by), words: NEW_WORDS.name };
  if (r.burned || r.wait === null) return { dir: "burn", steps: 0, words: srsType.burnedName };
  if (r.again) return { dir: "again", steps: 0, words: `again ${againWords(r.wait)}` };
  return { dir: by > 0 ? "up" : by < 0 ? "down" : "same", steps: Math.abs(by), words: `${placeName(srsType, r.place)} · ${backWords(r.wait)}` };
}

/** The question before an answer that asks first: where it sends the card, or what putting it aside does. */
function askWords(srsType: SrsType, card: Card, answerId: string): string {
  const step = stepFor(srsType, card, answerId);
  return isHold(step) ? holdAsks(step) : `This card goes to ${answerLead(srsType, card, answerId).words}.`;
}

/** The mark for each way a card can go: a chevron a stage up or down, one arrow going round when it's asked again, a check when it's burned, a dash when it stays, and a card put aside its own. */
const LEAD_ICON: Record<Lead["dir"], IconName> = { up: "up", down: "down", again: "again", burn: "check", same: "minus", bury: HOLD_KINDS.bury.icon, suspend: HOLD_KINDS.suspend.icon };
/** Chevrons drawn one a stage up to this many; past it, the count is written after them. */
const CHEVRONS_MAX = 2;

/**
 * The lead under an answer's name: its mark, then the words, all in the line's own colour, so it reads the same on a
 * plain answer and on the filled one (option A of https://claude.ai/artifact/ULVNozxP7qzrEvzi1cxWPE, the owner's
 * pick, 2026-10-18; a coloured pill with "+1" in it came first and looked out of place, a green box on the blue Ok).
 */
function Lead({ lead }: { lead: Lead }) {
  const moves = lead.dir === "up" || lead.dir === "down";
  const drawn = moves ? Math.min(CHEVRONS_MAX, lead.steps) : 1;
  return (
    <span className="to">
      <span className="to-mark" aria-hidden="true">
        {Array.from({ length: drawn }, (_, i) => (
          <Icon key={i} name={LEAD_ICON[lead.dir]} />
        ))}
        {moves && lead.steps > CHEVRONS_MAX ? <span className="to-count">{lead.steps}</span> : null}
      </span>
      {lead.words}
    </span>
  );
}

/** The words a card goes by on the Today screen: its type's main field, else its first Front field of words (as a deck's list leads with it), else any words it holds. */
function wordsOf(type: CardType, card: Card): string {
  const lead = wordsFieldOf(type) ?? type.fields.find((f) => f.side === "front" && holdsWords(f.kind));
  const own = lead ? (card.values[lead.id] ?? "").trim() : "";
  return own || type.fields.map((f) => (holdsWords(f.kind) ? (card.values[f.id] ?? "").trim() : "")).find((v) => v.length > 0) || "…";
}

/** Today's cards as the Today screen holds them: which are picked, and whether every new card in the deck is offered. */
type Today = { picked: ReadonlySet<string>; more: boolean };

/**
 * Today's cards before the first one (the owner's pick, B of https://claude.ai/artifact/1sSZsVseDpRJpDQE1F2u62,
 * 2026-10-26; a deck's `todayFirst`): the reviews and the new cards as tiles, every one picked to begin with. A press
 * leaves one out for the next review; a stage's chip, All and None do many at once; new cards past today's count are a
 * press away. Start runs the review on what's picked, with a key of its own (`keys.ts` → `start`). Extra study at the
 * end is this too (the owner, 2026-10-28: "it should look similar… just have the selector for how many"): its new
 * cards past today's, under its name, with how many in the bar after Show cards.
 */
function TodayCards({ id = "today", label, tools, type, srsType, reviews, fresh, others, today, startKey, opened, onPick, onMore, onStart }: {
  /** What its ids and its Start's hold go by: `today` before a review, `extra` for extra study. */
  id?: string;
  /** Its name, at the head of the bar: "Extra study"; none before a review. */
  label?: string;
  /** What stands in the bar after Show cards: extra study's how many. */
  tools?: ReactNode;
  type: CardType;
  srsType: SrsType;
  /** Today's due cards, in the line's order. */
  reviews: readonly Card[];
  /** Today's new cards, in the line's order. */
  fresh: readonly Card[];
  /** The deck's other new cards, oldest first. */
  others: readonly Card[];
  today: Today;
  startKey: Bind;
  /** Whether the cards are shown to begin with (Show cards on the deck picker); folded to the counts otherwise. */
  opened: boolean;
  onPick: (ids: readonly string[], on: boolean) => void;
  onMore: (more: boolean) => void;
  onStart: () => void;
}) {
  const [open, setOpen] = useState(opened);
  const offered = today.more ? [...fresh, ...others] : fresh;
  const picked = (list: readonly Card[]) => list.filter((c) => today.picked.has(c.id));
  const total = picked(reviews).length + picked(offered).length;
  const leftReviews = reviews.length - picked(reviews).length;
  const leftNew = fresh.length - picked(fresh).length;
  const left = [leftReviews > 0 ? count(leftReviews, "review", "reviews") : "", leftNew > 0 ? `${leftNew} new` : ""].filter(Boolean).join(" and ");
  // A chip for each stage today's reviews stand on, in the ladder's order: pressed while every one of them is picked.
  const stages = [...new Set(reviews.map((c) => stageIndex(srsType, c.place)))].sort((a, b) => a - b);
  const onStage = (idx: number) => reviews.filter((c) => stageIndex(srsType, c.place) === idx);
  const tile = (card: Card) => {
    const words = wordsOf(type, card);
    const on = today.picked.has(card.id);
    return (
      <Button key={card.id} variant="chip" className="today-card" aria-pressed={on} onClick={() => onPick([card.id], !on)}>
        <span className="today-word" lang={langOf(words)}>
          {words}
        </span>
        <PlacePill type={srsType} place={card.place} />
      </Button>
    );
  };
  const allNone = (list: readonly Card[], prefix: string) => (
    <>
      <Button id={`${prefix}-all`} variant="chip" onClick={() => onPick(list.map((c) => c.id), true)}>
        All
      </Button>
      <Button id={`${prefix}-none`} variant="chip" onClick={() => onPick(list.map((c) => c.id), false)}>
        None
      </Button>
    </>
  );
  return (
    <section className="review-today">
      {/* Folded to the counts to begin with; Show cards unfolds the tiles under it. */}
      <TodayBar id={id} name={label} counts={todayWords(picked(reviews).length, picked(offered).length) ?? "None picked"} shown={open} onShow={() => setOpen(!open)} tools={tools} left={left ? `${left} for later` : null}>
        <Button id={`${id}-start`} variant="primary" size="lg" data-hold={`${id}-start`} disabled={total === 0} onClick={onStart}>
          Start {count(total, "card", "cards")}
          <KeyCap bind={startKey} />
        </Button>
      </TodayBar>
      {open ? (
        <div className="review-today">
          {reviews.length > 0 ? (
            <section className="panel today-panel" aria-labelledby={`${id}-reviews-title`}>
              <div className="today-head">
                <h2 id={`${id}-reviews-title`} className="panel-title">
                  Reviews
                </h2>
                <span className="today-of">
                  {picked(reviews).length} of {reviews.length}
                </span>
                <span className="chips">
                  {stages.map((idx) => {
                    const here = onStage(idx);
                    const on = here.every((c) => today.picked.has(c.id));
                    return (
                      <Button key={idx} variant="chip" aria-pressed={on} onClick={() => onPick(here.map((c) => c.id), !on)}>
                        {srsType.stages[idx]?.name ?? NEW_WORDS.name} · {here.length}
                      </Button>
                    );
                  })}
                  {allNone(reviews, `${id}-reviews`)}
                </span>
              </div>
              <div className="today-cards">{reviews.map(tile)}</div>
            </section>
          ) : null}
          {fresh.length > 0 || others.length > 0 ? (
            <section className="panel today-panel" aria-labelledby={`${id}-new-title`}>
              <div className="today-head">
                <h2 id={`${id}-new-title`} className="panel-title">
                  {NEW_WORDS.name}
                </h2>
                <span className="today-of">
                  {picked(offered).length} of {offered.length}
                </span>
                <span className="chips">
                  {others.length > 0 ? (
                    <Button id={`${id}-more`} variant="chip" aria-pressed={today.more} onClick={() => onMore(!today.more)}>
                      Show every new card
                    </Button>
                  ) : null}
                  {offered.length > 0 ? allNone(offered, `${id}-new`) : null}
                </span>
              </div>
              {offered.length > 0 ? <div className="today-cards">{offered.map(tile)}</div> : <p className="empty">No new cards today.</p>}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The card on its chart (the owner, 2026-10-17: "show the flowchart for this stage, and highlight what node we're on,
 * and what node clicking this button will transfer it to"): which rules the card follows (its stage's own, or the
 * default ones worked out for its stage), the box it's at (the root, or the ask-again it's inside, by its path), and
 * the box the answer under the mouse leads to (the same path one longer; "Keep asking" turns back into the box it
 * left, as its loop on the chart), none while no answer is under it. Shown under the answers while the Chart button
 * is on (a glance that popped up on hover lasted an evening: it was small, couldn't be moved, and came up uninvited
 * while the owner was only deciding, 2026-10-18).
 */
function chartOf(srsType: SrsType, card: Card, answerId: string | null): { scope: string; now: string; next: string | null; stage: number } {
  const idx = stageIndex(srsType, card.place);
  const stage = srsType.stages[idx];
  const scope = idx < 0 ? LESSON_SCOPE : stage && srsType.overrides[stage.id] ? stage.id : "all";
  const now = card.place.node.length > 0 ? card.place.node.join(",") : "root";
  const step = answerId === null ? undefined : stepFor(srsType, card, answerId);
  const next = answerId === null || step?.kind === "hidden" ? null : [...card.place.node, answerId].join(",");
  return { scope, now, next, stage: idx };
}
/** Whether the chart is open under the answers: this device's, kept across reviews. */
const CHART_KEY = "panki.review.chart";
function readChartOpen(): boolean {
  try {
    return localStorage.getItem(CHART_KEY) === "1";
  } catch {
    return false;
  }
}
function writeChartOpen(open: boolean) {
  try {
    localStorage.setItem(CHART_KEY, open ? "1" : "0");
  } catch {
    // Nothing kept: it opens closed next time, which is only a press away.
  }
}

/** Carried by the card's clip that takes the screen's room while the review fills the screen (`app.css` → `.review.is-stage`). */
const STAGED = "data-staged";

/** A review of one deck: the cards due and the new ones for today, one at a time; reveal, then answer, and the answer says where the card goes. */
export function ReviewView({ deck, cards, type, srsType, subtitleStyle, begin, onAnswer, onUndo, onGoAdd, onHome }: Props) {
  const [byId, setById] = useState(() => new Map(cards.map((c) => [c.id, c])));
  const [line, setLine] = useState(() => startLine(buildQueue(cards, deck), deck.settings.pool));
  /**
   * Today's cards first, while they're on screen (the deck's `todayFirst`, when there's anything to review); null once
   * it's under way. Opened from the deck picker, its Start goes straight in and its Show cards opens on them.
   */
  const [today, setToday] = useState<Today | null>(() => {
    const queue = [...line.active, ...line.waiting];
    const first = begin === "cards" || (begin !== "start" && deck.settings.todayFirst);
    return first && queue.length > 0 ? { picked: new Set(queue), more: false } : null;
  });
  /** The line was picked by hand on the Today screen: a new card put aside then hands its place to no other. */
  const pickedByHand = useRef(false);
  /** How many answers this review has taken, a card asked again counting each time. */
  const [answered, setAnswered] = useState(0);
  /** Each time a card is put on screen, by an answer or by Undo: a showing of its own, timed afresh, even the same card's. */
  const [turn, setTurn] = useState(0);
  /** What Undo can take back, newest last (the owner, 2026-10-26): every answer of this sitting, until it's left. */
  const [given, setGiven] = useState<Given[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  /** The answer a mouse is on, whose box on the chart lights up; null with none under it. */
  const [hover, setHover] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState(readChartOpen);
  const chartPlace = useRef<HTMLDivElement | null>(null);
  /** The chart opens under the review, which keeps its place; pressed open, the page goes down to it. */
  function toggleChart() {
    const opening = !chartOpen;
    writeChartOpen(opening);
    setChartOpen(opening);
    if (opening) requestAnimationFrame(() => chartPlace.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }
  const rest = (id: string) => setHover(id);
  const leave = () => setHover(null);
  /** This device's keys (`keys.ts`, Settings → Keybinds), and a key being held on a button until it does its thing. */
  const binds = useKeyBinds();
  const hold = useHold();
  const place = useRef<HTMLElement | null>(null);
  /** How many more new cards extra study offers once the day's are done, as last set on the end screen; the deck's daily count to begin with. */
  const firstExtra = deck.settings.newPerDay > 0 ? deck.settings.newPerDay : EXTRA_START;
  const [extra, setExtra] = useState(firstExtra);
  // The deck's new cards never started, in the order extra study takes them: oldest first, or shuffled once for a deck
  // that shuffles its new cards, so the tiles at the end hold still while they're looked over.
  const unseenIds = [...byId.values()].filter(isUnseen).sort((a, b) => a.createdAt - b.createdAt).map((c) => c.id);
  const unseenKey = unseenIds.join(" ");
  const extraOrder = useMemo(
    () => (deck.settings.newOrder === "shuffled" ? shuffle(unseenIds) : unseenIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the same cards keep the same order, however often they're read
    [unseenKey, deck.settings.newOrder],
  );
  /** Extra study's pick at the end, as today's cards hold theirs; null while it's the first of them, as many as the number says. */
  const [extraPick, setExtraPick] = useState<Today | null>(null);
  const extraOffered = extraOrder.slice(0, Math.min(extra, extraOrder.length));
  const extraToday: Today = extraPick ?? { picked: new Set(extraOffered), more: false };
  /** What's picked, in the order extra study takes them: what its number says and what it starts on. */
  const extraPicked = extraOrder.filter((id) => extraToday.picked.has(id));
  function pickExtra(ids: readonly string[], on: boolean) {
    const picked = new Set(extraToday.picked);
    for (const id of ids) on ? picked.add(id) : picked.delete(id);
    setExtraPick({ ...extraToday, picked });
  }
  function offerAllExtra(more: boolean) {
    // The cards past the number go back out of the pick when they're no longer offered.
    setExtraPick({ more, picked: more ? extraToday.picked : new Set([...extraToday.picked].filter((id) => extraOffered.includes(id))) });
  }
  /**
   * The number is how many are picked (the owner, 2026-10-28: None sets it to 0, All to every one shown); typed, the
   * pick is the first that many again, as many offered when not every one is shown. 0 leaves the cards offered as
   * they were, none of them picked.
   */
  function setExtraCount(n: number) {
    if (n > 0) setExtra(n);
    setExtraPick(n > 0 && !extraToday.more ? null : { more: extraToday.more, picked: new Set(extraOrder.slice(0, n)) });
  }
  /**
   * Extra study begins on what's picked, in the order it takes them: a sitting of its own, so Undo goes back no further
   * than its start, and the day's ends as done. The pick is kept in the ledger as today's is, marked as extra study's.
   */
  function startExtra() {
    const picked = extraPicked;
    if (picked.length === 0) return;
    const left = extraOffered.filter((id) => !extraToday.picked.has(id));
    const added = picked.filter((id) => !extraOffered.includes(id));
    endSitting({ how: "done" });
    startSitting("extra");
    ledger.record("pick", { data: { deckId: deck.id, sessionId: sitting.current?.id, extra: true, today: extraOffered, left, added } });
    pickedByHand.current = left.length > 0 || added.length > 0;
    setGiven([]);
    setFailure(null);
    setExtraPick(null);
    setLine(startLine(picked, deck.settings.pool));
  }
  const cardId = today ? undefined : line.active[0];
  const card = cardId ? byId.get(cardId) : undefined;
  // How many extra study offers as the end comes up, remembered for the end's skeleton next time (`skeletonMemory.ts`);
  // none without new cards to start.
  const atEnd = today === null && card === undefined;
  const extraFirst = Math.min(firstExtra, extraOrder.length);
  useEffect(() => {
    if (atEnd) rememberShape(`extra:${deck.id}`, extraFirst);
  }, [atEnd, extraFirst, deck.id]);
  /** The screen filled by the whole review, kept as the cards change and from one review to the next (`useScreenStage`). */
  const stage = useScreenStage(place, card !== undefined);
  /** Whether the card on screen has a clip to take the screen's room while it's filled: the first not under a spoiler, marked for the stage's styles. */
  const [staged, setStaged] = useState(false);
  useLayoutEffect(() => {
    const clips = [...(place.current?.querySelectorAll<HTMLElement>(".review-card .media-player.media-video") ?? [])];
    const first = clips.find((clip) => clip.closest(".btn-spoiler") === null) ?? null;
    for (const clip of clips) clip.toggleAttribute(STAGED, clip === first);
    if ((first !== null) !== staged) setStaged(first !== null);
  });
  // Which of its examples the card on screen shows, as the deck says: picked once each time it comes up (its count of
  // answers changes with each), so a random one holds still while it's on screen.
  const exampleId = useMemo(
    () => (card ? exampleShownOf(type, card, deck.settings.exampleShown, Math.random) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the card's id and count of answers are what make it another showing
    [card?.id, card?.seen, card?.examples.length, type, deck.settings.exampleShown],
  );
  /**
   * The card's examples in the order its arrows turn through them (its own first, then each added, as Rotate goes), and
   * the one looked at by hand (the owner, 2026-10-26, A of https://claude.ai/artifact/NvKf27gK3s88efz7WeRjV2): none
   * until an arrow is pressed, and none again on each showing. The answer counts for the one the review picked
   * (`exampleId`); looking at another plays nothing by itself.
   */
  const exampleIds = card && exampleFieldsOf(type).length > 0 && card.examples.length > 0 ? [null, ...card.examples.map((e) => e.id)] : [];
  const [browsed, setBrowsed] = useState<{ id: string | null } | null>(null);
  useEffect(() => setBrowsed(null), [cardId, turn]);
  const onScreen = browsed ? browsed.id : exampleId;
  function stepExample(by: 1 | -1) {
    if (exampleIds.length < 2 || !card) return;
    const at = Math.max(0, exampleIds.indexOf(onScreen));
    const next = exampleIds[(at + by + exampleIds.length) % exampleIds.length] ?? null;
    setBrowsed({ id: next });
    ledger.record("example", { data: { deckId: deck.id, cardId: card.id, sessionId: sitting.current?.id, exampleId: next, shown: exampleId } });
  }
  // A new card on screen, or the answers going away, takes the glance down with them, and any key being held.
  useEffect(() => {
    leave();
    hold.release();
  }, [cardId, revealed]); // eslint-disable-line react-hooks/exhaustive-deps -- `leave` and `hold.release` read nothing that changes

  const sitting = useRef<Sitting | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The card on screen and when it came on and was flipped, on the browser's clock; every appearance is timed afresh,
   * and has the id its answer will be given (so the same answer sent again is kept once).
   */
  const shown = useRef<{ cardId: string | null; at: number; revealedAt: number | null; givenId: string }>({ cardId: null, at: 0, revealedAt: null, givenId: "" });
  function startSitting(kind: "review" | "extra") {
    const s: Sitting = { id: crypto.randomUUID(), ready: Promise.resolve(false), ok: null, ended: false };
    s.ready = api.startSession(deck.id, { id: s.id, kind }).then(
      () => (s.ok = true),
      () => (s.ok = false),
    );
    sitting.current = s;
  }
  function endSitting(end: ReviewSessionEnd, keepalive = false) {
    const s = sitting.current;
    if (!s || s.ended) return;
    s.ended = true;
    void s.ready.then((ok) => (ok ? api.endSession(deck.id, s.id, end, keepalive).catch(() => undefined) : undefined));
  }
  /**
   * The sitting in the ref (the day's, or extra study's) ends as the screen goes or the page is closed: left with a card
   * on screen, done at the end. Not as the line runs out, which an Undo at the end screen takes back.
   */
  function endHere() {
    const s = shown.current;
    if (s.cardId) endSitting({ how: "left", cardId: s.cardId, shownMs: span(s.at, performance.now()), revealed: s.revealedAt !== null }, true);
    else endSitting({ how: "done" }, true);
  }
  useEffect(() => {
    // A remount straight after an unmount (StrictMode in development) is no leaving: the deferred end is called off.
    if (leaveTimer.current !== null) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    // Opening on today's cards, the sitting starts with Start: leaving from there is no review.
    if (!sitting.current && today === null) startSitting("review");
    window.addEventListener("pagehide", endHere);
    return () => {
      window.removeEventListener("pagehide", endHere);
      leaveTimer.current = setTimeout(endHere, 0);
    };
    // Once per screen: the deck never changes under it (App keys this view by the deck's id).
  }, []);
  // A card comes on screen: its clock starts. A card back for another go, even the same one, starts afresh.
  useEffect(() => {
    shown.current = { cardId: cardId ?? null, at: performance.now(), revealedAt: null, givenId: crypto.randomUUID() };
  }, [cardId, turn]);

  function reveal() {
    if (revealed) return;
    shown.current.revealedAt ??= performance.now();
    setRevealed(true);
  }

  // Today's cards, as the Today screen shows them: the day's line split into reviews and new, and every other new card.
  const queue = [...line.active, ...line.waiting];
  const cardsOf = (ids: readonly string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  const queued = cardsOf(queue);
  const todayReviews = queued.filter((c) => !isUnseen(c));
  const todayNew = queued.filter(isUnseen);
  const otherNew = today ? [...byId.values()].filter((c) => isUnseen(c) && !queue.includes(c.id)).sort((a, b) => a.createdAt - b.createdAt) : [];
  function pick(ids: readonly string[], on: boolean) {
    setToday((t) => {
      if (!t) return t;
      const picked = new Set(t.picked);
      for (const id of ids) on ? picked.add(id) : picked.delete(id);
      return { ...t, picked };
    });
  }
  function offerMore(more: boolean) {
    // The new cards past today's count go back out of the pick when they're no longer offered.
    setToday((t) => (t ? { more, picked: more ? t.picked : new Set([...t.picked].filter((id) => queue.includes(id))) } : t));
  }
  /**
   * The review begins on what's picked: today's line as it was when every card is, else a line of the picked cards
   * alone, in the deck's order, new cards past today's count among them. The sitting starts here, and the pick is kept
   * in the ledger with it: what today offered, what was left for later, what was added.
   */
  function start() {
    if (!today || today.picked.size === 0) return;
    const left = queue.filter((id) => !today.picked.has(id));
    const added = [...today.picked].filter((id) => !queue.includes(id));
    startSitting("review");
    ledger.record("pick", { data: { deckId: deck.id, sessionId: sitting.current?.id, today: queue, left, added } });
    if (left.length > 0 || added.length > 0) {
      pickedByHand.current = true;
      setLine(startLine(buildQueue(cardsOf([...today.picked]), deck, false), deck.settings.pool));
    }
    setToday(null);
  }
  /**
   * What's left of the review, by kind: a new card and a review each count once; a card being asked again counts the
   * answers it still takes to leave the review if each one is the best answer (its steps left, not just itself).
   */
  const best = mainAnswers(srsType.answers).at(-1)?.id ?? "";
  const togo: Record<Kind, number> = { new: 0, again: 0, review: 0 };
  for (const id of [...line.active, ...line.waiting]) {
    const left = byId.get(id);
    if (!left) continue;
    const kind = kindOf(left);
    togo[kind] += kind === "again" ? stepsLeft(srsType, left, best) : 1;
  }
  // The main answers first, then the ones set apart: that's the order of the number keys too.
  const answers = [...srsType.answers.filter((a) => !a.aside), ...srsType.answers.filter((a) => a.aside)];
  /** The answer waiting for a yes, when it's one that asks first. */
  const asked = answers.find((a) => a.id === asking);

  /** An answer pressed: one that asks first waits for the yes, the rest go straight through. */
  function press(answerId: string) {
    if (!card || busy || !revealed) return;
    const picked = answers.find((a) => a.id === answerId);
    if (picked?.confirm && asking !== answerId) setAsking(answerId);
    else void answer(answerId);
  }
  async function answer(answerId: string) {
    if (!card || busy || !revealed) return;
    setBusy(true);
    setFailure(null);
    setAsking(null);
    const outcome = resolve(srsType, card.place, answerId);
    const now = performance.now();
    const t = shown.current;
    const revealedAt = t.revealedAt ?? now;
    const s = sitting.current;
    const before: Given = { givenId: t.givenId, cardId: card.id, line, counts, answered };
    try {
      const saved = await onAnswer(card.id, {
        givenId: t.givenId,
        answerId,
        // A sitting that failed to start is left out; one still starting is named, the API has it by the time this lands.
        sessionId: s && s.ok !== false ? s.id : undefined,
        thinkMs: span(t.at, revealedAt),
        decideMs: span(revealedAt, now),
        exampleId: exampleId ?? undefined,
      });
      setById((m) => new Map(m).set(saved.id, saved));
      setCounts((c) => ({ ...c, [answerId]: (c[answerId] ?? 0) + 1 }));
      // Only a card asked again right away comes back in this review; one that reached an end of the chart is for a
      // later one, whatever its wait, and so is one put aside. A new card put aside leaves its place to the next.
      // Not in a line picked by hand: the cards left out were left out on purpose.
      const handsOn = !pickedByHand.current && outcome.hold !== null && kindOf(card) === "new";
      setLine((l) => {
        const next = advance(l, card.id, comesBack(outcome), againPlaceOf(deck.settings));
        const joining = handsOn ? nextFresh(byId.values(), next, card.id, deck) : null;
        return joining ? joinLine(next, joining, deck.settings.pool) : next;
      });
      setAnswered((n) => n + 1);
      setTurn((n) => n + 1);
      setGiven((g) => [...g, before]);
      setRevealed(false);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  /**
   * Takes the last answer back: Panki keeps it, marked undone, and the card stands where it stood before it. The review
   * is put back as it was just before it, the card on screen again on its front, a showing of its own. One Panki
   * can't take back (the card answered elsewhere since, or gone) leaves nothing before it to take back either.
   */
  async function undo() {
    const last = given.at(-1);
    if (!last || busy) return;
    setBusy(true);
    setFailure(null);
    setAsking(null);
    try {
      const restored = await onUndo(last.cardId, last.givenId);
      setById((m) => new Map(m).set(restored.id, restored));
      setLine(last.line);
      setCounts(last.counts);
      setAnswered(last.answered);
      setTurn((n) => n + 1);
      setGiven((g) => g.slice(0, -1));
      setRevealed(false);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) setGiven([]);
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey) return;
      // What's held with it is part of the key ("Ctrl+z" isn't "z"), as Settings → Keybinds keeps it.
      const key = keyOf(e);
      // On today's cards, Start's own key starts the review (the owner, 2026-10-27: not Show answer's); Enter does too, but on a button.
      if (today) {
        if (key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          start();
        } else if (sameKey(key, binds.start.key)) {
          e.preventDefault();
          if (!e.repeat) hold.begin(e.key, document.querySelector<HTMLElement>("[data-hold='today-start']"), binds.start.holdMs, start);
        }
        return;
      }
      // Undo's key works at the end too, where there's no card: the last answer is what it takes back.
      if (pressed(e, binds.undo.key)) {
        e.preventDefault();
        if (e.repeat) return;
        // The Undo button on screen: the counts' row's or the one under the answers, whichever the CSS shows.
        const button = [...document.querySelectorAll<HTMLElement>("[data-hold='undo']")].find((el) => el.getClientRects().length > 0) ?? null;
        hold.begin(e.key, button, binds.undo.holdMs, () => void undo());
        return;
      }
      // At the end, Start's key starts extra study, as it starts a review on today's cards; Enter does too, but on a button.
      if (!card && extraOrder.length > 0) {
        if (key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          startExtra();
        } else if (sameKey(key, binds.start.key)) {
          e.preventDefault();
          if (!e.repeat) hold.begin(e.key, document.querySelector<HTMLElement>("[data-hold='extra-start']"), binds.start.holdMs, startExtra);
        }
        return;
      }
      if (!card) return;
      // Another of the card's examples, either way, with its key held as long as it's set to be.
      const step = exampleIds.length > 1 ? (sameKey(key, binds.examplePrev.key) ? -1 : sameKey(key, binds.exampleNext.key) ? 1 : 0) : 0;
      if (step !== 0) {
        e.preventDefault();
        if (e.repeat) return;
        const bind = step < 0 ? binds.examplePrev : binds.exampleNext;
        hold.begin(e.key, place.current?.querySelector<HTMLElement>(`[data-hold='example-${step < 0 ? "prev" : "next"}']`) ?? null, bind.holdMs, () => stepExample(step));
        return;
      }
      // Enter shows the answer too, at a press, whatever the keys are; on a button it's that button's own.
      if (key === "Enter") {
        if (e.target instanceof HTMLButtonElement || revealed) return;
        e.preventDefault();
        reveal();
        return;
      }
      if (sameKey(key, binds.reveal.key)) {
        e.preventDefault();
        if (e.repeat) return;
        // Turned back to its front at a tap (the owner, 2026-10-19 and 2026-10-21); shown with a hold when it's a key to hold.
        if (revealed) {
          if (!busy) {
            setAsking(null);
            setRevealed(false);
          }
          return;
        }
        hold.begin(e.key, place.current?.querySelector<HTMLElement>("[data-hold='reveal']") ?? null, binds.reveal.holdMs, reveal);
        return;
      }
      if (key === "Escape" && asking) {
        setAsking(null);
        return;
      }
      // Held for its key's own time, and an answer that asks for confirmation that much plus `confirmMs`, the longer
      // hold being its yes. With no hold at all it's a press, and such an answer asks, the same key again its yes. A
      // key whose answer isn't offered here does nothing.
      const slot = binds.answers.findIndex((bind) => sameKey(bind.key, key));
      const picked = slot >= 0 ? answers[slot] : undefined;
      if (revealed && picked && offered(srsType, card.place, picked.id)) {
        e.preventDefault();
        if (e.repeat) return;
        const ms = holdFor(binds.answers[slot], picked.confirm ? binds.confirmMs : 0);
        if (ms === 0) {
          press(picked.id);
          return;
        }
        const button = place.current?.querySelector<HTMLElement>(`[data-answer="${picked.id}"]`) ?? null;
        hold.begin(e.key, button, ms, () => void answer(picked.id));
      }
    }
    /**
     * A key let go before its hold is done: nothing happens. The answer's key is the page's even with a button focused
     * (the clip's play button, pressed a moment ago): Firefox presses a focused button as Space is let go, whatever was
     * done as it went down.
     */
    function onUp(e: KeyboardEvent) {
      hold.release(e.key);
      const starts = today !== null || (!card && extraOrder.length > 0);
      if (pressed(e, starts ? binds.start.key : binds.reveal.key) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  if (today) {
    return (
      <TodayCards type={type} srsType={srsType} reviews={todayReviews} fresh={todayNew} others={otherNew} today={today} startKey={binds.start} opened={begin === "cards"} onPick={pick} onMore={offerMore} onStart={start} />
    );
  }
  if (!card) {
    const now = Date.now();
    // A suspended card comes back when it's brought back, which nothing foresees; a buried one once its bury is over at the soonest.
    const waiting = [...byId.values()].filter((c) => !isNew(c.place) && !isBurned(srsType, c.place) && c.dueAt !== null && c.hold?.kind !== "suspend");
    const daysOff = (c: Card) => (Math.max(c.dueAt ?? 0, c.hold?.until ?? 0) - now) / DAY_MS;
    const rows = COMING_UP.map((row, i) => {
      const from = i === 0 ? -Infinity : (COMING_UP[i - 1]?.days ?? 0);
      return { ...row, n: waiting.filter((c) => daysOff(c) > from && daysOff(c) <= row.days).length };
    });
    const max = Math.max(1, ...rows.map((r) => r.n));
    const nothing = answered === 0;
    return (
      <section className="summary review-done">
        <h2 className="summary-title">{nothing ? "Nothing to review right now." : "That’s the lot."}</h2>
        {nothing ? null : (
          <div className="tally">
            {answers.map((a, i) => (
              <span key={a.id} className={`pill ${answerClass(answers, i)}`}>
                {a.name} · {counts[a.id] ?? 0}
              </span>
            ))}
          </div>
        )}
        {/* Past today's count there may be cards never started: the day's limit is a pace, not a wall, so more can be
            started now, looked over first as today's are. */}
        {extraOrder.length > 0 ? (
          <TodayCards
            id="extra"
            label="Extra study"
            tools={<NumberField id="extra-count" label="How many more new cards" value={extraPicked.length} min={0} max={extraOrder.length} onChange={setExtraCount} />}
            type={type}
            srsType={srsType}
            reviews={[]}
            fresh={cardsOf(extraOffered)}
            others={cardsOf(extraOrder.slice(extraOffered.length))}
            today={extraToday}
            startKey={binds.start}
            opened={false}
            onPick={pickExtra}
            onMore={offerAllExtra}
            onStart={startExtra}
          />
        ) : null}
        <section className="panel" aria-labelledby="coming-up-title">
          <h3 id="coming-up-title" className="panel-title">
            Coming up
          </h3>
          <div className="next-days">
            {rows.map((row) => (
              <div key={row.label} className="next-day">
                <span>{row.label}</span>
                <span className="barwrap">
                  <span className="bar" style={{ width: `${(row.n / max) * 100}%` }} />
                </span>
                <span className="n">{row.n}</span>
              </div>
            ))}
          </div>
        </section>
        {failure ? (
          <p className="load-error" role="alert">
            {failure}
          </p>
        ) : null}
        <div className="add-actions add-actions-start">
          {nothing && cards.length === 0 ? (
            <Button id="review-add" variant="primary" onClick={onGoAdd}>
              Add a card
            </Button>
          ) : (
            <Button id="review-home" variant="primary" onClick={onHome}>
              Home
            </Button>
          )}
          {given.length > 0 ? (
            <Button id="review-undo" className="review-undo-end" data-hold="undo" disabled={busy} onClick={() => void undo()}>
              <Icon name="undo" />
              Undo
              <KeyCap bind={binds.undo} />
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  // Filling the screen, the review is the stage (`.is-stage`), its clip at the left and the rest in a rail, and not the page's fitted layout.
  const full = stage.screen.full;
  const look = full ? `is-stage ${staged && !stage.open ? "is-closed" : ""}` : "is-fit";
  // Undo and Chart: in the counts' row on a computer, under the answers on a phone (the owner's place for them,
  // 2026-10-18), the CSS showing one of the two. Pinned over the counts' row, they covered "in play · waiting".
  const tools = (
    <>
      <Button className="review-undo" data-hold="undo" disabled={busy || given.length === 0} onClick={() => void undo()}>
        <Icon name="undo" />
        Undo
        <KeyCap bind={binds.undo} />
      </Button>
      <Button className="review-chart-toggle" aria-pressed={chartOpen} onClick={toggleChart}>
        <Icon name="srs" />
        Chart
      </Button>
    </>
  );
  return (
    <section ref={place} className={`review ${look}`.trim()}>
      <div className="review-top">
        {/* What's left, by kind, each count with its word ("2 + 0 + 9" said nothing, the owner, 2026-10-21), in the order they come; the kind of the card on screen underlined. */}
        <span className="review-counts" role="status">
          {countOrder(deck.settings).map((kind) => (
            <span key={kind} className={`review-count is-${kind} ${kindOf(card) === kind ? "is-now" : ""}`.trim()}>
              <span className="review-n">{togo[kind]}</span> {KIND_WORDS[kind](togo[kind])}
            </span>
          ))}
        </span>
        {/* With a limit on how many are in play, say how many that is right now and how many wait their turn. */}
        {line.waiting.length > 0 ? <span>{`${line.active.length} in play · ${line.waiting.length} waiting`}</span> : null}
        {/* Filling the screen: Undo, the rail closed to leave the clip alone (until the screen is next filled), and the way out. */}
        {!full ? <span className="review-tools">{tools}</span> : null}
        {full ? (
          <span className="review-stage-tools">
            <Button className="btn-icon" aria-label="Undo" data-hold="undo" disabled={busy || given.length === 0} onClick={() => void undo()}>
              <Icon name="undo" />
            </Button>
            {staged ? (
              <Button className="btn-icon" aria-label="Hide the card" onClick={stage.close}>
                <Icon name="close" />
              </Button>
            ) : null}
            <Button className="btn-icon" aria-label="Leave full screen" onClick={stage.screen.toggle}>
              <Icon name="unfull" />
            </Button>
          </span>
        ) : null}
      </div>
      {/* Each card its own: what was opened or played on the last one doesn't carry over. Its clip fills the screen with the whole review (`useScreenStage`). */}
      <ScreenStageContext.Provider value={stage.screen}>
        <ReviewCard
          key={`${card.id}-${exampleId ?? ""}`}
          type={type}
          values={valuesWithExample(type, card, onScreen)}
          files={card.files}
          srsType={srsType}
          place={card.place}
          revealed={revealed}
          // Turned by its key and Show answer alone: a press on the card does nothing (the owner, 2026-10-25).
          srcOf={api.mediaUrl}
          waveOf={waveOf}
          cues={card.cues}
          subtitleStyle={subtitleStyle}
          picturesOf={api.videoPictures}
          // Another example looked at: it plays when it's pressed, not by itself.
          autoplay={browsed === null}
          shortcuts={binds.media.map(shortcutOf)}
          screenKey={shortcutOf(binds.fullScreen)}
          hint={false}
          keys={false}
          examplePager={
            exampleIds.length > 1 ? (
              <>
                <Button className="review-example-step" data-hold="example-prev" aria-label="Previous example" onClick={() => stepExample(-1)}>
                  <Icon name="back" />
                  <KeyCap bind={binds.examplePrev} />
                </Button>
                <span className="review-examples-at">
                  {Math.max(0, exampleIds.indexOf(onScreen)) + 1} / {exampleIds.length}
                </span>
                <Button className="review-example-step" data-hold="example-next" aria-label="Next example" onClick={() => stepExample(1)}>
                  <KeyCap bind={binds.exampleNext} />
                  <Icon name="forward" />
                </Button>
              </>
            ) : null
          }
        />
      </ScreenStageContext.Provider>

      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      {revealed && asked ? (
        <div className="panel panel-alarm review-ask">
          <p id="review-question" className="question">
            {asked.name}? {askWords(srsType, card, asked.id)}
          </p>
          <div className="add-actions">
            <Button id="review-keep" disabled={busy} onClick={() => setAsking(null)}>
              Keep
            </Button>
            <Button id="review-yes" variant="primary" disabled={busy} onClick={() => answer(asked.id)}>
              {asked.name}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="review-actions">
            {revealed ? (
              // An answer the chart doesn't offer at this point (its rule here is "Not offered") has no button; the others keep their keys.
              answers.map((a, i) =>
                a.aside || !offered(srsType, card.place, a.id) ? null : (
                  <Button
                    key={a.id}
                    variant="answer"
                    className={answerClass(answers, i)}
                    data-answer={a.id}
                    disabled={busy}
                    onClick={() => press(a.id)}
                    onMouseEnter={() => rest(a.id)}
                    onMouseLeave={leave}
                  >
                    <span className="name">{a.name}</span>
                    <Lead lead={answerLead(srsType, card, a.id)} />
                    <KeyCap bind={binds.answers[i]} extra={a.confirm ? binds.confirmMs : 0} />
                  </Button>
                ),
              )
            ) : (
              <Button variant="primary" size="lg" data-hold="reveal" onClick={reveal}>
                Show answer
                <KeyCap bind={binds.reveal} />
              </Button>
            )}
          </div>
          {/* The answers set apart hold their room on the front, unseen, as the back's parts do: turning the card moves nothing. */}
          {answers.some((a) => a.aside && offered(srsType, card.place, a.id)) ? (
            <div className={revealed ? "review-asides" : "review-asides is-later"} aria-hidden={!revealed}>
              {answers.map((a, i) =>
                a.aside && offered(srsType, card.place, a.id) ? (
                  <Button key={a.id} variant="chip" className="review-aside" data-answer={a.id} disabled={busy || !revealed} onClick={() => press(a.id)} onMouseEnter={() => rest(a.id)} onMouseLeave={leave}>
                    <span className="name">{a.name}</span>
                    <Lead lead={answerLead(srsType, card, a.id)} />
                    <KeyCap bind={binds.answers[i]} extra={a.confirm ? binds.confirmMs : 0} />
                  </Button>
                ) : null,
              )}
            </div>
          ) : null}
          {/* Under the answers on a phone (the owner's place for it, 2026-10-18): Undo, and the card's chart, on or off, kept on this device. Not while the review fills the screen, whose top row has Undo. */}
          {full ? null : <div className="review-chart-row">{tools}</div>}
          {/* The card's chart, while the Chart button is on: its box lit, and the box the answer under the mouse leads to. */}
          {chartOpen && !full
            ? (() => {
                const glance = chartOf(srsType, card, revealed ? hover : null);
                return (
                  <div ref={chartPlace} className="review-chart">
                    <FlowCanvas type={srsType} scope={glance.scope} onScope={() => undefined} onChange={() => undefined} onUndo={() => undefined} onRedo={() => undefined} canUndo={false} canRedo={false} glance={glance} />
                  </div>
                );
              })()
            : null}
        </>
      )}
    </section>
  );
}
