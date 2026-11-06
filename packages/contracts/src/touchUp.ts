import { z } from "zod";
import { AiRanOn, PankiAiStatus, TemplateId, type AiActionId } from "./ai";
import { DATA_KIND_NAMES } from "./dictionaryRows";
import { PIECE_NAMES } from "./pieces";
import { AI_TEXT_MAX, ExplainFollowUpShape, ExplainShape, PlainShape, PromptPieces, Said, meaningsWhole, type MeaningAccuracyId } from "./prompt";
import { ProofreadShape } from "./proofread";
import { VALUE_MAX } from "./type";
import { expectedGot } from "./unread";

/**
 * Touch up: Panki AI over the card being added, judging what each field holds and proposing only where something's
 * needed, each proposal accepted or dismissed by hand and nothing written by itself. The model: the AI judges, Panki types its
 * answer, rejects anything off the shape, and draws every outcome itself as a diff (`fieldVerdictOf`,
 * `meaningVerdictOf`). What it can judge is one registry of keys, each the field mapping's role it goes to and that
 * role's name: the answer's fixed shape has one entry per key whose role has a field on the deck. A new key is one
 * entry here, one line of the answer below and its words in the default prompt.
 */
export const TOUCH_UP_KEYS = ["meaning", "reading", "dictionaryForm", "pitchAccent", "sentence", "explanation", "examples"] as const;
export const TouchUpKey = z.enum(TOUCH_UP_KEYS);
export type TouchUpKey = z.infer<typeof TouchUpKey>;

/**
 * Each key: the field mapping's role whose field it goes to (`roles.ts` → `ROLES`, by the same id), and that role's
 * name, the one it has everywhere. Explanation and Example sentences are roles nothing but Touch up fills (Source
 * "Panki AI"), so their names are born here and `roles.ts` reads them from it.
 */
export const TOUCH_UP: Record<TouchUpKey, { role: string; name: string }> = {
  meaning: { role: "dictMeaning", name: DATA_KIND_NAMES.meaning },
  reading: { role: "dictReading", name: DATA_KIND_NAMES.reading },
  dictionaryForm: { role: "dictForm", name: DATA_KIND_NAMES.form },
  pitchAccent: { role: "dictPitch", name: DATA_KIND_NAMES.pitch },
  sentence: { role: "sentence", name: PIECE_NAMES.sentence },
  // The word in general: nuance, register, what it's confused with; never Meaning said again.
  explanation: { role: "explanation", name: "Explanation" },
  // A few made-up sentences, each after a line that sets its scene.
  examples: { role: "examples", name: "Example sentences" },
};

/**
 * How a value stands, one registry: good is right as it is, meh could be better, bad is wrong.
 * Its look is the meanings' (`LOOK_OF`, `app.css` → `.ai-accuracy.is-…`): good green, meh orange, bad red.
 */
export const JUDGEMENTS = ["good", "meh", "bad"] as const;
export const Judgement = z.enum(JUDGEMENTS);
export type Judgement = z.infer<typeof Judgement>;
export const LOOK_OF: Record<Judgement, MeaningAccuracyId> = { good: "fits", meh: "close", bad: "wrong" };

/** Why, always: an empty one fails the answer (`touchUpProblem`). */
const Why = z.string().max(2_000);

/**
 * Why a field came back with nothing to accept, one registry, each with Panki's own words for it (the code is Panki's
 * to read, never shown): no_context, the model had not enough to go on; rewrote, Panki set aside a Sentence that was
 * reworded rather than cut or extended (`sentenceHeld`). A new kind is one id and its words; one the model may answer
 * is in `MODEL_ERROR_IDS` too.
 */
export const TOUCH_UP_ERROR_IDS = ["no_context", "rewrote"] as const;
export const TouchUpErrorId = z.enum(TOUCH_UP_ERROR_IDS);
export type TouchUpErrorId = z.infer<typeof TouchUpErrorId>;
export const TOUCH_UP_ERRORS: Record<TouchUpErrorId, string> = {
  no_context: "Panki AI couldn't decide without more context.",
  rewrote: "Panki AI rewrote the sentence instead of cutting or extending it.",
};
/** The errors the model itself may answer, on the wire; the rest are Panki's own verdicts on what it answered. */
const MODEL_ERROR_IDS = ["no_context"] as const satisfies readonly TouchUpErrorId[];

/*
 * The answer as the model sends it (the wire), and as Panki reads it (the answer). The wire has no union and nothing
 * optional or nullable anywhere: a provider's structured output holds a request to at most 16 parameters that are an
 * `anyOf` or a type array such as ["string", "null"] (Anthropic's "Schema complexity limits"), and a field that was
 * "judged or the error", its judgement and its proposal each nullable, came to 20 and was refused before the model ran.
 * So every key is required and plain: "" for no proposal and no error, the error a code beside the rest. And the wire
 * is built for each request from the card (`touchUpShape`): a field Panki sent empty has no judgement key at all, so
 * the model can't call a filled one empty (a model given "empty" as a judgement it could pick picks it for a filled
 * field too often). Panki translates it at once (`answerOfWire`) into its own shapes, judgement null and the error a
 * shape of its own, and every rule and every drawing reads only those.
 */

