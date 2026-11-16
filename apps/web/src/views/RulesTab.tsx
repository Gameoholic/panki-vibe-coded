/** @panki Settings → Automations: Max spend for automations a day over them all, today's spend, the account's as a flow (`RulesTab`). */
import { useEffect, useState } from "react";
import { RULES_MAX, RULE_TRIGGER_IDS, newRule, ruleProblem, type AccountActions, type Rule, type RulesStandingResponse, type RuleTriggerId } from "@panki/contracts";
import { ApiError, api } from "../api";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { AmountField } from "../components/RuleEditor";
import { RuleFlow } from "../components/RuleFlow";
import { Setting } from "../components/Setting";
import { Bone } from "../components/Skeleton";
import { estimateWords } from "../words";

type Props = {
  /** The tab is the one shown: how the automations stand is read as it opens. */
  open: boolean;
  /** The automations and the cap over them as on screen, with what's still on its way to Panki. */
  rules: Rule[];
  dayMicros: number;
  /** The automations as Panki last kept them: each save that lands has how they stand read again. */
  kept: Rule[];
  /** Panki AI's actions as the account has them, which the Card drawer's and the Word pop-up's automations ask for. */
  book: AccountActions;
  /** What went wrong with the last save of the account's settings. */
  failure: string | null;
  /** The account's automations, the whole list as it stands, saved a moment later as every setting is. */
  onRules: (rules: Rule[]) => void;
  onDayMicros: (micros: number) => void;
};

const said = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong.");

/**
 * Settings → Automations: at its head, Max spend for automations, an amount a day, and what every one spent today
 * under it. Then the account's automations as a flow (`RuleFlow`), their lines tinted by today's runs; a trigger's port
 * or New automation starts one in place. A change that fails `ruleProblem` is held on screen, never sent, its words in
 * its node.
 */
export function RulesTab({ open, rules, dayMicros, kept, book, failure, onRules, onDayMicros }: Props) {
  const [standing, setStanding] = useState<RulesStandingResponse | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  /** An automation changed into one that can't be kept, by id: shown in its node and its editor, never sent. */
  const [unsent, setUnsent] = useState<Readonly<Record<string, Rule>>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Rule | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api.rulesStanding().then(
      (now) => {
        if (!alive) return;
        setStanding(now);
        setLoadFailure(null);
      },
      (e: unknown) => {
        if (alive) setLoadFailure(said(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [open, kept]);

  /** An automation changed: kept when it can be, held on screen when it can't. */
  function change(next: Rule) {
    const rest = Object.fromEntries(Object.entries(unsent).filter(([id]) => id !== next.id));
    if (ruleProblem(next) !== null) {
      setUnsent({ ...rest, [next.id]: next });
      return;
    }
    setUnsent(rest);
    onRules(rules.map((rule) => (rule.id === next.id ? next : rule)));
  }
  function remove(id: string) {
    setUnsent(Object.fromEntries(Object.entries(unsent).filter(([was]) => was !== id)));
    setOpenId(null);
    onRules(rules.filter((rule) => rule.id !== id));
  }
  function startDraft(when: RuleTriggerId) {
    const fresh = newRule(crypto.randomUUID(), when);
    setDraft(fresh);
    setOpenId(fresh.id);
  }
  function create() {
    if (!draft || ruleProblem(draft) !== null) return;
    onRules([...rules, draft]);
    setDraft(null);
    setOpenId(null);
  }

  const loading = standing === null && loadFailure === null;
  const runsOf = (rule: Rule) => standing?.standing.find((s) => s.ruleId === rule.id)?.todayRuns ?? 0;
  const shownRules = rules.map((rule) => unsent[rule.id] ?? rule);
  return (
    <>
      {failure ? (
        <p className="load-error" role="alert">
          {failure}
        </p>
      ) : null}
      <section className="panel" aria-label="Max spend for automations">
        <Setting
          id="rulesDayMicros"
          label="Max spend for automations"
          control={<AmountField id="rules-day" label="Max spend for automations, a day" kind="dollars" kept={dayMicros} counts="a day" onChange={onDayMicros} />}
        />
        {/* Today's spend, under the cap it's held to. */}
        {standing ? (
          <p className="rules-spent">{estimateWords(standing.todayMicros)} today</p>
        ) : loading ? (
          <p className="rules-spent skel-line">
            <Bone w="8em" h="0.9em" />
          </p>
        ) : null}
      </section>
      {loadFailure ? (
        <p className="load-error" role="alert">
          {loadFailure}
        </p>
      ) : null}
      {shownRules.length > 0 || draft ? (
        <RuleFlow
          rules={shownRules}
          draft={draft}
          openId={openId}
          book={book}
          runsOf={runsOf}
          onOpen={setOpenId}
          onChange={change}
          onDelete={remove}
          onStartDraft={startDraft}
          onDraft={setDraft}
          onCreate={create}
          onCancelDraft={() => {
            setDraft(null);
            setOpenId(null);
          }}
        />
      ) : (
        <p className="empty">No automations yet.</p>
      )}
      {draft ? null : (
        <div className="add-actions add-actions-start">
          <Button id="rules-new" disabled={rules.length >= RULES_MAX} onClick={() => startDraft(RULE_TRIGGER_IDS[0])}>
            <Icon name="add" />
            New automation
          </Button>
        </div>
      )}
    </>
  );
}
