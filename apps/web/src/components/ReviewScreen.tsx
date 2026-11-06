import { useLayoutEffect, type ReactNode, type RefObject } from "react";
import { branchAt, flowOf, isNew, offered, resolve, stageIndex, type CardPlace, type Deck, type HoldKind, type SrsType, type Step } from "@panki/contracts";
import type { HoldButtonView } from "../hooks/useHoldButton";
import { ScreenStageContext, type Stage } from "../hooks/useScreenStage";
import type { KeyBinds } from "../keys";
import { countOrder, type Kind, type Line } from "../reviewLine";
import { HOLD_KINDS, NEW_WORDS, againWords, answerClass, backWords, holdBack, isHold, placeName } from "../srsKinds";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { KeyCap } from "./KeyCap";
import { HoldButton, ShowButton } from "./ShowButton";

/**
 * The review's screen, the one drawing of it: the counts over the card with Undo and Chart at their right (Hide back of
 * card before them while the back shows), the card, the Hold button's row, the buttons under the card, and the
 * card's chart hanging under all of it; filling the screen, the stage (`useScreenStage`). The review runs it, and a
 * card type's Layout tab draws its card in it, so what's laid out is what a review shows.
 */

/**
 * Where an answer sends the card, under its name: which way it goes (so it's clear whether it moves up or down), by
 * how many stages, and the words, "Apprentice 3 · 1 d", "again
 * tomorrow", "Burned", or when a card put aside comes back, "back in 24 hours".
 */
type Lead = { dir: "up" | "down" | "same" | "again" | "burn" | HoldKind; steps: number; words: string };
/** The rule an answer follows for a card where it stands. */
export function stepFor(srsType: SrsType, place: CardPlace, answerId: string): Step | undefined {
  return branchAt(flowOf(srsType, stageIndex(srsType, place)), place.node)[answerId];
}
export function answerLead(srsType: SrsType, place: CardPlace, answerId: string): Lead {
  const step = stepFor(srsType, place, answerId);
  if (isHold(step)) return { dir: step.kind, steps: 0, words: holdBack(step) };
  const r = resolve(srsType, place, answerId);
  const by = stageIndex(srsType, r.place) - stageIndex(srsType, place);
  // New again there's no wait to say: it waits for a day's new cards.
  if (!r.burned && isNew(r.place) && !r.again) return { dir: by < 0 ? "down" : "same", steps: Math.abs(by), words: NEW_WORDS.name };
  if (r.burned || r.wait === null) return { dir: "burn", steps: 0, words: srsType.burnedName };
  if (r.again) return { dir: "again", steps: 0, words: `again ${againWords(r.wait)}` };
  return { dir: by > 0 ? "up" : by < 0 ? "down" : "same", steps: Math.abs(by), words: `${placeName(srsType, r.place)} · ${backWords(r.wait)}` };
}

/** The mark for each way a card can go: a chevron a stage up or down, one arrow going round when it's asked again, a check when it's burned, a dash when it stays, and a card put aside its own. */
const LEAD_ICON: Record<Lead["dir"], IconName> = { up: "up", down: "down", again: "again", burn: "check", same: "minus", bury: HOLD_KINDS.bury.icon, suspend: HOLD_KINDS.suspend.icon };
/** Chevrons drawn one a stage up to this many; past it, the count is written after them. */
const CHEVRONS_MAX = 2;

/**
 * The lead under an answer's name: its mark, then the words, all in the line's own colour, so it reads the same on a
 * plain answer and on the filled one (a coloured pill would look out of place, a green box on the blue Ok).
 */
