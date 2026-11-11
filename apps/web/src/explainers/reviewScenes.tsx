/** @panki What Settings → General → Reviews' explainers play, on Panki's own review: Start cards blurred, Time left, Time studying (`BlurScene`, `TimeLeftScene`, `TimeStudyingScene`). */
import { useRef, useState, type RefObject } from "react";
import {
  DEFAULT_FLAG_MARK,
  DEFAULT_REVIEW_SETTINGS,
  DEFAULT_SPARK_MARK,
  DEFAULT_STAGE_TAG,
  DEFAULT_STARTER,
  NEW_PLACE,
  defaultLayout,
  makeStarter,
  type CardField,
  type CardType,
  type SrsType,
} from "@panki/contracts";
import { Stage, type Site, type Tools } from "../components/Explainer";
import { ReviewCard, type CardBlur } from "../components/ReviewCard";
import { ReviewButtons, ReviewCounts } from "../components/ReviewScreen";
import { TimeLeft } from "../components/TimeLeft";
import { TimeStudying } from "../components/TimeStudying";
import { useKeyBinds } from "../keys";
import type { Kind } from "../reviewLine";
import { EXAMPLE_SENTENCE, IN_DECKS } from "./examples";

/**
 * What Settings → General → Reviews' explainers play (`components/Explainer.tsx`): Panki's own review, in the app's
 * own theme on its own ground, filling the picture (`ReviewPage`): the counts' line, a card and the buttons under it,
 * the review's real pieces (`ReviewCounts`, `TimeLeft`, `TimeStudying`, `ReviewCard` with its `BlurButton`,
 * `ReviewButtons`). The cards are made-up ones of the examples' (`examples.ts`), never the account's. The camera leans
 * in on the counts' line only for what it says, and steps back out for what's pressed under the card.
 */

/** Panki in a browser, on its review. */
const PANKI: Site = { tab: "Panki", url: `${location.host}/review`, icon: "panki" };

const WORD = "00000000-0000-4000-8000-0000000000b1";
const SENTENCE = "00000000-0000-4000-8000-0000000000b2";
const MEANING = "00000000-0000-4000-8000-0000000000b3";
/** The made-up card type: the word and its sentence on the front, both marked Blur, the meaning on the back. */
const FIELDS: CardField[] = [
  { id: WORD, name: "Word", kind: "text", side: "front", required: true, tellsApart: false, perExample: false },
  { id: SENTENCE, name: "Sentence", kind: "long", side: "front", required: false, tellsApart: false, perExample: true },
  { id: MEANING, name: "Meaning", kind: "text", side: "back", required: true, tellsApart: false, perExample: false },
];
const TYPE: CardType = {
  id: "00000000-0000-4000-8000-0000000000b0",
  name: "Example card type",
  fields: FIELDS,
  layout: defaultLayout(FIELDS).map((part) => (part.front === "hide" ? part : { ...part, blur: "blur" })),
  tag: DEFAULT_STAGE_TAG,
  spark: DEFAULT_SPARK_MARK,
  flag: DEFAULT_FLAG_MARK,
  examples: null,
  mainField: WORD,
  createdAt: 0,
  deckCount: 1,
};
/** The made-up cards a review goes through, one after another, each a word of the examples' sentence. */
const CARDS: readonly Readonly<Record<string, string>>[] = [
  { [WORD]: IN_DECKS.words, [SENTENCE]: EXAMPLE_SENTENCE, [MEANING]: "coffee shop; café" },
  { [WORD]: "見つける", [SENTENCE]: EXAMPLE_SENTENCE, [MEANING]: "to find; to discover" },
];
/** Where the cards stand, New, on the SRS type Panki starts an account with. */
const SRS: SrsType = { ...makeStarter(DEFAULT_STARTER, () => crypto.randomUUID()), createdAt: 0, builtin: true, deckCount: 1, cardCounts: {} };
/** What's left of the made-up review at its start, a new card on screen, and about how long it takes. */
const TOGO: Record<Kind, number> = { new: 3, again: 0, review: 12 };
const LEFT_MS = 14 * 60_000;
/** About how long one card takes in the made-up review. */
const CARD_MS = 60_000;
/** How long the made-up session has gone on as a scene opens. */
const STUDYING_MS = 12 * 60_000;
const nothing = () => undefined;

/** What the review on the page shows: which card and its side, its blur, the counts, and the time left and studying (null, hidden). */
type Shown = { card: number; revealed: boolean; blur?: CardBlur; togo: Record<Kind, number>; leftMs: number | null; pointed?: boolean; studyingFrom: number | null };

/** Panki's review on the page: the counts' line, the card, the buttons under it. */
function ReviewPage({ page, shown }: { page: RefObject<HTMLDivElement | null>; shown: Shown }) {
  const binds = useKeyBinds();
  return (
    <div ref={page} className="ex-panki">
      <section className="review">
        <div className="review-top">
          <ReviewCounts counts={{ settings: DEFAULT_REVIEW_SETTINGS, togo: shown.togo, now: "new", line: { active: [], waiting: [] } }} />
          {shown.leftMs !== null ? <TimeLeft ms={shown.leftMs} pointed={shown.pointed ?? false} /> : null}
          {shown.studyingFrom !== null ? <TimeStudying from={shown.studyingFrom} /> : null}
        </div>
        <ReviewCard
          key={shown.card}
          type={TYPE}
          values={CARDS[shown.card % CARDS.length] ?? {}}
          srsType={SRS}
          place={NEW_PLACE}
          revealed={shown.revealed}
          {...(shown.blur ? { blur: shown.blur } : {})}
          hint={false}
          keys={false}
        />
        <ReviewButtons srsType={SRS} place={NEW_PLACE} revealed={shown.revealed} binds={binds} busy={false} onShow={nothing} onAnswer={nothing} />
      </section>
    </div>
  );
}

