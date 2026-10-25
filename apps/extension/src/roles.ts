import { z } from "zod";
import { CardFieldId, holdsLink, holdsPitch, holdsWords, isTyped, mediaKindsOf, type CardField, type CardType, type DataKind } from "@panki/contracts";
import { DATA_KINDS } from "./dataKinds";

/**
 * What the extension can fill in by itself, one registry: each piece of a capture, what the settings page calls it,
 * and which of a card type's fields can take it. The owner's card types are theirs, so nothing here knows a field by
 * its name: which field takes which piece is said once per deck (a `FieldMap`), by the field's id. A field that takes
 * no piece is the owner's to type into in the drawer. A new piece is one entry.
 */
export const ROLE_IDS = [
  "word",
  "dictForm",
  "dictReading",
  "dictMeaning",
  "dictTags",
  "dictWordType",
  "dictFrequency",
  "dictPitch",
  "sentence",
  "clip",
  "clipAudio",
  "wordVideo",
  "wordAudio",
  "forvoAudio",
  "source",
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/**
 * Every kind of data Panki reads from a dictionary is a piece a field can take (the owner, 2026-10-16: tags weren't
 * one, and "it should be there as an option automatically"). A kind added to `dataKinds.ts` doesn't build until it
 * has its piece here, and its piece's name is the kind's own.
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
 * or Forvo (word audio recorded by people, fetched with the owner's key: `forvo.ts`).
 */
export type Source = "text" | "dictionary" | "video" | "forvo";
/** How the field mapping says each source, beside every piece. */
export const SOURCE_WORDS: Record<Source, string> = { text: "Subtitles or page", dictionary: "Dictionary", video: "YouTube", forvo: "Forvo" };

type Role = {
  name: string;
  from: Source;
  /** Whether a field can take it. */
  takes: (field: CardField) => boolean;
  /** For a piece that's recorded off the video: which stretch it is, and whether it's kept as sound alone or with its picture. */
  cut?: { of: Cut; soundOnly: boolean };
  /** For a piece the dictionary gives: which kind of its data it is (`dataKinds.ts`), and so what a dictionary needs to provide to fill it. */
  dictionary?: DataKind;
};

const holdsText = (field: CardField) => holdsWords(field.kind);
/** What's recorded off a video goes where a clip or a sound can. */
const holdsClip = (field: CardField) => {
  const kinds = mediaKindsOf(field.kind);
  return kinds.includes("video") || kinds.includes("audio");
};
/** A recording of a word is a sound, and goes only where a sound can. */
const holdsSound = (field: CardField) => mediaKindsOf(field.kind).includes("audio");
/** A pitch accent goes only where a pitch accent is drawn, and nothing else goes there but what's typed (the owner, 2026-10-16). */
const holdsAccent = (field: CardField) => holdsPitch(field.kind);
/** A kind of the dictionary's data as a piece, called what the kind is called: words, or a pitch accent. */
const fromDictionary = (kind: DataKind): Role => ({ name: DATA_KINDS[kind].name, from: "dictionary", takes: kind === "pitch" ? holdsAccent : holdsText, dictionary: kind });

export const ROLES: Record<RoleId, Role> = {
  word: { name: "Selected word", from: "text", takes: holdsText },
  // What the dictionary says of the selected word (2026-10-14): the word as it's written there (探す for 探していた),
  // its reading, its meaning; and since 2026-10-16 every other kind of its data too. Their ids aren't "reading" and
  // "meaning": those were pieces once, typed by hand, and a map from then may still name them; they're let go (below)
  // rather than coming back as these.
  dictForm: fromDictionary("form"),
  dictReading: fromDictionary("reading"),
  dictMeaning: fromDictionary("meaning"),
  dictTags: fromDictionary("tags"),
  dictWordType: fromDictionary("wordType"),
  dictFrequency: fromDictionary("frequency"),
  dictPitch: fromDictionary("pitch"),
  sentence: { name: "Sentence", from: "text", takes: holdsText },
  // The four things recorded off the video: either stretch, either way. (`clip` was the only one, and is the id kept
  // maps already hold: the sentence with its picture.)
  clip: { name: "Sentence video", from: "video", takes: holdsClip, cut: { of: "clip", soundOnly: false } },
  clipAudio: { name: "Sentence audio", from: "video", takes: holdsClip, cut: { of: "clip", soundOnly: true } },
  wordVideo: { name: "Word video", from: "video", takes: holdsClip, cut: { of: "word", soundOnly: false } },
  // Named for where it's from, beside Forvo's (the owner, 2026-10-18).
  wordAudio: { name: "Word audio (YouTube)", from: "video", takes: holdsClip, cut: { of: "word", soundOnly: true } },
  // The word said by someone on Forvo (2026-10-15), beside the word cut from the video: the owner keeps both to choose from.
  forvoAudio: { name: "Word audio (Forvo)", from: "forvo", takes: holdsSound },
  // Where the card came from: the link that opens the video at its moment goes into the field; the rest of the source
  // (the video's name, the channel's name and address) is kept beside the card as its `source` (the owner, 2026-10-17:
  // "it should all be a part of source", in place of a title piece and a channel piece that lived an hour).
  source: { name: "Video metadata", from: "video", takes: (field) => holdsLink(field.kind) },
};

/** The pieces the dictionaries give: what they can fill a card's fields with. */
export const DICTIONARY_ROLES = ROLE_IDS.filter((role): role is DictionaryRoleId => ROLES[role].dictionary !== undefined);

const KNOWN: ReadonlySet<string> = new Set(ROLE_IDS);

/**
 * Which field of a deck's card type takes which piece: role → field id. A piece left out goes nowhere. A map kept
 * from before may name a piece that's no longer one (the reading and the meaning were, once: they're typed now, like
 * any field nothing fills); that's let go and the rest of the map stands.
 */
export const FieldMap = z.preprocess(
  (raw) => (typeof raw === "object" && raw !== null ? Object.fromEntries(Object.entries(raw).filter(([role]) => KNOWN.has(role))) : raw),
  z.partialRecord(z.enum(ROLE_IDS), CardFieldId),
);
export type FieldMap = z.infer<typeof FieldMap>;

/** The map with only what still holds: a field that's been hidden, or changed to a kind its piece can't go in, drops out. */
export function cleanMap(map: FieldMap, type: CardType): FieldMap {
  const clean: FieldMap = {};
  for (const role of ROLE_IDS) {
    const field = type.fields.find((f) => f.id === map[role]);
    if (field && ROLES[role].takes(field)) clean[role] = field.id;
  }
  return clean;
}

/**
 * Whether a deck's field mapping is switched on: whether the extension adds cards to it. **Off until it's switched
 * on** (the owner, 2026-10-11: "field mapping is disabled by default and has to be enabled for the deck"). The one
 * exception is a courtesy to what was set up before there was a switch: a deck that already has something mapped and
 * has never been switched counts as on, so it goes on working; the first press of its switch settles it either way.
 */
export function mappingOn(switched: Readonly<Record<string, boolean>>, maps: Readonly<Record<string, FieldMap>>, deckId: string): boolean {
  return switched[deckId] ?? Object.keys(maps[deckId] ?? {}).length > 0;
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
 * was typed into it when it takes none (`typed`, by field id). A clip follows its card, so a field that takes one has
 * no value here.
 */
export function valuesFor(type: CardType, map: FieldMap, taken: Partial<Record<RoleId, string>>, typed: Readonly<Record<string, string>>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of type.fields) {
    const role = roleOf(map, field.id);
    const text = (role === null ? (isTyped(field.kind) ? typed[field.id] : undefined) : taken[role])?.trim();
    if (text) values[field.id] = text;
  }
  return values;
}
