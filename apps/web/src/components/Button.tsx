import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * `row` is a full-width list row you can press, like a deck in the list.
   * `tab` is one of the fixed places in the bar (Home, Settings); lit by `aria-current="page"`.
   * `door` is a big tile on the home screen; `className="is-hot"` makes it the accent one.
   * `chip` is one choice in a short row of them, like the deck on the Add screen; lit by `aria-pressed`.
   * `seg` is one cell of a `Segmented` control; lit by `aria-pressed`.
   * `switch` is an on/off setting with its label and a track, drawn by `Toggle`; lit by `aria-checked`.
   * `item` is one row of a menu anchored to what opened it (a box on the rules chart); lit by `aria-pressed`.
   * `node` is a box on the rules chart (`FlowCanvas`): a title and a line under it, lit by `aria-pressed` when picked.
   * `answer` is one of the answers under the review card: its name, where the card goes, its key.
   * `danger` is the filled button that confirms something that hurts; a `ghost` with `className="is-danger"` is the one that opens the question.
   * `spoiler` is a part of a review card hidden under a plain block of its shape, pressed to see it, as Discord hides a message.
   */
  variant?: "primary" | "ghost" | "row" | "tab" | "door" | "chip" | "seg" | "switch" | "item" | "node" | "answer" | "danger" | "spoiler";
  size?: "md" | "lg";
};

/** Every button in the app goes through here, so none renders as the browser's default. */
export function Button({ variant = "ghost", size = "md", className = "", type = "button", ...rest }: Props) {
  return <button type={type} className={`btn btn-${variant} btn-${size} ${className}`.trim()} {...rest} />;
}
