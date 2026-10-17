import { createHash } from "node:crypto";
import express, { Router, type Request, type Response } from "express";
import { DICTIONARY_MAX_BYTES, DictionaryFileError, DictionaryFileId, openDictionary, type DictionaryIndex } from "@panki/contracts";
import { hasMediaFile, removeFile, writeMediaFile } from "../mediaFiles";
import { requireAdmin, signedIn } from "../session";
import type { Shared } from "../shared";

const MB = 1024 * 1024;
const NOT_THERE = "That dictionary isn't on Panki.";

function isTooLarge(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && err.status === 413;
}

/** The id in the address, or null after answering that it isn't one. */
function idOf(req: Request, res: Response): string | null {
  const id = DictionaryFileId.safeParse(req.params.id);
  if (id.success) return id.data;
  res.status(400).json({ error: { message: "That dictionary id isn't valid." } });
  return null;
}

/**
 * Dictionaries kept on Panki (the owner, 2026-10-16: "put all these zips in the server … and I can choose available
 * ones from there to download"): uploaded from Settings, listed, fetched whole by the extension's options page to be
 * imported there, and removed. Everyone's since 2026-10-17 (the shared store; `dir` is its folder): anyone signed in
 * reads them, an admin alone adds or removes one. Panki never reads one beyond its index.json: what's in it is the
 * extension's to read.
 */
export function dictionariesRouter(shared: Shared, dir: string, now: () => number) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ dictionaries: shared.listDictionaryFiles() });
  });

  // A zip is the request's whole body, under its own ceiling; every other route keeps the 64 KB of the JSON reader.
  const reader = express.raw({ type: () => true, limit: DICTIONARY_MAX_BYTES });

  // The sender mints the id, so sending the same file again is harmless: it answers with the one that's there. The
  // same id with other bytes is refused, and so is a second dictionary of a name already kept.
  router.put(
    "/:id",
    requireAdmin,
    (req, res, next) => {
      if (!idOf(req, res)) return;
      reader(req, res, (err?: unknown) => {
        if (isTooLarge(err)) res.status(413).json({ error: { message: `That file is over ${DICTIONARY_MAX_BYTES / MB} MB.` } });
        else next(err);
      });
    },
    async (req, res) => {
      const id = idOf(req, res);
      if (!id) return;
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: { message: "That file is empty." } });
        return;
      }
      const sha256 = createHash("sha256").update(body).digest("hex");
      const taken = shared.dictionaryFileHash(id);
      if (taken !== null && taken !== sha256) {
        res.status(409).json({ error: { message: "Another file already has that id." } });
        return;
      }
      // What it is, from its own index.json, read the way the extension reads it; a zip that isn't a dictionary is
      // refused in the words that say why.
      let index: DictionaryIndex;
      try {
        ({ index } = await openDictionary(new Blob([body])));
      } catch (e) {
        if (!(e instanceof DictionaryFileError)) throw e;
        res.status(400).json({ error: { message: e.message } });
        return;
      }
      if (taken === null && shared.dictionaryFileTitled(index.title)) {
        res.status(409).json({ error: { message: `${index.title} is on Panki already. Remove it first to upload it again.` } });
        return;
      }
      // The bytes first, then the row: an upload that fails part-way leaves nothing that claims a zip is there.
      if (taken === null || !hasMediaFile(dir, id)) writeMediaFile(dir, id, body);
      const dictionary = shared.insertDictionaryFile(
        { id, title: index.title, revision: index.revision, description: (index.description ?? "").trim(), bytes: body.length, sha256 },
        signedIn(res).user.id,
        now(),
      );
      res.status(taken === null ? 201 : 200).json({ dictionary });
    },
  );

  // The zip, to any signed-in device. It never changes under its id.
  router.get("/:id/file", (req, res, next) => {
    const id = idOf(req, res);
    if (!id) return;
    if (!shared.getDictionaryFile(id)) {
      res.status(404).json({ error: { message: NOT_THERE } });
      return;
    }
    res.sendFile(
      id,
      {
        root: dir,
        headers: {
          "Content-Type": "application/zip",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "attachment",
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      },
      (err) => {
        if (!err || res.headersSent) return;
        if ("code" in err && err.code === "ENOENT") res.status(404).json({ error: { message: NOT_THERE } });
        else next(err);
      },
    );
  });

  // Off the list, its row kept with the time it went and who took it off; the zip, a copy of a file the owner has, is deleted for the room.
  router.delete("/:id", requireAdmin, (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    if (!shared.removeDictionaryFile(id, now(), signedIn(res).user.id)) {
      res.status(404).json({ error: { message: NOT_THERE } });
      return;
    }
    removeFile(dir, id);
    res.status(204).end();
  });

  return router;
}
