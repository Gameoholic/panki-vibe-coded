import { readFileSync } from "node:fs";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { EXTENSION_HEADER, EXTENSION_PROTOCOL, ExtensionBuildFile, UPDATE_NEEDED_STATUS, type ExtensionBuildFile as BuildFile } from "@panki/contracts";

const NO_BUILD = "There's no build of the extension on this Panki.";
/** Under `/api`, the two routes an outdated extension is still answered on: how to update, and the update. */
const ALWAYS_ANSWERED = "/extension";

/** The build's own account of itself, read afresh each time (a deploy builds it again beside the running server); null when there's none to read. */
function buildIn(dir: string): BuildFile | null {
  try {
    const read = ExtensionBuildFile.safeParse(JSON.parse(readFileSync(path.join(dir, "chrome", "build.json"), "utf8")));
    return read.success ? read.data : null;
  } catch {
    return null;
  }
}

/**
 * The extension kept up to date without a store (the contracts' `extension.ts`): `GET /api/extension`, the build this
 * Panki carries (its fingerprint, the day its files last changed) and the protocol the server speaks; `GET
 * /api/extension/chrome.zip`, that build to download. Both answer anyone, signed in or not: the zip holds the
 * extension's code and nothing of anyone's (the owner, 2026-10-22), and the Update Panki script fetches it with no
 * sign-in of its own. `dir` is where `pnpm build` leaves the extension.
 */
export function extensionRouter(dir: string) {
  const router = Router();

  router.get("/", (_req, res) => {
    const build = buildIn(dir);
    if (!build) {
      res.status(404).json({ error: { message: NO_BUILD } });
      return;
    }
    res.json({ build: { ...build, protocol: EXTENSION_PROTOCOL } });
  });

  router.get("/chrome.zip", (_req, res, next) => {
    const build = buildIn(dir);
    if (!build) {
      res.status(404).json({ error: { message: NO_BUILD } });
      return;
    }
    res.sendFile(
      "chrome.zip",
      {
        root: dir,
        headers: {
          "Content-Type": "application/zip",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": 'attachment; filename="panki-extension.zip"',
        },
      },
      (err) => {
        if (!err || res.headersSent) return;
        if ("code" in err && err.code === "ENOENT") res.status(404).json({ error: { message: NO_BUILD } });
        else next(err);
      },
    );
  });

  return router;
}

/**
 * Every call from an extension built with an older protocol is refused before any route reads or writes a thing (the
 * owner, 2026-10-22: an old extension stopped at once, never half-working), but for the two that say how to update. A
 * call with no protocol at all (the app, which the server serves at its own version, or an extension from before there
 * was one) isn't asked; nor is a newer one (a build of a branch not deployed yet, tried against this Panki).
 */
export function requireProtocol(req: Request, res: Response, next: NextFunction) {
  const said = req.get(EXTENSION_HEADER);
  const protocol = said === undefined ? null : Number(said);
  if (protocol === null || (Number.isInteger(protocol) && protocol >= EXTENSION_PROTOCOL) || req.path === ALWAYS_ANSWERED || req.path.startsWith(`${ALWAYS_ANSWERED}/`)) {
    next();
    return;
  }
  res.status(UPDATE_NEEDED_STATUS).json({ error: { message: "Update Panki's extension to keep using it." } });
}
