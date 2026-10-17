import { Fragment, useEffect, useRef, useState } from "react";
import { againPlaceOf, isBurned, isNew, mainAnswers, resolve, type Card, type CardAnswer, type CardType, type Deck, type ReviewSessionEnd, type SrsType } from "@panki/contracts";
import { api } from "../api";
import { Button } from "../components/Button";
import { NumberField } from "../components/NumberField";
import { ReviewCard } from "../components/ReviewCard";
import { shuffle } from "../shuffle";
import { againWords, answerClass, placeName, spanWords } from "../srsKinds";
import { waveOf } from "../waveform";
import { count } from "../words";

type Props = {
  deck: Deck;
  cards: Card[];
  /** The deck's card type: which values show before the flip, and which after. */
  type: CardType;
  /** The deck's SRS type: the answers, and where each sends the card. */
  srsType: SrsType;
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

/** How many answers a card still takes to leave the review, each one the best answer; rules that loop are cut off at `STEPS_MAX`. */
const STEPS_MAX = 9;
function stepsLeft(srsType: SrsType, card: Card, best: string): number {
  let place = card.place;
  for (let steps = 1; steps < STEPS_MAX; steps++) {
    const outcome = resolve(srsType, place, best);
    if (outcome.wait !== 0) return steps;
    place = outcome.place;
  }
  return STEPS_MAX;
}

/** How far on "a few cards later" is, for a card asked again in the same review. */
const AGAIN_SOON = 3;

/** The session's cards, in order: what's due (soonest first) and what's new, as many as today allows, the new ones where the deck's settings put them. */
function buildQueue(cards: Card[], deck: Deck): string[] {
  const { newOrder, newPlace, reviewOrder } = deck.settings;
  const overdue = cards.filter((c) => c.due).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  // The order decides which cards make it under the day's limit, as well as when they show.
  const due = (reviewOrder === "random" ? shuffle(overdue) : overdue).slice(0, deck.dueCount).map((c) => c.id);
  // A new card inside an ask-again has been started: it comes back as due, not as a new card.
  const unseen = cards.filter((c) => isNew(c.place) && c.place.node.length === 0).sort((a, b) => a.createdAt - b.createdAt);
  const fresh = (newOrder === "shuffled" ? shuffle(unseen) : unseen).slice(0, deck.newCount).map((c) => c.id);
  if (newPlace === "first") return [...fresh, ...due];
  if (newPlace === "last") return [...due, ...fresh];
  // Scattered: each new card lands somewhere at random among the reviews, the new ones keeping their own order.
  const spots = fresh.map(() => Math.floor(Math.random() * (due.length + 1))).sort((a, b) => a - b);
  const line = [...due];
  spots.forEach((spot, i) => line.splice(spot + i, 0, fresh[i] ?? ""));
  return line;
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
  const spot = active.length === 0 ? 0 : againPlace === "end" ? active.length : againPlace === "soon" ? Math.min(AGAIN_SOON, active.length) : 1 + Math.floor(Math.random() * active.length);
  active.splice(spot, 0, cardId);
  return { active, waiting: line.waiting };
}

/** Where an answer sends the card, under its name: "Apprentice 3 · 1 d", "again tomorrow", "Burned ✓". */
function answerWords(srsType: SrsType, card: Card, answerId: string): string {
  const r = resolve(srsType, card.place, answerId);
  if (r.burned || r.wait === null) return `${srsType.burnedName} ✓`;
  if (r.again) return `again ${againWords(r.wait)}`;
  return `${placeName(srsType, r.place)} · ${spanWords(r.wait)}`;
}

/** A review of one deck: the cards due and the new ones for today, one at a time; reveal, then answer, and the answer says where the card goes. */
export function ReviewView({ deck, cards, type, srsType, onAnswer, onGoAdd, onHome }: Props) {
  const [byId, setById] = useState(() => new Map(cards.map((c) => [c.id, c])));
  const [line, setLine] = useState(() => startLine(buildQueue(cards, deck), deck.settings.pool));
  /** How many answers this review has taken, a card asked again counting each time. */
  const [answered, setAnswered] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  /** How many more new cards to start once the day's are done, as last set on the end screen; the deck's daily count to begin with. */
  const [extra, setExtra] = useState(deck.settings.newPerDay > 0 ? deck.settings.newPerDay : EXTRA_START);
  const cardId = line.active[0];
  const card = cardId ? byId.get(cardId) : undefined;

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
      });
      setById((m) => new Map(m).set(saved.id, saved));
      setCounts((c) => ({ ...c, [answerId]: (c[answerId] ?? 0) + 1 }));
      // Only a card with no wait at all comes back in this review; anything with a wait is for a later one.
      setLine((l) => advance(l, card.id, outcome.wait === 0, againPlaceOf(deck.settings)));
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
      if (e.key === " " || e.key === "Enter") {
        if (e.target instanceof HTMLButtonElement && e.key === "Enter") return;
        if (revealed) return;
        e.preventDefault();
        reveal();
        return;
      }
      if (e.key === "Escape" && asking) {
        setAsking(null);
        return;
      }
      // The same key again is the yes to an answer that asked first.
      const n = Number(e.key);
      const picked = answers[n - 1];
      if (revealed && picked) {
        e.preventDefault();
        press(picked.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) {
    const now = Date.now();
    const waiting = [...byId.values()].filter((c) => !isNew(c.place) && !isBurned(srsType, c.place) && c.dueAt !== null);
    const rows = COMING_UP.map((row, i) => {
      const from = i === 0 ? -Infinity : (COMING_UP[i - 1]?.days ?? 0);
      return { ...row, n: waiting.filter((c) => (c.dueAt! - now) / DAY_MS > from && (c.dueAt! - now) / DAY_MS <= row.days).length };
    });
    const max = Math.max(1, ...rows.map((r) => r.n));
    const nothing = answered === 0;
    // Past today's count there may be cards never started: the day's limit is a pace, not a wall, so more can be started now.
    const unseen = [...byId.values()].filter((c) => isNew(c.place) && c.place.node.length === 0).sort((a, b) => a.createdAt - b.createdAt);
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
    <section className="review">
      <div className="review-top">
        {/* What's left, by kind: new + asked again + reviews, the kind of the card on screen underlined. */}
        <span className="review-counts" role="status" aria-label={`${togo.new} new, ${togo.again} asked again, ${togo.review} to review`}>
          {KINDS.map((kind, i) => (
            <Fragment key={kind}>
              {i > 0 ? <span className="review-plus">+</span> : null}
              <span className={`review-count is-${kind} ${kindOf(card) === kind ? "is-now" : ""}`.trim()}>{togo[kind]}</span>
            </Fragment>
          ))}
        </span>
        {/* With a limit on how many are in play, say how many that is right now and how many wait their turn. */}
        {line.waiting.length > 0 ? <span>{`${line.active.length} in play · ${line.waiting.length} waiting`}</span> : null}
      </div>
      {/* Each card its own: what was opened or played on the last one doesn't carry over. */}
      <ReviewCard key={card.id} type={type} values={card.values} files={card.files} srsType={srsType} place={card.place} revealed={revealed} onPress={reveal} srcOf={api.mediaUrl} waveOf={waveOf} autoplay />

      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      {revealed && asked ? (
        <div className="panel panel-alarm review-ask">
          <p id="review-question" className="question">
            {asked.name}? This card goes to {answerWords(srsType, card, asked.id)}.
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
              answers.map((a, i) =>
                a.aside ? null : (
                  <Button key={a.id} variant="answer" className={answerClass(answers, i)} data-answer={a.id} disabled={busy} onClick={() => press(a.id)}>
                    <span className="name">{a.name}</span>
                    <span className="to">{answerWords(srsType, card, a.id)}</span>
                    <span className="key">{i + 1}</span>
                  </Button>
                ),
              )
            ) : (
              <Button variant="primary" size="lg" onClick={reveal}>
                Show answer
              </Button>
            )}
          </div>
          {revealed && answers.some((a) => a.aside) ? (
            <div className="review-asides">
              {answers.map((a, i) =>
                a.aside ? (
                  <Button key={a.id} variant="chip" className="review-aside" data-answer={a.id} disabled={busy} onClick={() => press(a.id)}>
                    <span className="name">{a.name}</span>
                    <span className="to">{answerWords(srsType, card, a.id)}</span>
                    <span className="key">{i + 1}</span>
                  </Button>
                ) : null,
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
