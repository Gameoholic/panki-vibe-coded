import { ADMIN_PROMPT_PLACE_IDS, AI_PLACE_IDS, DEFAULT_PROOFREAD_PROMPT, byPlaceKept, type AiPlaceId, type AiTemplate, type TemplateId } from "./ai";
import { taggedOf, variableOf } from "./pieces";

/**
 * Panki AI's templates, each account's own beside starters that can't be removed but can be copied and edited, as SRS
 * types are: Panki's own starters, one registry, never stored and
 * read-only, copied into an account's own as SRS types' starters are (`srsStarters.ts`); which template a place's
 * button runs (`defaultTemplateIdOf`); and Ask before a run over (`ASK_OVER`). An account's own templates are its
 * database's. A new starter is one entry.
 */

/** What a follow-up sends, Panki's to begin with: the question as typed, and for Touch up the field it was asked from and the card as it stands now. */
export const DEFAULT_FOLLOW_UPS: Record<AiPlaceId, string> = {
  // The question bare, as the asker's own words (AI.md: "a follow-up question is the asker's own and goes untagged").
  word: variableOf("question"),
  card: `${variableOf("question")}

${taggedOf("field")}
${taggedOf("card")}`,
  // Proofread takes no messages after its run (AI step 6: a run edits, and asking further is running it again); its
  // templates keep the field every template has, the question bare.
  transcript: variableOf("question"),
};

/**
 * Panki's own starters by id, in the order each place lists them; the first of each place is its default until the
 * account picks another. Explain's (Explain, Grammar, Conjugation, Nuance) became its actions with "Touch up, steered"
 * step 4 (`aiActions.ts`), its prompt the admin's; Touch up's went with step 1.
 */
const STARTERS = [
  { id: "starter:proofread", place: "transcript", name: "Proofread", prompt: DEFAULT_PROOFREAD_PROMPT, judges: false },
] as const satisfies readonly { id: string; place: AiPlaceId; name: string; prompt: string; judges: boolean }[];

/** Panki's own starters, as templates: read-only, each with its place's follow-up. */
export const AI_STARTERS: readonly AiTemplate[] = STARTERS.map((starter) => ({ ...starter, followUp: DEFAULT_FOLLOW_UPS[starter.place], builtin: true }));

/**
 * Every template of a place, the account's own first then Panki's, in the order each is listed, as SRS types are;
 * none for a place whose prompt is the admin's, whose templates are retired.
 */
export const templatesOf = (place: AiPlaceId, own: readonly AiTemplate[]): AiTemplate[] =>
  TEMPLATED_PLACE_IDS.includes(place) ? [...own.filter((t) => t.place === place), ...AI_STARTERS.filter((t) => t.place === place)] : [];
/** A template by its id: the account's own or a starter; none when it's neither (deleted, or another account's). */
export const templateById = (id: TemplateId, own: readonly AiTemplate[]): AiTemplate | null =>
  own.find((t) => t.id === id) ?? AI_STARTERS.find((t) => t.id === id) ?? null;
/** A place's first starter: its default until the account picks another, and again once that one is deleted. */
export function firstStarterOf(place: AiPlaceId): AiTemplate {
  const first = AI_STARTERS.find((t) => t.place === place);
  if (!first) throw new Error(`${place} has no starter.`);
  return first;
}
/**
 * The template a place's button runs: the account's pick while it's there and the place's, the place's first starter
 * otherwise. The picks are kept by place, an older id among them (`byPlaceKept`).
 */
export function defaultTemplateOf(place: AiPlaceId, defaults: Readonly<Record<string, string>>, own: readonly AiTemplate[]): AiTemplate {
  const picked = byPlaceKept(defaults)[place];
  const template = picked ? templateById(picked, own) : null;
  return template && template.place === place ? template : firstStarterOf(place);
}
/**
 * The places that run each account's templates: every place but those whose prompt is the admin's (Explain's and
 * Touch up's, `ADMIN_PROMPT_PLACE_IDS`), whose templates an account kept are retired, unlisted and never deleted.
 */
export const TEMPLATED_PLACE_IDS: readonly AiPlaceId[] = AI_PLACE_IDS.filter((place) => !(ADMIN_PROMPT_PLACE_IDS as readonly string[]).includes(place));
/** Every templated place's default template by its id, as `PankiAiStatus.defaults` tells it. */
export const defaultIdsOf = (defaults: Readonly<Record<string, string>>, own: readonly AiTemplate[]): Partial<Record<AiPlaceId, TemplateId>> =>
  Object.fromEntries(TEMPLATED_PLACE_IDS.map((place) => [place, defaultTemplateOf(place, defaults, own).id]));

/** A copy's name: "Grammar (copy)", then "Grammar (copy 2)"… while one by that name is there. */
export function copyNameOf(name: string, taken: readonly string[]): string {
  const names = new Set(taken);
  if (!names.has(`${name} (copy)`)) return `${name} (copy)`;
  let n = 2;
  while (names.has(`${name} (copy ${n})`)) n++;
  return `${name} (copy ${n})`;
}

/**
 * The choices of the account's two thresholds on a run's cost, Ask before a run is over (`Settings.aiAskOverMicros`)
 * and Show the cost when a run is over (`Settings.aiShowCostOverMicros`), in order: never, then amounts in
 * micro-dollars, then always (0). A range, so how careful to be is picked, never a one-value action.
 */
export const ASK_OVER: readonly (number | null)[] = [null, 1_000, 10_000, 50_000, 100_000, 500_000, 0];
/** Whether a run that can cost up to this asks first. */
export const asksFirst = (ceilingMicros: number, askOverMicros: number | null): boolean => askOverMicros !== null && ceilingMicros > askOverMicros;
/** Whether a run that can cost up to this has its cost shown beside it: at or over the amount, never under it. */
export const showsCost = (ceilingMicros: number, showOverMicros: number | null): boolean => showOverMicros !== null && ceilingMicros >= showOverMicros;
