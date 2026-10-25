import { useEffect, useMemo, useRef, useState } from "react";
import { againPlaceOf, branchAt, exampleShownOf, flowOf, isBurned, valuesWithExample, isNew, mainAnswers, offered, resolve, stageIndex, type Card, type CardAnswer, type CardType, type Deck, type HoldKind, type Outcome, type ReviewSessionEnd, type SrsType, type Step, type SubtitleStyle } from "@panki/contracts";
import { api } from "../api";
import { Button } from "../components/Button";
import { FlowCanvas } from "../components/FlowCanvas";
import { Icon, type IconName } from "../components/Icon";
import { NumberField } from "../components/NumberField";
import { ReviewCard } from "../components/ReviewCard";
import { useHold } from "../hooks/useHold";
import { sameKey, shortcutOf, useKeyBinds, type Bind } from "../keys";
import { shuffle } from "../shuffle";
import { LESSON_SCOPE } from "../srsFlow";
import { HOLD_KINDS, NEW_WORDS, againWords, answerClass, backWords, holdAsks, holdBack, isHold, placeName } from "../srsKinds";
import { waveOf } from "../waveform";
import { count, keyWords } from "../words";

type Props = {
  deck: Deck;
  cards: Card[];
  /** The deck's card type: which values show before the flip, and which after. */
  type: CardType;
  /** The deck's SRS type: the answers, and where each sends the card. */
  srsType: SrsType;
  /** How a clip's subtitles look on the card: the account's. */
  subtitleStyle: SubtitleStyle;
  /** The answer with the sitting it happened in and how long the card was on screen before and after the flip. */
  onAnswer: (cardId: string, answer: CardAnswer) => Promise<Card>;
  onGoAdd: () => void;
  onHome: () => void;
};

const DAY_MS = 86_400_000;
/** The longest span the silo takes (the contracts' `Ms`): a tab left open for a day sends that, not a refusal. */
const SPAN_MAX = DAY_MS;
/** A span between two of the browser's own moments, in whole ms. */
const span = (from: number, to: number) => Math.min(SPAN_MAX, Math.max(0, Math.round(to - from)));

/**
 * A sitting with the deck, as the API knows it. Started as the screen opens and ended once, as done when the line
 * runs out or as left when the screen goes with a card still on it. `ok` is null until the start is answered;
 * a start that failed never blocks the review, the answers just go without a sitting.
 */
type Sitting = { id: string; ready: Promise<boolean>; ok: boolean | null; ended: boolean };
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
 * anywhere (the owner, 2026-10-21: it opened on one of those at random, shuffled in among the reviews).
 */
