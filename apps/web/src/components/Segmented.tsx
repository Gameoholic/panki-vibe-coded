import { Button } from "./Button";

type Option<T extends string> = { id: T; label: string };

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
      {options.map((option) => (
        <Button key={option.id} id={`${idPrefix}-${option.id}`} variant="seg" aria-pressed={option.id === value} disabled={disabled} onClick={() => onChange(option.id)}>
          {option.label}
        </Button>
      ))}
    </div>
  );
}
