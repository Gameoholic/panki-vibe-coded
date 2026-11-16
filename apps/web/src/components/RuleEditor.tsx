/** @panki One automation's settings, When, its optional limits, Do, its action, opened in place (`RuleEditor`), and an amount typed (`AmountField`). */
import { RULE_TRIGGERS, RULE_TRIGGER_IDS, doWords, newRule, ruleActionsFor, ruleWhenChanged, type AccountActions, type Rule, type RuleActionId } from "@panki/contracts";
import { AMOUNTS, RULE_KNOBS, RULE_LIMITS, RULE_LIMIT_IDS, amountSuffix, knobsOf, type AmountKind, type RuleLimit } from "../ruleKinds";
import { QuietIconButton } from "./AiRun";
import { Button } from "./Button";
import { Dropdown } from "./Dropdown";
import { Icon } from "./Icon";
import { NumberField } from "./NumberField";
import { Setting } from "./Setting";

/**
 * An amount typed in its kind's own way (`AMOUNTS`), kept as its kind keeps it: a limit of an automation's, the
 * account's cap over every one. `counts` is what it's of, after its unit: "a video", "a day".
 */
export function AmountField({ id, label, kind, kept, counts, disabled = false, onChange }: { id: string; label: string; kind: AmountKind; kept: number; counts: string; disabled?: boolean; onChange: (kept: number) => void }) {
  const amount = AMOUNTS[kind];
  const suffix = amountSuffix(amount, counts);
  return (
    <NumberField
      id={id}
      label={label}
      value={amount.shown(kept)}
      min={amount.min}
      max={amount.max}
      step={amount.step}
      decimals={amount.decimals}
      prefix={amount.prefix}
      {...(suffix !== "" ? { suffix } : {})}
      disabled={disabled}
      onChange={(shown) => onChange(amount.kept(shown))}
    />
  );
}

/** A rule's Do changed: the action's starting limits and knobs with it, its When and On kept. */
function withAction(rule: Rule, does: RuleActionId): Rule {
  return { ...newRule(rule.id, rule.when, does), on: rule.on };
}

/** One limit a rule holds, as its row: its amount, and the × that takes it off. */
function LimitRow({ idPrefix, rule, limit, disabled, onChange }: { idPrefix: string; rule: Rule; limit: RuleLimit; disabled: boolean; onChange: (rule: Rule) => void }) {
  const entry = RULE_LIMITS[limit];
  const kept = entry.read(rule);
  if (kept === null) return null;
  const counts = entry.counts(rule);
  const id = `${idPrefix}-${limit}`;
  return (
    <Setting
      id={id}
      label={entry.label}
      control={
        <span className="rule-limit">
          <AmountField id={id} label={`${entry.label}, ${amountSuffix(AMOUNTS[entry.amount], counts)}`} kind={entry.amount} kept={kept} counts={counts} disabled={disabled} onChange={(next) => onChange(entry.write(rule, next))} />
          <QuietIconButton className="rule-limit-off" icon="close" words={entry.off} open={false} disabled={disabled} onClick={() => onChange(entry.write(rule, null))} />
        </span>
      }
    />
  );
}

/**
 * An automation's rows, every choice drawn from the registries: When (`RULE_TRIGGERS`); a row for each limit it holds
 * (Up to, Only after: `RULE_LIMITS`, each optional, taken off by its ×); Do (only the actions the When leads to, opening
 * even with one); a row for each knob its action takes (Action: `RULE_KNOBS`); and, under them, a way to add each limit it
 * could hold and doesn't ("Add a length limit", "Add a wait"). No dollars: the account's one daily cap holds every one.
 * Each change goes up whole; whoever holds the rule keeps it.
 */
export function RuleEditor({ idPrefix, rule, book, disabled = false, onChange }: { idPrefix: string; rule: Rule; book: AccountActions; disabled?: boolean; onChange: (rule: Rule) => void }) {
  const actions = ruleActionsFor(rule.when);
  const addable = RULE_LIMIT_IDS.filter((limit) => RULE_LIMITS[limit].applies(rule) && RULE_LIMITS[limit].read(rule) === null);
  const limitRows = (of: readonly RuleLimit[]) => of.map((limit) => <LimitRow key={limit} idPrefix={idPrefix} rule={rule} limit={limit} disabled={disabled} onChange={onChange} />);
  return (
    <div className="rule-edit">
      <Setting
        id={`${idPrefix}-when`}
        label="When"
        control={
          <Dropdown
            id={`${idPrefix}-when`}
            label="When"
            anchored
            options={RULE_TRIGGER_IDS.map((id) => ({ id, label: RULE_TRIGGERS[id].name }))}
            value={rule.when}
            disabled={disabled}
            onChange={(when) => onChange(ruleWhenChanged(rule, when))}
          />
        }
      />
      {limitRows(RULE_LIMIT_IDS.filter((limit) => RULE_LIMITS[limit].applies(rule)))}
      <Setting
        id={`${idPrefix}-do`}
        label="Do"
        control={
          <Dropdown
            id={`${idPrefix}-do`}
            label="Do"
            anchored
            // Only the actions the When leads to, in the registry's order; it still opens with one.
            options={actions.map((id) => ({ id, label: doWords(rule.when, id) }))}
            value={rule.do}
            disabled={disabled}
            onChange={(does) => onChange(withAction(rule, does))}
          />
        }
      />
      {knobsOf(rule).map((knob) => {
        const entry = RULE_KNOBS[knob];
        const options = entry.options(rule, book);
        return (
          <Setting
            key={knob}
            id={`${idPrefix}-${knob}`}
            label={entry.label}
            control={
              <Dropdown
                id={`${idPrefix}-${knob}`}
                label={entry.label}
                anchored
                options={options.map((o) => ({ id: o.id, label: o.label, ...(o.note ? { note: o.note } : {}) }))}
                value={entry.read(rule, book)}
                disabled={disabled || options.length < 2}
                onChange={(id) => onChange(entry.write(rule, id, book))}
              />
            }
          />
        );
      })}
      {addable.length > 0 ? (
        <div className="add-actions add-actions-start">
          {addable.map((limit) => (
            <Button key={limit} id={`${idPrefix}-add-${limit}`} className="rule-limit-add" disabled={disabled} onClick={() => onChange(RULE_LIMITS[limit].write(rule, RULE_LIMITS[limit].start(rule)))}>
              <Icon name="add" />
              {RULE_LIMITS[limit].add}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
