import { z } from "zod";

/** Every error the API sends has this shape, so the browser can show its message. */
export const ApiErrorBody = z.object({ error: z.object({ message: z.string() }) });
