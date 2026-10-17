/**
 * What a screen with unsaved work hands the app (`onGuard`), so leaving it can ask first and the header's Save can
 * save it: what it's called, and how to save it (whether it went through).
 */
export type UnsavedGuard = { name: string; save: () => Promise<boolean> };

/** Where a long editor's work stands, as the words beside its Save say it: the app's header, and the extension's popup layout. */
export type SaveState = "saved" | "saving" | "unsaved" | "failed";
export const SAVE_WORDS: Record<SaveState, string> = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", failed: "Not saved" };
