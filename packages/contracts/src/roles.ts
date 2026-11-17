/** @panki The Field mapping: what can fill a card's field by itself, and which field of a card type takes which (`ROLES`, `DICTIONARY_ROLES`, `FieldMap`, `mapOf`, `valuesFor`). Never a guess. */
import type { TouchUpKey } from "./accountActions";
import { DATA_KIND_NAMES, type DataKind } from "./dictionaryRows";
import { PIECE_NAMES, type PieceSource } from "./pieces";
import { TOUCH_UP } from "./touchUp";
import { ROLE_IDS, holdsExamples, holdsLine, holdsLink, holdsPitch, holdsWords, isTyped, mediaKindsOf, type CardField, type CardType, type RoleId } from "./type";

/**
 * What can fill in a field by itself, one registry: each piece of a capture, what the Field mapping calls it, and which
 * of a card type's fields can take it. Card types are the account's own data, so nothing here knows a field by its
 * name: which field takes which piece is the card type's own, kept on each field (`CardField.fills`), by the field's
 * id. A field that takes no piece is typed into. A new piece is an id (`type.ts` → `ROLE_IDS`) and one entry here.
 */

/**
 * Every kind of data Panki reads from a dictionary is a piece a field can take, there as an option without being
 * asked for. A kind added to the contracts' `DATA_KIND_IDS` doesn't build until it has its piece here, and its piece's
 * name is the kind's own.
 */
export const DICTIONARY_ROLE: Record<DataKind, RoleId> = {
  form: "dictForm",
  reading: "dictReading",
  meaning: "dictMeaning",
  tags: "dictTags",
  wordType: "dictWordType",
  frequency: "dictFrequency",
  pitch: "dictPitch",
};
export type DictionaryRoleId = Extract<RoleId, `dict${string}`>;

/** The two stretches of a video a capture has: the sentence's clip, and the picked word's own, cut out of it. */
export type Cut = "clip" | "word";

/**
 * Where a piece comes from: the words pointed at (a video's subtitles, or a page), the dictionaries, the video itself,
 * Forvo (word audio recorded by people, fetched with Panki's key), or Touch up. Prompt context's own, with how each is
 * said (`pieces.ts` → `SOURCE_WORDS`): one name for each, wherever it's shown.
 */
export type Source = PieceSource;

type Role = {
  name: string;
  from: Source;
  /** Whether a field can take it. */
  takes: (field: Pick<CardField, "kind">) => boolean;
  /** For a piece that's recorded off the video: which stretch it is, and whether it's kept as sound alone or with its picture. */
  cut?: { of: Cut; soundOnly: boolean };
  /** For a piece the dictionary gives: which kind of its data it is, and so what a dictionary needs to provide to fill it. */
  dictionary?: DataKind;
};

type Takes = Role["takes"];
/** Words of any piece but the sentence: a Line takes the sentence or nothing. */
const holdsText: Takes = (field) => holdsWords(field.kind) && !holdsLine(field.kind);
/** The sentence goes in words, a Line above all. */
const holdsSentence: Takes = (field) => holdsWords(field.kind);
/** What's recorded off a video goes where a clip or a sound can. */
const holdsClip: Takes = (field) => {
  const kinds = mediaKindsOf(field.kind);
  return kinds.includes("video") || kinds.includes("audio");
};
/** A recording of a word is a sound, and goes only where a sound can. */
const holdsSound: Takes = (field) => mediaKindsOf(field.kind).includes("audio");
/** A pitch accent goes only where a pitch accent is drawn, and nothing else goes there but what's typed. */
const holdsAccent: Takes = (field) => holdsPitch(field.kind);
/** A kind of the dictionary's data as a piece, called what the kind is called: words, or a pitch accent. */
const fromDictionary = (kind: DataKind): Role => ({ name: DATA_KIND_NAMES[kind], from: "dictionary", takes: kind === "pitch" ? holdsAccent : holdsText, dictionary: kind });

/**
 * The pieces that are words go by Prompt context's names (`PIECE_NAMES`), the one name each has in the Field mapping
 * and in a Panki AI prompt alike; the dictionary's go by their kind's, which are the same names.
 */