function buildQueue(cards: Card[], deck: Deck): string[] {
  const { newOrder, newPlace, reviewOrder } = deck.settings;
  const overdue = cards.filter((c) => c.due).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  // The order decides which cards make it under the day's limit, as well as when they show.
  const allDue = (reviewOrder === "random" ? shuffle(overdue) : overdue).slice(0, deck.dueCount);
  const again = allDue.filter((c) => kindOf(c) === "again").map((c) => c.id);
  const due = allDue.filter((c) => kindOf(c) !== "again").map((c) => c.id);
  const unseen = cards.filter(isUnseen).sort((a, b) => a.createdAt - b.createdAt);
  const fresh = (newOrder === "shuffled" ? shuffle(unseen) : unseen).slice(0, deck.newCount).map((c) => c.id);
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

/** How long a key is held before its button does its thing: its own hold, and `extra` on top (confirmation's). */
const holdFor = (bind: Bind | undefined, extra = 0) => (bind?.key ? bind.holdMs + extra : 0);

/**
 * A key as its keycap on the button it presses (this device's, `keys.ts`), none when it has none; a key that's held
 * is a clock face that fills as it's held (`useHold`, `.key.is-hold`).
 */
function AnswerKey({ bind, extra = 0 }: { bind: Bind | undefined; extra?: number }) {
  if (!bind?.key) return null;
  return <span className={holdFor(bind, extra) > 0 ? "key is-hold" : "key"}>{keyWords(bind.key)}</span>;
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

/** A review of one deck: the cards due and the new ones for today, one at a time; reveal, then answer, and the answer says where the card goes. */
export function ReviewView({ deck, cards, type, srsType, subtitleStyle, onAnswer, onGoAdd, onHome }: Props) {
  const [byId, setById] = useState(() => new Map(cards.map((c) => [c.id, c])));
  const [line, setLine] = useState(() => startLine(buildQueue(cards, deck), deck.settings.pool));
  /** How many answers this review has taken, a card asked again counting each time. */
  const [answered, setAnswered] = useState(0);
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
  /** How many more new cards to start once the day's are done, as last set on the end screen; the deck's daily count to begin with. */
  const [extra, setExtra] = useState(deck.settings.newPerDay > 0 ? deck.settings.newPerDay : EXTRA_START);
  const cardId = line.active[0];
  const card = cardId ? byId.get(cardId) : undefined;
  // Which of its examples the card on screen shows, as the deck says: picked once each time it comes up (its count of
  // answers changes with each), so a random one holds still while it's on screen.
  const exampleId = useMemo(
    () => (card ? exampleShownOf(type, card, deck.settings.exampleShown, Math.random) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the card's id and count of answers are what make it another showing
    [card?.id, card?.seen, card?.examples.length, type, deck.settings.exampleShown],
  );
  // A new card on screen, or the answers going away, takes the glance down with them, and any key being held.
  useEffect(() => {
    leave();
    hold.release();
  }, [cardId, revealed]); // eslint-disable-line react-hooks/exhaustive-deps -- `leave` and `hold.release` read nothing that changes

  const sitting = useRef<Sitting | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The card on screen and when it came on and was flipped, on the browser's clock; every appearance is timed afresh. */
  const shown = useRef<{ cardId: string | null; at: number; revealedAt: number | null }>({ cardId: null, at: 0, revealedAt: null });
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
  useEffect(() => {
    // A remount straight after an unmount (StrictMode in development) is no leaving: the deferred "left" is called off.
    if (leaveTimer.current !== null) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (!sitting.current) startSitting("review");
    return () => {
      leaveTimer.current = setTimeout(() => {
        const s = shown.current;
        if (s.cardId) endSitting({ how: "left", cardId: s.cardId, shownMs: span(s.at, performance.now()), revealed: s.revealedAt !== null }, true);
      }, 0);
    };
    // Once per screen: the deck never changes under it (App keys this view by the deck's id).
  }, []);
  // A card comes on screen: its clock starts. A card back for another go, even the same one, starts afresh.
  useEffect(() => {
    shown.current = { cardId: cardId ?? null, at: performance.now(), revealedAt: null };
  }, [cardId, answered]);
  const atEnd = card === undefined;
  useEffect(() => {
    // Whichever sitting is in the ref by then: the day's, or the extra study started from the end screen.
    if (atEnd) endSitting({ how: "done" });
  }, [atEnd]);

  function reveal() {
    if (revealed) return;
    shown.current.revealedAt ??= performance.now();
    setRevealed(true);
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
    try {
      const saved = await onAnswer(card.id, {
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
      const handsOn = outcome.hold !== null && kindOf(card) === "new";
      setLine((l) => {
        const next = advance(l, card.id, comesBack(outcome), againPlaceOf(deck.settings));
        const joining = handsOn ? nextFresh(byId.values(), next, card.id, deck) : null;
        return joining ? joinLine(next, joining, deck.settings.pool) : next;
      });
      setAnswered((n) => n + 1);
      setRevealed(false);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Enter shows the answer too, at a press, whatever the keys are; on a button it's that button's own.
      if (e.key === "Enter") {
        if (e.target instanceof HTMLButtonElement || revealed) return;
        e.preventDefault();
        reveal();
        return;
      }
      if (sameKey(e.key, binds.reveal.key)) {
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
      if (e.key === "Escape" && asking) {
        setAsking(null);
        return;
      }
      // Held for its key's own time, and an answer that asks for confirmation that much plus `confirmMs`, the longer
      // hold being its yes. With no hold at all it's a press, and such an answer asks, the same key again its yes. A
      // key whose answer isn't offered here does nothing.
      const slot = binds.answers.findIndex((bind) => sameKey(bind.key, e.key));
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
      if (sameKey(e.key, binds.reveal.key) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

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
    // Past today's count there may be cards never started: the day's limit is a pace, not a wall, so more can be started now.
    const unseen = [...byId.values()].filter(isUnseen).sort((a, b) => a.createdAt - b.createdAt);
    const more = Math.min(extra, unseen.length);
    const startMore = () => {
      const picked = (deck.settings.newOrder === "shuffled" ? shuffle(unseen) : unseen).slice(0, more).map((c) => c.id);
      // The day's sitting ended as done when the line ran out; extra study is a sitting of its own.
      startSitting("extra");
      setLine(startLine(picked, deck.settings.pool));
    };
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
        {unseen.length > 0 ? (
          <section className="panel" aria-labelledby="more-new-title">
            <h3 id="more-new-title" className="panel-title">
              Extra study
            </h3>
            <p className="empty">{count(unseen.length, "new card", "new cards")} in this deck</p>
            <div className="add-actions add-actions-start">
              <NumberField id="more-new" label="How many more new cards" value={more} min={1} max={unseen.length} onChange={setExtra} />
              <Button id="more-new-go" variant="primary" onClick={startMore}>
                Start {more} more
              </Button>
            </div>
          </section>
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
        </div>
      </section>
    );
  }

  return (
    <section ref={place} className="review is-fit">
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
      </div>
      {/* Each card its own: what was opened or played on the last one doesn't carry over. */}
      <ReviewCard
        key={`${card.id}-${exampleId ?? ""}`}
        type={type}
        values={valuesWithExample(type, card, exampleId)}
        files={card.files}
        srsType={srsType}
        place={card.place}
        revealed={revealed}
        onPress={reveal}
        srcOf={api.mediaUrl}
        waveOf={waveOf}
        cues={card.cues}
        subtitleStyle={subtitleStyle}
        picturesOf={api.videoPictures}
        autoplay
        shortcuts={binds.media.map(shortcutOf)}
        screenKey={shortcutOf(binds.fullScreen)}
        hint={false}
        keys={false}
      />

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
                    <AnswerKey bind={binds.answers[i]} extra={a.confirm ? binds.confirmMs : 0} />
                  </Button>
                ),
              )
            ) : (
              <Button variant="primary" size="lg" data-hold="reveal" onClick={reveal}>
                Show answer
                <AnswerKey bind={binds.reveal} />
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
                    <AnswerKey bind={binds.answers[i]} extra={a.confirm ? binds.confirmMs : 0} />
                  </Button>
                ) : null,
              )}
            </div>
          ) : null}
          {/* Under the answers (the owner's place for it, 2026-10-18): the card's chart, on or off, kept on this device. */}
          <div className="review-chart-row">
            <Button className="review-chart-toggle" aria-pressed={chartOpen} onClick={toggleChart}>
              <Icon name="srs" />
              Chart
            </Button>
          </div>
          {/* The card's chart, while the Chart button is on: its box lit, and the box the answer under the mouse leads to. */}
          {chartOpen
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