/** What the wire says in place of nothing: an empty string. */
const NONE = "";
const Proposed = z.string().max(VALUE_MAX);
const ErrorCode = z.enum([NONE, ...MODEL_ERROR_IDS]);
/** A text field that holds a value, on the wire: every key always there. */
export const FieldWire = z.object({
  judgement: Judgement.describe('good (right as it is), meh (could be better) or bad (wrong); "bad" beside an error, which Panki ignores'),
  proposed: Proposed.describe('the better value with meh, the correction with bad; "" with good'),
  why: Why.describe("always a sentence; shown under the field, folded closed when it's good, open otherwise"),
  error: ErrorCode.describe('"" when it judged; no_context when it can\'t judge the field from what it was given: Panki says it couldn\'t decide, nothing to press, and the rest is ignored'),
});
export type FieldWire = z.infer<typeof FieldWire>;
/** A text field Panki sent empty, on the wire: nothing to judge, so no judgement. */
export const EmptyFieldWire = z.object({
  proposed: Proposed.describe("what belongs in the field; required unless it's the error"),
  why: Why.describe("always a sentence: what it was written from; shown open under the field"),
  error: ErrorCode.describe('"" when it wrote one; no_context when it can\'t write the field from what it was given'),
});
export type EmptyFieldWire = z.infer<typeof EmptyFieldWire>;

/** One dictionary meaning judged against the sentence alone: by its index, how it stands, and why. */
export const MeaningRow = z.object({
  meaning: z.number().int().describe("the meaning's index in <meaning>"),
  judgement: Judgement.describe("good (it fits this sentence), meh (near, but not quite) or bad (it doesn't fit here); Panki marks the row green, orange or red"),
  why: Why.describe("why, in a few words; shown under the row, folded"),
});
export type MeaningRow = z.infer<typeof MeaningRow>;
/** The Meaning on the wire, when the dictionary has meanings: every key always there. */
export const MeaningWire = z.object({
  meanings: z.array(MeaningRow).max(200).describe("one row for every meaning in <meaning>, ticked or not, each index once"),
  proposed: Proposed.describe('a meaning of its own, as a dictionary writes one, when no row is good; "" when one is'),
  why: Why.describe("the Meaning's own why, against what's ticked: why it's right, or why it changes"),
  error: ErrorCode.describe('"" when it judged; no_context when it can\'t: Panki says it couldn\'t decide, the list stays unmarked, and the rest is ignored'),
});
export type MeaningWire = z.infer<typeof MeaningWire>;
/** The Meaning on the wire when the dictionary has none: nothing to judge, so no rows. */
export const EmptyMeaningWire = z.object({
  proposed: Proposed.describe("a meaning of its own, as a dictionary writes one; required unless it's the error"),
  why: Why.describe("why it fits this sentence"),
  error: ErrorCode.describe('"" when it wrote one; no_context when it can\'t'),
});
export type EmptyMeaningWire = z.infer<typeof EmptyMeaningWire>;

/** What each key holds and what Panki does with it, in plain words: said in Admin (`answerShapesOf`), never sent (`schemaFor` leaves descriptions out). */
export const KEY_WORDS: Record<TouchUpKey, string> = {
  meaning: "the card's Meaning, judged meaning by meaning (the dictionary's, then the field's own custom ones), or the error: Panki holds the rows against what the field holds and draws the difference",
  reading: "the dictionary form's reading: judged, written when it's empty, or the error",
  dictionaryForm: "the dictionary form, the same way",
  pitchAccent: "the dictionary form's pitch accent as its field writes it (くう 1), the same way",
  sentence: "the sentence as it carries the word, the same way",
  explanation: "what the word does in this sentence, so it's understood there, the same way",
  examples: "a few made-up sentences, each after a line setting its scene, the same way",
};
/** The answer on the wire, whichever shape each key was asked in (`touchUpShape`). */
export type TouchUpWire = { meaning?: MeaningWire | EmptyMeaningWire } & Partial<Record<Exclude<TouchUpKey, "meaning">, FieldWire | EmptyFieldWire>>;

/** A field the model can't judge or write from what it was given, in its judgement's place: the code and what was missing. */
export const TouchUpError = z.object({ error: TouchUpErrorId, why: Why });
export type TouchUpError = z.infer<typeof TouchUpError>;
/**
 * A text field judged, as Panki reads it (every key but the meaning): how it stands, the value proposed, and why. A
 * judgement null is only for a field sent empty, which can answer nothing else; a proposal with every judgement but
 * good, none with good (`touchUpProblem`).
 */
export const FieldJudged = z.object({ judgement: Judgement.nullable(), proposed: z.string().max(VALUE_MAX).nullable(), why: Why });
export type FieldJudged = z.infer<typeof FieldJudged>;
export const FieldAnswer = z.union([TouchUpError, FieldJudged]);
export type FieldAnswer = z.infer<typeof FieldAnswer>;
/**
 * The Meaning judged, as Panki reads it: a row for every meaning sent, ticked or not, each index once; a meaning of its
 * own exactly when no row is good; and the Meaning's own why, written against what's ticked. Never a verdict on the
 * card: Panki makes that, holding the rows against the ticks (`meaningVerdictOf`).
 */
export const MeaningJudged = z.object({ meanings: z.array(MeaningRow).max(200), proposed: z.string().max(VALUE_MAX).nullable(), why: Why });
export type MeaningJudged = z.infer<typeof MeaningJudged>;
export const MeaningAnswer = z.union([TouchUpError, MeaningJudged]);
export type MeaningAnswer = z.infer<typeof MeaningAnswer>;
/** Whether a key's answer is the error. */
export const isError = (part: FieldAnswer | MeaningAnswer): part is TouchUpError => "error" in part;

