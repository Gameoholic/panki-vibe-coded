/** @panki Example sentences as a field's value, its rows read and written in one place (`ExampleRow`, `examplesOf`, `examplesValue`, `examplesText`, `examplesSentences`). */
import { z } from "zod";

/**
 * One example in a field of Example sentences: the situation it's said in, in the account's language; the sentence, in
 * the language learned; and the sentence's translation. Only the sentence is needed for a row to stand.
 */
export const ExampleRow = z.object({
  situation: z.string().max(300),
  sentence: z.string().max(400),
  translation: z.string().max(400),
});
export type ExampleRow = z.infer<typeof ExampleRow>;

/** A row with nothing in it, what Add example puts at the end. */
export const EMPTY_EXAMPLE: ExampleRow = { situation: "", sentence: "", translation: "" };

/** How a field's value keeps its rows: their JSON, a list of rows. */
const ExampleRows = z.array(ExampleRow).max(50);

/** Whether a row holds anything at all. */
const filled = (row: ExampleRow): boolean => row.situation.trim() !== "" || row.sentence.trim() !== "" || row.translation.trim() !== "";

/**
 * A field's value as its rows. A value is its rows' JSON (`examplesValue`); anything else is words typed into the field
 * while it was a Paragraph, or into the Paragraph it was switched from, read as Touch up wrote examples then: each pair
 * of lines a row, the first its situation and the second its sentence; a line left over a sentence of its own.
 */
export function examplesOf(value: string): ExampleRow[] {
  const text = value.trim();
  if (text === "") return [];
  if (text.startsWith("[")) {
    try {
      const rows = ExampleRows.safeParse(JSON.parse(text));
      if (rows.success) return rows.data;
    } catch {
      // Not JSON after all: read as lines, below.
    }
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const rows: ExampleRow[] = [];
  for (let at = 0; at < lines.length; at += 2) {
    const first = lines[at] ?? "";
    const second = lines[at + 1];
    rows.push(second === undefined ? { ...EMPTY_EXAMPLE, sentence: first } : { situation: first, sentence: second, translation: "" });
  }
  return rows;
}

/** The value a field keeps for its rows: their JSON, every part trimmed and the rows with nothing in them dropped; "" for none, so an empty field is empty. */
export function examplesValue(rows: readonly ExampleRow[]): string {
  const kept = rows
    .map((row) => ({ situation: row.situation.trim(), sentence: row.sentence.trim(), translation: row.translation.trim() }))
    .filter(filled);
  return kept.length === 0 ? "" : JSON.stringify(kept);
}

/** The rows as words, one row a line, its parts apart by " | ": how the card's examples are told of to a model (`cardPiece`) and searched. */
export function examplesText(value: string): string {
  return examplesOf(value)
    .map((row) => [row.situation, row.sentence, row.translation].map((part) => part.trim()).join(" | "))
    .join("\n");
}

/** The rows' sentences alone, in order: what a card's row in a list shows of them. */
export function examplesSentences(value: string): string[] {
  return examplesOf(value)
    .map((row) => row.sentence.trim())
    .filter((sentence) => sentence !== "");
}
