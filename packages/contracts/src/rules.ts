/** @panki Automations (rules in code): every automatic run, When a trigger → Do an action → At most a cap (`RULE_TRIGGERS`, `RULE_ACTIONS`, `Rule`, `ruleProblem`, `RuleStanding`). */
import { z } from "zod";
import { TRANSCRIBE_MODES } from "./transcription";

/**
 * An **automation** on screen is a rule in the code, the shapes and the tables (`Rule`, `Settings.rules`, `rule_runs`,
 * `/api/rules`): stored keys can't change, and the code keeps its word.
 *
 * Panki does nothing paid or heavy by itself that isn't a rule (`docs/RULES.md`): a rule is one trigger (When), one
 * action (Do) and its caps (At most). The rules are the account's, a setting (`Settings.rules`), so every browser and
 * the phone follow the same ones; what each one did is a row of `rule_runs`, worked out into its standing on every
 * read. A trigger the server sees runs on the server; one only a page sees runs there, and asks the server first, which
 * holds every cap. A run by a rule is the same call as a run by hand, its usage row and failure words the same.
 */

/** A rule's id: minted by the browser as it's made, never shown. */
export const RuleId = z.string().min(1).max(64);
export type RuleId = z.infer<typeof RuleId>;

/** What a rule's run is about, as its caps count it: a video, a card, a word. */
export type RuleSubject = "video" | "card" | "word";
/** The words a run's subject is said in: "a video". */
export const SUBJECT_WORDS: Record<RuleSubject, string> = { video: "a video", card: "a card", word: "a word" };

/**
 * The caps a rule can hold, each action naming those it needs: a video's length in minutes (a video longer isn't run
 * on at all) and the room a download takes in MB (one that grows past it is let go). Dollars are held by the account's
 * one daily cap over every rule (`Settings.rulesDayMicros`) alone; no rule has a dollar cap of its own. Every cap is
 * optional: a rule without one simply doesn't have it (null), and the editor adds it and takes it off again.
 */
export type RuleCap = "minutes" | "mb";
/**
 * The knobs a trigger or an action takes beside the caps: how long a video's been watched before it runs
 * (`watchedSeconds`, optional as a cap is), and which of a place's Panki AI actions it sends (`aiAction`, the place's
 * default where it names none).
 */
export type RuleKnob = "seconds" | "aiAction";
/** The longest a video's watch time can be set to wait for: ten minutes. */
export const RULE_SECONDS_MAX = 600;

/** The actions, one registry: what a rule does. A new action is one entry here and its run where its triggers happen. */
export const RULE_ACTION_IDS = ["proofread", "transcribe", "transcribeWhole", "download", "drawerAction", "popupAction"] as const;
/**
 * An action as kept: one of the registry's, one since renamed read as it is now ("touchUp" is the Card drawer's action,
 * "explain" the Word pop-up's), nothing rewritten.
 */
