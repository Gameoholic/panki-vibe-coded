/** @panki What Settings → General → Reviews' Start cards blurred plays: a card opening blurred, Unblur, and Blur's key (`BlurScene`). */
import { useRef, useState } from "react";
import { DEFAULT_FLAG_MARK, DEFAULT_SPARK_MARK, DEFAULT_STAGE_TAG, DEFAULT_STARTER, NEW_PLACE, defaultLayout, makeStarter, type CardField, type CardType } from "@panki/contracts";
import { Stage, type Site, type Tools } from "../components/Explainer";
import { ReviewCard } from "../components/ReviewCard";
import { ShowButton } from "../components/ShowButton";
import { useKeyBinds } from "../keys";
import { EXAMPLE_SENTENCE, IN_DECKS } from "./examples";

/**
 * What Start cards blurred plays (`components/Explainer.tsx`): a review in Panki, its card a made-up one of the examples'
 * (`examples.ts`), drawn by the review's own pieces (`ReviewCard`, its `BlurButton`, `ShowButton`). It opens blurred,
 * the pointer presses Unblur and the front clears, then Blur's key blurs it again, as this device has the key; with no
 * key, Blur in the corner does. Never one of the account's own cards or card types.
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

/** Where the pointer rests while a key does the work, clear of the card's corner. */
const ASIDE = [86, 86] as const;

export function BlurScene() {
  const page = useRef<HTMLDivElement>(null);
  const [blurred, setBlurred] = useState(true);
  const binds = useKeyBinds();
  const key = binds.blur.key;
  const nothing = () => undefined;

  async function script(t: Tools) {
    const card = page.current?.querySelector(".review-card") ?? null;
    const chip = () => page.current?.querySelector(".review-blur") ?? null;
    setBlurred(true);
    await t.wait(1100);
    t.frame(card);
    await t.move(chip(), 800);
    await t.click();
    setBlurred(false);
    await t.wait(2000);
    if (key) {
      await t.move(ASIDE, 600);
      t.hold(key);
      setBlurred(true);
      await t.wait(450);
      t.letGo(key);
    } else {
      await t.click();
      setBlurred(true);
    }
    await t.wait(1800);
    t.frame();
    await t.wait(900);
  }

  return (
    <Stage site={PANKI} script={script}>
      <div ref={page} className="ex-review">
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
      </div>
    </Stage>
  );
}