/** An answer as Panki hands it on: the keys asked, each as read. */
export const TouchUpAnswer = z.object({
  meaning: MeaningAnswer.optional(),
  reading: FieldAnswer.optional(),
  dictionaryForm: FieldAnswer.optional(),
  pitchAccent: FieldAnswer.optional(),
  sentence: FieldAnswer.optional(),
  explanation: FieldAnswer.optional(),
  examples: FieldAnswer.optional(),
});
export type TouchUpAnswer = z.infer<typeof TouchUpAnswer>;
/** Every key but the meaning: a text field, judged one way. */
export type FieldKey = Exclude<TouchUpKey, "meaning">;
export const FIELD_KEYS = TOUCH_UP_KEYS.filter((key): key is FieldKey => key !== "meaning");

/** A string of the wire's as Panki reads it: "" is nothing. */
const orNull = (text: string): string | null => (text === NONE ? null : text);
/** A text field from the wire: an error code makes it the error, whatever else it holds; one asked without a judgement (sent empty) is a judgement null. */
function fieldOfWire(wire: FieldWire | EmptyFieldWire): FieldAnswer {
  if (wire.error !== NONE) return { error: wire.error, why: wire.why };
  return { judgement: "judgement" in wire ? wire.judgement : null, proposed: orNull(wire.proposed), why: wire.why };
}
/** The Meaning from the wire, the same way: one asked without rows (no dictionary meanings) has none. */
function meaningOfWire(wire: MeaningWire | EmptyMeaningWire): MeaningAnswer {
  if (wire.error !== NONE) return { error: wire.error, why: wire.why };
  return { meanings: "meanings" in wire ? wire.meanings : [], proposed: orNull(wire.proposed), why: wire.why };
}
/** The answer as Panki reads it, from the wire: the one translation, run before any rule. */
export function answerOfWire(wire: TouchUpWire): TouchUpAnswer {
  const answer: TouchUpAnswer = {};
  if (wire.meaning) answer.meaning = meaningOfWire(wire.meaning);
  for (const key of FIELD_KEYS) {
    const part = wire[key];
    if (part) answer[key] = fieldOfWire(part);
  }
  return answer;
}

/** Words as two values are compared: spaces and capitals aside. */
const plain = (words: string) => words.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A text field's answer as Panki draws it, the one place it's decided: the error; good (the green line, its why
 * closed), a proposed value that's what the field already holds among them (never drawn as a proposal); meh or bad (the
 * value struck in orange or red, the proposal under it in green); written, for a field that was empty (the proposal in
 * green under "Panki AI proposes").
 */
export type FieldVerdict =
  | { kind: "error"; error: TouchUpErrorId; why: string }
  | { kind: "good"; why: string }
  | { kind: "meh" | "bad" | "written"; proposed: string; why: string };
export function fieldVerdictOf(part: FieldAnswer, held: string): FieldVerdict {
  if (isError(part)) return { kind: "error", error: part.error, why: part.why };
  const proposed = part.proposed?.trim() ?? "";
  if (part.judgement === "good" || proposed === "" || (held.trim() !== "" && plain(proposed) === plain(held))) return { kind: "good", why: part.why };
  return { kind: part.judgement ?? "written", proposed, why: part.why };
}

/*
 * The Meaning field is the one truth of what a card means. Its text is read as glosses (`glossesOf`); a dictionary
 * meaning is ticked only while its whole stands in the field, every gloss of it in its order and side by side (spaces,
 * capitals and punctuation aside, as `bareOf` compares), and every run of glosses no dictionary meaning claims is a
 * meaning of the field's own, a custom meaning, counted apart from the dictionary's (`readMeaning`). The drawer's list of
 * meanings is worked out from the field every time, and ticking one only adds or takes out its glosses
 * (`meaningTicked`, `meaningWithout`). Touch up is sent what's worked out: the dictionary's numbers held, the field's text
 * and each custom meaning as a row of its own (`meaningsPiece`'s `custom`).
 */

/** What stands between two glosses of a Meaning: a semicolon, of either width, or a line break. */
const GLOSS_BREAK = /[;；\r\n]/;
/** A Meaning's glosses as written: split at each break, each trimmed and its spaces made single, the empty ones dropped. */
export function glossesOf(text: string): string[] {
  return text
    .split(GLOSS_BREAK)
    .map((gloss) => gloss.replace(/\s+/g, " ").trim())
    .filter((gloss) => gloss !== "");
}
/** Glosses as a Meaning holds them. */
const glossesJoined = (glosses: readonly string[]): string => glosses.join("; ");
/** A Meaning tidied: its glosses joined by "; ", stray breaks and spaces gone. What's sent, what's kept and what Accept writes; never while it's typed. */
export const tidyMeaning = (text: string): string => glossesJoined(glossesOf(text));

/** One run of a Meaning's glosses: a dictionary meaning whole, by its number in `{Meaning}`, or one of the field's own, by its count; its words as the field has them. */
export type MeaningRun = { kind: "dictionary" | "custom"; number: number; words: string };
/** A Meaning read: its runs in the field's order, the dictionary's numbers it holds (in the list's order), and its custom meanings' words (in the field's). */
export type MeaningRead = { runs: MeaningRun[]; ticked: number[]; custom: string[] };
/**
 * A Meaning's text against the dictionary's meanings: each meaning whose glosses all stand in it, in order and side by
 * side, is ticked there; the longest meanings are matched first and, among those as long, the first in the list, and
 * glosses one meaning took can't be another's. Whatever no meaning takes is the field's own: each run of such glosses
 * side by side one custom meaning, so there are two only when a dictionary meaning stands between them.
 */
