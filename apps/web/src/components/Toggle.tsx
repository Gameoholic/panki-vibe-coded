import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

type Props = {
  id: string;
  /**
   * What it says in each state, in the owner's words: the words always say what's true right now ("On" / "Off",
   * "Required" / "Optional", "Shown" / "Hidden"), never one label that stays the same when it flips (the owner,
   * 2026-10-15, having had to ask more than once: "checkboxes reflect current state"). Both are asked for, so none can
   * be left out.
   */
  says: { on: string; off: string };
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  /** An icon before its words: what it is beyond on or off (`link`, a switch set elsewhere and shown here). */
  icon?: IconName;
  /** A class for where it stands among other things of a shape (the extension's strip tools), never for a second look of its own. */
  className?: string;
};

/** A setting that's on or off: its words say which it is, and the track shows it at a glance. Never a native checkbox. */
export function Toggle({ id, says, on, onChange, disabled = false, icon, className }: Props) {
  return (
    <Button id={id} variant="switch" className={className} role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}>
      {icon ? <Icon name={icon} /> : null}
      {on ? says.on : says.off}
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </Button>
  );
}
