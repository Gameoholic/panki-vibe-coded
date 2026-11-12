/** @panki Touch up and each place's one answer shape: what it judges, the fixed parts, its rules (`AnswerShape`, `ANSWER_FIXED`, `FIELD_KEYS`, `FieldVerdict`, `touchUpProblem`). */
import { z } from "zod";
import { TOUCH_UP_KEYS, TouchUpKey } from "./accountActions";
import { AiRanOn, PankiAiStatus, type AiPlaceId } from "./ai";
import { DATA_KIND_NAMES } from "./dictionaryRows";
import { PIECE_NAMES } from "./pieces";
import { Judgement, JUDGEMENTS } from "./judgement";
import { AI_TEXT_MAX, ExplainShape, meaningsWhole } from "./prompt";
import { ProofreadShape } from "./proofread";
import { VALUE_MAX } from "./type";
import { KNOB_BREACHES, expectedGot, knobsBroken } from "./unread";

/**
 * Touch up: Panki AI over the card being added, judging what each field holds and proposing only where something's
 * needed, each proposal accepted or dismissed by hand and nothing written by itself. The model: the AI judges, Panki types its
 * answer, rejects anything off the shape, and draws every outcome itself as a diff (`fieldVerdictOf`,
 * `meaningVerdictOf`). What it can judge is one registry of keys, each the field mapping's role it goes to and that
 * role's name: the answer's fixed shape has one entry per key whose role has a field on the deck. A new key is one
 * entry in `accountActions.ts` → `TOUCH_UP_KEYS` (there so an action's knobs can name them), one line of the answer
 * below and its words in the default prompt.
 */

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

/** Why, always: an empty one fails the answer (`touchUpProblem`). */
const Why = z.string().max(2_000);

/**
 * Why a field came back with nothing to accept, one registry, each with Panki's own words for it (the code is Panki's
 * to read, never shown): no_context, the model had not enough to go on; rewrote, Panki set aside a Sentence whose
 * subtitle lines couldn't be used (none to pick from, none picked beside a judgement, or lines without the word:
 * `sentenceOfWire`). A new kind is one id and its words; one the model may answer is in `MODEL_ERROR_IDS` too.
 */
export const TOUCH_UP_ERROR_IDS = ["no_context", "rewrote"] as const;
export const TouchUpErrorId = z.enum(TOUCH_UP_ERROR_IDS);
export type TouchUpErrorId = z.infer<typeof TouchUpErrorId>;
export const TOUCH_UP_ERRORS: Record<TouchUpErrorId, string> = {
  no_context: "Panki AI couldn't decide without more context.",
  rewrote: "Panki AI picked subtitle lines for the sentence that couldn't be used.",
};
/** The errors the model itself may answer, on the wire; the rest are Panki's own verdicts on what it answered. */
const MODEL_ERROR_IDS = ["no_context"] as const satisfies readonly TouchUpErrorId[];

/*
 * The answer as the model sends it (the wire), and as Panki reads it (the answer). One shape for every send of a card's
 * conversation, whatever it asks: a reply, and a key for each field the send may answer, each answered or left
 * untouched. What differs between sends is only which keys must come back (`TouchUpHeld.requires`): Touch up every
 * mapped field, a field's own action its field, a typed message none. The wire has no union and nothing optional or
 * nullable anywhere: a provider's structured output holds a request to at most 16 parameters that are an `anyOf` or a
 * type array such as ["string", "null"] (Anthropic's "Schema complexity limits"), and a field that was "judged or the
 * error", its judgement and its proposal each nullable, came to 20 and was refused before the model ran. So every key
 * is required and plain: "" for no judgement, no proposal and no error, and a key that's "" all through is untouched.
 * And the wire is built for each request from the card (`touchUpShape`): a field Panki sent empty has no judgement key
 * at all, so the model can't call a filled one empty (a model given "empty" as a judgement it could pick picks it for a
 * filled field too often). Panki translates it at once (`answerOfWire`) into its own shapes, an untouched key left out,
 * judgement null and the error a shape of its own, and every rule and every drawing reads only those.
 */

