import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

type Option<T extends string> = {
  id: T;
  label: string;
  /**
   * What its cell holds in place of the label while it's the one on: a control of its own, like a far move's stages
   * typed in the ↑ X it is (the owner, 2026-10-26: "make it inline in the ↑3"). The cell is then no button, since a
   * control can't sit in one; it's pressed to be picked like any other until it's on.
   */
  lit?: ReactNode;
  /** Drawn before its label: tabs carry their icon, as every action does (the owner, 2026-10-29). */
  icon?: IconName;
};

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (id: T) => void;
  /** What the choice is, for a screen reader. */
  label: string;
  /** Each cell gets `${idPrefix}-${id}`. */
  idPrefix: string;
  /** `sm` is the compact one that fits inside a box on the rules chart or a menu. */
  size?: "md" | "sm";
  /** Shown but not changeable, when something else decides it or it doesn't apply right now. */
  disabled?: boolean;
};

/** A few choices side by side, one of them on: the tabs inside a deck, and the settings that are a pick from a short list. */
export function Segmented<T extends string>({ options, value, onChange, label, idPrefix, size = "md", disabled = false }: Props<T>) {
  return (
    <div className={`segmented ${size === "sm" ? "segmented-sm" : ""} ${disabled ? "is-disabled" : ""}`.trim()} role="group" aria-label={label}>
      {options.map((option) =>
        option.id === value && option.lit !== undefined ? (
          <span key={option.id} id={`${idPrefix}-${option.id}`} className="btn btn-seg is-lit">
            {option.lit}
          </span>
        ) : (
          <Button key={option.id} id={`${idPrefix}-${option.id}`} variant="seg" aria-pressed={option.id === value} disabled={disabled} onClick={() => onChange(option.id)}>
            {option.icon ? <Icon name={option.icon} /> : null}
            {option.label}
          </Button>
        ),
      )}
    </div>
  );
}
