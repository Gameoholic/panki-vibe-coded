/** @panki What Settings → General → Reviews' Start cards blurred plays: a card opening blurred, then Unblur or Blur's key clearing it (`BlurScene`). */
import { useRef, useState } from "react";
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
} from "@panki/contracts";
import { Stage, type Site, type Tools } from "../components/Explainer";
import { ReviewCard } from "../components/ReviewCard";
import { ReviewCounts } from "../components/ReviewScreen";
import { ShowButton } from "../components/ShowButton";
import { useKeyBinds } from "../keys";
import { EXAMPLE_SENTENCE, IN_DECKS } from "./examples";

/**
 * What Start cards blurred plays (`components/Explainer.tsx`): Panki's own review, in the app's own theme, filling the
 * picture: its counts, a card and Show back of card, the review's real pieces (`ReviewCounts`, `ReviewCard` with its
 * `BlurButton`, `ShowButton`). The card is a made-up one of the examples' (`examples.ts`), never one of the account's.
 * Each round a card opens blurred and is cleared: by Unblur in its corner, and every other round by Blur's key as this
 * device has it (Unblur again where there's no key). Held still (reduced motion), it's the card blurred.
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
const VALUES: Readonly<Record<string, string>> = { [WORD]: IN_DECKS.words, [SENTENCE]: EXAMPLE_SENTENCE, [MEANING]: "coffee shop; café" };
/** Where the card stands: New, on the SRS type Panki starts an account with. */
const SRS = makeStarter(DEFAULT_STARTER, () => crypto.randomUUID());
/** The review's counts as a made-up review has them, a new card on screen. */
const COUNTS = { settings: DEFAULT_REVIEW_SETTINGS, togo: { new: 3, again: 0, review: 12 }, now: "new" as const, line: { active: [], waiting: [] }, leftMs: 14 * 60_000 };
/** How long the made-up session has gone on. */
const STUDYING_MS = 6 * 60_000;

/** Where the pointer waits while a key does the work: on the ground beside the card. */
const ASIDE = [93, 46] as const;

export function BlurScene() {
  const page = useRef<HTMLDivElement>(null);
  const round = useRef(0);
  const [blurred, setBlurred] = useState(true);
  const [studyingFrom] = useState(() => Date.now() - STUDYING_MS);
  const binds = useKeyBinds();
  const key = binds.blur.key;
  const nothing = () => undefined;

  async function script(t: Tools) {
    const chip = page.current?.querySelector(".review-blur") ?? null;
    const byKey = key !== null && round.current % 2 === 1;
    round.current += 1;
    setBlurred(true);
    if (t.still) return;
    await t.wait(1400);
    if (byKey) {
      await t.move(ASIDE, 600);
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
      <div ref={page} className="ex-panki">
        <section className="review">
          <div className="review-top">
            <ReviewCounts counts={{ ...COUNTS, studyingFrom }} />
          </div>
          <ReviewCard
            type={TYPE}
            values={VALUES}
            srsType={SRS}
            place={NEW_PLACE}
            revealed={false}
            blur={{ blurred, bind: binds.blur, onToggle: nothing }}
            hint={false}
            keys={false}
          />
          <div className="review-actions">
            <ShowButton bind={binds.reveal} onPress={nothing} />
          </div>
        </section>
      </div>
    </Stage>
  );
}