/** What the wire says in place of nothing: an empty string. */
const NONE = "";
const Proposed = z.string().max(VALUE_MAX);
const ErrorCode = z.enum([NONE, ...MODEL_ERROR_IDS]);
/** A judgement on the wire: "" for a field left untouched, or changed as asked without being judged. */
const WireJudgement = z.enum([NONE, ...JUDGEMENTS]);
/** A text field that holds a value, on the wire: every key always there, "" all through when it's left untouched. */
export const FieldWire = z.object({
  judgement: WireJudgement.describe('good (right as it is), meh (could be better) or bad (wrong) when it judged the field; "" when it left it untouched, or changed it as asked without judging it'),
  proposed: Proposed.describe('the better value with meh, the correction with bad, the new value of a change asked for; "" with good, and when untouched'),
  why: Why.describe("a sentence whenever the field is answered, shown under the field, folded closed when it's good, open otherwise; \"\" when untouched"),
  error: ErrorCode.describe('"" when it answered or left it; no_context when it can\'t answer the field from what it was given: Panki says it couldn\'t decide, nothing to press, and the rest is ignored'),
});
export type FieldWire = z.infer<typeof FieldWire>;
/** A text field Panki sent empty, on the wire: nothing to judge, so no judgement. */
export const EmptyFieldWire = z.object({
  proposed: Proposed.describe('what belongs in the field; "" with a why when nothing does (an Explanation the Meaning already makes clear), and when untouched'),
  why: Why.describe('a sentence whenever it answers the field: what it was written from, or why it stays empty; shown under the field; "" when untouched'),
  error: ErrorCode.describe('"" when it wrote one or left it; no_context when it can\'t write the field from what it was given'),
});
export type EmptyFieldWire = z.infer<typeof EmptyFieldWire>;
/** A subtitle line by its number in the subtitles the message holds (`numberedSubtitles`), 0 for none. */
const LineNumber = z.number().int();
/**
 * The Sentence on the wire, when the field holds one: judged like any field, but what it proposes is subtitle lines by
 * their numbers, never words, so it can't be reworded; Panki copies the lines (`sentenceOfWire`).
 */
export const SentenceWire = z.object({
  judgement: WireJudgement.describe('good, meh or bad when it judged the Sentence; "" when it left it untouched, or changed it as asked without judging it'),
  first: LineNumber.describe("the number of the first subtitle line the Sentence should be, with meh, bad or a change asked for; 0 with good, and when untouched"),
  last: LineNumber.describe("the number of its last line, the same way"),
  why: Why.describe('a sentence whenever the Sentence is answered, shown under it; "" when untouched'),
  error: ErrorCode.describe('"" when it answered or left it; no_context when it can\'t'),
});
export type SentenceWire = z.infer<typeof SentenceWire>;
/** The Sentence on the wire when Panki sent it empty: the lines it should be, with no judgement. */
export const EmptySentenceWire = z.object({
  first: LineNumber.describe("the number of the first subtitle line the Sentence should be; 0 when untouched"),
  last: LineNumber.describe("the number of its last line, the same way"),
  why: Why.describe('a sentence whenever it picks the lines; "" when untouched'),
  error: ErrorCode.describe('"" when it picked or left it; no_context when it can\'t'),
});
export type EmptySentenceWire = z.infer<typeof EmptySentenceWire>;

/**
 * The subtitles a Sentence is picked from, a line each as the message holds them: every line not blank, trimmed, in
 * order. What `numberedSubtitles` numbers, and what the numbers an answer sends are read against.
 */
export const subtitleLinesOf = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
/** Subtitles as a card's prompt sends them: each line its number from 1, a tab, then the line (`subtitleLinesOf`). */
export const numberedSubtitles = (text: string): string => subtitleLinesOf(text).map((line, i) => `${i + 1}\t${line}`).join("\n");
/** What a Sentence's line numbers are read against: the lines of the subtitles the message holds, and the word as met, which the lines picked must hold. */
export type SentenceLines = { lines: readonly string[]; word: string };
/** The reply on the wire: the model's words to the message, "" for none (a send that asks nothing but fields). */
const Reply = z.string().max(AI_TEXT_MAX);