export const RuleActionId = z.preprocess((value) => (value === "touchUp" ? "drawerAction" : value === "explain" ? "popupAction" : value), z.enum(RULE_ACTION_IDS));
export type RuleActionId = z.infer<typeof RuleActionId>;
export type RuleActionEntry = {
  /** Its name in Do, the action's own as everywhere else. */
  name: string;
  /** What one run is about: a video, a card, a word. */
  subject: RuleSubject;
  /** The caps it can hold, each optional. */
  caps: readonly RuleCap[];
  /** The knobs it takes. */
  knobs: readonly RuleKnob[];
  /** A new rule's caps (a length in minutes, a size in MB) and its wait (seconds watched); null is none. */
  start: { maxMinutes: number | null; maxMb: number | null; watchedSeconds: number | null };
  /** Whether its runs cost dollars, held to the account's daily cap over every rule; a download costs room, not dollars. */
  paid: boolean;
  /** The Panki AI place whose actions it sends (`aiAction`): the Card drawer's (`card`), the Word pop-up's (`word`). */
  place?: "card" | "word";
};
const NONE = { maxMinutes: null, maxMb: null, watchedSeconds: null };
export const RULE_ACTIONS: Record<RuleActionId, RuleActionEntry> = {
  proofread: { name: "Proofread", subject: "video", caps: [], knobs: [], paid: true, start: NONE },
  // Live, the chunks following the viewer, at once; 30 minutes was the admin's length limit to begin with.
  transcribe: { name: TRANSCRIBE_MODES.live.name, subject: "video", caps: ["minutes"], knobs: [], paid: true, start: { ...NONE, maxMinutes: 30 } },
  // Full, the whole video ordered in the background, once it's been watched 20 s: the same price a minute (the engine's
  // listed $0.22 an hour), the wait about videos clicked and left.
  transcribeWhole: { name: TRANSCRIBE_MODES.full.name, subject: "video", caps: ["minutes"], knobs: [], paid: true, start: { ...NONE, maxMinutes: 30, watchedSeconds: 20 } },
  // An hour at 720p is a few hundred MB as YouTube sends it; 1,000 MB leaves room for a higher quality.
  download: { name: "Download", subject: "video", caps: ["minutes", "mb"], knobs: [], paid: false, start: { ...NONE, maxMinutes: 60, maxMb: 1_000 } },
  // One of the place's actions, sent as a press of Send with it ticked would send it; its default to begin with (Touch up, Explain).
  // "When the Word pop-up opens, ask Panki AI: Explain": the action asked named after a colon (`aiAction`), so any action's name reads.
  drawerAction: { name: "Ask Panki AI", subject: "card", caps: [], knobs: ["aiAction"], paid: true, start: NONE, place: "card" },
  popupAction: { name: "Ask Panki AI", subject: "word", caps: [], knobs: ["aiAction"], paid: true, start: NONE, place: "word" },
};

/** The triggers, one registry: when a rule runs. A new trigger is one entry here and where it's heard. */
export const RULE_TRIGGER_IDS = ["transcriptWhole", "chunkIn", "partIn", "videoPlays", "videoSaved", "drawerOpens", "popupOpens"] as const;
/** Triggers kept under an older id, read as the one they are now. */
const FORMER_TRIGGERS: Readonly<Record<string, string>> = {
  // A video watched past so many seconds is "videoPlays" with its wait.
  videoWatched: "videoPlays",
  // The Card drawer's action runs as the drawer opens on a word, not once a card is added.
  cardAdded: "drawerOpens",
};
/** A trigger as kept: one of the registry's, one since folded into another or renamed read as that one, nothing rewritten. */
export const RuleTriggerId = z.preprocess((value) => (typeof value === "string" ? (FORMER_TRIGGERS[value] ?? value) : value), z.enum(RULE_TRIGGER_IDS));
export type RuleTriggerId = z.infer<typeof RuleTriggerId>;
export type RuleTriggerEntry = {
  /** Its words in When: "When a transcript is whole". */
  name: string;
  /** What `name` begins with, the thing it's about, after which a rule's limits are said: "When a video (up to 30 min) plays". */
  about: string;
  /** Where it's heard, so where it runs: the server (with no page open), or a page of the extension's. */
  heard: "server" | "page";
  /** The actions it can lead to, each with its words in the rule's sentence, after its comma ("proofread the entire video"); capitalized where they stand alone (`doWords`). */
  does: Partial<Record<RuleActionId, string>>;
  /** The knobs it takes, said in When ("When a video has been watched 20 s"). */
  knobs: readonly RuleKnob[];
};
export const RULE_TRIGGERS: Record<RuleTriggerId, RuleTriggerEntry> = {
  // Finished: transcribed whole in the background (Full), or every moment of it covered by chunks, as far as the account's watching knows its length.
  transcriptWhole: { name: "a transcript is finished", about: "a transcript", heard: "server", does: { proofread: "proofread the entire video" }, knobs: [] },
  // Heard by the server as the chunk's words stand: its lines, a line running on into the next chunk proofread again with it.
  chunkIn: { name: "a chunk is transcribed", about: "a chunk", heard: "server", does: { proofread: "proofread its lines" }, knobs: [] },
  // A part transcribed again (Re-transcribe a part), once its words stand in place of what was there.
  partIn: { name: "a part is transcribed again", about: "a part", heard: "server", does: { proofread: "proofread the part" }, knobs: [] },
  // Heard by the page once the video's length is known: every video opened, at once or once it's been watched a while
  // (`watchedSeconds`, held by the server against the video's whole watch time as Video tracking keeps it, this visit's
  // alone where tracking is off, so a video come back to has shown it's really being watched).
  videoPlays: { name: "a video plays", about: "a video", heard: "page", does: { transcribe: "start transcribing", transcribeWhole: "transcribe the entire video in the background" }, knobs: ["seconds"] },
  // Heard by the browser that saved it: downloads are each browser's own, so only that one downloads it.
  videoSaved: { name: "a video is saved for later", about: "a video", heard: "page", does: { download: "download it" }, knobs: [] },
  // Heard by the Card drawer as it opens on a word, which has what its actions need (the dictionary, the video's
  // subtitles, the mapping); what comes back shows in the drawer as a press of Send's does.
  drawerOpens: { name: "the Card drawer opens", about: "the Card drawer", heard: "page", does: { drawerAction: "ask Panki AI" }, knobs: [] },
  // Heard by the pop-up as it opens on a word, on YouTube or any page.
  popupOpens: { name: "the Word pop-up opens", about: "the Word pop-up", heard: "page", does: { popupAction: "ask Panki AI" }, knobs: [] },
};
/** The knobs a rule takes: its trigger's, then its action's. */
export const ruleKnobsOf = (rule: Pick<Rule, "when" | "do">): RuleKnob[] => [...RULE_TRIGGERS[rule.when].knobs, ...RULE_ACTIONS[rule.do].knobs];