export function readMeaning(text: string, meanings: readonly string[]): MeaningRead {
  const glosses = glossesOf(text);
  const bare = glosses.map((gloss) => bareOf(gloss).bare);
  const owner: (number | null)[] = glosses.map(() => null);
  const wholes = meanings
    .map((words, i) => ({ number: i + 1, bare: glossesOf(words).map((gloss) => bareOf(gloss).bare) }))
    .filter((whole) => whole.bare.length > 0 && whole.bare.every((each) => each !== ""))
    .sort((a, b) => b.bare.length - a.bare.length || a.number - b.number);
  for (const whole of wholes) {
    const size = whole.bare.length;
    for (let at = 0; at + size <= glosses.length; at++) {
      if (!whole.bare.every((each, j) => owner[at + j] === null && bare[at + j] === each)) continue;
      for (let j = 0; j < size; j++) owner[at + j] = whole.number;
      break;
    }
  }
  const runs: MeaningRun[] = [];
  let custom = 0;
  for (let at = 0; at < glosses.length; ) {
    const number = owner[at] ?? null;
    let end = at + 1;
    while (end < glosses.length && owner[end] === number) end++;
    const words = glossesJoined(glosses.slice(at, end));
    runs.push(number === null ? { kind: "custom", number: ++custom, words } : { kind: "dictionary", number, words });
    at = end;
  }
  return {
    runs,
    ticked: runs.flatMap((run) => (run.kind === "dictionary" ? [run.number] : [])).sort((a, b) => a - b),
    custom: runs.flatMap((run) => (run.kind === "custom" ? [run.words] : [])),
  };
}
/** A Meaning with a dictionary meaning ticked: its glosses, whole, at the end; tidied. One already held leaves it as it is. */
export function meaningTicked(text: string, meanings: readonly string[], number: number): string {
  const words = meanings[number - 1];
  if (words === undefined || readMeaning(text, meanings).ticked.includes(number)) return tidyMeaning(text);
  return glossesJoined([...glossesOf(text), ...glossesOf(words)]);
}
/** A Meaning with the runs chosen taken out, exactly those glosses; tidied. Unticking a dictionary meaning is its run. */
export function meaningWithout(text: string, meanings: readonly string[], gone: (run: MeaningRun) => boolean): string {
  return glossesJoined(readMeaning(text, meanings).runs.filter((run) => !gone(run)).map((run) => run.words));
}
/** The custom meanings a card was sent with, read off its Meaning as sent: what `{Meaning}` lists after the dictionary's. */
export const customOf = (now: TouchUpNow, meanings: readonly string[]): string[] => readMeaning(now.values.meaning ?? "", meanings).custom;

/** One row of the Meaning as judged: a dictionary meaning by its number, or a custom one by its count; its words, how it stands and why, and whether the Meaning held it. */
export type MeaningRowVerdict = { kind: "dictionary" | "custom"; number: number; words: string; judgement: Judgement; why: string; ticked: boolean };
/** One run of the Meaning while a proposal waits, git's way: kept plain, could be better (orange, struck), wrong (red, struck), or added (green). */
export type MeaningMark = { kind: "dictionary" | "custom"; number: number; words: string; mark: "keep" | "meh" | "bad" | "add" };
/**
 * The Meaning's answer as Panki draws it, made from the rows against what the Meaning held as it was sent, the one
 * place it's decided:
 * - the error, the list left unmarked;
 * - good: every row the Meaning held good and no other row good ("Nothing to change.");
 * - change, some row good: Accept writes `accepted`, the runs that fit as the field has them, in its order, then each
 *   dictionary meaning that fits and wasn't held;
 * - propose, no row good: Accept writes the meaning Panki AI proposed in their place.
 * `rows` is every row judged, the dictionary's then the custom ones (what a title names); `marks` the Meaning as the
 * diff reads, in the field's order, then what's added.
 */
export type MeaningVerdict =
  | { kind: "error"; error: TouchUpErrorId; why: string }
  | { kind: "good"; rows: MeaningRowVerdict[]; why: string }
  | { kind: "change"; rows: MeaningRowVerdict[]; marks: MeaningMark[]; accepted: string; why: string }
  | { kind: "propose"; rows: MeaningRowVerdict[]; marks: MeaningMark[]; proposed: string; why: string };
/** `now` is the card as it was sent (its Meaning tidied, `now.values.meaning`), `meanings` the dictionary's, in `{Meaning}`'s order. */
export function meaningVerdictOf(part: MeaningAnswer, now: TouchUpNow, meanings: readonly string[]): MeaningVerdict {
  if (isError(part)) return { kind: "error", error: part.error, why: part.why };
  const read = readMeaning(now.values.meaning ?? "", meanings);
  const answered = new Map(part.meanings.map((row) => [row.meaning, row]));
  const held = new Set(read.ticked);
  const rowOf = (run: { kind: MeaningRun["kind"]; number: number }) => (run.kind === "dictionary" ? run.number : meanings.length + run.number);
  const listed: MeaningRun[] = [...meanings.map((words, i): MeaningRun => ({ kind: "dictionary", number: i + 1, words })), ...read.runs.filter((run) => run.kind === "custom")];
  const rows = listed.flatMap((run): MeaningRowVerdict[] => {
    const row = answered.get(rowOf(run));
    return row ? [{ ...run, judgement: row.judgement, why: row.why, ticked: run.kind === "custom" || held.has(run.number) }] : [];
  });
  // A run the answer has no row for (none, it's held to one each) stands as it is.
  const markOf = (run: MeaningRun): MeaningMark => {
    const judgement = answered.get(rowOf(run))?.judgement ?? "good";
    return { ...run, mark: judgement === "good" ? "keep" : judgement };
  };
  const kept = read.runs.map(markOf);
  if (rows.some((row) => row.judgement === "good")) {
    const added = rows.filter((row) => row.judgement === "good" && !row.ticked).map((row): MeaningMark => ({ kind: row.kind, number: row.number, words: row.words, mark: "add" }));
    if (added.length === 0 && kept.every((mark) => mark.mark === "keep")) return { kind: "good", rows, why: part.why };
    const marks = [...kept, ...added];
    const accepted = glossesJoined(marks.filter((mark) => mark.mark === "keep" || mark.mark === "add").map((mark) => mark.words));
    return { kind: "change", rows, marks, accepted, why: part.why };
  }
  return { kind: "propose", rows, marks: kept, proposed: tidyMeaning(part.proposed ?? ""), why: part.why };
}