/** One dictionary meaning judged against the sentence alone: by its index, how it stands, and why. */
export const MeaningRow = z.object({
  meaning: z.number().int().describe("the meaning's index in <meaning>"),
  judgement: Judgement.describe("good (it fits this sentence), meh (near, but not quite) or bad (it doesn't fit here); Panki marks the row green, orange or red"),
  why: Why.describe("why, in a few words; shown under the row, folded"),
});
export type MeaningRow = z.infer<typeof MeaningRow>;
/** The Meaning on the wire, when the dictionary has meanings: every key always there, [] and "" all through when it's left untouched. */
export const MeaningWire = z.object({
  meanings: z.array(MeaningRow).max(200).describe("one row for every meaning in <meaning>, ticked or not, each index once; [] when untouched"),
  proposed: Proposed.describe('a meaning of its own, as a dictionary writes one, when no row is good; "" when one is, and when untouched'),
  why: Why.describe('the Meaning\'s own why, against what\'s ticked: why it\'s right, or why it changes; "" when untouched'),
  error: ErrorCode.describe('"" when it judged or left it; no_context when it can\'t: Panki says it couldn\'t decide, the list stays unmarked, and the rest is ignored'),
});
export type MeaningWire = z.infer<typeof MeaningWire>;
/** The Meaning on the wire when the dictionary has none: nothing to judge, so no rows. */
export const EmptyMeaningWire = z.object({
  proposed: Proposed.describe('a meaning of its own, as a dictionary writes one; "" when untouched'),
  why: Why.describe('why it fits this sentence; "" when untouched'),
  error: ErrorCode.describe('"" when it wrote one or left it; no_context when it can\'t'),
});
export type EmptyMeaningWire = z.infer<typeof EmptyMeaningWire>;

/** What each key holds and what Panki does with it, in plain words: said in Admin (`answerShapesOf`), never sent (`schemaFor` leaves descriptions out). */
export const KEY_WORDS: Record<TouchUpKey, string> = {
  meaning: "the card's Meaning, judged meaning by meaning (the dictionary's, then the field's own custom ones), the error, or untouched: Panki holds the rows against what the field holds and draws the difference",
  reading: "the dictionary form's reading: judged, changed as asked, written when it's empty, the error, or untouched",
  dictionaryForm: "the dictionary form, the same way",
  pitchAccent: "the dictionary form's pitch accent as its field writes it (くう 1), the same way",
  sentence: "the subtitle lines the card's clip plays, the same way, but proposed as the numbers of its first and last line, which Panki copies",
  explanation: "what the word does in this sentence where the Meaning alone doesn't make it clear, the same way, or left empty with a why",
  examples: "a few made-up sentences, each after a line setting its scene, the same way",
};
/** The reply's words in Admin, beside the keys. */
const REPLY_WORDS = 'the reply to the message, shown under it: what the message asked to be said; "" otherwise, unless something the message asked couldn\'t be done or was done differently';
/** The answer on the wire: the reply, and each key in whichever shape it was asked in (`touchUpShape`). */
export type TouchUpWire = { reply: string; meaning?: MeaningWire | EmptyMeaningWire; sentence?: SentenceWire | EmptySentenceWire } & Partial<
  Record<Exclude<TouchUpKey, "meaning" | "sentence">, FieldWire | EmptyFieldWire>
>;

/** A field the model can't judge or write from what it was given, in its judgement's place: the code and what was missing. */
export const TouchUpError = z.object({ error: TouchUpErrorId, why: Why });
export type TouchUpError = z.infer<typeof TouchUpError>;
/**
 * A text field answered, as Panki reads it (every key but the meaning): how it stands, the value proposed, and why. A
 * judgement null is a value written without a judgement: a field sent empty, which can answer nothing else, or one
 * changed as a message asked; a proposal with every judgement but good, none with good (`touchUpProblem`).
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

/** An answer as Panki hands it on: the keys answered, each as read; a key left untouched isn't there. */
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
/**
 * A text field from the wire, or null when it was left untouched: an error code makes it the error, whatever else it
 * holds; no judgement and nothing proposed is untouched, but for a field sent empty answered with a why alone, which
 * stays empty (a judgement null, nothing proposed: drawn as nothing to change); no judgement with a value (a field sent
 * empty, or a change a message asked for) is a judgement null.
 */
