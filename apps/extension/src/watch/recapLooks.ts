/** @panki The Video recap's looks on trial and the developer button's turn through them (`RecapLook`, `RECAP_LOOKS`, `nextRecapLook`). Temporary: once one is picked, this file, the other looks and the button go. */
import { z } from "zod";

/**
 * The five ways the Video recap is drawn while one is picked by living with them, each named by its letter and word
 * from the page of ways: A Corner, B Sessions (the corner card with the watch sessions), H Flashcards (the haul's words
 * as small flashcards over the picture), J Sessions (the words over a strip of the watch sessions), K Next up (the
 * haul with Continue watching and Saved for later along the picture's foot). The developer button on the recap turns
 * to the next, A → B → H → J → K → A, kept in this browser (`Modules.recapLook`).
 */
export const RecapLook = z.enum(["A", "B", "H", "J", "K"]);
export type RecapLook = z.infer<typeof RecapLook>;
export const RECAP_LOOKS: Record<RecapLook, { name: string }> = {
  A: { name: "Corner" },
  B: { name: "Sessions" },
  H: { name: "Flashcards" },
  J: { name: "Sessions" },
  K: { name: "Next up" },
};
export const RECAP_LOOK_IDS = RecapLook.options;
/** B to begin with, the one marked as the pick on the page of ways. */
export const DEFAULT_RECAP_LOOK: RecapLook = "B";
/** The look after this one, the last turning back to the first. */
export const nextRecapLook = (look: RecapLook): RecapLook => RECAP_LOOK_IDS[(RECAP_LOOK_IDS.indexOf(look) + 1) % RECAP_LOOK_IDS.length] ?? DEFAULT_RECAP_LOOK;