function LeadView({ lead }: { lead: Lead }) {
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

/** Each kind as its count says it: "2 new", "0 again", "9 reviews". */
const KIND_WORDS: Record<Kind, (n: number) => string> = {
  new: () => "new",
  again: () => "again",
  review: (n) => (n === 1 ? "review" : "reviews"),
};

/**
 * What's left of a review, by kind, each count with its word ("2 + 0 + 9" says nothing), in the order they come, the
 * kind of the card on screen underlined; with a limit on how many are in play, how many that is and how many wait.
 * With no deck (`counts` null) the line holds its room with nothing in it.
 */
export function ReviewCounts({ counts }: { counts: { settings: Deck["settings"]; togo: Record<Kind, number>; now: Kind | null; line: Line } | null }) {
  if (counts === null) {
    // A count's own room, with nothing in it: the line stands as tall as it does with its counts.
    return (
      <span className="review-counts" aria-hidden="true">
        <span className="review-count">
          <span className="review-n">{" "}</span>
        </span>
      </span>
    );
  }
  const { settings, togo, now, line } = counts;
  return (
    <>
      <span className="review-counts" role="status">
        {countOrder(settings).map((kind) => (
          <span key={kind} className={`review-count is-${kind} ${now === kind ? "is-now" : ""}`.trim()}>
            <span className="review-n">{togo[kind]}</span> {KIND_WORDS[kind](togo[kind])}
          </span>
        ))}
      </span>
      {line.waiting.length > 0 ? <span>{`${line.active.length} in play · ${line.waiting.length} waiting`}</span> : null}
    </>
  );
}

/**
 * The buttons under the card: on its back the answers (the main ones in a row, the ones set apart under them), each
 * its name, where it sends the card and its key; otherwise Done listening or Show back of card. The answers set apart
 * hold their room on the front, unseen, as the back's parts do: turning the card moves nothing. Without `onAnswer` the
 * answers stand greyed (a card looked at as a review shows it, which gives no answer).
 */
export function ReviewButtons({ srsType, place, revealed, listening, binds, busy, onShow, onAnswer, onRest, onLeave }: {
  srsType: SrsType;
  place: CardPlace;
  revealed: boolean;
  listening: boolean;
  binds: KeyBinds;
  busy: boolean;
  onShow: () => void;
  onAnswer?: (answerId: string) => void;
  /** The mouse on an answer, and off it: its box on the chart lights up. */
  onRest?: (answerId: string) => void;
  onLeave?: () => void;
}) {
  // The main answers first, then the ones set apart: that's the order of the number keys too.
  const answers = [...srsType.answers.filter((a) => !a.aside), ...srsType.answers.filter((a) => a.aside)];
  const off = busy || onAnswer === undefined;
  return (
    <>
      <div className="review-actions">
        {revealed ? (
          // An answer the chart doesn't offer at this point (its rule here is "Not offered") has no button; the others keep their keys.
          answers.map((a, i) =>
            a.aside || !offered(srsType, place, a.id) ? null : (
              <Button
                key={a.id}
                variant="answer"
                className={answerClass(answers, i)}
                data-answer={a.id}
                disabled={off}
                onClick={() => onAnswer?.(a.id)}
                onMouseEnter={() => onRest?.(a.id)}
                onMouseLeave={onLeave}
              >
                <span className="name">{a.name}</span>
                <LeadView lead={answerLead(srsType, place, a.id)} />
                <KeyCap bind={binds.answers[i]} extra={a.confirm ? binds.confirmMs : 0} />
              </Button>
            ),
          )
        ) : (
          // Listened to, Done listening stands in Show back of card's place, with its key: the card's front, out of its Listen phase.
          <ShowButton listening={listening} bind={listening ? binds.showCard : binds.reveal} onPress={onShow} />
        )}
      </div>
      {answers.some((a) => a.aside && offered(srsType, place, a.id)) ? (
        <div className={revealed ? "review-asides" : "review-asides is-later"} aria-hidden={!revealed}>
          {answers.map((a, i) =>
            a.aside && offered(srsType, place, a.id) ? (
              <Button key={a.id} variant="chip" className="review-aside" data-answer={a.id} disabled={off || !revealed} onClick={() => onAnswer?.(a.id)} onMouseEnter={() => onRest?.(a.id)} onMouseLeave={onLeave}>
                <span className="name">{a.name}</span>
                <LeadView lead={answerLead(srsType, place, a.id)} />
                <KeyCap bind={binds.answers[i]} extra={a.confirm ? binds.confirmMs : 0} />
              </Button>
            ) : null,
          )}
        </div>
      ) : null}
    </>
  );
}

/** Carried by the card's clip that takes the screen's room while the review fills the screen (`app.css` → `.review.is-stage`). */
const STAGED = "data-staged";

type Props = {
  /** The review's own element: what fills the screen, and where its keys find the buttons they hold. */
  place: RefObject<HTMLElement | null>;
  stage: Stage;
  /** The counts' line (`ReviewCounts`). */
  counts: ReactNode;
  revealed: boolean;
  busy: boolean;
  binds: KeyBinds;
  /** Hide back of card: the card back to its front. */
  onHide: () => void;
  /** Takes the last answer back; left out, Undo stands greyed. */
  onUndo?: () => void;
  canUndo: boolean;
  /** The card's chart under the review, on or off; without `onToggle` the Chart button stands greyed. */
  chart: { open: boolean; onToggle?: () => void };
  /** The card (`ReviewCard`), filling the screen by the stage. */
  card: ReactNode;
  /** The fields whose clip the full screen fills the screen with, the one to try first first (`stagedOrder`, the card type's layout). */
  staging: readonly string[];
  failure: string | null;
  /** The Hold button, while it's on: under the card on both its sides. */
  hold: HoldButtonView | null;
  /** The buttons under the card (`ReviewButtons`). */
  buttons: ReactNode;
  /** A question asked in the buttons' place (an answer that requires confirmation): the buttons, the phone's tools and the chart give way to it. */
  ask?: ReactNode;
  /** The card's chart while it's open. */
  chartView?: ReactNode;
  /** Anything else standing in the review's own element, so it fills the screen with it: the Layout tab's panel. */
  children?: ReactNode;
};

/** The review's screen around its card: one drawing, the review's and the Layout tab's. */
export function ReviewScreen({ place, stage, counts, revealed, busy, binds, onHide, onUndo, canUndo, chart, card, staging, failure, hold, buttons, ask = null, chartView = null, children }: Props) {
  // The clip that takes the screen's room while it's filled, marked for the stage's styles: of the fields the layout
  // names, the first whose part holds a clip in the Player look there to see (not a sound, not under a spoiler).
  useLayoutEffect(() => {
    const root = place.current;
    if (!root) return;
    const clipOf = (fieldId: string) => {
      const clip = root.querySelector<HTMLElement>(`.review-card [data-part="${fieldId}"] .media-player.media-video`);
      return clip && clip.closest(".btn-spoiler") === null ? clip : null;
    };
    const staged = staging.map(clipOf).find((clip) => clip !== null) ?? null;
    for (const clip of root.querySelectorAll<HTMLElement>(".review-card .media-player.media-video")) clip.toggleAttribute(STAGED, clip === staged);
  });
  const undo = () => onUndo?.();
  // Filling the screen, the review is the stage (`.is-stage`), its clip at the left and the rest in a rail, and not the page's fitted layout.
  const full = stage.screen.full;
  const look = full ? "is-stage" : "is-fit";
  // Undo and Chart: in the counts' row on a computer, under the answers on a phone, the CSS showing one of the two.
  // Pinned over the counts' row, they would cover "in play · waiting".
  const tools = (
    <>
      {/* While the answer shows: the card back to its front, its key's hold drawn on it. */}
      {revealed ? (
        <Button className="review-hide" data-hold="hide" disabled={busy} onClick={onHide}>
          <Icon name="eyeOff" />
          Hide back of card
          <KeyCap bind={binds.hide} />
        </Button>
      ) : null}
      <Button className="review-undo" data-hold="undo" disabled={busy || !canUndo || onUndo === undefined} onClick={undo}>
        <Icon name="undo" />
        Undo
        <KeyCap bind={binds.undo} />
      </Button>
      <Button className="review-chart-toggle" aria-pressed={chart.open} disabled={chart.onToggle === undefined} onClick={chart.onToggle}>
        <Icon name="srs" />
        Chart
      </Button>
    </>
  );
  return (
    <section ref={place} className={`review ${look}`.trim()}>
      <div className="review-top">
        {counts}
        {!full ? <span className="review-tools">{tools}</span> : null}
        {/* Filling the screen: Hide back of card, Undo, Chart, and the way out. */}
        {full ? (
          <span className="review-stage-tools">
            {/* Its key beside it, as the Undo outside full screen has it. */}
            {revealed ? (
              <Button className="btn-icon review-stage-hide" aria-label="Hide back of card" data-hold="hide" disabled={busy} onClick={onHide}>
                <Icon name="eyeOff" />
                <KeyCap bind={binds.hide} />
              </Button>
            ) : null}
            <Button className="btn-icon review-stage-undo" aria-label="Undo" data-hold="undo" disabled={busy || !canUndo || onUndo === undefined} onClick={undo}>
              <Icon name="undo" />
              <KeyCap bind={binds.undo} />
            </Button>
            {/* The card's chart, the same on or off as on the page; open, it stands under the answers in the rail. */}
            <Button className="btn-icon" aria-label="Chart" aria-pressed={chart.open} disabled={chart.onToggle === undefined} onClick={chart.onToggle}>
              <Icon name="srs" />
            </Button>
            <Button className="btn-icon" aria-label="Leave full screen" onClick={stage.screen.toggle}>
              <Icon name="unfull" />
            </Button>
          </span>
        ) : null}
      </div>
      {/* Its clip fills the screen with the whole review (`useScreenStage`). */}
      <ScreenStageContext.Provider value={stage.screen}>{card}</ScreenStageContext.Provider>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      {/* The Hold button, while it's on: under the card on both its sides, beside the review's own buttons and their keys. */}
      {hold ? (
        <div className="review-hold">
          <HoldButton view={hold} />
        </div>
      ) : null}
      {ask ?? (
        <>
          {buttons}
          {/* Under the answers on a phone: Undo, and the card's chart, on or off, kept on this device. Not while the review fills the screen, whose top row has Undo. */}
          {full ? null : <div className="review-chart-row">{tools}</div>}
          {/* The card's chart while it's open: under the review on the page, under the answers in the rail. */}
          {chart.open ? chartView : null}
        </>
      )}
      {children}
    </section>
  );
}
