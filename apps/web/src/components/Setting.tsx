/** @panki One setting as a row: its label, its control, a `why` line only where needed, an `explain` scene, the `perDevice` tag (`Setting`). */
import { useState, type ReactNode } from "react";
import { Explainer } from "./Explainer";
import { HintMark } from "./HintMark";
import { PerDevice } from "./PerDevice";

type Props = {
  /** Names the setting for the checks that drive the real UI. */
  id: string;
  /** What it sets, in plain words. */
  label: string;
  /** The control that sets it: a `NumberField`, a `Segmented`, a `Toggle`. */
  control: ReactNode;
  /** One line on what it does or when it matters, when the label alone doesn't say: words, or words with a mode's chip in them. */
  why?: ReactNode;
  /**
   * A (?) after the label, only where a number needs explaining (Each run's): its words in a hint bubble when pointed at,
   * under the row when pressed (`HintMark`). `about` names it for a screen reader.
   */
  hint?: { about: string; words: ReactNode };
  /**
   * A (?) after the label that plays what the setting does, where words alone wouldn't show it (`Explainer`): `name`, the
   * feature's, for a screen reader; `scene`, what plays.
   */
  explain?: { name: string; scene: ReactNode };
  /** Under the row, the whole of its width: a question its control asks before it changes something (a key taken off). */
  children?: ReactNode;
  /** Kept on this device alone: "This device" beside its label (`PerDevice`). */
  perDevice?: boolean;
};

/** One setting as a row: what it is, the control that sets it, and a line of why under them. The Settings tab and a deck's settings are both made of these. */
export function Setting({ id, label, control, why, hint, explain, children, perDevice = false }: Props) {
  const [hinted, setHinted] = useState(false);
  return (
    <div className={`setting ${explain ? "is-explained" : ""}`.trim()} data-setting={id}>
      <div className="setting-head">
        <span className="setting-label">
          {label}
          {hint ? <HintMark about={hint.about} words={hint.words} pressed={hinted} onPress={() => setHinted(!hinted)} /> : null}
          {explain ? <Explainer name={explain.name}>{explain.scene}</Explainer> : null}
          {perDevice ? <PerDevice /> : null}
        </span>
        {control}
      </div>
      {why ? <p className="setting-why">{why}</p> : null}
      {hint && hinted ? <p className="setting-why hint-words">{hint.words}</p> : null}
      {children}
    </div>
  );
}
