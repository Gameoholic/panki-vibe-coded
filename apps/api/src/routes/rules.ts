import { Router } from "express";
import { RuleId, RuleRunAsk, RuleRunStop } from "@panki/contracts";
import type { DbOf } from "../app";
import type { Rules } from "../rules";

/**
 * The account's rules on the server: how they stand today (Settings → Automations: each one's runs, every rule's spend
 * together), and a page asking to run one on a trigger it heard. The rules themselves are settings (`Settings.rules`), saved as every
 * setting is.
 */
export function rulesRouter(dbOf: DbOf, rules: Rules) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json(rules.standing(dbOf(res)));
  });

  // Asked by a page before a run of a rule it heard the trigger for (a video plays): the caps held here, the go or the
  // stop kept as the run's row (`Rules.startRun`).
  router.post("/:ruleId/runs", (req, res) => {
    const ruleId = RuleId.safeParse(req.params.ruleId);
    const parsed = RuleRunAsk.safeParse(req.body);
    if (!ruleId.success || !parsed.success) {
      res.status(400).json({ error: { message: "That isn't a run of an automation." } });
      return;
    }
    res.json(rules.startRun(dbOf(res), ruleId.data, parsed.data));
  });

  // A run a page let go part-way at a cap only it can hold (a download grown past its MB), kept as the run's row.
  router.post("/:ruleId/runs/stopped", (req, res) => {
    const ruleId = RuleId.safeParse(req.params.ruleId);
    const parsed = RuleRunStop.safeParse(req.body);
    if (!ruleId.success || !parsed.success) {
      res.status(400).json({ error: { message: "That isn't a run of an automation." } });
      return;
    }
    if (!rules.stoppedRun(dbOf(res), ruleId.data, parsed.data)) {
      res.status(404).json({ error: { message: "That automation doesn't exist." } });
      return;
    }
    res.status(204).end();
  });

  return router;
}