/** That an answer's shape is Panki's, whatever its prompt says, in plain words, so editing a prompt is plainly no way to break the app. */
export const ANSWER_FIXED = "The shape of the answer is fixed by Panki. The prompt changes what goes in it, never its form.";
/**
 * That the descriptions of Panki's answer format never reach the provider (`schemaFor` strips every description),
 * naming the provider they'd go to, the one set in Admin (more accurate than "Panki AI").
 */
export const answerWordsUnsent = (provider: string): string => `For your reference only: ${provider} isn't shown these descriptions, just the keys and their types.`;
/** One part of an answer as Admin says it: its key, its description, and the keys inside it, each the same way. */
export type AnswerPart = { key: string; words: string; parts: AnswerPart[] };
type Schema = z.core.$ZodType;
/** The keys of an object a schema is, through its optional and nullable wrappers and a list's items; none for anything else. */
function innerShapeOf(schema: Schema): Record<string, Schema> | null {
  let at: Schema = schema;
  while (at instanceof z.ZodOptional || at instanceof z.ZodNullable || at instanceof z.ZodArray) at = at instanceof z.ZodArray ? at.element : at.unwrap();
  return at instanceof z.ZodObject ? at.shape : null;
}
/** A schema's description, as `describe` kept it. */
const describedAs = (schema: Schema): string => z.globalRegistry.get(schema)?.description ?? "";
/** A shape's keys as parts, each with its description and, for an object, its own keys under it. */
function partsOf(shape: Record<string, Schema>): AnswerPart[] {
  return Object.entries(shape).map(([key, schema]) => {
    const inner = innerShapeOf(schema);
    return { key, words: describedAs(schema), parts: inner ? partsOf(inner) : [] };
  });
}
/** One fixed shape an action answers in, as Admin heads it ("First answer", "A follow-up"; none for an action with one shape), and its keys. */
export type AnswerShape = { title: string | null; parts: AnswerPart[] };
/**
 * What a template's answers hold, read off each fixed shape it answers in by walking it, a plain tree of the shape as
 * it is, nested as it nests: each key and its description, and under it the
 * keys of what it holds with theirs, in the shape's order. Every word comes from a `describe` on the schema, nothing
 * is added by hand. Explain judging the meanings answers in two, its first answer and a follow-up's; not judging, in
 * the plain one throughout; Touch up in its keys' shapes, then a follow-up's.
 */
export function answerShapesOf(action: AiActionId, judges = true): AnswerShape[] {
  if (action === "proofread") return [{ title: null, parts: partsOf(ProofreadShape.shape) }];
  if (action === "explain") {
    if (!judges) return [{ title: null, parts: partsOf(PlainShape.shape) }];
    return [
      { title: "First answer", parts: partsOf(ExplainShape.shape) },
      { title: "A follow-up", parts: partsOf(ExplainFollowUpShape.shape) },
    ];
  }
  // Touch up's keys, then each shape a key can be asked in, once (both shapes of a field, not per field).
  return [
    { title: "The answer, a key for each field asked", parts: TOUCH_UP_KEYS.map((key) => ({ key, words: KEY_WORDS[key], parts: [] })) },
    { title: "A field that holds a value", parts: partsOf(FieldWire.shape) },
    { title: "A field sent empty", parts: partsOf(EmptyFieldWire.shape) },
    { title: "The Meaning", parts: partsOf(MeaningWire.shape) },
    { title: "The Meaning, when the dictionary has none", parts: partsOf(EmptyMeaningWire.shape) },
    { title: "A follow-up", parts: partsOf(FOLLOW_WORDS.shape) },
  ];
}

/**
 * The fixed shape a provider is asked to answer in, built for this card: a key for each field
 * asked, each required, a field sent empty with no judgement (`EmptyFieldWire`) and one holding a value with one
 * (`FieldWire`), the Meaning with rows when the dictionary has meanings (`MeaningWire`) and without when it has none
 * (`EmptyMeaningWire`). On the wire, read with `answerOfWire`.
 */
export function touchUpShape(keys: readonly TouchUpKey[], now: TouchUpNow, meaningCount: number): z.ZodType<TouchUpWire> {
  const shapeOf = (key: TouchUpKey) =>
    key === "meaning" ? (meaningCount > 0 ? MeaningWire : EmptyMeaningWire) : (now.values[key] ?? "").trim() === "" ? EmptyFieldWire : FieldWire;
  return z.object(Object.fromEntries(keys.map((key) => [key, shapeOf(key)]))) as unknown as z.ZodType<TouchUpWire>;
}

/** The most meanings sent: far past any dictionary's list for one word. */
export const MEANINGS_MAX = 200;

/**
 * The card as it stands when Touch up is pressed, what its answer is held against: each key's field as it holds it
 * (empty, it was sent empty: only a judgement null may answer it; the Meaning tidied, `tidyMeaning`), and the rows of
 * `{Meaning}` the Meaning holds, by their numbers there: the dictionary's it holds whole and its own custom ones after
 * them, worked out from its text (`readMeaning`), which is what every rule reads; these are for `{Card}`.
 */
