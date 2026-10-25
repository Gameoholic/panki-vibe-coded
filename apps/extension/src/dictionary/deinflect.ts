/**
 * Undoing a word's endings, to find it in a dictionary: 探していた is 探す with three endings on it. One registry of
 * Japanese endings, written here from the grammar (none of it taken from another tool): each says what it turns back
 * into, which kind of word that gives, and which kinds of word can wear it. They're undone one at a time from the end
 * of the word inwards, every way that fits, and whatever is left is looked for in the dictionary; a word is found only
 * when the dictionary agrees it's of the kind the endings say (an ichidan verb's ending on a godan verb isn't one).
 */

/** The kinds of word a dictionary names, each with its own endings. */
export type WordKind = "v1" | "v5" | "vs" | "vk" | "adj-i";
/**
 * A word part-way back to its dictionary form: a て form, a past, a polite form, a stem. Never looked up as itself;
 * it's only something more endings can be undone from.
 */
type Stage = "te" | "ta" | "masu" | "stem";
export type Kind = WordKind | Stage;

type Rule = {
  /** What the ending is called, as it's shown under a word. */
  name: string;
  from: string;
  to: string;
  /** The kinds the word with this ending can be, for another ending to be undone first; none, when it's only ever the last ending. */
  is: readonly Kind[];
  /** What the word is once it's undone. */
  becomes: Kind;
};

const rule = (name: string, from: string, to: string, is: readonly Kind[], becomes: Kind): Rule => ({ name, from, to, is, becomes });

/** A godan verb's last kana and the ones it turns into: the a, i, e and o rows, its て form and its past. */
const GODAN = [
  ["う", "わ", "い", "え", "お", "って", "った"],
  ["く", "か", "き", "け", "こ", "いて", "いた"],
  ["ぐ", "が", "ぎ", "げ", "ご", "いで", "いだ"],
  ["す", "さ", "し", "せ", "そ", "して", "した"],
  ["つ", "た", "ち", "て", "と", "って", "った"],
  ["ぬ", "な", "に", "ね", "の", "んで", "んだ"],
  ["ぶ", "ば", "び", "べ", "ぼ", "んで", "んだ"],
  ["む", "ま", "み", "め", "も", "んで", "んだ"],
  ["る", "ら", "り", "れ", "ろ", "って", "った"],
] as const;

function godan(): Rule[] {
  return GODAN.flatMap(([u, a, i, e, o, te, ta]) => [
    rule("not", `${a}ない`, u, ["adj-i"], "v5"),
    rule("not", `${a}ず`, u, [], "v5"),
    rule("polite", `${i}ます`, u, ["masu"], "v5"),
    rule("stem", i, u, ["stem"], "v5"),
    rule("て form", te, u, ["te"], "v5"),
    rule("past", ta, u, ["ta"], "v5"),
    rule("if", `${e}ば`, u, [], "v5"),
    rule("command", e, u, [], "v5"),
    rule("can", `${e}る`, u, ["v1"], "v5"),
    rule("let's", `${o}う`, u, [], "v5"),
    rule("passive", `${a}れる`, u, ["v1"], "v5"),
    rule("make do", `${a}せる`, u, ["v1"], "v5"),
  ]);
}

/** 行く is the one godan verb whose て form and past break the pattern. */
const IKU = [
  rule("て form", "行って", "行く", ["te"], "v5"),
  rule("past", "行った", "行く", ["ta"], "v5"),
  rule("て form", "いって", "いく", ["te"], "v5"),
  rule("past", "いった", "いく", ["ta"], "v5"),
];

const ICHIDAN = [
  rule("not", "ない", "る", ["adj-i"], "v1"),
  rule("not", "ず", "る", [], "v1"),
  rule("polite", "ます", "る", ["masu"], "v1"),
  rule("stem", "", "る", ["stem"], "v1"),
  rule("て form", "て", "る", ["te"], "v1"),
  rule("past", "た", "る", ["ta"], "v1"),
  rule("if", "れば", "る", [], "v1"),
  rule("command", "ろ", "る", [], "v1"),
  rule("command", "よ", "る", [], "v1"),
  rule("can or passive", "られる", "る", ["v1"], "v1"),
  rule("can", "れる", "る", ["v1"], "v1"),
  rule("make do", "させる", "る", ["v1"], "v1"),
  rule("let's", "よう", "る", [], "v1"),
];