function fieldOfWire(wire: FieldWire | EmptyFieldWire): FieldAnswer | null {
  if (wire.error !== NONE) return { error: wire.error, why: wire.why };
  const sentEmpty = !("judgement" in wire);
  const judgement = !sentEmpty && wire.judgement !== NONE ? wire.judgement : null;
  if (judgement === null && wire.proposed.trim() === "" && !(sentEmpty && wire.why.trim() !== "")) return null;
  return { judgement, proposed: orNull(wire.proposed), why: wire.why };
}
/** A Sentence whose lines couldn't be used, set aside as Panki's own error, why said as expected against got. */
const linesUnusable = (expected: string, got: string): TouchUpError => ({ error: "rewrote", why: expectedGot(expected, got) });
/**
 * The Sentence from the wire, or null when it was left untouched: the error; good with nothing to copy; otherwise the
 * subtitle lines from its first to its last, copied as the message held them and joined a line each, the numbers put
 * in order and held to the lines there are. Set aside as `rewrote`, that part alone, when there are no lines to pick
 * from, when a judgement or a change comes with none picked, or when the lines picked don't hold the word.
 */
function sentenceOfWire(wire: SentenceWire | EmptySentenceWire, at: SentenceLines | null): FieldAnswer | null {
  if (wire.error !== NONE) return { error: wire.error, why: wire.why };
  const judgement = "judgement" in wire && wire.judgement !== NONE ? wire.judgement : null;
  const picked = [wire.first, wire.last].filter((n) => n > 0);
  if (judgement === null && picked.length === 0) return null;
  if (judgement === "good") return { judgement, proposed: null, why: wire.why };
  const lines = at?.lines ?? [];
  if (lines.length === 0) return linesUnusable("subtitle lines to pick from", "none sent");
  if (picked.length === 0) return linesUnusable(`the lines of a sentence judged ${judgement ?? "to change"}`, "0 and 0");
  const first = Math.min(lines.length, Math.min(...picked));
  const last = Math.min(lines.length, Math.max(...picked));
  const text = lines.slice(first - 1, last).join("\n");
  const word = at?.word.trim() ?? "";
  if (word !== "" && runsOf(text, word).length === 0) return linesUnusable(`lines holding ${word}`, `lines ${first} to ${last}, without it`);
  return { judgement, proposed: text, why: wire.why };
}
/** The Meaning from the wire, the same way: no rows and nothing proposed is untouched; one asked without rows (no meanings to judge) has none. */
function meaningOfWire(wire: MeaningWire | EmptyMeaningWire): MeaningAnswer | null {
  if (wire.error !== NONE) return { error: wire.error, why: wire.why };
  const meanings = "meanings" in wire ? wire.meanings : [];
  if (meanings.length === 0 && wire.proposed.trim() === "") return null;
  return { meanings, proposed: orNull(wire.proposed), why: wire.why };
}
/** An answer read: the model's reply ("" for none), and the keys it answered. */
export type TouchUpRead = { reply: string; answer: TouchUpAnswer };
/**
 * The answer as Panki reads it, from the wire: the one translation, run before any rule. `lines` are what a Sentence's
 * numbers are read against (`sentenceOfWire`): the subtitles the message held, none off a video.
 */
export function answerOfWire(wire: TouchUpWire, lines: SentenceLines | null = null): TouchUpRead {
  const answer: TouchUpAnswer = {};
  const meaning = wire.meaning ? meaningOfWire(wire.meaning) : null;
  if (meaning) answer.meaning = meaning;
  for (const key of FIELD_KEYS) {
    if (key === "sentence") {
      const part = wire.sentence ? sentenceOfWire(wire.sentence, lines) : null;
      if (part) answer.sentence = part;
      continue;
    }
    const wired = wire[key];
    const part = wired ? fieldOfWire(wired) : null;
    if (part) answer[key] = part;
  }
  return { reply: wire.reply.trim(), answer };
}