export const TouchUpNow = z.object({
  values: z.partialRecord(TouchUpKey, z.string().max(VALUE_MAX)),
  ticked: z.array(z.number().int().min(1)).max(MEANINGS_MAX),
});
export type TouchUpNow = z.infer<typeof TouchUpNow>;

/** A text field's answer against Panki's rules, as expected against got, or null. */
function fieldProblem(key: FieldKey, part: FieldAnswer, held: string): string | null {
  if (part.why.trim() === "") return expectedGot(`a why at ${key}`, "an empty one");
  if (isError(part)) return null;
  const empty = held.trim() === "";
  // The wire asks a field sent empty without a judgement and a filled one with, so these two only hold the reading itself.
  if (empty && part.judgement !== null) return expectedGot(`no judgement at ${key}, which was sent empty`, part.judgement);
  if (!empty && part.judgement === null) return expectedGot(`good, meh or bad at ${key}, which holds a value`, "none");
  const proposed = part.proposed?.trim() ?? "";
  if (part.judgement === "good" && part.proposed !== null) return expectedGot(`proposed "" at ${key}, judged good`, "a value");
  if (part.judgement !== "good" && proposed === "") return expectedGot(part.judgement === null ? `a proposed value at ${key}, which was sent empty` : `a proposed value at ${key}, judged ${part.judgement}`, '""');
  // Example sentences come as pairs, a line setting the scene before each sentence, never a bare list of sentences: a
  // proposal of an odd count, or fewer than two, is refused.
  if (key === "examples" && proposed !== "") {
    const lines = proposed.split("\n").filter((line) => line.trim() !== "").length;
    if (lines < 2 || lines % 2 !== 0) return expectedGot("an even number of lines at examples, a scene line before each sentence", `${lines}`);
  }
  return null;
}
/**
 * The Meaning's answer against Panki's rules, as expected against got, or null: `meanings` the dictionary's and `custom`
 * the field's own, every row `{Meaning}` listed. A proposed meaning that is one of them, spaces and punctuation aside, is
 * refused: a proposal says none of the meanings there fits.
 */
function meaningProblem(part: MeaningAnswer, meanings: readonly string[], custom: readonly string[]): string | null {
  if (part.why.trim() === "") return expectedGot("a why at meaning", "an empty one");
  if (isError(part)) return null;
  const rows = part.meanings;
  const count = meanings.length + custom.length;
  if (!meaningsWhole(rows, count)) {
    return rows.length !== count
      ? expectedGot(`one row per meaning (${count})`, `${rows.length}`)
      : expectedGot(`one row per meaning (${count}), each index once from 1 to ${count}`, `indexes ${rows.map((row) => row.meaning).join(", ")}`);
  }
  const blank = rows.find((row) => row.why.trim() === "");
  if (blank) return expectedGot(`a why at meaning ${blank.meaning}`, "an empty one");
  const good = rows.some((row) => row.judgement === "good");
  if (good && part.proposed !== null) return expectedGot('proposed "" beside a good row', "a value");
  if (!good && (part.proposed ?? "").trim() === "") return expectedGot("a proposed meaning when no row is good", '""');
  const proposed = bareOf(part.proposed ?? "").bare;
  if (proposed !== "") {
    const same = (words: string) => bareOf(words).bare === proposed;
    const dictionary = meanings.findIndex(same);
    if (dictionary >= 0) return expectedGot("a meaning not in the list", `meaning ${dictionary + 1}'s words`);
    const own = custom.findIndex(same);
    if (own >= 0) return expectedGot("a meaning not in the list", `custom meaning ${own + 1}'s words`);
  }
  return null;
}
/**
 * What's wrong with an answer that read as its shape but doesn't hold against what was sent, said as expected against got for Details' Log (`unread.ts` → `expectedGot`), or null: every why
 * written; a field sent empty judged null and a filled one judged; a proposal with meh, bad and null, none with good;
 * the Meaning a row for each meaning sent (the dictionary's, then the field's own, `customOf`), each index once, and a
 * proposed meaning exactly when no row is good, never one of theirs. Such an answer fails whole, never shown in part.
 * Its shape (two exactly, a judgement beside an error being neither) is Zod's.
 */
export function touchUpProblem(answer: TouchUpAnswer, meanings: readonly string[], now: TouchUpNow): string | null {
  if (answer.meaning) {
    const broken = meaningProblem(answer.meaning, meanings, customOf(now, meanings));
    if (broken) return broken;
  }
  for (const key of FIELD_KEYS) {
    const part = answer[key];
    const broken = part ? fieldProblem(key, part, now.values[key] ?? "") : null;
    if (broken) return broken;
  }
  return null;
}

/**
 * Text as a sentence is matched against another: spaces, punctuation and symbols set aside, widths and capitals alike
 * (NFKC, lower case), each character kept with the stretch of the text it came from (`from[i]` to `to[i]`), so a match
 * in the bare text is said again as characters of the text.
 */
export function bareOf(text: string): { bare: string; from: number[]; to: number[] } {
  let bare = "";
  const from: number[] = [];
  const to: number[] = [];
  for (let at = 0; at < text.length; ) {
    const char = String.fromCodePoint(text.codePointAt(at) ?? 0);
    const next = at + char.length;
    for (const unit of char.normalize("NFKC").toLowerCase()) {
      if (/[\s\p{P}\p{S}]/u.test(unit)) continue;
      // A unit of two code units (a surrogate pair) is two places in the bare text, both standing for the same character.
      for (let i = 0; i < unit.length; i++) {
        from.push(at);
        to.push(next);
      }
      bare += unit;
    }
    at = next;
  }
  return { bare, from, to };
}

