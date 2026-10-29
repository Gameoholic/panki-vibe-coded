import type { ReactNode } from "react";

type Props = {
  /** Names the setting for the checks that drive the real UI. */
  id: string;
  /** What it sets, in the owner's words. */
  label: string;
  /** The control that sets it: a `NumberField`, a `Segmented`, a `Toggle`. */
  control: ReactNode;
  /** One line on what it does or when it matters, when the label alone doesn't say: words, or words with a mode's chip in them. */
  why?: ReactNode;
  /** Under the row, the whole of its width: a question its control asks before it changes something (a key taken off). */
  children?: ReactNode;
};

/** One setting as a row: what it is, the control that sets it, and a line of why under them. The Settings tab and a deck's settings are both made of these. */
export function Setting({ id, label, control, why, children }: Props) {
  return (
    <div className="setting" data-setting={id}>
      <div className="setting-head">
        <span className="setting-label">{label}</span>
        {control}
      </div>
      {why ? <p className="setting-why">{why}</p> : null}
      {children}
    </div>
  );
}