/** Words as two values are compared: spaces and capitals aside. */
const plain = (words: string) => words.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * A text field's answer as Panki draws it, the one place it's decided: the error; good (the green line, its why
 * closed), a proposed value that's what the field already holds among them (never drawn as a proposal); meh or bad (the
 * proposal as a diff of the value, what goes struck in orange or red); written, a proposal with no judgement, for a field
 * that was empty or a change a message asked for (under "Panki AI proposes", all green where the field was empty, else a
 * diff of what it held).
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
/** One fixed shape a place answers in, as Admin heads it ("First answer", "A follow-up"; none for a place with one shape), and its keys. */
export type AnswerShape = { title: string | null; parts: AnswerPart[] };
/**
 * What a template's answers hold, read off each fixed shape it answers in by walking it, a plain tree of the shape as
 * it is, nested as it nests: each key and its description, and under it the
 * keys of what it holds with theirs, in the shape's order. Every word comes from a `describe` on the schema, nothing
 * is added by hand. Explain answers in one, whatever a send asks; Touch up in one too: its reply and keys, then each
 * shape a key can be in.
 */
export function answerShapesOf(place: AiPlaceId): AnswerShape[] {
  if (place === "transcript") return [{ title: null, parts: partsOf(ProofreadShape.shape) }];
  if (place === "word") return [{ title: null, parts: partsOf(ExplainShape.shape) }];
  // The reply and Touch up's keys, then each shape a key can be asked in, once (both shapes of a field, not per field).
  return [
    {
      title: "Every send: the reply and a key for each field it may answer",
      parts: [{ key: "reply", words: REPLY_WORDS, parts: [] }, ...TOUCH_UP_KEYS.map((key) => ({ key, words: KEY_WORDS[key], parts: [] }))],
    },
    { title: "A field that holds a value", parts: partsOf(FieldWire.shape) },
    { title: "A field sent empty", parts: partsOf(EmptyFieldWire.shape) },
    { title: "The Sentence", parts: partsOf(SentenceWire.shape) },
    { title: "The Sentence, sent empty", parts: partsOf(EmptySentenceWire.shape) },
    { title: "The Meaning", parts: partsOf(MeaningWire.shape) },
    { title: "The Meaning, when the dictionary has none", parts: partsOf(EmptyMeaningWire.shape) },
  ];
}

/**
 * The one fixed shape a provider is asked to answer in, every send, built for this card: the reply, then a key for each
 * field the send may answer (`keys`), each required on the wire though it may come back untouched, a field sent empty with
 * no judgement (`EmptyFieldWire`) and one holding a value with one (`FieldWire`), the Meaning with rows when there are
 * meanings to judge (`MeaningWire`) and without when there are none (`EmptyMeaningWire`), the Sentence as line
 * numbers (`SentenceWire`, `EmptySentenceWire`). Read with `answerOfWire`.
 */