/**
 * Every stretch of a text that is some words, spaces and punctuation set aside (`bareOf`), as characters of the text,
 * in the text's order; none for words that are nothing but spaces and punctuation.
 */
export function runsOf(text: string, words: string): { from: number; to: number }[] {
  const needle = bareOf(words).bare;
  if (needle === "") return [];
  const hay = bareOf(text);
  const runs: { from: number; to: number }[] = [];
  for (let at = hay.bare.indexOf(needle); at >= 0; at = hay.bare.indexOf(needle, at + 1)) {
    runs.push({ from: hay.from[at] ?? 0, to: hay.to[at + needle.length - 1] ?? text.length });
  }
  return runs;
}

/** What a proposed Sentence is held to: every sentence that was sent (the `{Sentence}` piece, the card's field), and the surrounding video subtitles ("" off a video). */
export type SentenceSent = { sentences: readonly string[]; surrounding: string };

/**
 * A proposed Sentence is only ever a cut of what was sent or an extension of it by the lines around it: a run of a
 * sentence sent, or of the surrounding video subtitles (which hold the sentence's own lines with those either side),
 * spaces and punctuation aside. One that's neither was reworded, and only that part is set aside, as the `rewrote`
 * error with its why said as expected against got; the rest of the answer stands. Nothing to hold it to (an empty
 * sentence off a video), and it stands as written.
 */
export function sentenceHeld(answer: TouchUpAnswer, sent: SentenceSent): TouchUpAnswer {
  const part = answer.sentence;
  if (!part || isError(part)) return answer;
  const proposed = part.proposed?.trim() ?? "";
  if (proposed === "") return answer;
  const surrounding = sent.surrounding.trim();
  const sources = [...sent.sentences, surrounding].filter((text) => text.trim() !== "");
  if (sources.length === 0 || sources.some((text) => runsOf(text, proposed).length > 0)) return answer;
  const expected =
    surrounding !== ""
      ? "a cut of the sentence sent, or a run of the surrounding video subtitles, spaces and punctuation aside"
      : "a cut of the sentence sent, spaces and punctuation aside";
  return { ...answer, sentence: { error: "rewrote", why: expectedGot(expected, `"${proposed}"`) } };
}

/*
 * A follow-up, a conversation about the touch-up that can ask it to make changes: it answers in its own fixed shape, its reply and only what it changes, never
 * the whole touch-up again (cheaper, and nothing not asked about moves). Every key required and plain, as the first
 * answer's wire: `changes` a list of the text fields it changes, `meaning` empty while the Meaning stands.
 */
/** One text field a follow-up changes, on the wire. */
const changeOf = (keys: readonly [FieldKey, ...FieldKey[]]) =>
  z.object({
    key: z.enum(keys).describe("the field's key, as <card> marks it"),
    proposed: Proposed.describe("its new value, whole, as the field would hold it"),
    why: Why.describe("why, in one short sentence; shown open under the field"),
  });
/** The Meaning as a follow-up answers it, on the wire: [] and "" while it stands. */
export const MeaningFollowWire = z.object({
  meanings: z.array(MeaningRow).max(MEANINGS_MAX).describe("[] while the Meaning stands; otherwise one row for every meaning in <meaning> again, as the first answer's"),
  proposed: Proposed.describe('"" while it stands or a row is good; otherwise a meaning of its own, as the first answer\'s'),
  why: Why.describe('"" while it stands; otherwise the Meaning\'s own why, as the first answer\'s'),
});
export type MeaningFollowWire = z.infer<typeof MeaningFollowWire>;
/** A Touch up follow-up on the wire: its reply, the text fields it changes, and the Meaning. */
export type TouchUpFollowWire = { answer: string; changes?: { key: FieldKey; proposed: string; why: string }[]; meaning?: MeaningFollowWire };
/** The follow-up's shape with every key described, for a template's Panki's answer format (`answerShapesOf`): every field key among `changes`' keys. */
const FOLLOW_WORDS = z.object({
  answer: z.string().describe("the reply to the follow-up; Panki shows it under the question"),
  changes: z.array(changeOf(FIELD_KEYS as unknown as [FieldKey, ...FieldKey[]])).describe("only the fields the follow-up changes, each once; [] when nothing changes. Each is a proposal under its field, Accept or Dismiss"),
  meaning: MeaningFollowWire.describe("the Meaning, judged again only when the follow-up changes it"),
});
/**
 * The fixed shape a follow-up is asked to answer in, built for this card as the first answer's is: `changes`' keys
 * only the text fields asked (none when only the Meaning was), `meaning` only when it was.
 */
export function touchUpFollowShape(keys: readonly TouchUpKey[]): z.ZodType<TouchUpFollowWire> {
  const fields = keys.filter((key): key is FieldKey => key !== "meaning");
  const [first, ...rest] = fields;
  return z.object({
    answer: z.string().max(AI_TEXT_MAX),
    ...(first !== undefined ? { changes: z.array(changeOf([first, ...rest])).max(fields.length) } : {}),
    ...(keys.includes("meaning") ? { meaning: MeaningFollowWire } : {}),
  }) as unknown as z.ZodType<TouchUpFollowWire>;
}
/**
 * A follow-up's answer as Panki reads it: its reply, and in `answer` only what it changes, each as a first answer's
 * part (a changed text field a judgement null with its proposal, drawn as "Panki AI proposes", or "Nothing to change."
 * when it's what the field holds: `fieldVerdictOf`), the Meaning when it was judged again.
 */