/** The actions a trigger can lead to, in the registry's order. */
export const ruleActionsFor = (when: RuleTriggerId): RuleActionId[] => RULE_ACTION_IDS.filter((id) => RULE_TRIGGERS[when].does[id] !== undefined);
/** An action as Do lists it after a trigger: its words in that trigger's sentence, capitalized ("Start transcribing"), else its name. */
export function doWords(when: RuleTriggerId, does: RuleActionId): string {
  const words = RULE_TRIGGERS[when].does[does];
  return words === undefined ? RULE_ACTIONS[does].name : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** The most a dollar cap can be set to: $100. */
export const RULE_MICROS_MAX = 100_000_000;
/** The longest a length cap can be set to: twelve hours, the longest video Panki believes it's told of (`WHOLE_MAX_MS`). */
export const RULE_MINUTES_MAX = 720;
/** The most room a download cap can be set to: 20 GB. */
export const RULE_MB_MAX = 20_000;
const Micros = z.number().int().min(0).max(RULE_MICROS_MAX);

/**
 * A rule as it's kept: its id, On or Off, When, Do, and its caps (At most). A cap an action doesn't name is null.
 */
export const Rule = z.object({
  id: RuleId,
  on: z.boolean(),
  when: RuleTriggerId,
  do: RuleActionId,
  /**
   * `perRunMicros` and `perDayMicros` are from when each rule had dollar caps of its own (at most so much a video, a day):
   * read by nothing, the account's one daily cap the only dollar limit; kept in the shape so a rule saved with them reads
   * as it was saved, and null on every rule made since.
   */
  perRunMicros: Micros.nullable().default(null),
  perDayMicros: Micros.nullable().default(null),
  /** Videos up to this many minutes: a longer one isn't run on; null is no limit of its own. Transcribing's is held to the admin's length limit whatever it says, a ceiling no rule passes. */
  maxMinutes: z.number().int().min(1).max(RULE_MINUTES_MAX).nullable().default(null),
  /** At most this many MB a download: one that grows past it is let go; null is no limit. */
  maxMb: z.number().int().min(1).max(RULE_MB_MAX).nullable().default(null),
  /**
   * How long the video must have been watched before it runs, in seconds, its whole watch time (`videoPlays`'s wait);
   * null at once, and for a trigger that takes none. A rule kept with a `mode`, from when Transcribe had one, reads with
   * it dropped.
   */
  watchedSeconds: z.number().int().min(0).max(RULE_SECONDS_MAX).nullable().default(null),
  /**
   * Which of its place's Panki AI actions it sends, by id (`AiActionId`; a plain string here, `aiActions.ts` reading
   * this file); null is the place's default, the first it ticks as a conversation opens (`openingActionsOf`). An
   * action deleted since reads as the default. A rule kept with `words`, from when the pop-up's rule chose words, reads
   * with it dropped.
   */
  aiAction: z.string().min(1).max(64).nullable().default(null),
});
export type Rule = z.infer<typeof Rule>;

/** Why a rule can't be kept as it is, in the owner's words, or null: an action its trigger doesn't lead to. Its limits, its wait and its action may be left as they come. */
export function ruleProblem(rule: Rule): string | null {
  if (RULE_TRIGGERS[rule.when].does[rule.do] === undefined) return `${RULE_ACTIONS[rule.do].name} doesn't follow “${RULE_TRIGGERS[rule.when].name}”.`;
  return null;
}

/**
 * Whether a video is too long for a rule: past its own minutes, or past the admin's length limit, a ceiling no rule
 * passes. The words for its row ("Longer than 30 min"), or null.
 */
export function lengthStop(rule: Rule, lengthMs: number, ceilingMinutes: number): string | null {
  const most = Math.min(rule.maxMinutes ?? ceilingMinutes, ceilingMinutes);
  return lengthMs > most * 60_000 ? `Longer than ${most} min` : null;
}

/**
 * A page's ask to run a rule on a video it heard the trigger for: the video, its length as the player says it, and how
 * long it has been played on this visit (`watchedMs`), which the server holds a watched threshold against when Video
 * tracking hasn't kept more.
 */
export const RuleRunAsk = z.object({
  subject: z.string().min(1).max(64),
  lengthMs: z.number().int().positive().max(12 * 60 * 60 * 1000),
  watchedMs: z.number().int().nonnegative().max(12 * 60 * 60 * 1000).default(0),
});
export type RuleRunAsk = z.infer<typeof RuleRunAsk>;
/**
 * A call to Panki AI made for a rule a page heard (a card added, the Word pop-up opening): the rule and what it's about
 * (the card's id, the word). The server holds the caps before the call and keeps it as the run's row; the call is
 * otherwise the one made by hand.
 */
export const RuleCall = z.object({ id: RuleId, subject: z.string().min(1).max(200) });
export type RuleCall = z.infer<typeof RuleCall>;

/** A run a page stopped part-way at a cap only it can hold (a download grown past its MB): the video and why, kept as the run's row. */
export const RuleRunStop = z.object({ subject: z.string().min(1).max(64), why: z.string().min(1).max(200) });
export type RuleRunStop = z.infer<typeof RuleRunStop>;
/**
 * The server's word: go, or not and why (a cap reached, the rule off or gone), kept as the run's row either way; or not
 * yet (`waitMs`: how much more of the video must be watched first), kept as nothing, for the page to ask again then.
 */
export const RuleRunAnswer = z.object({ go: z.boolean(), why: z.string().nullable(), waitMs: z.number().int().nonnegative().default(0) });
export type RuleRunAnswer = z.infer<typeof RuleRunAnswer>;

/** The most rules an account keeps. */
export const RULES_MAX = 30;
/** The account's rules, each id once, each held to `ruleProblem`. */
export const Rules = z
  .array(Rule)
  .max(RULES_MAX)
  .refine((rules) => new Set(rules.map((r) => r.id)).size === rules.length, { message: "Each automation has an id of its own." })
  .superRefine((rules, ctx) => {
    for (const rule of rules) {
      const problem = ruleProblem(rule);
      if (problem !== null) ctx.addIssue({ code: "custom", message: problem });
    }
  });
/** A rule an account starts with: On, with only the limits it names. */
const startingRule = (id: string, when: RuleTriggerId, does: RuleActionId, limits: Partial<Pick<Rule, "maxMinutes" | "maxMb" | "watchedSeconds">> = {}): Rule => ({
  id,
  on: true,
  when,
  do: does,
  perRunMicros: null,
  perDayMicros: null,
  maxMinutes: null,
  maxMb: null,
  watchedSeconds: null,
  aiAction: null,
  ...limits,
});
/**
 * What every account starts with, all On (the owner's own set, 2026-11-16): When a video plays, start transcribing; When
 * a video (up to 90 min) plays, only after 5 s watched, transcribe the entire video in the background; When a video (up
 * to 60 min, 1,000 MB) is saved for later, download it. None on the Card drawer or the Word pop-up. An account that
 * kept its own is never changed.
 */
export const DEFAULT_RULES: Rule[] = [
  startingRule("transcribe", "videoPlays", "transcribe"),
  startingRule("transcribeWhole", "videoPlays", "transcribeWhole", { maxMinutes: 90, watchedSeconds: 5 }),
  startingRule("download", "videoSaved", "download", { maxMinutes: 60, maxMb: 1_000 }),
];
/** The account's one daily cap over every rule (`Settings.rulesDayMicros`) to begin with: $5.00. */
export const DEFAULT_RULES_DAY_MICROS = 5_000_000;

/** A new rule, On, with its action's starting caps. */
export function newRule(id: string, when: RuleTriggerId, does: RuleActionId = ruleActionsFor(when)[0] ?? "proofread"): Rule {
  const { maxMinutes, maxMb, watchedSeconds } = RULE_ACTIONS[does].start;
  const knobs = ruleKnobsOf({ when, do: does });
  return {
    id,
    on: true,
    when,
    do: does,
    perRunMicros: null,
    perDayMicros: null,
    maxMinutes,
    maxMb,
    watchedSeconds: knobs.includes("seconds") ? watchedSeconds : null,
    aiAction: null,
  };
}

/** A rule's When changed: its Do kept when the new trigger leads to it, else the trigger's first, with that action's starting caps. */
export function ruleWhenChanged(rule: Rule, when: RuleTriggerId): Rule {
  if (RULE_TRIGGERS[when].does[rule.do] !== undefined) return { ...rule, when };
  return { ...newRule(rule.id, when), on: rule.on };
}

/** A cap in dollars, to the cent: "$0.50". Caps are set in cents, so nothing finer is ever said of one. */
export const capWords = (micros: number): string => `$${(Math.round(micros / 10_000) / 100).toFixed(2)}`;

/**
 * Whether a run's next call may go: its most (`ceilingMicros`, at the model's listed prices) on top of what every rule
 * spent today stays inside the account's one daily cap. The cap it would pass, in words for its row, or null. A rule
 * that costs no dollars (a download) is never held to it.
 */
export function capStop(rule: Rule, everyRuleToday: number, everyRuleDayMicros: number, ceilingMicros: number): string | null {
  if (!RULE_ACTIONS[rule.do].paid) return null;
  if (everyRuleToday + ceilingMicros > everyRuleDayMicros) return `Max spend for automations (${capWords(everyRuleDayMicros)} a day) reached`;
  return null;
}

/**
 * How a run by a rule ended: it ran (its call answered or failed, its cost what the provider billed), or a cap stopped it
 * before anything was spent (`capped`), or it couldn't go (`failed`: Panki AI off, no key, the call's own failure).
 */
export const RuleOutcome = z.enum(["ran", "failed", "capped"]);
export type RuleOutcome = z.infer<typeof RuleOutcome>;
/** One run of a rule as kept: when, what it was about, how it ended, what it cost (est.), and why in words. */
export const RuleRun = z.object({
  ruleId: RuleId,
  at: z.number().int(),
  subject: z.string(),
  outcome: RuleOutcome,
  costMicros: z.number().int().nonnegative(),
  detail: z.string().nullable(),
});
export type RuleRun = z.infer<typeof RuleRun>;
/** How a rule stands today (the account's day): its runs, its line's tint in the flow. */
export const RuleStanding = z.object({
  ruleId: RuleId,
  todayRuns: z.number().int().nonnegative(),
});
export type RuleStanding = z.infer<typeof RuleStanding>;
/** Every rule's standing, and what every rule spent today together, against the account's daily cap. */
export const RulesStandingResponse = z.object({ standing: z.array(RuleStanding), todayMicros: z.number().int().nonnegative() });
export type RulesStandingResponse = z.infer<typeof RulesStandingResponse>;
