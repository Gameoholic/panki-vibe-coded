import { z } from "zod";

// Loaded first by every part of the extension, before anything that describes a shape. The shape library can write
// faster checking code for itself as it runs, and tries that out the moment its first shape is made. An extension
// isn't allowed to run made-up code: the try fails, and the browser reports it as an error against the extension, or
// against the page it's standing on. So it's told not to, before any shape exists.
z.config({ jitless: true });
