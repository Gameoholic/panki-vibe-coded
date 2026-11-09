/** @panki What a proposal changed in a text, as runs kept, dropped and added (`textDiff`, `DiffRun`). Never a second diff of text. */
/**
 * What a proposal changed in a text, as runs of kept, dropped and added text: a field's value as it was against the one
 * Touch up proposes, drawn as one paragraph with the changes lit. Words are compared whole and Japanese character by
 * character, so a changed English word is one word struck and one added, and a changed kana is that kana alone.
 */

/** One stretch of the diff: text both have, text only the old one has, text only the new one has. */
export type DiffRun = { kind: "keep" | "drop" | "add"; text: string };

/**
 * Below this share of the old text kept (whitespace aside), a diff is a rewrite, and two whole blocks (the old struck,
 * the new added) read better than a scatter of marks: `textDiff` says so with null.
 */
export const DIFF_KEEP_MIN = 1 / 3;

/** Past this many token pairs the comparison isn't made (a page of text against another), and it's drawn as two blocks. */
const DIFF_MAX_CELLS = 4_000_000;

const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆`;
/**
 * A text's tokens, in order and whole (joined, they're the text): each Japanese character alone, a run of other letters,
 * digits and their marks as one word, a run of whitespace as one, and every other character (punctuation, a symbol)
 * alone.
 */
const TOKEN = new RegExp(String.raw`[${CJK}]|(?:(?![${CJK}])[\p{L}\p{N}\p{M}])+|\s+|.`, "gsu");
export const diffTokensOf = (text: string): string[] => text.match(TOKEN) ?? [];

const isSpace = (text: string) => text.trim() === "";
const solid = (text: string) => text.replace(/\s/gu, "").length;

/** The longest common subsequence of two token lists, walked into runs a token each. */
function lcsRuns(a: readonly string[], b: readonly string[]): DiffRun[] {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? (table[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const runs: DiffRun[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      runs.push({ kind: "keep", text: a[i] ?? "" });
      i++;
      j++;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      runs.push({ kind: "drop", text: a[i++] ?? "" });
    } else {
      runs.push({ kind: "add", text: b[j++] ?? "" });
    }
  }
  while (i < a.length) runs.push({ kind: "drop", text: a[i++] ?? "" });
  while (j < b.length) runs.push({ kind: "add", text: b[j++] ?? "" });
  return runs;
}

/** Runs side by side of the same kind as one. */
function merged(runs: readonly DiffRun[]): DiffRun[] {
  const out: DiffRun[] = [];
  for (const run of runs) {
    const last = out.at(-1);
    if (last && last.kind === run.kind) out[out.length - 1] = { kind: run.kind, text: last.text + run.text };
    else if (run.text !== "") out.push(run);
  }
  return out;
}

/**
 * Every stretch between kept text as one change, its dropped text and then its added text: a space kept between two
 * changes joins them (in both), so a changed phrase is one struck phrase and one added, never word against word with
 * lone spaces between; a change that's only whitespace isn't drawn as a mark (an added space stands as text, a dropped
 * one goes), so nothing floats.
 */
function tidied(runs: readonly DiffRun[]): DiffRun[] {
  const out: DiffRun[] = [];
  let drop = "";
  let add = "";
  const close = () => {
    if (drop !== "" && !isSpace(drop)) out.push({ kind: "drop", text: drop });
    if (add !== "") out.push({ kind: isSpace(add) ? "keep" : "add", text: add });
    drop = "";
    add = "";
  };
  runs.forEach((run, at) => {
    if (run.kind === "drop") drop += run.text;
    else if (run.kind === "add") add += run.text;
    else {
      const pending = drop !== "" || add !== "";
      const next = runs.slice(at + 1).find((each) => !(each.kind === "keep" && isSpace(each.text)));
      if (pending && isSpace(run.text) && next !== undefined && next.kind !== "keep") {
        drop += run.text;
        add += run.text;
      } else {
        close();
        out.push(run);
      }
    }
  });
  close();
  return merged(out);
}

/**
 * What changed from `before` to `after`, as runs (kept and added joined are `after`), or null when it's a rewrite
 * (`DIFF_KEEP_MIN` of `before` or less kept) or too long to compare, for two whole blocks instead. An empty `before` is
 * all added.
 */
export function textDiff(before: string, after: string): DiffRun[] | null {
  if (before === "") return after === "" ? [] : [{ kind: "add", text: after }];
  const a = diffTokensOf(before);
  const b = diffTokensOf(after);
  if (a.length * b.length > DIFF_MAX_CELLS) return null;
  const runs = lcsRuns(a, b);
  const kept = runs.filter((run) => run.kind === "keep").reduce((sum, run) => sum + solid(run.text), 0);
  const whole = solid(before);
  if (whole > 0 && kept / whole < DIFF_KEEP_MIN) return null;
  return tidied(runs);
}
