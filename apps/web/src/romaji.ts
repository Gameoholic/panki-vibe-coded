/**
 * Romaji as hiragana, for searching a deck's cards in either (the owner, 2026-10-29: "search in the fuzzy search with
 * ROMAJI too"): Hepburn, Kunrei and the way a keyboard types it alike (shi / si, tsu / tu, ja / zya / jya), a doubled
 * consonant as っ ("kitte"), n as ん before a consonant, at the end, or written nn or n' ("konnichiha", "kin'en"),
 * long vowels with a macron or a circumflex as two ("tōkyō"), and "-" as ー. Not romaji at all, null.
 */

const SYLLABLES: Readonly<Record<string, string>> = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wi: "うぃ", we: "うぇ", wo: "を",
  kya: "きゃ", kyu: "きゅ", kyo: "きょ",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  sha: "しゃ", shu: "しゅ", sho: "しょ", she: "しぇ", sya: "しゃ", syu: "しゅ", syo: "しょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ", je: "じぇ", zya: "じゃ", zyu: "じゅ", zyo: "じょ", jya: "じゃ", jyu: "じゅ", jyo: "じょ",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ", che: "ちぇ", tya: "ちゃ", tyu: "ちゅ", tyo: "ちょ", cya: "ちゃ", cyu: "ちゅ", cyo: "ちょ",
  dya: "ぢゃ", dyu: "ぢゅ", dyo: "ぢょ",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ",
  fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ",
  va: "ゔぁ", vi: "ゔぃ", vu: "ゔ", ve: "ゔぇ", vo: "ゔぉ",
  thi: "てぃ", dhi: "でぃ", twu: "とぅ", dwu: "どぅ",
  xa: "ぁ", xi: "ぃ", xu: "ぅ", xe: "ぇ", xo: "ぉ", la: "ぁ", li: "ぃ", lu: "ぅ", le: "ぇ", lo: "ぉ",
  xya: "ゃ", xyu: "ゅ", xyo: "ょ", lya: "ゃ", lyu: "ゅ", lyo: "ょ",
  xtu: "っ", ltu: "っ", xtsu: "っ", ltsu: "っ",
};
/** The longest key above, in letters. */
const LONGEST = 4;
const VOWEL_OR_Y = /[aiueoy]/;
const CONSONANT = /[bcdfghjklmpqrstvwxz]/;

/** Long vowels written with a mark, as two letters. */
const LONG: Readonly<Record<string, string>> = { ā: "aa", ī: "ii", ū: "uu", ē: "ee", ō: "ou", â: "aa", î: "ii", û: "uu", ê: "ee", ô: "ou" };

/** Whether some text is written as romaji could be: Latin letters, an apostrophe after n, a long vowel's mark, "-". */
export const looksLikeRomaji = (text: string) => /^[a-zāīūēōâîûêô'-]+$/.test(text);

/** Romaji as hiragana; null when it doesn't read as romaji. */
export function kanaOf(romaji: string): string | null {
  const text = romaji.toLowerCase().replace(/[āīūēōâîûêô]/g, (mark) => LONG[mark] ?? mark);
  let out = "";
  let i = 0;
  while (i < text.length) {
    const letter = text.charAt(i);
    const next = text.charAt(i + 1);
    if (letter === "-") {
      out += "ー";
      i += 1;
      continue;
    }
    if (letter === "n") {
      // n' and nn are ん; the second n of "nn" begins a syllable of its own when a vowel follows it ("onna" is おんな).
      if (next === "'") {
        out += "ん";
        i += 2;
        continue;
      }
      if (next === "n") {
        out += "ん";
        i += VOWEL_OR_Y.test(text.charAt(i + 2)) ? 1 : 2;
        continue;
      }
      if (next === "" || !VOWEL_OR_Y.test(next)) {
        out += "ん";
        i += 1;
        continue;
      }
    }
    // A doubled consonant is a small tsu: "kitte", "zasshi", "macchi" (and "tch", as in "matcha").
    if (CONSONANT.test(letter) && (next === letter || (letter === "t" && next === "c"))) {
      out += "っ";
      i += 1;
      continue;
    }
    let taken = 0;
    for (let length = LONGEST; length > 0; length--) {
      const kana = SYLLABLES[text.slice(i, i + length)];
      if (kana !== undefined) {
        out += kana;
        taken = length;
        break;
      }
    }
    if (taken === 0) return null;
    i += taken;
  }
  return out;
}
