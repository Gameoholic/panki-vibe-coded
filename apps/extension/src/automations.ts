/** @panki The account's automations as a page runs them: the one on for a trigger, and the Panki AI action it sends (`automationOf`, `aiActionOf`). */
import { AiActionId, actionsOf, openingActionsOf, type AccountActions, type Rule, type RuleActionId, type RuleTriggerId } from "@panki/contracts";
import type { AccountRules } from "./messages";

/**
 * A page hears a trigger (the Card drawer opening, the Word pop-up opening) and runs the account's automation for it, as
 * a press would: Panki holds its caps and keeps its run, named on the ask (`RuleCall`). Rules in the code, automations on
 * screen.
 */

/** The account's first automation on that runs `does` when `when`; null when it has none on (or is signed out). */
export const automationOf = (rules: AccountRules | null, when: RuleTriggerId, does: RuleActionId): Rule | null =>
  rules?.rules.find((rule) => rule.on && rule.when === when && rule.do === does) ?? null;

/**
 * The Panki AI action an automation sends at its place: the one it names while the account still has it, else the
 * place's default, the first it ticks as a conversation opens; null when the place has none at all.
 */
export function aiActionOf(rule: Rule, book: AccountActions, place: "card" | "word"): AiActionId | null {
  const kept = AiActionId.safeParse(rule.aiAction);
  if (kept.success && actionsOf(book, place).some((action) => action.id === kept.data)) return kept.data;
  return openingActionsOf(book, place)[0] ?? null;
}
