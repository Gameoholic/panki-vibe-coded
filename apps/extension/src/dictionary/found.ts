import { z } from "zod";

/**
 * What a look-up finds, as the worker hands it to a page's script: a shape here, parsed where it lands. One `Found` is
 * one word (its dictionary form and reading) with everything every dictionary that's switched on says about it.
 */

export const Tag = z.object({ name: z.string(), category: z.string(), notes: z.string() });
export type Tag = z.infer<typeof Tag>;

/**
 * One meaning, from one dictionary: the dictionary's name and id (the id is what the popup's layout knows it by), its
 * tags, and what it says, as the dictionary wrote it (drawn by `ui/Glossary.tsx`).
 */
export const Sense = z.object({ dict: z.string(), dictId: z.string(), tags: z.array(Tag), glossary: z.array(z.unknown()) });
export type Sense = z.infer<typeof Sense>;

export const Found = z.object({
  /** The text on the page that this is: 探していた. */
  source: z.string(),
  /** The word as the dictionary has it: 探す. */
  term: z.string(),
  /** Its reading; the term itself for a word written in kana alone. */
  reading: z.string(),
  /** The endings undone to get there, from the dictionary form outwards. */
  steps: z.array(z.object({ name: z.string(), form: z.string() })),
  tags: z.array(Tag),
  /** What kind of verb or adjective it is, as the dictionaries name it ("v1"), with their note on the name when they have one; none for a word whose endings don't change. */
  wordTypes: z.array(Tag),
  senses: z.array(Sense),
  /** How common it is, by each frequency list that knows it: as the list writes it, and its rank when the list counts by rank (1 the most common). */
  frequencies: z.array(z.object({ dict: z.string(), display: z.string(), rank: z.number().nullable() })),
  /** Its pitch accent, by each dictionary that has one: after which mora the voice falls, 0 for never. */
  pitches: z.array(z.object({ dict: z.string(), positions: z.array(z.number()) })),
});
export type Found = z.infer<typeof Found>;

/**
 * Every word that starts at each place of a line, with what taking it costs (common words cost less, and every word
 * costs something, so fewer words win when nothing says otherwise). How the line is then split is `split.ts`'s.
 */
export const Lattice = z.array(z.object({ at: z.number(), options: z.array(z.object({ length: z.number(), cost: z.number() })) }));
export type Lattice = z.infer<typeof Lattice>;

/** How a dictionary's word is told from another: its written form and its reading. */
export const wordKey = (found: Pick<Found, "term" | "reading">) => `${found.term}\u0000${found.reading}`;
