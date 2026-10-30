import { z } from "zod";
import { DATA_KIND_NAMES } from "./dictionaryRows";

/**
 * Prompt context's pieces (the owner, 2026-10-30): what a Panki AI prompt can use, one registry with the extension's
 * field mapping. Every piece the field mapping fills a card with that is words is here, by the same id and the same name
 * (`roles.ts` → `ROLES` reads its names from `PIECE_NAMES`), and so are the pieces no field takes, offered to prompts
 * alone. A piece that's a file (a clip, word audio) is never one: nothing but text goes to a model. A template names a
 * piece by its name in braces, "{Reading}", and holds it in a tag of the same name, `<reading>` (`tagOf`): one name per
 * piece everywhere. Apart from `prompt.ts` so the settings' default prompt (`ai.ts`) can be built from it. A new piece
 * is one entry.
 */
export const PROMPT_PIECE_IDS = [
  "word",
  "dictForm",
  "dictReading",
  "dictMeaning",
  "dictTags",
  "dictWordType",
  "dictFrequency",
  "dictPitch",
  "sentence",
  "source",
  "surrounding",
  "description",
  "learningLanguage",
  "language",
] as const;
export const PromptPieceId = z.enum(PROMPT_PIECE_IDS);
export type PromptPieceId = z.infer<typeof PromptPieceId>;

/** Where a piece comes from: the words pointed at (a video's subtitles, or a page), the dictionaries, the video, Forvo, or the account's own settings. */
export type PieceSource = "text" | "dictionary" | "video" | "forvo" | "settings";
/** How a source is said, beside every piece: the field mapping's Source column and Prompt context's alike. */
export const SOURCE_WORDS: Record<PieceSource, string> = { text: "Subtitles or page", dictionary: "Dictionary", video: "YouTube", forvo: "Forvo", settings: "Your settings" };

/** What each piece is called, the one name for it: the field mapping's, Prompt context's and a template's. */
export const PIECE_NAMES: Record<PromptPieceId, string> = {
  word: "Selected word",
  dictForm: DATA_KIND_NAMES.form,
  dictReading: DATA_KIND_NAMES.reading,
  dictMeaning: DATA_KIND_NAMES.meaning,
  dictTags: DATA_KIND_NAMES.tags,
  dictWordType: DATA_KIND_NAMES.wordType,
  dictFrequency: DATA_KIND_NAMES.frequency,
  dictPitch: DATA_KIND_NAMES.pitch,
  sentence: "Sentence",
  source: "Video metadata",
  // The owner's name for it, 2026-10-30.
  surrounding: "Surrounding video subtitles",
  description: "Video description",
  // The account's two languages, by their settings' own names (the owner, 2026-10-30): the one learned, and the one
  // Panki speaks to the account in, which the AI answers in.
  learningLanguage: "Learning language",
  language: "Language",
};
export const PIECE_SOURCES: Record<PromptPieceId, PieceSource> = {
  word: "text",
  dictForm: "dictionary",
  dictReading: "dictionary",
  dictMeaning: "dictionary",
  dictTags: "dictionary",
  dictWordType: "dictionary",
  dictFrequency: "dictionary",
  dictPitch: "dictionary",
  sentence: "text",
  source: "video",
  surrounding: "video",
  description: "video",
  learningLanguage: "settings",
  language: "settings",
};

/** A piece's name as a template's tag: lower case, spaces as underscores ("Dictionary form" → `dictionary_form`). The one way a tag is named. */
export const tagOf = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, "_");
/** A piece as a template writes it: its variable, "{Reading}". */
export const variableOf = (id: PromptPieceId): string => `{${PIECE_NAMES[id]}}`;
/** A piece in its tag on a line of its own, `<reading>{Reading}</reading>`: the line drops when the piece comes out empty. */
export const taggedOf = (id: PromptPieceId): string => {
  const tag = tagOf(PIECE_NAMES[id]);
  return `<${tag}>${variableOf(id)}</${tag}>`;
};
