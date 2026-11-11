/** @panki The extension kept up to date without a store: the protocol, its header, the build's fingerprint (`EXTENSION_PROTOCOL`, `EXTENSION_HEADER`, `ExtensionBuild`). */
import { z } from "zod";

/**
 * The extension kept up to date without a store. Two things, apart:
 *
 * - Whether an update is *available*: the extension's built files have a fingerprint, worked out by its build
 *   (`apps/extension/scripts/build.mjs`) and written beside them in `build.json`. Panki's server reads the fingerprint of
 *   the build it carries; the extension compares its own with it. Different files, a different fingerprint: an update.
 *   A deploy that changes nothing of the extension leaves it as it was, and says nothing.
 * - Whether an update is *needed*: `EXTENSION_PROTOCOL`, below, compiled into both the server and the extension.
 */

/**
 * How the server and the extension talk, as a number. **Raised by hand, in the same commit as a change that breaks an
 * older extension**: a route it calls renamed or taken away, a field it sends renamed or made required, a shape it
 * reads changed. Anything an older extension can ignore (a new optional field, a new route) and any change to the
 * extension alone leaves it as it is. An extension built with a smaller number is refused by every route but the two
 * that tell it how to update, and says "Update needed" until it is.
 */
// 3: Video tracking became each browser's own, and `WatchedVideo.on` and `Watching.on` went.
// 4: 3 had also been taken by Panki AI's templates (Explain and Touch up name a template and send a follow-up's
// question apart from the conversation), so either 3 is too old for the other's break.
// 5: a Touch up answer's error can be `rewrote` (a Sentence reworded, set aside by the server), which 4 doesn't read.
// 6: how every review runs left a deck's settings for the account's, so a deck no longer carries the keys 5 requires.
// 7: Touch up is a card's conversation over the admin's prompt: it names no template and sends its first send and this
// one (`TouchUpAsk.opening`, `send`), which 6 doesn't.
// 8: Time reviewing is split by side, front and back (`WindowStats.time.sides`), in place of the three spans 7 reads.
// 9: a streak's condition can be All new cards done (`GoalKind` `newDone`), which 8 refuses in a streak's state.
// 10: an account can have no streak at all (`Settings.streaks` empty), which 9 refuses in the settings it reads.
// 11: a streak's condition can be Cards added (`GoalKind` `added`), which 10 refuses in a streak's state.
export const EXTENSION_PROTOCOL = 11;

/** The header every call from the extension carries its protocol number in. A call without one (the app, an extension from before) isn't asked. */
export const EXTENSION_HEADER = "x-panki-extension";

/** What an extension of another protocol is answered with: the server's word for "upgrade first". */
export const UPDATE_NEEDED_STATUS = 426;

/** A build's fingerprint: the first 12 hex digits of the SHA-256 of its files. */
export const ExtensionFingerprint = z.string().regex(/^[0-9a-f]{12}$/);

/** What a build of the extension says of itself (`build.json`): its fingerprint, and the day its files last changed, from git ("YYYY-MM-DD"). */
export const ExtensionBuildFile = z.object({
  fingerprint: ExtensionFingerprint,
  changedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ExtensionBuildFile = z.infer<typeof ExtensionBuildFile>;

/** The build Panki's server carries, as `GET /api/extension` tells it: the file's facts, and the protocol the server speaks. */
export const ExtensionBuild = ExtensionBuildFile.extend({ protocol: z.number().int().positive() });
export type ExtensionBuild = z.infer<typeof ExtensionBuild>;
export const ExtensionBuildResponse = z.object({ build: ExtensionBuild });