export function touchUpShape(keys: readonly TouchUpKey[], now: TouchUpNow, meaningCount: number): z.ZodType<TouchUpWire> {
  const shapeOf = (key: TouchUpKey) => {
    if (key === "meaning") return meaningCount > 0 ? MeaningWire : EmptyMeaningWire;
    const empty = (now.values[key] ?? "").trim() === "";
    if (key === "sentence") return empty ? EmptySentenceWire : SentenceWire;
    return empty ? EmptyFieldWire : FieldWire;
  };
  return z.object({ reply: Reply, ...Object.fromEntries(keys.map((key) => [key, shapeOf(key)])) }) as unknown as z.ZodType<TouchUpWire>;
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
  // The wire asks a field sent empty without a judgement, so this only holds the reading itself.
  if (held.trim() === "" && part.judgement !== null) return expectedGot(`no judgement at ${key}, which was sent empty`, part.judgement);
  const proposed = part.proposed?.trim() ?? "";
  if (part.judgement === "good" && part.proposed !== null) return expectedGot(`proposed "" at ${key}, judged good`, "a value");
  // A field sent empty may stay empty, said with a why alone (`fieldOfWire`).
  if (part.judgement !== "good" && proposed === "" && held.trim() !== "") return expectedGot(part.judgement === null ? `a proposed value at ${key}, a change asked for` : `a proposed value at ${key}, judged ${part.judgement}`, '""');
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
 * What an answer is held to: the dictionary's meanings sent, in `{Meaning}`'s order; the card as it was sent; and the
 * keys this send requires to come back (the lit actions' `requires`, `aiActions.ts` → `requiredFor`): every mapped field
 * for Touch up, a field's own for its action, none for a typed message; whether it requires a reply (`replyRequired`);
 * and the keys it leaves out (`leftOutFor`).
 */
export type TouchUpHeld = {
  meanings: readonly string[];
  now: TouchUpNow;
  requires: readonly TouchUpKey[];
  reply?: boolean;
  leaves?: readonly TouchUpKey[];
};
/**
 * What's wrong with an answer: `broken`, why it fails whole as expected against got, or null; `plain`, the same in
 * Panki's plain words when it's the message's knobs that were broken (the failure's own message), else null; and the
 * keys behind a knob's breach, required and untouched (`missing`) or left out and answered (`leftOut`).
 */
export type TouchUpProblems = { broken: string | null; plain: string | null; missing: TouchUpKey[]; leftOut: TouchUpKey[] };
/**
 * The one checker of every send's answer, as read (`answerOfWire`). First the message's knobs: a key it requires that
 * came back untouched, a reply it requires that came back empty, a key it leaves out that came back answered, each
 * fails the whole message (nothing of it lands), said in Panki's words (`plain`, `unread.ts` → `KNOB_BREACHES`) and as
 * expected against got. Then `broken` is what's wrong with an answer that read as its shape but doesn't hold against
 * what was sent, said as expected against got for Details' Log (`unread.ts` → `expectedGot`), or null: something said
 * (a reply, or a key answered); every why written; a field sent empty judged null; a proposal with meh, bad and null,
 * none with good; the Meaning a row for each meaning sent (the dictionary's, then the field's own, `customOf`), each
 * index once, and a proposed meaning exactly when no row is good, never one of theirs. Such an answer fails whole,
 * never shown in part. Its shape (two exactly, a judgement beside an error being neither) is Zod's.
 */
export function touchUpProblem(read: TouchUpRead, held: TouchUpHeld): TouchUpProblems {
  const { answer } = read;
  const leftOut = TOUCH_UP_KEYS.filter((key) => (held.leaves ?? []).includes(key) && answer[key] !== undefined);
  const missing = TOUCH_UP_KEYS.filter((key) => held.requires.includes(key) && answer[key] === undefined);
  const knobs = knobsBroken([
    ...(held.reply && read.reply === "" ? [KNOB_BREACHES.unreplied] : []),
    ...(missing.length > 0 ? [KNOB_BREACHES.unanswered(missing.map((key) => TOUCH_UP[key].name))] : []),
    ...(leftOut.length > 0 ? [KNOB_BREACHES.answered(leftOut.map((key) => TOUCH_UP[key].name))] : []),
  ]);
  if (knobs) return { broken: knobs.detail, plain: knobs.plain, missing, leftOut };
  const brokenBy = (broken: string): TouchUpProblems => ({ broken, plain: null, missing, leftOut });
  if (read.reply === "" && TOUCH_UP_KEYS.every((key) => answer[key] === undefined)) return brokenBy(expectedGot("a reply or a field answered", "neither"));
  if (answer.meaning) {
    const broken = meaningProblem(answer.meaning, held.meanings, customOf(held.now, held.meanings));
    if (broken) return brokenBy(broken);
  }
  for (const key of FIELD_KEYS) {
    const part = answer[key];
    const broken = part ? fieldProblem(key, part, held.now.values[key] ?? "") : null;
    if (broken) return brokenBy(broken);
  }
  return { broken: null, plain: null, missing, leftOut };
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

/** The answer, the tokens in and out as the provider counted them and what they came to, and Panki AI as it stood. */
export const TouchedUp = z.object({
  /**
   * The keys the model answered, nothing in them changed but the Meaning's rows in the list's order and the Sentence's
   * line numbers made its lines, or set aside (`sentenceOfWire`). Every key the send required is there and none it left
   * out: an answer that broke either failed whole (`touchUpProblem`).
   */
  answer: TouchUpAnswer,
  /** The model's reply to the send; "" for none. */
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
