import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { againPlaceOf, stagedOrder, exampleFieldsOf, holdsWords, isBurned, valuesWithExample, sourcesWithExample, isNew, mainAnswers, offered, resolve, stageIndex, wordsFieldOf, type Card, type CardAnswer, type CardType, type Deck, type ReviewSessionEnd, type SrsAnswer, type SrsType, type SubtitleStyle } from "@panki/contracts";
import { ApiError, api } from "../api";
import { Button } from "../components/Button";
import { FlowCanvas } from "../components/FlowCanvas";
import { Icon } from "../components/Icon";
import { KeyCap, holdFor } from "../components/KeyCap";
import { NumberField } from "../components/NumberField";
import { PlacePill } from "../components/PlacePill";
import { ReviewCard, listensFirst } from "../components/ReviewCard";
import { ReviewButtons, ReviewCounts, ReviewScreen, answerLead, stepFor } from "../components/ReviewScreen";
import { TodayBar, todayWords } from "../components/TodayBar";
import { keepDouble, useHold } from "../hooks/useHold";
import { useHoldButton, type HoldStage } from "../hooks/useHoldButton";
import { useScreenStage } from "../hooks/useScreenStage";
import { doubleKeys, keyIn, keyOf, pressedIn, restartOf, shortcutOf, useKeyBinds, useKeybindsEnabled, type Bind } from "../keys";
import { ledger } from "../ledger";
import { advance, buildQueue, comesBack, isUnseen, joinLine, kindOf, nextFresh, startLine, togoOf, type Line } from "../reviewLine";
import { shuffle } from "../shuffle";
import { rememberShape } from "../skeletonMemory";
import { LESSON_SCOPE } from "../srsFlow";
import { NEW_WORDS, answerClass, holdAsks, isHold } from "../srsKinds";
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

/** The question before an answer that asks first: where it sends the card, or what putting it aside does. */
function askWords(srsType: SrsType, card: Card, answerId: string): string {
  const step = stepFor(srsType, card.place, answerId);
  return isHold(step) ? holdAsks(step) : `This card goes to ${answerLead(srsType, card.place, answerId).words}.`;
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
 * Today's cards before the first one (a deck's `todayFirst`): the reviews and the new cards as tiles, every one picked to begin with. A press
 * leaves one out for the next review; a stage's chip, All and None do many at once; new cards past today's count are a
 * press away. Start runs the review on what's picked, with a key of its own (`keys.ts` → `start`). Extra study at the
 * end is this too, with how many to pick added: its new cards past today's, under its name, with how many in the bar after Show cards.
 */