export function followOfWire(wire: TouchUpFollowWire): { reply: string; answer: TouchUpAnswer } {
  const answer: TouchUpAnswer = {};
  for (const change of wire.changes ?? []) answer[change.key] = { judgement: null, proposed: change.proposed, why: change.why };
  const meaning = wire.meaning;
  if (meaning && (meaning.meanings.length > 0 || meaning.proposed.trim() !== "")) answer.meaning = { meanings: meaning.meanings, proposed: orNull(meaning.proposed), why: meaning.why };
  return { reply: wire.answer, answer };
}
/**
 * What's wrong with a follow-up's answer, as expected against got, or null: a reply written; each change a key once,
 * a value and a why, Example sentences in pairs; a Meaning judged again by the first answer's rules, against the card as
 * it stands now (`now`: its custom meanings), and no rows at all when there's nothing to judge.
 */
export function touchUpFollowProblem(wire: TouchUpFollowWire, dictionary: readonly string[], now: TouchUpNow): string | null {
  const custom = customOf(now, dictionary);
  const meanings = [...dictionary, ...custom];
  if (wire.answer.trim() === "") return expectedGot("an answer", "an empty one");
  const seen = new Set<FieldKey>();
  for (const change of wire.changes ?? []) {
    if (seen.has(change.key)) return expectedGot(`${change.key} once among the changes`, "it twice");
    seen.add(change.key);
    const broken = fieldProblem(change.key, { judgement: null, proposed: change.proposed, why: change.why }, "");
    if (broken) return broken;
  }
  const meaning = wire.meaning;
  if (!meaning || (meaning.meanings.length === 0 && meaning.proposed.trim() === "")) return null;
  if (meanings.length === 0 && meaning.meanings.length > 0) return expectedGot("no rows at meaning, there being no meanings to judge", `${meaning.meanings.length}`);
  if (meanings.length > 0 && meaning.meanings.length === 0) return expectedGot(`one row per meaning (${meanings.length}) beside a proposed meaning`, "0");
  return meaningProblem({ meanings: meaning.meanings, proposed: orNull(meaning.proposed), why: meaning.why }, dictionary, custom);
}

/**
 * What Touch up sends: the template to run, the pieces of the card being added (`{Card}` among them, `cardPiece`),
 * every meaning of the dictionaries in the order `{Meaning}` numbers them (so a number in the answer is checked
 * against the real list), the keys whose roles have a field on the deck, and the card as it stands, what the answer is
 * held to; for a follow-up, the conversation so far (`Said`) and its own pieces (`asking`: `{Follow-up question}`, `{Follow-up field}`, and
 * `{Card}`, the whole card as it stands now).
 */
export const TouchUpAsk = z.object({
  templateId: TemplateId,
  pieces: PromptPieces,
  meanings: z.array(z.string().max(VALUE_MAX)).max(MEANINGS_MAX),
  keys: z.array(TouchUpKey).min(1).max(TOUCH_UP_KEYS.length),
  now: TouchUpNow,
  said: Said.default([]),
  asking: PromptPieces.optional(),
});
export type TouchUpAsk = z.infer<typeof TouchUpAsk>;

/** The answer, the tokens in and out as the provider counted them and what they came to, and Panki AI as it stood. */
export const TouchedUp = z.object({
  /** The answer as the model gave it, nothing in it changed but the Meaning's rows in the list's order; a follow-up's, only what it changes. */
  answer: TouchUpAnswer,
  /** A follow-up's reply; "" for a first ask. */
  reply: z.string().default(""),
  /** A follow-up's Follow-up prompt as it was filled and sent, what the page keeps in `Said`; "" for a first ask. */
  asked: z.string().default(""),
  /** The answer exactly as it came back, its JSON: Details' Log shows it. */
  raw: z.string().default(""),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
  /** The provider and model the call ran on (`AiRanOn`): Details name it, never the page's own copy. */
  ranOn: AiRanOn.optional(),
});
export type TouchedUp = z.infer<typeof TouchedUp>;
export const TouchUpResponse = z.object({ touchUp: TouchedUp, ai: PankiAiStatus });

/**
 * One of the card's fields as `{Card}` tells of it: its name, the key Touch up fills it by (none for a field it doesn't fill),
 * what it holds now, and for the Meaning the rows of `{Meaning}` it holds, by their numbers there (`TouchUpNow.ticked`).
 */
export type CardPieceRow = { name: string; key: TouchUpKey | null; value: string; ticked?: readonly number[] };
/**
 * The card as the model reads it (`{Card}`): a line each field, its name, the key it's judged by in brackets, and what
 * it holds; the Meaning's ticked numbers before its words ("Meaning [meaning]: 1 · to think"), so it's judged by number
 * rather than by words the model may misread; a value of several lines goes on under it, indented; an empty one says
 * so, "(empty)", the field the answer judges null. One home for how it's written.
 */
export function cardPiece(rows: readonly CardPieceRow[]): string {
  return rows
    .map(({ name, key, value, ticked = [] }) => {
      const head = `${name}${key ? ` [${key}]` : ""}:${ticked.length > 0 ? ` ${ticked.join(", ")} ·` : ""}`;
      const text = value.trim();
      if (text === "") return `${head} (empty)`;
      const lines = text.split("\n");
      return lines.length === 1 ? `${head} ${text}` : [head, ...lines.map((line) => `  ${line}`)].join("\n");
    })
    .join("\n")
    .slice(0, AI_TEXT_MAX);
}