export const ROLES: Record<RoleId, Role> = {
  word: { name: PIECE_NAMES.word, from: "text", takes: holdsText },
  // What the dictionary says of the selected word: the word as it's written there (探す for 探していた),
  // its reading, its meaning, and every other kind of its data. Their ids aren't "reading" and
  // "meaning": those were pieces once, typed by hand, and a map from then may still name them; they're let go (below)
  // rather than coming back as these.
  dictForm: fromDictionary("form"),
  dictReading: fromDictionary("reading"),
  dictMeaning: fromDictionary("meaning"),
  dictTags: fromDictionary("tags"),
  dictWordType: fromDictionary("wordType"),
  dictFrequency: fromDictionary("frequency"),
  dictPitch: fromDictionary("pitch"),
  sentence: { name: PIECE_NAMES.sentence, from: "text", takes: holdsSentence },
  // What's recorded off the video: the line with its picture, the clip the drawer plays and moves (`clip`), and the
  // word alone as a sound. The line as a sound alone and the word with its picture were pieces once; a map naming them
  // lets them go.
  clip: { name: "Clip", from: "video", takes: holdsClip, cut: { of: "clip", soundOnly: false } },
  // Named for where it's from, beside Forvo's.
  wordAudio: { name: "Word audio (YouTube)", from: "video", takes: holdsClip, cut: { of: "word", soundOnly: true } },
  // The word said by someone on Forvo, beside the word cut from the video: both are kept to choose from.
  forvoAudio: { name: "Word audio (Forvo)", from: "forvo", takes: holdsSound },
  // Where the card came from: the link that opens the video at its moment goes into the field; the rest of the source
  // (the video's name, the channel's name and address) is kept beside the card as its `source`, all one piece.
  source: { name: PIECE_NAMES.source, from: "video", takes: (field) => holdsLink(field.kind) },
  // What only Panki AI fills, whichever action asks, always its words and always proposed, never written by itself:
  // the word in general, and made-up sentences as rows of a situation, a sentence and its translation. Two fields, not
  // one, so the layout places each on its own. Nothing fills them as a card is captured; their names are its keys'
  // (`TOUCH_UP`).
  explanation: { name: TOUCH_UP.explanation.name, from: "ai", takes: holdsText },
  // Rows of examples go only where rows are kept, and nothing else goes there: Example sentences takes them or nothing.
  examples: { name: TOUCH_UP.examples.name, from: "ai", takes: (field) => holdsExamples(field.kind) },
};

/** The role a Touch up key's proposal goes to (`TOUCH_UP`, by the same id). */
export const roleOfKey = (key: TouchUpKey): RoleId | null => ROLE_IDS.find((role) => role === TOUCH_UP[key].role) ?? null;

/** The pieces the dictionaries give: what they can fill a card's fields with. */
export const DICTIONARY_ROLES = ROLE_IDS.filter((role): role is DictionaryRoleId => ROLES[role].dictionary !== undefined);

/**
 * Which field of a card type takes which piece: role → field id, read off its fields (`mapOf`). A piece left out goes
 * nowhere. A piece kept on a field that's no longer one reads as none (`CardField.fills`).
 */
export type FieldMap = Partial<Record<RoleId, string>>;

/**
 * The map with only what still holds: a field that's been hidden, or changed to a kind its piece can't go in, drops out.
 * Every field is mapped by hand, a Line and Example sentences too: a field's kind only says what it can take, never
 * what fills it.
 */
export function cleanMap(map: FieldMap, type: Pick<CardType, "fields">): FieldMap {
  const clean: FieldMap = {};
  for (const role of ROLE_IDS) {
    const field = type.fields.find((f) => f.id === map[role]);
    if (field && ROLES[role].takes(field)) clean[role] = field.id;
  }
  return clean;
}

/** A card type's Field mapping as it stands: what its fields keep (`CardField.fills`), each piece once, held to what still fits (`cleanMap`). */
export function mapOf(type: Pick<CardType, "fields">): FieldMap {
  const kept: FieldMap = {};
  for (const field of type.fields) if (field.fills && kept[field.fills] === undefined) kept[field.fills] = field.id;
  return cleanMap(kept, type);
}

/** The fields with a map written onto them, as the card type keeps it: each field its piece, or none. */
export function withMap<F extends CardField>(fields: readonly F[], map: FieldMap): F[] {
  return fields.map((field) => ({ ...field, fills: roleOf(map, field.id) }));
}

/** The piece a field takes, or null when nothing fills it. */
export function roleOf(map: FieldMap, fieldId: string): RoleId | null {
  return ROLE_IDS.find((role) => map[role] === fieldId) ?? null;
}

/** The map with a field given a piece, or none. A field takes one piece and a piece goes to one field: given here, it leaves wherever it was. */
export function withRole(map: FieldMap, fieldId: string, role: RoleId | null): FieldMap {
  const next: FieldMap = {};
  for (const other of ROLE_IDS) if (other !== role && map[other] !== undefined && map[other] !== fieldId) next[other] = map[other];
  if (role !== null) next[role] = fieldId;
  return next;
}

/**
 * A card's values as they'd be sent: in each field, the piece it takes when that piece is words (`taken`), and what
 * was typed into it when it takes none, or takes one only Panki AI fills (`typed`, by field id: what Touch up wrote
 * there once accepted, or the viewer's own words). A clip follows its card, so a field that takes one has no value here.
 */
export function valuesFor(type: Pick<CardType, "fields">, map: FieldMap, taken: Partial<Record<RoleId, string>>, typed: Readonly<Record<string, string>>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of type.fields) {
    const role = roleOf(map, field.id);
    const text = (role === null || ROLES[role].from === "ai" ? (isTyped(field.kind) ? typed[field.id] : undefined) : taken[role])?.trim();
    if (text) values[field.id] = text;
  }
  return values;
}