function TodayCards({ id = "today", label, tools, available, type, srsType, reviews, fresh, others, today, startKey, opened, onPick, onMore, onStart }: {
  /** What its ids and its Start's hold go by: `today` before a review, `extra` for extra study. */
  id?: string;
  /** Its name, at the head of the bar: "Extra study"; none before a review. */
  label?: string;
  /** What stands in the bar after Show cards: extra study's how many. */
  tools?: ReactNode;
  /**
   * What the bar says, always, in place of its counts and what's left for later: extra study's "19 new cards available"
   * (its number saying how many are picked).
   */
  available?: string;
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
  // New cards past today's count are extra study, which waits until the reviews are done: before a review with
  // reviews in it, they aren't offered.
  const locked = label === undefined && reviews.length > 0 && others.length > 0;
  const offered = today.more && !locked ? [...fresh, ...others] : fresh;
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
        <Icon name="check" />
        All
      </Button>
      <Button id={`${prefix}-none`} variant="chip" onClick={() => onPick(list.map((c) => c.id), false)}>
        <Icon name="minus" />
        None
      </Button>
    </>
  );
  return (
    <section className="review-today">
      {/* Folded to the counts to begin with; Show cards unfolds the tiles under it. */}
      <TodayBar
        id={id}
        name={label}
        counts={available === undefined ? (todayWords(picked(reviews).length, picked(offered).length) ?? "None picked") : undefined}
        shown={open}
        onShow={() => setOpen(!open)}
        tools={tools}
        left={available ?? (left ? `${left} for later` : null)}
      >
        <Button id={`${id}-start`} variant="primary" size="lg" data-hold={`${id}-start`} disabled={total === 0} onClick={onStart}>
          <Icon name="play" />
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
                  {others.length > 0 && !locked ? (
                    <Button id={`${id}-more`} variant="chip" aria-pressed={today.more} onClick={() => onMore(!today.more)}>
                      <Icon name="add" />
                      Show every new card
                    </Button>
                  ) : null}
                  {offered.length > 0 ? allNone(offered, `${id}-new`) : null}
                </span>
              </div>
              {offered.length > 0 ? <div className="today-cards">{offered.map(tile)}</div> : locked ? null : <p className="empty">No new cards today.</p>}
              {locked ? <p className="empty">Finish these reviews to unlock extra study.</p> : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The card on its chart, the box it's at and the box an answer would send it to: which rules the card follows (its stage's own, or the
 * default ones worked out for its stage), the box it's at (the root, or the ask-again it's inside, by its path), and
 * the box the answer under the mouse leads to (the same path one longer; "Keep asking" turns back into the box it
 * left, as its loop on the chart), none while no answer is under it. Shown under the answers while the Chart button
 * is on, never popped up on hover, where it would be small, couldn't be moved, and would come up uninvited while an
 * answer is only being decided.
 */
function chartOf(srsType: SrsType, card: Card, answerId: string | null): { scope: string; now: string; next: string | null; stage: number } {
  const idx = stageIndex(srsType, card.place);
  const stage = srsType.stages[idx];
  const scope = idx < 0 ? LESSON_SCOPE : stage && srsType.overrides[stage.id] ? stage.id : "all";
  const now = card.place.node.length > 0 ? card.place.node.join(",") : "root";
  const step = answerId === null ? undefined : stepFor(srsType, card.place, answerId);
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
  /** What Undo can take back, newest last: every answer of this sitting, until it's left. */
  const [given, setGiven] = useState<Given[]>([]);
  const [revealed, setRevealed] = useState(false);
  /**
   * The showing (its `turn`) whose Listen phase is over: Done listening pressed, or its sound or clip begun the play that
   * shows it. A card's start is its Listen phase where it has one, its front otherwise: a new showing (an answer, Undo)
   * and Back to start all put it there.
   */
  const [listenedTurn, setListenedTurn] = useState<number | null>(null);
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
  /** This device's keys (`keys.ts`, Settings → Keybinds; none while keybinds are off), and a key being held on a button until it does its thing. */
  const binds = useKeyBinds();
  /** Keybinds Enabled on this device: off, Enter does nothing either. */
  const keysOn = useKeybindsEnabled();
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
   * The number is how many are picked (None sets it to 0, All to every one shown); typed, the
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
  // How many extra study offers as the end comes up, and how many new cards it has, remembered for the end's skeleton
  // next time (`skeletonMemory.ts`); none without new cards to start.
  const atEnd = today === null && card === undefined;
  const extraFirst = Math.min(firstExtra, extraOrder.length);
  useEffect(() => {
    if (!atEnd) return;
    rememberShape(`extra:${deck.id}`, extraFirst);
    rememberShape(`extra-all:${deck.id}`, extraOrder.length);
  }, [atEnd, extraFirst, extraOrder.length, deck.id]);
  /** The screen filled by the whole review, kept as the cards change and from one review to the next (`useScreenStage`). */
  const stage = useScreenStage(place, card !== undefined);
  // Which of its examples the card on screen shows: the one Panki pinned it to as the review read its cards (the deck's
  // Example shown), the same every time it comes up until an answer schedules it (`Card.shownExample`).
  const exampleId = card?.shownExample ?? null;
  /**
   * The card's examples in the order its arrows turn through them (its own first, then each added, as Rotate goes), and
   * the one looked at by hand: none until an arrow is pressed, and none again on each showing. The answer counts for the one the review picked
   * (`exampleId`). Switching to another, each sound and clip that's One per example starts by itself where the one left
   * was playing or had played to its end, and stays still otherwise (`ReviewCard`).
   */
  const exampleIds = card && exampleFieldsOf(type).length > 0 && card.examples.length > 0 ? [null, ...card.examples.map((e) => e.id)] : [];
  const [browsed, setBrowsed] = useState<{ id: string | null } | null>(null);
  useEffect(() => setBrowsed(null), [cardId, turn]);
  const onScreen = browsed ? browsed.id : exampleId;
  /**
   * The card on screen is in its Listen phase (its type's Listen first): it has something to hear
   * in the example the review picked, and this showing hasn't gone on to its front yet.
   */
  const listening = card !== undefined && !revealed && listenedTurn !== turn && listensFirst(type, valuesWithExample(type, card, exampleId), card.files);
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
  }, [cardId, revealed, listening]); // eslint-disable-line react-hooks/exhaustive-deps -- `leave` and `hold.release` read nothing that changes
  /**
   * The Hold button, while it's on (Settings → Keybinds): the card's stages from its start, Done listening on a card
   * that listens first, Show back of card, and the deck's answer (`holdAnswer`) where the chart offers it here, each held
   * for its own time; what's done is where the card stands. One more action with its own key, beside the review's own
   * buttons and their keys.
   */
  const chainOn = binds.holdChain.on;
  const holdAnswer = card ? srsType.answers.find((a) => a.id === deck.settings.holdAnswer && offered(srsType, card.place, a.id)) : undefined;
  // Whether the card starts in its Listen phase, as every showing of it does where it has one.
  const listensHere = card !== undefined && listensFirst(type, valuesWithExample(type, card, exampleId), card.files);
  const lead = listensHere ? 1 : 0;
  const chainStages: HoldStage[] = [
    ...(listensHere ? [{ label: "Done listening", ms: binds.holdChain.listenMs, done: showCard }] : []),
    { label: "Show back of card", ms: binds.holdChain.backMs, done: reveal },
    ...(holdAnswer ? [answerStage(holdAnswer)] : []),
  ];
  /** Pick the answer: the deck's answer by its name, in its colour, an answer that requires confirmation its extra hold on top. */
  function answerStage(given: SrsAnswer): HoldStage {
    const confirmMs = given.confirm ? binds.confirmMs : 0;
    const ordered = [...srsType.answers.filter((a) => !a.aside), ...srsType.answers.filter((a) => a.aside)];
    return { label: given.name, ms: binds.holdChain.answerMs + confirmMs, confirmMs, tone: answerClass(ordered, ordered.indexOf(given)), done: () => void answer(given.id) };
  }
  /** The Hold button on screen, where its holds are drawn. */
  function chainAt() {
    return place.current?.querySelector<HTMLElement>("[data-hold='chain']") ?? null;
  }
  /** Back to start: the card on its start again (its Listen phase where it has one, its front otherwise), nothing answered. */
  function backToStart() {
    if (busy) return;
    setAsking(null);
    setRevealed(false);
    setListenedTurn(null);
  }
  const chain = useHoldButton({
    stages: chainStages,
    at: listening ? 0 : revealed ? lead + 1 : lead,
    rest: "Back to start",
    back: backToStart,
    showing: `${cardId ?? ""}:${turn}`,
    bind: binds.holdButton,
    where: chainAt,
  });
  // Every key whose double press does something here: a press of it waits to see it isn't that (`useHold.ts` → `keepDouble`).
  const doubles = doubleKeys(binds);
  useEffect(() => {
    const kept = doubles.map(keepDouble);
    return () => {
      for (const letGo of kept) letGo();
    };
  }, [doubles.join("\n")]); // eslint-disable-line react-hooks/exhaustive-deps -- the keys are what the joined list says

  const sitting = useRef<Sitting | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The card on screen and when it came on and was flipped, on the browser's clock; every appearance is timed afresh,
   * and has the id its answer will be given (so the same answer sent again is kept once). One that came on in its
   * Listen phase (`listen`) is also timed from its Listen phase's start (`listenAt`: as it came on, or as Step back took
   * it back there) to its front (`frontAt`).
   */
  const shown = useRef<{ cardId: string | null; at: number; listen: boolean; listenAt: number; frontAt: number | null; revealedAt: number | null; givenId: string }>({ cardId: null, at: 0, listen: false, listenAt: 0, frontAt: null, revealedAt: null, givenId: "" });
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
    // Where a card that opened on its Listen phase stood; nothing said of one that didn't.
    const phase = !s.listen ? undefined : s.revealedAt !== null ? "back" : s.frontAt !== null ? "front" : "listen";
    if (s.cardId) endSitting({ how: "left", cardId: s.cardId, shownMs: span(s.at, performance.now()), revealed: s.revealedAt !== null, phase }, true);
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
    const at = performance.now();
    shown.current = { cardId: cardId ?? null, at, listen: listening, listenAt: at, frontAt: null, revealedAt: null, givenId: crypto.randomUUID() };
  }, [cardId, turn]); // eslint-disable-line react-hooks/exhaustive-deps -- whether it opens listening is read as it comes on

  /** Done listening: from the Listen phase to the front, by its button, its key, or its sound or clip beginning the play that shows it. */
  function showCard() {
    if (!listening) return;
    shown.current.frontAt ??= performance.now();
    setListenedTurn(turn);
  }
  function reveal() {
    if (revealed || listening) return;
    shown.current.revealedAt ??= performance.now();
    setRevealed(true);
  }
  /** Whether Step back can run: on the back, or on the front of a card that has a Listen phase to go back to. */
  const canStepBack = revealed || (!listening && listensHere);
  /**
   * Step back, the card a phase back: its back to its front (a question asked about an answer goes with it), its front to
   * its Listen phase where it has one, a fresh one, its time counted from now as a Listen phase is.
   */
  function stepBack() {
    if (busy || !canStepBack) return;
    if (revealed) {
      setAsking(null);
      setRevealed(false);
      return;
    }
    shown.current = { ...shown.current, listen: true, listenAt: performance.now(), frontAt: null };
    setListenedTurn(null);
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
  const togo = togoOf([...line.active, ...line.waiting], byId, srsType, best);
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
    // Thinking starts at the front: as the card came on, or as its Listen phase ended.
    const frontAt = t.listen ? (t.frontAt ?? revealedAt) : t.at;
    const s = sitting.current;
    const before: Given = { givenId: t.givenId, cardId: card.id, line, counts, answered };
    try {
      const saved = await onAnswer(card.id, {
        givenId: t.givenId,
        answerId,
        // A sitting that failed to start is left out; one still starting is named, the API has it by the time this lands.
        sessionId: s && s.ok !== false ? s.id : undefined,
        listenMs: t.listen ? span(t.listenAt, frontAt) : undefined,
        thinkMs: span(frontAt, revealedAt),
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
   * is put back as it was just before it, the card on screen again at its start (its Listen phase where it has one), a
   * showing of its own. One Panki
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
      // On its start, as it first came up: its Listen phase where it has one, its front otherwise.
      setTurn(turn + 1);
      setListenedTurn(null);
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
      // Enter starts and shows as Start's and Show back of card's keys do, while keybinds are on.
      const enter = keysOn && key === "Enter";
      // On today's cards, Start's own key starts the review, not Show answer's; Enter does too, but on a button.
      if (today) {
        if (enter && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          start();
        } else {
          const starting = keyIn(binds.start, key);
          if (starting) {
            e.preventDefault();
            if (!e.repeat) hold.begin(e,document.querySelector<HTMLElement>("[data-hold='today-start']"), starting.holdMs, start);
          }
        }
        return;
      }
      // Undo's key works at the end too, where there's no card: the last answer is what it takes back.
      const undoing = pressedIn(e, binds.undo);
      if (undoing) {
        e.preventDefault();
        if (e.repeat) return;
        // The Undo button on screen: the counts' row's or the one under the answers, whichever the CSS shows.
        const button = [...document.querySelectorAll<HTMLElement>("[data-hold='undo']")].find((el) => el.getClientRects().length > 0) ?? null;
        hold.begin(e,button, undoing.holdMs, () => void undo());
        return;
      }
      // At the end, Start's key starts extra study, as it starts a review on today's cards; Enter does too, but on a button.
      if (!card && extraOrder.length > 0) {
        if (enter && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          startExtra();
        } else {
          const starting = keyIn(binds.start, key);
          if (starting) {
            e.preventDefault();
            if (!e.repeat) hold.begin(e,document.querySelector<HTMLElement>("[data-hold='extra-start']"), starting.holdMs, startExtra);
          }
        }
        return;
      }
      if (!card) return;
      // Another of the card's examples, either way, with its key held as long as it's set to be; a player's line with the
      // focus keeps its own arrows (← and → are the examples' to begin with).
      const onLine = e.target instanceof HTMLElement && e.target.closest("[role='slider']") !== null;
      const back = exampleIds.length > 1 && !onLine ? keyIn(binds.examplePrev, key) : null;
      const on = exampleIds.length > 1 && !onLine && !back ? keyIn(binds.exampleNext, key) : null;
      const step = back ? -1 : on ? 1 : 0;
      if (step !== 0) {
        e.preventDefault();
        if (e.repeat) return;
        hold.begin(e,place.current?.querySelector<HTMLElement>(`[data-hold='example-${step < 0 ? "prev" : "next"}']`) ?? null, (back ?? on)?.holdMs ?? 0, () => stepExample(step));
        return;
      }
      // The Hold button's Back to start, while it's on: its own key (Space pressed twice to begin with), heard beside the
      // Hold button's, which shares it; done, this press holds nothing. Until it's done (the first press of its double
      // press), the press goes on to whatever else its key is in another shape (Done listening's Space held), as every key
      // shared by shape is (`keys.ts` → `clash`), so a hold of Back to start's key still does what that hold is set to.
      const resetting = chainOn ? keyIn(binds.holdReset, key) : null;
      let reset = false;
      if (resetting) {
        e.preventDefault();
        if (!e.repeat && !busy)
          hold.begin(e, chainAt(), resetting.holdMs, () => {
            reset = true;
            backToStart();
          });
      }
      // The Hold button's key, while it's on: the card's stages held through.
      if (chainOn && keyIn(binds.holdButton, key)) {
        e.preventDefault();
        if (!busy && !reset) chain.keyDown(e, key);
        return;
      }
      if (reset) return;
      // Enter shows the answer too, at a press, whatever the keys are (the card, while it's listened to); on a button
      // it's that button's own.
      if (enter) {
        if (e.target instanceof HTMLButtonElement || revealed) return;
        e.preventDefault();
        if (listening) showCard();
        else reveal();
        return;
      }
      // Step back's own key, a phase back, held as long as it's set to be; its hold drawn on the Step back button showing.
      const stepping = canStepBack ? keyIn(binds.hide, key) : null;
      if (stepping) {
        e.preventDefault();
        if (e.repeat || busy) return;
        const button = [...document.querySelectorAll<HTMLElement>("[data-hold='hide']")].find((el) => el.getClientRects().length > 0) ?? null;
        hold.begin(e, button, stepping.holdMs, stepBack);
        return;
      }
      // Done listening's own key while the card is listened to, Show back of card's on its front.
      const showing = keyIn(listening ? binds.showCard : binds.reveal, key);
      if (showing) {
        e.preventDefault();
        if (e.repeat || revealed) return;
        hold.begin(e, place.current?.querySelector<HTMLElement>("[data-hold='reveal']") ?? null, showing.holdMs, listening ? showCard : reveal);
        return;
      }
      if (key === "Escape" && asking) {
        setAsking(null);
        return;
      }
      // Held for its key's own time, and an answer that asks for confirmation that much plus `confirmMs`, the longer
      // hold being its yes. With no hold at all it's a press, and such an answer asks, the same key again its yes. A
      // key whose answer isn't offered here does nothing.
      const slot = binds.answers.findIndex((bind) => keyIn(bind, key) !== null);
      const picked = slot >= 0 ? answers[slot] : undefined;
      if (revealed && picked && offered(srsType, card.place, picked.id)) {
        e.preventDefault();
        if (e.repeat) return;
        const ms = holdFor(keyIn(binds.answers[slot], key) ?? undefined, picked.confirm ? binds.confirmMs : 0);
        const button = place.current?.querySelector<HTMLElement>(`[data-answer="${picked.id}"]`) ?? null;
        // A press asks first where the answer requires confirmation; a hold or a double press is its yes.
        hold.begin(e, button, ms, () => (ms === 0 ? press(picked.id) : void answer(picked.id)));
      }
    }
    /**
     * A key let go before its hold is done: nothing happens. The answer's key is the page's even with a button focused
     * (the clip's play button, pressed a moment ago): Firefox presses a focused button as Space is let go, whatever was
     * done as it went down.
     */
    function onUp(e: KeyboardEvent) {
      hold.release(e.key);
      chain.keyUp(e);
      const starts = today !== null || (!card && extraOrder.length > 0);
      const own = starts ? [binds.start] : [listening ? binds.showCard : binds.reveal, ...(chainOn ? [binds.holdButton] : [])];
      if (own.some((bind) => pressedIn(e, bind)) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
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
            available={`${count(extraOrder.length, "new card", "new cards")} available`}
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
              <Icon name="add" />
              Add a card
            </Button>
          ) : (
            <Button id="review-home" variant="primary" onClick={onHome}>
              <Icon name="home" />
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

  return (
    <ReviewScreen
      place={place}
      stage={stage}
      staging={stagedOrder(type.layout, type.fields)}
      counts={<ReviewCounts counts={{ settings: deck.settings, togo, now: kindOf(card), line }} />}
      busy={busy}
      binds={binds}
      onStepBack={stepBack}
      canStepBack={canStepBack}
      onUndo={() => void undo()}
      canUndo={given.length > 0}
      chart={{ open: chartOpen, onToggle: toggleChart }}
      failure={failure}
      hold={chainOn ? chain.view : null}
      card={
        // Each card its own: what was opened or played on the last one doesn't carry over.
        <ReviewCard
          key={`${card.id}-${exampleId ?? ""}`}
          type={type}
          values={valuesWithExample(type, card, onScreen)}
          sources={sourcesWithExample(type, card, onScreen)}
          files={card.files}
          srsType={srsType}
          place={card.place}
          revealed={revealed}
          listening={listening}
          onListened={showCard}
          // Turned by its key and Show answer alone: a press on the card does nothing.
          srcOf={api.mediaUrl}
          waveOf={waveOf}
          cues={card.cues}
          subtitleStyle={subtitleStyle}
          picturesOf={api.videoPictures}
          // Another example looked at carries how each of its sounds and clips stood (`ReviewCard`): playing or played to its end, the next one starts.
          autoplay
          shortcuts={binds.media.map((bind) => shortcutOf(bind, binds))}
          restarts={binds.restart.map((bind) => restartOf(bind, binds))}
          screenKey={shortcutOf(binds.fullScreen, binds)}
          hint={false}
          keys={false}
          examplePager={
            exampleIds.length > 1 ? (
              <>
                <Button className="btn-icon review-example-step" data-hold="example-prev" aria-label="Previous example" onClick={() => stepExample(-1)}>
                  <Icon name="back" />
                  <KeyCap bind={binds.examplePrev} />
                </Button>
                <span className="review-examples-at">
                  {Math.max(0, exampleIds.indexOf(onScreen)) + 1} / {exampleIds.length}
                </span>
                <Button className="btn-icon review-example-step" data-hold="example-next" aria-label="Next example" onClick={() => stepExample(1)}>
                  <KeyCap bind={binds.exampleNext} />
                  <Icon name="forward" />
                </Button>
              </>
            ) : null
          }
        />
      }
      buttons={<ReviewButtons srsType={srsType} place={card.place} revealed={revealed} listening={listening} binds={binds} busy={busy} onShow={listening ? showCard : reveal} onAnswer={press} onRest={rest} onLeave={leave} />}
      ask={
        revealed && asked ? (
          <div className="panel panel-alarm review-ask">
            <p id="review-question" className="question">
              {asked.name}? {askWords(srsType, card, asked.id)}
            </p>
            <div className="add-actions">
              <Button id="review-cancel" disabled={busy} onClick={() => setAsking(null)}>
                Cancel
              </Button>
              <Button id="review-yes" variant="primary" disabled={busy} onClick={() => answer(asked.id)}>
                {asked.name}
              </Button>
            </div>
          </div>
        ) : null
      }
      chartView={
        // The card's chart, while the Chart button is on: its box lit, and the box the answer under the mouse leads to.
        chartOpen
          ? (() => {
              const glance = chartOf(srsType, card, revealed ? hover : null);
              return (
                <div ref={chartPlace} className="review-chart">
                  <FlowCanvas type={srsType} scope={glance.scope} onScope={() => undefined} onChange={() => undefined} onUndo={() => undefined} onRedo={() => undefined} canUndo={false} canRedo={false} glance={glance} />
                </div>
              );
            })()
          : null
      }
    />
  );
}