/** Show back of card pressed, then an answer: the next card comes up and what's left goes down. */
async function answerOne(t: Tools, page: RefObject<HTMLDivElement | null>, reveal: () => void, answer: () => void) {
  await t.move(page.current?.querySelector('[data-hold="reveal"]') ?? null, 800);
  await t.click();
  reveal();
  await t.wait(900);
  const answers = [...(page.current?.querySelectorAll(".review-actions [data-answer]") ?? [])];
  await t.move(answers[Math.min(2, answers.length - 1)] ?? null, 700);
  await t.click();
  answer();
}

/**
 * Start cards blurred: each round a card opens blurred and is cleared, by Unblur in its corner, and every other round
 * by Blur's key as this device has it (Unblur again where there's no key). Held still (reduced motion), the card blurred.
 */
export function BlurScene() {
  const page = useRef<HTMLDivElement>(null);
  const round = useRef(0);
  const [blurred, setBlurred] = useState(true);
  const [studyingFrom] = useState(() => Date.now() - STUDYING_MS);
  const bind = useKeyBinds().blur;
  const key = bind.key;

  async function script(t: Tools) {
    const chip = page.current?.querySelector(".review-blur") ?? null;
    const byKey = key !== null && round.current % 2 === 1;
    round.current += 1;
    setBlurred(true);
    if (t.still) return;
    await t.wait(1400);
    if (byKey) {
      await t.move([93, 46], 600);
      t.hold(key);
      setBlurred(false);
      await t.wait(450);
      t.letGo(key);
    } else {
      await t.move(chip, 900);
      await t.click();
      setBlurred(false);
    }
    await t.wait(2200);
  }

  return (
    <Stage site={PANKI} script={script}>
      <ReviewPage page={page} shown={{ card: 0, revealed: false, blur: { blurred, bind, onToggle: nothing }, togo: TOGO, leftMs: LEFT_MS, studyingFrom }} />
    </Stage>
  );
}

/**
 * Time left: the counts' line leaned in on, "~14 min left" pointed at and its finish time on the clock; a card
 * answered, and it's a minute less. Held still, the line with its finish time.
 */
export function TimeLeftScene() {
  const page = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown>({ card: 0, revealed: false, togo: TOGO, leftMs: LEFT_MS, studyingFrom: null });

  async function script(t: Tools) {
    const line = page.current?.querySelector(".review-top") ?? null;
    const words = () => page.current?.querySelector(".time-left") ?? null;
    setShown({ card: 0, revealed: false, togo: TOGO, leftMs: LEFT_MS, studyingFrom: null });
    t.frame(line);
    if (t.still) {
      setShown((s) => ({ ...s, pointed: true }));
      return;
    }
    await t.wait(1300);
    await t.move(words(), 700);
    setShown((s) => ({ ...s, pointed: true }));
    await t.wait(1900);
    setShown((s) => ({ ...s, pointed: false }));
    t.frame();
    await answerOne(
      t,
      page,
      () => setShown((s) => ({ ...s, revealed: true })),
      () => setShown((s) => ({ ...s, card: s.card + 1, revealed: false, togo: { ...s.togo, new: s.togo.new - 1 }, leftMs: (s.leftMs ?? LEFT_MS) - CARD_MS })),
    );
    await t.wait(500);
    t.frame(line);
    await t.wait(2200);
  }

  return (
    <Stage site={PANKI} script={script}>
      <ReviewPage page={page} shown={shown} />
    </Stage>
  );
}

/**
 * Time studying: the counts' line leaned in on, "12 min studying" after the time left, ticking on a minute and another
 * as the review goes on, a card answered between. Held still, the line as it opens.
 */
export function TimeStudyingScene() {
  const page = useRef<HTMLDivElement>(null);
  const opened = () => ({ card: 0, revealed: false, togo: TOGO, leftMs: LEFT_MS, studyingFrom: Date.now() - STUDYING_MS });
  const [shown, setShown] = useState<Shown>(opened);
  const aMinuteOn = (s: Shown): Shown => ({ ...s, studyingFrom: (s.studyingFrom ?? Date.now()) - CARD_MS });

  async function script(t: Tools) {
    const line = page.current?.querySelector(".review-top") ?? null;
    setShown(opened());
    t.frame(line);
    if (t.still) return;
    await t.wait(1600);
    setShown(aMinuteOn);
    await t.wait(1400);
    t.frame();
    await answerOne(
      t,
      page,
      () => setShown((s) => ({ ...s, revealed: true })),
      () => setShown((s) => aMinuteOn({ ...s, card: s.card + 1, revealed: false, togo: { ...s.togo, new: s.togo.new - 1 }, leftMs: (s.leftMs ?? LEFT_MS) - CARD_MS })),
    );
    await t.wait(400);
    t.frame(line);
    await t.wait(2200);
  }

  return (
    <Stage site={PANKI} script={script}>
      <ReviewPage page={page} shown={shown} />
    </Stage>
  );
}