const SURU = [
  rule("not", "しない", "する", ["adj-i"], "vs"),
  rule("not", "せず", "する", [], "vs"),
  rule("polite", "します", "する", ["masu"], "vs"),
  rule("stem", "し", "する", ["stem"], "vs"),
  rule("て form", "して", "する", ["te"], "vs"),
  rule("past", "した", "する", ["ta"], "vs"),
  rule("if", "すれば", "する", [], "vs"),
  rule("command", "しろ", "する", [], "vs"),
  rule("command", "せよ", "する", [], "vs"),
  rule("can", "できる", "する", ["v1"], "vs"),
  rule("passive", "される", "する", ["v1"], "vs"),
  rule("make do", "させる", "する", ["v1"], "vs"),
  rule("let's", "しよう", "する", [], "vs"),
  // A noun that takes する: 勉強する is 勉強.
  rule("する", "する", "", ["vs"], "vs"),
];

/** くる, written with its kanji or without. */
const KURU = (["来", "く"] as const).flatMap((k) => {
  const [ko, ki] = k === "来" ? ["来", "来"] : ["こ", "き"];
  const kuru = `${k}る`;
  return [
    rule("not", `${ko}ない`, kuru, ["adj-i"], "vk"),
    rule("polite", `${ki}ます`, kuru, ["masu"], "vk"),
    rule("stem", ki, kuru, ["stem"], "vk"),
    rule("て form", `${ki}て`, kuru, ["te"], "vk"),
    rule("past", `${ki}た`, kuru, ["ta"], "vk"),
    rule("if", `${k}れば`, kuru, [], "vk"),
    rule("command", `${ko}い`, kuru, [], "vk"),
    rule("can or passive", `${ko}られる`, kuru, ["v1"], "vk"),
    rule("can", `${ko}れる`, kuru, ["v1"], "vk"),
    rule("make do", `${ko}させる`, kuru, ["v1"], "vk"),
    rule("let's", `${ko}よう`, kuru, [], "vk"),
  ];
});

const ADJECTIVE = [
  rule("not", "くない", "い", ["adj-i"], "adj-i"),
  rule("past", "かった", "い", ["ta"], "adj-i"),
  rule("て form", "くて", "い", [], "adj-i"),
  rule("く form", "く", "い", [], "adj-i"),
  rule("if", "ければ", "い", [], "adj-i"),
  rule("noun", "さ", "い", [], "adj-i"),
  rule("looks", "そう", "い", [], "adj-i"),
  rule("too", "すぎる", "い", ["v1"], "adj-i"),
  rule("have to", "なきゃ", "ない", [], "adj-i"),
  rule("have to", "なくちゃ", "ない", [], "adj-i"),
  rule("without", "ないで", "ない", [], "adj-i"),
];

