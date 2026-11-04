import type { z } from "zod";

/**
 * Why a Panki AI answer couldn't be used, as Details' Log says it under its error (the owner, 2026-10-31): always what
 * was expected against what came, "Expected one row per meaning (4). Got 0.", never a label of whose rule it was. The
 * one home for that wording: the API's reader for what didn't parse or wasn't the shape (`issueWords`, Zod's path and
 * what it wanted), each action's own rules (`explainRuleBroken`, `touchUpProblem`), a cut answer and a refusal.
 */

/** A reason, said as what was expected and what came. */
export const expectedGot = (expected: string, got: string): string => `Expected ${expected}. Got ${got}.`;

/** The reasons that aren't about the answer's contents. */
export const UNREAD_REASONS = {
  notJson: expectedGot("JSON", "text that doesn't parse"),
  cut: (maxTokens: number) => expectedGot(`an answer within the answer limit (${maxTokens.toLocaleString("en")} tokens)`, "one cut short"),
  refused: expectedGot("an answer", "a refusal"),
};

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
