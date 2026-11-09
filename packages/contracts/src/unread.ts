/** @panki Why a Panki AI answer couldn't be used, said as Expected … Got … (`expectedGot`, `UNREAD_REASONS`, `issueWords`, `knobsBroken`). Never a label of whose rule it was. */
import type { z } from "zod";

/**
 * Why a Panki AI answer couldn't be used, as Details' Log says it under its error: always what
 * was expected against what came, "Expected one row per meaning (4). Got 0.", never a label of whose rule it was. The
 * one home for that wording: the API's reader for what didn't parse or wasn't the shape (`issueWords`, Zod's path and
 * what it wanted), each place's own rules (`explainProblem`, `touchUpProblem`), a cut answer and a refusal.
 */

/** A reason, said as what was expected and what came. */
export const expectedGot = (expected: string, got: string): string => `Expected ${expected}. Got ${got}.`;

/** The reasons that aren't about the answer's contents. */
export const UNREAD_REASONS = {
  notJson: expectedGot("JSON", "text that doesn't parse"),
  cut: (maxTokens: number) => expectedGot(`an answer within the answer limit (${maxTokens.toLocaleString("en")} tokens)`, "one cut short"),
  refused: expectedGot("an answer", "a refusal"),
};

/**
 * A message's knobs broken (Requires, Leave out): the whole message fails, as a broken rule does, but its failure is
 * said in Panki's plain words (`plain`, the failure's own message: "Panki AI didn't answer the Explanation.") as well
 * as expected against got for the Log (`detail`).
 */
export type KnobBreach = { plain: string; detail: string };
/** Names as one phrase, each with "the": "the Meaning", "the Meaning and the Reading", "the Meaning, the Reading and the Sentence". */
function theNames(names: readonly string[]): string {
  const each = names.map((name) => `the ${name}`);
  return each.length <= 1 ? each.join("") : `${each.slice(0, -1).join(", ")} and ${each.at(-1)}`;
}
/** Each way a message's knobs can be broken, one home for its words: a required part not answered, a left-out part answered. */
export const KNOB_BREACHES = {
  /** Required fields (a card's, by their names) that came back untouched. */
  unanswered: (names: readonly string[]): KnobBreach => ({
    plain: `Panki AI didn't answer ${theNames(names)}.`,
    detail: expectedGot(`${theNames(names)} answered`, names.length === 1 ? "it untouched" : "them untouched"),
  }),
  /** A required reply that came back empty. */
  unreplied: { plain: "Panki AI didn't reply.", detail: expectedGot("a reply", "an empty one") } satisfies KnobBreach,
  /** The word's meanings, required, left unjudged. */
  unjudged: { plain: "Panki AI didn't judge the meanings.", detail: expectedGot("the meanings judged", "them untouched") } satisfies KnobBreach,
  /** Left-out fields (a card's, by their names) that came back answered. */
  answered: (names: readonly string[]): KnobBreach => ({
    plain: `Panki AI answered ${theNames(names)}, which this message told it to leave out.`,
    detail: expectedGot(`${theNames(names)} left untouched`, names.length === 1 ? "it answered" : "them answered"),
  }),
  /** A reply said where the message left the reply out. */
  replied: { plain: "Panki AI replied, which this message told it not to.", detail: expectedGot("no reply", "one") } satisfies KnobBreach,
  /** The word's meanings judged where the message left them out. */
  judged: { plain: "Panki AI judged the meanings, which this message told it to leave out.", detail: expectedGot("the meanings left untouched", "them judged") } satisfies KnobBreach,
};
/** Every breach of a message's knobs as one failure, its sentences in turn; null when none was broken. */
export const knobsBroken = (breaches: readonly KnobBreach[]): KnobBreach | null =>
  breaches.length === 0 ? null : { plain: breaches.map((b) => b.plain).join(" "), detail: breaches.map((b) => b.detail).join(" ") };

/** What some JSON value is, as "Got …" says it. */
export function gotOf(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.length === 0 ? "an empty list" : `a list of ${value.length}`;
  if (typeof value === "string") return value === "" ? "an empty string" : "a string";
  if (typeof value === "number") return "a number";
  if (typeof value === "boolean") return value ? "true" : "false";
  return "an object";
}

/** A place in an answer as a path reads: `meanings[2].meaning`; the answer itself, with none. */
function pathWords(path: readonly PropertyKey[]): string {
  const said = path.map((key, i) => (typeof key === "number" ? `[${key}]` : `${i === 0 ? "" : "."}${String(key)}`)).join("");
  return said === "" ? "the answer" : said;
}
/** The value at a path in what came back, or undefined where there's none. */
function valueAt(root: unknown, path: readonly PropertyKey[]): unknown {
  let at: unknown = root;
  for (const key of path) {
    if (typeof at !== "object" || at === null) return undefined;
    at = (at as Record<PropertyKey, unknown>)[key];
  }
  return at;
}
/** A JSON Schema type as the expected words say it. */
const ARTICLE: Record<string, string> = { string: "a string", number: "a number", int: "a whole number", boolean: "true or false", array: "a list", object: "an object", null: "null" };

/**
 * One Zod issue on what came back (`raw`, the parsed JSON), as expected against got: the issue's own words for a rule of
 * Panki's (a refinement, already said so), and for the shape, what it wanted at that path and what was there.
 */
export function issueWords(issue: z.core.$ZodIssue, raw: unknown): string {
  if (issue.code === "custom") return issue.message;
  const where = pathWords(issue.path);
  const got = gotOf(valueAt(raw, issue.path));
  switch (issue.code) {
    case "invalid_type":
      return expectedGot(`${ARTICLE[issue.expected] ?? issue.expected} at ${where}`, got);
    case "invalid_value":
      return expectedGot(`one of ${issue.values.map((v) => JSON.stringify(v)).join(", ")} at ${where}`, JSON.stringify(valueAt(raw, issue.path)) ?? got);
    case "too_big":
      return expectedGot(`at most ${String(issue.maximum)} at ${where}`, Array.isArray(valueAt(raw, issue.path)) ? got : "more");
    case "too_small":
      return expectedGot(`at least ${String(issue.minimum)} at ${where}`, Array.isArray(valueAt(raw, issue.path)) ? got : "less");
    case "unrecognized_keys":
      return expectedGot(`no other keys at ${where}`, issue.keys.join(", "));
    default:
      return expectedGot(`the answer's shape at ${where}`, `${got} (${issue.message})`);
  }
}