/** Endings that go on a verb's stem, its て form, or its polite form, rather than on the word itself. */
const AFTER = [
  rule("past", "ました", "ます", [], "masu"),
  rule("not", "ません", "ます", [], "masu"),
  rule("not, past", "ませんでした", "ます", [], "masu"),
  rule("let's", "ましょう", "ます", [], "masu"),
  rule("て form", "まして", "ます", [], "masu"),
  rule("want to", "たい", "", ["adj-i"], "stem"),
  rule("do it", "なさい", "", [], "stem"),
  rule("while", "ながら", "", [], "stem"),
  rule("too much", "すぎる", "", ["v1"], "stem"),
  rule("easy to", "やすい", "", ["adj-i"], "stem"),
  rule("hard to", "にくい", "", ["adj-i"], "stem"),
  rule("looks like", "そう", "", [], "stem"),
  rule("if, when", "たら", "た", [], "ta"),
  rule("if, when", "だら", "だ", [], "ta"),
  rule("and so on", "たり", "た", [], "ta"),
  rule("and so on", "だり", "だ", [], "ta"),
  ...(["て", "で"] as const).flatMap((te) => [
    rule("ongoing", `${te}いる`, te, ["v1"], "te"),
    rule("ongoing", `${te}る`, te, ["v1"], "te"),
    rule("for good", `${te}しまう`, te, ["v5"], "te"),
    rule("in advance", `${te}おく`, te, ["v5"], "te"),
    rule("try", `${te}みる`, te, ["v1"], "te"),
    rule("coming", `${te}くる`, te, ["vk"], "te"),
    rule("going", `${te}いく`, te, ["v5"], "te"),
    rule("please", `${te}ください`, te, [], "te"),
  ]),
  rule("has been done", "てある", "て", ["v5"], "te"),
  rule("for good", "ちゃう", "て", ["v5"], "te"),
  rule("for good", "じゃう", "で", ["v5"], "te"),
  rule("for good", "ちまう", "て", ["v5"], "te"),
  rule("for good", "じまう", "で", ["v5"], "te"),
  rule("in advance", "とく", "て", ["v5"], "te"),
  rule("in advance", "どく", "で", ["v5"], "te"),
];

export const RULES: readonly Rule[] = [...godan(), ...IKU, ...ICHIDAN, ...SURU, ...KURU, ...ADJECTIVE, ...AFTER];

/** The rules by the last letter of their ending, so a word is only tried against the ones that could fit it. An ending of nothing (an ichidan stem) fits every word. */
const BY_LAST = new Map<string, Rule[]>();
for (const r of RULES) {
  const last = r.from.slice(-1);
  BY_LAST.set(last, [...(BY_LAST.get(last) ?? []), r]);
}
const rulesFor = (text: string): readonly Rule[] => [...(BY_LAST.get(text.slice(-1)) ?? []), ...(BY_LAST.get("") ?? [])];

/** One ending undone: what it's called, and the word as it was with it on. */
export type Step = { name: string; form: string };

/** A form a word may have come from. `kind` is null for the word as it was found, which may be any kind at all. */
export type Deinflected = { text: string; kind: Kind | null; steps: Step[] };

/** How many endings deep a word is looked into; real words wear four or five at most. */
const DEPTH = 8;

/** Every form a word may be a changed form of, itself first. `steps` run from the dictionary form outwards. */
export function deinflect(source: string): Deinflected[] {
  const out: Deinflected[] = [{ text: source, kind: null, steps: [] }];
  const seen = new Set([`${source}|`]);
  for (let i = 0; i < out.length; i++) {
    const at = out[i];
    if (!at || at.steps.length >= DEPTH) continue;
    for (const r of rulesFor(at.text)) {
      // An ending may be the whole word (来ない, 行った), as long as something is left once it's undone.
      if (!at.text.endsWith(r.from) || at.text.length - r.from.length + r.to.length === 0) continue;
      if (at.kind !== null && !r.is.includes(at.kind)) continue;
      const text = at.text.slice(0, at.text.length - r.from.length) + r.to;
      const key = `${text}|${r.becomes}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, kind: r.becomes, steps: [{ name: r.name, form: at.text }, ...at.steps] });
    }
  }
  return out;
}

const WORD_KINDS: readonly string[] = ["v1", "v5", "vs", "vk", "adj-i"] satisfies readonly WordKind[];

/** Whether a form `deinflect` gave is a dictionary form (a verb or an adjective as a dictionary lists it), not a stage on the way (a て form, a stem). */
export const isWordKind = (kind: Kind | null): kind is WordKind => kind !== null && WORD_KINDS.includes(kind);

/**
 * Whether a dictionary's word can be what the endings say: of the kind they leave, as the dictionary names its kinds
 * ("v5" covers every godan ending, "vs" a noun that takes する). The word as it was found fits any.
 */
export function fits(kind: Kind | null, rules: string): boolean {
  if (kind === null) return true;
  if (!WORD_KINDS.includes(kind)) return false;
  return rules.split(/\s+/).some((named) => named === kind || named.startsWith(`${kind}-`) || (kind === "v5" && named.startsWith("v5")) || (kind === "v1" && named.startsWith("v1")));
}
