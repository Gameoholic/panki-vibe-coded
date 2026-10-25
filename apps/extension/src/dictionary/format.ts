import type { Provides } from "@panki/contracts";

/**
 * The dictionary file format Panki reads: the term-bank zip that nearly every Japanese dictionary for a browser popup
 * comes in (JMdict, Jitendex, the frequency lists, the pitch accents). The zip, its `index.json` and its rows are read
 * by the contracts (`readZip`, `openDictionary`, `dictionaryRows.ts`), which the API shares: it counts what a
 * dictionary kept on Panki provides the same way. What's here is what this browser keeps of a dictionary itself; how a
 * formatted definition is shown is `ui/Glossary.tsx`'s, which draws it from a short list of allowed pieces.
 */

/** What's kept of a dictionary itself: what it's called, and how it stands among the others in this browser. */
export type DictionaryRecord = {
  id: string;
  title: string;
  revision: string;
  author: string;
  url: string;
  attribution: string;
  /** What it says about itself in its index.json. Missing on one imported before it was kept. */
  description?: string;
  /** Whether it counts by rank (a frequency list); only rank counts can weigh how a line is split. */
  ranked: boolean;
  counts: { terms: number; frequencies: number; pitches: number };
  /** How many of its entries carry each kind of data Panki reads. Missing on one imported before they were counted: counted once on the options page. */
  provides?: Provides;
  importedAt: number;
  /** Switched on: looked in. */
  on: boolean;
  /** Its place in the owner's order: the first is shown first. */
  order: number;
  /** Being removed: on no list and in no look-up, its rows being cleared away (`store.ts` → `removeDictionary`). */
  removing?: true;
  /**
   * The owner's own name for it (2026-10-16), shown wherever it's named: its row, the popup, the drawer, the popup's
   * layout. Its `title` stays what its file says, which is what tells one dictionary from another (and Panki's copy
   * from this one); nothing of the file or its id changes. Missing while it goes by its title.
   */
  name?: string;
};

/** What a dictionary is called wherever it's shown: the owner's name for it, or the one its file gives it. */
export const shownName = (dictionary: Pick<DictionaryRecord, "title" | "name">): string => dictionary.name?.trim() || dictionary.title;
