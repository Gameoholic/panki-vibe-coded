import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { EXTENSION_HEADER, EXTENSION_PROTOCOL, ExtensionBuildFile, UPDATE_NEEDED_STATUS, type ExtensionBuildFile as BuildFile } from "@panki/contracts";
import { entriesOf, zipOf } from "../zipWrite";

const NO_BUILD = "There's no build of the extension on this Panki.";
/** Under `/api`, the two routes an outdated extension is still answered on: how to update, and the update. */
const ALWAYS_ANSWERED = "/extension";
/** The file in the zip that tells Update Panki where to update from: this Panki, as it was asked for. */
const ADDRESS_FILE = "update-from.txt";

/**
 * This Panki's address as the request reached it: its scheme (nginx says HTTPS, believed from loopback alone) and its
 * host, as the browser or the script asked for it. Null for a host that isn't a plain name or address with a port: then
 * the zip goes without the file, and the script asks.
 */
function originOf(req: Request): string | null {
  const host = req.get("host") ?? "";
  return /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host) ? `${req.protocol}://${host}` : null;
}

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
 *
 * The zip is put together as it's asked for: Chrome's build as it stands, and `update-from.txt` naming this Panki as it
 * was reached, so Update Panki updates from where it came from with nothing typed and no address in the code (the
 * owner, 2026-10-22). The last one made is kept until the build or the address differs.
 */
export function extensionRouter(dir: string) {
  const router = Router();
  let made: { key: string; bytes: Buffer } | null = null;

  router.get("/", (_req, res) => {
    const build = buildIn(dir);
    if (!build) {
      res.status(404).json({ error: { message: NO_BUILD } });
      return;
    }
    res.json({ build: { ...build, protocol: EXTENSION_PROTOCOL } });
  });

  router.get("/chrome.zip", (req, res) => {
    const build = buildIn(dir);
    if (!build) {
      res.status(404).json({ error: { message: NO_BUILD } });
      return;
    }
    const origin = originOf(req);
    const key = `${build.fingerprint} ${origin ?? ""}`;
    if (made?.key !== key) {
      const chrome = path.join(dir, "chrome");
      // A file of this name in the build itself never stands in for this Panki's.
      const files = entriesOf(chrome).filter((entry) => entry.name !== ADDRESS_FILE);
      const address = origin ? [{ name: ADDRESS_FILE, data: Buffer.from(`${origin}\r\n`, "ascii") }] : [];
      made = { key, bytes: zipOf([...files, ...address], statSync(path.join(chrome, "build.json")).mtime) };
    }
    res.set({ "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="panki-extension.zip"' });
    res.send(made.bytes);
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
