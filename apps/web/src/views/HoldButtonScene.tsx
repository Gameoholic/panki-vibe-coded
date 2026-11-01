import { useState } from "react";
import { CardType, defaultLayout, mainAnswers, makeStarter, type CardPlace } from "@panki/contracts";
import { Button } from "../components/Button";
import { Stage, type Site, type Tools } from "../components/Explainer";
import { ReviewCard } from "../components/ReviewCard";
import { HoldButton } from "../components/ShowButton";
import { TAP_MS } from "../hooks/useHold";
import { holdShares, type HoldButtonView } from "../hooks/useHoldButton";
import type { KeyBinds } from "../keys";
import { answerClass } from "../srsKinds";

/**
 * The Hold button's explainer (Settings → Keybinds, the owner, 2026-11-02): Panki's own review, a card of an example
 * deck held through its stages on the Hold button (its Listen phase ended, its back shown, the answer given and the
 * next card on), then held to its back again and taken back to its start by a double press. Played as this device has
 * it: its key, and each stage's hold. The answer is the type's best, a deck's own being set in that deck.
 */

/**
 * The example deck the picture plays on, made as the window opens (never as Settings loads): its SRS type Wanikani+, as
 * it comes with the app; its card type a word on the front, blurred while listening, and its reading and meaning on the
 * back; two cards, one after the other, on Apprentice 2.
 */
function exampleDeck() {
  const mint = () => crypto.randomUUID();
  const ladder = makeStarter("wanikaniPlus", mint);
  const answers = [...ladder.answers.filter((a) => !a.aside), ...ladder.answers.filter((a) => a.aside)];
  const fields = [
    { id: mint(), name: "Word", kind: "text", side: "front", required: true },
    { id: mint(), name: "Reading", kind: "text", side: "back", required: false },
    { id: mint(), name: "Meaning", kind: "text", side: "back", required: false },
  ] as const;
  const type = CardType.parse({
    id: mint(),
    name: "Vocabulary",
    fields,
    layout: defaultLayout(fields).map((part, i) => (i === 0 ? { ...part, listen: "blur" } : part)),
    listen: { on: true },
    createdAt: 0,
    deckCount: 0,
  });
  const cards = [
    ["喫茶店", "きっさてん", "café; coffee shop"],
    ["図書館", "としょかん", "library"],
  ].map((words) => Object.fromEntries(fields.map((f, i) => [f.id, words[i] ?? ""])));
  const place: CardPlace = { stageId: ladder.stages[1]?.id ?? null, past: 0, node: [], burned: false };
  // What the hold answers with here: the best of the main answers, a deck's own being set in that deck.
  return { ladder, answers, gives: mainAnswers(answers).at(-1), type, cards, place };
}
const SITE: Site = { tab: "Review · Panki", url: `${location.host}/review`, icon: "panki" };
/** How many reviews the example deck has left as it starts. */
const REVIEWS = 12;

type Phase = "listen" | "front" | "back";

export function HoldButtonScene({ binds }: { binds: KeyBinds }) {
  const [{ ladder, answers, gives, type, cards, place }] = useState(exampleDeck);
  const [card, setCard] = useState(0);
  const [phase, setPhase] = useState<Phase>("listen");
  /** How far round the clock is, 0 to 1. */
  const [round, setRound] = useState(0);
  const chain = binds.holdChain;
  const key = binds.holdButton.key;
  const ms = [chain.listenMs, chain.backMs, chain.answerMs + (gives?.confirm ? binds.confirmMs : 0)];
  const { cuts } = holdShares(ms, 0);
  const ends = ms.map((_, i) => holdShares(ms, i + 1).from);
  const at = phase === "listen" ? 0 : phase === "front" ? 1 : 2;

  const view: HoldButtonView = {
    label: ["Done listening", "Show back of card", gives?.name ?? "Hide back of card"][at] ?? "",
    icon: phase === "listen" ? "check" : phase === "front" ? "eye" : undefined,
    bind: binds.holdButton,
    from: round,
    span: 0,
    cuts,
    onPointerDown: () => undefined,
    onPointerUp: () => undefined,
    onPointerCancel: () => undefined,
    onClick: () => undefined,
    onContextMenu: () => undefined,
  };

  /** The clock filled from one share to another over a stage's hold, as `useHold` fills it. */
  async function fill(t: Tools, from: number, to: number, hold: number) {
    if (t.still || hold <= 0) {
      setRound(to);
      await t.wait(hold);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / hold);
      setRound(from + (to - from) * k);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    try {
      await t.wait(hold);
    } finally {
      cancelAnimationFrame(frame);
    }
    setRound(to);
  }
  const button = () => document.querySelector(".explain-hold [data-hold='chain']");
  /** The key held down, or the pointer on the button when the Hold button has no key. */
  async function press(t: Tools) {
    if (key) t.hold(key);
    else await t.move(button(), 400);
    await t.wait(TAP_MS);
  }

  const script = async (t: Tools) => {
    setCard(0);
    setPhase("listen");
    setRound(0);
    await t.move(button(), 600);
    // Held through every stage: the card shown, its back, the answer, and the next card on.
    await press(t);
    await fill(t, 0, ends[0] ?? 0, ms[0] ?? 0);
    setPhase("front");
    await fill(t, ends[0] ?? 0, ends[1] ?? 0, ms[1] ?? 0);
    setPhase("back");
    if (gives) {
      await fill(t, ends[1] ?? 0, 1, ms[2] ?? 0);
      setCard(1);
      setPhase("listen");
      setRound(0);
    }
    await t.wait(500);
    if (key) t.letGo(key);
    await t.wait(700);
    // Held again, let go on the back, and taken back to its start: a double press of its key, or a tap of the button.
    await press(t);
    await fill(t, 0, ends[0] ?? 0, ms[0] ?? 0);
    setPhase("front");
    await fill(t, ends[0] ?? 0, ends[1] ?? 0, ms[1] ?? 0);
    setPhase("back");
    if (key) t.letGo(key);
    await t.wait(1100);
    if (key) {
      for (let i = 0; i < 2; i++) {
        t.hold(key);
        await t.wait(110);
        t.letGo(key);
        await t.wait(110);
      }
    } else await t.click();
    setPhase("listen");
    setRound(0);
    await t.wait(1200);
  };

  return (
    <Stage site={SITE} script={script}>
      <div className="explain-panki">
        <section className="review explain-hold">
          <div className="review-top">
            <span className="review-counts">
              <span className="review-count is-review is-now">
                <span className="review-n">{REVIEWS - card}</span> reviews
              </span>
            </span>
            {/* On the back it stands where Hide back of card would, as in a review. */}
            {phase === "back" ? (
              <span className="review-tools">
                <HoldButton view={view} className="review-hide" />
              </span>
            ) : null}
          </div>
          <ReviewCard key={card} type={type} values={cards[card] ?? {}} srsType={ladder} place={place} revealed={phase === "back"} listening={phase === "listen"} hint={false} keys={false} />
          <div className="review-actions">
            {phase === "back" ? (
              answers.map((a, i) =>
                a.aside ? null : (
                  <Button key={a.id} variant="answer" className={answerClass(answers, i)}>
                    <span className="name">{a.name}</span>
                  </Button>
                ),
              )
            ) : (
              <HoldButton view={view} variant="primary" size="lg" />
            )}
          </div>
        </section>
      </div>
    </Stage>
  );
}
